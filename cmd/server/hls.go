package main

import (
	"context"
	"database/sql"
	"errors"
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
	ctx      context.Context // server lifetime; FFmpeg must outlive a single request
	db       *sql.DB
	calc     timeline.TimelineCalculator
	ctrl     stream.ProcessController
	sessions *stream.SessionManager
	root     string
}

func (h *hlsHandler) register(mux *http.ServeMux) {
	mux.HandleFunc("GET /channels/{id}/live.m3u8", h.manifest)
	mux.HandleFunc("GET /channels/{id}/{file}", h.segment)
}

func (h *hlsHandler) dir(id int64) string { return filepath.Join(h.root, strconv.FormatInt(id, 10)) }

func (h *hlsHandler) manifest(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	h.sessions.RegisterPing(id)

	if !h.ctrl.IsRunning(id) {
		if err := h.start(id); err != nil {
			if errors.Is(err, timeline.ErrEmptyPlaylist) {
				http.Error(w, "channel has no playlist", http.StatusNotFound)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	path := filepath.Join(h.dir(id), "live.m3u8")
	deadline := time.Now().Add(20 * time.Second)
	for {
		if _, err := os.Stat(path); err == nil {
			break
		}
		if time.Now().After(deadline) || r.Context().Err() != nil {
			http.Error(w, "stream not ready", http.StatusServiceUnavailable)
			return
		}
		time.Sleep(250 * time.Millisecond)
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
	h.sessions.RegisterPing(id)
	w.Header().Set("Content-Type", "video/mp2t")
	http.ServeFile(w, r, filepath.Join(h.dir(id), file))
}

func (h *hlsHandler) start(id int64) error {
	item, err := h.calc.GetCurrentPlayout(id, time.Now())
	if err != nil {
		return err
	}
	var meta ingest.MediaMetadata
	var vc, ac sql.NullString
	err = h.db.QueryRow(`SELECT codec_video, codec_audio FROM media_files WHERE id = ?`, item.MediaID).Scan(&vc, &ac)
	if err == nil {
		meta = ingest.MediaMetadata{VideoCodec: vc.String, AudioCodec: ac.String}
	}
	_ = os.RemoveAll(h.dir(id)) // drop stale segments from a previous run
	prof := stream.OptimizePipeline(&meta)
	err = h.ctrl.StartStream(h.ctx, stream.StreamConfig{
		ChannelID:   id,
		SourcePath:  item.FilePath,
		SeekSeconds: item.SeekSeconds,
		OutputDir:   h.dir(id),
		CopyCodec:   prof.CanCopyVideo && prof.CanCopyAudio,
	})
	return err
}
