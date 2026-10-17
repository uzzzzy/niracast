package models

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

// ErrDuplicateNumber is returned when a channel number already exists.
var ErrDuplicateNumber = errors.New("channel number already exists")

// ErrNotFound is returned when a row does not exist.
var ErrNotFound = errors.New("not found")

// ErrInvalidMode is returned when an invalid channel mode is supplied.
var ErrInvalidMode = errors.New("invalid channel mode")

// Channel is a TV channel.
type Channel struct {
	ID        int64     `json:"id"`
	Number    int       `json:"number"`
	Name      string    `json:"name"`
	Mode      string    `json:"mode"`
	CreatedAt time.Time `json:"created_at"`
}

// ChannelInput is the DTO for create/update.
type ChannelInput struct {
	Number int    `json:"number"`
	Name   string `json:"name"`
	Mode   string `json:"mode,omitempty"`
}

// PlaylistInput is the DTO for arranging media into a channel playlist.
type PlaylistInput struct {
	MediaIDs []int64 `json:"media_ids"`
}

// PlaylistItem is one entry in a channel playlist.
type PlaylistItem struct {
	MediaID  int64   `json:"media_id"`
	Position int     `json:"position"`
	Duration float64 `json:"duration_sec"`
}

// MediaMissingError is returned when a playlist references unknown media.
type MediaMissingError struct{ ID int64 }

func (e *MediaMissingError) Error() string { return fmt.Sprintf("media %d not found", e.ID) }

func isUnique(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed")
}

func ListChannels(db *sql.DB) ([]Channel, error) {
	rows, err := db.Query(`SELECT id, number, name, mode, created_at FROM channels ORDER BY number`)
	if err != nil {
		return nil, fmt.Errorf("list channels: %w", err)
	}
	defer rows.Close()
	out := []Channel{}
	for rows.Next() {
		var c Channel
		var created sql.NullTime
		if err := rows.Scan(&c.ID, &c.Number, &c.Name, &c.Mode, &created); err != nil {
			return nil, fmt.Errorf("scan channel: %w", err)
		}
		c.CreatedAt = created.Time
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate channels: %w", err)
	}
	return out, nil
}

func GetChannel(db *sql.DB, id int64) (*Channel, error) {
	var c Channel
	var created sql.NullTime
	err := db.QueryRow(`SELECT id, number, name, mode, created_at FROM channels WHERE id = ?`, id).
		Scan(&c.ID, &c.Number, &c.Name, &c.Mode, &created)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("get channel: %w", err)
	}
	c.CreatedAt = created.Time
	return &c, nil
}

func CreateChannel(db *sql.DB, in ChannelInput) (*Channel, error) {
	mode := in.Mode
	if mode == "" {
		mode = "loop"
	} else if mode != "loop" && mode != "scheduled" {
		return nil, ErrInvalidMode
	}

	now := time.Now().UTC()
	res, err := db.Exec(`INSERT INTO channels (number, name, mode, created_at) VALUES (?, ?, ?, ?)`, in.Number, in.Name, mode, now)
	if isUnique(err) {
		return nil, ErrDuplicateNumber
	}
	if err != nil {
		return nil, fmt.Errorf("insert channel: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("last insert id: %w", err)
	}
	return &Channel{ID: id, Number: in.Number, Name: in.Name, Mode: mode, CreatedAt: now}, nil
}

func UpdateChannel(db *sql.DB, id int64, in ChannelInput) (*Channel, error) {
	cur, err := GetChannel(db, id)
	if err != nil {
		return nil, err
	}

	mode := cur.Mode
	if in.Mode != "" {
		if in.Mode != "loop" && in.Mode != "scheduled" {
			return nil, ErrInvalidMode
		}
		mode = in.Mode
	}

	res, err := db.Exec(`UPDATE channels SET number = ?, name = ?, mode = ? WHERE id = ?`, in.Number, in.Name, mode, id)
	if isUnique(err) {
		return nil, ErrDuplicateNumber
	}
	if err != nil {
		return nil, fmt.Errorf("update channel: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, ErrNotFound
	}
	return GetChannel(db, id)
}

func DeleteChannel(db *sql.DB, id int64) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback()
	res, err := tx.Exec(`DELETE FROM channels WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete channel: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	if _, err := tx.Exec(`DELETE FROM playlist_items WHERE channel_id = ?`, id); err != nil {
		return fmt.Errorf("delete channel playlist: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM schedule_slots WHERE channel_id = ?`, id); err != nil {
		return fmt.Errorf("delete channel schedule slots: %w", err)
	}
	return tx.Commit()
}

// SetPlaylist replaces the channel's ordered media items in playlist_items.
func SetPlaylist(db *sql.DB, channelID int64, mediaIDs []int64) ([]PlaylistItem, error) {
	tx, err := db.Begin()
	if err != nil {
		return nil, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback()

	var exists int
	if err := tx.QueryRow(`SELECT 1 FROM channels WHERE id = ?`, channelID).Scan(&exists); errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	} else if err != nil {
		return nil, fmt.Errorf("check channel: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM playlist_items WHERE channel_id = ?`, channelID); err != nil {
		return nil, fmt.Errorf("clear playlist: %w", err)
	}
	items := []PlaylistItem{}
	for i, mid := range mediaIDs {
		var dur sql.NullFloat64
		err := tx.QueryRow(`SELECT duration_sec FROM media_files WHERE id = ?`, mid).Scan(&dur)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, &MediaMissingError{ID: mid}
		}
		if err != nil {
			return nil, fmt.Errorf("lookup media %d: %w", mid, err)
		}
		if _, err := tx.Exec(`INSERT INTO playlist_items (channel_id, media_id, duration_sec, position_order) VALUES (?, ?, ?, ?)`,
			channelID, mid, dur.Float64, i); err != nil {
			return nil, fmt.Errorf("insert playlist item: %w", err)
		}
		items = append(items, PlaylistItem{MediaID: mid, Position: i, Duration: dur.Float64})
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return items, nil
}

// ChannelPlaylistItem is an entry in the channel playlist response.
type ChannelPlaylistItem struct {
	MediaID     int64   `json:"media_id"`
	Position    int     `json:"position"`
	Filename    string  `json:"filename"`
	DurationSec float64 `json:"duration_sec"`
}

// ChannelPlaylistResponse is returned by GET /api/v1/channels/{id}/playlist.
type ChannelPlaylistResponse struct {
	ChannelID        int64                 `json:"channel_id"`
	Items            []ChannelPlaylistItem `json:"items"`
	TotalDurationSec float64               `json:"total_duration_sec"`
}

// GetPlaylist retrieves the ordered playlist and total duration for channelID.
func GetPlaylist(db *sql.DB, channelID int64) (*ChannelPlaylistResponse, error) {
	var exists int
	err := db.QueryRow(`SELECT 1 FROM channels WHERE id = ?`, channelID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("check channel: %w", err)
	}

	rows, err := db.Query(`SELECT p.media_id, p.position_order, COALESCE(m.filename, ''), COALESCE(p.duration_sec, m.duration_sec, 0)
		FROM playlist_items p
		LEFT JOIN media_files m ON m.id = p.media_id
		WHERE p.channel_id = ?
		ORDER BY p.position_order ASC, p.id ASC`, channelID)
	if err != nil {
		return nil, fmt.Errorf("query playlist items: %w", err)
	}
	defer rows.Close()

	items := []ChannelPlaylistItem{}
	var totalDur float64
	for rows.Next() {
		var it ChannelPlaylistItem
		if err := rows.Scan(&it.MediaID, &it.Position, &it.Filename, &it.DurationSec); err != nil {
			return nil, fmt.Errorf("scan playlist item: %w", err)
		}
		totalDur += it.DurationSec
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate playlist items: %w", err)
	}

	return &ChannelPlaylistResponse{
		ChannelID:        channelID,
		Items:            items,
		TotalDurationSec: totalDur,
	}, nil
}
