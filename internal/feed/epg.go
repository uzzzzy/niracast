package feed

import (
	"database/sql"
	"encoding/xml"
	"fmt"
	"math"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"tv-stream/internal/models"
	"tv-stream/internal/timeline"
)

const (
	epgWindow   = 24 * time.Hour
	epgCacheTTL = time.Minute
	xmltvLayout = "20060102150405"
)

type xmltvChannel struct {
	ID          string `xml:"id,attr"`
	DisplayName string `xml:"display-name"`
}

type xmltvProgramme struct {
	Start   string `xml:"start,attr"`
	Stop    string `xml:"stop,attr"`
	Channel string `xml:"channel,attr"`
	Title   string `xml:"title"`
}

type xmltvDoc struct {
	XMLName   xml.Name         `xml:"tv"`
	Generator string           `xml:"generator-info-name,attr"`
	Channels  []xmltvChannel   `xml:"channel"`
	Programme []xmltvProgramme `xml:"programme"`
}

// xmltvTime formats t as XMLTV "YYYYMMDDhhmmss +0000" (always UTC).
func xmltvTime(t time.Time) string { return t.UTC().Format(xmltvLayout) + " +0000" }

type scheduledItem struct {
	title string
	start time.Time
	end   time.Time
}

// upcoming expands the looping playlist into items overlapping [now, now+window].
func upcoming(items []timeline.Item, now time.Time, window time.Duration) []scheduledItem {
	var total float64
	for _, it := range items {
		if it.Duration > 0 {
			total += it.Duration
		}
	}
	if total <= 0 {
		return nil
	}
	t := float64(now.Unix()) + float64(now.Nanosecond())/1e9
	pos := math.Mod(t, total)
	if pos < 0 {
		pos += total
	}
	// Find the loop cycle start and walk forward from it.
	cycleStart := now.Add(-time.Duration(pos * float64(time.Second)))
	end := now.Add(window)
	var out []scheduledItem
	for cs := cycleStart; cs.Before(end); cs = cs.Add(time.Duration(total * float64(time.Second))) {
		acc := 0.0
		for _, it := range items {
			if it.Duration <= 0 {
				continue
			}
			s := cs.Add(time.Duration(acc * float64(time.Second)))
			e := cs.Add(time.Duration((acc + it.Duration) * float64(time.Second)))
			acc += it.Duration
			if !e.After(now) {
				continue
			}
			if !s.Before(end) {
				break
			}
			title := strings.TrimSuffix(filepath.Base(it.FilePath), filepath.Ext(it.FilePath))
			out = append(out, scheduledItem{title: title, start: s.Truncate(time.Second), end: e.Truncate(time.Second)})
		}
	}
	return out
}

// EPGCalculator calculates upcoming programmes for XMLTV EPG generation.
type EPGCalculator interface {
	Programmes(channelID int64, from, to time.Time) ([]timeline.UpcomingItem, error)
}

// GenerateEPG builds the XMLTV document for the next 24h.
func GenerateEPG(channels []models.Channel, calc EPGCalculator, load timeline.Loader, now time.Time) ([]byte, error) {
	doc := xmltvDoc{Generator: "tv-stream"}
	for _, c := range channels {
		doc.Channels = append(doc.Channels, xmltvChannel{ID: channelXMLID(c.ID), DisplayName: c.Name})
	}
	for _, c := range channels {
		if c.Mode == "scheduled" && calc != nil {
			progs, err := calc.Programmes(c.ID, now, now.Add(epgWindow))
			if err != nil {
				return nil, fmt.Errorf("load programmes for channel %d: %w", c.ID, err)
			}
			for _, p := range progs {
				title := p.Title
				if p.Kind == "slate" {
					title = "Siaran Segera Kembali"
				}
				doc.Programme = append(doc.Programme, xmltvProgramme{
					Start:   xmltvTime(p.StartAt.Truncate(time.Second)),
					Stop:    xmltvTime(p.EndAt.Truncate(time.Second)),
					Channel: channelXMLID(c.ID),
					Title:   title,
				})
			}
		} else if load != nil {
			items, err := load(c.ID)
			if err != nil {
				return nil, fmt.Errorf("load playlist for channel %d: %w", c.ID, err)
			}
			for _, s := range upcoming(items, now, epgWindow) {
				doc.Programme = append(doc.Programme, xmltvProgramme{
					Start:   xmltvTime(s.start),
					Stop:    xmltvTime(s.end),
					Channel: channelXMLID(c.ID),
					Title:   s.title,
				})
			}
		}
	}
	body, err := xml.MarshalIndent(doc, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("marshal xmltv: %w", err)
	}
	header := "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE tv SYSTEM \"xmltv.dtd\">\n"
	return append([]byte(header), append(body, '\n')...), nil
}

// ServeEPG handles GET /iptv/epg.xml with a short in-memory cache.
func (h *Handler) ServeEPG(w http.ResponseWriter, r *http.Request) {
	now := h.now()
	h.mu.Lock()
	if h.epgCache != nil && now.Before(h.epgUntil) {
		data := h.epgCache
		h.mu.Unlock()
		writeXML(w, data)
		return
	}
	h.mu.Unlock()

	chans, err := models.ListChannels(h.DB)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	calc := h.Calc
	if calc == nil {
		calc = timeline.NewDBCalculator(h.DB)
	}
	data, err := GenerateEPG(chans, calc, dbLoader(h.DB), now)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	h.mu.Lock()
	h.epgCache, h.epgUntil = data, now.Add(epgCacheTTL)
	h.mu.Unlock()
	writeXML(w, data)
}

func writeXML(w http.ResponseWriter, data []byte) {
	w.Header().Set("Content-Type", "application/xml")
	_, _ = w.Write(data)
}

// dbLoader reads a channel's ordered playlist from SQLite.
func dbLoader(db *sql.DB) timeline.Loader {
	return func(channelID int64) ([]timeline.Item, error) {
		rows, err := db.Query(`SELECT m.id, m.path, COALESCE(m.duration_sec, 0)
			FROM playlist_items s JOIN media_files m ON m.id = s.media_id
			WHERE s.channel_id = ? ORDER BY s.position_order, s.id`, channelID)
		if err != nil {
			return nil, fmt.Errorf("query playlist: %w", err)
		}
		defer rows.Close()
		var items []timeline.Item
		for rows.Next() {
			var it timeline.Item
			if err := rows.Scan(&it.MediaID, &it.FilePath, &it.Duration); err != nil {
				return nil, fmt.Errorf("scan playlist: %w", err)
			}
			items = append(items, it)
		}
		return items, rows.Err()
	}
}
