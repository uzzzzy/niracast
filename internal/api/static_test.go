package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestStaticFiles(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("../../web/static"))))

	cases := map[string]string{
		"/static/":          "text/html",
		"/static/app.js":    "javascript",
		"/static/style.css": "text/css",
	}
	for path, mime := range cases {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusOK {
			t.Errorf("%s: status %d", path, rec.Code)
		}
		if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, mime) {
			t.Errorf("%s: content-type %q, want %q", path, ct, mime)
		}
	}
}
