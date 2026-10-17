package analytics

import (
	"context"
	"testing"
	"time"

	"tv-stream/internal/db"
)

func TestQuery_LiveTimeseriesTopMedia(t *testing.T) {
	conn, err := db.InitDB(":memory:")
	if err != nil {
		t.Fatalf("init db: %v", err)
	}
	defer conn.Close()

	ctx := context.Background()
	now := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)

	// Seed channels and media
	_, err = conn.Exec(`
		INSERT INTO channels (id, number, name, mode) VALUES (1, 1, 'Channel One', 'loop'), (2, 2, 'Channel Two', 'loop');
		INSERT INTO media_files (id, path, filename, duration_sec) VALUES
			(10, '/media/show_a.mp4', 'show_a.mp4', 120.0),
			(20, '/media/show_b.mp4', 'show_b.mp4', 180.0);
	`)
	if err != nil {
		t.Fatalf("seed db: %v", err)
	}

	tracker := NewTracker()
	tracker.SetNow(func() time.Time { return now })
	tracker.RecordPing(1, "client1", now)
	tracker.RecordPing(1, "client2", now)

	// 1. QueryLive
	liveResp, err := QueryLive(ctx, conn, tracker, func(chID int64) (int, string) {
		if chID == 1 {
			return 2, "sample error"
		}
		return 0, ""
	})
	if err != nil {
		t.Fatalf("QueryLive: %v", err)
	}
	if liveResp.TotalViewers != 2 {
		t.Errorf("TotalViewers = %d, want 2", liveResp.TotalViewers)
	}
	if len(liveResp.Channels) != 2 {
		t.Fatalf("len(channels) = %d, want 2", len(liveResp.Channels))
	}
	if liveResp.Channels[0].ChannelID != 1 || liveResp.Channels[0].Viewers != 2 || liveResp.Channels[0].Restarts != 2 || liveResp.Channels[0].LastError != "sample error" {
		t.Errorf("unexpected channel 1 status: %+v", liveResp.Channels[0])
	}

	// 2. QueryTimeseries with minute data
	t1 := now.Add(-30 * time.Minute).Unix()
	t2 := now.Add(-10 * time.Minute).Unix()
	_, err = conn.Exec(`
		INSERT INTO analytics_minute (bucket_at, channel_id, media_id, viewers_peak, bytes_out, watch_sec)
		VALUES
			(?, 1, 10, 5, 10000, 300.0),
			(?, 1, 20, 8, 20000, 600.0);
	`, t1, t2)
	if err != nil {
		t.Fatalf("insert minute data: %v", err)
	}

	tsResp, err := QueryTimeseries(ctx, conn, "1h", 1, now)
	if err != nil {
		t.Fatalf("QueryTimeseries: %v", err)
	}
	if tsResp.Range != "1h" {
		t.Errorf("range = %q, want 1h", tsResp.Range)
	}
	if len(tsResp.Points) != 2 {
		t.Fatalf("len(points) = %d, want 2", len(tsResp.Points))
	}
	if tsResp.Points[0].ViewersPeak != 5 || tsResp.Points[0].BytesOut != 10000 {
		t.Errorf("point 0 mismatch: %+v", tsResp.Points[0])
	}
	if tsResp.Points[1].ViewersPeak != 8 || tsResp.Points[1].BytesOut != 20000 {
		t.Errorf("point 1 mismatch: %+v", tsResp.Points[1])
	}

	// 3. QueryTopMedia
	topResp, err := QueryTopMedia(ctx, conn, "24h", now)
	if err != nil {
		t.Fatalf("QueryTopMedia: %v", err)
	}
	if len(topResp.Items) != 2 {
		t.Fatalf("len(items) = %d, want 2", len(topResp.Items))
	}
	// show_b has 600s watch_sec, show_a has 300s -> show_b must be first
	if topResp.Items[0].MediaID != 20 || topResp.Items[0].Title != "show_b" || topResp.Items[0].WatchSec != 600.0 {
		t.Errorf("top item 0 mismatch: %+v", topResp.Items[0])
	}
	if topResp.Items[1].MediaID != 10 || topResp.Items[1].Title != "show_a" || topResp.Items[1].WatchSec != 300.0 {
		t.Errorf("top item 1 mismatch: %+v", topResp.Items[1])
	}
}
