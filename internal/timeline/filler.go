package timeline

import "math"

// FallbackFillerPath is used when no DefaultFillerPath is configured.
const FallbackFillerPath = "assets/filler/siaran_segera_kembali.mp4"

// FillerLoopSec is the nominal remaining time reported for a looping filler.
const FillerLoopSec = 3600.0

// FillerMediaID marks a PlayoutItem as synthetic filler (not a DB media row).
const FillerMediaID int64 = 0

// FillerPolicy supplies a looping fallback when a channel has nothing to air.
type FillerPolicy struct {
	DefaultFillerPath string // Video interstitial/bumper/kartu jeda default
}

// ResolveGap returns item unchanged when it is valid, otherwise a valid
// filler PlayoutItem. It never returns nil and is safe on a nil receiver.
func (f *FillerPolicy) ResolveGap(item *PlayoutItem) *PlayoutItem {
	if item != nil && item.FilePath != "" &&
		!math.IsNaN(item.SeekSeconds) && !math.IsNaN(item.RemainingSec) {
		return item
	}
	path := FallbackFillerPath
	if f != nil && f.DefaultFillerPath != "" {
		path = f.DefaultFillerPath
	}
	return &PlayoutItem{
		MediaID:      FillerMediaID,
		FilePath:     path,
		SeekSeconds:  0,
		RemainingSec: FillerLoopSec,
	}
}
