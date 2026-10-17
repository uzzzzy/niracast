package stream

import (
	"context"
	"errors"
	"math"
	"sync"
	"testing"
	"time"

	"github.com/uzzzzy/niracast/internal/events"
	"github.com/uzzzzy/niracast/internal/timeline"
)

// fakeRecorderPublisher records published events thread-safely.
type fakeRecorderPublisher struct {
	mu     sync.Mutex
	events []events.Event
}

func (p *fakeRecorderPublisher) Publish(ev events.Event) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.events = append(p.events, ev)
}

func (p *fakeRecorderPublisher) all() []events.Event {
	p.mu.Lock()
	defer p.mu.Unlock()
	res := make([]events.Event, len(p.events))
	copy(res, p.events)
	return res
}

// timelineResolver computes playout using real timeline.Compute over fixed items.
type timelineResolver struct {
	mu    sync.Mutex
	items []timeline.Item
}

func (r *timelineResolver) GetCurrentPlayout(_ int64, now time.Time) (*timeline.PlayoutItem, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.items) == 0 {
		return nil, timeline.ErrEmptyPlaylist
	}
	return timeline.Compute(r.items, now)
}

func (r *timelineResolver) setItems(items []timeline.Item) {
	r.mu.Lock()
	r.items = items
	r.mu.Unlock()
}

func TestSupervisor_StatusTransitionsAndEvents(t *testing.T) {
	ctrl := newFakeController()
	realFile := makeTempFile(t, "trans_real.mp4")
	resolver := &fakeResolver{
		items: []timeline.PlayoutItem{
			{MediaID: 10, FilePath: realFile, SeekSeconds: 0, RemainingSec: 30},
		},
	}
	active := &fakeActive{}
	active.active.Store(true)

	pub := &fakeRecorderPublisher{}
	sv := NewSupervisor(resolver, ctrl, active, noopCodec, "idle.mp4", t.TempDir())
	sv.SetPublisher(pub)
	sv.idlePollInterval = 20 * time.Millisecond

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	channelID := int64(201)
	sv.Ensure(ctx, channelID)

	// 1. Wait for playing state.
	if !waitCond(t, 5*time.Second, func() bool {
		st := sv.Status(channelID)
		return st.State == "playing" && st.MediaID == 10
	}) {
		t.Fatalf("channel did not transition to playing, status: %+v", sv.Status(channelID))
	}

	// 2. Clear items to induce transition to idle.
	resolver.setItems(nil)
	ctrl.exitChannel(channelID)

	if !waitCond(t, 5*time.Second, func() bool {
		st := sv.Status(channelID)
		return st.State == "idle"
	}) {
		t.Fatalf("channel did not transition to idle, status: %+v", sv.Status(channelID))
	}

	// 3. Mark channel inactive to induce transition to stopped.
	active.active.Store(false)
	ctrl.exitChannel(channelID)

	if !waitCond(t, 5*time.Second, func() bool {
		st := sv.Status(channelID)
		return st.State == "stopped"
	}) {
		t.Fatalf("channel did not transition to stopped, status: %+v", sv.Status(channelID))
	}

	// 4. Verify events published in order: channel.playing -> channel.idle -> channel.stopped.
	evs := pub.all()
	var types []string
	for _, ev := range evs {
		if ev.ChannelID == channelID && ev.Type != "channel.health" {
			types = append(types, ev.Type)
		}
	}

	expectedOrder := []string{"channel.playing", "channel.idle", "channel.stopped"}
	if len(types) < len(expectedOrder) {
		t.Fatalf("got events %v, want at least %v", types, expectedOrder)
	}

	for i, exp := range expectedOrder {
		if types[i] != exp {
			t.Errorf("event[%d] = %q, want %q", i, types[i], exp)
		}
	}
}

func TestSupervisor_SkipMovesToNextItemAndKillsProcess(t *testing.T) {
	ctrl := newFakeController()
	file1 := makeTempFile(t, "skip1.mp4")
	file2 := makeTempFile(t, "skip2.mp4")

	tRes := &timelineResolver{
		items: []timeline.Item{
			{MediaID: 101, FilePath: file1, Duration: 60},
			{MediaID: 102, FilePath: file2, Duration: 60},
		},
	}

	active := &fakeActive{}
	active.active.Store(true)

	pub := &fakeRecorderPublisher{}
	sv := NewSupervisor(tRes, ctrl, active, noopCodec, "idle.mp4", t.TempDir())
	sv.SetPublisher(pub)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	channelID := int64(301)
	sv.Ensure(ctx, channelID)

	// Wait for item 1 to start playing.
	if !waitCond(t, 5*time.Second, func() bool {
		st := sv.Status(channelID)
		return st.State == "playing" && (st.MediaID == 101 || st.MediaID == 102)
	}) {
		t.Fatal("stream did not start playing")
	}

	initialStatus := sv.Status(channelID)
	initialMediaID := initialStatus.MediaID
	wantNextMediaID := int64(102)
	if initialMediaID == 102 {
		wantNextMediaID = 101
	}

	// Call Skip.
	st, err := sv.Skip(channelID)
	if err != nil {
		t.Fatalf("unexpected error from Skip: %v", err)
	}
	if st.SkipOffsetSec <= 0 {
		t.Errorf("SkipOffsetSec want > 0, got %f", st.SkipOffsetSec)
	}
	if st.MediaID != wantNextMediaID {
		t.Errorf("Skip() returned MediaID %d, want next item %d", st.MediaID, wantNextMediaID)
	}
	if st.State != "playing" {
		t.Errorf("Skip() State = %q, want 'playing'", st.State)
	}

	// Verify the loop advances to the next item automatically.
	if !waitCond(t, 5*time.Second, func() bool {
		cur := sv.Status(channelID)
		return cur.State == "playing" && cur.MediaID == wantNextMediaID
	}) {
		t.Fatalf("channel did not advance to next item (want %d, got %+v)", wantNextMediaID, sv.Status(channelID))
	}

	// Verify events include channel.skipped.
	evs := pub.all()
	hasSkipped := false
	for _, ev := range evs {
		if ev.ChannelID == channelID && ev.Type == "channel.skipped" {
			hasSkipped = true
			break
		}
	}
	if !hasSkipped {
		t.Errorf("channel.skipped event was not published; got: %+v", evs)
	}
}

func TestSupervisor_SkipWhileIdleReturnsErrNotPlaying(t *testing.T) {
	ctrl := newFakeController()
	resolver := &fakeResolver{} // empty -> idle
	active := &fakeActive{}
	active.active.Store(true)

	sv := NewSupervisor(resolver, ctrl, active, noopCodec, "idle.mp4", t.TempDir())

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	channelID := int64(401)
	sv.Ensure(ctx, channelID)

	if !waitCond(t, 5*time.Second, func() bool {
		return sv.Status(channelID).State == "idle"
	}) {
		t.Fatal("channel did not enter idle state")
	}

	_, err := sv.Skip(channelID)
	if !errors.Is(err, ErrNotPlaying) {
		t.Errorf("Skip on idle: got err %v, want %v", err, ErrNotPlaying)
	}
}

func TestSupervisor_SkipWithNoLoopReturnsErrNotRunning(t *testing.T) {
	ctrl := newFakeController()
	resolver := &fakeResolver{}
	active := &fakeActive{}
	active.active.Store(true)

	sv := NewSupervisor(resolver, ctrl, active, noopCodec, "idle.mp4", t.TempDir())

	channelID := int64(501)
	// Ensure is not called, loop is not running.
	st := sv.Status(channelID)
	if st.State != "stopped" {
		t.Errorf("State = %q, want 'stopped'", st.State)
	}

	_, err := sv.Skip(channelID)
	if !errors.Is(err, ErrNotRunning) {
		t.Errorf("Skip with no loop: got err %v, want %v", err, ErrNotRunning)
	}
}

func TestSupervisor_SkipConsistencyWithStatus(t *testing.T) {
	ctrl := newFakeController()
	file1 := makeTempFile(t, "consist1.mp4")
	file2 := makeTempFile(t, "consist2.mp4")

	// Total playlist duration = 100s (60s + 40s).
	tRes := &timelineResolver{
		items: []timeline.Item{
			{MediaID: 501, FilePath: file1, Duration: 60},
			{MediaID: 502, FilePath: file2, Duration: 40},
		},
	}

	active := &fakeActive{}
	active.active.Store(true)

	sv := NewSupervisor(tRes, ctrl, active, noopCodec, "idle.mp4", t.TempDir())

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	channelID := int64(601)
	sv.Ensure(ctx, channelID)

	// Wait for item 1 to start playing.
	if !waitCond(t, 5*time.Second, func() bool {
		st := sv.Status(channelID)
		return st.State == "playing" && (st.MediaID == 501 || st.MediaID == 502)
	}) {
		t.Fatal("stream did not start playing")
	}

	initialStatus := sv.Status(channelID)
	currentMediaID := initialStatus.MediaID
	wantNextMediaID := int64(502)
	wantNextDuration := 40.0
	if currentMediaID == 502 {
		wantNextMediaID = 501
		wantNextDuration = 60.0
	}

	// Call Skip and capture the returned status.
	skipStatus, err := sv.Skip(channelID)
	if err != nil {
		t.Fatalf("unexpected error from Skip: %v", err)
	}

	// 1. Skip response must immediately reflect the next item AFTER the skip took effect.
	if skipStatus.MediaID != wantNextMediaID {
		t.Errorf("Skip() MediaID = %d, want next item %d", skipStatus.MediaID, wantNextMediaID)
	}
	if skipStatus.State != "playing" {
		t.Errorf("Skip() State = %q, want 'playing'", skipStatus.State)
	}
	if skipStatus.SeekSeconds < 0 || skipStatus.SeekSeconds > 1.0 {
		t.Errorf("Skip() SeekSeconds = %f, want ~0", skipStatus.SeekSeconds)
	}
	if skipStatus.RemainingSec <= 0 || skipStatus.RemainingSec > wantNextDuration {
		t.Errorf("Skip() RemainingSec = %f, want in (0, %f]", skipStatus.RemainingSec, wantNextDuration)
	}
	if skipStatus.SkipOffsetSec <= 0 {
		t.Errorf("Skip() SkipOffsetSec = %f, want > 0", skipStatus.SkipOffsetSec)
	}

	// 2. Status() called right afterwards must compute the same item and values using the shared code path.
	liveStatus := sv.Status(channelID)
	if liveStatus.MediaID != skipStatus.MediaID {
		t.Errorf("liveStatus.MediaID (%d) != skipStatus.MediaID (%d)", liveStatus.MediaID, skipStatus.MediaID)
	}
	if liveStatus.State != skipStatus.State {
		t.Errorf("liveStatus.State (%q) != skipStatus.State (%q)", liveStatus.State, skipStatus.State)
	}
	if liveStatus.SkipOffsetSec != skipStatus.SkipOffsetSec {
		t.Errorf("liveStatus.SkipOffsetSec (%f) != skipStatus.SkipOffsetSec (%f)", liveStatus.SkipOffsetSec, skipStatus.SkipOffsetSec)
	}
	if math.Abs(liveStatus.SeekSeconds-skipStatus.SeekSeconds) > 1.0 {
		t.Errorf("liveStatus.SeekSeconds (%f) diverged from skipStatus.SeekSeconds (%f)", liveStatus.SeekSeconds, skipStatus.SeekSeconds)
	}
	if math.Abs(liveStatus.RemainingSec-skipStatus.RemainingSec) > 1.0 {
		t.Errorf("liveStatus.RemainingSec (%f) diverged from skipStatus.RemainingSec (%f)", liveStatus.RemainingSec, skipStatus.RemainingSec)
	}
}
