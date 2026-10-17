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

	chExpect(t, do("DELETE", "/api/v1/channels/2", ""), 204)
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

type fakePlayoutStopper struct {
	stopped []int64
}

func (f *fakePlayoutStopper) StopStream(id int64) error {
	f.stopped = append(f.stopped, id)
	return nil
}

func TestGetPlaylist_ShapeAndOrdering(t *testing.T) {
	conn, err := db.InitDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	if _, err := conn.Exec(`INSERT INTO media_files (id, path, filename, duration_sec) VALUES (1,'/a.mp4','a.mp4',10),(2,'/b.mp4','b.mp4',20)`); err != nil {
		t.Fatal(err)
	}

	mux := http.NewServeMux()
	NewChannelHandler(conn).Register(mux)

	do := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		return rec
	}

	// 1. Channel exists, empty playlist
	chExpect(t, do("POST", "/api/v1/channels", `{"number":1,"name":"Channel 1"}`), 201)
	recEmpty := do("GET", "/api/v1/channels/1/playlist", "")
	chExpect(t, recEmpty, 200)

	var emptyResp struct {
		ChannelID        int64            `json:"channel_id"`
		Items            []map[string]any `json:"items"`
		TotalDurationSec float64          `json:"total_duration_sec"`
	}
	if err := json.Unmarshal(recEmpty.Body.Bytes(), &emptyResp); err != nil {
		t.Fatalf("unmarshal empty playlist: %v", err)
	}
	if emptyResp.ChannelID != 1 {
		t.Errorf("channel_id = %d, want 1", emptyResp.ChannelID)
	}
	if len(emptyResp.Items) != 0 {
		t.Errorf("items count = %d, want 0", len(emptyResp.Items))
	}
	if emptyResp.TotalDurationSec != 0 {
		t.Errorf("total_duration_sec = %v, want 0", emptyResp.TotalDurationSec)
	}
	if !strings.Contains(recEmpty.Body.String(), `"items":[]`) {
		t.Errorf("expected items:[], got %s", recEmpty.Body.String())
	}

	// 2. Unknown channel -> 404 JSON
	rec404 := do("GET", "/api/v1/channels/999/playlist", "")
	chExpect(t, rec404, 404)
	if !strings.Contains(rec404.Body.String(), "channel not found") {
		t.Errorf("expected channel not found, got %s", rec404.Body.String())
	}

	// 3. Non-numeric id -> 400 JSON
	rec400 := do("GET", "/api/v1/channels/abc/playlist", "")
	chExpect(t, rec400, 400)
	if !strings.Contains(rec400.Body.String(), "invalid channel id") {
		t.Errorf("expected invalid channel id, got %s", rec400.Body.String())
	}

	// 4. Ordering after a POST
	chExpect(t, do("POST", "/api/v1/channels/1/playlist", `{"media_ids":[2,1]}`), 200)
	recOrdered := do("GET", "/api/v1/channels/1/playlist", "")
	chExpect(t, recOrdered, 200)

	var orderedResp struct {
		ChannelID int64 `json:"channel_id"`
		Items     []struct {
			MediaID     int64   `json:"media_id"`
			Position    int     `json:"position"`
			Filename    string  `json:"filename"`
			DurationSec float64 `json:"duration_sec"`
		} `json:"items"`
		TotalDurationSec float64 `json:"total_duration_sec"`
	}
	if err := json.Unmarshal(recOrdered.Body.Bytes(), &orderedResp); err != nil {
		t.Fatalf("unmarshal ordered playlist: %v", err)
	}
	if orderedResp.ChannelID != 1 {
		t.Errorf("channel_id = %d, want 1", orderedResp.ChannelID)
	}
	if len(orderedResp.Items) != 2 {
		t.Fatalf("items count = %d, want 2", len(orderedResp.Items))
	}
	if orderedResp.Items[0].MediaID != 2 || orderedResp.Items[0].Position != 0 || orderedResp.Items[0].Filename != "b.mp4" || orderedResp.Items[0].DurationSec != 20 {
		t.Errorf("first item = %+v, want media 2 at pos 0 with b.mp4 (20s)", orderedResp.Items[0])
	}
	if orderedResp.Items[1].MediaID != 1 || orderedResp.Items[1].Position != 1 || orderedResp.Items[1].Filename != "a.mp4" || orderedResp.Items[1].DurationSec != 10 {
		t.Errorf("second item = %+v, want media 1 at pos 1 with a.mp4 (10s)", orderedResp.Items[1])
	}
	if orderedResp.TotalDurationSec != 30 {
		t.Errorf("total_duration_sec = %v, want 30", orderedResp.TotalDurationSec)
	}
}

func TestDeleteChannel_StopsPlayoutAndCleansPlaylist(t *testing.T) {
	conn, err := db.InitDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	if _, err := conn.Exec(`INSERT INTO media_files (id, path, filename, duration_sec) VALUES (1,'/a.mp4','a.mp4',10)`); err != nil {
		t.Fatal(err)
	}

	stopper := &fakePlayoutStopper{}
	h := NewChannelHandler(conn, stopper)
	mux := http.NewServeMux()
	h.Register(mux)

	do := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		return rec
	}

	chExpect(t, do("POST", "/api/v1/channels", `{"number":1,"name":"Test Channel"}`), 201)
	chExpect(t, do("POST", "/api/v1/channels/1/playlist", `{"media_ids":[1]}`), 200)

	// Verify schedules has 1 item
	var schedCount int
	_ = conn.QueryRow(`SELECT COUNT(*) FROM schedules WHERE channel_id = 1`).Scan(&schedCount)
	if schedCount != 1 {
		t.Fatalf("expected 1 schedule item before delete, got %d", schedCount)
	}

	// Delete channel -> 204
	recDel := do("DELETE", "/api/v1/channels/1", "")
	chExpect(t, recDel, 204)
	if recDel.Body.Len() > 0 {
		t.Errorf("expected empty body for 204, got %s", recDel.Body.String())
	}

	// Verify stopper was called
	if len(stopper.stopped) != 1 || stopper.stopped[0] != 1 {
		t.Errorf("stopper.stopped = %v, want [1]", stopper.stopped)
	}

	// Verify schedules rows removed
	_ = conn.QueryRow(`SELECT COUNT(*) FROM schedules WHERE channel_id = 1`).Scan(&schedCount)
	if schedCount != 0 {
		t.Errorf("expected 0 schedule items after delete, got %d", schedCount)
	}

	// Verify channel removed
	var chCount int
	_ = conn.QueryRow(`SELECT COUNT(*) FROM channels WHERE id = 1`).Scan(&chCount)
	if chCount != 0 {
		t.Errorf("expected 0 channels after delete, got %d", chCount)
	}

	// Deleting again -> 404
	chExpect(t, do("DELETE", "/api/v1/channels/1", ""), 404)
	// Non-numeric ID -> 400
	chExpect(t, do("DELETE", "/api/v1/channels/abc", ""), 400)
}
