package stream

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

// makeJPEG creates a minimal JPEG test image using FFmpeg.
func makeJPEG(t *testing.T, path string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	out, err := exec.Command("ffmpeg",
		"-hide_banner", "-loglevel", "error", "-y",
		"-f", "lavfi", "-i", "color=c=blue:size=160x120:rate=1",
		"-frames:v", "1", path,
	).CombinedOutput()
	if err != nil {
		t.Fatalf("make jpeg: %v: %s", err, out)
	}
}

func parseExtinfDurations(manifest string) ([]float64, error) {
	var durations []float64
	lines := strings.Split(manifest, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "#EXTINF:") {
			raw := strings.TrimPrefix(line, "#EXTINF:")
			raw = strings.TrimSuffix(raw, ",")
			d, err := strconv.ParseFloat(raw, 64)
			if err != nil {
				return nil, fmt.Errorf("parse float %q: %w", raw, err)
			}
			durations = append(durations, d)
		}
	}
	return durations, nil
}

func TestEnsureIdleClip_SkipIfFresh(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not on PATH")
	}

	dir := t.TempDir()
	img := filepath.Join(dir, "test.jpg")
	clip := filepath.Join(dir, "idle.mp4")

	makeJPEG(t, img)

	// First call: encodes the clip.
	got, err := EnsureIdleClip("", img, clip)
	if err != nil {
		t.Fatalf("first encode: %v", err)
	}
	if got != clip {
		t.Errorf("got %q want %q", got, clip)
	}
	info1, _ := os.Stat(clip)

	// Second call: clip is fresh → no re-encode; mtime must not change.
	got2, err := EnsureIdleClip("", img, clip)
	if err != nil {
		t.Fatalf("second call: %v", err)
	}
	if got2 != clip {
		t.Errorf("got %q want %q", got2, clip)
	}
	info2, _ := os.Stat(clip)
	if !info2.ModTime().Equal(info1.ModTime()) {
		t.Error("clip was re-encoded even though image did not change")
	}
}

func TestEnsureIdleClip_RegeneratesOnNewerImage(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not on PATH")
	}

	dir := t.TempDir()
	img := filepath.Join(dir, "test.jpg")
	clip := filepath.Join(dir, "idle.mp4")

	makeJPEG(t, img)

	if _, err := EnsureIdleClip("", img, clip); err != nil {
		t.Fatalf("first encode: %v", err)
	}
	oldInfo, _ := os.Stat(clip)

	// Set clip mtime to before the image so it looks stale.
	stale := oldInfo.ModTime().Add(-2 * time.Second)
	if err := os.Chtimes(clip, stale, stale); err != nil {
		t.Fatalf("chtimes: %v", err)
	}

	if _, err := EnsureIdleClip("", img, clip); err != nil {
		t.Fatalf("re-encode: %v", err)
	}
	newInfo, _ := os.Stat(clip)
	if !newInfo.ModTime().After(stale) {
		t.Error("clip mtime not updated after re-encode")
	}
}

func TestEnsureIdleClip_MissingImage(t *testing.T) {
	dir := t.TempDir()
	_, err := EnsureIdleClip("ffmpeg", filepath.Join(dir, "no.jpg"), filepath.Join(dir, "out.mp4"))
	if err == nil {
		t.Fatal("expected error for missing image")
	}
}

func TestEnsureIdleClip_RegeneratesOnEmptyClip(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not on PATH")
	}

	dir := t.TempDir()
	img := filepath.Join(dir, "test.jpg")
	clip := filepath.Join(dir, "idle.mp4")

	makeJPEG(t, img)

	// Create an empty 0-byte file at clip path with future mtime.
	if err := os.WriteFile(clip, []byte{}, 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := EnsureIdleClip("", img, clip)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	if got != clip {
		t.Errorf("got %q want %q", got, clip)
	}
	info, err := os.Stat(clip)
	if err != nil {
		t.Fatal(err)
	}
	if info.Size() == 0 {
		t.Error("clip file is still 0 bytes after EnsureIdleClip")
	}
}

func TestEnsureIdleClip_RegeneratesOnStaleVersion(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not on PATH")
	}

	dir := t.TempDir()
	img := filepath.Join(dir, "test.jpg")
	clip := filepath.Join(dir, "idle.mp4")

	makeJPEG(t, img)

	// Pre-create clip simulating old encode without sidecar .meta file.
	if err := os.WriteFile(clip, []byte("stale clip without meta"), 0o644); err != nil {
		t.Fatal(err)
	}

	got, err := EnsureIdleClip("", img, clip)
	if err != nil {
		t.Fatalf("first encode: %v", err)
	}
	if got != clip {
		t.Errorf("got %q want %q", got, clip)
	}

	meta, err := readIdleMeta(clip + ".meta")
	if err != nil {
		t.Fatalf("expected .meta file to be written: %v", err)
	}
	if meta.Version != idleClipVersion {
		t.Errorf("got version %d, want %d", meta.Version, idleClipVersion)
	}

	// Pre-create clip simulating old version 1 in .meta file.
	oldMeta := idleMeta{Version: 1, ImageMtime: time.Now().UnixNano()}
	metaBytes, err := json.Marshal(oldMeta)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(clip+".meta", metaBytes, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(clip, []byte("stale clip with v1 meta"), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := EnsureIdleClip("", img, clip); err != nil {
		t.Fatalf("re-encode: %v", err)
	}
	newMeta, err := readIdleMeta(clip + ".meta")
	if err != nil {
		t.Fatalf("read new meta: %v", err)
	}
	if newMeta.Version != idleClipVersion {
		t.Errorf("got version %d, want %d", newMeta.Version, idleClipVersion)
	}
	content, _ := os.ReadFile(clip)
	if string(content) == "stale clip with v1 meta" {
		t.Error("clip was not regenerated when .meta version was stale")
	}
}

func TestEnsureIdleClip_SegmentDuration(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not on PATH")
	}

	dir := t.TempDir()
	img := filepath.Join(dir, "test.jpg")
	clip := filepath.Join(dir, "idle.mp4")

	makeJPEG(t, img)

	got, err := EnsureIdleClip("", img, clip)
	if err != nil {
		t.Fatalf("EnsureIdleClip: %v", err)
	}

	outDir := filepath.Join(dir, "hls")
	ctrl := NewFFmpegController("")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cfg := StreamConfig{
		ChannelID:  9999,
		SourcePath: got,
		OutputDir:  outDir,
		CopyCodec:  true,
		Loop:       true,
	}

	if err := ctrl.StartStream(ctx, cfg); err != nil {
		t.Fatalf("StartStream: %v", err)
	}
	defer func() { _ = ctrl.StopStream(cfg.ChannelID) }()

	manifestPath := filepath.Join(outDir, "live.m3u8")
	var durations []float64
	var manifestContent string

	// Poll during the ~5s idle loop run for segments to appear.
	start := time.Now()
	for time.Since(start) < 7*time.Second {
		if data, err := os.ReadFile(manifestPath); err == nil {
			manifestContent = string(data)
			if parsed, err := parseExtinfDurations(manifestContent); err == nil {
				// With 2s keyframes, 2 segments are produced at ~4s.
				if len(parsed) >= 2 || (time.Since(start) >= 5*time.Second && len(parsed) >= 1) {
					durations = parsed
					break
				}
			}
		}
		time.Sleep(100 * time.Millisecond)
	}

	_ = ctrl.StopStream(cfg.ChannelID)

	if len(durations) == 0 {
		t.Fatalf("expected segments in live.m3u8 after ~5s idle run, got none; manifest:\n%s", manifestContent)
	}

	for i, d := range durations {
		if d > 2.5 || d <= 0 {
			t.Errorf("segment %d EXTINF %f is not about 2s (<=2.5s)", i, d)
		}
	}
	t.Logf("idle loop verified: produced %d segments in live.m3u8 with EXTINF: %v", len(durations), durations)
}
