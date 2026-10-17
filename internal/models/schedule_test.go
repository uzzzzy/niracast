package models

import (
	"database/sql"
	"errors"
	"testing"
	"time"

	"tv-stream/internal/db"
)

func parseTime(s string) time.Time {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		panic(err)
	}
	return t.UTC()
}

type scheduleTestCtx struct {
	db   *sql.DB
	chID int64
}

func setupScheduleTestDB(t *testing.T) (*scheduleTestCtx, func()) {
	conn, err := db.InitDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	ch, err := CreateChannel(conn, ChannelInput{Number: 1, Name: "Channel 1", Mode: "scheduled"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := conn.Exec(`INSERT INTO media_files (id, path, filename, duration_sec) VALUES
		(1, '/media/a.mp4', 'a.mp4', 1800),
		(2, '/media/b.mp4', 'b.mp4', 3600),
		(3, '/media/zero.mp4', 'zero.mp4', 0)`); err != nil {
		t.Fatal(err)
	}
	return &scheduleTestCtx{db: conn, chID: ch.ID}, func() { conn.Close() }
}

func TestSlotValidation(t *testing.T) {
	ctx, cleanup := setupScheduleTestDB(t)
	defer cleanup()

	// 1. Unknown media returns MediaMissingError
	_, err := CreateSlot(ctx.db, ctx.chID, SlotInput{
		MediaID: 999,
		StartAt: parseTime("2026-06-01T10:00:00Z"),
	}, time.UTC)
	var mmErr *MediaMissingError
	if !errors.As(err, &mmErr) {
		t.Errorf("expected MediaMissingError, got %v", err)
	}

	// 2. Media with duration <= 0 returns ErrInvalidSlot
	_, err = CreateSlot(ctx.db, ctx.chID, SlotInput{
		MediaID: 3,
		StartAt: parseTime("2026-06-01T10:00:00Z"),
	}, time.UTC)
	if !errors.Is(err, ErrInvalidSlot) {
		t.Errorf("expected ErrInvalidSlot for 0 duration media, got %v", err)
	}

	// 3. Negative duration or > 86400 returns ErrInvalidSlot
	_, err = CreateSlot(ctx.db, ctx.chID, SlotInput{
		MediaID:     1,
		StartAt:     parseTime("2026-06-01T10:00:00Z"),
		DurationSec: -10,
	}, time.UTC)
	if !errors.Is(err, ErrInvalidSlot) {
		t.Errorf("expected ErrInvalidSlot for negative duration, got %v", err)
	}

	_, err = CreateSlot(ctx.db, ctx.chID, SlotInput{
		MediaID:     1,
		StartAt:     parseTime("2026-06-01T10:00:00Z"),
		DurationSec: 90000,
	}, time.UTC)
	if !errors.Is(err, ErrInvalidSlot) {
		t.Errorf("expected ErrInvalidSlot for duration > 86400, got %v", err)
	}

	// 4. Bad recurrence returns ErrInvalidSlot
	_, err = CreateSlot(ctx.db, ctx.chID, SlotInput{
		MediaID:    1,
		StartAt:    parseTime("2026-06-01T10:00:00Z"),
		Recurrence: "monthly",
	}, time.UTC)
	if !errors.Is(err, ErrInvalidSlot) {
		t.Errorf("expected ErrInvalidSlot for invalid recurrence, got %v", err)
	}

	// 5. Until <= StartAt returns ErrInvalidSlot
	until := parseTime("2026-06-01T10:00:00Z")
	_, err = CreateSlot(ctx.db, ctx.chID, SlotInput{
		MediaID: 1,
		StartAt: parseTime("2026-06-01T10:00:00Z"),
		Until:   &until,
	}, time.UTC)
	if !errors.Is(err, ErrInvalidSlot) {
		t.Errorf("expected ErrInvalidSlot when until == start, got %v", err)
	}
}

func TestSlotCRUDAndDefaults(t *testing.T) {
	ctx, cleanup := setupScheduleTestDB(t)
	defer cleanup()

	// 1. Duration defaults to media duration (1800 for media 1)
	start1 := parseTime("2026-06-01T10:00:00Z")
	s1, err := CreateSlot(ctx.db, ctx.chID, SlotInput{
		MediaID: 1,
		StartAt: start1,
	}, time.UTC)
	if err != nil {
		t.Fatalf("create slot: %v", err)
	}
	if s1.DurationSec != 1800 {
		t.Errorf("expected default duration 1800, got %f", s1.DurationSec)
	}
	if s1.Title != "a" || s1.Filename != "a.mp4" {
		t.Errorf("title/filename mismatch: %+v", s1)
	}
	if s1.Recurrence != "none" {
		t.Errorf("expected recurrence 'none', got %q", s1.Recurrence)
	}

	// 2. GetSlot
	got, err := GetSlot(ctx.db, ctx.chID, s1.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != s1.ID || got.StartAt != start1 {
		t.Errorf("get slot mismatch: %+v", got)
	}

	// 3. ListSlots
	list, err := ListSlots(ctx.db, ctx.chID)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].ID != s1.ID {
		t.Fatalf("list mismatch: %+v", list)
	}

	// 4. Update slot (change duration and recurrence)
	up, err := UpdateSlot(ctx.db, ctx.chID, s1.ID, SlotInput{
		MediaID:     1,
		StartAt:     start1,
		DurationSec: 2400,
		Recurrence:  "daily",
	}, time.UTC)
	if err != nil {
		t.Fatalf("update slot: %v", err)
	}
	if up.DurationSec != 2400 || up.Recurrence != "daily" {
		t.Errorf("updated fields mismatch: %+v", up)
	}

	// 5. DeleteSlot
	if err := DeleteSlot(ctx.db, ctx.chID, s1.ID); err != nil {
		t.Fatalf("delete slot: %v", err)
	}

	// 6. Verify deleted
	_, err = GetSlot(ctx.db, ctx.chID, s1.ID)
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound after delete, got %v", err)
	}
}

func TestSlotConflictAndTouching(t *testing.T) {
	ctx, cleanup := setupScheduleTestDB(t)
	defer cleanup()

	// Slot 1: None, 10:00 to 11:00 (duration 3600)
	s1, err := CreateSlot(ctx.db, ctx.chID, SlotInput{
		MediaID:     2,
		StartAt:     parseTime("2026-06-01T10:00:00Z"),
		DurationSec: 3600,
		Recurrence:  "none",
	}, time.UTC)
	if err != nil {
		t.Fatal(err)
	}

	// 1. None vs None overlap: 10:30 to 11:30 conflicts with Slot 1
	_, err = CreateSlot(ctx.db, ctx.chID, SlotInput{
		MediaID:     2,
		StartAt:     parseTime("2026-06-01T10:30:00Z"),
		DurationSec: 3600,
		Recurrence:  "none",
	}, time.UTC)
	var confErr *ConflictError
	if !errors.As(err, &confErr) {
		t.Fatalf("expected ConflictError, got %v", err)
	}
	if confErr.Slot.ID != s1.ID {
		t.Errorf("conflicting slot id = %d, want %d", confErr.Slot.ID, s1.ID)
	}

	// 2. Touching ends are NOT overlap: slot starts at 11:00 exactly
	s2, err := CreateSlot(ctx.db, ctx.chID, SlotInput{
		MediaID:     2,
		StartAt:     parseTime("2026-06-01T11:00:00Z"),
		DurationSec: 3600,
		Recurrence:  "none",
	}, time.UTC)
	if err != nil {
		t.Fatalf("touching slot should succeed, got %v", err)
	}

	// 3. Update slot 2 ignoring itself: updating s2 with same start time should NOT conflict
	_, err = UpdateSlot(ctx.db, ctx.chID, s2.ID, SlotInput{
		MediaID:     2,
		StartAt:     parseTime("2026-06-01T11:00:00Z"),
		DurationSec: 1800,
		Recurrence:  "none",
	}, time.UTC)
	if err != nil {
		t.Fatalf("updating slot ignoring itself failed: %v", err)
	}

	// 4. None vs Daily crossing:
	// Create a daily slot at 15:00 to 16:00
	daily, err := CreateSlot(ctx.db, ctx.chID, SlotInput{
		MediaID:     2,
		StartAt:     parseTime("2026-06-01T15:00:00Z"),
		DurationSec: 3600,
		Recurrence:  "daily",
	}, time.UTC)
	if err != nil {
		t.Fatal(err)
	}

	// A single slot on June 5 at 15:30 to 16:30 conflicts with the daily recurrence!
	_, err = CreateSlot(ctx.db, ctx.chID, SlotInput{
		MediaID:     2,
		StartAt:     parseTime("2026-06-05T15:30:00Z"),
		DurationSec: 3600,
		Recurrence:  "none",
	}, time.UTC)
	if !errors.As(err, &confErr) {
		t.Fatalf("expected conflict with daily crossing on day 5, got %v", err)
	}
	if confErr.Slot.ID != daily.ID {
		t.Errorf("conflicting slot ID = %d, want %d", confErr.Slot.ID, daily.ID)
	}

	// 5. Daily vs Weekly crossing:
	// A weekly slot on Fridays (June 5 is Friday) at 15:45 conflicts with the daily slot!
	_, err = CreateSlot(ctx.db, ctx.chID, SlotInput{
		MediaID:     2,
		StartAt:     parseTime("2026-06-05T15:45:00Z"),
		DurationSec: 1800,
		Recurrence:  "weekly",
	}, time.UTC)
	if !errors.As(err, &confErr) {
		t.Fatalf("expected conflict between weekly and daily, got %v", err)
	}
}

func TestScheduleSlotsToTimeline(t *testing.T) {
	ctx, cleanup := setupScheduleTestDB(t)
	defer cleanup()

	s, err := CreateSlot(ctx.db, ctx.chID, SlotInput{
		MediaID:     1,
		StartAt:     parseTime("2026-06-01T10:00:00Z"),
		DurationSec: 1800,
		Recurrence:  "daily",
	}, time.UTC)
	if err != nil {
		t.Fatal(err)
	}

	list, err := ListSlots(ctx.db, ctx.chID)
	if err != nil {
		t.Fatal(err)
	}

	tlSlots := ScheduleSlotsToTimeline(list)
	if len(tlSlots) != 1 {
		t.Fatalf("expected 1 timeline slot, got %d", len(tlSlots))
	}
	if tlSlots[0].ID != s.ID || tlSlots[0].FilePath != "/media/a.mp4" || tlSlots[0].MediaDur != 1800 {
		t.Errorf("timeline slot mismatch: %+v", tlSlots[0])
	}
}
