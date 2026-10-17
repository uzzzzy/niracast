// Package stream controls FFmpeg playout processes and HLS segmenting.
package stream

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// StreamConfig describes one channel playout session.
type StreamConfig struct {
	ChannelID   int64
	SourcePath  string
	SeekSeconds float64
	OutputDir   string // tmpfs directory, e.g. /transcode/channels/{id}
	CopyCodec   bool
	// Loop adds -stream_loop -1 before -i so FFmpeg repeats the source
	// indefinitely. Used for the idle clip.
	Loop bool
	// Append adds HLS flags append_list+discont_start so the media
	// sequence keeps incrementing and a #EXT-X-DISCONTINUITY tag is emitted
	// at the start of this segment run. Used when restarting within the same
	// channel session (item boundary or idle switch).
	Append bool
}

// ProcessController manages FFmpeg playout processes.
type ProcessController interface {
	StartStream(ctx context.Context, cfg StreamConfig) error
	StopStream(channelID int64) error
	IsRunning(channelID int64) bool
	// Done returns a channel that is closed when the FFmpeg process for
	// channelID exits. It returns a channel closed immediately if no process
	// is registered for that channel.
	Done(channelID int64) <-chan struct{}
	// StderrTail returns the last captured stderr output for channelID.
	StderrTail(channelID int64) string
}

// tailBuffer retains the most recent limit bytes written to it.
// It is safe for concurrent use.
type tailBuffer struct {
	mu    sync.Mutex
	limit int
	buf   []byte
}

func newTailBuffer(limit int) *tailBuffer {
	return &tailBuffer{
		limit: limit,
		buf:   make([]byte, 0, limit),
	}
}

func (b *tailBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	n := len(p)
	if n >= b.limit {
		p = p[n-b.limit:]
		if cap(b.buf) < b.limit {
			b.buf = make([]byte, b.limit)
		} else {
			b.buf = b.buf[:b.limit]
		}
		copy(b.buf, p)
		return n, nil
	}
	overflow := (len(b.buf) + n) - b.limit
	if overflow > 0 {
		copy(b.buf, b.buf[overflow:])
		b.buf = b.buf[:len(b.buf)-overflow]
	}
	b.buf = append(b.buf, p...)
	return n, nil
}

func (b *tailBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return string(b.buf)
}

type session struct {
	proc      *os.Process
	done      chan struct{}
	stderr    *tailBuffer
	startedAt time.Time
}

// FFmpegController implements ProcessController using the ffmpeg binary.
type FFmpegController struct {
	// FFmpegPath is the executable to run; defaults to "ffmpeg".
	FFmpegPath string

	mu         sync.RWMutex
	sessions   map[int64]*session
	lastStderr map[int64]string
	lastErr    map[int64]error
}

var _ ProcessController = (*FFmpegController)(nil)

// NewFFmpegController creates a controller using the given binary ("" = "ffmpeg").
func NewFFmpegController(ffmpegPath string) *FFmpegController {
	if ffmpegPath == "" {
		ffmpegPath = "ffmpeg"
	}
	return &FFmpegController{
		FFmpegPath: ffmpegPath,
		sessions:   make(map[int64]*session),
		lastStderr: make(map[int64]string),
		lastErr:    make(map[int64]error),
	}
}

// BuildArgs builds the FFmpeg argument list for cfg. "-re" is always present.
func BuildArgs(cfg StreamConfig) []string {
	args := []string{"-hide_banner", "-loglevel", "error", "-y"}

	// Seek before -re so FFmpeg doesn't decode-and-discard pre-seek frames.
	args = append(args, "-ss", strconv.FormatFloat(cfg.SeekSeconds, 'f', -1, 64))

	// Loop flag must come before -i.
	if cfg.Loop {
		args = append(args, "-stream_loop", "-1")
	}

	args = append(args, "-re", "-i", cfg.SourcePath)

	args = append(args, "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn")

	if cfg.CopyCodec {
		args = append(args, "-c", "copy")
	} else {
		args = append(args,
			"-c:v", "libx264", "-preset", "veryfast", "-b:v", "2500k",
			"-c:a", "aac", "-b:a", "128k")
	}

	// Build HLS flags string. Append mode adds discont_start so the
	// player receives an #EXT-X-DISCONTINUITY tag at the segment boundary.
	// Live manifests must never end, so omit_endlist is always set.
	hlsFlags := "delete_segments+append_list+omit_endlist"
	if cfg.Append {
		hlsFlags += "+discont_start"
	}

	args = append(args,
		"-f", "hls", "-hls_time", "2", "-hls_list_size", "5",
		"-hls_flags", hlsFlags,
		filepath.Join(cfg.OutputDir, "live.m3u8"))
	return args
}

// StartStream launches FFmpeg for the channel. The process is killed when ctx
// is cancelled.
func (c *FFmpegController) StartStream(ctx context.Context, cfg StreamConfig) error {
	if cfg.SourcePath == "" || cfg.OutputDir == "" {
		return errors.New("stream: SourcePath and OutputDir are required")
	}
	if err := os.MkdirAll(cfg.OutputDir, 0o755); err != nil {
		return fmt.Errorf("stream: create output dir: %w", err)
	}

	c.mu.Lock()
	defer c.mu.Unlock()
	if c.sessions == nil {
		c.sessions = make(map[int64]*session)
	}
	if c.lastStderr == nil {
		c.lastStderr = make(map[int64]string)
	}
	if c.lastErr == nil {
		c.lastErr = make(map[int64]error)
	}
	if _, ok := c.sessions[cfg.ChannelID]; ok {
		return fmt.Errorf("stream: channel %d already running", cfg.ChannelID)
	}

	bin := c.FFmpegPath
	if bin == "" {
		bin = "ffmpeg"
	}
	cmd := exec.CommandContext(ctx, bin, BuildArgs(cfg)...)
	stderrBuf := newTailBuffer(2048)
	cmd.Stderr = stderrBuf

	startedAt := time.Now()
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("stream: start ffmpeg: %w", err)
	}
	s := &session{
		proc:      cmd.Process,
		done:      make(chan struct{}),
		stderr:    stderrBuf,
		startedAt: startedAt,
	}
	c.sessions[cfg.ChannelID] = s

	go func() {
		waitErr := cmd.Wait()
		elapsed := time.Since(startedAt)
		tail := stderrBuf.String()

		if waitErr != nil || elapsed < 2*time.Second {
			trimmed := strings.TrimSpace(tail)
			if trimmed != "" {
				log.Printf("stream: channel %d ffmpeg error (elapsed %v, exit: %v): %s", cfg.ChannelID, elapsed, waitErr, trimmed)
			} else {
				log.Printf("stream: channel %d ffmpeg error (elapsed %v, exit: %v)", cfg.ChannelID, elapsed, waitErr)
			}
		}

		c.mu.Lock()
		c.lastStderr[cfg.ChannelID] = tail
		c.lastErr[cfg.ChannelID] = waitErr
		if c.sessions[cfg.ChannelID] == s {
			delete(c.sessions, cfg.ChannelID)
		}
		c.mu.Unlock()
		close(s.done)
	}()
	return nil
}

// StopStream kills the channel's process and waits for it to exit.
func (c *FFmpegController) StopStream(channelID int64) error {
	c.mu.RLock()
	s := c.sessions[channelID]
	c.mu.RUnlock()
	if s == nil {
		return nil
	}
	_ = s.proc.Kill()
	select {
	case <-s.done:
		return nil
	case <-time.After(10 * time.Second):
		return fmt.Errorf("stream: channel %d did not exit after kill", channelID)
	}
}

// IsRunning reports whether a process is registered for the channel.
func (c *FFmpegController) IsRunning(channelID int64) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	_, ok := c.sessions[channelID]
	return ok
}

// Done returns a channel closed when the FFmpeg process for channelID exits.
// If no process is registered the returned channel is already closed.
func (c *FFmpegController) Done(channelID int64) <-chan struct{} {
	c.mu.RLock()
	s := c.sessions[channelID]
	c.mu.RUnlock()
	if s != nil {
		return s.done
	}
	// No session — return a pre-closed channel so callers don't block.
	ch := make(chan struct{})
	close(ch)
	return ch
}

// StderrTail returns the last captured stderr output for channelID.
func (c *FFmpegController) StderrTail(channelID int64) string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if s, ok := c.sessions[channelID]; ok && s.stderr != nil {
		return s.stderr.String()
	}
	if c.lastStderr != nil {
		return c.lastStderr[channelID]
	}
	return ""
}

// LastExitErr returns the exit error of the most recently finished FFmpeg process for channelID.
func (c *FFmpegController) LastExitErr(channelID int64) error {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.lastErr != nil {
		return c.lastErr[channelID]
	}
	return nil
}
