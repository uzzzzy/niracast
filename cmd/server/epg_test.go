package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/uzzzzy/niracast/internal/auth"
	"github.com/uzzzzy/niracast/internal/ingest"
	"github.com/uzzzzy/niracast/internal/stream"
	"github.com/uzzzzy/niracast/internal/timeline"
)

func TestEPGHandler(t *testing.T) {
	conn, root := openRealDB(t)

	// Channel 1: has schedules
	if _, err := conn.Exec(`INSERT INTO channels (id, number, name) VALUES (1, 101, 'Channel 1')`); err != nil {
		t.Fatalf("insert channel 1: %v", err)
	}
	// Channel 2: empty (no schedules)
	if _, err := conn.Exec(`INSERT INTO channels (id, number, name) VALUES (2, 102, 'Channel 2')`); err != nil {
		t.Fatalf("insert channel 2: %v", err)
	}

	tempMedia := filepath.Join(t.TempDir(), "sample.mp4")
	if err := os.WriteFile(tempMedia, []byte("stub-video"), 0o644); err != nil {
		t.Fatalf("write temp media: %v", err)
	}

	if _, err := conn.Exec(`INSERT INTO media_files (id, path, filename, duration_sec, codec_video, codec_audio) 
		VALUES (10, ?, 'sample.mp4', 60.0, 'h264', 'aac')`, tempMedia); err != nil {
		t.Fatalf("insert media_files: %v", err)
	}

	if _, err := conn.Exec(`INSERT INTO schedules (channel_id, media_id, duration_sec, position_order) 
		VALUES (1, 10, 60.0, 0)`); err != nil {
		t.Fatalf("insert schedules: %v", err)
	}

	calc := timeline.NewDBCalculator(conn)
	handler := newEPGHandler(conn, nil, calc)
	mux := http.NewServeMux()
	handler.register(mux)

	// 1. 200 shape test
	t.Run("200 shape", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/channels/1/epg", nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("got status %d, want 200", rec.Code)
		}
		if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
			t.Errorf("got Content-Type %q, want application/json", ct)
		}

		var resp epgResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("unmarshal error: %v", err)
		}

		if resp.ChannelID != 1 {
			t.Errorf("channel_id = %d, want 1", resp.ChannelID)
		}
		if resp.Idle {
			t.Errorf("idle = true, want false")
		}
		if resp.GeneratedAt.IsZero() {
			t.Errorf("generated_at is zero")
		}
		if len(resp.Items) != 5 {
			t.Fatalf("len(items) = %d, want 5 (default count)", len(resp.Items))
		}

		first := resp.Items[0]
		if first.Kind != "programme" {
			t.Errorf("first item kind = %q, want 'programme'", first.Kind)
		}
		if first.MediaID != 10 {
			t.Errorf("first item media_id = %d, want 10", first.MediaID)
		}
		if first.Title != "sample" {
			t.Errorf("first item title = %q, want 'sample'", first.Title)
		}
		if first.DurationSec != 60.0 {
			t.Errorf("first item duration_sec = %f, want 60.0", first.DurationSec)
		}
		if !first.IsCurrent {
			t.Errorf("first item is_current = false, want true")
		}
		if first.StartAt.IsZero() || first.EndAt.IsZero() {
			t.Errorf("first item start_at or end_at is zero")
		}
		if !first.EndAt.After(first.StartAt) {
			t.Errorf("first item end_at (%v) not after start_at (%v)", first.EndAt, first.StartAt)
		}

		for i := 1; i < len(resp.Items); i++ {
			if resp.Items[i].IsCurrent {
				t.Errorf("item %d has is_current=true, want false", i)
			}
		}
	})

	// 2. Count clamp (0 and 99)
	t.Run("count clamp", func(t *testing.T) {
		// count = 0 clamped to 1
		req0 := httptest.NewRequest(http.MethodGet, "/api/v1/channels/1/epg?count=0", nil)
		rec0 := httptest.NewRecorder()
		mux.ServeHTTP(rec0, req0)
		if rec0.Code != http.StatusOK {
			t.Fatalf("count=0 status %d, want 200", rec0.Code)
		}
		var resp0 epgResponse
		if err := json.Unmarshal(rec0.Body.Bytes(), &resp0); err != nil {
			t.Fatalf("unmarshal count=0: %v", err)
		}
		if len(resp0.Items) != 1 {
			t.Errorf("count=0 len(items) = %d, want 1", len(resp0.Items))
		}

		// count = 99 clamped to 20
		req99 := httptest.NewRequest(http.MethodGet, "/api/v1/channels/1/epg?count=99", nil)
		rec99 := httptest.NewRecorder()
		mux.ServeHTTP(rec99, req99)
		if rec99.Code != http.StatusOK {
			t.Fatalf("count=99 status %d, want 200", rec99.Code)
		}
		var resp99 epgResponse
		if err := json.Unmarshal(rec99.Body.Bytes(), &resp99); err != nil {
			t.Fatalf("unmarshal count=99: %v", err)
		}
		if len(resp99.Items) != 20 {
			t.Errorf("count=99 len(items) = %d, want 20", len(resp99.Items))
		}
	})

	// 3. 404 unknown channel
	t.Run("404 unknown", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/channels/999/epg", nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("unknown channel status = %d, want 404", rec.Code)
		}
		if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
			t.Errorf("Content-Type = %q, want application/json", ct)
		}
		var errResp map[string]string
		if err := json.Unmarshal(rec.Body.Bytes(), &errResp); err != nil {
			t.Fatalf("unmarshal error json: %v", err)
		}
		if errResp["error"] == "" {
			t.Errorf("expected error message in json, got %+v", errResp)
		}
	})

	// 4. 404 non-numeric channel id
	t.Run("404 non-numeric", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/channels/non-numeric-id/epg", nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("non-numeric channel status = %d, want 404", rec.Code)
		}
		if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
			t.Errorf("Content-Type = %q, want application/json", ct)
		}
		var errResp map[string]string
		if err := json.Unmarshal(rec.Body.Bytes(), &errResp); err != nil {
			t.Fatalf("unmarshal error json: %v", err)
		}
		if errResp["error"] == "" {
			t.Errorf("expected error message in json, got %+v", errResp)
		}
	})

	// 5. Idle empty playlist
	t.Run("idle empty playlist", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/channels/2/epg", nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("idle channel status = %d, want 200", rec.Code)
		}
		if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
			t.Errorf("Content-Type = %q, want application/json", ct)
		}

		var resp epgResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("unmarshal idle response: %v", err)
		}
		if resp.ChannelID != 2 {
			t.Errorf("channel_id = %d, want 2", resp.ChannelID)
		}
		if !resp.Idle {
			t.Errorf("idle = false, want true")
		}
		if resp.Items == nil || len(resp.Items) != 0 {
			t.Errorf("items = %v, want empty non-nil slice", resp.Items)
		}
		raw := rec.Body.String()
		if !strings.Contains(raw, `"items":[]`) {
			t.Errorf("raw JSON missing '\"items\":[]': %s", raw)
		}
	})

	// 6. Anonymous access allowed through auth.Protect
	t.Run("anonymous access allowed", func(t *testing.T) {
		authHandler := auth.New(auth.Config{
			AdminPassword: "test-admin-password",
			SessionSecret: []byte("test-session-secret-32-bytes-long"),
		})
		protectedHandler := authHandler.Protect(mux, nil)

		// Anonymous GET request without any cookie or header
		req := httptest.NewRequest(http.MethodGet, "/api/v1/channels/1/epg", nil)
		rec := httptest.NewRecorder()
		protectedHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("anonymous GET /api/v1/channels/1/epg returned %d, want 200", rec.Code)
		}

		// Mutating POST request on /epg is rejected by auth
		reqPost := httptest.NewRequest(http.MethodPost, "/api/v1/channels/1/epg", nil)
		recPost := httptest.NewRecorder()
		protectedHandler.ServeHTTP(recPost, reqPost)
		if recPost.Code != http.StatusUnauthorized {
			t.Fatalf("anonymous POST /api/v1/channels/1/epg returned %d, want 401", recPost.Code)
		}
	})

	// 7. Supervisor skip offset shifts items
	t.Run("supervisor skip offset shifts items", func(t *testing.T) {
		ctrl := newFakeStatusCtrl()
		active := &testActive{}
		codecLook := func(_ int64) ingest.MediaMetadata { return ingest.MediaMetadata{} }
		sv := stream.NewSupervisor(calc, ctrl, active, codecLook, "idle.mp4", root)

		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		sv.Ensure(ctx, 1)

		// Wait until supervisor starts playing
		deadline := time.Now().Add(2 * time.Second)
		for time.Now().Before(deadline) {
			if sv.Status(1).State == "playing" {
				break
			}
			time.Sleep(10 * time.Millisecond)
		}

		// Advance channel playout via skip
		_, err := sv.Skip(1)
		if err != nil {
			t.Fatalf("sv.Skip(1): %v", err)
		}

		hWithSv := newEPGHandler(conn, sv, calc)
		muxWithSv := http.NewServeMux()
		hWithSv.register(muxWithSv)

		req := httptest.NewRequest(http.MethodGet, "/api/v1/channels/1/epg?count=1", nil)
		rec := httptest.NewRecorder()
		muxWithSv.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("got status %d, want 200", rec.Code)
		}
		var resp epgResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("unmarshal error: %v", err)
		}
		if len(resp.Items) != 1 {
			t.Fatalf("len(items) = %d, want 1", len(resp.Items))
		}
		// Confirm start_at is in real wall clock time (before or near now)
		if resp.Items[0].StartAt.After(time.Now().Add(time.Second)) {
			t.Errorf("expected start_at to be in real wall clock time, got %v", resp.Items[0].StartAt)
		}
	})

	// 8. Scheduled channel returns slate when in gap and idle=true
	t.Run("scheduled channel epg with slate", func(t *testing.T) {
		if _, err := conn.Exec(`INSERT INTO channels (id, number, name, mode) VALUES (3, 103, 'Scheduled Chan', 'scheduled')`); err != nil {
			t.Fatalf("insert channel 3: %v", err)
		}
		req := httptest.NewRequest(http.MethodGet, "/api/v1/channels/3/epg?count=2", nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("got status %d, want 200", rec.Code)
		}
		var resp epgResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("unmarshal error: %v", err)
		}
		if !resp.Idle {
			t.Errorf("expected idle=true for scheduled channel in gap")
		}
		if len(resp.Items) == 0 {
			t.Fatalf("expected at least 1 slate item, got 0")
		}
		if resp.Items[0].Kind != "slate" {
			t.Errorf("expected kind 'slate', got %q", resp.Items[0].Kind)
		}
		if resp.Items[0].Title != "Siaran Segera Kembali" {
			t.Errorf("expected title 'Siaran Segera Kembali', got %q", resp.Items[0].Title)
		}
	})
}
