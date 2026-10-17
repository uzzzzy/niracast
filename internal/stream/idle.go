package stream

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// idleClipVersion indicates the encoding version of the idle clip.
// Incrementing this triggers automatic regeneration of older clips.
const idleClipVersion = 2

type idleMeta struct {
	Version    int   `json:"version"`
	ImageMtime int64 `json:"image_mtime"`
}

func readIdleMeta(metaPath string) (*idleMeta, error) {
	data, err := os.ReadFile(metaPath)
	if err != nil {
		return nil, err
	}
	var meta idleMeta
	if err := json.Unmarshal(data, &meta); err != nil {
		return nil, err
	}
	return &meta, nil
}

// EnsureIdleClip encodes imagePath into a short (~10 s) H.264 MP4 at clipPath,
// suitable for use as a looping idle stream via copy-codec.
//
// Encoding parameters:
//   - Video: libx264 -tune stillimage, scale+pad to 1280×720, 25 fps, ~300 k/s bitrate, yuv420p,
//     keyframe every 2s (-g 50 -keyint_min 50 -sc_threshold 0 -force_key_frames expr:gte(t,n_forced*2))
//   - Audio: silent AAC 48 kHz stereo (lavfi anullsrc)
//   - Duration: 10 seconds; -movflags +faststart for streaming
//
// The clip is regenerated when it is missing, older than the source image,
// or when the sidecar .meta file is absent or does not match the encoding version
// or source image mtime.
// Parent directories of clipPath are created if they do not exist.
// Returns the resolved clipPath on success.
func EnsureIdleClip(ffmpegPath, imagePath, clipPath string) (string, error) {
	if ffmpegPath == "" {
		ffmpegPath = "ffmpeg"
	}

	// Stat the source image.
	imgInfo, err := os.Stat(imagePath)
	if err != nil {
		return "", fmt.Errorf("idle: stat image %q: %w", imagePath, err)
	}

	metaPath := clipPath + ".meta"

	// Check whether the cached clip is already fresh.
	if clipInfo, err := os.Stat(clipPath); err == nil {
		if clipInfo.Size() > 0 && !clipInfo.ModTime().Before(imgInfo.ModTime()) {
			if meta, err := readIdleMeta(metaPath); err == nil {
				if meta.Version == idleClipVersion && meta.ImageMtime == imgInfo.ModTime().UnixNano() {
					// Clip exists, has content, is at least as new as the image,
					// and matches the current encoding version and image timestamp — nothing to do.
					return clipPath, nil
				}
			}
		}
	}

	// Create output directory.
	if err := os.MkdirAll(filepath.Dir(clipPath), 0o755); err != nil {
		return "", fmt.Errorf("idle: create clip dir: %w", err)
	}

	tmpPath := filepath.Join(filepath.Dir(clipPath), ".tmp_"+filepath.Base(clipPath))
	// Encode: JPEG → looping still image MP4 with silent AAC track.
	// vf: force 1280×720 with scale+pad, preserving AR and filling with black.
	// -loop 1 makes FFmpeg treat the single JPEG as an infinite still image source.
	// Keyframe every 2 seconds (at 25 fps: -g 50 -keyint_min 50 -sc_threshold 0
	// and -force_key_frames expr:gte(t,n_forced*2)) ensures HLS segment boundaries
	// can cut cleanly at ~2s without delaying first playback.
	args := []string{
		"-hide_banner", "-loglevel", "error", "-y",
		"-loop", "1", "-framerate", "25", "-i", imagePath,
		"-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
		"-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1",
		"-c:v", "libx264", "-tune", "stillimage", "-preset", "veryfast",
		"-g", "50", "-keyint_min", "50", "-sc_threshold", "0",
		"-force_key_frames", "expr:gte(t,n_forced*2)",
		"-b:v", "300k", "-pix_fmt", "yuv420p",
		"-c:a", "aac", "-b:a", "64k", "-ar", "48000", "-ac", "2",
		"-t", "10",
		"-movflags", "+faststart",
		"-f", "mp4",
		tmpPath,
	}

	out, err := exec.Command(ffmpegPath, args...).CombinedOutput()
	if err != nil {
		_ = os.Remove(tmpPath)
		return "", fmt.Errorf("idle: ffmpeg encode: %w\n%s", err, out)
	}

	metaBytes, err := json.Marshal(idleMeta{
		Version:    idleClipVersion,
		ImageMtime: imgInfo.ModTime().UnixNano(),
	})
	if err != nil {
		_ = os.Remove(tmpPath)
		return "", fmt.Errorf("idle: marshal meta: %w", err)
	}

	if err := os.Rename(tmpPath, clipPath); err != nil {
		_ = os.Remove(tmpPath)
		return "", fmt.Errorf("idle: rename clip: %w", err)
	}
	if err := os.WriteFile(metaPath, metaBytes, 0o644); err != nil {
		return "", fmt.Errorf("idle: write meta: %w", err)
	}
	return clipPath, nil
}
