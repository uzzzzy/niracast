package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/uzzzzy/niracast/internal/db"
)

func TestListMedia_FieldsAndOrdering(t *testing.T) {
	conn, err := db.InitDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	// Insert two rows: one with full codec/dimension info, one with NULLs
	_, err = conn.Exec(`
		INSERT INTO media_files (id, path, filename, duration_sec, codec_video, codec_audio, width, height)
		VALUES
			(1, '/media/z.mp4', 'z.mp4', 120.5, NULL, NULL, NULL, NULL),
			(2, '/media/a.mp4', 'a.mp4', 60.0, 'h264', 'aac', 1920, 1080)
	`)
	if err != nil {
		t.Fatalf("insert media_files: %v", err)
	}

	handler := listMedia(conn)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/media", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (body: %s)", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("content-type = %s, want application/json", ct)
	}

	type mediaItem struct {
		ID          int64   `json:"id"`
		Path        string  `json:"path"`
		Filename    string  `json:"filename"`
		DurationSec float64 `json:"duration_sec"`
		CodecVideo  string  `json:"codec_video"`
		CodecAudio  string  `json:"codec_audio"`
		Width       int     `json:"width"`
		Height      int     `json:"height"`
	}

	var items []mediaItem
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}

	if len(items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(items))
	}

	// Order must be by filename ASC: a.mp4 first, then z.mp4
	if items[0].Filename != "a.mp4" {
		t.Errorf("items[0].Filename = %q, want 'a.mp4'", items[0].Filename)
	}
	if items[0].CodecVideo != "h264" || items[0].CodecAudio != "aac" {
		t.Errorf("items[0] codecs = (%q, %q), want ('h264', 'aac')", items[0].CodecVideo, items[0].CodecAudio)
	}
	if items[0].Width != 1920 || items[0].Height != 1080 {
		t.Errorf("items[0] dimensions = (%d, %d), want (1920, 1080)", items[0].Width, items[0].Height)
	}
	if items[0].DurationSec != 60.0 || items[0].Path != "/media/a.mp4" {
		t.Errorf("items[0] path/duration = (%q, %v)", items[0].Path, items[0].DurationSec)
	}

	// Second item: nulls should be empty strings and 0 ints
	if items[1].Filename != "z.mp4" {
		t.Errorf("items[1].Filename = %q, want 'z.mp4'", items[1].Filename)
	}
	if items[1].CodecVideo != "" || items[1].CodecAudio != "" {
		t.Errorf("items[1] null codecs must be empty strings, got (%q, %q)", items[1].CodecVideo, items[1].CodecAudio)
	}
	if items[1].Width != 0 || items[1].Height != 0 {
		t.Errorf("items[1] null dimensions must be 0, got (%d, %d)", items[1].Width, items[1].Height)
	}
	if items[1].DurationSec != 120.5 || items[1].Path != "/media/z.mp4" {
		t.Errorf("items[1] path/duration = (%q, %v)", items[1].Path, items[1].DurationSec)
	}
}
