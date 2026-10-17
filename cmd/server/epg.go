package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"tv-stream/internal/stream"
	"tv-stream/internal/timeline"
)

type epgItemResponse struct {
	MediaID     int64     `json:"media_id"`
	Title       string    `json:"title"`
	StartAt     time.Time `json:"start_at"`
	EndAt       time.Time `json:"end_at"`
	DurationSec float64   `json:"duration_sec"`
	IsCurrent   bool      `json:"is_current"`
}

type epgResponse struct {
	ChannelID   int64             `json:"channel_id"`
	GeneratedAt time.Time         `json:"generated_at"`
	Idle        bool              `json:"idle"`
	Items       []epgItemResponse `json:"items"`
}

type epgHandler struct {
	db         *sql.DB
	supervisor *stream.Supervisor
	calc       *timeline.Calculator
}

func newEPGHandler(db *sql.DB, supervisor *stream.Supervisor, calc *timeline.Calculator) *epgHandler {
	if calc == nil {
		calc = timeline.NewDBCalculator(db)
	}
	return &epgHandler{
		db:         db,
		supervisor: supervisor,
		calc:       calc,
	}
}

func (h *epgHandler) register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/channels/{id}/epg", h.epg)
}

func (h *epgHandler) channelExists(id int64) bool {
	var count int
	err := h.db.QueryRow(`SELECT COUNT(*) FROM channels WHERE id = ?`, id).Scan(&count)
	return err == nil && count > 0
}

func (h *epgHandler) epg(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || !h.channelExists(id) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "channel not found"})
		return
	}

	count := 5
	if cStr := r.URL.Query().Get("count"); cStr != "" {
		if n, err := strconv.Atoi(cStr); err == nil {
			count = n
		}
	}
	if count < 1 {
		count = 1
	} else if count > 20 {
		count = 20
	}

	var skipOffsetSec float64
	if h.supervisor != nil {
		skipOffsetSec = h.supervisor.Status(id).SkipOffsetSec
	}
	skipOffset := time.Duration(skipOffsetSec * float64(time.Second))

	wallNow := time.Now().UTC()
	logicalNow := wallNow.Add(skipOffset)

	items, err := h.calc.Upcoming(id, logicalNow, count)
	if errors.Is(err, timeline.ErrEmptyPlaylist) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(epgResponse{
			ChannelID:   id,
			GeneratedAt: wallNow,
			Idle:        true,
			Items:       []epgItemResponse{},
		})
		return
	}
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	respItems := make([]epgItemResponse, len(items))
	for i, it := range items {
		respItems[i] = epgItemResponse{
			MediaID:     it.MediaID,
			Title:       it.Title,
			StartAt:     it.StartAt.Add(-skipOffset),
			EndAt:       it.EndAt.Add(-skipOffset),
			DurationSec: it.DurationSec,
			IsCurrent:   it.IsCurrent,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(epgResponse{
		ChannelID:   id,
		GeneratedAt: wallNow,
		Idle:        false,
		Items:       respItems,
	})
}
