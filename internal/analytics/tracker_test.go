package analytics

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestTracker_ActiveViewers(t *testing.T) {
	curr := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)
	tracker := NewTracker()
	tracker.SetNow(func() time.Time { return curr })

	// Client 1 pings channel 1
	tracker.RecordPing(1, "client1", curr)
	// Client 2 pings channel 1
	tracker.RecordPing(1, "client2", curr)
	// Client 3 pings channel 2
	tracker.RecordPing(2, "client3", curr)

	if v := tracker.ChannelViewers(1); v != 2 {
		t.Errorf("ChannelViewers(1) = %d, want 2", v)
	}
	if v := tracker.ChannelViewers(2); v != 1 {
		t.Errorf("ChannelViewers(2) = %d, want 1", v)
	}
	if tot := tracker.TotalViewers(); tot != 3 {
		t.Errorf("TotalViewers() = %d, want 3", tot)
	}

	// Advance time by 8s -> clients still active (<= 10s)
	curr = curr.Add(8 * time.Second)
	if v := tracker.ChannelViewers(1); v != 2 {
		t.Errorf("ChannelViewers(1) at +8s = %d, want 2", v)
	}

	// Client 1 pings again at +8s
	tracker.RecordPing(1, "client1", curr)

	// Advance time to +12s from start (+4s from last ping)
	curr = curr.Add(4 * time.Second)
	// Client 2 and 3 should have expired (12s > 10s)
	// Client 1 was pinged at +8s, so 12s - 8s = 4s <= 10s (active)
	if v := tracker.ChannelViewers(1); v != 1 {
		t.Errorf("ChannelViewers(1) at +12s = %d, want 1", v)
	}
	if v := tracker.ChannelViewers(2); v != 0 {
		t.Errorf("ChannelViewers(2) at +12s = %d, want 0", v)
	}
	if tot := tracker.TotalViewers(); tot != 1 {
		t.Errorf("TotalViewers() at +12s = %d, want 1", tot)
	}

	// Advance time to +20s -> all inactive
	curr = curr.Add(8 * time.Second)
	if tot := tracker.TotalViewers(); tot != 0 {
		t.Errorf("TotalViewers() at +20s = %d, want 0", tot)
	}
}

func TestTracker_ClientID_DailySalt(t *testing.T) {
	tracker := NewTracker()
	day1 := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)
	day2 := time.Date(2026, 10, 19, 12, 0, 0, 0, time.UTC)

	req := httptest.NewRequest("GET", "/channels/1/live.m3u8", nil)
	req.RemoteAddr = "192.168.1.50:12345"
	req.Header.Set("User-Agent", "TestPlayer/1.0")

	id1 := tracker.ClientID(req, day1)
	id1Again := tracker.ClientID(req, day1)
	if id1 != id1Again {
		t.Errorf("expected deterministic client ID on same day, got %q vs %q", id1, id1Again)
	}

	id2 := tracker.ClientID(req, day2)
	if id1 == id2 {
		t.Errorf("client ID should rotate on next day: %q == %q", id1, id2)
	}

	// Verify no raw IP leaked in hash
	if strings.Contains(id1, "192.168.1.50") {
		t.Error("client ID must not contain raw IP")
	}
}

func TestTracker_WrapHLS_ObserveArrivalAndUnwrap(t *testing.T) {
	curr := time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC)
	tracker := NewTracker()
	tracker.SetNow(func() time.Time { return curr })

	observedActiveDuringHandler := false

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify Unwrap() is supported
		if unwrap, ok := w.(interface{ Unwrap() http.ResponseWriter }); !ok || unwrap.Unwrap() == nil {
			t.Error("ResponseWriter wrapper must implement Unwrap()")
		}

		// Verify client was observed at request arrival BEFORE inner handler finished
		if tracker.ChannelViewers(1) == 1 {
			observedActiveDuringHandler = true
		}

		w.Header().Set("Content-Type", "video/mp2t")
		_, _ = w.Write([]byte("segment data 1234567890"))
	})

	wrapped := tracker.WrapHLS(inner)

	req := httptest.NewRequest("GET", "/channels/1/segment0.ts", nil)
	req.SetPathValue("id", "1")
	req.RemoteAddr = "10.0.0.1:5000"
	rec := httptest.NewRecorder()

	wrapped.ServeHTTP(rec, req)

	if !observedActiveDuringHandler {
		t.Error("client activity was not observed at request arrival")
	}

	// Check pending bytes recorded
	drained := tracker.Drain(true)
	var totalBytes int64
	for _, stat := range drained {
		totalBytes += stat.BytesOut
	}
	if totalBytes != int64(len("segment data 1234567890")) {
		t.Errorf("BytesOut = %d, want %d", totalBytes, len("segment data 1234567890"))
	}
}
