package analytics

import (
	"context"
	"database/sql"
	"time"
)

// RunRollup aggregates completed minutes from analytics_minute into analytics_daily.
// A day is eligible for rollup once it has passed midnight UTC.
func RunRollup(ctx context.Context, db *sql.DB, now time.Time) error {
	midnightUTC := time.Date(now.UTC().Year(), now.UTC().Month(), now.UTC().Day(), 0, 0, 0, 0, time.UTC).Unix()

	_, err := db.ExecContext(ctx, `
		INSERT INTO analytics_daily (day_at, channel_id, media_id, viewers_peak, bytes_out, watch_sec)
		SELECT
			(bucket_at / 86400) * 86400 AS day_at,
			channel_id,
			media_id,
			MAX(viewers_peak) AS viewers_peak,
			SUM(bytes_out) AS bytes_out,
			SUM(watch_sec) AS watch_sec
		FROM analytics_minute
		WHERE bucket_at < ?
		GROUP BY day_at, channel_id, media_id
		ON CONFLICT(day_at, channel_id, media_id) DO UPDATE SET
			viewers_peak = MAX(analytics_daily.viewers_peak, excluded.viewers_peak),
			bytes_out = excluded.bytes_out,
			watch_sec = excluded.watch_sec;
	`, midnightUTC)
	return err
}

// RunRetention purges analytics rows exceeding retention policies:
// - analytics_minute: 30 days retention.
// - analytics_daily: 1 year (365 days) retention.
func RunRetention(ctx context.Context, db *sql.DB, now time.Time) error {
	cutoffMinute := now.Add(-30 * 24 * time.Hour).Unix()
	if _, err := db.ExecContext(ctx, `DELETE FROM analytics_minute WHERE bucket_at < ?;`, cutoffMinute); err != nil {
		return err
	}

	cutoffDaily := now.Add(-365 * 24 * time.Hour).Unix()
	if _, err := db.ExecContext(ctx, `DELETE FROM analytics_daily WHERE day_at < ?;`, cutoffDaily); err != nil {
		return err
	}

	return nil
}
