package db

import (
	"database/sql"
	_ "embed"
	"fmt"

	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schemaSQL string

// InitDB opens the SQLite database at dbPath, enables WAL mode and applies schema version 2.
func InitDB(dbPath string) (*sql.DB, error) {
	conn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	if dbPath == ":memory:" {
		conn.SetMaxOpenConns(1) // each in-memory connection is a separate DB
	}
	if _, err := conn.Exec("PRAGMA journal_mode=WAL;"); err != nil {
		conn.Close()
		return nil, fmt.Errorf("enable WAL: %w", err)
	}

	var userVersion int
	if err := conn.QueryRow("PRAGMA user_version;").Scan(&userVersion); err != nil {
		conn.Close()
		return nil, fmt.Errorf("read user_version: %w", err)
	}

	switch userVersion {
	case 0:
		var hasChannels int
		err := conn.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='channels';").Scan(&hasChannels)
		if err != nil {
			conn.Close()
			return nil, fmt.Errorf("check channels table: %w", err)
		}
		if hasChannels > 0 {
			conn.Close()
			return nil, fmt.Errorf("database uses an outdated schema and must be deleted (dev reset)")
		}

		if _, err := conn.Exec(schemaSQL); err != nil {
			conn.Close()
			return nil, fmt.Errorf("apply schema: %w", err)
		}
		if _, err := conn.Exec("PRAGMA user_version = 2;"); err != nil {
			conn.Close()
			return nil, fmt.Errorf("set user_version: %w", err)
		}

	case 2:
		if _, err := conn.Exec(schemaSQL); err != nil {
			conn.Close()
			return nil, fmt.Errorf("apply schema: %w", err)
		}

	default:
		conn.Close()
		return nil, fmt.Errorf("unsupported database schema version %d", userVersion)
	}

	return conn, nil
}
