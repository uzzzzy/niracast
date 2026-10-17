package stream

import (
	"context"
	"errors"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"tv-stream/internal/ingest"
	"tv-stream/internal/timeline"
)

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

	mu     sync.Mutex
	active map[int64]context.CancelFunc // running loops keyed by channel ID

	// idlePollInterval controls how often waitIdleOrReal checks for a real item.
	// Defaults to 5 seconds if <= 0.
	idlePollInterval time.Duration
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
		calc:       calc,
		ctrl:       ctrl,
		sessions:   sessions,
		codecLook:  codecLook,
		idleClip:   idleClip,
		outputRoot: outputRoot,
		active:     make(map[int64]context.CancelFunc),
	}
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
		s.mu.Unlock()
	}()

	dir := filepath.Join(s.outputRoot, strconv.FormatInt(channelID, 10))

	// Stop any stale process from a previous run before wiping.
	_ = s.ctrl.StopStream(channelID)

	// Clear stale segments from a previous server session on first entry.
	_ = os.RemoveAll(dir)

	first := true         // first iteration of the outer loop
	consecutiveFails := 0 // fast-fail counter for the idle fallback trigger

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

		item, err := s.calc.GetCurrentPlayout(channelID, time.Now())
		useIdle := false
		switch {
		case errors.Is(err, timeline.ErrEmptyPlaylist):
			useIdle = true
		case err != nil:
			log.Printf("supervisor: channel %d playout resolve: %v", channelID, err)
			useIdle = true
		case item == nil || item.FilePath == "":
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

		startedAt := time.Now()
		if err := s.ctrl.StartStream(ctx, cfg); err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("supervisor: channel %d start error: %v", channelID, err)
			consecutiveFails++
			// Brief backoff before retrying.
			select {
			case <-ctx.Done():
				return
			case <-time.After(2 * time.Second):
			}
			continue
		}

		switchedToReal := false
		if useIdle {
			// While idling, poll for a real item to become available.
			switchedToReal = s.waitIdleOrReal(ctx, channelID, pollInterval)
		} else {
			// Wait for the FFmpeg process to finish naturally.
			select {
			case <-ctx.Done():
				return
			case <-s.ctrl.Done(channelID):
			}
		}

		elapsed := time.Since(startedAt)

		// Stop the current process before starting the next item.
		// StopStream is a no-op if the process already exited naturally.
		_ = s.ctrl.StopStream(channelID)

		if switchedToReal {
			// Intentional handoff from idle to a real item is not a failure.
			consecutiveFails = 0
		} else if elapsed < 2*time.Second {
			consecutiveFails++
			tail := s.ctrl.StderrTail(channelID)
			if trimmed := strings.TrimSpace(tail); trimmed != "" {
				log.Printf("supervisor: channel %d fast failure (elapsed %v): %s", channelID, elapsed, trimmed)
			} else {
				log.Printf("supervisor: channel %d fast failure (elapsed %v)", channelID, elapsed)
			}
		} else {
			consecutiveFails = 0
		}

		// Check inactivity again before spinning for the next item.
		if !s.isChannelActive(channelID) {
			log.Printf("supervisor: channel %d inactive after item, stopping loop", channelID)
			return
		}

		// Tiny yield so the goroutine doesn't busy-loop on repeated fast exits.
		// Real handoffs from idle proceed immediately with zero artificial delay.
		if !switchedToReal && elapsed < 2*time.Second {
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
func (s *Supervisor) waitIdleOrReal(ctx context.Context, channelID int64, pollInterval time.Duration) bool {
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return false
		case <-s.ctrl.Done(channelID):
			// Idle process exited unexpectedly — let the outer loop restart it.
			return false
		case <-ticker.C:
			if item, err := s.calc.GetCurrentPlayout(channelID, time.Now()); err == nil &&
				item != nil && item.FilePath != "" {
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
