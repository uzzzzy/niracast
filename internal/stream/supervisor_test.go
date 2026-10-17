package stream

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"tv-stream/internal/ingest"
	"tv-stream/internal/timeline"
)

// --- fakes ---

// fakeController is a ProcessController whose start/stop/done can be driven
// programmatically in tests.
type fakeController struct {
	mu      sync.Mutex
	starts  []StreamConfig
	running map[int64]chan struct{} // open = running; close() = exit
	stopErr error
}

func newFakeController() *fakeController {
	return &fakeController{running: make(map[int64]chan struct{})}
}

func (f *fakeController) StartStream(_ context.Context, cfg StreamConfig) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, ok := f.running[cfg.ChannelID]; ok {
		return errors.New("already running")
	}
	done := make(chan struct{})
	f.running[cfg.ChannelID] = done
	f.starts = append(f.starts, cfg)
	return nil
}

func (f *fakeController) StopStream(id int64) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if ch, ok := f.running[id]; ok {
		delete(f.running, id)
		close(ch)
	}
	return f.stopErr
}

func (f *fakeController) IsRunning(id int64) bool {
	f.mu.Lock()
	defer f.mu.Unlock()
	_, ok := f.running[id]
	return ok
}

func (f *fakeController) Done(id int64) <-chan struct{} {
	f.mu.Lock()
	ch, ok := f.running[id]
	f.mu.Unlock()
	if ok {
		return ch
	}
	closed := make(chan struct{})
	close(closed)
	return closed
}

func (f *fakeController) StderrTail(_ int64) string {
	return ""
}

// exitChannel closes the running channel for channelID, simulating natural exit.
func (f *fakeController) exitChannel(id int64) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if ch, ok := f.running[id]; ok {
		delete(f.running, id)
		close(ch)
	}
}

// startCount returns how many times StartStream was called.
func (f *fakeController) startCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.starts)
}

// lastConfig returns the most recent StreamConfig passed to StartStream.
func (f *fakeController) lastConfig() (StreamConfig, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.starts) == 0 {
		return StreamConfig{}, false
	}
	return f.starts[len(f.starts)-1], true
}

// fakeResolver implements timeline.TimelineCalculator.
type fakeResolver struct {
	mu      sync.Mutex
	items   []timeline.PlayoutItem // nil = ErrEmptyPlaylist
	callIdx int                    // rotates through items on each call
}

func (r *fakeResolver) GetCurrentPlayout(_ int64, _ time.Time) (*timeline.PlayoutItem, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.items) == 0 {
		return nil, timeline.ErrEmptyPlaylist
	}
	it := r.items[r.callIdx%len(r.items)]
	r.callIdx++
	return &it, nil
}

func (r *fakeResolver) setItems(items []timeline.PlayoutItem) {
	r.mu.Lock()
	r.items = items
	r.mu.Unlock()
}

// fakeActive is an ActiveChecker that can be flipped.
type fakeActive struct {
	active atomic.Bool
}

func (a *fakeActive) IsActive(_ int64) bool { return a.active.Load() }

// --- helpers ---

func noopCodec(_ int64) ingest.MediaMetadata {
	return ingest.MediaMetadata{VideoCodec: "h264", AudioCodec: "aac"}
}

func waitCond(t *testing.T, d time.Duration, cond func() bool) bool {
	t.Helper()
	deadline := time.Now().Add(d)
	for time.Now().Before(deadline) {
		if cond() {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return cond()
}

// makeTempFile creates a real file in t.TempDir() so os.Stat succeeds.
func makeTempFile(t *testing.T, name string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(p, []byte("stub"), 0o644); err != nil {
		t.Fatalf("makeTempFile: %v", err)
	}
	return p
}

// TestSupervisor_RollsToNextItem verifies that when the first stream exits
// naturally, the supervisor starts a second stream automatically.
func TestSupervisor_RollsToNextItem(t *testing.T) {
	ctrl := newFakeController()
	fileA := makeTempFile(t, "a.mp4")
	fileB := makeTempFile(t, "b.mp4")
	resolver := &fakeResolver{items: []timeline.PlayoutItem{
		{MediaID: 1, FilePath: fileA, SeekSeconds: 0, RemainingSec: 30},
		{MediaID: 2, FilePath: fileB, SeekSeconds: 0, RemainingSec: 30},
	}}
	active := &fakeActive{}
	active.active.Store(true)

	sv := NewSupervisor(resolver, ctrl, active, noopCodec, "idle.mp4", t.TempDir())

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sv.Ensure(ctx, 1)

	// Wait for the first StartStream.
	if !waitCond(t, 5*time.Second, func() bool { return ctrl.startCount() >= 1 }) {
		t.Fatal("first start not called")
	}

	// Simulate the first stream ending naturally.
	ctrl.exitChannel(1)

	// The supervisor must roll over and start a second stream.
	if !waitCond(t, 5*time.Second, func() bool { return ctrl.startCount() >= 2 }) {
		t.Fatal("second start not called after first exit")
	}
	// The second start must use Append=true.
	cfg, _ := ctrl.lastConfig()
	if !cfg.Append {
		t.Errorf("second start: Append want true got false")
	}
}

// TestSupervisor_EmptyPlaylistUsesIdle verifies that an empty playlist triggers
// the idle clip with Loop=true and CopyCodec=true.
func TestSupervisor_EmptyPlaylistUsesIdle(t *testing.T) {
	ctrl := newFakeController()
	resolver := &fakeResolver{} // no items → ErrEmptyPlaylist
	active := &fakeActive{}
	active.active.Store(true)

	idleClip := "idle.mp4"
	sv := NewSupervisor(resolver, ctrl, active, noopCodec, idleClip, t.TempDir())

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sv.Ensure(ctx, 2)

	if !waitCond(t, 5*time.Second, func() bool { return ctrl.startCount() >= 1 }) {
		t.Fatal("start not called for empty playlist")
	}
	cfg, _ := ctrl.lastConfig()
	if cfg.SourcePath != idleClip {
		t.Errorf("SourcePath = %q, want %q", cfg.SourcePath, idleClip)
	}
	if !cfg.Loop {
		t.Error("Loop want true got false")
	}
	if !cfg.CopyCodec {
		t.Error("CopyCodec want true got false")
	}
}

// TestSupervisor_IdleToRealSwitch verifies that when a real item appears while
// idle is playing, the supervisor switches to it with Append=true.
func TestSupervisor_IdleToRealSwitch(t *testing.T) {
	ctrl := newFakeController()
	resolver := &fakeResolver{} // starts empty
	active := &fakeActive{}
	active.active.Store(true)

	idleClip := "idle.mp4"
	sv := NewSupervisor(resolver, ctrl, active, noopCodec, idleClip, t.TempDir())

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sv.Ensure(ctx, 3)

	// Wait for idle to start.
	if !waitCond(t, 5*time.Second, func() bool { return ctrl.startCount() >= 1 }) {
		t.Fatal("idle start not called")
	}
	cfg1, _ := ctrl.lastConfig()
	if cfg1.SourcePath != idleClip {
		t.Fatalf("expected idle clip, got %q", cfg1.SourcePath)
	}

	// Now add a real item to the resolver. Use a temp file so os.Stat succeeds.
	realFile := makeTempFile(t, "real.mp4")
	resolver.setItems([]timeline.PlayoutItem{
		{MediaID: 10, FilePath: realFile, SeekSeconds: 0, RemainingSec: 30},
	})

	// The supervisor's 5 s idle poll will detect the real item and switch.
	// To speed up the test, stop the idle process directly.
	ctrl.exitChannel(3)

	if !waitCond(t, 10*time.Second, func() bool { return ctrl.startCount() >= 2 }) {
		t.Fatal("switch to real item not triggered")
	}
	cfg2, _ := ctrl.lastConfig()
	if cfg2.SourcePath != realFile {
		t.Errorf("SourcePath = %q, want %q", cfg2.SourcePath, realFile)
	}
	if !cfg2.Append {
		t.Error("Append want true after idle->real switch")
	}
}

// TestSupervisor_StopsWhenInactive verifies that the loop exits when the
// channel is no longer active (no viewers).
func TestSupervisor_StopsWhenInactive(t *testing.T) {
	ctrl := newFakeController()
	fileA := makeTempFile(t, "a.mp4")
	resolver := &fakeResolver{items: []timeline.PlayoutItem{
		{MediaID: 1, FilePath: fileA, SeekSeconds: 0, RemainingSec: 30},
	}}
	active := &fakeActive{}
	active.active.Store(true)

	sv := NewSupervisor(resolver, ctrl, active, noopCodec, "idle.mp4", t.TempDir())

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sv.Ensure(ctx, 4)

	if !waitCond(t, 5*time.Second, func() bool { return ctrl.startCount() >= 1 }) {
		t.Fatal("start not called")
	}

	// Mark inactive and stop the running process.
	active.active.Store(false)
	ctrl.exitChannel(4)

	// The loop goroutine should remove itself from active map.
	if !waitCond(t, 5*time.Second, func() bool {
		sv.mu.Lock()
		defer sv.mu.Unlock()
		_, running := sv.active[4]
		return !running
	}) {
		t.Fatal("loop goroutine did not exit after channel became inactive")
	}
}

// TestSupervisor_EnsureIdempotent verifies that calling Ensure twice for the
// same channel does not start a second goroutine loop.
func TestSupervisor_EnsureIdempotent(t *testing.T) {
	ctrl := newFakeController()
	resolver := &fakeResolver{}
	active := &fakeActive{}
	active.active.Store(true)

	sv := NewSupervisor(resolver, ctrl, active, noopCodec, "idle.mp4", t.TempDir())

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sv.Ensure(ctx, 5)
	sv.Ensure(ctx, 5)
	sv.Ensure(ctx, 5)

	time.Sleep(50 * time.Millisecond)

	sv.mu.Lock()
	n := len(sv.active)
	sv.mu.Unlock()
	if n != 1 {
		t.Errorf("active loops = %d, want 1", n)
	}
}

// TestSupervisor_IdleToRealSwitch_Automatic verifies that the idle poll ticker
// automatically detects the appearance of a real playlist item and switches to
// it without requiring manual process termination.
func TestSupervisor_IdleToRealSwitch_Automatic(t *testing.T) {
	ctrl := newFakeController()
	resolver := &fakeResolver{} // starts empty
	active := &fakeActive{}
	active.active.Store(true)

	idleClip := "idle.mp4"
	sv := NewSupervisor(resolver, ctrl, active, noopCodec, idleClip, t.TempDir())
	sv.idlePollInterval = 20 * time.Millisecond // fast ticker for test

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sv.Ensure(ctx, 6)

	if !waitCond(t, 5*time.Second, func() bool { return ctrl.startCount() >= 1 }) {
		t.Fatal("idle start not called")
	}

	realFile := makeTempFile(t, "real6.mp4")
	resolver.setItems([]timeline.PlayoutItem{
		{MediaID: 60, FilePath: realFile, SeekSeconds: 0, RemainingSec: 30},
	})

	// The ticker should automatically detect realFile and trigger switch without exitChannel.
	if !waitCond(t, 5*time.Second, func() bool { return ctrl.startCount() >= 2 }) {
		t.Fatal("automatic switch to real item not triggered by poll ticker")
	}

	cfg, _ := ctrl.lastConfig()
	if cfg.SourcePath != realFile {
		t.Errorf("SourcePath = %q, want %q", cfg.SourcePath, realFile)
	}
	if !cfg.Append {
		t.Error("Append want true after automatic idle->real switch")
	}
}

// TestSupervisor_MissingFileStaysInIdle verifies that when a playlist item's file
// is missing from disk, waitIdleOrReal does NOT stop idle and restart the stream.
func TestSupervisor_MissingFileStaysInIdle(t *testing.T) {
	ctrl := newFakeController()
	resolver := &fakeResolver{}
	active := &fakeActive{}
	active.active.Store(true)

	idleClip := "idle.mp4"
	sv := NewSupervisor(resolver, ctrl, active, noopCodec, idleClip, t.TempDir())
	sv.idlePollInterval = 20 * time.Millisecond

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sv.Ensure(ctx, 7)

	if !waitCond(t, 5*time.Second, func() bool { return ctrl.startCount() >= 1 }) {
		t.Fatal("idle start not called")
	}

	// Add an item pointing to a non-existent file on disk.
	missingPath := filepath.Join(t.TempDir(), "nonexistent.mp4")
	resolver.setItems([]timeline.PlayoutItem{
		{MediaID: 70, FilePath: missingPath, SeekSeconds: 0, RemainingSec: 30},
	})

	// Allow multiple ticker cycles to fire.
	time.Sleep(100 * time.Millisecond)

	// Since file does not exist, startCount should still be 1 (idle continues uninterrupted).
	if count := ctrl.startCount(); count != 1 {
		t.Errorf("startCount = %d, want 1 (should stay in idle for missing file)", count)
	}
}

// TestSupervisor_EnsureConcurrent verifies that multiple concurrent calls to
// Ensure across many goroutines start only one supervisor loop.
func TestSupervisor_EnsureConcurrent(t *testing.T) {
	ctrl := newFakeController()
	resolver := &fakeResolver{}
	active := &fakeActive{}
	active.active.Store(true)

	sv := NewSupervisor(resolver, ctrl, active, noopCodec, "idle.mp4", t.TempDir())

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			sv.Ensure(ctx, 8)
		}()
	}
	wg.Wait()

	time.Sleep(50 * time.Millisecond)
	sv.mu.Lock()
	n := len(sv.active)
	sv.mu.Unlock()
	if n != 1 {
		t.Errorf("active loops = %d, want 1", n)
	}
}

// TestSupervisor_StopsStreamOnLoopExit verifies that cancelling context stops
// the active stream process cleanly.
func TestSupervisor_StopsStreamOnLoopExit(t *testing.T) {
	ctrl := newFakeController()
	resolver := &fakeResolver{}
	active := &fakeActive{}
	active.active.Store(true)

	sv := NewSupervisor(resolver, ctrl, active, noopCodec, "idle.mp4", t.TempDir())

	ctx, cancel := context.WithCancel(context.Background())
	sv.Ensure(ctx, 9)

	if !waitCond(t, 5*time.Second, func() bool { return ctrl.IsRunning(9) }) {
		t.Fatal("stream not running")
	}

	cancel()

	if !waitCond(t, 5*time.Second, func() bool { return !ctrl.IsRunning(9) }) {
		t.Fatal("stream process was not stopped on context cancellation")
	}
}

// TestSupervisor_OutputDirNotWipedBetweenItems verifies that segments created
// during item 1 remain in the output directory when advancing to item 2.
func TestSupervisor_OutputDirNotWipedBetweenItems(t *testing.T) {
	ctrl := newFakeController()
	fileA := makeTempFile(t, "itemA.mp4")
	fileB := makeTempFile(t, "itemB.mp4")
	resolver := &fakeResolver{items: []timeline.PlayoutItem{
		{MediaID: 1, FilePath: fileA, SeekSeconds: 0, RemainingSec: 30},
		{MediaID: 2, FilePath: fileB, SeekSeconds: 0, RemainingSec: 30},
	}}
	active := &fakeActive{}
	active.active.Store(true)

	root := t.TempDir()
	sv := NewSupervisor(resolver, ctrl, active, noopCodec, "idle.mp4", root)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sv.Ensure(ctx, 10)

	if !waitCond(t, 5*time.Second, func() bool { return ctrl.startCount() >= 1 }) {
		t.Fatal("first start not called")
	}

	// Create a marker file in the output dir to simulate an HLS segment.
	chDir := filepath.Join(root, "10")
	if err := os.MkdirAll(chDir, 0o755); err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(chDir, "segment0.ts")
	if err := os.WriteFile(marker, []byte("ts-data"), 0o644); err != nil {
		t.Fatal(err)
	}

	// End stream 1 naturally so supervisor advances to item 2.
	ctrl.exitChannel(10)

	if !waitCond(t, 5*time.Second, func() bool { return ctrl.startCount() >= 2 }) {
		t.Fatal("second start not called")
	}

	// The marker file must still exist (not wiped by os.RemoveAll between items).
	if _, err := os.Stat(marker); os.IsNotExist(err) {
		t.Error("output directory was wiped between items; segment0.ts was removed")
	}
}

func TestSupervisor_StopStreamAndRunningCount(t *testing.T) {
	ctrl := newFakeController()
	active := &fakeActive{}
	sup := NewSupervisor(&fakeResolver{}, ctrl, active, noopCodec, "idle.mp4", t.TempDir())

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if sup.RunningCount() != 0 {
		t.Errorf("initial RunningCount = %d, want 0", sup.RunningCount())
	}

	sup.Ensure(ctx, 42)
	if !waitCond(t, 2*time.Second, func() bool { return sup.RunningCount() == 1 }) {
		t.Fatalf("expected RunningCount=1 after Ensure")
	}

	if err := sup.StopStream(42); err != nil {
		t.Errorf("StopStream returned error: %v", err)
	}

	if sup.RunningCount() != 0 {
		t.Errorf("RunningCount after StopStream = %d, want 0", sup.RunningCount())
	}
	if ctrl.IsRunning(42) {
		t.Errorf("expected controller stream to be stopped for channel 42")
	}

	st := sup.Status(42)
	if st.State != "stopped" {
		t.Errorf("expected Status.State = 'stopped', got %q", st.State)
	}
}

// TestSupervisor_GapToRealAtNextStartWithoutPollWait verifies that when in a gap,
// the supervisor uses the idle clip and switches to the real item exactly when NextStart arrives,
// without waiting for the 5 s idle poll interval.
func TestSupervisor_GapToRealAtNextStartWithoutPollWait(t *testing.T) {
	ctrl := newFakeController()
	active := &fakeActive{}
	active.active.Store(true)

	idleClip := "idle.mp4"
	realFile := makeTempFile(t, "gap_real.mp4")

	nextStart := time.Now().Add(60 * time.Millisecond)

	var mu sync.Mutex
	callCount := 0
	resolver := &customPlayoutFunc{
		playoutFunc: func(_ int64, _ time.Time) (*timeline.PlayoutItem, error) {
			mu.Lock()
			defer mu.Unlock()
			callCount++
			if time.Now().Before(nextStart) {
				return &timeline.PlayoutItem{
					Gap:          true,
					NextStart:    nextStart,
					RemainingSec: time.Until(nextStart).Seconds(),
				}, nil
			}
			return &timeline.PlayoutItem{
				MediaID:      99,
				FilePath:     realFile,
				RemainingSec: 30,
			}, nil
		},
	}

	sv := NewSupervisor(resolver, ctrl, active, noopCodec, idleClip, t.TempDir())
	sv.idlePollInterval = 5 * time.Second // 5 seconds poll

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sv.Ensure(ctx, 80)

	// Wait for idle start.
	if !waitCond(t, 2*time.Second, func() bool { return ctrl.startCount() >= 1 }) {
		t.Fatal("idle start not called")
	}
	cfg1, _ := ctrl.lastConfig()
	if cfg1.SourcePath != idleClip {
		t.Fatalf("first start SourcePath = %q, want %q", cfg1.SourcePath, idleClip)
	}

	// Must switch to real item shortly after NextStart (< 1s, way before 5s poll).
	if !waitCond(t, 1*time.Second, func() bool { return ctrl.startCount() >= 2 }) {
		t.Fatal("switch to real item at NextStart did not trigger within 1s")
	}
	cfg2, _ := ctrl.lastConfig()
	if cfg2.SourcePath != realFile {
		t.Fatalf("second start SourcePath = %q, want %q", cfg2.SourcePath, realFile)
	}
}

// TestSupervisor_StopAfterSecCutsRunningItemWithoutPenalty verifies that in scheduled mode,
// StopAfterSec cuts the running item and advances without fast-failure penalty.
func TestSupervisor_StopAfterSecCutsRunningItemWithoutPenalty(t *testing.T) {
	ctrl := newFakeController()
	active := &fakeActive{}
	active.active.Store(true)

	realFile1 := makeTempFile(t, "cut1.mp4")
	realFile2 := makeTempFile(t, "cut2.mp4")

	var mu sync.Mutex
	itemIdx := 0
	resolver := &customPlayoutFunc{
		playoutFunc: func(_ int64, _ time.Time) (*timeline.PlayoutItem, error) {
			mu.Lock()
			defer mu.Unlock()
			if itemIdx == 0 {
				itemIdx++
				return &timeline.PlayoutItem{
					MediaID:      1,
					FilePath:     realFile1,
					StopAfterSec: 0.05, // 50ms cutoff
					RemainingSec: 30,
				}, nil
			}
			return &timeline.PlayoutItem{
				MediaID:      2,
				FilePath:     realFile2,
				StopAfterSec: 0.05,
				RemainingSec: 30,
			}, nil
		},
	}

	sv := NewSupervisor(resolver, ctrl, active, noopCodec, "idle.mp4", t.TempDir())

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sv.Ensure(ctx, 81)

	// Stream 1 starts, cuts off after 50ms, and stream 2 starts without 2s backoff delay.
	if !waitCond(t, 1*time.Second, func() bool { return ctrl.startCount() >= 2 }) {
		t.Fatal("item 2 did not start within 1s (fast-failure backoff may have fired)")
	}

	cfg2, _ := ctrl.lastConfig()
	if cfg2.SourcePath != realFile2 {
		t.Errorf("second start SourcePath = %q, want %q", cfg2.SourcePath, realFile2)
	}
}

// TestSupervisor_ReloadRestartsResolution verifies that Reload terminates the current
// process and immediately resolves playout anew.
func TestSupervisor_ReloadRestartsResolution(t *testing.T) {
	ctrl := newFakeController()
	active := &fakeActive{}
	active.active.Store(true)

	realFile1 := makeTempFile(t, "rel1.mp4")
	realFile2 := makeTempFile(t, "rel2.mp4")

	resolver := &fakeResolver{
		items: []timeline.PlayoutItem{
			{MediaID: 1, FilePath: realFile1, RemainingSec: 60},
		},
	}

	sv := NewSupervisor(resolver, ctrl, active, noopCodec, "idle.mp4", t.TempDir())

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sv.Ensure(ctx, 82)

	if !waitCond(t, 2*time.Second, func() bool { return ctrl.startCount() >= 1 }) {
		t.Fatal("first start not called")
	}

	// Change resolver to item 2 and call Reload
	resolver.setItems([]timeline.PlayoutItem{
		{MediaID: 2, FilePath: realFile2, RemainingSec: 60},
	})

	sv.Reload(82)

	if !waitCond(t, 2*time.Second, func() bool { return ctrl.startCount() >= 2 }) {
		t.Fatal("reload did not trigger new start")
	}

	cfg2, _ := ctrl.lastConfig()
	if cfg2.SourcePath != realFile2 {
		t.Errorf("reloaded start SourcePath = %q, want %q", cfg2.SourcePath, realFile2)
	}

	// Reload on unstarted channel is a safe no-op
	sv.Reload(9999)
}

// TestSupervisor_SkipReturnsErrSkipUnavailableInScheduledMode verifies that Skip
// returns ErrSkipUnavailable in scheduled mode and works in loop mode.
func TestSupervisor_SkipReturnsErrSkipUnavailableInScheduledMode(t *testing.T) {
	ctrl := newFakeController()
	active := &fakeActive{}
	active.active.Store(true)

	realFile := makeTempFile(t, "skip_sched.mp4")
	tRes := &timelineResolver{
		items: []timeline.Item{
			{MediaID: 10, FilePath: realFile, Duration: 60},
		},
	}

	sv := NewSupervisor(tRes, ctrl, active, noopCodec, "idle.mp4", t.TempDir())

	currentMode := "scheduled"
	sv.SetModeLookup(func(_ int64) (string, error) {
		return currentMode, nil
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sv.Ensure(ctx, 83)

	if !waitCond(t, 2*time.Second, func() bool {
		return sv.Status(83).State == "playing"
	}) {
		t.Fatal("channel did not enter playing state")
	}

	// 1. In scheduled mode, Skip returns ErrSkipUnavailable
	_, err := sv.Skip(83)
	if !errors.Is(err, ErrSkipUnavailable) {
		t.Fatalf("Skip in scheduled mode: got %v, want %v", err, ErrSkipUnavailable)
	}

	// 2. In loop mode, Skip succeeds
	currentMode = "loop"
	st, err := sv.Skip(83)
	if err != nil {
		t.Fatalf("Skip in loop mode returned unexpected error: %v", err)
	}
	if st.SkipOffsetSec <= 0 {
		t.Errorf("SkipOffsetSec = %f, want > 0", st.SkipOffsetSec)
	}
}

type customPlayoutFunc struct {
	playoutFunc func(channelID int64, now time.Time) (*timeline.PlayoutItem, error)
}

func (c *customPlayoutFunc) GetCurrentPlayout(channelID int64, now time.Time) (*timeline.PlayoutItem, error) {
	return c.playoutFunc(channelID, now)
}
