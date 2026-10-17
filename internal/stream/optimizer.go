package stream

import (
	"strings"

	"tv-stream/internal/ingest"
)

// PipelineProfile describes how the source should be handled by ffmpeg.
type PipelineProfile struct {
	CanCopyVideo bool
	CanCopyAudio bool
	FFmpegArgs   []string
}

// OptimizePipeline picks copy or re-encode per stream. Only codecs that are
// HLS-compatible (h264 video, aac audio) are ever copied; anything else
// (hevc, vp8, vp9, ac3, dts, unknown, nil metadata) is re-encoded.
func OptimizePipeline(meta *ingest.MediaMetadata) PipelineProfile {
	var p PipelineProfile
	if meta != nil {
		p.CanCopyVideo = strings.EqualFold(meta.VideoCodec, "h264")
		p.CanCopyAudio = strings.EqualFold(meta.AudioCodec, "aac")
	}
	if p.CanCopyVideo {
		p.FFmpegArgs = append(p.FFmpegArgs, "-c:v", "copy")
	} else {
		p.FFmpegArgs = append(p.FFmpegArgs, "-c:v", "libx264")
	}
	if p.CanCopyAudio {
		p.FFmpegArgs = append(p.FFmpegArgs, "-c:a", "copy")
	} else {
		p.FFmpegArgs = append(p.FFmpegArgs, "-c:a", "aac")
	}
	return p
}
