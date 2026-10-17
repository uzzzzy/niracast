package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"time"

	"tv-stream/internal/events"
	"tv-stream/internal/stream"
)

type statusItemResponse struct {
	MediaID      int64     `json:"media_id"`
	Filename     string    `json:"filename"`
	StartedAt    time.Time `json:"started_at"`
	SeekSec      float64   `json:"seek_sec"`
	DurationSec  float64   `json:"duration_sec"`
	RemainingSec float64   `json:"remaining_sec"`
}

type channelStatusResponse struct {
	ChannelID     int64               `json:"channel_id"`
	State         string              `json:"state"`
	Item          *statusItemResponse `json:"item"`
	SkipOffsetSec float64             `json:"skip_offset_sec"`
}

type statusHandler struct {
	db         *sql.DB
	supervisor *stream.Supervisor
	hub        *events.Hub
}

func newStatusHandler(db *sql.DB, supervisor *stream.Supervisor, hub *events.Hub) *statusHandler {
	return &statusHandler{
		db:         db,
		supervisor: supervisor,
		hub:        hub,
	}
}

func (h *statusHandler) register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/channels/{id}/status", h.status)
	mux.HandleFunc("POST /api/v1/channels/{id}/skip", h.skip)
	mux.HandleFunc("GET /api/v1/events", h.eventsStream)
}

func (h *statusHandler) channelExists(id int64) bool {
	var count int
	err := h.db.QueryRow(`SELECT COUNT(*) FROM channels WHERE id = ?`, id).Scan(&count)
	return err == nil && count > 0
}

func (h *statusHandler) buildResponse(cs stream.ChannelStatus) channelStatusResponse {
	resp := channelStatusResponse{
		ChannelID:     cs.ChannelID,
		State:         cs.State,
		SkipOffsetSec: cs.SkipOffsetSec,
	}

	if cs.State == "playing" && cs.MediaID > 0 {
		var filename string
		var durationSec float64
		err := h.db.QueryRow(`SELECT filename, COALESCE(duration_sec, 0) FROM media_files WHERE id = ?`, cs.MediaID).
			Scan(&filename, &durationSec)
		if err != nil {
			if cs.SourcePath != "" {
				filename = filepath.Base(cs.SourcePath)
			}
			durationSec = cs.SeekSeconds + cs.RemainingSec
		}
		resp.Item = &statusItemResponse{
			MediaID:      cs.MediaID,
			Filename:     filename,
			StartedAt:    cs.StartedAt,
			SeekSec:      cs.SeekSeconds,
			DurationSec:  durationSec,
			RemainingSec: cs.RemainingSec,
		}
	}

	return resp
}

func (h *statusHandler) status(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || !h.channelExists(id) {
		http.Error(w, `{"error":"channel not found"}`, http.StatusNotFound)
		return
	}

	cs := h.supervisor.Status(id)
	resp := h.buildResponse(cs)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func (h *statusHandler) skip(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || !h.channelExists(id) {
		http.Error(w, `{"error":"channel not found"}`, http.StatusNotFound)
		return
	}

	cs, err := h.supervisor.Skip(id)
	if err != nil {
		if errors.Is(err, stream.ErrSkipUnavailable) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "skip_unavailable"})
			return
		}
		if errors.Is(err, stream.ErrNotPlaying) || errors.Is(err, stream.ErrNotRunning) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	resp := h.buildResponse(cs)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func (h *statusHandler) eventsStream(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	rc := http.NewResponseController(w)

	sub, cancel := h.hub.Subscribe()
	defer cancel()

	// Send initial snapshot of all channels with a running playout loop.
	running := h.supervisor.RunningStatuses()
	snapshot := make([]channelStatusResponse, 0, len(running))
	for _, cs := range running {
		snapshot = append(snapshot, h.buildResponse(cs))
	}

	snapData, err := json.Marshal(snapshot)
	if err == nil {
		fmt.Fprintf(w, "event: snapshot\ndata: %s\n\n", snapData)
		_ = rc.Flush()
	}

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			fmt.Fprintf(w, ": ping\n\n")
			if err := rc.Flush(); err != nil {
				return
			}
		case ev, ok := <-sub:
			if !ok {
				return
			}
			data, err := json.Marshal(ev)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Type, data)
			if err := rc.Flush(); err != nil {
				return
			}
		}
	}
}
