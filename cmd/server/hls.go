package main

import (
	"context"
	"database/sql"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"tv-stream/internal/ingest"
	"tv-stream/internal/stream"
	"tv-stream/internal/timeline"
)

// hlsHandler starts a channel's FFmpeg session on demand (at the wall-clock
// position) and serves its HLS output. Every request counts as a viewer ping
// so the idle reaper keeps active channels alive.
type hlsHandler struct {
	ctx        context.Context // server lifetime; FFmpeg must outlive a single request
	db         *sql.DB
	calc       timeline.TimelineCalculator
	ctrl       stream.ProcessController
	sessions   *stream.SessionManager
	supervisor *stream.Supervisor
	root       string
}

func (h *hlsHandler) register(mux *http.ServeMux) {
	mux.HandleFunc("GET /channels/{id}/live.m3u8", h.manifest)
	mux.HandleFunc("GET /channels/{id}/{file}", h.segment)
}

func (h *hlsHandler) dir(id int64) string { return filepath.Join(h.root, strconv.FormatInt(id, 10)) }

// channelExists returns true if the channel row is present in the database.
func (h *hlsHandler) channelExists(id int64) bool {
	var n int
	err := h.db.QueryRow(`SELECT COUNT(*) FROM channels WHERE id = ?`, id).Scan(&n)
	return err == nil && n > 0
}

func (h *hlsHandler) manifest(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	// 404 only when the channel row does not exist.
	if !h.channelExists(id) {
		http.NotFound(w, r)
		return
	}

	// Register viewer and hand-off to the supervisor (idempotent).
	h.sessions.RegisterPing(id)
	h.supervisor.Ensure(h.ctx, id)

	// Wait up to 20 s for live.m3u8 to appear.
	path := filepath.Join(h.dir(id), "live.m3u8")
	timer := time.NewTimer(20 * time.Second)
	defer timer.Stop()
	ticker := time.NewTicker(250 * time.Millisecond)
	defer ticker.Stop()

	for {
		if _, err := os.Stat(path); err == nil {
			break
		}
		select {
		case <-timer.C:
			http.Error(w, "stream not ready", http.StatusServiceUnavailable)
			return
		case <-r.Context().Done():
			http.Error(w, "request cancelled", http.StatusServiceUnavailable)
			return
		case <-h.ctx.Done():
			http.Error(w, "server shutting down", http.StatusServiceUnavailable)
			return
		case <-ticker.C:
		}
	}
	w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
	w.Header().Set("Cache-Control", "no-cache")
	http.ServeFile(w, r, path)
}

func (h *hlsHandler) segment(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	file := filepath.Base(r.PathValue("file"))
	if err != nil || filepath.Ext(file) != ".ts" {
		http.NotFound(w, r)
		return
	}
	if !h.channelExists(id) {
		http.NotFound(w, r)
		return
	}
	h.sessions.RegisterPing(id)
	w.Header().Set("Content-Type", "video/mp2t")
	http.ServeFile(w, r, filepath.Join(h.dir(id), file))
}

// codecLookupFunc returns a CodecLookup backed by the media_files table.
func codecLookupFunc(db *sql.DB) stream.CodecLookup {
	return func(mediaID int64) ingest.MediaMetadata {
		var vc, ac sql.NullString
		_ = db.QueryRow(`SELECT codec_video, codec_audio FROM media_files WHERE id = ?`, mediaID).
			Scan(&vc, &ac)
		return ingest.MediaMetadata{VideoCodec: vc.String, AudioCodec: ac.String}
	}
}
