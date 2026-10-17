package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"tv-stream/internal/models"
	"tv-stream/internal/timeline"
)

// ScheduleHandler serves channel schedule and slot management endpoints.
type ScheduleHandler struct {
	DB       *sql.DB
	Reloader Reloader
	Loc      *time.Location
}

// NewScheduleHandler constructs a ScheduleHandler.
func NewScheduleHandler(db *sql.DB, reloader Reloader, loc *time.Location) *ScheduleHandler {
	if loc == nil {
		loc = time.UTC
	}
	return &ScheduleHandler{
		DB:       db,
		Reloader: reloader,
		Loc:      loc,
	}
}

// Register mounts schedule routes on mux.
func (h *ScheduleHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/channels/{id}/schedule", h.getSchedule)
	mux.HandleFunc("POST /api/v1/channels/{id}/schedule/slots", h.createSlot)
	mux.HandleFunc("PUT /api/v1/channels/{id}/schedule/slots/{slotId}", h.updateSlot)
	mux.HandleFunc("DELETE /api/v1/channels/{id}/schedule/slots/{slotId}", h.deleteSlot)
}

// OccurrenceResponse is the JSON schema for occurrences.
type OccurrenceResponse struct {
	SlotID           int64     `json:"slot_id"`
	MediaID          int64     `json:"media_id"`
	Filename         string    `json:"filename"`
	Title            string    `json:"title"`
	StartAt          time.Time `json:"start_at"`
	EndAt            time.Time `json:"end_at"`
	MediaDurationSec float64   `json:"media_duration_sec"`
	Truncated        bool      `json:"truncated"`
	Short            bool      `json:"short"`
	Recurring        bool      `json:"recurring"`
}

type scheduleResponse struct {
	ChannelID   int64                 `json:"channel_id"`
	Timezone    string                `json:"timezone"`
	Slots       []models.ScheduleSlot `json:"slots"`
	Occurrences []OccurrenceResponse  `json:"occurrences"`
}

type conflictSlotJSON struct {
	SlotID  int64     `json:"slot_id"`
	Title   string    `json:"title"`
	StartAt time.Time `json:"start_at"`
	EndAt   time.Time `json:"end_at"`
}

type conflictResponse struct {
	Error    string           `json:"error"`
	Message  string           `json:"message"`
	Conflict conflictSlotJSON `json:"conflict"`
}

func handleScheduleError(w http.ResponseWriter, err error) {
	var confErr *models.ConflictError
	var mm *models.MediaMissingError
	switch {
	case errors.As(err, &confErr):
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(conflictResponse{
			Error:   "schedule_conflict",
			Message: confErr.Error(),
			Conflict: conflictSlotJSON{
				SlotID:  confErr.Slot.ID,
				Title:   confErr.Slot.Title,
				StartAt: confErr.Start.UTC(),
				EndAt:   confErr.End.UTC(),
			},
		})
	case errors.Is(err, models.ErrNotFound):
		chWriteError(w, http.StatusNotFound, "not found")
	case errors.Is(err, models.ErrInvalidSlot):
		chWriteError(w, http.StatusBadRequest, err.Error())
	case errors.As(err, &mm):
		chWriteError(w, http.StatusBadRequest, mm.Error())
	default:
		chWriteError(w, http.StatusInternalServerError, "database error: "+err.Error())
	}
}

func (h *ScheduleHandler) parseChannelID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		chWriteError(w, http.StatusBadRequest, "invalid channel id")
		return 0, false
	}
	var exists int
	err = h.DB.QueryRow(`SELECT 1 FROM channels WHERE id = ?`, id).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		chWriteError(w, http.StatusNotFound, "channel not found")
		return 0, false
	}
	if err != nil {
		chWriteError(w, http.StatusInternalServerError, "database error: "+err.Error())
		return 0, false
	}
	return id, true
}

func (h *ScheduleHandler) parseSlotID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("slotId"), 10, 64)
	if err != nil || id <= 0 {
		chWriteError(w, http.StatusBadRequest, "invalid slot id")
		return 0, false
	}
	return id, true
}

func (h *ScheduleHandler) getSchedule(w http.ResponseWriter, r *http.Request) {
	channelID, ok := h.parseChannelID(w, r)
	if !ok {
		return
	}

	loc := h.Loc
	if loc == nil {
		loc = time.UTC
	}

	// Default from = today 00:00 in server TZ
	nowInLoc := time.Now().In(loc)
	y, m, d := nowInLoc.Date()
	from := time.Date(y, m, d, 0, 0, 0, 0, loc).UTC()
	to := from.Add(7 * 24 * time.Hour)

	if fromStr := r.URL.Query().Get("from"); fromStr != "" {
		parsed, err := time.Parse(time.RFC3339, fromStr)
		if err != nil {
			chWriteError(w, http.StatusBadRequest, "invalid from timestamp: "+err.Error())
			return
		}
		from = parsed.UTC()
	}

	if toStr := r.URL.Query().Get("to"); toStr != "" {
		parsed, err := time.Parse(time.RFC3339, toStr)
		if err != nil {
			chWriteError(w, http.StatusBadRequest, "invalid to timestamp: "+err.Error())
			return
		}
		to = parsed.UTC()
	}

	if !from.Before(to) {
		chWriteError(w, http.StatusBadRequest, "from must be before to")
		return
	}

	if to.Sub(from) > 31*24*time.Hour {
		chWriteError(w, http.StatusBadRequest, "time range exceeds maximum of 31 days")
		return
	}

	slots, err := models.ListSlots(h.DB, channelID)
	if err != nil {
		handleScheduleError(w, err)
		return
	}
	if slots == nil {
		slots = []models.ScheduleSlot{}
	}

	tlSlots, err := models.SlotsToTimeline(h.DB, slots)
	if err != nil {
		handleScheduleError(w, err)
		return
	}

	occs := timeline.Expand(tlSlots, from, to, loc)
	respOccs := make([]OccurrenceResponse, len(occs))
	for i, occ := range occs {
		respOccs[i] = OccurrenceResponse{
			SlotID:           occ.SlotID,
			MediaID:          occ.MediaID,
			Filename:         occ.Filename,
			Title:            occ.Title,
			StartAt:          occ.Start.UTC(),
			EndAt:            occ.End.UTC(),
			MediaDurationSec: occ.MediaDur,
			Truncated:        occ.Truncated,
			Short:            occ.Short,
			Recurring:        occ.Recurring,
		}
	}
	if respOccs == nil {
		respOccs = []OccurrenceResponse{}
	}

	chWriteJSON(w, http.StatusOK, scheduleResponse{
		ChannelID:   channelID,
		Timezone:    loc.String(),
		Slots:       slots,
		Occurrences: respOccs,
	})
}

func (h *ScheduleHandler) decodeSlotInput(w http.ResponseWriter, r *http.Request) (models.SlotInput, bool) {
	var in models.SlotInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		chWriteError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return in, false
	}
	if in.MediaID <= 0 {
		chWriteError(w, http.StatusBadRequest, "media_id is required")
		return in, false
	}
	if in.StartAt.IsZero() {
		chWriteError(w, http.StatusBadRequest, "start_at is required")
		return in, false
	}
	return in, true
}

func (h *ScheduleHandler) createSlot(w http.ResponseWriter, r *http.Request) {
	channelID, ok := h.parseChannelID(w, r)
	if !ok {
		return
	}

	in, ok := h.decodeSlotInput(w, r)
	if !ok {
		return
	}

	slot, err := models.CreateSlot(h.DB, channelID, in, h.Loc)
	if err != nil {
		handleScheduleError(w, err)
		return
	}

	if h.Reloader != nil {
		h.Reloader.Reload(channelID)
	}

	chWriteJSON(w, http.StatusCreated, slot)
}

func (h *ScheduleHandler) updateSlot(w http.ResponseWriter, r *http.Request) {
	channelID, ok := h.parseChannelID(w, r)
	if !ok {
		return
	}

	slotID, ok := h.parseSlotID(w, r)
	if !ok {
		return
	}

	in, ok := h.decodeSlotInput(w, r)
	if !ok {
		return
	}

	slot, err := models.UpdateSlot(h.DB, channelID, slotID, in, h.Loc)
	if err != nil {
		handleScheduleError(w, err)
		return
	}

	if h.Reloader != nil {
		h.Reloader.Reload(channelID)
	}

	chWriteJSON(w, http.StatusOK, slot)
}

func (h *ScheduleHandler) deleteSlot(w http.ResponseWriter, r *http.Request) {
	channelID, ok := h.parseChannelID(w, r)
	if !ok {
		return
	}

	slotID, ok := h.parseSlotID(w, r)
	if !ok {
		return
	}

	if err := models.DeleteSlot(h.DB, channelID, slotID); err != nil {
		handleScheduleError(w, err)
		return
	}

	if h.Reloader != nil {
		h.Reloader.Reload(channelID)
	}

	w.WriteHeader(http.StatusNoContent)
}
