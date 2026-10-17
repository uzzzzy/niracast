package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestSPARootAndDeepLink(t *testing.T) {
	fsys := fstest.MapFS{
		"index.html": &fstest.MapFile{
			Data: []byte("<!doctype html><html><body>SPA Root</body></html>"),
		},
	}
	handler := newSPAHandler(fsys)

	testCases := []string{"/", "/watch/1", "/admin/settings"}
	for _, tc := range testCases {
		req := httptest.NewRequest(http.MethodGet, tc, nil)
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("path %s: expected status %d, got %d", tc, http.StatusOK, rec.Code)
		}
		if cc := rec.Header().Get("Cache-Control"); cc != "no-cache" {
			t.Errorf("path %s: expected Cache-Control 'no-cache', got '%s'", tc, cc)
		}
		body := rec.Body.String()
		if !strings.Contains(body, "SPA Root") {
			t.Errorf("path %s: expected body to contain 'SPA Root', got '%s'", tc, body)
		}
	}
}

func TestSPAAssets(t *testing.T) {
	fsys := fstest.MapFS{
		"index.html": &fstest.MapFile{
			Data: []byte("<!doctype html><html><body>SPA Root</body></html>"),
		},
		"assets/x.js": &fstest.MapFile{
			Data: []byte("console.log('x');"),
		},
	}
	handler := newSPAHandler(fsys)

	req := httptest.NewRequest(http.MethodGet, "/assets/x.js", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "public, max-age=31536000, immutable" {
		t.Errorf("expected immutable cache header, got '%s'", cc)
	}
	ctype := rec.Header().Get("Content-Type")
	if !strings.Contains(ctype, "javascript") {
		t.Errorf("expected javascript content-type, got '%s'", ctype)
	}
	if body := rec.Body.String(); !strings.Contains(body, "console.log('x');") {
		t.Errorf("unexpected body: %s", body)
	}
}

func TestSPAApiNotFound(t *testing.T) {
	fsys := fstest.MapFS{
		"index.html": &fstest.MapFile{
			Data: []byte("<!doctype html><html><body>SPA Root</body></html>"),
		},
	}
	handler := newSPAHandler(fsys)

	req := httptest.NewRequest(http.MethodGet, "/api/nope", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected status %d, got %d", http.StatusNotFound, rec.Code)
	}
	if ctype := rec.Header().Get("Content-Type"); !strings.Contains(ctype, "application/json") {
		t.Errorf("expected json content-type, got '%s'", ctype)
	}

	var res map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&res); err != nil {
		t.Fatalf("expected valid JSON: %v", err)
	}
	if res["error"] != "not found" {
		t.Errorf("expected error 'not found', got '%s'", res["error"])
	}
}

func TestSPAMissingFileWithExtension(t *testing.T) {
	fsys := fstest.MapFS{
		"index.html": &fstest.MapFile{
			Data: []byte("<!doctype html><html><body>SPA Root</body></html>"),
		},
	}
	handler := newSPAHandler(fsys)

	testCases := []string{"/missing.js", "/assets/missing.png", "/favicon.ico"}
	for _, tc := range testCases {
		req := httptest.NewRequest(http.MethodGet, tc, nil)
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Errorf("path %s: expected status %d, got %d", tc, http.StatusNotFound, rec.Code)
		}
		if strings.Contains(rec.Body.String(), "SPA Root") {
			t.Errorf("path %s: should not fall back to index.html on missing file with extension", tc)
		}
	}
}

func TestSPAUnbuiltDist(t *testing.T) {
	fsys := fstest.MapFS{
		".gitkeep": &fstest.MapFile{Data: []byte("")},
	}
	handler := newSPAHandler(fsys)

	// Root should return 503 pointing to pnpm build
	reqRoot := httptest.NewRequest(http.MethodGet, "/", nil)
	recRoot := httptest.NewRecorder()
	handler.ServeHTTP(recRoot, reqRoot)

	if recRoot.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status %d for unbuilt dist on root, got %d", http.StatusServiceUnavailable, recRoot.Code)
	}
	if !strings.Contains(recRoot.Body.String(), "pnpm build") {
		t.Errorf("expected message mentioning pnpm build, got '%s'", recRoot.Body.String())
	}

	// Deep link should also return 503
	reqDeep := httptest.NewRequest(http.MethodGet, "/watch/1", nil)
	recDeep := httptest.NewRecorder()
	handler.ServeHTTP(recDeep, reqDeep)

	if recDeep.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected status %d for unbuilt dist on deep link, got %d", http.StatusServiceUnavailable, recDeep.Code)
	}

	// /api/nope still returns 404 JSON even when dist is unbuilt
	reqAPI := httptest.NewRequest(http.MethodGet, "/api/nope", nil)
	recAPI := httptest.NewRecorder()
	handler.ServeHTTP(recAPI, reqAPI)
	if recAPI.Code != http.StatusNotFound {
		t.Fatalf("expected status %d for /api/nope on unbuilt dist, got %d", http.StatusNotFound, recAPI.Code)
	}

	// /missing.js still returns 404
	reqMissing := httptest.NewRequest(http.MethodGet, "/missing.js", nil)
	recMissing := httptest.NewRecorder()
	handler.ServeHTTP(recMissing, reqMissing)
	if recMissing.Code != http.StatusNotFound {
		t.Fatalf("expected status %d for /missing.js on unbuilt dist, got %d", http.StatusNotFound, recMissing.Code)
	}
}

func TestSPALegacyStaticServed(t *testing.T) {
	staticFS := fstest.MapFS{
		"app.js": &fstest.MapFile{
			Data: []byte("console.log('legacy static app');"),
		},
	}
	spaFS := fstest.MapFS{
		"index.html": &fstest.MapFile{
			Data: []byte("<!doctype html><html><body>SPA Root</body></html>"),
		},
	}

	mux := http.NewServeMux()
	mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServer(http.FS(staticFS))))
	mux.Handle("GET /", newSPAHandler(spaFS))

	// 1. Existing legacy static file should be served
	req := httptest.NewRequest(http.MethodGet, "/static/app.js", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected /static/app.js status %d, got %d", http.StatusOK, rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "legacy static app") {
		t.Errorf("unexpected body: %s", rec.Body.String())
	}

	// 2. Nonexistent /static/ path should never fall back to index.html
	req404 := httptest.NewRequest(http.MethodGet, "/static/nonexistent.html", nil)
	rec404 := httptest.NewRecorder()
	mux.ServeHTTP(rec404, req404)

	if rec404.Code != http.StatusNotFound {
		t.Fatalf("expected /static/nonexistent.html status %d, got %d", http.StatusNotFound, rec404.Code)
	}
	if strings.Contains(rec404.Body.String(), "SPA Root") {
		t.Errorf("nonexistent /static/ path must never fall back to SPA index.html")
	}
}
