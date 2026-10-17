// Package feed generates IPTV M3U playlists and XMLTV EPG documents.
package feed

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/uzzzzy/niracast/internal/models"
	"github.com/uzzzzy/niracast/internal/timeline"
)

// Handler serves the IPTV feed endpoints.
type Handler struct {
	DB   *sql.DB
	Calc *timeline.Calculator
	Now  func() time.Time // injectable clock; defaults to time.Now

	mu       sync.Mutex
	epgCache []byte
	epgUntil time.Time
}

// NewHandler builds a feed Handler.
func NewHandler(db *sql.DB, calc ...*timeline.Calculator) *Handler {
	var c *timeline.Calculator
	if len(calc) > 0 {
		c = calc[0]
	}
	return &Handler{DB: db, Calc: c, Now: time.Now}
}

// Register mounts the feed routes on mux.
func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /iptv/channels.m3u", h.ServeM3U)
	mux.HandleFunc("GET /iptv/epg.xml", h.ServeEPG)
}

func (h *Handler) now() time.Time {
	if h.Now != nil {
		return h.Now()
	}
	return time.Now()
}

func channelXMLID(id int64) string { return fmt.Sprintf("channel-%d", id) }

func m3uAttr(s string) string {
	s = strings.NewReplacer(`"`, "'", "\r", " ", "\n", " ").Replace(s)
	return s
}

// GenerateM3U builds the M3U playlist for the given channels.
func GenerateM3U(channels []models.Channel, host string) string {
	var b strings.Builder
	b.WriteString("#EXTM3U\n")
	for _, c := range channels {
		name := m3uAttr(c.Name)
		fmt.Fprintf(&b, "#EXTINF:-1 tvg-id=\"%s\" tvg-chno=\"%d\" tvg-name=\"%s\",%s\n", channelXMLID(c.ID), c.Number, name, name)
		fmt.Fprintf(&b, "http://%s/channels/%d/live.m3u8\n", host, c.ID)
	}
	return b.String()
}

// ServeM3U handles GET /iptv/channels.m3u.
func (h *Handler) ServeM3U(w http.ResponseWriter, r *http.Request) {
	chans, err := models.ListChannels(h.DB)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/x-mpegurl")
	_, _ = w.Write([]byte(GenerateM3U(chans, r.Host)))
}
