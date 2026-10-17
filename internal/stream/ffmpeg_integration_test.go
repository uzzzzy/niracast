package stream

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestIntegration_MKVSubtitle_CopyCodec(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not on PATH")
	}

	dir := t.TempDir()
	srtPath := filepath.Join(dir, "sub.srt")
	srtContent := "1\n00:00:00,000 --> 00:00:03,000\nIntegration subtitle\n"
	if err := os.WriteFile(srtPath, []byte(srtContent), 0o644); err != nil {
		t.Fatalf("write srt: %v", err)
	}

	mkvPath := filepath.Join(dir, "test.mkv")
	cmd := exec.Command("ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
		"-f", "lavfi", "-i", "testsrc=size=160x120:rate=25:duration=3",
		"-f", "lavfi", "-i", "sine=frequency=440:duration=3",
		"-i", srtPath,
		"-c:v", "libx264", "-preset", "ultrafast",
		"-c:a", "aac",
		"-c:s", "ass",
		"-shortest", mkvPath,
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		fallbackCmd := exec.Command("ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
			"-f", "lavfi", "-i", "testsrc=size=160x120:rate=25:duration=3",
			"-f", "lavfi", "-i", "sine=frequency=440:duration=3",
			"-i", srtPath,
			"-c:v", "libx264", "-preset", "ultrafast",
			"-c:a", "aac",
			"-c:s", "srt",
			"-shortest", mkvPath,
		)
		if fallbackOut, fallbackErr := fallbackCmd.CombinedOutput(); fallbackErr != nil {
			t.Fatalf("generate mkv failed (ass: %v: %s; srt: %v: %s)", err, out, fallbackErr, fallbackOut)
		}
	}

	outDir := filepath.Join(dir, "out")
	ctrl := NewFFmpegController("")
	ctx, cancel := context.WithTimeout(context.Background(), 14*time.Second)
	defer cancel()

	cfg := StreamConfig{
		ChannelID:  101,
		SourcePath: mkvPath,
		OutputDir:  outDir,
		CopyCodec:  true,
	}

	if err := ctrl.StartStream(ctx, cfg); err != nil {
		t.Fatalf("StartStream: %v", err)
	}
	t.Cleanup(func() { _ = ctrl.StopStream(cfg.ChannelID) })

	select {
	case <-ctrl.Done(cfg.ChannelID):
	case <-ctx.Done():
		t.Fatalf("stream timed out waiting to complete: %v", ctx.Err())
	}

	if err := ctrl.LastExitErr(cfg.ChannelID); err != nil {
		t.Fatalf("ffmpeg process exited with error: %v (stderr: %s)", err, ctrl.StderrTail(cfg.ChannelID))
	}

	tsFile := filepath.Join(outDir, "live0.ts")
	if info, err := os.Stat(tsFile); err != nil {
		t.Fatalf("live0.ts not found in %s: %v", outDir, err)
	} else if info.Size() == 0 {
		t.Fatalf("live0.ts is 0 bytes")
	}
}
