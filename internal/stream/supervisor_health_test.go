package stream

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"tv-stream/internal/timeline"
)

type failController struct {
	*fakeController
	failStart bool
	startErr  error
	stderr    string
	exitErr   error
}

func (f *failController) StartStream(ctx context.Context, cfg StreamConfig) error {
	if f.failStart {
		return f.startErr
	}
	return f.fakeController.StartStream(ctx, cfg)
}

func (f *failController) StderrTail(id int64) string {
	if f.stderr != "" {
		return f.stderr
	}
	return f.fakeController.StderrTail(id)
}

func (f *failController) LastExitErr(id int64) error {
	if f.exitErr != nil {
		return f.exitErr
	}
	return f.fakeController.LastExitErr(id)
}

func TestSupervisor_Health_StartStreamFailure(t *testing.T) {
	fakeCtrl := newFakeController()
	ctrl := &failController{
		fakeController: fakeCtrl,
		failStart:      true,
		startErr:       errors.New("ffmpeg spawn failed"),
	}

	tempFile := makeTempFile(t, "health_fail.mp4")
	resolver := &fakeResolver{
		items: []timeline.PlayoutItem{
			{MediaID: 10, FilePath: tempFile, RemainingSec: 60},
		},
	}
	active := &fakeActive{}
	active.active.Store(true)

	pub := &fakeRecorderPublisher{}
	sv := NewSupervisor(resolver, ctrl, active, noopCodec, "idle.mp4", t.TempDir())
	sv.SetPublisher(pub)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	channelID := int64(1001)
	sv.Ensure(ctx, channelID)

	// Wait for restart count to be incremented and error recorded
	if !waitCond(t, 3*time.Second, func() bool {
		restarts, lastErr := sv.Health(channelID)
		return restarts >= 1 && lastErr == "ffmpeg spawn failed"
	}) {
		r, e := sv.Health(channelID)
		t.Fatalf("expected restart >= 1 and last error, got restarts=%d, lastErr=%q", r, e)
	}

	st := sv.Status(channelID)
	if st.Restarts < 1 || st.LastError != "ffmpeg spawn failed" {
		t.Errorf("Status() Restarts=%d, LastError=%q", st.Restarts, st.LastError)
	}

	// Verify channel.health event was published
	var foundHealth bool
	for _, ev := range pub.all() {
		if ev.Type == "channel.health" && ev.ChannelID == channelID {
			if ev.Data["last_error"] == "ffmpeg spawn failed" {
				foundHealth = true
				break
			}
		}
	}
	if !foundHealth {
		t.Errorf("channel.health event not received for StartStream failure; got: %+v", pub.all())
	}
}

func TestSupervisor_Health_FastExitBranch(t *testing.T) {
	fakeCtrl := newFakeController()
	ctrl := &failController{
		fakeController: fakeCtrl,
		stderr:         "exit code 1: codec error",
	}

	tempFile := makeTempFile(t, "health_fast.mp4")
	resolver := &fakeResolver{
		items: []timeline.PlayoutItem{
			{MediaID: 20, FilePath: tempFile, RemainingSec: 60},
		},
	}
	active := &fakeActive{}
	active.active.Store(true)

	pub := &fakeRecorderPublisher{}
	sv := NewSupervisor(resolver, ctrl, active, noopCodec, "idle.mp4", t.TempDir())
	sv.SetPublisher(pub)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	channelID := int64(1002)
	sv.Ensure(ctx, channelID)

	// Wait for stream to start
	if !waitCond(t, 2*time.Second, func() bool {
		return sv.Status(channelID).State == "playing"
	}) {
		t.Fatal("stream did not transition to playing")
	}

	// Exit quickly (< 2 seconds) to trigger fast-exit branch
	ctrl.exitChannel(channelID)

	// Wait for restart count and last error from stderr tail
	if !waitCond(t, 3*time.Second, func() bool {
		restarts, lastErr := sv.Health(channelID)
		return restarts >= 1 && lastErr == "exit code 1: codec error"
	}) {
		r, e := sv.Health(channelID)
		t.Fatalf("expected restart >= 1 and stderr tail, got restarts=%d, lastErr=%q", r, e)
	}

	// Verify channel.health event was published
	var foundHealth bool
	for _, ev := range pub.all() {
		if ev.Type == "channel.health" && ev.ChannelID == channelID {
			if ev.Data["last_error"] == "exit code 1: codec error" {
				foundHealth = true
				break
			}
		}
	}
	if !foundHealth {
		t.Errorf("channel.health event not received for fast exit; got: %+v", pub.all())
	}
}

func TestSupervisor_Health_LoopIterations(t *testing.T) {
	ctrl := newFakeController()
	file1 := makeTempFile(t, "item1.mp4")
	file2 := makeTempFile(t, "item2.mp4")

	resolver := &timelineResolver{
		items: []timeline.Item{
			{MediaID: 101, FilePath: file1, Duration: 60},
			{MediaID: 102, FilePath: file2, Duration: 60},
		},
	}
	active := &fakeActive{}
	active.active.Store(true)

	pub := &fakeRecorderPublisher{}
	sv := NewSupervisor(resolver, ctrl, active, noopCodec, "idle.mp4", t.TempDir())
	sv.SetPublisher(pub)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	channelID := int64(1003)
	sv.Ensure(ctx, channelID)

	if !waitCond(t, 2*time.Second, func() bool {
		return sv.Status(channelID).State == "playing"
	}) {
		t.Fatal("channel did not start playing")
	}

	// Advance with Skip (intentional handoff / next iteration)
	st, err := sv.Skip(channelID)
	if err != nil {
		t.Fatalf("Skip failed: %v", err)
	}

	// Wait for restart counter to increment on next iteration
	if !waitCond(t, 3*time.Second, func() bool {
		restarts, _ := sv.Health(channelID)
		return restarts >= 1
	}) {
		r, _ := sv.Health(channelID)
		t.Fatalf("expected restarts >= 1 on second iteration, got %d (status: %+v)", r, st)
	}

	// Verify channel.health event was published
	var foundHealth bool
	for _, ev := range pub.all() {
		if ev.Type == "channel.health" && ev.ChannelID == channelID {
			if r, ok := ev.Data["restarts"].(int); ok && r >= 1 {
				foundHealth = true
				break
			}
		}
	}
	if !foundHealth {
		t.Errorf("channel.health event not received on loop restart; got: %+v", pub.all())
	}
}

func TestSupervisor_Health_NonFastExitError(t *testing.T) {
	fakeCtrl := newFakeController()
	ctrl := &failController{
		fakeController: fakeCtrl,
		exitErr:        errors.New("signal: killed"),
	}

	tempFile := makeTempFile(t, "health_nonfast.mp4")
	resolver := &fakeResolver{
		items: []timeline.PlayoutItem{
			{MediaID: 30, FilePath: tempFile, RemainingSec: 60},
		},
	}
	active := &fakeActive{}
	active.active.Store(true)

	pub := &fakeRecorderPublisher{}
	sv := NewSupervisor(resolver, ctrl, active, noopCodec, "idle.mp4", t.TempDir())
	sv.SetPublisher(pub)

	var mu sync.Mutex
	currentTime := time.Now()
	sv.now = func() time.Time {
		mu.Lock()
		defer mu.Unlock()
		return currentTime
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	channelID := int64(1004)
	sv.Ensure(ctx, channelID)

	// Wait for stream to start
	if !waitCond(t, 2*time.Second, func() bool {
		return sv.Status(channelID).State == "playing"
	}) {
		t.Fatal("stream did not transition to playing")
	}

	// Advance time past 2 seconds (e.g. 53s) so it is treated as a non-fast exit
	mu.Lock()
	currentTime = currentTime.Add(53 * time.Second)
	mu.Unlock()

	ctrl.exitChannel(channelID)

	// Wait for restart count to be incremented and last error recorded as "signal: killed"
	if !waitCond(t, 3*time.Second, func() bool {
		restarts, lastErr := sv.Health(channelID)
		return restarts >= 1 && lastErr == "signal: killed"
	}) {
		r, e := sv.Health(channelID)
		t.Fatalf("expected restart >= 1 and last error 'signal: killed', got restarts=%d, lastErr=%q", r, e)
	}

	st := sv.Status(channelID)
	if st.Restarts < 1 || st.LastError != "signal: killed" {
		t.Errorf("Status() Restarts=%d, LastError=%q", st.Restarts, st.LastError)
	}

	// Verify channel.health event was published
	var foundHealth bool
	for _, ev := range pub.all() {
		if ev.Type == "channel.health" && ev.ChannelID == channelID {
			if ev.Data["last_error"] == "signal: killed" {
				foundHealth = true
				break
			}
		}
	}
	if !foundHealth {
		t.Errorf("channel.health event not received for non-fast exit; got: %+v", pub.all())
	}
}

func TestSupervisor_Health_NonFastExitWithStderr(t *testing.T) {
	fakeCtrl := newFakeController()
	ctrl := &failController{
		fakeController: fakeCtrl,
		exitErr:        errors.New("exit status 1"),
		stderr:         "codec error",
	}

	tempFile := makeTempFile(t, "health_nonfast_stderr.mp4")
	resolver := &fakeResolver{
		items: []timeline.PlayoutItem{
			{MediaID: 35, FilePath: tempFile, RemainingSec: 60},
		},
	}
	active := &fakeActive{}
	active.active.Store(true)

	pub := &fakeRecorderPublisher{}
	sv := NewSupervisor(resolver, ctrl, active, noopCodec, "idle.mp4", t.TempDir())
	sv.SetPublisher(pub)

	var mu sync.Mutex
	currentTime := time.Now()
	sv.now = func() time.Time {
		mu.Lock()
		defer mu.Unlock()
		return currentTime
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	channelID := int64(1005)
	sv.Ensure(ctx, channelID)

	if !waitCond(t, 2*time.Second, func() bool {
		return sv.Status(channelID).State == "playing"
	}) {
		t.Fatal("stream did not transition to playing")
	}

	mu.Lock()
	currentTime = currentTime.Add(53 * time.Second)
	mu.Unlock()

	ctrl.exitChannel(channelID)

	expectedErr := "exit status 1: codec error"
	if !waitCond(t, 3*time.Second, func() bool {
		restarts, lastErr := sv.Health(channelID)
		return restarts >= 1 && lastErr == expectedErr
	}) {
		r, e := sv.Health(channelID)
		t.Fatalf("expected restart >= 1 and last error %q, got restarts=%d, lastErr=%q", expectedErr, r, e)
	}
}
