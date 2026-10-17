package models

import (
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"tv-stream/internal/timeline"
)

// ErrInvalidSlot is returned when slot parameters fail validation.
var ErrInvalidSlot = errors.New("invalid schedule slot")

// ConflictError represents a scheduling collision with an existing slot.
type ConflictError struct {
	Slot  ScheduleSlot `json:"slot"`
	Start time.Time    `json:"start_at"`
	End   time.Time    `json:"end_at"`
}

func (e *ConflictError) Error() string {
	return fmt.Sprintf("schedule conflict with slot %d (%s) from %s to %s",
		e.Slot.ID, e.Slot.Title, e.Start.Format(time.RFC3339), e.End.Format(time.RFC3339))
}

// ScheduleSlot represents a configured timeslot on a channel.
type ScheduleSlot struct {
	ID               int64      `json:"id"`
	ChannelID        int64      `json:"channel_id"`
	MediaID          int64      `json:"media_id"`
	FilePath         string     `json:"-"`
	Filename         string     `json:"filename"`
	Title            string     `json:"title"`
	StartAt          time.Time  `json:"start_at"`
	DurationSec      float64    `json:"duration_sec"`
	MediaDurationSec float64    `json:"media_duration_sec"`
	Recurrence       string     `json:"recurrence"`
	Until            *time.Time `json:"until"`
}

// SlotInput is the payload for creating or updating a schedule slot.
type SlotInput struct {
	MediaID     int64      `json:"media_id"`
	StartAt     time.Time  `json:"start_at"`
	DurationSec float64    `json:"duration_sec,omitempty"`
	Recurrence  string     `json:"recurrence,omitempty"`
	Until       *time.Time `json:"until,omitempty"`
}

// ListSlots returns all schedule slots for channelID ordered by start_at.
func ListSlots(db *sql.DB, channelID int64) ([]ScheduleSlot, error) {
	var exists int
	if err := db.QueryRow(`SELECT 1 FROM channels WHERE id = ?`, channelID).Scan(&exists); errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	} else if err != nil {
		return nil, fmt.Errorf("check channel: %w", err)
	}

	rows, err := db.Query(`SELECT s.id, s.channel_id, s.media_id, m.path, m.filename, s.start_at, s.duration_sec,
		COALESCE(m.duration_sec, 0), s.recurrence, s.until_at
		FROM schedule_slots s
		JOIN media_files m ON m.id = s.media_id
		WHERE s.channel_id = ?
		ORDER BY s.start_at ASC, s.id ASC`, channelID)
	if err != nil {
		return nil, fmt.Errorf("query slots: %w", err)
	}
	defer rows.Close()

	var slots []ScheduleSlot
	for rows.Next() {
		var s ScheduleSlot
		var startUnix int64
		var untilUnix sql.NullInt64
		if err := rows.Scan(&s.ID, &s.ChannelID, &s.MediaID, &s.FilePath, &s.Filename, &startUnix, &s.DurationSec,
			&s.MediaDurationSec, &s.Recurrence, &untilUnix); err != nil {
			return nil, fmt.Errorf("scan slot: %w", err)
		}
		s.StartAt = time.Unix(startUnix, 0).UTC()
		if untilUnix.Valid {
			u := time.Unix(untilUnix.Int64, 0).UTC()
			s.Until = &u
		}
		s.Title = strings.TrimSuffix(s.Filename, filepath.Ext(s.Filename))
		slots = append(slots, s)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate slots: %w", err)
	}
	if slots == nil {
		slots = []ScheduleSlot{}
	}
	return slots, nil
}

// GetSlot retrieves a single schedule slot by channelID and slotID.
func GetSlot(db *sql.DB, channelID, slotID int64) (*ScheduleSlot, error) {
	var s ScheduleSlot
	var startUnix int64
	var untilUnix sql.NullInt64
	err := db.QueryRow(`SELECT s.id, s.channel_id, s.media_id, m.path, m.filename, s.start_at, s.duration_sec,
		COALESCE(m.duration_sec, 0), s.recurrence, s.until_at
		FROM schedule_slots s
		JOIN media_files m ON m.id = s.media_id
		WHERE s.channel_id = ? AND s.id = ?`, channelID, slotID).
		Scan(&s.ID, &s.ChannelID, &s.MediaID, &s.FilePath, &s.Filename, &startUnix, &s.DurationSec,
			&s.MediaDurationSec, &s.Recurrence, &untilUnix)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get slot: %w", err)
	}
	s.StartAt = time.Unix(startUnix, 0).UTC()
	if untilUnix.Valid {
		u := time.Unix(untilUnix.Int64, 0).UTC()
		s.Until = &u
	}
	s.Title = strings.TrimSuffix(s.Filename, filepath.Ext(s.Filename))
	return &s, nil
}

// CreateSlot validates and saves a new schedule slot for channelID.
func CreateSlot(db *sql.DB, channelID int64, in SlotInput, loc *time.Location) (*ScheduleSlot, error) {
	if loc == nil {
		loc = time.UTC
	}

	var exists int
	if err := db.QueryRow(`SELECT 1 FROM channels WHERE id = ?`, channelID).Scan(&exists); errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	} else if err != nil {
		return nil, fmt.Errorf("check channel: %w", err)
	}

	dur, rec, path, filename, mediaDur, err := validateSlotInput(db, in)
	if err != nil {
		return nil, err
	}

	if err := checkOverlaps(db, channelID, 0, in, dur, rec, path, filename, mediaDur, loc); err != nil {
		return nil, err
	}

	var untilVal any
	if in.Until != nil {
		untilVal = in.Until.UTC().Unix()
	}

	now := time.Now().UTC()
	res, err := db.Exec(`INSERT INTO schedule_slots (channel_id, media_id, start_at, duration_sec, recurrence, until_at, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		channelID, in.MediaID, in.StartAt.UTC().Unix(), dur, rec, untilVal, now)
	if err != nil {
		return nil, fmt.Errorf("insert slot: %w", err)
	}

	id, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("last insert id: %w", err)
	}

	return GetSlot(db, channelID, id)
}

// UpdateSlot validates and modifies an existing slot.
func UpdateSlot(db *sql.DB, channelID, slotID int64, in SlotInput, loc *time.Location) (*ScheduleSlot, error) {
	if loc == nil {
		loc = time.UTC
	}

	if _, err := GetSlot(db, channelID, slotID); err != nil {
		return nil, err
	}

	dur, rec, path, filename, mediaDur, err := validateSlotInput(db, in)
	if err != nil {
		return nil, err
	}

	if err := checkOverlaps(db, channelID, slotID, in, dur, rec, path, filename, mediaDur, loc); err != nil {
		return nil, err
	}

	var untilVal any
	if in.Until != nil {
		untilVal = in.Until.UTC().Unix()
	}

	res, err := db.Exec(`UPDATE schedule_slots
		SET media_id = ?, start_at = ?, duration_sec = ?, recurrence = ?, until_at = ?
		WHERE channel_id = ? AND id = ?`,
		in.MediaID, in.StartAt.UTC().Unix(), dur, rec, untilVal, channelID, slotID)
	if err != nil {
		return nil, fmt.Errorf("update slot: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotFound
	}

	return GetSlot(db, channelID, slotID)
}

// DeleteSlot removes a schedule slot.
func DeleteSlot(db *sql.DB, channelID, slotID int64) error {
	res, err := db.Exec(`DELETE FROM schedule_slots WHERE channel_id = ? AND id = ?`, channelID, slotID)
	if err != nil {
		return fmt.Errorf("delete slot: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func validateSlotInput(db *sql.DB, in SlotInput) (float64, string, string, string, float64, error) {
	rec := in.Recurrence
	if rec == "" {
		rec = "none"
	}
	if rec != "none" && rec != "daily" && rec != "weekly" {
		return 0, "", "", "", 0, fmt.Errorf("%w: invalid recurrence %q", ErrInvalidSlot, in.Recurrence)
	}

	if in.Until != nil {
		if !in.Until.After(in.StartAt) {
			return 0, "", "", "", 0, fmt.Errorf("%w: until must be after start_at", ErrInvalidSlot)
		}
	}

	var path, filename string
	var mediaDur float64
	err := db.QueryRow(`SELECT path, filename, COALESCE(duration_sec, 0) FROM media_files WHERE id = ?`, in.MediaID).
		Scan(&path, &filename, &mediaDur)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, "", "", "", 0, &MediaMissingError{ID: in.MediaID}
	}
	if err != nil {
		return 0, "", "", "", 0, fmt.Errorf("lookup media: %w", err)
	}

	if mediaDur <= 0 {
		return 0, "", "", "", 0, fmt.Errorf("%w: media duration must be greater than zero", ErrInvalidSlot)
	}

	dur := in.DurationSec
	if dur == 0 {
		dur = mediaDur
	}
	if dur <= 0 || dur > 86400 {
		return 0, "", "", "", 0, fmt.Errorf("%w: duration must be between 1 and 86400 seconds", ErrInvalidSlot)
	}

	return dur, rec, path, filename, mediaDur, nil
}

func checkOverlaps(db *sql.DB, channelID, ignoreSlotID int64, in SlotInput, dur float64, rec, path, filename string, mediaDur float64, loc *time.Location) error {
	candStart := in.StartAt.UTC()
	from := candStart
	to := candStart.Add(60 * 24 * time.Hour)

	candSlot := timeline.Slot{
		ID:          ignoreSlotID,
		ChannelID:   channelID,
		MediaID:     in.MediaID,
		FilePath:    path,
		Filename:    filename,
		MediaDur:    mediaDur,
		Start:       candStart,
		DurationSec: dur,
		Recurrence:  rec,
		Until:       in.Until,
	}

	candOccs := timeline.Expand([]timeline.Slot{candSlot}, from, to, loc)

	// Check if candidate overlaps with its own recurring occurrences
	for i := 0; i < len(candOccs); i++ {
		for j := i + 1; j < len(candOccs); j++ {
			if candOccs[i].Start.Before(candOccs[j].End) && candOccs[j].Start.Before(candOccs[i].End) {
				return fmt.Errorf("%w: recurring slot overlaps with itself", ErrInvalidSlot)
			}
		}
	}

	rows, err := db.Query(`SELECT s.id, s.channel_id, s.media_id, m.path, m.filename, s.start_at, s.duration_sec,
		COALESCE(m.duration_sec, 0), s.recurrence, s.until_at
		FROM schedule_slots s
		JOIN media_files m ON m.id = s.media_id
		WHERE s.channel_id = ? AND s.id != ?`, channelID, ignoreSlotID)
	if err != nil {
		return fmt.Errorf("query other slots: %w", err)
	}
	defer rows.Close()

	var otherSlots []timeline.Slot
	slotsByID := make(map[int64]ScheduleSlot)

	for rows.Next() {
		var s ScheduleSlot
		var startUnix int64
		var untilUnix sql.NullInt64
		if err := rows.Scan(&s.ID, &s.ChannelID, &s.MediaID, &s.FilePath, &s.Filename, &startUnix, &s.DurationSec,
			&s.MediaDurationSec, &s.Recurrence, &untilUnix); err != nil {
			return fmt.Errorf("scan other slot: %w", err)
		}
		s.StartAt = time.Unix(startUnix, 0).UTC()
		if untilUnix.Valid {
			u := time.Unix(untilUnix.Int64, 0).UTC()
			s.Until = &u
		}
		s.Title = strings.TrimSuffix(s.Filename, filepath.Ext(s.Filename))
		slotsByID[s.ID] = s

		otherSlots = append(otherSlots, timeline.Slot{
			ID:          s.ID,
			ChannelID:   s.ChannelID,
			MediaID:     s.MediaID,
			FilePath:    s.FilePath,
			Filename:    s.Filename,
			MediaDur:    s.MediaDurationSec,
			Start:       s.StartAt,
			DurationSec: s.DurationSec,
			Recurrence:  s.Recurrence,
			Until:       s.Until,
		})
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate other slots: %w", err)
	}

	otherOccs := timeline.Expand(otherSlots, from, to, loc)

	var firstConflict *ConflictError
	for _, cOcc := range candOccs {
		for _, oOcc := range otherOccs {
			// Touching ends are NOT an overlap
			if cOcc.Start.Before(oOcc.End) && oOcc.Start.Before(cOcc.End) {
				conf := &ConflictError{
					Slot:  slotsByID[oOcc.SlotID],
					Start: oOcc.Start,
					End:   oOcc.End,
				}
				if firstConflict == nil || oOcc.Start.Before(firstConflict.Start) {
					firstConflict = conf
				}
			}
		}
	}

	if firstConflict != nil {
		return firstConflict
	}
	return nil
}

// ScheduleSlotsToTimeline converts a slice of ScheduleSlot to timeline.Slot.
func ScheduleSlotsToTimeline(slots []ScheduleSlot) []timeline.Slot {
	out := make([]timeline.Slot, len(slots))
	for i, s := range slots {
		out[i] = timeline.Slot{
			ID:          s.ID,
			ChannelID:   s.ChannelID,
			MediaID:     s.MediaID,
			FilePath:    s.FilePath,
			Filename:    s.Filename,
			MediaDur:    s.MediaDurationSec,
			Start:       s.StartAt,
			DurationSec: s.DurationSec,
			Recurrence:  s.Recurrence,
			Until:       s.Until,
		}
	}
	return out
}

// SlotsToTimeline loads media details if missing and converts slots to timeline.Slot.
func SlotsToTimeline(db *sql.DB, slots []ScheduleSlot) ([]timeline.Slot, error) {
	return ScheduleSlotsToTimeline(slots), nil
}
