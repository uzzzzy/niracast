package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"tv-stream/internal/analytics"
	"tv-stream/internal/stream"
)

// AnalyticsHandler serves real-time and historical analytics endpoints.
type AnalyticsHandler struct {
	DB         *sql.DB
	Tracker    *analytics.Tracker
	Supervisor *stream.Supervisor
	Now        func() time.Time
}

// NewAnalyticsHandler constructs an AnalyticsHandler.
func NewAnalyticsHandler(db *sql.DB, tracker *analytics.Tracker, supervisor *stream.Supervisor) *AnalyticsHandler {
	return &AnalyticsHandler{
		DB:         db,
		Tracker:    tracker,
		Supervisor: supervisor,
		Now:        time.Now,
	}
}

// Register mounts analytics routes onto the provided ServeMux.
func (h *AnalyticsHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/analytics/live", h.Live)
	mux.HandleFunc("GET /api/v1/analytics/timeseries", h.Timeseries)
	mux.HandleFunc("GET /api/v1/analytics/top-media", h.TopMedia)
}

func (h *AnalyticsHandler) nowFunc() time.Time {
	if h.Now != nil {
		return h.Now()
	}
	return time.Now()
}

// Live handles GET /api/v1/analytics/live.
func (h *AnalyticsHandler) Live(w http.ResponseWriter, r *http.Request) {
	var healthLookup func(int64) (int, string)
	if h.Supervisor != nil {
		healthLookup = h.Supervisor.Health
	}

	resp, err := analytics.QueryLive(r.Context(), h.DB, h.Tracker, healthLookup)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// Timeseries handles GET /api/v1/analytics/timeseries.
func (h *AnalyticsHandler) Timeseries(w http.ResponseWriter, r *http.Request) {
	rangeStr := r.URL.Query().Get("range")
	var channelID int64
	if chStr := r.URL.Query().Get("channel_id"); chStr != "" {
		channelID, _ = strconv.ParseInt(chStr, 10, 64)
	}

	resp, err := analytics.QueryTimeseries(r.Context(), h.DB, rangeStr, channelID, h.nowFunc())
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// TopMedia handles GET /api/v1/analytics/top-media.
func (h *AnalyticsHandler) TopMedia(w http.ResponseWriter, r *http.Request) {
	rangeStr := r.URL.Query().Get("range")

	resp, err := analytics.QueryTopMedia(r.Context(), h.DB, rangeStr, h.nowFunc())
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}
