package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/uzzzzy/niracast/internal/stream"
	"github.com/uzzzzy/niracast/internal/timeline"
)

type epgItemResponse struct {
	Kind        string    `json:"kind"`
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

func (h *epgHandler) epg(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "channel not found"})
		return
	}

	var mode string
	err = h.db.QueryRow(`SELECT mode FROM channels WHERE id = ?`, id).Scan(&mode)
	if errors.Is(err, sql.ErrNoRows) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "channel not found"})
		return
	}
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "database error: " + err.Error()})
		return
	}
	if mode == "" {
		mode = "loop"
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

	var skipOffset time.Duration
	if mode != "scheduled" && h.supervisor != nil {
		skipOffsetSec := h.supervisor.Status(id).SkipOffsetSec
		skipOffset = time.Duration(skipOffsetSec * float64(time.Second))
	}

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

	isIdle := false
	if len(items) == 0 {
		isIdle = true
	} else if mode == "scheduled" && items[0].Kind == "slate" {
		isIdle = true
	}

	respItems := make([]epgItemResponse, len(items))
	for i, it := range items {
		kind := it.Kind
		if kind == "" {
			kind = "programme"
		}
		respItems[i] = epgItemResponse{
			Kind:        kind,
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
		Idle:        isIdle,
		Items:       respItems,
	})
}
