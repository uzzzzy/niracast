package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"tv-stream/internal/db"
)

func chSetup(t *testing.T) func(method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	conn, err := db.InitDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	if _, err := conn.Exec(`INSERT INTO media_files (id, path, filename, duration_sec) VALUES (1,'/a','a',10),(2,'/b','b',20)`); err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	NewChannelHandler(conn).Register(mux)
	return func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		return rec
	}
}

func chExpect(t *testing.T, rec *httptest.ResponseRecorder, want int) {
	t.Helper()
	if rec.Code != want {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, want, rec.Body.String())
	}
}

func TestChannelCRUD(t *testing.T) {
	do := chSetup(t)

	chExpect(t, do("POST", "/api/v1/channels", `{"number":1,"name":"Classic Movies"}`), 201)
	chExpect(t, do("POST", "/api/v1/channels", `{"number":2,"name":"News"}`), 201)

	rec := do("GET", "/api/v1/channels", "")
	chExpect(t, rec, 200)
	if !strings.Contains(rec.Body.String(), "Classic Movies") {
		t.Errorf("list missing channel: %s", rec.Body.String())
	}

	recSingle := do("GET", "/api/v1/channels/1", "")
	chExpect(t, recSingle, 200)
	if !strings.Contains(recSingle.Body.String(), "Classic Movies") {
		t.Errorf("get missing channel: %s", recSingle.Body.String())
	}

	chExpect(t, do("PUT", "/api/v1/channels/1", `{"number":1,"name":"Renamed"}`), 200)
	chExpect(t, do("PUT", "/api/v1/channels/99", `{"number":9,"name":"X"}`), 404)
	chExpect(t, do("PUT", "/api/v1/channels/abc", `{"number":9,"name":"X"}`), 400)
	chExpect(t, do("PUT", "/api/v1/channels/1", `{"number":2,"name":"X"}`), 409)

	chExpect(t, do("DELETE", "/api/v1/channels/2", ""), 200)
	chExpect(t, do("DELETE", "/api/v1/channels/2", ""), 404)
}

func TestChannelValidation(t *testing.T) {
	do := chSetup(t)
	chExpect(t, do("POST", "/api/v1/channels", `{bad`), 400)
	chExpect(t, do("POST", "/api/v1/channels", `{"number":0,"name":"x"}`), 400)
	chExpect(t, do("POST", "/api/v1/channels", `{"number":1,"name":""}`), 400)
}

func TestDuplicateChannelNumber(t *testing.T) {
	do := chSetup(t)
	chExpect(t, do("POST", "/api/v1/channels", `{"number":5,"name":"A"}`), 201)
	rec := do("POST", "/api/v1/channels", `{"number":5,"name":"B"}`)
	chExpect(t, rec, 409)
	if !strings.Contains(rec.Body.String(), "already exists") {
		t.Errorf("unhelpful error: %s", rec.Body.String())
	}
}

func TestChannelPlaylist(t *testing.T) {
	do := chSetup(t)
	chExpect(t, do("POST", "/api/v1/channels", `{"number":1,"name":"A"}`), 201)
	rec := do("POST", "/api/v1/channels/1/playlist", `{"media_ids":[2,1]}`)
	chExpect(t, rec, 200)
	if !strings.Contains(rec.Body.String(), `"media_id":2,"position":0`) {
		t.Errorf("unexpected order: %s", rec.Body.String())
	}
	chExpect(t, do("POST", "/api/v1/channels/1/playlist", `{"media_ids":[42]}`), 400)
	chExpect(t, do("POST", "/api/v1/channels/77/playlist", `{"media_ids":[1]}`), 404)
	chExpect(t, do("POST", "/api/v1/channels/1/playlist", `nope`), 400)
}

func TestGetChannel(t *testing.T) {
	do := chSetup(t)
	chExpect(t, do("POST", "/api/v1/channels", `{"number":1,"name":"Classic Movies"}`), 201)

	tests := []struct {
		name       string
		path       string
		wantStatus int
		wantFields bool
	}{
		{
			name:       "200 success",
			path:       "/api/v1/channels/1",
			wantStatus: http.StatusOK,
			wantFields: true,
		},
		{
			name:       "404 unknown id",
			path:       "/api/v1/channels/999",
			wantStatus: http.StatusNotFound,
		},
		{
			name:       "400 or 404 non-numeric id",
			path:       "/api/v1/channels/abc",
			wantStatus: http.StatusNotFound,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := do("GET", tc.path, "")
			if tc.name == "400 or 404 non-numeric id" {
				if rec.Code != http.StatusNotFound && rec.Code != http.StatusBadRequest {
					t.Fatalf("status = %d, want 404 or 400; body=%s", rec.Code, rec.Body.String())
				}
			} else if rec.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d; body=%s", rec.Code, tc.wantStatus, rec.Body.String())
			}

			if rec.Header().Get("Content-Type") != "application/json" {
				t.Errorf("content-type = %q, want application/json", rec.Header().Get("Content-Type"))
			}

			var body map[string]any
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatalf("invalid json response: %v", err)
			}

			if tc.wantFields {
				for _, key := range []string{"id", "number", "name", "created_at"} {
					if _, ok := body[key]; !ok {
						t.Errorf("missing expected key %q in response: %v", key, body)
					}
				}
				if body["name"] != "Classic Movies" {
					t.Errorf("expected name 'Classic Movies', got %v", body["name"])
				}
			} else {
				if errStr, ok := body["error"].(string); !ok || errStr == "" {
					t.Errorf("missing or empty error message in response: %v", body)
				}
			}
		})
	}
}
