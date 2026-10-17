package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"tv-stream/internal/db"
)

type fakeSupervisorRunner struct {
	count int
}

func (f fakeSupervisorRunner) RunningCount() int {
	return f.count
}

func TestRescan_SingleFlightAndScanStatusTransitions(t *testing.T) {
	conn, err := db.InitDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	scanner := newMediaScanner(conn, t.TempDir())
	handler := &systemHandler{scanner: scanner}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/media/rescan", handler.rescan)
	mux.HandleFunc("GET /api/v1/media/scan-status", handler.scanStatus)

	// 1. Initial status before any scan
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/media/scan-status", nil)
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var initStatus ScanStatusResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &initStatus); err != nil {
		t.Fatalf("unmarshal init status: %v", err)
	}
	if initStatus.Running {
		t.Errorf("expected running=false initially")
	}
	if initStatus.LastStartedAt != nil {
		t.Errorf("expected last_started_at=null initially, got %v", initStatus.LastStartedAt)
	}
	if initStatus.LastFinishedAt != nil {
		t.Errorf("expected last_finished_at=null initially, got %v", initStatus.LastFinishedAt)
	}
	if initStatus.LastError != "" {
		t.Errorf("expected last_error='' initially, got %q", initStatus.LastError)
	}

	// 2. Inject slow scan
	startedCh := make(chan struct{})
	releaseCh := make(chan struct{})
	scanner.SetScanFunc(func() error {
		close(startedCh)
		<-releaseCh
		return nil
	})

	// 3. First rescan call -> 202 started
	recRescan1 := httptest.NewRecorder()
	reqRescan1 := httptest.NewRequest(http.MethodPost, "/api/v1/media/rescan", nil)
	mux.ServeHTTP(recRescan1, reqRescan1)

	if recRescan1.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d", recRescan1.Code)
	}
	var rescan1Body map[string]string
	_ = json.Unmarshal(recRescan1.Body.Bytes(), &rescan1Body)
	if rescan1Body["status"] != "started" {
		t.Errorf("expected status=started, got %v", rescan1Body)
	}

	// Wait for goroutine to start
	<-startedCh

	// 4. Check status while running
	recRunning := httptest.NewRecorder()
	reqRunning := httptest.NewRequest(http.MethodGet, "/api/v1/media/scan-status", nil)
	mux.ServeHTTP(recRunning, reqRunning)

	var runningStatus ScanStatusResponse
	_ = json.Unmarshal(recRunning.Body.Bytes(), &runningStatus)
	if !runningStatus.Running {
		t.Errorf("expected running=true while in-flight")
	}
	if runningStatus.LastStartedAt == nil {
		t.Errorf("expected last_started_at non-nil while running")
	}
	if runningStatus.LastFinishedAt != nil {
		t.Errorf("expected last_finished_at=nil while still running")
	}

	// 5. Second rescan call while running -> 202 already_running
	recRescan2 := httptest.NewRecorder()
	reqRescan2 := httptest.NewRequest(http.MethodPost, "/api/v1/media/rescan", nil)
	mux.ServeHTTP(recRescan2, reqRescan2)

	if recRescan2.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d", recRescan2.Code)
	}
	var rescan2Body map[string]string
	_ = json.Unmarshal(recRescan2.Body.Bytes(), &rescan2Body)
	if rescan2Body["status"] != "already_running" {
		t.Errorf("expected status=already_running, got %v", rescan2Body)
	}

	// 6. Release slow scan
	close(releaseCh)

	// Wait for scan to finish
	deadline := time.Now().Add(2 * time.Second)
	for {
		if !scanner.Status().Running {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("timed out waiting for scan to finish")
		}
		time.Sleep(10 * time.Millisecond)
	}

	// 7. Verify finished status
	recDone := httptest.NewRecorder()
	reqDone := httptest.NewRequest(http.MethodGet, "/api/v1/media/scan-status", nil)
	mux.ServeHTTP(recDone, reqDone)

	var doneStatus ScanStatusResponse
	_ = json.Unmarshal(recDone.Body.Bytes(), &doneStatus)
	if doneStatus.Running {
		t.Errorf("expected running=false after completion")
	}
	if doneStatus.LastStartedAt == nil {
		t.Errorf("expected last_started_at non-nil")
	}
	if doneStatus.LastFinishedAt == nil {
		t.Errorf("expected last_finished_at non-nil")
	}
	if doneStatus.LastError != "" {
		t.Errorf("expected last_error='' on successful scan, got %q", doneStatus.LastError)
	}

	// 8. Test error transition
	scanner.SetScanFunc(func() error {
		return errors.New("simulated filesystem error")
	})
	scanner.StartScan()

	deadlineErr := time.Now().Add(2 * time.Second)
	for {
		if !scanner.Status().Running {
			break
		}
		if time.Now().After(deadlineErr) {
			t.Fatal("timed out waiting for error scan to finish")
		}
		time.Sleep(10 * time.Millisecond)
	}

	recErr := httptest.NewRecorder()
	reqErr := httptest.NewRequest(http.MethodGet, "/api/v1/media/scan-status", nil)
	mux.ServeHTTP(recErr, reqErr)

	var errStatus ScanStatusResponse
	_ = json.Unmarshal(recErr.Body.Bytes(), &errStatus)
	if errStatus.LastError != "simulated filesystem error" {
		t.Errorf("expected last_error='simulated filesystem error', got %q", errStatus.LastError)
	}
}

func TestSystemEndpoint_ShapeAndIdleClip(t *testing.T) {
	conn, err := db.InitDB(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	// Seed 2 channels, 3 media files
	_, _ = conn.Exec(`INSERT INTO channels (id, number, name) VALUES (1, 1, 'Ch1'), (2, 2, 'Ch2')`)
	_, _ = conn.Exec(`INSERT INTO media_files (id, path, filename, duration_sec) VALUES (1, '/a', 'a', 10), (2, '/b', 'b', 20), (3, '/c', 'c', 30)`)

	tempDir := t.TempDir()
	missingClip := filepath.Join(tempDir, "missing_idle.mp4")
	existingClip := filepath.Join(tempDir, "ready_idle.mp4")

	if err := os.WriteFile(existingClip, []byte("fake mp4 content 1234567890"), 0644); err != nil {
		t.Fatal(err)
	}

	startTime := time.Now().Add(-123 * time.Second)
	scanner := newMediaScanner(conn, tempDir)

	// 1. Missing idle clip
	hMissing := newSystemHandler(conn, fakeSupervisorRunner{count: 4}, scanner, startTime, "ffmpeg", missingClip)
	hMissing.ffmpegVersion = "ffmpeg version 7.0-test"

	req1 := httptest.NewRequest(http.MethodGet, "/api/v1/system", nil)
	rec1 := httptest.NewRecorder()
	hMissing.system(rec1, req1)

	if rec1.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec1.Code)
	}
	if ct := rec1.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("content-type = %s, want application/json", ct)
	}

	var resp1 SystemResponse
	if err := json.Unmarshal(rec1.Body.Bytes(), &resp1); err != nil {
		t.Fatalf("unmarshal system response: %v", err)
	}

	if resp1.UptimeSec < 120 {
		t.Errorf("uptime_sec = %d, want >= 120", resp1.UptimeSec)
	}
	if resp1.ChannelCount != 2 {
		t.Errorf("channel_count = %d, want 2", resp1.ChannelCount)
	}
	if resp1.MediaCount != 3 {
		t.Errorf("media_count = %d, want 3", resp1.MediaCount)
	}
	if resp1.RunningChannels != 4 {
		t.Errorf("running_channels = %d, want 4", resp1.RunningChannels)
	}
	if resp1.Timezone != "Asia/Jakarta" {
		t.Errorf("timezone = %q, want 'Asia/Jakarta'", resp1.Timezone)
	}
	if resp1.FFmpeg.Path != "ffmpeg" || resp1.FFmpeg.Version != "ffmpeg version 7.0-test" {
		t.Errorf("ffmpeg = %+v, want path=ffmpeg version=ffmpeg version 7.0-test", resp1.FFmpeg)
	}
	if resp1.IdleClip.Ready {
		t.Errorf("missing idle clip expected ready=false, got true")
	}
	if resp1.IdleClip.SizeBytes != 0 {
		t.Errorf("missing idle clip expected size_bytes=0, got %d", resp1.IdleClip.SizeBytes)
	}
	if resp1.IdleClip.ModifiedAt != "" {
		t.Errorf("missing idle clip expected modified_at='', got %q", resp1.IdleClip.ModifiedAt)
	}

	// 2. Ready idle clip
	hReady := newSystemHandler(conn, fakeSupervisorRunner{count: 1}, scanner, startTime, "ffmpeg", existingClip)
	hReady.ffmpegVersion = "ffmpeg version 7.0-test"

	req2 := httptest.NewRequest(http.MethodGet, "/api/v1/system", nil)
	rec2 := httptest.NewRecorder()
	hReady.system(rec2, req2)

	if rec2.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec2.Code)
	}

	var resp2 SystemResponse
	if err := json.Unmarshal(rec2.Body.Bytes(), &resp2); err != nil {
		t.Fatalf("unmarshal system response: %v", err)
	}

	if !resp2.IdleClip.Ready {
		t.Errorf("existing idle clip expected ready=true")
	}
	if resp2.IdleClip.SizeBytes != 27 {
		t.Errorf("idle clip size = %d, want 27", resp2.IdleClip.SizeBytes)
	}
	if resp2.IdleClip.ModifiedAt == "" {
		t.Errorf("idle clip modified_at should be RFC3339 string, got empty")
	}
	if _, err := time.Parse(time.RFC3339, resp2.IdleClip.ModifiedAt); err != nil {
		t.Errorf("idle clip modified_at failed to parse as RFC3339: %v (raw: %q)", err, resp2.IdleClip.ModifiedAt)
	}
}

func TestResolveFFmpegVersion_TimeoutOrMissing(t *testing.T) {
	// An invalid executable path should return empty string without panicking
	v := resolveFFmpegVersion("non-existent-ffmpeg-binary-12345")
	if v != "" {
		t.Errorf("expected empty string for missing ffmpeg, got %q", v)
	}
}
