package db

import (
	"database/sql"
	"path/filepath"
	"strings"
	"testing"
)

func TestInitDB(t *testing.T) {
	conn, err := InitDB(":memory:")
	if err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	defer conn.Close()

	var version int
	if err := conn.QueryRow("PRAGMA user_version;").Scan(&version); err != nil {
		t.Fatalf("query user_version: %v", err)
	}
	if version != 2 {
		t.Fatalf("user_version = %d, want 2", version)
	}

	for _, name := range []string{"channels", "media_files", "playlist_items", "schedule_slots"} {
		var got string
		err := conn.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name=?", name).Scan(&got)
		if err != nil {
			t.Errorf("table %s missing: %v", name, err)
		}
	}

	for _, dropped := range []string{"playlists", "schedules"} {
		var got string
		err := conn.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name=?", dropped).Scan(&got)
		if err == nil {
			t.Errorf("table %s should not exist", dropped)
		}
	}
}

func TestInitDBFileWAL(t *testing.T) {
	conn, err := InitDB(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	defer conn.Close()

	var mode string
	if err := conn.QueryRow("PRAGMA journal_mode;").Scan(&mode); err != nil {
		t.Fatal(err)
	}
	if mode != "wal" {
		t.Errorf("journal_mode = %q, want wal", mode)
	}
}

func TestInitDBLegacyRejection(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "legacy.db")
	rawConn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open raw: %v", err)
	}
	if _, err := rawConn.Exec("CREATE TABLE channels (id INTEGER PRIMARY KEY);"); err != nil {
		rawConn.Close()
		t.Fatalf("create legacy table: %v", err)
	}
	rawConn.Close()

	conn, err := InitDB(dbPath)
	if err == nil {
		conn.Close()
		t.Fatalf("expected error for legacy db, got nil")
	}
	if !strings.Contains(err.Error(), "outdated schema and must be deleted") {
		t.Fatalf("unexpected error message: %v", err)
	}
}

func TestInitDBReopenV2(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "v2.db")
	conn1, err := InitDB(dbPath)
	if err != nil {
		t.Fatalf("first InitDB: %v", err)
	}
	if _, err := conn1.Exec("INSERT INTO channels (number, name, mode) VALUES (1, 'Channel 1', 'loop');"); err != nil {
		conn1.Close()
		t.Fatalf("insert channel: %v", err)
	}
	conn1.Close()

	conn2, err := InitDB(dbPath)
	if err != nil {
		t.Fatalf("second InitDB: %v", err)
	}
	defer conn2.Close()

	var count int
	if err := conn2.QueryRow("SELECT COUNT(*) FROM channels WHERE number = 1;").Scan(&count); err != nil {
		t.Fatalf("query channel: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected 1 channel, got %d", count)
	}

	var version int
	if err := conn2.QueryRow("PRAGMA user_version;").Scan(&version); err != nil {
		t.Fatalf("query version: %v", err)
	}
	if version != 2 {
		t.Fatalf("expected version 2 on reopen, got %d", version)
	}
}
