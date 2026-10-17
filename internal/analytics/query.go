package analytics

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
	"strings"
	"time"
)

// LiveChannelStatus describes live analytics metrics for a single broadcast channel.
type LiveChannelStatus struct {
	ChannelID int64  `json:"channel_id"`
	Viewers   int    `json:"viewers"`
	Restarts  int    `json:"restarts"`
	LastError string `json:"last_error"`
}

// LiveResponse describes live viewer and channel health analytics.
type LiveResponse struct {
	TotalViewers int                 `json:"total_viewers"`
	Channels     []LiveChannelStatus `json:"channels"`
}

// TimeseriesPoint represents a single analytics aggregation time point.
type TimeseriesPoint struct {
	TS          time.Time `json:"ts"`
	ViewersPeak int       `json:"viewers_peak"`
	BytesOut    int64     `json:"bytes_out"`
	WatchSec    float64   `json:"watch_sec"`
}

// TimeseriesResponse describes historical analytics metrics over a time range.
type TimeseriesResponse struct {
	Range  string            `json:"range"`
	Points []TimeseriesPoint `json:"points"`
}

// TopMediaItem describes watch metrics for a media item.
type TopMediaItem struct {
	MediaID  int64   `json:"media_id"`
	Title    string  `json:"title"`
	WatchSec float64 `json:"watch_sec"`
}

// TopMediaResponse describes top media consumption over a time range.
type TopMediaResponse struct {
	Items []TopMediaItem `json:"items"`
}

// QueryLive retrieves real-time viewer concurrency and channel health.
func QueryLive(ctx context.Context, db *sql.DB, tracker *Tracker, healthLookup func(channelID int64) (int, string)) (*LiveResponse, error) {
	rows, err := db.QueryContext(ctx, `SELECT id FROM channels ORDER BY id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var channels []LiveChannelStatus
	for rows.Next() {
		var chID int64
		if err := rows.Scan(&chID); err != nil {
			return nil, err
		}
		viewers := tracker.ChannelViewers(chID)
		var restarts int
		var lastErr string
		if healthLookup != nil {
			restarts, lastErr = healthLookup(chID)
		}
		channels = append(channels, LiveChannelStatus{
			ChannelID: chID,
			Viewers:   viewers,
			Restarts:  restarts,
			LastError: lastErr,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if channels == nil {
		channels = []LiveChannelStatus{}
	}

	return &LiveResponse{
		TotalViewers: tracker.TotalViewers(),
		Channels:     channels,
	}, nil
}

// ParseRange validates and normalizes the range query parameter (1h, 24h, 7d, 30d).
func ParseRange(rangeStr string) (string, time.Duration) {
	switch rangeStr {
	case "1h":
		return "1h", time.Hour
	case "24h":
		return "24h", 24 * time.Hour
	case "7d":
		return "7d", 7 * 24 * time.Hour
	case "30d":
		return "30d", 30 * 24 * time.Hour
	default:
		return "24h", 24 * time.Hour
	}
}

// QueryTimeseries computes historical peak viewers, bytes delivered, and watch time.
func QueryTimeseries(ctx context.Context, db *sql.DB, rangeStr string, channelID int64, now time.Time) (*TimeseriesResponse, error) {
	normRange, d := ParseRange(rangeStr)
	from := now.Add(-d)

	points := make([]TimeseriesPoint, 0)

	if normRange == "1h" || normRange == "24h" {
		query := `
			SELECT bucket_at, MAX(viewers_peak), SUM(bytes_out), SUM(watch_sec)
			FROM analytics_minute
			WHERE bucket_at >= ? AND bucket_at <= ?
		`
		args := []any{from.Unix(), now.Unix()}
		if channelID > 0 {
			query += ` AND channel_id = ?`
			args = append(args, channelID)
		}
		query += ` GROUP BY bucket_at ORDER BY bucket_at ASC;`

		rows, err := db.QueryContext(ctx, query, args...)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		for rows.Next() {
			var bucketAt int64
			var peak int
			var bytesOut int64
			var watchSec float64
			if err := rows.Scan(&bucketAt, &peak, &bytesOut, &watchSec); err != nil {
				return nil, err
			}
			points = append(points, TimeseriesPoint{
				TS:          time.Unix(bucketAt, 0).UTC(),
				ViewersPeak: peak,
				BytesOut:    bytesOut,
				WatchSec:    watchSec,
			})
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
	} else {
		// Daily aggregated query for 7d or 30d
		var query string
		var args []any
		fromDay := (from.Unix() / 86400) * 86400

		if channelID > 0 {
			query = `
				SELECT day_at, MAX(viewers_peak), SUM(bytes_out), SUM(watch_sec)
				FROM (
					SELECT day_at, viewers_peak, bytes_out, watch_sec
					FROM analytics_daily
					WHERE day_at >= ? AND channel_id = ?
					UNION ALL
					SELECT (bucket_at / 86400) * 86400 AS day_at, viewers_peak, bytes_out, watch_sec
					FROM analytics_minute
					WHERE bucket_at >= ? AND channel_id = ?
					  AND (bucket_at / 86400) * 86400 NOT IN (
						SELECT day_at FROM analytics_daily WHERE day_at >= ? AND channel_id = ?
					  )
				)
				GROUP BY day_at
				ORDER BY day_at ASC;
			`
			args = []any{fromDay, channelID, from.Unix(), channelID, fromDay, channelID}
		} else {
			query = `
				SELECT day_at, MAX(viewers_peak), SUM(bytes_out), SUM(watch_sec)
				FROM (
					SELECT day_at, viewers_peak, bytes_out, watch_sec
					FROM analytics_daily
					WHERE day_at >= ?
					UNION ALL
					SELECT (bucket_at / 86400) * 86400 AS day_at, viewers_peak, bytes_out, watch_sec
					FROM analytics_minute
					WHERE bucket_at >= ?
					  AND (bucket_at / 86400) * 86400 NOT IN (
						SELECT day_at FROM analytics_daily WHERE day_at >= ?
					  )
				)
				GROUP BY day_at
				ORDER BY day_at ASC;
			`
			args = []any{fromDay, from.Unix(), fromDay}
		}

		rows, err := db.QueryContext(ctx, query, args...)
		if err != nil {
			return nil, err
		}
		defer rows.Close()

		for rows.Next() {
			var dayAt int64
			var peak int
			var bytesOut int64
			var watchSec float64
			if err := rows.Scan(&dayAt, &peak, &bytesOut, &watchSec); err != nil {
				return nil, err
			}
			points = append(points, TimeseriesPoint{
				TS:          time.Unix(dayAt, 0).UTC(),
				ViewersPeak: peak,
				BytesOut:    bytesOut,
				WatchSec:    watchSec,
			})
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}

	return &TimeseriesResponse{
		Range:  normRange,
		Points: points,
	}, nil
}

// QueryTopMedia retrieves the top watched media items within the requested time range.
func QueryTopMedia(ctx context.Context, db *sql.DB, rangeStr string, now time.Time) (*TopMediaResponse, error) {
	_, d := ParseRange(rangeStr)
	from := now.Add(-d)

	query := `
		SELECT combined.media_id, COALESCE(m.filename, ''), SUM(combined.watch_sec) AS total_watch_sec
		FROM (
			SELECT media_id, watch_sec
			FROM analytics_minute
			WHERE bucket_at >= ? AND media_id > 0
			UNION ALL
			SELECT media_id, watch_sec
			FROM analytics_daily
			WHERE day_at >= ? AND media_id > 0
			  AND day_at NOT IN (
				SELECT DISTINCT (bucket_at / 86400) * 86400
				FROM analytics_minute
				WHERE bucket_at >= ?
			  )
		) combined
		LEFT JOIN media_files m ON m.id = combined.media_id
		GROUP BY combined.media_id
		ORDER BY total_watch_sec DESC
		LIMIT 10;
	`

	fromDay := (from.Unix() / 86400) * 86400
	rows, err := db.QueryContext(ctx, query, from.Unix(), fromDay, from.Unix())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]TopMediaItem, 0)
	for rows.Next() {
		var mediaID int64
		var filename string
		var watchSec float64
		if err := rows.Scan(&mediaID, &filename, &watchSec); err != nil {
			return nil, err
		}
		title := strings.TrimSuffix(filename, filepath.Ext(filename))
		if title == "" {
			title = fmt.Sprintf("Media %d", mediaID)
		}
		items = append(items, TopMediaItem{
			MediaID:  mediaID,
			Title:    title,
			WatchSec: watchSec,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &TopMediaResponse{
		Items: items,
	}, nil
}
