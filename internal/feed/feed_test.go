package feed

import (
	"encoding/xml"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/uzzzzy/niracast/internal/db"
	"github.com/uzzzzy/niracast/internal/models"
)

func setup(t *testing.T) *Handler {
	t.Helper()
	conn, err := db.InitDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	ch, err := models.CreateChannel(conn, models.ChannelInput{Number: 1, Name: "Classic Movies"})
	if err != nil {
		t.Fatal(err)
	}
	var ids []int64
	for i, p := range []string{"/m/Sample Movie.mp4", "/m/Other.mkv"} {
		res, err := conn.Exec(`INSERT INTO media_files (path, filename, duration_sec) VALUES (?, ?, ?)`, p, p, 3600*(i+1))
		if err != nil {
			t.Fatal(err)
		}
		id, _ := res.LastInsertId()
		ids = append(ids, id)
	}
	if _, err := models.SetPlaylist(conn, ch.ID, ids); err != nil {
		t.Fatal(err)
	}
	h := NewHandler(conn)
	h.Now = func() time.Time { return time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC) }
	return h
}

func TestM3U(t *testing.T) {
	h := setup(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/iptv/channels.m3u", nil)
	req.Host = "tv.local:8080"
	h.ServeM3U(rec, req)
	if ct := rec.Header().Get("Content-Type"); ct != "application/x-mpegurl" {
		t.Fatalf("content-type %q", ct)
	}
	body := rec.Body.String()
	if !strings.HasPrefix(body, "#EXTM3U\n") {
		t.Fatalf("missing header: %q", body)
	}
	want := "#EXTINF:-1 tvg-id=\"channel-1\" tvg-chno=\"1\" tvg-name=\"Classic Movies\",Classic Movies\nhttp://tv.local:8080/channels/1/live.m3u8\n"
	if !strings.Contains(body, want) {
		t.Fatalf("unexpected body: %q", body)
	}
}

func TestEPG(t *testing.T) {
	h := setup(t)
	rec := httptest.NewRecorder()
	h.ServeEPG(rec, httptest.NewRequest(http.MethodGet, "/iptv/epg.xml", nil))
	if ct := rec.Header().Get("Content-Type"); ct != "application/xml" {
		t.Fatalf("content-type %q", ct)
	}
	var doc xmltvDoc
	if err := xml.Unmarshal(rec.Body.Bytes(), &doc); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if doc.Generator != "niracast" || len(doc.Channels) != 1 || doc.Channels[0].DisplayName != "Classic Movies" {
		t.Fatalf("bad doc: %+v", doc)
	}
	if len(doc.Programme) < 8 {
		t.Fatalf("expected programmes covering 24h, got %d", len(doc.Programme))
	}
	re := regexp.MustCompile(`^\d{14} \+0000$`)
	for _, p := range doc.Programme {
		if !re.MatchString(p.Start) || !re.MatchString(p.Stop) {
			t.Fatalf("bad timestamp: %+v", p)
		}
		if p.Channel != "channel-1" || p.Title == "" {
			t.Fatalf("bad programme: %+v", p)
		}
	}
	if !strings.Contains(rec.Body.String(), "<!DOCTYPE tv SYSTEM \"xmltv.dtd\">") {
		t.Fatal("missing doctype")
	}
}

func TestEPGCache(t *testing.T) {
	h := setup(t)
	get := func() string {
		rec := httptest.NewRecorder()
		h.ServeEPG(rec, httptest.NewRequest(http.MethodGet, "/iptv/epg.xml", nil))
		return rec.Body.String()
	}
	first := get()
	if _, err := models.CreateChannel(h.DB, models.ChannelInput{Number: 2, Name: "New"}); err != nil {
		t.Fatal(err)
	}
	if get() != first {
		t.Fatal("expected cached response")
	}
	base := h.Now()
	h.Now = func() time.Time { return base.Add(2 * time.Minute) }
	if get() == first {
		t.Fatal("expected regenerated response after TTL")
	}
}

func TestEPG_ScheduledChannel(t *testing.T) {
	conn, err := db.InitDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	ch, err := models.CreateChannel(conn, models.ChannelInput{Number: 10, Name: "Scheduled Channel", Mode: "scheduled"})
	if err != nil {
		t.Fatal(err)
	}

	res, err := conn.Exec(`INSERT INTO media_files (path, filename, duration_sec) VALUES ('/m/sched.mp4', 'sched.mp4', 1800)`)
	if err != nil {
		t.Fatal(err)
	}
	mid, _ := res.LastInsertId()

	now := time.Date(2026, 10, 17, 12, 0, 0, 0, time.UTC)
	// Create slot: 13:00 to 13:30 (after a 1-hour gap from 12:00 to 13:00)
	_, err = models.CreateSlot(conn, ch.ID, models.SlotInput{
		MediaID:     mid,
		StartAt:     now.Add(1 * time.Hour),
		DurationSec: 1800,
		Recurrence:  "none",
	}, time.UTC)
	if err != nil {
		t.Fatal(err)
	}

	h := NewHandler(conn)
	h.Now = func() time.Time { return now }

	rec := httptest.NewRecorder()
	h.ServeEPG(rec, httptest.NewRequest(http.MethodGet, "/iptv/epg.xml", nil))
	if ct := rec.Header().Get("Content-Type"); ct != "application/xml" {
		t.Fatalf("content-type %q", ct)
	}

	var doc xmltvDoc
	if err := xml.Unmarshal(rec.Body.Bytes(), &doc); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if len(doc.Programme) == 0 {
		t.Fatal("expected programmes for scheduled channel, got 0")
	}

	// First programme should be the slate (gap from 12:00 to 13:00)
	hasSlate := false
	hasReal := false
	for _, p := range doc.Programme {
		if p.Title == "Siaran Segera Kembali" {
			hasSlate = true
		}
		if p.Title == "sched" {
			hasReal = true
		}
	}
	if !hasSlate {
		t.Errorf("expected slate 'Siaran Segera Kembali' in XMLTV for scheduled channel gap")
	}
	if !hasReal {
		t.Errorf("expected programme 'sched' in XMLTV for scheduled channel slot")
	}
}
