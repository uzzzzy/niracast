package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"tv-stream/internal/analytics"
	"tv-stream/internal/db"
)

func TestAnalyticsHandler_Endpoints(t *testing.T) {
	conn, err := db.InitDB(":memory:")
	if err != nil {
		t.Fatalf("init db: %v", err)
	}
	defer conn.Close()

	now := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)

	// Seed channel and media
	_, err = conn.Exec(`
		INSERT INTO channels (id, number, name, mode) VALUES (1, 1, 'Channel 1', 'loop');
		INSERT INTO media_files (id, path, filename, duration_sec) VALUES (10, '/media/clip.mp4', 'clip.mp4', 60.0);
	`)
	if err != nil {
		t.Fatalf("seed db: %v", err)
	}

	tracker := analytics.NewTracker()
	tracker.SetNow(func() time.Time { return now })
	tracker.RecordPing(1, "test-client", now)

	// Insert minute point
	_, err = conn.Exec(`
		INSERT INTO analytics_minute (bucket_at, channel_id, media_id, viewers_peak, bytes_out, watch_sec)
		VALUES (?, 1, 10, 4, 1024, 60.0);
	`, now.Add(-5*time.Minute).Unix())
	if err != nil {
		t.Fatalf("insert minute: %v", err)
	}

	h := NewAnalyticsHandler(conn, tracker, nil)
	h.Now = func() time.Time { return now }

	mux := http.NewServeMux()
	h.Register(mux)

	// 1. GET /api/v1/analytics/live
	{
		req := httptest.NewRequest("GET", "/api/v1/analytics/live", nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("GET /live status = %d, want 200 (body: %s)", rec.Code, rec.Body.String())
		}
		var live analytics.LiveResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &live); err != nil {
			t.Fatalf("unmarshal live: %v", err)
		}
		if live.TotalViewers != 1 {
			t.Errorf("TotalViewers = %d, want 1", live.TotalViewers)
		}
		if len(live.Channels) != 1 || live.Channels[0].Viewers != 1 {
			t.Errorf("Channels = %+v, want 1 channel with 1 viewer", live.Channels)
		}
	}

	// 2. GET /api/v1/analytics/timeseries?range=1h&channel_id=1
	{
		req := httptest.NewRequest("GET", "/api/v1/analytics/timeseries?range=1h&channel_id=1", nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("GET /timeseries status = %d, want 200 (body: %s)", rec.Code, rec.Body.String())
		}
		var ts analytics.TimeseriesResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &ts); err != nil {
			t.Fatalf("unmarshal timeseries: %v", err)
		}
		if ts.Range != "1h" {
			t.Errorf("range = %q, want 1h", ts.Range)
		}
		if len(ts.Points) != 1 || ts.Points[0].ViewersPeak != 4 || ts.Points[0].BytesOut != 1024 {
			t.Errorf("Points = %+v, want 1 point with peak 4, bytes 1024", ts.Points)
		}
	}

	// 3. GET /api/v1/analytics/top-media?range=24h
	{
		req := httptest.NewRequest("GET", "/api/v1/analytics/top-media?range=24h", nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("GET /top-media status = %d, want 200 (body: %s)", rec.Code, rec.Body.String())
		}
		var top analytics.TopMediaResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &top); err != nil {
			t.Fatalf("unmarshal top-media: %v", err)
		}
		if len(top.Items) != 1 || top.Items[0].MediaID != 10 || top.Items[0].Title != "clip" {
			t.Errorf("Items = %+v, want 1 item for clip", top.Items)
		}
	}
}
