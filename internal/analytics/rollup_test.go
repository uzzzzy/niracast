package analytics

import (
	"context"
	"testing"
	"time"

	"github.com/uzzzzy/niracast/internal/db"
)

func TestRollup_And_Retention(t *testing.T) {
	conn, err := db.InitDB(":memory:")
	if err != nil {
		t.Fatalf("init db: %v", err)
	}
	defer conn.Close()

	ctx := context.Background()
	now := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)

	// Insert minutes for yesterday (2026-10-17)
	yesterdayMin := time.Date(2026, 10, 17, 10, 0, 0, 0, time.UTC).Unix()
	_, err = conn.Exec(`
		INSERT INTO analytics_minute (bucket_at, channel_id, media_id, viewers_peak, bytes_out, watch_sec)
		VALUES (?, 1, 5, 10, 1024, 60.0);
	`, yesterdayMin)
	if err != nil {
		t.Fatalf("insert minute: %v", err)
	}

	// Insert minute for 35 days ago (should be purged by retention)
	oldMin := now.Add(-35 * 24 * time.Hour).Unix()
	_, err = conn.Exec(`
		INSERT INTO analytics_minute (bucket_at, channel_id, media_id, viewers_peak, bytes_out, watch_sec)
		VALUES (?, 1, 5, 2, 512, 30.0);
	`, oldMin)
	if err != nil {
		t.Fatalf("insert old minute: %v", err)
	}

	// Insert daily row for 400 days ago (should be purged by daily retention)
	oldDay := now.Add(-400 * 24 * time.Hour).Unix()
	_, err = conn.Exec(`
		INSERT INTO analytics_daily (day_at, channel_id, media_id, viewers_peak, bytes_out, watch_sec)
		VALUES (?, 1, 5, 5, 2048, 100.0);
	`, oldDay)
	if err != nil {
		t.Fatalf("insert old daily: %v", err)
	}

	// Run Rollup
	if err := RunRollup(ctx, conn, now); err != nil {
		t.Fatalf("RunRollup: %v", err)
	}

	// Verify yesterday was rolled up into analytics_daily
	yesterdayDay := time.Date(2026, 10, 17, 0, 0, 0, 0, time.UTC).Unix()
	var dayCount int
	var dailyPeak int
	var dailyBytes int64
	err = conn.QueryRow(`
		SELECT COUNT(*), viewers_peak, bytes_out
		FROM analytics_daily
		WHERE day_at = ? AND channel_id = 1;
	`, yesterdayDay).Scan(&dayCount, &dailyPeak, &dailyBytes)
	if err != nil {
		t.Fatalf("query rolled up daily: %v", err)
	}
	if dayCount != 1 {
		t.Errorf("expected 1 daily row for yesterday, got %d", dayCount)
	}
	if dailyPeak != 10 {
		t.Errorf("viewers_peak = %d, want 10", dailyPeak)
	}
	if dailyBytes != 1024 {
		t.Errorf("bytes_out = %d, want 1024", dailyBytes)
	}

	// Run Retention
	if err := RunRetention(ctx, conn, now); err != nil {
		t.Fatalf("RunRetention: %v", err)
	}

	// Verify 35-day-old minute row was purged
	var oldMinCount int
	if err := conn.QueryRow(`SELECT COUNT(*) FROM analytics_minute WHERE bucket_at = ?;`, oldMin).Scan(&oldMinCount); err != nil {
		t.Fatal(err)
	}
	if oldMinCount != 0 {
		t.Errorf("expected old minute purged, found %d", oldMinCount)
	}

	// Verify 400-day-old daily row was purged
	var oldDayCount int
	if err := conn.QueryRow(`SELECT COUNT(*) FROM analytics_daily WHERE day_at = ?;`, oldDay).Scan(&oldDayCount); err != nil {
		t.Fatal(err)
	}
	if oldDayCount != 0 {
		t.Errorf("expected old daily purged, found %d", oldDayCount)
	}
}
