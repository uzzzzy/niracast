package stream

import (
	"reflect"
	"testing"

	"github.com/uzzzzy/niracast/internal/ingest"
)

func TestOptimizer(t *testing.T) {
	cases := []struct {
		name   string
		meta   *ingest.MediaMetadata
		cv, ca bool
		args   []string
	}{
		{"h264+aac", &ingest.MediaMetadata{VideoCodec: "h264", AudioCodec: "aac"}, true, true, []string{"-c:v", "copy", "-c:a", "copy"}},
		{"hevc+aac", &ingest.MediaMetadata{VideoCodec: "hevc", AudioCodec: "aac"}, false, true, []string{"-c:v", "libx264", "-c:a", "copy"}},
		{"h264+ac3", &ingest.MediaMetadata{VideoCodec: "h264", AudioCodec: "ac3"}, true, false, []string{"-c:v", "copy", "-c:a", "aac"}},
		{"vp9+ac3", &ingest.MediaMetadata{VideoCodec: "vp9", AudioCodec: "ac3"}, false, false, []string{"-c:v", "libx264", "-c:a", "aac"}},
		{"vp8+dts", &ingest.MediaMetadata{VideoCodec: "vp8", AudioCodec: "dts"}, false, false, []string{"-c:v", "libx264", "-c:a", "aac"}},
		{"nil", nil, false, false, []string{"-c:v", "libx264", "-c:a", "aac"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p := OptimizePipeline(c.meta)
			if p.CanCopyVideo != c.cv || p.CanCopyAudio != c.ca {
				t.Fatalf("copy flags = %v/%v, want %v/%v", p.CanCopyVideo, p.CanCopyAudio, c.cv, c.ca)
			}
			if !reflect.DeepEqual(p.FFmpegArgs, c.args) {
				t.Fatalf("args = %v, want %v", p.FFmpegArgs, c.args)
			}
		})
	}
}
