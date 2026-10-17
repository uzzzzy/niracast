// Package timeline computes what a channel is playing at a given instant.
package timeline

import (
	"database/sql"
	"errors"
	"fmt"
	"math"
	"time"
)

// ErrEmptyPlaylist is returned when a channel has no playable items (total duration 0).
var ErrEmptyPlaylist = errors.New("channel playlist is empty")

// PlayoutItem is the item currently on air.
type PlayoutItem struct {
	MediaID      int64
	FilePath     string
	SeekSeconds  float64 // offset from the start of the video file
	RemainingSec float64
}

// TimelineCalculator resolves the current playout item for a channel.
type TimelineCalculator interface {
	GetCurrentPlayout(channelID int64, now time.Time) (*PlayoutItem, error)
}

// Item is one playlist entry in loop order.
type Item struct {
	MediaID  int64
	FilePath string
	Duration float64
}

// Loader returns a channel's ordered playlist.
type Loader func(channelID int64) ([]Item, error)

// Calculator implements TimelineCalculator over a playlist Loader.
type Calculator struct {
	load Loader
}

// NewCalculator builds a Calculator from a custom Loader.
func NewCalculator(load Loader) *Calculator { return &Calculator{load: load} }

// NewDBCalculator builds a Calculator reading playlists from SQLite (schedules + media_files).
func NewDBCalculator(db *sql.DB) *Calculator {
	return NewCalculator(func(channelID int64) ([]Item, error) {
		rows, err := db.Query(`SELECT m.id, m.path, COALESCE(m.duration_sec, 0)
			FROM schedules s JOIN media_files m ON m.id = s.media_id
			WHERE s.channel_id = ? ORDER BY s.position_order, s.id`, channelID)
		if err != nil {
			return nil, fmt.Errorf("query playlist: %w", err)
		}
		defer rows.Close()
		var items []Item
		for rows.Next() {
			var it Item
			if err := rows.Scan(&it.MediaID, &it.FilePath, &it.Duration); err != nil {
				return nil, fmt.Errorf("scan playlist: %w", err)
			}
			items = append(items, it)
		}
		return items, rows.Err()
	})
}

// GetCurrentPlayout implements TimelineCalculator using continuous looping (flood playout).
func (c *Calculator) GetCurrentPlayout(channelID int64, now time.Time) (*PlayoutItem, error) {
	items, err := c.load(channelID)
	if err != nil {
		return nil, err
	}
	return Compute(items, now)
}

// Compute finds the item on air at now for a looping playlist.
func Compute(items []Item, now time.Time) (*PlayoutItem, error) {
	var total float64
	for _, it := range items {
		if it.Duration > 0 {
			total += it.Duration
		}
	}
	if total <= 0 { // guard against divide-by-zero
		return nil, ErrEmptyPlaylist
	}
	t := float64(now.Unix()) + float64(now.Nanosecond())/1e9
	pos := math.Mod(t, total)
	if pos < 0 {
		pos += total
	}
	var acc float64
	var last *Item
	for i := range items {
		it := &items[i]
		if it.Duration <= 0 {
			continue
		}
		last = it
		if pos < acc+it.Duration {
			return &PlayoutItem{MediaID: it.MediaID, FilePath: it.FilePath, SeekSeconds: pos - acc, RemainingSec: acc + it.Duration - pos}, nil
		}
		acc += it.Duration
	}
	// Floating point edge: fall back to the end of the last item.
	return &PlayoutItem{MediaID: last.MediaID, FilePath: last.FilePath, SeekSeconds: last.Duration, RemainingSec: 0}, nil
}
