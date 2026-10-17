package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"tv-stream/internal/auth"
	"tv-stream/internal/events"
	"tv-stream/internal/ingest"
	"tv-stream/internal/stream"
	"tv-stream/internal/timeline"
)

// fakeStatusCtrl drives process lifecycle for status tests.
type fakeStatusCtrl struct {
	mu      sync.Mutex
	running map[int64]chan struct{}
}

func newFakeStatusCtrl() *fakeStatusCtrl {
	return &fakeStatusCtrl{running: make(map[int64]chan struct{})}
}

func (f *fakeStatusCtrl) StartStream(_ context.Context, cfg stream.StreamConfig) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	ch := make(chan struct{})
	f.running[cfg.ChannelID] = ch
	return nil
}

func (f *fakeStatusCtrl) StopStream(id int64) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if ch, ok := f.running[id]; ok {
		delete(f.running, id)
		close(ch)
	}
	return nil
}

func (f *fakeStatusCtrl) IsRunning(id int64) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	_, ok := f.running[id]
	return ok
}

func (f *fakeStatusCtrl) Done(id int64) <-chan struct{} {
	f.mu.Lock()
	defer f.mu.Unlock()
	if ch, ok := f.running[id]; ok {
		return ch
	}
	closed := make(chan struct{})
	close(closed)
	return closed
}

func (f *fakeStatusCtrl) StderrTail(_ int64) string { return "" }

type staticPlayoutCalc struct {
	mu    sync.Mutex
	items map[int64]*timeline.PlayoutItem
}

func (s *staticPlayoutCalc) GetCurrentPlayout(channelID int64, _ time.Time) (*timeline.PlayoutItem, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if it, ok := s.items[channelID]; ok && it != nil {
		return it, nil
	}
	return nil, timeline.ErrEmptyPlaylist
}

func TestStatus_404And200Shape(t *testing.T) {
	conn, root := openRealDB(t)

	_, err := conn.Exec(`INSERT INTO channels (id, number, name) VALUES (1, 101, 'Test Channel')`)
	if err != nil {
		t.Fatalf("insert channel: %v", err)
	}

	tempMedia := filepath.Join(t.TempDir(), "movie.mp4")
	_ = os.WriteFile(tempMedia, []byte("stub-video"), 0o644)

	_, err = conn.Exec(`INSERT INTO media_files (id, path, filename, duration_sec, codec_video, codec_audio) 
		VALUES (10, ?, 'movie.mp4', 120.5, 'h264', 'aac')`, tempMedia)
	if err != nil {
		t.Fatalf("insert media_files: %v", err)
	}

	calc := &staticPlayoutCalc{
		items: map[int64]*timeline.PlayoutItem{
			1: {MediaID: 10, FilePath: tempMedia, SeekSeconds: 15.5, RemainingSec: 105.0},
		},
	}
	ctrl := newFakeStatusCtrl()
	active := &testActive{}
	codecLook := func(_ int64) ingest.MediaMetadata {
		return ingest.MediaMetadata{VideoCodec: "h264", AudioCodec: "aac"}
	}

	sv := stream.NewSupervisor(calc, ctrl, active, codecLook, "idle.mp4", root)
	hub := events.NewHub()
	sv.SetPublisher(hub)

	h := newStatusHandler(conn, sv, hub)
	mux := http.NewServeMux()
	h.register(mux)

	// 1. Unknown channel returns 404
	req404 := httptest.NewRequest(http.MethodGet, "/api/v1/channels/999/status", nil)
	rec404 := httptest.NewRecorder()
	mux.ServeHTTP(rec404, req404)
	if rec404.Code != http.StatusNotFound {
		t.Errorf("GET unknown channel status: got %d, want 404", rec404.Code)
	}

	// 2. Known channel with no loop running returns 200 with state="stopped" and item=null
	reqStopped := httptest.NewRequest(http.MethodGet, "/api/v1/channels/1/status", nil)
	recStopped := httptest.NewRecorder()
	mux.ServeHTTP(recStopped, reqStopped)
	if recStopped.Code != http.StatusOK {
		t.Fatalf("GET stopped channel status: got %d, want 200", recStopped.Code)
	}

	var resStopped channelStatusResponse
	if err := json.Unmarshal(recStopped.Body.Bytes(), &resStopped); err != nil {
		t.Fatalf("unmarshal stopped response: %v", err)
	}
	if resStopped.ChannelID != 1 || resStopped.State != "stopped" || resStopped.Item != nil {
		t.Errorf("stopped status unexpected shape: %+v", resStopped)
	}

	// 3. Start channel playout loop and verify playing state 200 JSON shape
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sv.Ensure(ctx, 1)

	// Wait until supervisor starts playing
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if sv.Status(1).State == "playing" {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	reqPlaying := httptest.NewRequest(http.MethodGet, "/api/v1/channels/1/status", nil)
	recPlaying := httptest.NewRecorder()
	mux.ServeHTTP(recPlaying, reqPlaying)
	if recPlaying.Code != http.StatusOK {
		t.Fatalf("GET playing channel status: got %d, want 200", recPlaying.Code)
	}

	var resPlaying channelStatusResponse
	if err := json.Unmarshal(recPlaying.Body.Bytes(), &resPlaying); err != nil {
		t.Fatalf("unmarshal playing response: %v", err)
	}

	if resPlaying.ChannelID != 1 {
		t.Errorf("channel_id = %d, want 1", resPlaying.ChannelID)
	}
	if resPlaying.State != "playing" {
		t.Errorf("state = %q, want 'playing'", resPlaying.State)
	}
	if resPlaying.Item == nil {
		t.Fatal("item is nil, want statusItemResponse")
	}
	if resPlaying.Item.MediaID != 10 {
		t.Errorf("item.media_id = %d, want 10", resPlaying.Item.MediaID)
	}
	if resPlaying.Item.Filename != "movie.mp4" {
		t.Errorf("item.filename = %q, want 'movie.mp4'", resPlaying.Item.Filename)
	}
	if resPlaying.Item.DurationSec != 120.5 {
		t.Errorf("item.duration_sec = %f, want 120.5", resPlaying.Item.DurationSec)
	}
	if resPlaying.Item.RemainingSec <= 0 {
		t.Errorf("item.remaining_sec = %f, want > 0", resPlaying.Item.RemainingSec)
	}
}

func TestSkip_AuthAndResponses(t *testing.T) {
	conn, root := openRealDB(t)

	_, err := conn.Exec(`INSERT INTO channels (id, number, name) VALUES (1, 101, 'Idle Chan'), (2, 102, 'Play Chan')`)
	if err != nil {
		t.Fatalf("insert channels: %v", err)
	}

	realMedia := filepath.Join(t.TempDir(), "ch2_video.mp4")
	_ = os.WriteFile(realMedia, []byte("stub-data"), 0o644)
	_, _ = conn.Exec(`INSERT INTO media_files (id, path, filename, duration_sec, codec_video, codec_audio) 
		VALUES (20, ?, 'ch2_video.mp4', 80.0, 'h264', 'aac')`, realMedia)

	calc := &staticPlayoutCalc{
		items: map[int64]*timeline.PlayoutItem{
			// channel 1 has no item -> ErrEmptyPlaylist (idle)
			2: {MediaID: 20, FilePath: realMedia, SeekSeconds: 10, RemainingSec: 70},
		},
	}
	ctrl := newFakeStatusCtrl()
	active := &testActive{}
	codecLook := func(_ int64) ingest.MediaMetadata {
		return ingest.MediaMetadata{VideoCodec: "h264", AudioCodec: "aac"}
	}

	sv := stream.NewSupervisor(calc, ctrl, active, codecLook, "idle.mp4", root)
	hub := events.NewHub()
	sv.SetPublisher(hub)

	adminPass := "test-skip-secret"
	sessionSecret := []byte("secret-key-32-bytes-long-here!!!")
	authHandler := auth.New(auth.Config{
		AdminPassword: adminPass,
		SessionSecret: sessionSecret,
	})

	statusH := newStatusHandler(conn, sv, hub)
	mux := http.NewServeMux()
	authHandler.Register(mux)
	statusH.register(mux)

	handler := authHandler.Protect(mux, nil)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sv.Ensure(ctx, 1) // enters idle
	sv.Ensure(ctx, 2) // enters playing

	// Wait for loop states to establish
	time.Sleep(50 * time.Millisecond)

	// 1. Skip 401 when anonymous
	reqAnon := httptest.NewRequest(http.MethodPost, "/api/v1/channels/2/skip", nil)
	recAnon := httptest.NewRecorder()
	handler.ServeHTTP(recAnon, reqAnon)
	if recAnon.Code != http.StatusUnauthorized {
		t.Errorf("unauthenticated POST skip: got %d, want 401", recAnon.Code)
	}

	// Login to get session cookie and CSRF token
	loginBody, _ := json.Marshal(map[string]string{"password": adminPass})
	reqLogin := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(loginBody))
	recLogin := httptest.NewRecorder()
	handler.ServeHTTP(recLogin, reqLogin)
	if recLogin.Code != http.StatusOK {
		t.Fatalf("login failed: %d", recLogin.Code)
	}

	var loginRes map[string]string
	_ = json.Unmarshal(recLogin.Body.Bytes(), &loginRes)
	csrf := loginRes["csrf"]

	var sessionCookie *http.Cookie
	for _, c := range recLogin.Result().Cookies() {
		if c.Name == auth.SessionCookieName {
			sessionCookie = c
			break
		}
	}
	if sessionCookie == nil {
		t.Fatal("missing session cookie")
	}

	// 2. Skip 404 when channel is unknown
	req404 := httptest.NewRequest(http.MethodPost, "/api/v1/channels/999/skip", nil)
	req404.Header.Set("X-CSRF-Token", csrf)
	req404.AddCookie(sessionCookie)
	rec404 := httptest.NewRecorder()
	handler.ServeHTTP(rec404, req404)
	if rec404.Code != http.StatusNotFound {
		t.Errorf("skip unknown channel: got %d, want 404", rec404.Code)
	}

	// 3. Skip 409 when channel is idle (not playing a real item)
	reqIdle := httptest.NewRequest(http.MethodPost, "/api/v1/channels/1/skip", nil)
	reqIdle.Header.Set("X-CSRF-Token", csrf)
	reqIdle.AddCookie(sessionCookie)
	recIdle := httptest.NewRecorder()
	handler.ServeHTTP(recIdle, reqIdle)
	if recIdle.Code != http.StatusConflict {
		t.Errorf("skip idle channel: got %d, want 409", recIdle.Code)
	}
	var errRes map[string]string
	_ = json.Unmarshal(recIdle.Body.Bytes(), &errRes)
	if errRes["error"] == "" {
		t.Error("expected non-empty error message in 409 response")
	}

	// 4. Skip 200 when authenticated with CSRF and playing
	reqPlay := httptest.NewRequest(http.MethodPost, "/api/v1/channels/2/skip", nil)
	reqPlay.Header.Set("X-CSRF-Token", csrf)
	reqPlay.AddCookie(sessionCookie)
	recPlay := httptest.NewRecorder()
	handler.ServeHTTP(recPlay, reqPlay)
	if recPlay.Code != http.StatusOK {
		t.Fatalf("skip playing channel: got %d, want 200 (body: %s)", recPlay.Code, recPlay.Body.String())
	}

	var resPlay channelStatusResponse
	if err := json.Unmarshal(recPlay.Body.Bytes(), &resPlay); err != nil {
		t.Fatalf("unmarshal skip 200 response: %v", err)
	}
	if resPlay.ChannelID != 2 || resPlay.SkipOffsetSec <= 0 {
		t.Errorf("skip 200 unexpected shape: %+v", resPlay)
	}

	// 5. Skip 409 skip_unavailable when channel is in scheduled mode
	sv.SetModeLookup(func(chID int64) (string, error) {
		if chID == 2 {
			return "scheduled", nil
		}
		return "loop", nil
	})
	reqSched := httptest.NewRequest(http.MethodPost, "/api/v1/channels/2/skip", nil)
	reqSched.Header.Set("X-CSRF-Token", csrf)
	reqSched.AddCookie(sessionCookie)
	recSched := httptest.NewRecorder()
	handler.ServeHTTP(recSched, reqSched)
	if recSched.Code != http.StatusConflict {
		t.Errorf("skip scheduled channel: got %d, want 409", recSched.Code)
	}
	var schedErrRes map[string]string
	_ = json.Unmarshal(recSched.Body.Bytes(), &schedErrRes)
	if schedErrRes["error"] != "skip_unavailable" {
		t.Errorf("expected error 'skip_unavailable', got %v", schedErrRes)
	}
}

func TestEvents_SSE_SnapshotAndStream(t *testing.T) {
	conn, root := openRealDB(t)

	_, err := conn.Exec(`INSERT INTO channels (id, number, name) VALUES (1, 101, 'Live SSE')`)
	if err != nil {
		t.Fatalf("insert channel: %v", err)
	}

	mediaPath := filepath.Join(t.TempDir(), "live_sse.mp4")
	_ = os.WriteFile(mediaPath, []byte("stub"), 0o644)
	_, _ = conn.Exec(`INSERT INTO media_files (id, path, filename, duration_sec, codec_video, codec_audio) 
		VALUES (50, ?, 'live_sse.mp4', 100.0, 'h264', 'aac')`, mediaPath)

	calc := &staticPlayoutCalc{
		items: map[int64]*timeline.PlayoutItem{
			1: {MediaID: 50, FilePath: mediaPath, SeekSeconds: 0, RemainingSec: 100},
		},
	}
	ctrl := newFakeStatusCtrl()
	active := &testActive{}
	codecLook := func(_ int64) ingest.MediaMetadata {
		return ingest.MediaMetadata{VideoCodec: "h264", AudioCodec: "aac"}
	}

	sv := stream.NewSupervisor(calc, ctrl, active, codecLook, "idle.mp4", root)
	hub := events.NewHub()
	sv.SetPublisher(hub)

	adminPass := "sse-secret"
	sessionSecret := []byte("secret-key-32-bytes-long-here!!!")
	authHandler := auth.New(auth.Config{
		AdminPassword: adminPass,
		SessionSecret: sessionSecret,
	})

	statusH := newStatusHandler(conn, sv, hub)
	mux := http.NewServeMux()
	authHandler.Register(mux)
	statusH.register(mux)

	handler := authHandler.Protect(mux, nil)

	// Ensure channel 1 is running before SSE connection so it appears in snapshot.
	ctxLoop, cancelLoop := context.WithCancel(context.Background())
	defer cancelLoop()
	sv.Ensure(ctxLoop, 1)

	// Wait until channel 1 enters playing state.
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if sv.Status(1).State == "playing" {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	ts := httptest.NewServer(handler)
	defer ts.Close()

	// Login to get session cookie
	loginBody, _ := json.Marshal(map[string]string{"password": adminPass})
	respLogin, err := http.Post(ts.URL+"/api/v1/auth/login", "application/json", bytes.NewReader(loginBody))
	if err != nil {
		t.Fatalf("login failed: %v", err)
	}
	defer respLogin.Body.Close()

	var sessionCookie *http.Cookie
	for _, c := range respLogin.Cookies() {
		if c.Name == auth.SessionCookieName {
			sessionCookie = c
			break
		}
	}
	if sessionCookie == nil {
		t.Fatal("missing session cookie")
	}

	// Connect to SSE endpoint with cancellable context and short read deadline
	reqCtx, cancelReq := context.WithCancel(context.Background())
	defer cancelReq()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, ts.URL+"/api/v1/events", nil)
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	req.AddCookie(sessionCookie)

	client := &http.Client{Timeout: 0}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("GET /api/v1/events error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("SSE status: got %d, want 200", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/event-stream") {
		t.Errorf("Content-Type = %q, want text/event-stream", ct)
	}

	reader := bufio.NewReader(resp.Body)

	// 1. First event must be snapshot
	line1, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("read snapshot event line: %v", err)
	}
	line1 = strings.TrimSpace(line1)
	if line1 != "event: snapshot" {
		t.Errorf("first line = %q, want 'event: snapshot'", line1)
	}

	line2, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("read snapshot data line: %v", err)
	}
	line2 = strings.TrimSpace(line2)
	if !strings.HasPrefix(line2, "data: ") {
		t.Errorf("snapshot data line = %q, want prefix 'data: '", line2)
	}

	var snap []channelStatusResponse
	if err := json.Unmarshal([]byte(strings.TrimPrefix(line2, "data: ")), &snap); err != nil {
		t.Fatalf("unmarshal snapshot data: %v", err)
	}
	if len(snap) != 1 || snap[0].ChannelID != 1 {
		t.Errorf("unexpected snapshot: %+v", snap)
	}

	// Consume blank line separating SSE events
	_, _ = reader.ReadString('\n')

	// 2. Publish an event to the hub and verify SSE forwards it
	hub.Publish(events.Event{
		Type:      "channel.playing",
		ChannelID: 1,
		Data:      map[string]any{"media_id": int64(50)},
		Time:      time.Now(),
	})

	evTypeLine, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("read published event line: %v", err)
	}
	evTypeLine = strings.TrimSpace(evTypeLine)
	if evTypeLine != "event: channel.playing" {
		t.Errorf("published event line = %q, want 'event: channel.playing'", evTypeLine)
	}

	evDataLine, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("read published data line: %v", err)
	}
	evDataLine = strings.TrimSpace(evDataLine)
	if !strings.HasPrefix(evDataLine, "data: ") {
		t.Errorf("data line = %q, want prefix 'data: '", evDataLine)
	}

	// 3. Cancel context and verify request terminates cleanly
	cancelReq()

	// Drain any remaining or EOF
	readDone := make(chan struct{})
	go func() {
		for {
			_, err := reader.ReadString('\n')
			if err != nil {
				break
			}
		}
		close(readDone)
	}()

	select {
	case <-readDone:
		// Clean termination
	case <-time.After(2 * time.Second):
		t.Error("SSE stream did not terminate after context cancellation")
	}
}
