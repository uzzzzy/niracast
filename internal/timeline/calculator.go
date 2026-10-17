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
	StopAfterSec float64   // seconds until slot end; only set in scheduled mode
	Gap          bool      // true if currently in a gap/slate
	NextStart    time.Time // start of the next occurrence, zero if none within 14 days; set when Gap
}

// UpcomingItem represents a scheduled item in the upcoming playout sequence.
type UpcomingItem struct {
	Kind        string    `json:"kind"` // "programme" for media items; "slate" for gaps
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

// SlotLoader returns a channel's configured schedule slots.
type SlotLoader func(channelID int64) ([]Slot, error)

// ModeLookup returns the mode ("loop" or "scheduled") of a channel.
type ModeLookup func(channelID int64) (string, error)

// Calculator implements TimelineCalculator over a playlist Loader or schedule slots.
type Calculator struct {
	load       Loader
	slotLoader SlotLoader
	modeLookup ModeLookup
	loc        *time.Location
}

// NewCalculator builds a Calculator from a custom Loader.
func NewCalculator(load Loader) *Calculator {
	return &Calculator{load: load, loc: time.UTC}
}

// WithSchedule equips a Calculator with schedule slot loading and channel mode lookup.
func (c *Calculator) WithSchedule(slots SlotLoader, mode ModeLookup, loc *time.Location) *Calculator {
	c.slotLoader = slots
	c.modeLookup = mode
	if loc == nil {
		loc = time.UTC
	}
	c.loc = loc
	return c
}

// NewDBCalculator builds a Calculator reading playlists, slots, and modes from SQLite.
func NewDBCalculator(db *sql.DB, loc ...*time.Location) *Calculator {
	var targetLoc *time.Location = time.UTC
	if len(loc) > 0 && loc[0] != nil {
		targetLoc = loc[0]
	}

	load := func(channelID int64) ([]Item, error) {
		rows, err := db.Query(`SELECT m.id, m.path, COALESCE(m.duration_sec, 0)
			FROM playlist_items p JOIN media_files m ON m.id = p.media_id
			WHERE p.channel_id = ? ORDER BY p.position_order, p.id`, channelID)
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
	}

	slotLoader := func(channelID int64) ([]Slot, error) {
		rows, err := db.Query(`SELECT s.id, s.channel_id, s.media_id, m.path, m.filename, COALESCE(m.duration_sec, 0),
			s.start_at, s.duration_sec, s.recurrence, s.until_at
			FROM schedule_slots s JOIN media_files m ON m.id = s.media_id
			WHERE s.channel_id = ? ORDER BY s.start_at ASC, s.id ASC`, channelID)
		if err != nil {
			return nil, fmt.Errorf("query schedule slots: %w", err)
		}
		defer rows.Close()
		var slots []Slot
		for rows.Next() {
			var s Slot
			var startAt int64
			var untilAt sql.NullInt64
			if err := rows.Scan(&s.ID, &s.ChannelID, &s.MediaID, &s.FilePath, &s.Filename, &s.MediaDur,
				&startAt, &s.DurationSec, &s.Recurrence, &untilAt); err != nil {
				return nil, fmt.Errorf("scan schedule slot: %w", err)
			}
			s.Start = time.Unix(startAt, 0).UTC()
			if untilAt.Valid {
				u := time.Unix(untilAt.Int64, 0).UTC()
				s.Until = &u
			}
			slots = append(slots, s)
		}
		return slots, rows.Err()
	}

	modeLookup := func(channelID int64) (string, error) {
		var mode string
		err := db.QueryRow(`SELECT mode FROM channels WHERE id = ?`, channelID).Scan(&mode)
		if errors.Is(err, sql.ErrNoRows) {
			return "loop", nil
		}
		if err != nil {
			return "", fmt.Errorf("lookup channel mode: %w", err)
		}
		if mode == "" {
			mode = "loop"
		}
		return mode, nil
	}

	return NewCalculator(load).WithSchedule(slotLoader, modeLookup, targetLoc)
}

func (c *Calculator) getMode(channelID int64) (string, error) {
	if c.modeLookup == nil {
		return "loop", nil
	}
	m, err := c.modeLookup(channelID)
	if err != nil {
		return "", err
	}
	if m == "" {
		m = "loop"
	}
	return m, nil
}

// GetCurrentPlayout implements TimelineCalculator.
func (c *Calculator) GetCurrentPlayout(channelID int64, now time.Time) (*PlayoutItem, error) {
	mode, err := c.getMode(channelID)
	if err != nil {
		return nil, err
	}

	if mode == "scheduled" && c.slotLoader != nil {
		slots, err := c.slotLoader(channelID)
		if err != nil {
			return nil, err
		}

		loc := c.loc
		if loc == nil {
			loc = time.UTC
		}

		from := now.Add(-24 * time.Hour)
		to := now.Add(14 * 24 * time.Hour)
		occs := Expand(slots, from, to, loc)

		var curOcc *Occurrence
		for i := range occs {
			if !now.Before(occs[i].Start) && now.Before(occs[i].End) {
				curOcc = &occs[i]
				break
			}
		}

		findNextStart := func() time.Time {
			for i := range occs {
				if occs[i].Start.After(now) {
					return occs[i].Start
				}
			}
			return time.Time{}
		}

		if curOcc != nil {
			elapsed := now.Sub(curOcc.Start).Seconds()
			if elapsed >= curOcc.MediaDur {
				// Media ended earlier than slot duration (Short slot gap)
				nextStart := findNextStart()
				rem := 0.0
				if !nextStart.IsZero() {
					rem = nextStart.Sub(now).Seconds()
				}
				return &PlayoutItem{
					Gap:          true,
					NextStart:    nextStart,
					RemainingSec: rem,
					StopAfterSec: rem,
				}, nil
			}

			slotEnd := curOcc.End
			mediaEnd := curOcc.Start.Add(time.Duration(curOcc.MediaDur * float64(time.Second)))
			playoutEnd := mediaEnd
			if slotEnd.Before(playoutEnd) {
				playoutEnd = slotEnd
			}

			seekSec := elapsed
			remSec := playoutEnd.Sub(now).Seconds()
			stopSec := slotEnd.Sub(now).Seconds()

			return &PlayoutItem{
				MediaID:      curOcc.MediaID,
				FilePath:     curOcc.FilePath,
				SeekSeconds:  seekSec,
				RemainingSec: remSec,
				StopAfterSec: stopSec,
			}, nil
		}

		// Outside any occurrence -> Gap
		nextStart := findNextStart()
		rem := 0.0
		if !nextStart.IsZero() {
			rem = nextStart.Sub(now).Seconds()
		}
		return &PlayoutItem{
			Gap:          true,
			NextStart:    nextStart,
			RemainingSec: rem,
			StopAfterSec: rem,
		}, nil
	}

	// Loop mode
	if c.load == nil {
		return nil, ErrEmptyPlaylist
	}
	items, err := c.load(channelID)
	if err != nil {
		return nil, err
	}
	return Compute(items, now)
}

// Upcoming computes upcoming items starting from logicalNow.
func (c *Calculator) Upcoming(channelID int64, logicalNow time.Time, count int) ([]UpcomingItem, error) {
	if count <= 0 {
		return []UpcomingItem{}, nil
	}

	mode, err := c.getMode(channelID)
	if err != nil {
		return nil, err
	}

	if mode == "scheduled" && c.slotLoader != nil {
		slots, err := c.slotLoader(channelID)
		if err != nil {
			return nil, err
		}

		loc := c.loc
		if loc == nil {
			loc = time.UTC
		}

		horizon := logicalNow.Add(14 * 24 * time.Hour)
		occs := Expand(slots, logicalNow.Add(-24*time.Hour), horizon, loc)

		if len(occs) == 0 {
			// No occurrences in the 14-day window: return a single slate covering the horizon
			dur := horizon.Sub(logicalNow).Seconds()
			return []UpcomingItem{
				{
					Kind:        "slate",
					MediaID:     0,
					Title:       "Siaran Segera Kembali",
					DurationSec: dur,
					StartAt:     logicalNow,
					EndAt:       horizon,
					IsCurrent:   true,
				},
			}, nil
		}

		// Build unclipped sequence of programme and slate items
		var seq []UpcomingItem
		type segment struct {
			kind  string
			occ   *Occurrence
			start time.Time
			end   time.Time
		}

		var segs []segment
		var cursor time.Time

		// Check if first occurrence starts after logicalNow - 24h
		firstStart := occs[0].Start
		if firstStart.After(logicalNow) {
			cursor = logicalNow
		} else {
			cursor = firstStart
		}

		for i := range occs {
			occ := &occs[i]
			progStart := occ.Start
			progDur := occ.MediaDur
			slotDur := occ.End.Sub(occ.Start).Seconds()
			if progDur > slotDur {
				progDur = slotDur // Truncated
			}
			progEnd := progStart.Add(time.Duration(progDur * float64(time.Second)))

			if cursor.Before(progStart) {
				segs = append(segs, segment{
					kind:  "slate",
					start: cursor,
					end:   progStart,
				})
			}

			segs = append(segs, segment{
				kind:  "programme",
				occ:   occ,
				start: progStart,
				end:   progEnd,
			})
			cursor = progEnd
		}

		// Trailing gap until horizon
		if cursor.Before(horizon) {
			segs = append(segs, segment{
				kind:  "slate",
				start: cursor,
				end:   horizon,
			})
		}

		for _, s := range segs {
			durSec := s.end.Sub(s.start).Seconds()
			if durSec <= 0 {
				continue
			}
			if s.kind == "programme" {
				seq = append(seq, UpcomingItem{
					Kind:        "programme",
					MediaID:     s.occ.MediaID,
					FilePath:    s.occ.FilePath,
					Filename:    s.occ.Filename,
					Title:       s.occ.Title,
					DurationSec: durSec,
					StartAt:     s.start,
					EndAt:       s.end,
				})
			} else {
				seq = append(seq, UpcomingItem{
					Kind:        "slate",
					MediaID:     0,
					Title:       "Siaran Segera Kembali",
					DurationSec: durSec,
					StartAt:     s.start,
					EndAt:       s.end,
				})
			}
		}

		// Find the item on air at logicalNow
		curIdx := -1
		for i := range seq {
			if !logicalNow.Before(seq[i].StartAt) && logicalNow.Before(seq[i].EndAt) {
				curIdx = i
				break
			}
		}

		if curIdx == -1 {
			// If logicalNow is before the first item or after the last
			if len(seq) > 0 && logicalNow.Before(seq[0].StartAt) {
				curIdx = 0
			} else {
				curIdx = len(seq) - 1
			}
		}

		var result []UpcomingItem
		for i := curIdx; i < len(seq) && len(result) < count; i++ {
			it := seq[i]
			if i == curIdx {
				it.IsCurrent = true
				it.SeekSeconds = logicalNow.Sub(it.StartAt).Seconds()
				if it.SeekSeconds < 0 {
					it.SeekSeconds = 0
				}
				it.StartOffset = -it.SeekSeconds
			} else {
				it.IsCurrent = false
				it.SeekSeconds = 0
				it.StartOffset = it.StartAt.Sub(logicalNow).Seconds()
			}
			result = append(result, it)
		}

		return result, nil
	}

	// Loop mode
	if c.load == nil {
		return nil, ErrEmptyPlaylist
	}
	items, err := c.load(channelID)
	if err != nil {
		return nil, err
	}
	return ComputeUpcoming(items, logicalNow, count)
}

// Programmes returns the sequence of programmes and slates for channelID across [from, to).
func (c *Calculator) Programmes(channelID int64, from, to time.Time) ([]UpcomingItem, error) {
	if !from.Before(to) {
		return []UpcomingItem{}, nil
	}

	mode, err := c.getMode(channelID)
	if err != nil {
		return nil, err
	}

	if mode == "scheduled" && c.slotLoader != nil {
		slots, err := c.slotLoader(channelID)
		if err != nil {
			return nil, err
		}
		loc := c.loc
		if loc == nil {
			loc = time.UTC
		}
		occs := Expand(slots, from.Add(-24*time.Hour), to, loc)
		return ProgrammesBetween(occs, from, to), nil
	}

	// Loop mode
	if c.load == nil {
		return nil, ErrEmptyPlaylist
	}
	items, err := c.load(channelID)
	if err != nil {
		return nil, err
	}

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

	t := float64(from.Unix()) + float64(from.Nanosecond())/1e9
	pos := math.Mod(t, total)
	if pos < 0 {
		pos += total
	}
	cycleStart := from.Add(-time.Duration(pos * float64(time.Second)))

	var out []UpcomingItem
	for cs := cycleStart; cs.Before(to); cs = cs.Add(time.Duration(total * float64(time.Second))) {
		acc := 0.0
		for _, it := range playable {
			s := cs.Add(time.Duration(acc * float64(time.Second)))
			e := cs.Add(time.Duration((acc + it.Duration) * float64(time.Second)))
			acc += it.Duration
			if !e.After(from) {
				continue
			}
			if !s.Before(to) {
				break
			}
			base := filepath.Base(it.FilePath)
			title := strings.TrimSuffix(base, filepath.Ext(base))

			clippedStart := s
			if clippedStart.Before(from) {
				clippedStart = from
			}
			clippedEnd := e
			if clippedEnd.After(to) {
				clippedEnd = to
			}

			out = append(out, UpcomingItem{
				Kind:        "programme",
				MediaID:     it.MediaID,
				FilePath:    it.FilePath,
				Filename:    base,
				Title:       title,
				DurationSec: clippedEnd.Sub(clippedStart).Seconds(),
				SeekSeconds: clippedStart.Sub(s).Seconds(),
				StartAt:     clippedStart,
				EndAt:       clippedEnd,
			})
		}
	}

	return out, nil
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
			return &PlayoutItem{
				MediaID:      it.MediaID,
				FilePath:     it.FilePath,
				SeekSeconds:  pos - acc,
				RemainingSec: acc + it.Duration - pos,
			}, nil
		}
		acc += it.Duration
	}
	// Floating point edge: fall back to the end of the last item.
	return &PlayoutItem{
		MediaID:      last.MediaID,
		FilePath:     last.FilePath,
		SeekSeconds:  last.Duration,
		RemainingSec: 0,
	}, nil
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
			Kind:        "programme",
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
