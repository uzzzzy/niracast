package db

import "testing"

func TestInitDB(t *testing.T) {
	conn, err := InitDB(":memory:")
	if err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	defer conn.Close()
	conn.SetMaxOpenConns(1)

	for _, name := range []string{"channels", "media_files", "playlists", "schedules"} {
		var got string
		err := conn.QueryRow("SELECT name FROM sqlite_master WHERE type='table' AND name=?", name).Scan(&got)
		if err != nil {
			t.Errorf("table %s missing: %v", name, err)
		}
	}
}

func TestInitDBFileWAL(t *testing.T) {
	conn, err := InitDB(t.TempDir() + "/test.db")
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
