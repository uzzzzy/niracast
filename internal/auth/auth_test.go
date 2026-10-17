package auth

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func newTestAuth(t *testing.T) (*Auth, func(t time.Time)) {
	t.Helper()
	currTime := time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC)
	timeProvider := func() time.Time {
		return currTime
	}
	setTime := func(t time.Time) {
		currTime = t
	}

	a := New(Config{
		AdminPassword: "super-secret-password-123",
		SessionSecret: []byte("test-session-secret-32-bytes-long!"),
		Now:           timeProvider,
	})
	return a, setTime
}

// 1. login ok / wrong password
func TestLogin_SuccessAndWrongPassword(t *testing.T) {
	a, _ := newTestAuth(t)

	// Correct password
	body, _ := json.Marshal(map[string]string{"password": "super-secret-password-123"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
	req.RemoteAddr = "10.0.0.1:12345"
	rec := httptest.NewRecorder()

	a.Login(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (body: %s)", rec.Code, rec.Body.String())
	}

	var res map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	csrf, ok := res["csrf"]
	if !ok || csrf == "" {
		t.Fatalf("expected non-empty csrf in response, got %v", res)
	}

	cookies := rec.Result().Cookies()
	var sessionCookie, csrfCookie *http.Cookie
	for _, c := range cookies {
		if c.Name == SessionCookieName {
			sessionCookie = c
		}
		if c.Name == CSRFCookieName {
			csrfCookie = c
		}
	}

	if sessionCookie == nil {
		t.Fatal("missing session cookie")
	}
	if !sessionCookie.HttpOnly {
		t.Error("session cookie should be HttpOnly")
	}
	if sessionCookie.SameSite != http.SameSiteLaxMode {
		t.Errorf("session cookie SameSite = %v, want Lax", sessionCookie.SameSite)
	}

	if csrfCookie == nil {
		t.Fatal("missing csrf cookie")
	}
	if csrfCookie.HttpOnly {
		t.Error("csrf cookie must NOT be HttpOnly")
	}
	if csrfCookie.Value != csrf {
		t.Errorf("csrf cookie value = %s, want %s", csrfCookie.Value, csrf)
	}

	// Wrong password
	wrongBody, _ := json.Marshal(map[string]string{"password": "incorrect-password"})
	reqWrong := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(wrongBody))
	reqWrong.RemoteAddr = "10.0.0.2:12345"
	recWrong := httptest.NewRecorder()

	a.Login(recWrong, reqWrong)

	if recWrong.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 on wrong password, got %d", recWrong.Code)
	}
}

// 2. rate limit trips on the 6th attempt
func TestLogin_RateLimitTripsOn6thAttempt(t *testing.T) {
	a, _ := newTestAuth(t)

	for i := 1; i <= 5; i++ {
		body, _ := json.Marshal(map[string]string{"password": "wrong-password"})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
		req.RemoteAddr = "192.168.1.50:54321"
		rec := httptest.NewRecorder()

		a.Login(rec, req)

		if rec.Code == http.StatusTooManyRequests {
			t.Fatalf("attempt %d prematurely rate-limited", i)
		}
	}

	// 6th attempt must trip rate limiter
	body, _ := json.Marshal(map[string]string{"password": "wrong-password"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(body))
	req.RemoteAddr = "192.168.1.50:54321"
	rec := httptest.NewRecorder()

	a.Login(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("6th attempt expected 429, got %d", rec.Code)
	}
	if rec.Header().Get("Retry-After") == "" {
		t.Error("missing Retry-After header on 429 response")
	}
}

// 3. tampered cookie rejected
func TestCookie_TamperedRejected(t *testing.T) {
	a, _ := newTestAuth(t)

	token, err := a.CreateSessionToken("valid-csrf")
	if err != nil {
		t.Fatalf("create session token: %v", err)
	}

	// Tamper token
	tamperedToken := token[:len(token)-4] + "abcd"

	nextCalled := false
	handler := a.Protect(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		w.WriteHeader(http.StatusOK)
	}), nil)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/channels", strings.NewReader(`{}`))
	req.AddCookie(&http.Cookie{Name: SessionCookieName, Value: tamperedToken})
	req.Header.Set("X-CSRF-Token", "valid-csrf")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for tampered cookie, got %d", rec.Code)
	}
	if nextCalled {
		t.Fatal("next handler was invoked on tampered cookie")
	}
}

// 4. expired token rejected (inject a clock into the auth package)
func TestToken_ExpiredRejected(t *testing.T) {
	a, setTime := newTestAuth(t)
	baseTime := time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC)
	setTime(baseTime)

	token, err := a.CreateSessionToken("valid-csrf")
	if err != nil {
		t.Fatalf("create session token: %v", err)
	}

	// Advance clock past 12-hour session lifetime (e.g. 13 hours)
	setTime(baseTime.Add(13 * time.Hour))

	handler := a.Protect(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}), nil)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/channels", strings.NewReader(`{}`))
	req.AddCookie(&http.Cookie{Name: SessionCookieName, Value: token})
	req.Header.Set("X-CSRF-Token", "valid-csrf")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for expired token, got %d", rec.Code)
	}
}

// 5. CSRF missing/wrong/right
func TestCSRF_Validation(t *testing.T) {
	a, _ := newTestAuth(t)
	token, _ := a.CreateSessionToken("csrf-token-xyz")

	handler := a.Protect(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}), nil)

	// Missing CSRF on mutating request
	reqMissing := httptest.NewRequest(http.MethodPost, "/api/v1/channels", strings.NewReader(`{}`))
	reqMissing.AddCookie(&http.Cookie{Name: SessionCookieName, Value: token})
	recMissing := httptest.NewRecorder()
	handler.ServeHTTP(recMissing, reqMissing)
	if recMissing.Code != http.StatusForbidden {
		t.Errorf("missing csrf expected 403, got %d", recMissing.Code)
	}

	// Wrong CSRF on mutating request
	reqWrong := httptest.NewRequest(http.MethodPost, "/api/v1/channels", strings.NewReader(`{}`))
	reqWrong.AddCookie(&http.Cookie{Name: SessionCookieName, Value: token})
	reqWrong.Header.Set("X-CSRF-Token", "wrong-csrf-token")
	recWrong := httptest.NewRecorder()
	handler.ServeHTTP(recWrong, reqWrong)
	if recWrong.Code != http.StatusForbidden {
		t.Errorf("wrong csrf expected 403, got %d", recWrong.Code)
	}

	// Right CSRF on mutating request
	reqRight := httptest.NewRequest(http.MethodPost, "/api/v1/channels", strings.NewReader(`{}`))
	reqRight.AddCookie(&http.Cookie{Name: SessionCookieName, Value: token})
	reqRight.Header.Set("X-CSRF-Token", "csrf-token-xyz")
	recRight := httptest.NewRecorder()
	handler.ServeHTTP(recRight, reqRight)
	if recRight.Code != http.StatusOK {
		t.Errorf("right csrf expected 200, got %d", recRight.Code)
	}

	// Safe GET request does not require CSRF
	reqGet := httptest.NewRequest(http.MethodGet, "/api/v1/media", nil)
	reqGet.AddCookie(&http.Cookie{Name: SessionCookieName, Value: token})
	recGet := httptest.NewRecorder()
	handler.ServeHTTP(recGet, reqGet)
	if recGet.Code != http.StatusOK {
		t.Errorf("protected GET with valid session expected 200, got %d", recGet.Code)
	}
}

// 6. the access matrix (table-driven over method+path for public vs protected)
func TestAccessMatrix(t *testing.T) {
	a, _ := newTestAuth(t)

	tests := []struct {
		name    string
		method  string
		path    string
		wantPub bool
	}{
		// Public non-API
		{"Root path", http.MethodGet, "/", true},
		{"Static JS", http.MethodGet, "/static/app.js", true},
		{"Static CSS", http.MethodGet, "/static/style.css", true},
		{"HLS playlist", http.MethodGet, "/channels/1/live.m3u8", true},
		{"HLS segment", http.MethodGet, "/channels/1/segment0.ts", true},
		{"IPTV M3U", http.MethodGet, "/iptv/channels.m3u", true},
		{"IPTV EPG", http.MethodGet, "/iptv/epg.xml", true},

		// Public API
		{"Login POST", http.MethodPost, "/api/v1/auth/login", true},
		{"Login OPTIONS", http.MethodOptions, "/api/v1/auth/login", true},
		{"Me GET", http.MethodGet, "/api/v1/auth/me", true},
		{"Me HEAD", http.MethodHead, "/api/v1/auth/me", true},
		{"Channels list GET", http.MethodGet, "/api/v1/channels", true},
		{"Channels list HEAD", http.MethodHead, "/api/v1/channels", true},
		{"Channels list OPTIONS", http.MethodOptions, "/api/v1/channels", true},
		{"Channel detail GET", http.MethodGet, "/api/v1/channels/123", true},
		{"Channel status GET", http.MethodGet, "/api/v1/channels/123/status", true},

		// Protected API
		{"Create channel POST", http.MethodPost, "/api/v1/channels", false},
		{"Update channel PUT", http.MethodPut, "/api/v1/channels/123", false},
		{"Delete channel DELETE", http.MethodDelete, "/api/v1/channels/123", false},
		{"Set playlist POST", http.MethodPost, "/api/v1/channels/123/playlist", false},
		{"Media list GET", http.MethodGet, "/api/v1/media", false},
		{"Events stream GET", http.MethodGet, "/api/v1/events", false},
		{"Logout POST", http.MethodPost, "/api/v1/auth/logout", false},
		{"Channel status POST", http.MethodPost, "/api/v1/channels/123/status", false},
		{"Unknown API route GET", http.MethodGet, "/api/v1/unknown", false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, nil)
			got := IsPublic(req)
			if got != tc.wantPub {
				t.Errorf("%s %s: IsPublic = %v, want %v", tc.method, tc.path, got, tc.wantPub)
			}

			// Also verify behavior via Protect middleware without credentials
			hit := false
			handler := a.Protect(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				hit = true
				w.WriteHeader(http.StatusOK)
			}), nil)

			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			if tc.wantPub {
				if !hit || rec.Code != http.StatusOK {
					t.Errorf("%s %s: expected public pass-through (200), got status %d hit=%v", tc.method, tc.path, rec.Code, hit)
				}
			} else {
				if hit || rec.Code != http.StatusUnauthorized {
					t.Errorf("%s %s: expected 401 unauthorized, got status %d hit=%v", tc.method, tc.path, rec.Code, hit)
				}
			}
		})
	}
}

// 7. logout clears cookies
func TestLogout_ClearsCookies(t *testing.T) {
	a, _ := newTestAuth(t)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil)
	rec := httptest.NewRecorder()

	a.Logout(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 on logout, got %d", rec.Code)
	}

	cookies := rec.Result().Cookies()
	var sessionCleared, csrfCleared bool
	for _, c := range cookies {
		if c.Name == SessionCookieName && c.MaxAge < 0 {
			sessionCleared = true
		}
		if c.Name == CSRFCookieName && c.MaxAge < 0 {
			csrfCleared = true
		}
	}

	if !sessionCleared {
		t.Error("expected session cookie to be cleared (MaxAge < 0)")
	}
	if !csrfCleared {
		t.Error("expected csrf cookie to be cleared (MaxAge < 0)")
	}
}

// 8. limiter eviction
func TestLimiter_Eviction(t *testing.T) {
	currTime := time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC)
	timeProvider := func() time.Time {
		return currTime
	}

	limiter := NewIPRateLimiter(5, 5, timeProvider)

	// Access from two IPs
	limiter.Allow("1.1.1.1")
	limiter.Allow("2.2.2.2")

	if limiter.Count() != 2 {
		t.Fatalf("expected 2 limiters tracked, got %d", limiter.Count())
	}

	// Advance clock by 15 minutes
	currTime = currTime.Add(15 * time.Minute)

	// Access 2.2.2.2 again to refresh its lastSeen
	limiter.Allow("2.2.2.2")

	// Evict idle limiters (> 10 minutes)
	evicted := limiter.EvictIdle(10 * time.Minute)
	if evicted != 1 {
		t.Errorf("expected 1 limiter evicted, got %d", evicted)
	}
	if limiter.Count() != 1 {
		t.Errorf("expected 1 limiter remaining, got %d", limiter.Count())
	}

	// Advance clock by another 15 minutes and evict all
	currTime = currTime.Add(15 * time.Minute)
	evicted = limiter.EvictIdle(10 * time.Minute)
	if evicted != 1 {
		t.Errorf("expected 1 limiter evicted, got %d", evicted)
	}
	if limiter.Count() != 0 {
		t.Errorf("expected 0 limiters remaining, got %d", limiter.Count())
	}
}

// TestMeEndpoint tests GET /api/v1/auth/me response states.
func TestMeEndpoint(t *testing.T) {
	a, _ := newTestAuth(t)

	// Unauthenticated
	reqUnauth := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	recUnauth := httptest.NewRecorder()
	a.Me(recUnauth, reqUnauth)

	var resUnauth map[string]any
	_ = json.Unmarshal(recUnauth.Body.Bytes(), &resUnauth)
	if resUnauth["authenticated"] != false {
		t.Errorf("expected authenticated=false, got %v", resUnauth)
	}

	// Authenticated
	token, _ := a.CreateSessionToken("csrf-me-123")
	reqAuth := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	reqAuth.AddCookie(&http.Cookie{Name: SessionCookieName, Value: token})
	recAuth := httptest.NewRecorder()
	a.Me(recAuth, reqAuth)

	var resAuth map[string]any
	_ = json.Unmarshal(recAuth.Body.Bytes(), &resAuth)
	if resAuth["authenticated"] != true || resAuth["csrf"] != "csrf-me-123" {
		t.Errorf("expected authenticated=true and csrf=csrf-me-123, got %v", resAuth)
	}
}
