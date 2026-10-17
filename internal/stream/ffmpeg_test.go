package stream

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"testing"
	"time"
)

func makeSource(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not on PATH")
	}
	src := filepath.Join(t.TempDir(), "src.mp4")
	out, err := exec.Command("ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
		"-f", "lavfi", "-i", "testsrc=size=160x120:rate=25:duration=30",
		"-f", "lavfi", "-i", "sine=frequency=440:duration=30",
		"-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-shortest", src).CombinedOutput()
	if err != nil {
		t.Fatalf("make source: %v: %s", err, out)
	}
	return src
}

func waitFor(t *testing.T, d time.Duration, cond func() bool) bool {
	t.Helper()
	end := time.Now().Add(d)
	for time.Now().Before(end) {
		if cond() {
			return true
		}
		time.Sleep(100 * time.Millisecond)
	}
	return cond()
}

func TestBuildArgs(t *testing.T) {
	a := BuildArgs(StreamConfig{SourcePath: "in.mp4", SeekSeconds: 12.5, OutputDir: "out"})
	for _, w := range []string{"-re", "libx264", "delete_segments+append_list", "12.5"} {
		if !slices.Contains(a, w) {
			t.Errorf("missing %q in %v", w, a)
		}
	}
	if slices.Index(a, "-ss") > slices.Index(a, "-re") || slices.Index(a, "-re") > slices.Index(a, "-i") {
		t.Errorf("bad order: %v", a)
	}
	c := BuildArgs(StreamConfig{SourcePath: "in.mp4", OutputDir: "out", CopyCodec: true})
	if !slices.Contains(c, "copy") || slices.Contains(c, "libx264") {
		t.Errorf("copy args wrong: %v", c)
	}
}

func TestStartStop(t *testing.T) {
	src := makeSource(t)
	out := filepath.Join(t.TempDir(), "channels", "1")
	c := NewFFmpegController("")
	ctx := context.Background()
	cfg := StreamConfig{ChannelID: 1, SourcePath: src, OutputDir: out}
	if err := c.StartStream(ctx, cfg); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.StopStream(1) })
	if !c.IsRunning(1) {
		t.Fatal("expected running")
	}
	if err := c.StartStream(ctx, cfg); err == nil {
		t.Fatal("expected duplicate start error")
	}
	pl := filepath.Join(out, "live.m3u8")
	if !waitFor(t, 20*time.Second, func() bool { _, err := os.Stat(pl); return err == nil }) {
		t.Fatal("playlist not created")
	}
	if err := c.StopStream(1); err != nil {
		t.Fatal(err)
	}
	if c.IsRunning(1) {
		t.Fatal("expected stopped")
	}
	if err := c.StopStream(1); err != nil {
		t.Fatalf("stop idempotent: %v", err)
	}
}

func TestContextCancelKills(t *testing.T) {
	src := makeSource(t)
	c := NewFFmpegController("")
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := c.StartStream(ctx, StreamConfig{ChannelID: 2, SourcePath: src, OutputDir: filepath.Join(t.TempDir(), "2")}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.StopStream(2) })
	if !c.IsRunning(2) {
		t.Fatal("expected running")
	}
	cancel()
	if !waitFor(t, 10*time.Second, func() bool { return !c.IsRunning(2) }) {
		t.Fatal("process still running after ctx cancel")
	}
}
