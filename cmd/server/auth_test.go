package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/uzzzzy/niracast/internal/api"
	"github.com/uzzzzy/niracast/internal/auth"
)

func TestAuth_HandlerLevelChannelProtection(t *testing.T) {
	conn, _ := openRealDB(t)

	adminPass := "test-admin-secret"
	sessionSecret := []byte("secret-key-32-bytes-long-here!!!")

	authHandler := auth.New(auth.Config{
		AdminPassword: adminPass,
		SessionSecret: sessionSecret,
	})

	mux := http.NewServeMux()
	api.NewChannelHandler(conn).Register(mux)
	authHandler.Register(mux)

	handler := authHandler.Protect(mux, nil)

	// 1. Unauthenticated POST /api/v1/channels returns 401
	payload := []byte(`{"number": 1, "name": "News 24"}`)
	reqUnauth := httptest.NewRequest(http.MethodPost, "/api/v1/channels", bytes.NewReader(payload))
	reqUnauth.Header.Set("Content-Type", "application/json")
	recUnauth := httptest.NewRecorder()

	handler.ServeHTTP(recUnauth, reqUnauth)

	if recUnauth.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated POST /api/v1/channels: got status %d, want %d", recUnauth.Code, http.StatusUnauthorized)
	}

	// 2. Login to obtain session cookie & CSRF token
	loginBody, _ := json.Marshal(map[string]string{"password": adminPass})
	reqLogin := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(loginBody))
	recLogin := httptest.NewRecorder()
	handler.ServeHTTP(recLogin, reqLogin)

	if recLogin.Code != http.StatusOK {
		t.Fatalf("login: got status %d, want %d", recLogin.Code, http.StatusOK)
	}

	var loginRes map[string]string
	_ = json.Unmarshal(recLogin.Body.Bytes(), &loginRes)
	csrf := loginRes["csrf"]

	var sessionCookie *http.Cookie
	for _, c := range recLogin.Result().Cookies() {
		if c.Name == auth.SessionCookieName {
			sessionCookie = c
			break
		}
	}
	if sessionCookie == nil {
		t.Fatal("missing session cookie from login response")
	}

	// 3. Authenticated POST /api/v1/channels with CSRF returns 201
	reqAuth := httptest.NewRequest(http.MethodPost, "/api/v1/channels", bytes.NewReader(payload))
	reqAuth.Header.Set("Content-Type", "application/json")
	reqAuth.Header.Set("X-CSRF-Token", csrf)
	reqAuth.AddCookie(sessionCookie)
	recAuth := httptest.NewRecorder()

	handler.ServeHTTP(recAuth, reqAuth)

	if recAuth.Code != http.StatusCreated {
		t.Fatalf("authenticated POST /api/v1/channels: got status %d, want %d (body: %s)", recAuth.Code, http.StatusCreated, recAuth.Body.String())
	}

	// 4. Authenticated POST /api/v1/channels WITHOUT CSRF returns 403
	payload2 := []byte(`{"number": 2, "name": "Sports"}`)
	reqNoCSRF := httptest.NewRequest(http.MethodPost, "/api/v1/channels", bytes.NewReader(payload2))
	reqNoCSRF.Header.Set("Content-Type", "application/json")
	reqNoCSRF.AddCookie(sessionCookie)
	recNoCSRF := httptest.NewRecorder()

	handler.ServeHTTP(recNoCSRF, reqNoCSRF)

	if recNoCSRF.Code != http.StatusForbidden {
		t.Fatalf("authenticated POST /api/v1/channels without CSRF: got status %d, want %d", recNoCSRF.Code, http.StatusForbidden)
	}
}
