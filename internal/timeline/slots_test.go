package timeline

import (
	"testing"
	"time"

	"tv-stream/internal/db"
)

func parseUTC(s string) time.Time {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		panic(err)
	}
	return t.UTC()
}

func TestExpand_None(t *testing.T) {
	start := parseUTC("2026-06-01T10:00:00Z")
	slot := Slot{
		ID:          1,
		ChannelID:   1,
		MediaID:     10,
		FilePath:    "/media/movie.mp4",
		Filename:    "movie.mp4",
		MediaDur:    3600,
		Start:       start,
		DurationSec: 3600,
		Recurrence:  "none",
	}

	// 1. Inside window
	occs := Expand([]Slot{slot}, parseUTC("2026-06-01T09:00:00Z"), parseUTC("2026-06-01T12:00:00Z"), time.UTC)
	if len(occs) != 1 {
		t.Fatalf("expected 1 occurrence, got %d", len(occs))
	}
	if occs[0].Title != "movie" || occs[0].Start != start || occs[0].End != parseUTC("2026-06-01T11:00:00Z") {
		t.Fatalf("unexpected occurrence: %+v", occs[0])
	}
	if occs[0].Recurring || occs[0].Truncated || occs[0].Short {
		t.Fatalf("unexpected flags: %+v", occs[0])
	}

	// 2. Window before slot
	occsBefore := Expand([]Slot{slot}, parseUTC("2026-06-01T08:00:00Z"), parseUTC("2026-06-01T10:00:00Z"), time.UTC)
	if len(occsBefore) != 0 {
		t.Fatalf("expected 0 occurrences before window, got %d", len(occsBefore))
	}

	// 3. Window after slot
	occsAfter := Expand([]Slot{slot}, parseUTC("2026-06-01T11:00:00Z"), parseUTC("2026-06-01T12:00:00Z"), time.UTC)
	if len(occsAfter) != 0 {
		t.Fatalf("expected 0 occurrences after window, got %d", len(occsAfter))
	}
}

func TestExpand_DailyAndWeekly(t *testing.T) {
	start := parseUTC("2026-06-01T10:00:00Z")
	until := parseUTC("2026-06-04T10:00:00Z") // 3 occurrences: June 1, 2, 3
	dailySlot := Slot{
		ID:          1,
		ChannelID:   1,
		MediaID:     10,
		Filename:    "news.mp4",
		MediaDur:    1800,
		Start:       start,
		DurationSec: 1800,
		Recurrence:  "daily",
		Until:       &until,
	}

	from := parseUTC("2026-06-01T00:00:00Z")
	to := parseUTC("2026-06-10T00:00:00Z")
	occs := Expand([]Slot{dailySlot}, from, to, time.UTC)
	if len(occs) != 3 {
		t.Fatalf("expected 3 daily occurrences, got %d", len(occs))
	}
	for i, occ := range occs {
		expectedStart := start.AddDate(0, 0, i)
		if !occ.Start.Equal(expectedStart) {
			t.Errorf("occ[%d] start = %v, want %v", i, occ.Start, expectedStart)
		}
		if !occ.Recurring {
			t.Errorf("occ[%d] expected recurring=true", i)
		}
	}

	// Weekly test
	weeklySlot := Slot{
		ID:          2,
		ChannelID:   1,
		MediaID:     20,
		Filename:    "sunday_show.mp4",
		MediaDur:    3600,
		Start:       parseUTC("2026-06-07T14:00:00Z"), // Sunday
		DurationSec: 3600,
		Recurrence:  "weekly",
	}
	weeklyOccs := Expand([]Slot{weeklySlot}, parseUTC("2026-06-01T00:00:00Z"), parseUTC("2026-06-29T00:00:00Z"), time.UTC)
	// Sundays: June 7, June 14, June 21, June 28 -> 4 occurrences
	if len(weeklyOccs) != 4 {
		t.Fatalf("expected 4 weekly occurrences, got %d", len(weeklyOccs))
	}
	for i, occ := range weeklyOccs {
		expectedStart := parseUTC("2026-06-07T14:00:00Z").AddDate(0, 0, i*7)
		if !occ.Start.Equal(expectedStart) {
			t.Errorf("weekly occ[%d] start = %v, want %v", i, occ.Start, expectedStart)
		}
	}
}

func TestExpand_DST_AmericaNewYork(t *testing.T) {
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		t.Fatalf("load location: %v", err)
	}

	// 1. Spring forward: 2026-03-08.
	// Slot starts at 10:00 AM NY time on 2026-03-06 (EST, UTC-5)
	startNY := time.Date(2026, 3, 6, 10, 0, 0, 0, loc)
	slotSpring := Slot{
		ID:          1,
		ChannelID:   1,
		MediaID:     1,
		Filename:    "morning.mp4",
		MediaDur:    3600,
		Start:       startNY.UTC(),
		DurationSec: 3600,
		Recurrence:  "daily",
	}

	from := time.Date(2026, 3, 6, 0, 0, 0, 0, loc).UTC()
	to := time.Date(2026, 3, 11, 0, 0, 0, 0, loc).UTC()
	occs := Expand([]Slot{slotSpring}, from, to, loc)
	if len(occs) != 5 {
		t.Fatalf("expected 5 occurrences across spring DST, got %d", len(occs))
	}
	for i, occ := range occs {
		inNY := occ.Start.In(loc)
		if inNY.Hour() != 10 || inNY.Minute() != 0 {
			t.Errorf("occ[%d] local time in NY = %s, want 10:00", i, inNY.Format("15:04"))
		}
	}
	// March 6 (EST): 10:00 AM NY = 15:00 UTC
	if occs[0].Start.Hour() != 15 {
		t.Errorf("March 6 UTC hour = %d, want 15", occs[0].Start.Hour())
	}
	// March 9 (EDT): 10:00 AM NY = 14:00 UTC
	if occs[3].Start.Hour() != 14 {
		t.Errorf("March 9 UTC hour = %d, want 14", occs[3].Start.Hour())
	}

	// 2. Fall back: 2026-11-01.
	startFall := time.Date(2026, 10, 30, 10, 0, 0, 0, loc)
	slotFall := Slot{
		ID:          2,
		ChannelID:   1,
		MediaID:     2,
		Filename:    "morning.mp4",
		MediaDur:    3600,
		Start:       startFall.UTC(),
		DurationSec: 3600,
		Recurrence:  "daily",
	}
	fromFall := time.Date(2026, 10, 30, 0, 0, 0, 0, loc).UTC()
	toFall := time.Date(2026, 11, 4, 0, 0, 0, 0, loc).UTC()
	occsFall := Expand([]Slot{slotFall}, fromFall, toFall, loc)
	if len(occsFall) != 5 {
		t.Fatalf("expected 5 occurrences across fall DST, got %d", len(occsFall))
	}
	for i, occ := range occsFall {
		inNY := occ.Start.In(loc)
		if inNY.Hour() != 10 || inNY.Minute() != 0 {
			t.Errorf("fall occ[%d] local time in NY = %s, want 10:00", i, inNY.Format("15:04"))
		}
	}
	// Oct 30 (EDT): 10:00 AM NY = 14:00 UTC
	if occsFall[0].Start.Hour() != 14 {
		t.Errorf("Oct 30 UTC hour = %d, want 14", occsFall[0].Start.Hour())
	}
	// Nov 2 (EST): 10:00 AM NY = 15:00 UTC
	if occsFall[3].Start.Hour() != 15 {
		t.Errorf("Nov 2 UTC hour = %d, want 15", occsFall[3].Start.Hour())
	}
}

func TestExpand_AsiaJakarta(t *testing.T) {
	loc, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		t.Fatalf("load location: %v", err)
	}

	start := time.Date(2026, 6, 1, 19, 0, 0, 0, loc)
	slot := Slot{
		ID:          1,
		ChannelID:   1,
		MediaID:     10,
		Filename:    "warta.mp4",
		MediaDur:    1800,
		Start:       start.UTC(),
		DurationSec: 1800,
		Recurrence:  "daily",
	}

	from := time.Date(2026, 6, 1, 0, 0, 0, 0, loc).UTC()
	to := time.Date(2026, 6, 6, 0, 0, 0, 0, loc).UTC()
	occs := Expand([]Slot{slot}, from, to, loc)
	if len(occs) != 5 {
		t.Fatalf("expected 5 occurrences, got %d", len(occs))
	}
	for i, occ := range occs {
		inJKT := occ.Start.In(loc)
		if inJKT.Hour() != 19 || inJKT.Minute() != 0 {
			t.Errorf("occ[%d] = %s, want 19:00", i, inJKT.Format("15:04"))
		}
		// UTC should always be 12:00
		if occ.Start.Hour() != 12 {
			t.Errorf("occ[%d] UTC hour = %d, want 12", i, occ.Start.Hour())
		}
	}
}

func TestProgrammesBetween(t *testing.T) {
	occs := []Occurrence{
		{
			SlotID:   1,
			MediaID:  10,
			Title:    "show1",
			Start:    parseUTC("2026-06-01T10:00:00Z"),
			End:      parseUTC("2026-06-01T11:00:00Z"),
			MediaDur: 2400, // Short: 40 min media in 60 min slot -> 20 min gap inside slot
			Short:    true,
		},
		{
			SlotID:    2,
			MediaID:   20,
			Title:     "show2",
			Start:     parseUTC("2026-06-01T11:30:00Z"), // gap between 11:00 and 11:30
			End:       parseUTC("2026-06-01T12:00:00Z"),
			MediaDur:  2400, // Truncated: 40 min media in 30 min slot -> plays 30 min
			Truncated: true,
		},
	}

	from := parseUTC("2026-06-01T09:30:00Z")
	to := parseUTC("2026-06-01T12:30:00Z")

	items := ProgrammesBetween(occs, from, to)

	// Expected items:
	// 1. Slate 09:30 - 10:00 (30 min)
	// 2. Programme show1 10:00 - 10:40 (40 min)
	// 3. Merged Slate 10:40 - 11:30 (50 min) [20 min from short slot + 30 min before next slot]
	// 4. Programme show2 11:30 - 12:00 (30 min) [truncated at slot end]
	// 5. Slate 12:00 - 12:30 (30 min)
	if len(items) != 5 {
		t.Fatalf("expected 5 items, got %d", len(items))
	}

	if items[0].Kind != "slate" || items[0].StartAt != from || items[0].EndAt != parseUTC("2026-06-01T10:00:00Z") {
		t.Errorf("item 0 slate mismatch: %+v", items[0])
	}
	if items[1].Kind != "programme" || items[1].MediaID != 10 || items[1].StartAt != parseUTC("2026-06-01T10:00:00Z") || items[1].EndAt != parseUTC("2026-06-01T10:40:00Z") {
		t.Errorf("item 1 show1 mismatch: %+v", items[1])
	}
	if items[2].Kind != "slate" || items[2].StartAt != parseUTC("2026-06-01T10:40:00Z") || items[2].EndAt != parseUTC("2026-06-01T11:30:00Z") {
		t.Errorf("item 2 merged slate mismatch: %+v", items[2])
	}
	if items[3].Kind != "programme" || items[3].MediaID != 20 || items[3].StartAt != parseUTC("2026-06-01T11:30:00Z") || items[3].EndAt != parseUTC("2026-06-01T12:00:00Z") {
		t.Errorf("item 3 show2 mismatch: %+v", items[3])
	}
	if items[4].Kind != "slate" || items[4].StartAt != parseUTC("2026-06-01T12:00:00Z") || items[4].EndAt != to {
		t.Errorf("item 4 trailing slate mismatch: %+v", items[4])
	}

	// Test clipping
	clipped := ProgrammesBetween(occs, parseUTC("2026-06-01T10:15:00Z"), parseUTC("2026-06-01T11:45:00Z"))
	if len(clipped) != 3 {
		t.Fatalf("expected 3 clipped items, got %d", len(clipped))
	}
	// show1 clipped start at 10:15 to 10:40
	if clipped[0].StartAt != parseUTC("2026-06-01T10:15:00Z") || clipped[0].EndAt != parseUTC("2026-06-01T10:40:00Z") || clipped[0].DurationSec != 1500 {
		t.Errorf("clipped[0] mismatch: %+v", clipped[0])
	}
	// slate 10:40 to 11:30
	if clipped[1].StartAt != parseUTC("2026-06-01T10:40:00Z") || clipped[1].EndAt != parseUTC("2026-06-01T11:30:00Z") {
		t.Errorf("clipped[1] mismatch: %+v", clipped[1])
	}
	// show2 clipped end at 11:45
	if clipped[2].StartAt != parseUTC("2026-06-01T11:30:00Z") || clipped[2].EndAt != parseUTC("2026-06-01T11:45:00Z") || clipped[2].DurationSec != 900 {
		t.Errorf("clipped[2] mismatch: %+v", clipped[2])
	}
}

func TestScheduledGetCurrentPlayout(t *testing.T) {
	start1 := parseUTC("2026-06-01T10:00:00Z")
	slot1 := Slot{
		ID:          1,
		ChannelID:   1,
		MediaID:     10,
		FilePath:    "/media/show1.mp4",
		Filename:    "show1.mp4",
		MediaDur:    1800, // 30 min media in 60 min slot -> short
		Start:       start1,
		DurationSec: 3600,
		Recurrence:  "none",
	}

	start2 := parseUTC("2026-06-01T12:00:00Z")
	slot2 := Slot{
		ID:          2,
		ChannelID:   1,
		MediaID:     20,
		FilePath:    "/media/show2.mp4",
		Filename:    "show2.mp4",
		MediaDur:    7200, // 120 min media in 60 min slot -> truncated
		Start:       start2,
		DurationSec: 3600,
		Recurrence:  "none",
	}

	calc := NewCalculator(nil).WithSchedule(
		func(channelID int64) ([]Slot, error) {
			return []Slot{slot1, slot2}, nil
		},
		func(channelID int64) (string, error) {
			return "scheduled", nil
		},
		time.UTC,
	)

	// 1. Before first slot (09:30) -> Gap with NextStart = 10:00
	t.Run("before first slot", func(t *testing.T) {
		p, err := calc.GetCurrentPlayout(1, parseUTC("2026-06-01T09:30:00Z"))
		if err != nil {
			t.Fatal(err)
		}
		if !p.Gap || p.NextStart != start1 || p.RemainingSec != 1800 {
			t.Fatalf("expected gap with next start 10:00, got %+v", p)
		}
	})

	// 2. Inside slot 1 during media playout (10:10) -> Seek 600s, Remaining 1200s, StopAfter 3000s
	t.Run("inside slot 1 media", func(t *testing.T) {
		p, err := calc.GetCurrentPlayout(1, parseUTC("2026-06-01T10:10:00Z"))
		if err != nil {
			t.Fatal(err)
		}
		if p.Gap || p.MediaID != 10 || p.SeekSeconds != 600 || p.RemainingSec != 1200 || p.StopAfterSec != 3000 {
			t.Fatalf("unexpected playout item: %+v", p)
		}
	})

	// 3. Inside slot 1 after media end (10:40) -> Gap with NextStart = start2 (12:00)
	t.Run("inside slot 1 after media end", func(t *testing.T) {
		p, err := calc.GetCurrentPlayout(1, parseUTC("2026-06-01T10:40:00Z"))
		if err != nil {
			t.Fatal(err)
		}
		if !p.Gap || p.NextStart != start2 {
			t.Fatalf("expected gap with nextStart 12:00, got %+v", p)
		}
	})

	// 4. Inside slot 2 truncated (12:30) -> RemainingSec = min(slot end, media end) - now = 1800, StopAfterSec = 1800
	t.Run("inside slot 2 truncated", func(t *testing.T) {
		p, err := calc.GetCurrentPlayout(1, parseUTC("2026-06-01T12:30:00Z"))
		if err != nil {
			t.Fatal(err)
		}
		if p.Gap || p.MediaID != 20 || p.SeekSeconds != 1800 || p.RemainingSec != 1800 || p.StopAfterSec != 1800 {
			t.Fatalf("unexpected playout item: %+v", p)
		}
	})

	// 5. After last slot (14:00) -> Gap with zero NextStart
	t.Run("after last slot", func(t *testing.T) {
		p, err := calc.GetCurrentPlayout(1, parseUTC("2026-06-01T14:00:00Z"))
		if err != nil {
			t.Fatal(err)
		}
		if !p.Gap || !p.NextStart.IsZero() {
			t.Fatalf("expected gap with zero NextStart, got %+v", p)
		}
	})

	// 6. Scheduled channel with 0 slots never returns ErrEmptyPlaylist
	t.Run("empty scheduled channel", func(t *testing.T) {
		emptyCalc := NewCalculator(nil).WithSchedule(
			func(channelID int64) ([]Slot, error) { return []Slot{}, nil },
			func(channelID int64) (string, error) { return "scheduled", nil },
			time.UTC,
		)
		p, err := emptyCalc.GetCurrentPlayout(1, parseUTC("2026-06-01T10:00:00Z"))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !p.Gap || !p.NextStart.IsZero() {
			t.Fatalf("expected gap with zero NextStart, got %+v", p)
		}
	})
}

func TestScheduledUpcoming(t *testing.T) {
	start1 := parseUTC("2026-06-01T10:00:00Z")
	slot1 := Slot{
		ID:          1,
		ChannelID:   1,
		MediaID:     10,
		FilePath:    "/media/show1.mp4",
		Filename:    "show1.mp4",
		MediaDur:    1800, // 30 min media in 60 min slot
		Start:       start1,
		DurationSec: 3600,
		Recurrence:  "none",
	}

	calc := NewCalculator(nil).WithSchedule(
		func(channelID int64) ([]Slot, error) {
			return []Slot{slot1}, nil
		},
		func(channelID int64) (string, error) {
			return "scheduled", nil
		},
		time.UTC,
	)

	// Upcoming during show1 playout (10:15)
	items, err := calc.Upcoming(1, parseUTC("2026-06-01T10:15:00Z"), 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 {
		t.Fatalf("expected 2 items (programme + trailing slate), got %d", len(items))
	}
	if !items[0].IsCurrent || items[0].MediaID != 10 || items[0].SeekSeconds != 900 || items[0].StartOffset != -900 {
		t.Errorf("item 0 mismatch: %+v", items[0])
	}
	if items[1].Kind != "slate" || items[1].IsCurrent || items[1].StartOffset != 900 {
		t.Errorf("item 1 mismatch: %+v", items[1])
	}
}

func TestDBCalculatorScheduledMode(t *testing.T) {
	conn, err := db.InitDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	if _, err := conn.Exec(`INSERT INTO channels (id, number, name, mode) VALUES (1, 1, 'Sched Channel', 'scheduled')`); err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`INSERT INTO media_files (id, path, filename, duration_sec) VALUES (10, '/media/a.mp4', 'a.mp4', 3600)`); err != nil {
		t.Fatal(err)
	}
	startAt := parseUTC("2026-06-01T10:00:00Z").Unix()
	if _, err := conn.Exec(`INSERT INTO schedule_slots (id, channel_id, media_id, start_at, duration_sec, recurrence) VALUES (1, 1, 10, ?, 3600, 'none')`, startAt); err != nil {
		t.Fatal(err)
	}

	calc := NewDBCalculator(conn, time.UTC)
	p, err := calc.GetCurrentPlayout(1, parseUTC("2026-06-01T10:15:00Z"))
	if err != nil {
		t.Fatal(err)
	}
	if p.MediaID != 10 || p.SeekSeconds != 900 || p.RemainingSec != 2700 || p.StopAfterSec != 2700 {
		t.Fatalf("playout mismatch: %+v", p)
	}
}
