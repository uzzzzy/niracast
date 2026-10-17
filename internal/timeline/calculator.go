// Package timeline computes what a channel is playing at a given instant.
package timeline

import (
	"database/sql"
	"errors"
	"fmt"
	"math"
	"path/filepath"
	"strings"
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

// UpcomingItem represents a scheduled item in the upcoming playout sequence.
type UpcomingItem struct {
	MediaID     int64     `json:"media_id"`
	FilePath    string    `json:"file_path,omitempty"`
	Filename    string    `json:"filename,omitempty"`
	Title       string    `json:"title"`
	DurationSec float64   `json:"duration_sec"`
	SeekSeconds float64   `json:"seek_seconds,omitempty"`
	StartOffset float64   `json:"start_offset,omitempty"`
	StartAt     time.Time `json:"start_at"`
	EndAt       time.Time `json:"end_at"`
	IsCurrent   bool      `json:"is_current"`
}

// Duration returns DurationSec for compatibility.
func (u UpcomingItem) Duration() float64 { return u.DurationSec }

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

// Upcoming computes the upcoming count items starting from the item on air at logicalNow.
func (c *Calculator) Upcoming(channelID int64, logicalNow time.Time, count int) ([]UpcomingItem, error) {
	items, err := c.load(channelID)
	if err != nil {
		return nil, err
	}
	return ComputeUpcoming(items, logicalNow, count)
}

func cyclePosition(now time.Time, total float64) float64 {
	t := float64(now.Unix()) + float64(now.Nanosecond())/1e9
	pos := math.Mod(t, total)
	if pos < 0 {
		pos += total
	}
	return pos
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
	pos := cyclePosition(now, total)
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

// ComputeUpcoming resolves the next count items on air starting from logicalNow.
func ComputeUpcoming(items []Item, logicalNow time.Time, count int) ([]UpcomingItem, error) {
	var playable []Item
	var total float64
	for _, it := range items {
		if it.Duration > 0 {
			playable = append(playable, it)
			total += it.Duration
		}
	}
	if total <= 0 || len(playable) == 0 {
		return nil, ErrEmptyPlaylist
	}
	if count <= 0 {
		return []UpcomingItem{}, nil
	}

	pos := cyclePosition(logicalNow, total)

	var curIdx int = -1
	var seek float64
	var acc float64
	for i, it := range playable {
		if pos < acc+it.Duration {
			curIdx = i
			seek = pos - acc
			break
		}
		acc += it.Duration
	}
	if curIdx == -1 {
		curIdx = len(playable) - 1
		seek = playable[curIdx].Duration
	}

	upcoming := make([]UpcomingItem, 0, count)
	curTime := logicalNow.Add(-time.Duration(seek * float64(time.Second)))
	startOffset := -seek

	for k := 0; k < count; k++ {
		idx := (curIdx + k) % len(playable)
		it := playable[idx]

		base := filepath.Base(it.FilePath)
		ext := filepath.Ext(base)
		title := strings.TrimSuffix(base, ext)

		dur := it.Duration
		endTime := curTime.Add(time.Duration(dur * float64(time.Second)))

		var itemSeek float64
		isCur := (k == 0)
		if isCur {
			itemSeek = seek
		}

		upcoming = append(upcoming, UpcomingItem{
			MediaID:     it.MediaID,
			FilePath:    it.FilePath,
			Filename:    base,
			Title:       title,
			DurationSec: dur,
			SeekSeconds: itemSeek,
			StartOffset: startOffset,
			StartAt:     curTime,
			EndAt:       endTime,
			IsCurrent:   isCur,
		})

		startOffset += dur
		curTime = endTime
	}

	return upcoming, nil
}
