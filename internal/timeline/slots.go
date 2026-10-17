package timeline

import (
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// Slot defines a scheduled media broadcast slot.
type Slot struct {
	ID, ChannelID, MediaID int64
	FilePath, Filename     string
	MediaDur               float64   // media duration seconds
	Start                  time.Time // first occurrence (UTC instant)
	DurationSec            float64   // slot length
	Recurrence             string    // "none","daily","weekly"
	Until                  *time.Time
}

// Occurrence represents a single broadcast event calculated from a slot.
type Occurrence struct {
	SlotID, MediaID             int64
	FilePath, Filename, Title   string    // Title = filename without extension
	Start, End                  time.Time // End = Start + slot length
	MediaDur                    float64
	Truncated, Short, Recurring bool // Truncated: MediaDur > slot length; Short: MediaDur < slot length
}

// Expand expands recurring and non-recurring slots into individual occurrences
// overlapping [from, to), sorted by Start then SlotID.
func Expand(slots []Slot, from, to time.Time, loc *time.Location) []Occurrence {
	if !from.Before(to) {
		return []Occurrence{}
	}
	if loc == nil {
		loc = time.UTC
	}

	var result []Occurrence

	for _, slot := range slots {
		if slot.DurationSec <= 0 {
			continue
		}

		base := slot.Filename
		if base == "" && slot.FilePath != "" {
			base = filepath.Base(slot.FilePath)
		}
		title := strings.TrimSuffix(base, filepath.Ext(base))

		dur := slot.DurationSec
		mediaDur := slot.MediaDur
		slotDur := time.Duration(dur * float64(time.Second))
		truncated := mediaDur > dur
		short := mediaDur < dur

		switch slot.Recurrence {
		case "daily", "weekly":
			stepDays := 1
			if slot.Recurrence == "weekly" {
				stepDays = 7
			}

			startUTC := slot.Start.UTC()
			if !startUTC.Before(to) {
				// Slot begins after the requested window.
				continue
			}

			startLoc := startUTC.In(loc)
			baseYear, baseMonth, baseDay := startLoc.Date()
			hour, min, sec := startLoc.Clock()
			nsec := startLoc.Nanosecond()

			// Fast-forward to the first potential occurrence near or before 'from'.
			var k int
			if from.After(startUTC) {
				approxDays := int(from.Sub(startUTC).Hours() / 24)
				k = (approxDays / stepDays) - 2
				if k < 0 {
					k = 0
				}
			}

			for {
				kDays := k * stepDays
				occStart := time.Date(baseYear, baseMonth, baseDay+kDays, hour, min, sec, nsec, loc).UTC()

				// Stop if we have reached or passed 'to'
				if !occStart.Before(to) {
					break
				}

				// Stop if Until is set and occurrence start >= Until
				if slot.Until != nil && !occStart.Before(slot.Until.UTC()) {
					break
				}

				occEnd := occStart.Add(slotDur)

				// Occurrence must overlap [from, to) -> occStart < to && occEnd > from
				if occEnd.After(from) {
					result = append(result, Occurrence{
						SlotID:    slot.ID,
						MediaID:   slot.MediaID,
						FilePath:  slot.FilePath,
						Filename:  base,
						Title:     title,
						Start:     occStart,
						End:       occEnd,
						MediaDur:  mediaDur,
						Truncated: truncated,
						Short:     short,
						Recurring: true,
					})
				}

				k++
			}

		default: // "none" or unspecified
			occStart := slot.Start.UTC()
			if slot.Until != nil && !occStart.Before(slot.Until.UTC()) {
				continue
			}
			occEnd := occStart.Add(slotDur)
			if occStart.Before(to) && occEnd.After(from) {
				result = append(result, Occurrence{
					SlotID:    slot.ID,
					MediaID:   slot.MediaID,
					FilePath:  slot.FilePath,
					Filename:  base,
					Title:     title,
					Start:     occStart,
					End:       occEnd,
					MediaDur:  mediaDur,
					Truncated: truncated,
					Short:     short,
					Recurring: false,
				})
			}
		}
	}

	sort.Slice(result, func(i, j int) bool {
		if result[i].Start.Equal(result[j].Start) {
			return result[i].SlotID < result[j].SlotID
		}
		return result[i].Start.Before(result[j].Start)
	})

	return result
}

// ProgrammesBetween fills gaps between occurrences with slate items and clips the entire sequence to [from, to].
func ProgrammesBetween(occs []Occurrence, from, to time.Time) []UpcomingItem {
	if !from.Before(to) {
		return []UpcomingItem{}
	}

	// Filter and clip occurrences overlapping [from, to)
	type segment struct {
		isProg bool
		occ    Occurrence
		start  time.Time
		end    time.Time
	}

	var segs []segment
	cursor := from

	for _, occ := range occs {
		progStart := occ.Start
		mediaDur := occ.MediaDur
		slotDur := occ.End.Sub(occ.Start).Seconds()
		progDur := mediaDur
		if progDur > slotDur {
			progDur = slotDur // Truncated
		}
		progEnd := progStart.Add(time.Duration(progDur * float64(time.Second)))

		// If this programme completely ended before cursor, skip it
		if !progEnd.After(cursor) {
			continue
		}

		// If there is a gap before programme start (clipped to cursor)
		effectiveProgStart := progStart
		if effectiveProgStart.Before(cursor) {
			effectiveProgStart = cursor
		}

		if cursor.Before(effectiveProgStart) {
			segs = append(segs, segment{
				isProg: false,
				start:  cursor,
				end:    effectiveProgStart,
			})
			cursor = effectiveProgStart
		}

		// Clip programme end to 'to'
		effectiveProgEnd := progEnd
		if effectiveProgEnd.After(to) {
			effectiveProgEnd = to
		}

		if cursor.Before(effectiveProgEnd) {
			segs = append(segs, segment{
				isProg: true,
				occ:    occ,
				start:  cursor,
				end:    effectiveProgEnd,
			})
			cursor = effectiveProgEnd
		}

		if !cursor.Before(to) {
			break
		}
	}

	// Trailing gap until 'to'
	if cursor.Before(to) {
		segs = append(segs, segment{
			isProg: false,
			start:  cursor,
			end:    to,
		})
	}

	items := make([]UpcomingItem, 0, len(segs))
	for _, s := range segs {
		durSec := s.end.Sub(s.start).Seconds()
		if durSec <= 0 {
			continue
		}
		if s.isProg {
			seekSec := s.start.Sub(s.occ.Start).Seconds()
			if seekSec < 0 {
				seekSec = 0
			}
			items = append(items, UpcomingItem{
				Kind:        "programme",
				MediaID:     s.occ.MediaID,
				FilePath:    s.occ.FilePath,
				Filename:    s.occ.Filename,
				Title:       s.occ.Title,
				DurationSec: durSec,
				SeekSeconds: seekSec,
				StartAt:     s.start,
				EndAt:       s.end,
			})
		} else {
			items = append(items, UpcomingItem{
				Kind:        "slate",
				MediaID:     0,
				Title:       "Siaran Segera Kembali",
				DurationSec: durSec,
				StartAt:     s.start,
				EndAt:       s.end,
			})
		}
	}

	return items
}
