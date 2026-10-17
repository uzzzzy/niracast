package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"tv-stream/internal/models"
)

// PlayoutStopper terminates stream playout for a channel.
type PlayoutStopper interface {
	StopStream(channelID int64) error
}

// Reloader re-evaluates channel playout.
type Reloader interface {
	Reload(channelID int64)
}

// ChannelHandler serves channel & playlist CRUD endpoints.
type ChannelHandler struct {
	DB       *sql.DB
	Stopper  PlayoutStopper
	Reloader Reloader
}

func NewChannelHandler(db *sql.DB, stopper ...PlayoutStopper) *ChannelHandler {
	var s PlayoutStopper
	if len(stopper) > 0 {
		s = stopper[0]
	}
	var r Reloader
	if rel, ok := s.(Reloader); ok {
		r = rel
	}
	return &ChannelHandler{DB: db, Stopper: s, Reloader: r}
}

// SetReloader configures an optional Reloader.
func (h *ChannelHandler) SetReloader(r Reloader) {
	h.Reloader = r
}

// Register mounts routes on mux (Go 1.22+ pattern routing).
func (h *ChannelHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/channels", h.list)
	mux.HandleFunc("POST /api/v1/channels", h.create)
	mux.HandleFunc("GET /api/v1/channels/{id}", h.get)
	mux.HandleFunc("PUT /api/v1/channels/{id}", h.update)
	mux.HandleFunc("DELETE /api/v1/channels/{id}", h.delete)
	mux.HandleFunc("GET /api/v1/channels/{id}/playlist", h.getPlaylist)
	mux.HandleFunc("POST /api/v1/channels/{id}/playlist", h.setPlaylist)
}

func chWriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func chWriteError(w http.ResponseWriter, status int, msg string) {
	chWriteJSON(w, status, map[string]string{"error": msg})
}

// chHandleModelErr maps model errors to meaningful HTTP responses.
func chHandleModelErr(w http.ResponseWriter, err error) {
	var mm *models.MediaMissingError
	switch {
	case errors.Is(err, models.ErrNotFound):
		chWriteError(w, http.StatusNotFound, "channel not found")
	case errors.Is(err, models.ErrDuplicateNumber):
		chWriteError(w, http.StatusConflict, err.Error())
	case errors.Is(err, models.ErrInvalidMode):
		chWriteError(w, http.StatusBadRequest, err.Error())
	case errors.As(err, &mm):
		chWriteError(w, http.StatusBadRequest, mm.Error())
	default:
		chWriteError(w, http.StatusInternalServerError, "database error: "+err.Error())
	}
}

func chPathID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		chWriteError(w, http.StatusBadRequest, "invalid channel id")
		return 0, false
	}
	return id, true
}

func chDecode(w http.ResponseWriter, r *http.Request) (models.ChannelInput, bool) {
	var in models.ChannelInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		chWriteError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return in, false
	}
	if in.Number <= 0 {
		chWriteError(w, http.StatusBadRequest, "number must be a positive integer")
		return in, false
	}
	if in.Name == "" {
		chWriteError(w, http.StatusBadRequest, "name is required")
		return in, false
	}
	return in, true
}

func (h *ChannelHandler) list(w http.ResponseWriter, r *http.Request) {
	chs, err := models.ListChannels(h.DB)
	if err != nil {
		chHandleModelErr(w, err)
		return
	}
	chWriteJSON(w, http.StatusOK, chs)
}

func (h *ChannelHandler) get(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		chWriteError(w, http.StatusNotFound, "channel not found")
		return
	}
	c, err := models.GetChannel(h.DB, id)
	if err != nil {
		chHandleModelErr(w, err)
		return
	}
	chWriteJSON(w, http.StatusOK, c)
}

func (h *ChannelHandler) create(w http.ResponseWriter, r *http.Request) {
	in, ok := chDecode(w, r)
	if !ok {
		return
	}
	c, err := models.CreateChannel(h.DB, in)
	if err != nil {
		chHandleModelErr(w, err)
		return
	}
	chWriteJSON(w, http.StatusCreated, c)
}

func (h *ChannelHandler) update(w http.ResponseWriter, r *http.Request) {
	id, ok := chPathID(w, r)
	if !ok {
		return
	}
	in, ok := chDecode(w, r)
	if !ok {
		return
	}
	cur, err := models.GetChannel(h.DB, id)
	if err != nil {
		chHandleModelErr(w, err)
		return
	}
	c, err := models.UpdateChannel(h.DB, id, in)
	if err != nil {
		chHandleModelErr(w, err)
		return
	}
	if h.Reloader != nil && cur.Mode != c.Mode {
		h.Reloader.Reload(id)
	}
	chWriteJSON(w, http.StatusOK, c)
}

func (h *ChannelHandler) delete(w http.ResponseWriter, r *http.Request) {
	id, ok := chPathID(w, r)
	if !ok {
		return
	}
	if err := models.DeleteChannel(h.DB, id); err != nil {
		chHandleModelErr(w, err)
		return
	}
	if h.Stopper != nil {
		_ = h.Stopper.StopStream(id)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *ChannelHandler) getPlaylist(w http.ResponseWriter, r *http.Request) {
	id, ok := chPathID(w, r)
	if !ok {
		return
	}
	pl, err := models.GetPlaylist(h.DB, id)
	if err != nil {
		chHandleModelErr(w, err)
		return
	}
	chWriteJSON(w, http.StatusOK, pl)
}

func (h *ChannelHandler) setPlaylist(w http.ResponseWriter, r *http.Request) {
	id, ok := chPathID(w, r)
	if !ok {
		return
	}
	var in models.PlaylistInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		chWriteError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	items, err := models.SetPlaylist(h.DB, id, in.MediaIDs)
	if err != nil {
		chHandleModelErr(w, err)
		return
	}
	chWriteJSON(w, http.StatusOK, map[string]any{"channel_id": id, "items": items})
}
