package stream

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

type sessFakeCtrl struct {
	mu      sync.Mutex
	stopped []int64
}

func (f *sessFakeCtrl) StartStream(context.Context, StreamConfig) error { return nil }
func (f *sessFakeCtrl) IsRunning(int64) bool                            { return true }
func (f *sessFakeCtrl) Done(int64) <-chan struct{} {
	ch := make(chan struct{})
	close(ch)
	return ch
}
func (f *sessFakeCtrl) StopStream(id int64) error {
	f.mu.Lock()
	f.stopped = append(f.stopped, id)
	f.mu.Unlock()
	return nil
}
func (f *sessFakeCtrl) StderrTail(int64) string { return "" }
func (f *sessFakeCtrl) list() []int64 {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]int64(nil), f.stopped...)
}

func TestReaperStopsIdleChannel(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "1")
	_ = os.MkdirAll(dir, 0o755)
	seg := filepath.Join(dir, "live0.ts")
	_ = os.WriteFile(seg, []byte("x"), 0o644)
	_ = os.WriteFile(filepath.Join(dir, "live.m3u8"), []byte("x"), 0o644)

	var cmu sync.Mutex
	cur := time.Unix(1000, 0)
	ctrl := &sessFakeCtrl{}
	sm := NewSessionManager(ctrl, root)
	sm.IdleTimeout = 60 * time.Second
	sm.now = func() time.Time { cmu.Lock(); defer cmu.Unlock(); return cur }
	advance := func(d time.Duration) { cmu.Lock(); cur = cur.Add(d); cmu.Unlock() }

	sm.RegisterPing(1)
	sm.RegisterPing(2)
	advance(50 * time.Second)
	sm.RegisterPing(2) // channel 2 stays active
	sm.reapOnce()
	if len(ctrl.list()) != 0 {
		t.Fatalf("stopped too early: %v", ctrl.list())
	}
	advance(20 * time.Second) // ch1 idle 70s, ch2 idle 20s
	sm.reapOnce()
	if got := ctrl.list(); len(got) != 1 || got[0] != 1 {
		t.Fatalf("stopped = %v, want [1]", got)
	}
	if _, err := os.Stat(seg); !os.IsNotExist(err) {
		t.Fatalf("segment not cleaned: %v", err)
	}
	sm.reapOnce()
	if len(ctrl.list()) != 1 {
		t.Fatalf("channel stopped twice: %v", ctrl.list())
	}
}

func TestReaperLoopRealTimeAndNoLeak(t *testing.T) {
	ctrl := &sessFakeCtrl{}
	sm := NewSessionManager(ctrl, t.TempDir())
	sm.IdleTimeout = 50 * time.Millisecond
	sm.StartReaperLoop(10 * time.Millisecond)
	sm.StartReaperLoop(10 * time.Millisecond) // no-op
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ { // concurrent pings: run with -race
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				sm.RegisterPing(7)
			}
		}()
	}
	wg.Wait()
	deadline := time.Now().Add(2 * time.Second)
	for len(ctrl.list()) == 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if got := ctrl.list(); len(got) != 1 || got[0] != 7 {
		t.Fatalf("stopped = %v, want [7]", got)
	}
	sm.StopReaperLoop() // returns only once goroutine exited
	sm.StopReaperLoop()
}
