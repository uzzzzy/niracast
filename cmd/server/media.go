package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"path/filepath"
	"time"

	"tv-stream/internal/ingest"
)

// scanLoop indexes the media directory now and then every interval.
func scanLoop(ctx context.Context, conn *sql.DB, mediaDir string, interval time.Duration) {
	scanOnce(conn, mediaDir)
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			scanOnce(conn, mediaDir)
		}
	}
}

func scanOnce(conn *sql.DB, mediaDir string) {
	paths, err := ingest.NewScanner(mediaDir).Scan()
	if err != nil {
		log.Printf("scan %s: %v", mediaDir, err)
		return
	}
	for _, p := range paths {
		var id int64
		if conn.QueryRow(`SELECT id FROM media_files WHERE path = ?`, p).Scan(&id) == nil {
			continue
		}
		m, err := ingest.ProbeMedia(p)
		if err != nil {
			log.Printf("probe %s: %v", p, err)
			continue
		}
		_, err = conn.Exec(`INSERT OR IGNORE INTO media_files
			(path, filename, duration_sec, codec_video, codec_audio, width, height)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
			p, filepath.Base(p), m.DurationSec, m.VideoCodec, m.AudioCodec, m.Width, m.Height)
		if err != nil {
			log.Printf("insert %s: %v", p, err)
		}
	}
}

func listMedia(conn *sql.DB) http.HandlerFunc {
	type item struct {
		ID          int64   `json:"id"`
		Path        string  `json:"path"`
		Filename    string  `json:"filename"`
		DurationSec float64 `json:"duration_sec"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := conn.Query(`SELECT id, path, filename, duration_sec FROM media_files ORDER BY filename`)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		out := []item{}
		for rows.Next() {
			var it item
			var fn sql.NullString
			if err := rows.Scan(&it.ID, &it.Path, &fn, &it.DurationSec); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			it.Filename = fn.String
			out = append(out, it)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	}
}
