package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/uzzzzy/niracast/internal/db"
)

func setupScheduleTest(t *testing.T) (*ScheduleHandler, *fakeReloader, func(method, path, body string) *httptest.ResponseRecorder) {
	t.Helper()
	conn, err := db.InitDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })

	if _, err := conn.Exec(`INSERT INTO media_files (id, path, filename, duration_sec) VALUES
		(1, '/media/a.mp4', 'a.mp4', 1800),
		(2, '/media/b.mp4', 'b.mp4', 3600)`); err != nil {
		t.Fatal(err)
	}

	if _, err := conn.Exec(`INSERT INTO channels (id, number, name, mode) VALUES (1, 10, 'Channel 10', 'scheduled')`); err != nil {
		t.Fatal(err)
	}

	reloader := &fakeReloader{}
	loc := time.UTC
	h := NewScheduleHandler(conn, reloader, loc)
	mux := http.NewServeMux()
	h.Register(mux)

	do := func(method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		return rec
	}

	return h, reloader, do
}

func TestScheduleCRUD_AndReload(t *testing.T) {
	_, reloader, do := setupScheduleTest(t)

	// 1. Initially empty schedule
	recGet := do("GET", "/api/v1/channels/1/schedule", "")
	chExpect(t, recGet, 200)

	var schedResp scheduleResponse
	if err := json.Unmarshal(recGet.Body.Bytes(), &schedResp); err != nil {
		t.Fatalf("unmarshal schedule response: %v", err)
	}
	if schedResp.ChannelID != 1 {
		t.Errorf("channel_id = %d, want 1", schedResp.ChannelID)
	}
	if schedResp.Timezone != "UTC" {
		t.Errorf("timezone = %q, want UTC", schedResp.Timezone)
	}
	if len(schedResp.Slots) != 0 || len(schedResp.Occurrences) != 0 {
		t.Errorf("expected empty slots and occurrences, got %d slots and %d occs", len(schedResp.Slots), len(schedResp.Occurrences))
	}

	// 2. Create slot
	startAt := time.Date(2026, 10, 18, 10, 0, 0, 0, time.UTC).Format(time.RFC3339)
	createBody := fmt.Sprintf(`{"media_id":1,"start_at":%q,"duration_sec":1800,"recurrence":"none"}`, startAt)
	recCreate := do("POST", "/api/v1/channels/1/schedule/slots", createBody)
	chExpect(t, recCreate, 201)

	var slotResp struct {
		ID               int64   `json:"id"`
		ChannelID        int64   `json:"channel_id"`
		MediaID          int64   `json:"media_id"`
		Filename         string  `json:"filename"`
		Title            string  `json:"title"`
		StartAt          string  `json:"start_at"`
		DurationSec      float64 `json:"duration_sec"`
		MediaDurationSec float64 `json:"media_duration_sec"`
		Recurrence       string  `json:"recurrence"`
	}
	if err := json.Unmarshal(recCreate.Body.Bytes(), &slotResp); err != nil {
		t.Fatalf("unmarshal slot response: %v", err)
	}
	if slotResp.ID == 0 || slotResp.ChannelID != 1 || slotResp.MediaID != 1 {
		t.Errorf("unexpected slot response: %+v", slotResp)
	}
	if slotResp.Title != "a" || slotResp.Filename != "a.mp4" {
		t.Errorf("title=%q, filename=%q", slotResp.Title, slotResp.Filename)
	}
	if len(reloader.reloaded) != 1 || reloader.reloaded[0] != 1 {
		t.Errorf("expected reload for channel 1 on create, got: %v", reloader.reloaded)
	}

	// 3. GET schedule with explicit window overlapping the slot
	fromQuery := "2026-10-18T00:00:00Z"
	toQuery := "2026-10-19T00:00:00Z"
	recGet2 := do("GET", fmt.Sprintf("/api/v1/channels/1/schedule?from=%s&to=%s", fromQuery, toQuery), "")
	chExpect(t, recGet2, 200)

	var schedResp2 scheduleResponse
	if err := json.Unmarshal(recGet2.Body.Bytes(), &schedResp2); err != nil {
		t.Fatalf("unmarshal schedule response: %v", err)
	}
	if len(schedResp2.Slots) != 1 {
		t.Fatalf("expected 1 slot, got %d", len(schedResp2.Slots))
	}
	if len(schedResp2.Occurrences) != 1 {
		t.Fatalf("expected 1 occurrence, got %d", len(schedResp2.Occurrences))
	}
	occ := schedResp2.Occurrences[0]
	if occ.Title != "a" || occ.MediaID != 1 || occ.Truncated || occ.Short || occ.Recurring {
		t.Errorf("unexpected occurrence: %+v", occ)
	}

	// 4. Update slot
	slotID := slotResp.ID
	newStartAt := time.Date(2026, 10, 18, 11, 0, 0, 0, time.UTC).Format(time.RFC3339)
	updateBody := fmt.Sprintf(`{"media_id":2,"start_at":%q,"duration_sec":3600,"recurrence":"none"}`, newStartAt)
	recUpdate := do("PUT", fmt.Sprintf("/api/v1/channels/1/schedule/slots/%d", slotID), updateBody)
	chExpect(t, recUpdate, 200)
	if len(reloader.reloaded) != 2 || reloader.reloaded[1] != 1 {
		t.Errorf("expected reload on update, got: %v", reloader.reloaded)
	}

	// 5. Delete slot
	recDel := do("DELETE", fmt.Sprintf("/api/v1/channels/1/schedule/slots/%d", slotID), "")
	chExpect(t, recDel, 204)
	if len(reloader.reloaded) != 3 || reloader.reloaded[2] != 1 {
		t.Errorf("expected reload on delete, got: %v", reloader.reloaded)
	}

	// 6. Delete again -> 404
	chExpect(t, do("DELETE", fmt.Sprintf("/api/v1/channels/1/schedule/slots/%d", slotID), ""), 404)
}

func TestScheduleValidationAndErrors(t *testing.T) {
	_, _, do := setupScheduleTest(t)

	// GET 404 on unknown channel
	chExpect(t, do("GET", "/api/v1/channels/999/schedule", ""), 404)
	// GET 400 on non-numeric channel
	chExpect(t, do("GET", "/api/v1/channels/abc/schedule", ""), 400)

	// GET 400 on bad timestamps
	chExpect(t, do("GET", "/api/v1/channels/1/schedule?from=invalid", ""), 400)
	chExpect(t, do("GET", "/api/v1/channels/1/schedule?to=invalid", ""), 400)
	chExpect(t, do("GET", "/api/v1/channels/1/schedule?from=2026-10-20T00:00:00Z&to=2026-10-10T00:00:00Z", ""), 400)
	// Range > 31 days -> 400
	chExpect(t, do("GET", "/api/v1/channels/1/schedule?from=2026-10-01T00:00:00Z&to=2026-11-05T00:00:00Z", ""), 400)

	// POST 400 on bad JSON
	chExpect(t, do("POST", "/api/v1/channels/1/schedule/slots", `bad-json`), 400)
	// POST 400 on missing media_id or start_at
	chExpect(t, do("POST", "/api/v1/channels/1/schedule/slots", `{"media_id":0,"start_at":"2026-10-18T10:00:00Z"}`), 400)
	chExpect(t, do("POST", "/api/v1/channels/1/schedule/slots", `{"media_id":1}`), 400)

	// POST 400 on invalid duration
	chExpect(t, do("POST", "/api/v1/channels/1/schedule/slots", `{"media_id":1,"start_at":"2026-10-18T10:00:00Z","duration_sec":90000}`), 400)
	chExpect(t, do("POST", "/api/v1/channels/1/schedule/slots", `{"media_id":1,"start_at":"2026-10-18T10:00:00Z","duration_sec":-1}`), 400)

	// POST 400 on unknown media
	chExpect(t, do("POST", "/api/v1/channels/1/schedule/slots", `{"media_id":999,"start_at":"2026-10-18T10:00:00Z"}`), 400)

	// POST 404 on unknown channel
	chExpect(t, do("POST", "/api/v1/channels/999/schedule/slots", `{"media_id":1,"start_at":"2026-10-18T10:00:00Z"}`), 404)

	// PUT 404 on unknown slot
	chExpect(t, do("PUT", "/api/v1/channels/1/schedule/slots/999", `{"media_id":1,"start_at":"2026-10-18T10:00:00Z"}`), 404)
}

func TestScheduleConflict_409Body(t *testing.T) {
	_, _, do := setupScheduleTest(t)

	// 1. Create slot 1: 10:00 to 11:00 (3600s)
	start1 := "2026-10-18T10:00:00Z"
	rec1 := do("POST", "/api/v1/channels/1/schedule/slots", fmt.Sprintf(`{"media_id":2,"start_at":%q,"duration_sec":3600}`, start1))
	chExpect(t, rec1, 201)

	// 2. Create overlapping slot: 10:30 to 11:00 -> 409 Conflict
	startOverlap := "2026-10-18T10:30:00Z"
	recConf := do("POST", "/api/v1/channels/1/schedule/slots", fmt.Sprintf(`{"media_id":1,"start_at":%q,"duration_sec":1800}`, startOverlap))
	chExpect(t, recConf, 409)

	var confResp conflictResponse
	if err := json.Unmarshal(recConf.Body.Bytes(), &confResp); err != nil {
		t.Fatalf("unmarshal conflict response: %v", err)
	}
	if confResp.Error != "schedule_conflict" {
		t.Errorf("error = %q, want 'schedule_conflict'", confResp.Error)
	}
	if confResp.Conflict.SlotID != 1 {
		t.Errorf("conflict slot_id = %d, want 1", confResp.Conflict.SlotID)
	}
	if confResp.Conflict.Title != "b" {
		t.Errorf("conflict title = %q, want 'b'", confResp.Conflict.Title)
	}
	if confResp.Conflict.StartAt.IsZero() || confResp.Conflict.EndAt.IsZero() {
		t.Errorf("conflict timestamps zero: %+v", confResp.Conflict)
	}
}
