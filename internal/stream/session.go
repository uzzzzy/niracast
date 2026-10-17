package stream

import (
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"time"
)

// DefaultIdleTimeout is used when SessionManager.IdleTimeout is zero.
const DefaultIdleTimeout = 60 * time.Second

// SessionManager tracks viewer activity per channel and stops idle streams.
type SessionManager struct {
	// IdleTimeout is how long a channel may go without a ping before it is
	// stopped. Default: 60 seconds.
	IdleTimeout time.Duration
	// Controller is used to stop idle channels.
	Controller ProcessController
	// TranscodeRoot is the base dir holding per-channel output
	// (TranscodeRoot/<channelID>). Used by the default OutputDirFor.
	TranscodeRoot string
	// OutputDirFor overrides the per-channel output directory lookup.
	OutputDirFor func(channelID int64) string

	mu         sync.Mutex
	lastAccess map[int64]time.Time
	stopCh     chan struct{}
	wg         sync.WaitGroup
	now        func() time.Time // test hook
}

// NewSessionManager creates a manager with the default idle timeout.
func NewSessionManager(ctrl ProcessController, transcodeRoot string) *SessionManager {
	return &SessionManager{IdleTimeout: DefaultIdleTimeout, Controller: ctrl, TranscodeRoot: transcodeRoot}
}

func (sm *SessionManager) clock() time.Time {
	if sm.now != nil {
		return sm.now()
	}
	return time.Now()
}

// RegisterPing records a client access (.m3u8 or .ts) for the channel.
func (sm *SessionManager) RegisterPing(channelID int64) {
	now := sm.clock()
	sm.mu.Lock()
	if sm.lastAccess == nil {
		sm.lastAccess = make(map[int64]time.Time)
	}
	sm.lastAccess[channelID] = now
	sm.mu.Unlock()
}

// StartReaperLoop starts a background goroutine that checks for idle channels
// every checkInterval. Calling it while already running is a no-op. Stop it
// with StopReaperLoop.
func (sm *SessionManager) StartReaperLoop(checkInterval time.Duration) {
	if checkInterval <= 0 {
		checkInterval = 10 * time.Second
	}
	sm.mu.Lock()
	if sm.stopCh != nil {
		sm.mu.Unlock()
		return
	}
	stop := make(chan struct{})
	sm.stopCh = stop
	sm.wg.Add(1)
	sm.mu.Unlock()

	go func() {
		defer sm.wg.Done()
		t := time.NewTicker(checkInterval)
		defer t.Stop()
		for {
			select {
			case <-stop:
				return
			case <-t.C:
				sm.reapOnce()
			}
		}
	}()
}

// StopReaperLoop stops the reaper goroutine and waits for it to exit.
func (sm *SessionManager) StopReaperLoop() {
	sm.mu.Lock()
	stop := sm.stopCh
	sm.stopCh = nil
	sm.mu.Unlock()
	if stop != nil {
		close(stop)
	}
	sm.wg.Wait()
}

func (sm *SessionManager) outputDir(channelID int64) string {
	if sm.OutputDirFor != nil {
		return sm.OutputDirFor(channelID)
	}
	if sm.TranscodeRoot == "" {
		return ""
	}
	return filepath.Join(sm.TranscodeRoot, strconv.FormatInt(channelID, 10))
}

// reapOnce stops and cleans every channel idle longer than IdleTimeout.
func (sm *SessionManager) reapOnce() {
	timeout := sm.IdleTimeout
	if timeout <= 0 {
		timeout = DefaultIdleTimeout
	}
	now := sm.clock()
	var idle []int64
	sm.mu.Lock()
	for id, last := range sm.lastAccess {
		if now.Sub(last) > timeout {
			idle = append(idle, id)
		}
	}
	sm.mu.Unlock()

	for _, id := range idle {
		if sm.Controller != nil {
			if err := sm.Controller.StopStream(id); err != nil {
				continue // retry on the next tick
			}
		}
		if dir := sm.outputDir(id); dir != "" {
			sm.cleanSegments(dir)
		}
		sm.mu.Lock()
		// Only forget the channel if it was not pinged meanwhile.
		if last, ok := sm.lastAccess[id]; ok && now.Sub(last) > timeout {
			delete(sm.lastAccess, id)
		}
		sm.mu.Unlock()
	}
}

// cleanSegments removes HLS playlists and segments from dir.
func (sm *SessionManager) cleanSegments(dir string) {
	for _, pat := range []string{"*.ts", "*.m3u8", "*.m3u8.tmp"} {
		files, _ := filepath.Glob(filepath.Join(dir, pat))
		for _, f := range files {
			_ = os.Remove(f)
		}
	}
}

// IsActive reports whether channelID has been pinged within the idle timeout
// window. The supervisor calls this before restarting a process so it can stop
// looping for channels that have had no viewers for too long.
func (sm *SessionManager) IsActive(channelID int64) bool {
	timeout := sm.IdleTimeout
	if timeout <= 0 {
		timeout = DefaultIdleTimeout
	}
	sm.mu.Lock()
	last, ok := sm.lastAccess[channelID]
	sm.mu.Unlock()
	if !ok {
		return false
	}
	return sm.clock().Sub(last) <= timeout
}
