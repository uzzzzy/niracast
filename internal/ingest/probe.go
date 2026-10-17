package ingest

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strconv"
	"time"
)

const probeTimeout = 10 * time.Second

// MediaMetadata holds the essential properties of a media file.
type MediaMetadata struct {
	Path        string
	DurationSec float64
	VideoCodec  string
	AudioCodec  string
	Width       int
	Height      int
}

type ffprobeStream struct {
	CodecType string `json:"codec_type"`
	CodecName string `json:"codec_name"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	Duration  string `json:"duration"`
}

type ffprobeOutput struct {
	Streams []ffprobeStream `json:"streams"`
	Format  struct {
		Duration string `json:"duration"`
	} `json:"format"`
}

// ProbeMedia runs ffprobe on filePath (10s timeout) and extracts metadata.
func ProbeMedia(filePath string) (*MediaMetadata, error) {
	ctx, cancel := context.WithTimeout(context.Background(), probeTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "ffprobe", "-v", "quiet", "-print_format", "json",
		"-show_format", "-show_streams", filePath)
	out, err := cmd.Output()
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return nil, fmt.Errorf("ffprobe timed out after %s: %s", probeTimeout, filePath)
		}
		return nil, fmt.Errorf("ffprobe failed for %s: %w", filePath, err)
	}
	return parseProbeOutput(filePath, out)
}

func parseProbeOutput(filePath string, data []byte) (*MediaMetadata, error) {
	var po ffprobeOutput
	if err := json.Unmarshal(data, &po); err != nil {
		return nil, fmt.Errorf("parse ffprobe output: %w", err)
	}
	md := &MediaMetadata{Path: filePath}
	var videoDur string
	foundVideo, foundAudio := false, false
	for _, s := range po.Streams {
		switch s.CodecType {
		case "video":
			if !foundVideo {
				foundVideo = true
				md.VideoCodec = s.CodecName
				md.Width = s.Width
				md.Height = s.Height
				videoDur = s.Duration
			}
		case "audio":
			if !foundAudio {
				foundAudio = true
				md.AudioCodec = s.CodecName
			}
		}
	}
	durStr := po.Format.Duration
	if durStr == "" {
		durStr = videoDur
	}
	if durStr != "" {
		d, err := strconv.ParseFloat(durStr, 64)
		if err != nil {
			return nil, fmt.Errorf("invalid duration %q: %w", durStr, err)
		}
		md.DurationSec = d
	}
	return md, nil
}
