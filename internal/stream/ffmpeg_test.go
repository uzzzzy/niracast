package stream

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
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
	for _, w := range []string{"-re", "libx264", "delete_segments+append_list+omit_endlist", "12.5", "0:v:0", "0:a:0?", "-sn", "-dn"} {
		if !slices.Contains(a, w) {
			t.Errorf("missing %q in %v", w, a)
		}
	}
	if slices.Index(a, "-ss") > slices.Index(a, "-re") || slices.Index(a, "-re") > slices.Index(a, "-i") {
		t.Errorf("bad order: %v", a)
	}
	if slices.Index(a, "-i") > slices.Index(a, "-map") || slices.Index(a, "-dn") > slices.Index(a, "-c:v") {
		t.Errorf("bad stream selection order in transcode: %v", a)
	}
	c := BuildArgs(StreamConfig{SourcePath: "in.mp4", OutputDir: "out", CopyCodec: true})
	if !slices.Contains(c, "copy") || slices.Contains(c, "libx264") {
		t.Errorf("copy args wrong: %v", c)
	}
	for _, w := range []string{"0:v:0", "0:a:0?", "-sn", "-dn"} {
		if !slices.Contains(c, w) {
			t.Errorf("missing %q in copy args %v", w, c)
		}
	}
	if slices.Index(c, "-i") > slices.Index(c, "-map") || slices.Index(c, "-dn") > slices.Index(c, "-c") {
		t.Errorf("bad stream selection order in copy: %v", c)
	}
}

func TestBuildArgsLoopAppend(t *testing.T) {
	// Loop=true must inject -stream_loop -1 before -i, and include stream selection.
	l := BuildArgs(StreamConfig{SourcePath: "idle.mp4", OutputDir: "out", Loop: true, CopyCodec: true})
	iIdx := slices.Index(l, "-i")
	loopIdx := slices.Index(l, "-stream_loop")
	if loopIdx < 0 {
		t.Fatalf("missing -stream_loop in %v", l)
	}
	if loopIdx >= iIdx {
		t.Errorf("-stream_loop must come before -i: %v", l)
	}
	if slices.Index(l, "-1") < 0 {
		t.Errorf("missing -1 value for -stream_loop: %v", l)
	}
	for _, w := range []string{"0:v:0", "0:a:0?", "-sn", "-dn"} {
		if !slices.Contains(l, w) {
			t.Errorf("missing %q in loop args %v", w, l)
		}
	}
	if slices.Index(l, "-i") > slices.Index(l, "-map") || slices.Index(l, "-dn") > slices.Index(l, "-c") {
		t.Errorf("bad stream selection order in loop: %v", l)
	}

	// Append=true must include omit_endlist and discont_start in hls_flags,
	// and never the invalid discontinuity_start.
	ap := BuildArgs(StreamConfig{SourcePath: "a.mp4", OutputDir: "out", Append: true})
	flagIdx := slices.Index(ap, "-hls_flags")
	if flagIdx < 0 || flagIdx+1 >= len(ap) {
		t.Fatalf("missing -hls_flags: %v", ap)
	}
	flags := ap[flagIdx+1]
	for _, want := range []string{"delete_segments", "append_list", "omit_endlist", "discont_start"} {
		if !strings.Contains(flags, want) {
			t.Errorf("missing %q in hls_flags %q: %v", want, flags, ap)
		}
	}
	if strings.Contains(flags, "discontinuity_start") {
		t.Errorf("invalid flag discontinuity_start found in hls_flags %q: %v", flags, ap)
	}

	// Loop=false must NOT inject -stream_loop.
	noLoop := BuildArgs(StreamConfig{SourcePath: "in.mp4", OutputDir: "out"})
	if slices.Contains(noLoop, "-stream_loop") {
		t.Errorf("unexpected -stream_loop: %v", noLoop)
	}
}

func TestTailBuffer(t *testing.T) {
	tb := newTailBuffer(10)
	n, err := tb.Write([]byte("hello"))
	if err != nil || n != 5 {
		t.Fatalf("write: %d, %v", n, err)
	}
	if got := tb.String(); got != "hello" {
		t.Errorf("got %q, want 'hello'", got)
	}

	// Write more than limit (10 bytes)
	_, _ = tb.Write([]byte(" world 1234567890"))
	got := tb.String()
	if len(got) != 10 {
		t.Fatalf("len = %d, want 10", len(got))
	}
	if got != "1234567890" {
		t.Errorf("got %q, want '1234567890'", got)
	}

	// Write single slice larger than limit
	_, _ = tb.Write([]byte("abcdefghijklmnopqrstuvwxyz"))
	if got := tb.String(); got != "qrstuvwxyz" {
		t.Errorf("got %q, want 'qrstuvwxyz'", got)
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
