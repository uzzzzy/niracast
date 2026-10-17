package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"path/filepath"
	"time"

	"github.com/uzzzzy/niracast/internal/ingest"
)

// scanLoop indexes the media directory now and then every interval using the MediaScanner guard.
func scanLoop(ctx context.Context, scanner *MediaScanner, interval time.Duration) {
	scanner.StartScan()
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			scanner.StartScan()
		}
	}
}

func scanOnce(conn *sql.DB, mediaDir string) error {
	paths, err := ingest.NewScanner(mediaDir).Scan()
	if err != nil {
		log.Printf("scan %s: %v", mediaDir, err)
		return err
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
	return nil
}

func listMedia(conn *sql.DB) http.HandlerFunc {
	type item struct {
		ID          int64   `json:"id"`
		Path        string  `json:"path"`
		Filename    string  `json:"filename"`
		DurationSec float64 `json:"duration_sec"`
		CodecVideo  string  `json:"codec_video"`
		CodecAudio  string  `json:"codec_audio"`
		Width       int     `json:"width"`
		Height      int     `json:"height"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := conn.Query(`SELECT id, path, filename, duration_sec, codec_video, codec_audio, width, height FROM media_files ORDER BY filename`)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		out := []item{}
		for rows.Next() {
			var it item
			var fn, cv, ca sql.NullString
			var dur sql.NullFloat64
			var widthVal, heightVal sql.NullInt64
			if err := rows.Scan(&it.ID, &it.Path, &fn, &dur, &cv, &ca, &widthVal, &heightVal); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			it.Filename = fn.String
			it.DurationSec = dur.Float64
			it.CodecVideo = cv.String
			it.CodecAudio = ca.String
			it.Width = int(widthVal.Int64)
			it.Height = int(heightVal.Int64)
			out = append(out, it)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(out)
	}
}
