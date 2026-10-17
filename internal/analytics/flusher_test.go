package analytics

import (
	"testing"
	"time"

	"github.com/uzzzzy/niracast/internal/db"
)

func TestFlusher_FlushAndClose(t *testing.T) {
	conn, err := db.InitDB(":memory:")
	if err != nil {
		t.Fatalf("init db: %v", err)
	}
	defer conn.Close()

	curr := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)
	tracker := NewTracker()
	tracker.SetNow(func() time.Time { return curr })

	flusher := NewFlusher(conn, tracker,
		WithFlusherNow(func() time.Time { return curr }),
		WithFlusherInterval(100*time.Millisecond),
	)

	// Record ping and bytes
	tracker.RecordPing(1, "test-client", curr)
	tracker.RecordBytes(1, 10, 2048)

	// Advance time by 30 seconds
	curr = curr.Add(30 * time.Second)
	tracker.Tick(curr)

	// Flush
	if err := flusher.Flush(); err != nil {
		t.Fatalf("Flush: %v", err)
	}

	var count int
	var peak int
	var bytesOut int64
	var watchSec float64
	err = conn.QueryRow(`
		SELECT COUNT(*), COALESCE(SUM(viewers_peak), 0), COALESCE(SUM(bytes_out), 0), COALESCE(SUM(watch_sec), 0)
		FROM analytics_minute
		WHERE channel_id = 1;
	`).Scan(&count, &peak, &bytesOut, &watchSec)
	if err != nil {
		t.Fatalf("query minute: %v", err)
	}

	if count == 0 {
		t.Fatal("expected at least 1 row in analytics_minute")
	}
	if bytesOut != 2048 {
		t.Errorf("bytes_out = %d, want 2048", bytesOut)
	}
	if peak < 1 {
		t.Errorf("viewers_peak = %d, want >= 1", peak)
	}
	if watchSec <= 0 {
		t.Errorf("watch_sec = %v, want > 0", watchSec)
	}

	// Close flusher
	if err := flusher.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
}
