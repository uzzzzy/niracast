package timeline

import "testing"

func TestFillerNilItemReturnsDefault(t *testing.T) {
	f := &FillerPolicy{DefaultFillerPath: "/media/bumper.mp4"}
	got := f.ResolveGap(nil)
	if got == nil || got.FilePath != "/media/bumper.mp4" || got.RemainingSec <= 0 || got.SeekSeconds != 0 {
		t.Fatalf("unexpected filler: %+v", got)
	}
}

func TestFillerEmptyPathItem(t *testing.T) {
	f := &FillerPolicy{DefaultFillerPath: "/media/bumper.mp4"}
	got := f.ResolveGap(&PlayoutItem{})
	if got == nil || got.FilePath != "/media/bumper.mp4" {
		t.Fatalf("unexpected: %+v", got)
	}
}

func TestFillerPassesThroughValidItem(t *testing.T) {
	f := &FillerPolicy{DefaultFillerPath: "/media/bumper.mp4"}
	in := &PlayoutItem{MediaID: 7, FilePath: "/a.mp4", SeekSeconds: 3, RemainingSec: 10}
	if got := f.ResolveGap(in); got != in {
		t.Fatalf("expected passthrough, got %+v", got)
	}
}

func TestFillerNeverNilWithoutConfig(t *testing.T) {
	var f *FillerPolicy
	if got := f.ResolveGap(nil); got == nil || got.FilePath == "" {
		t.Fatalf("nil receiver must still yield filler: %+v", got)
	}
	if got := (&FillerPolicy{}).ResolveGap(nil); got == nil || got.FilePath != FallbackFillerPath {
		t.Fatalf("empty policy must use fallback: %+v", got)
	}
}
