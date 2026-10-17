package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// supervisorRunner reports the number of channels running a playout loop.
type supervisorRunner interface {
	RunningCount() int
}

// MediaScanner coordinates single-flight background media scanning.
type MediaScanner struct {
	mu             sync.Mutex
	running        bool
	lastStartedAt  *time.Time
	lastFinishedAt *time.Time
	lastError      string
	scanFunc       func() error
}

// ScanStatusResponse is returned by GET /api/v1/media/scan-status.
type ScanStatusResponse struct {
	Running        bool       `json:"running"`
	LastStartedAt  *time.Time `json:"last_started_at"`
	LastFinishedAt *time.Time `json:"last_finished_at"`
	LastError      string     `json:"last_error"`
}

func newMediaScanner(db *sql.DB, mediaDir string) *MediaScanner {
	s := &MediaScanner{}
	s.scanFunc = func() error {
		return scanOnce(db, mediaDir)
	}
	return s
}

// SetScanFunc replaces the scan worker function (useful for tests).
func (s *MediaScanner) SetScanFunc(fn func() error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.scanFunc = fn
}

// StartScan triggers a scan in a background goroutine if not already running.
// Returns true if a scan was successfully started, false if already running.
func (s *MediaScanner) StartScan() bool {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return false
	}
	s.running = true
	now := time.Now().UTC()
	s.lastStartedAt = &now
	fn := s.scanFunc
	s.mu.Unlock()

	go func() {
		var err error
		if fn != nil {
			err = fn()
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		s.running = false
		finished := time.Now().UTC()
		s.lastFinishedAt = &finished
		if err != nil {
			s.lastError = err.Error()
		} else {
			s.lastError = ""
		}
	}()

	return true
}

// Status returns a point-in-time snapshot of the scanner state.
func (s *MediaScanner) Status() ScanStatusResponse {
	s.mu.Lock()
	defer s.mu.Unlock()
	return ScanStatusResponse{
		Running:        s.running,
		LastStartedAt:  s.lastStartedAt,
		LastFinishedAt: s.lastFinishedAt,
		LastError:      s.lastError,
	}
}

// SystemResponse is returned by GET /api/v1/system.
type SystemResponse struct {
	UptimeSec       int64            `json:"uptime_sec"`
	MediaCount      int              `json:"media_count"`
	ChannelCount    int              `json:"channel_count"`
	RunningChannels int              `json:"running_channels"`
	FFmpeg          SystemFFmpegInfo `json:"ffmpeg"`
	IdleClip        SystemIdleClip   `json:"idle_clip"`
}

type SystemFFmpegInfo struct {
	Path    string `json:"path"`
	Version string `json:"version"`
}

type SystemIdleClip struct {
	Ready      bool   `json:"ready"`
	SizeBytes  int64  `json:"size_bytes"`
	ModifiedAt string `json:"modified_at"`
}

type systemHandler struct {
	db            *sql.DB
	supervisor    supervisorRunner
	scanner       *MediaScanner
	startTime     time.Time
	ffmpegPath    string
	ffmpegVersion string
	idleClipPath  string
}

func newSystemHandler(
	db *sql.DB,
	supervisor supervisorRunner,
	scanner *MediaScanner,
	startTime time.Time,
	ffmpegPath string,
	idleClipPath string,
) *systemHandler {
	return &systemHandler{
		db:            db,
		supervisor:    supervisor,
		scanner:       scanner,
		startTime:     startTime,
		ffmpegPath:    ffmpegPath,
		ffmpegVersion: resolveFFmpegVersion(ffmpegPath),
		idleClipPath:  idleClipPath,
	}
}

func resolveFFmpegVersion(ffmpegPath string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, ffmpegPath, "-version")
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	lines := strings.Split(string(out), "\n")
	if len(lines) > 0 {
		return strings.TrimSpace(lines[0])
	}
	return ""
}

func (h *systemHandler) register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/system", h.system)
	mux.HandleFunc("POST /api/v1/media/rescan", h.rescan)
	mux.HandleFunc("GET /api/v1/media/scan-status", h.scanStatus)
}

func (h *systemHandler) system(w http.ResponseWriter, r *http.Request) {
	var mediaCount int
	if err := h.db.QueryRow(`SELECT COUNT(*) FROM media_files`).Scan(&mediaCount); err != nil {
		http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
		return
	}

	var channelCount int
	if err := h.db.QueryRow(`SELECT COUNT(*) FROM channels`).Scan(&channelCount); err != nil {
		http.Error(w, `{"error":"database error"}`, http.StatusInternalServerError)
		return
	}

	runningChannels := 0
	if h.supervisor != nil {
		runningChannels = h.supervisor.RunningCount()
	}

	idleClip := SystemIdleClip{
		Ready:      false,
		SizeBytes:  0,
		ModifiedAt: "",
	}
	if fi, err := os.Stat(h.idleClipPath); err == nil && !fi.IsDir() {
		idleClip.Ready = true
		idleClip.SizeBytes = fi.Size()
		idleClip.ModifiedAt = fi.ModTime().UTC().Format(time.RFC3339)
	}

	uptime := int64(time.Since(h.startTime).Seconds())
	if uptime < 0 {
		uptime = 0
	}

	resp := SystemResponse{
		UptimeSec:       uptime,
		MediaCount:      mediaCount,
		ChannelCount:    channelCount,
		RunningChannels: runningChannels,
		FFmpeg: SystemFFmpegInfo{
			Path:    h.ffmpegPath,
			Version: h.ffmpegVersion,
		},
		IdleClip: idleClip,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func (h *systemHandler) rescan(w http.ResponseWriter, r *http.Request) {
	started := h.scanner.StartScan()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	if started {
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "started"})
	} else {
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "already_running"})
	}
}

func (h *systemHandler) scanStatus(w http.ResponseWriter, r *http.Request) {
	st := h.scanner.Status()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(st)
}
