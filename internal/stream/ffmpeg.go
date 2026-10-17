// Package stream controls FFmpeg playout processes and HLS segmenting.
package stream

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
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
}

// ProcessController manages FFmpeg playout processes.
type ProcessController interface {
	StartStream(ctx context.Context, cfg StreamConfig) error
	StopStream(channelID int64) error
	IsRunning(channelID int64) bool
}

type session struct {
	proc *os.Process
	done chan struct{}
}

// FFmpegController implements ProcessController using the ffmpeg binary.
type FFmpegController struct {
	// FFmpegPath is the executable to run; defaults to "ffmpeg".
	FFmpegPath string

	mu       sync.RWMutex
	sessions map[int64]*session
}

var _ ProcessController = (*FFmpegController)(nil)

// NewFFmpegController creates a controller using the given binary ("" = "ffmpeg").
func NewFFmpegController(ffmpegPath string) *FFmpegController {
	if ffmpegPath == "" {
		ffmpegPath = "ffmpeg"
	}
	return &FFmpegController{FFmpegPath: ffmpegPath, sessions: make(map[int64]*session)}
}

// BuildArgs builds the FFmpeg argument list for cfg. "-re" is always present.
func BuildArgs(cfg StreamConfig) []string {
	args := []string{
		"-hide_banner", "-loglevel", "error", "-y",
		"-ss", strconv.FormatFloat(cfg.SeekSeconds, 'f', -1, 64),
		"-re", "-i", cfg.SourcePath,
	}
	if cfg.CopyCodec {
		args = append(args, "-c", "copy")
	} else {
		args = append(args,
			"-c:v", "libx264", "-preset", "veryfast", "-b:v", "2500k",
			"-c:a", "aac", "-b:a", "128k")
	}
	args = append(args,
		"-f", "hls", "-hls_time", "2", "-hls_list_size", "5",
		"-hls_flags", "delete_segments+append_list",
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
	if _, ok := c.sessions[cfg.ChannelID]; ok {
		return fmt.Errorf("stream: channel %d already running", cfg.ChannelID)
	}

	bin := c.FFmpegPath
	if bin == "" {
		bin = "ffmpeg"
	}
	cmd := exec.CommandContext(ctx, bin, BuildArgs(cfg)...)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("stream: start ffmpeg: %w", err)
	}
	s := &session{proc: cmd.Process, done: make(chan struct{})}
	c.sessions[cfg.ChannelID] = s

	go func() {
		_ = cmd.Wait()
		c.mu.Lock()
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
