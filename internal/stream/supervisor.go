package stream

import (
	"context"
	"errors"
	"log"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/uzzzzy/niracast/internal/events"
	"github.com/uzzzzy/niracast/internal/ingest"
	"github.com/uzzzzy/niracast/internal/timeline"
)

// Playout control errors.
var (
	ErrNotPlaying      = errors.New("channel is not playing")
	ErrNotRunning      = errors.New("channel playout loop is not running")
	ErrSkipUnavailable = errors.New("skip unavailable")
)

// ChannelStatus describes the real-time playout state of a broadcast channel.
type ChannelStatus struct {
	ChannelID     int64     `json:"channel_id"`
	State         string    `json:"state"` // "stopped" | "idle" | "playing"
	MediaID       int64     `json:"media_id,omitempty"`
	SourcePath    string    `json:"source_path,omitempty"`
	StartedAt     time.Time `json:"started_at,omitempty"`
	SeekSeconds   float64   `json:"seek_seconds,omitempty"`
	RemainingSec  float64   `json:"remaining_sec,omitempty"`
	SkipOffsetSec float64   `json:"skip_offset_sec"`
	Restarts      int       `json:"restarts"`
	LastError     string    `json:"last_error,omitempty"`
}

// CodecLookup resolves audio/video codec metadata for a media file by ID.
// It mirrors the DB query in hls.go. Returns zero MediaMetadata on miss.
type CodecLookup func(mediaID int64) ingest.MediaMetadata

// ActiveChecker reports whether a channel should keep its playout loop alive.
// Typically backed by SessionManager.IsActive.
type ActiveChecker interface {
	IsActive(channelID int64) bool
}

// Supervisor keeps each channel broadcasting continuously: it starts the next
// playlist item automatically when the current one ends, and falls back to a
// looping idle clip when the playlist is empty or a source file is unreadable.
//
// Each channel gets exactly one goroutine loop, started lazily on the first
// call to Ensure. The loop exits when the server context is cancelled or when
// ActiveChecker reports the channel inactive.
type Supervisor struct {
	calc       timeline.TimelineCalculator
	ctrl       ProcessController
	sessions   ActiveChecker
	codecLook  CodecLookup
	idleClip   string // path to the pre-encoded idle MP4
	outputRoot string // e.g. /transcode/channels

	publisher events.Publisher // optional; nil = no-op

	mu     sync.Mutex
	active map[int64]context.CancelFunc // running loops keyed by channel ID

	// skipOffsets holds in-memory skip offset in seconds per channel.
	// The offset is in-memory only and resets on server restart.
	skipOffsets map[int64]float64

	// statuses tracks current per-channel state.
	statuses map[int64]ChannelStatus

	// restarts tracks process restart count per channel.
	restarts map[int64]int

	// lastErrors tracks the most recent error message per channel.
	lastErrors map[int64]string

	// skipped records manual skip triggers so the loop immediately advances without penalty.
	skipped map[int64]bool

	// idlePollInterval controls how often waitIdleOrReal checks for a real item.
	// Defaults to 5 seconds if <= 0.
	idlePollInterval time.Duration

	// modeLookup optionally returns the channel mode ("loop" or "scheduled").
	modeLookup func(channelID int64) (string, error)

	// now optionally overrides time.Now for testing elapsed times.
	now func() time.Time
}

// NewSupervisor constructs a Supervisor.
//
//   - calc: resolves the current playlist item (returns ErrEmptyPlaylist when empty).
//   - ctrl: starts/stops FFmpeg processes.
//   - sessions: decides whether a channel loop should keep running.
//   - codecLook: maps media ID → codec metadata for copy-vs-transcode decisions.
//   - idleClip: path to the pre-encoded idle MP4 clip.
//   - outputRoot: base directory; channel outputs go to outputRoot/<channelID>.
func NewSupervisor(
	calc timeline.TimelineCalculator,
	ctrl ProcessController,
	sessions ActiveChecker,
	codecLook CodecLookup,
	idleClip string,
	outputRoot string,
) *Supervisor {
	return &Supervisor{
		calc:        calc,
		ctrl:        ctrl,
		sessions:    sessions,
		codecLook:   codecLook,
		idleClip:    idleClip,
		outputRoot:  outputRoot,
		active:      make(map[int64]context.CancelFunc),
		skipOffsets: make(map[int64]float64),
		statuses:    make(map[int64]ChannelStatus),
		restarts:    make(map[int64]int),
		lastErrors:  make(map[int64]string),
		skipped:     make(map[int64]bool),
	}
}

// SetModeLookup configures an optional channel mode lookup func.
func (s *Supervisor) SetModeLookup(fn func(int64) (string, error)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.modeLookup = fn
}

// SetPublisher configures an optional event publisher (Hub).
func (s *Supervisor) SetPublisher(p events.Publisher) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.publisher = p
}

func (s *Supervisor) publish(ev events.Event) {
	s.mu.Lock()
	p := s.publisher
	s.mu.Unlock()
	if p != nil {
		p.Publish(ev)
	}
}

func (s *Supervisor) recordHealth(channelID int64, incRestart bool, lastErr string) {
	s.mu.Lock()
	if incRestart {
		s.restarts[channelID]++
	}
	if lastErr != "" {
		s.lastErrors[channelID] = lastErr
	}
	restarts := s.restarts[channelID]
	errStr := s.lastErrors[channelID]
	s.mu.Unlock()

	s.publish(events.Event{
		Type:      "channel.health",
		ChannelID: channelID,
		Data: map[string]any{
			"restarts":   restarts,
			"last_error": errStr,
		},
		Time: time.Now(),
	})
}

// Health returns the restart count and last error for channelID.
func (s *Supervisor) Health(channelID int64) (int, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.restarts[channelID], s.lastErrors[channelID]
}

// exitErrorReporter is an optional interface implemented by ProcessControllers
// (such as *FFmpegController) that track process exit errors.
type exitErrorReporter interface {
	LastExitErr(channelID int64) error
}

func (s *Supervisor) lastExitErr(channelID int64) error {
	if rep, ok := s.ctrl.(exitErrorReporter); ok {
		return rep.LastExitErr(channelID)
	}
	return nil
}

func formatExitReason(exitErr error, stderr string) string {
	tail := strings.TrimSpace(stderr)
	if exitErr == nil {
		return tail
	}
	if tail == "" {
		return exitErr.Error()
	}
	if strings.Contains(tail, exitErr.Error()) {
		return tail
	}
	return exitErr.Error() + ": " + tail
}

func (s *Supervisor) nowFunc() time.Time {
	if s.now != nil {
		return s.now()
	}
	return time.Now()
}

// nowWithOffset returns current time shifted by the channel's in-memory skipOffset.
func (s *Supervisor) nowWithOffset(channelID int64) time.Time {
	s.mu.Lock()
	offset := s.skipOffsets[channelID]
	s.mu.Unlock()
	if offset == 0 {
		return s.nowFunc()
	}
	return s.nowFunc().Add(time.Duration(offset * float64(time.Second)))
}

func (s *Supervisor) nowWithOffsetLocked(channelID int64) time.Time {
	offset := s.skipOffsets[channelID]
	if offset == 0 {
		return s.nowFunc()
	}
	return s.nowFunc().Add(time.Duration(offset * float64(time.Second)))
}

// Ensure starts the playout loop for channelID if one is not already running.
// It is safe to call concurrently and from the HTTP handler on every request.
func (s *Supervisor) Ensure(ctx context.Context, channelID int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, running := s.active[channelID]; running {
		return
	}
	loopCtx, cancel := context.WithCancel(ctx)
	s.active[channelID] = cancel
	go s.loop(loopCtx, cancel, channelID)
}

// isChannelActive verifies channel activity under s.mu, atomically removing
// the channel from s.active if inactive to prevent race conditions with Ensure.
func (s *Supervisor) isChannelActive(channelID int64) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.sessions.IsActive(channelID) {
		delete(s.active, channelID)
		return false
	}
	return true
}

// loop is the per-channel playout goroutine. It runs until ctx is cancelled or
// the channel becomes inactive.
func (s *Supervisor) loop(ctx context.Context, cancel context.CancelFunc, channelID int64) {
	defer func() {
		cancel()
		_ = s.ctrl.StopStream(channelID)
		s.mu.Lock()
		delete(s.active, channelID)
		s.statuses[channelID] = ChannelStatus{
			ChannelID:     channelID,
			State:         "stopped",
			SkipOffsetSec: s.skipOffsets[channelID],
			Restarts:      s.restarts[channelID],
			LastError:     s.lastErrors[channelID],
		}
		s.mu.Unlock()
		s.publish(events.Event{
			Type:      "channel.stopped",
			ChannelID: channelID,
			Time:      time.Now(),
		})
	}()

	dir := filepath.Join(s.outputRoot, strconv.FormatInt(channelID, 10))

	// Stop any stale process from a previous run before wiping.
	_ = s.ctrl.StopStream(channelID)

	// Clear stale segments from a previous server session on first entry.
	_ = os.RemoveAll(dir)

	first := true         // first iteration of the outer loop
	consecutiveFails := 0 // fast-fail counter for the idle fallback trigger
	restartedInCycle := false

	pollInterval := s.idlePollInterval
	if pollInterval <= 0 {
		pollInterval = 5 * time.Second
	}

	for {
		// Exit if the server is shutting down.
		if ctx.Err() != nil {
			return
		}
		// Exit if no viewer has pinged this channel recently.
		if !s.isChannelActive(channelID) {
			log.Printf("supervisor: channel %d inactive, stopping loop", channelID)
			return
		}

		if !first && !restartedInCycle {
			s.recordHealth(channelID, true, "")
		}
		restartedInCycle = false

		item, err := s.calc.GetCurrentPlayout(channelID, s.nowWithOffset(channelID))
		useIdle := false
		switch {
		case errors.Is(err, timeline.ErrEmptyPlaylist):
			useIdle = true
		case err != nil:
			log.Printf("supervisor: channel %d playout resolve: %v", channelID, err)
			useIdle = true
		case item == nil || item.FilePath == "" || item.Gap:
			useIdle = true
		default:
			// Verify the source file is readable before committing to it.
			if _, statErr := os.Stat(item.FilePath); statErr != nil {
				log.Printf("supervisor: channel %d source unreadable: %v", channelID, statErr)
				useIdle = true
			}
		}

		// Three consecutive exits faster than 2 s → fall back to idle.
		if consecutiveFails >= 3 {
			useIdle = true
		}

		var nextStart time.Time
		var stopAfterSec float64
		if item != nil {
			nextStart = item.NextStart
			stopAfterSec = item.StopAfterSec
		}

		var cfg StreamConfig
		cfg.ChannelID = channelID
		cfg.OutputDir = dir
		cfg.Append = !first // emit #EXT-X-DISCONTINUITY on all but the very first start

		if useIdle {
			cfg.SourcePath = s.idleClip
			cfg.Loop = true
			cfg.CopyCodec = true
			cfg.SeekSeconds = 0
		} else {
			cfg.SourcePath = item.FilePath
			cfg.SeekSeconds = item.SeekSeconds
			meta := s.codecLook(item.MediaID)
			cfg.CopyCodec = isHLSCopyable(&meta)
		}

		first = false

		startedAt := s.nowFunc()
		if err := s.ctrl.StartStream(ctx, cfg); err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("supervisor: channel %d start error: %v", channelID, err)
			consecutiveFails++
			s.recordHealth(channelID, true, err.Error())
			restartedInCycle = true
			// Brief backoff before retrying.
			select {
			case <-ctx.Done():
				return
			case <-time.After(2 * time.Second):
			}
			continue
		}

		// Update channel status and publish playout event.
		if useIdle {
			s.mu.Lock()
			prev := s.statuses[channelID]
			s.statuses[channelID] = ChannelStatus{
				ChannelID:     channelID,
				State:         "idle",
				SourcePath:    s.idleClip,
				StartedAt:     startedAt,
				SkipOffsetSec: s.skipOffsets[channelID],
				Restarts:      s.restarts[channelID],
				LastError:     s.lastErrors[channelID],
			}
			s.mu.Unlock()
			if prev.State != "idle" {
				s.publish(events.Event{
					Type:      "channel.idle",
					ChannelID: channelID,
					Time:      time.Now(),
				})
			}
		} else {
			s.mu.Lock()
			prev := s.statuses[channelID]
			s.statuses[channelID] = ChannelStatus{
				ChannelID:     channelID,
				State:         "playing",
				MediaID:       item.MediaID,
				SourcePath:    item.FilePath,
				StartedAt:     startedAt,
				SeekSeconds:   item.SeekSeconds,
				RemainingSec:  item.RemainingSec,
				SkipOffsetSec: s.skipOffsets[channelID],
				Restarts:      s.restarts[channelID],
				LastError:     s.lastErrors[channelID],
			}
			s.mu.Unlock()
			if prev.State != "playing" || prev.MediaID != item.MediaID {
				s.publish(events.Event{
					Type:      "channel.playing",
					ChannelID: channelID,
					Data:      map[string]any{"media_id": item.MediaID},
					Time:      time.Now(),
				})
			}
		}

		switchedToReal := false
		timedOut := false
		if useIdle {
			// While idling, poll or wait for nextStart for a real item to become available.
			switchedToReal = s.waitIdleOrReal(ctx, channelID, pollInterval, nextStart)
		} else if stopAfterSec > 0 {
			stopTimer := time.NewTimer(time.Duration(stopAfterSec * float64(time.Second)))
			select {
			case <-ctx.Done():
				stopTimer.Stop()
				return
			case <-s.ctrl.Done(channelID):
				stopTimer.Stop()
			case <-stopTimer.C:
				timedOut = true
				_ = s.ctrl.StopStream(channelID)
			}
		} else {
			// Wait for the FFmpeg process to finish naturally.
			select {
			case <-ctx.Done():
				return
			case <-s.ctrl.Done(channelID):
			}
		}

		elapsed := s.nowFunc().Sub(startedAt)

		// Stop the current process before starting the next item.
		// StopStream is a no-op if the process already exited naturally.
		_ = s.ctrl.StopStream(channelID)

		s.mu.Lock()
		wasSkipped := s.skipped[channelID]
		s.skipped[channelID] = false
		s.mu.Unlock()

		if switchedToReal || wasSkipped || timedOut {
			// Intentional handoff, manual skip, or stopAfterSec timer is not a failure.
			consecutiveFails = 0
		} else if elapsed < 2*time.Second {
			consecutiveFails++
			tail := s.ctrl.StderrTail(channelID)
			errMsg := strings.TrimSpace(tail)
			if errMsg == "" {
				if exitErr := s.lastExitErr(channelID); exitErr != nil {
					errMsg = exitErr.Error()
				} else {
					errMsg = "fast exit"
				}
			}
			if trimmed := strings.TrimSpace(tail); trimmed != "" {
				log.Printf("supervisor: channel %d fast failure (elapsed %v): %s", channelID, elapsed, trimmed)
			} else {
				log.Printf("supervisor: channel %d fast failure (elapsed %v)", channelID, elapsed)
			}
			s.recordHealth(channelID, true, errMsg)
			restartedInCycle = true
		} else {
			consecutiveFails = 0
			if exitErr := s.lastExitErr(channelID); exitErr != nil {
				errMsg := formatExitReason(exitErr, s.ctrl.StderrTail(channelID))
				log.Printf("supervisor: channel %d exit error (elapsed %v): %s", channelID, elapsed, errMsg)
				s.recordHealth(channelID, true, errMsg)
				restartedInCycle = true
			}
		}

		// Check inactivity again before spinning for the next item.
		if !s.isChannelActive(channelID) {
			log.Printf("supervisor: channel %d inactive after item, stopping loop", channelID)
			return
		}

		// Tiny yield so the goroutine doesn't busy-loop on repeated fast exits.
		// Real handoffs from idle, skips, and intentional timeouts proceed immediately with zero artificial delay.
		if !switchedToReal && !wasSkipped && !timedOut && elapsed < 2*time.Second {
			select {
			case <-ctx.Done():
				return
			case <-time.After(2 * time.Second):
			}
		}
	}
}

// waitIdleOrReal blocks until either:
//   - ctx is cancelled (server shutdown), or
//   - the FFmpeg idle process exits on its own, or
//   - a real playlist item becomes available.
//
// Returns true if a real item became available and idle was stopped intentionally.
func (s *Supervisor) waitIdleOrReal(ctx context.Context, channelID int64, pollInterval time.Duration, nextStart time.Time) bool {
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	var timer *time.Timer
	var timerC <-chan time.Time
	if !nextStart.IsZero() {
		d := time.Until(nextStart)
		if d < 0 {
			d = 0
		}
		timer = time.NewTimer(d)
		defer timer.Stop()
		timerC = timer.C
	}

	for {
		select {
		case <-ctx.Done():
			return false
		case <-s.ctrl.Done(channelID):
			// Idle process exited unexpectedly — let the outer loop restart it.
			return false
		case <-timerC:
			// Timer at NextStart fired: verify playout resolves to a real readable item.
			if item, err := s.calc.GetCurrentPlayout(channelID, s.nowWithOffset(channelID)); err == nil &&
				item != nil && !item.Gap && item.FilePath != "" {
				if _, statErr := os.Stat(item.FilePath); statErr == nil {
					_ = s.ctrl.StopStream(channelID)
					return true
				}
			}
			timerC = nil
		case <-ticker.C:
			if item, err := s.calc.GetCurrentPlayout(channelID, s.nowWithOffset(channelID)); err == nil &&
				item != nil && !item.Gap && item.FilePath != "" {
				// Verify the real file is actually readable on disk before committing.
				if _, statErr := os.Stat(item.FilePath); statErr == nil {
					_ = s.ctrl.StopStream(channelID)
					return true
				}
			}
			// Also exit if the channel has become inactive.
			if !s.isChannelActive(channelID) {
				_ = s.ctrl.StopStream(channelID)
				return false
			}
		}
	}
}

// Status returns the current ChannelStatus for channelID.
// If the channel has no running playout loop, State is "stopped".
func (s *Supervisor) Status(channelID int64) ChannelStatus {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.statusLocked(channelID)
}

func (s *Supervisor) statusLocked(channelID int64) ChannelStatus {
	offset := s.skipOffsets[channelID]
	restarts := s.restarts[channelID]
	lastErr := s.lastErrors[channelID]
	if _, running := s.active[channelID]; !running {
		return ChannelStatus{
			ChannelID:     channelID,
			State:         "stopped",
			SkipOffsetSec: offset,
			Restarts:      restarts,
			LastError:     lastErr,
		}
	}

	st, ok := s.statuses[channelID]
	if !ok || st.State == "stopped" {
		return ChannelStatus{
			ChannelID:     channelID,
			State:         "stopped",
			SkipOffsetSec: offset,
			Restarts:      restarts,
			LastError:     lastErr,
		}
	}

	if st.State == "idle" {
		return ChannelStatus{
			ChannelID:     channelID,
			State:         "idle",
			SourcePath:    st.SourcePath,
			StartedAt:     st.StartedAt,
			SkipOffsetSec: offset,
			Restarts:      restarts,
			LastError:     lastErr,
		}
	}

	// State is "playing":
	// Resolve current item and remaining seconds at now+skipOffset.
	now := s.nowWithOffsetLocked(channelID)
	item, err := s.calc.GetCurrentPlayout(channelID, now)
	if errors.Is(err, timeline.ErrEmptyPlaylist) || (err == nil && (item == nil || item.FilePath == "" || item.Gap)) {
		if s.skipped[channelID] {
			st.State = "idle"
			st.MediaID = 0
			st.SourcePath = s.idleClip
			st.SeekSeconds = 0
			st.RemainingSec = 0
		}
	} else if err == nil && item != nil {
		if st.MediaID != item.MediaID {
			st.StartedAt = time.Now()
		}
		st.RemainingSec = item.RemainingSec
		st.SeekSeconds = item.SeekSeconds
		st.MediaID = item.MediaID
		st.SourcePath = item.FilePath
	}
	st.SkipOffsetSec = offset
	st.Restarts = restarts
	st.LastError = lastErr
	return st
}

// RunningStatuses returns ChannelStatus for all channels currently running a loop,
// sorted by ChannelID.
func (s *Supervisor) RunningStatuses() []ChannelStatus {
	s.mu.Lock()
	defer s.mu.Unlock()

	var ids []int64
	for chID := range s.active {
		ids = append(ids, chID)
	}
	slices.Sort(ids)

	result := make([]ChannelStatus, 0, len(ids))
	for _, chID := range ids {
		result = append(result, s.statusLocked(chID))
	}
	return result
}

// RunningCount returns the number of channels currently running a playout loop.
func (s *Supervisor) RunningCount() int {
	if s == nil {
		return 0
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.active)
}

// StopStream stops playout for channelID: cancels and removes the active loop,
// and terminates the underlying FFmpeg process.
func (s *Supervisor) StopStream(channelID int64) error {
	s.mu.Lock()
	cancel, running := s.active[channelID]
	delete(s.active, channelID)
	delete(s.statuses, channelID)
	delete(s.skipOffsets, channelID)
	delete(s.skipped, channelID)
	s.mu.Unlock()
	if running && cancel != nil {
		cancel()
	}
	return s.ctrl.StopStream(channelID)
}

// Reload re-resolves playout immediately for channelID if its loop is running.
// It clears any skip offset, marks skipped=true for an intentional handoff, and
// stops the current stream so the playout loop immediately evaluates the latest playlist/schedule.
func (s *Supervisor) Reload(channelID int64) {
	s.mu.Lock()
	if _, running := s.active[channelID]; !running {
		s.mu.Unlock()
		return
	}
	delete(s.skipOffsets, channelID)
	s.skipped[channelID] = true
	s.mu.Unlock()

	_ = s.ctrl.StopStream(channelID)
}

// Skip advances the playout timeline to the next item by adding the current item's
// RemainingSec (computed from calc.GetCurrentPlayout) to the per-channel in-memory skipOffset,
// and terminates the active FFmpeg process so the loop immediately resolves the next item.
//
// The skip offset is strictly in-memory and resets on server restart.
// Only valid while a real item is playing (returns ErrNotPlaying otherwise, ErrNotRunning if no loop).
func (s *Supervisor) Skip(channelID int64) (ChannelStatus, error) {
	s.mu.Lock()
	lookup := s.modeLookup
	s.mu.Unlock()

	if lookup != nil {
		mode, err := lookup(channelID)
		if err == nil && mode == "scheduled" {
			return ChannelStatus{ChannelID: channelID}, ErrSkipUnavailable
		}
	}

	s.mu.Lock()

	// 1. Check if loop is running.
	if _, running := s.active[channelID]; !running {
		s.mu.Unlock()
		return ChannelStatus{
			ChannelID: channelID,
			State:     "stopped",
		}, ErrNotRunning
	}

	// 2. Check if currently playing a real item using live status computation.
	cur := s.statusLocked(channelID)
	if cur.State != "playing" || cur.MediaID == 0 {
		s.mu.Unlock()
		return cur, ErrNotPlaying
	}

	// 3. Add the item's live RemainingSec to the per-channel in-memory skipOffset.
	skipDelta := cur.RemainingSec
	if skipDelta <= 0 {
		skipDelta = 0.001
	}
	s.skipOffsets[channelID] += skipDelta
	s.skipped[channelID] = true

	// 4. Resolve the status AFTER the skip took effect using the same live code path as Status().
	nextStatus := s.statusLocked(channelID)
	if nextStatus.State == "playing" && nextStatus.MediaID == cur.MediaID && nextStatus.SeekSeconds == 0 {
		nextStatus.StartedAt = time.Now()
	}
	s.mu.Unlock()

	// 5. Publish "channel.skipped" event.
	s.publish(events.Event{
		Type:      "channel.skipped",
		ChannelID: channelID,
		Time:      time.Now(),
	})

	// 6. Terminate current FFmpeg process so loop unblocks and starts the next item.
	_ = s.ctrl.StopStream(channelID)

	return nextStatus, nil
}

// isHLSCopyable returns true only when both video and audio are already in HLS-
// compatible formats (h264 + aac). Matches the heuristic in optimizer.go.
func isHLSCopyable(meta *ingest.MediaMetadata) bool {
	if meta == nil {
		return false
	}
	vcOK := len(meta.VideoCodec) > 0 &&
		(meta.VideoCodec == "h264" || meta.VideoCodec == "H264")
	acOK := len(meta.AudioCodec) > 0 &&
		(meta.AudioCodec == "aac" || meta.AudioCodec == "AAC")
	return vcOK && acOK
}
