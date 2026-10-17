package db

import (
	"database/sql"
	_ "embed"
	"fmt"

	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schemaSQL string

// InitDB opens the SQLite database at dbPath, enables WAL mode and applies the schema.
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
	if _, err := conn.Exec(schemaSQL); err != nil {
		conn.Close()
		return nil, fmt.Errorf("apply schema: %w", err)
	}
	return conn, nil
}
