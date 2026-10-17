package models

import (
	"errors"
	"testing"

	"tv-stream/internal/db"
)

func TestChannelCRUD_Mode(t *testing.T) {
	conn, err := db.InitDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	// 1. Create with empty mode defaults to 'loop'
	c1, err := CreateChannel(conn, ChannelInput{Number: 1, Name: "Channel 1"})
	if err != nil {
		t.Fatalf("create channel 1: %v", err)
	}
	if c1.Mode != "loop" {
		t.Errorf("expected mode 'loop', got %q", c1.Mode)
	}

	// 2. Create with explicit 'scheduled' mode
	c2, err := CreateChannel(conn, ChannelInput{Number: 2, Name: "Channel 2", Mode: "scheduled"})
	if err != nil {
		t.Fatalf("create channel 2: %v", err)
	}
	if c2.Mode != "scheduled" {
		t.Errorf("expected mode 'scheduled', got %q", c2.Mode)
	}

	// 3. Create with invalid mode returns ErrInvalidMode
	_, err = CreateChannel(conn, ChannelInput{Number: 3, Name: "Channel 3", Mode: "invalid_mode"})
	if !errors.Is(err, ErrInvalidMode) {
		t.Errorf("expected ErrInvalidMode, got %v", err)
	}

	// 4. GetChannel reads mode
	got1, err := GetChannel(conn, c1.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got1.Mode != "loop" {
		t.Errorf("got1 mode = %q, want loop", got1.Mode)
	}

	got2, err := GetChannel(conn, c2.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got2.Mode != "scheduled" {
		t.Errorf("got2 mode = %q, want scheduled", got2.Mode)
	}

	// 5. UpdateChannel with empty mode leaves mode unchanged
	up1, err := UpdateChannel(conn, c1.ID, ChannelInput{Number: 1, Name: "Channel 1 Renamed"})
	if err != nil {
		t.Fatal(err)
	}
	if up1.Mode != "loop" {
		t.Errorf("up1 mode = %q, want loop", up1.Mode)
	}

	// 6. UpdateChannel with new mode switches mode
	up2, err := UpdateChannel(conn, c1.ID, ChannelInput{Number: 1, Name: "Channel 1 Renamed", Mode: "scheduled"})
	if err != nil {
		t.Fatal(err)
	}
	if up2.Mode != "scheduled" {
		t.Errorf("up2 mode = %q, want scheduled", up2.Mode)
	}

	// 7. UpdateChannel with invalid mode fails
	_, err = UpdateChannel(conn, c1.ID, ChannelInput{Number: 1, Name: "Channel 1", Mode: "invalid"})
	if !errors.Is(err, ErrInvalidMode) {
		t.Errorf("expected ErrInvalidMode on update, got %v", err)
	}

	// 8. ListChannels includes mode
	list, err := ListChannels(conn)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 {
		t.Fatalf("expected 2 channels, got %d", len(list))
	}
	if list[0].Mode != "scheduled" || list[1].Mode != "scheduled" {
		t.Errorf("unexpected modes in list: %+v", list)
	}
}

func TestDeleteChannelCascade(t *testing.T) {
	conn, err := db.InitDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	ch, err := CreateChannel(conn, ChannelInput{Number: 1, Name: "Test Channel"})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := conn.Exec(`INSERT INTO media_files (id, path, filename, duration_sec) VALUES (10, '/m.mp4', 'm.mp4', 100)`); err != nil {
		t.Fatal(err)
	}

	// Add playlist item
	if _, err := SetPlaylist(conn, ch.ID, []int64{10}); err != nil {
		t.Fatal(err)
	}

	// Add schedule slot
	if _, err := conn.Exec(`INSERT INTO schedule_slots (channel_id, media_id, start_at, duration_sec, recurrence) VALUES (?, 10, 1000, 100, 'none')`, ch.ID); err != nil {
		t.Fatal(err)
	}

	// Delete channel
	if err := DeleteChannel(conn, ch.ID); err != nil {
		t.Fatalf("DeleteChannel: %v", err)
	}

	var pCount, sCount int
	_ = conn.QueryRow(`SELECT COUNT(*) FROM playlist_items WHERE channel_id = ?`, ch.ID).Scan(&pCount)
	if pCount != 0 {
		t.Errorf("expected 0 playlist_items, got %d", pCount)
	}
	_ = conn.QueryRow(`SELECT COUNT(*) FROM schedule_slots WHERE channel_id = ?`, ch.ID).Scan(&sCount)
	if sCount != 0 {
		t.Errorf("expected 0 schedule_slots, got %d", sCount)
	}
}
