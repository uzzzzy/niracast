package events

import (
	"runtime"
	"sync"
	"testing"
	"time"
)

func TestHub_FanOut(t *testing.T) {
	hub := NewHub()

	ch1, cancel1 := hub.Subscribe()
	defer cancel1()
	ch2, cancel2 := hub.Subscribe()
	defer cancel2()

	ev := Event{
		Type:      "channel.playing",
		ChannelID: 1,
		Data:      map[string]any{"media_id": int64(42)},
		Time:      time.Now(),
	}

	hub.Publish(ev)

	select {
	case got1 := <-ch1:
		if got1.Type != ev.Type || got1.ChannelID != ev.ChannelID {
			t.Errorf("ch1 received wrong event: %+v", got1)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timeout waiting for ch1")
	}

	select {
	case got2 := <-ch2:
		if got2.Type != ev.Type || got2.ChannelID != ev.ChannelID {
			t.Errorf("ch2 received wrong event: %+v", got2)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timeout waiting for ch2")
	}
}

func TestHub_SlowSubscriberDoesNotBlock(t *testing.T) {
	hub := NewHub()

	chSlow, cancelSlow := hub.Subscribe()
	defer cancelSlow()

	done := make(chan struct{})
	go func() {
		// Buffer is 16; publish 25 events. Should never block.
		for i := 0; i < 25; i++ {
			hub.Publish(Event{
				Type:      "test",
				ChannelID: int64(i),
				Time:      time.Now(),
			})
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(1 * time.Second):
		t.Fatal("Publish blocked by slow subscriber")
	}

	// Verify chSlow received up to its buffer capacity (16 events).
	slowCount := 0
drain:
	for {
		select {
		case <-chSlow:
			slowCount++
		default:
			break drain
		}
	}
	if slowCount != 16 {
		t.Errorf("chSlow got %d events, want 16 (buffer capacity)", slowCount)
	}
}

func TestHub_CancelTwiceSafe(t *testing.T) {
	hub := NewHub()

	ch, cancel := hub.Subscribe()

	// Calling cancel multiple times concurrently or sequentially must not panic.
	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			cancel()
		}()
	}
	wg.Wait()

	// Channel must be closed.
	select {
	case _, ok := <-ch:
		if ok {
			t.Error("channel expected to be closed")
		}
	default:
		t.Error("channel did not close")
	}
}

func TestHub_NoLeakAfterCancel(t *testing.T) {
	hub := NewHub()

	initGoroutines := runtime.NumGoroutine()

	ch, cancel := hub.Subscribe()

	hub.mu.RLock()
	subCount := len(hub.subs)
	hub.mu.RUnlock()
	if subCount != 1 {
		t.Fatalf("expected 1 subscriber, got %d", subCount)
	}

	cancel()

	hub.mu.RLock()
	subCount = len(hub.subs)
	hub.mu.RUnlock()
	if subCount != 0 {
		t.Errorf("expected 0 subscribers after cancel, got %d", subCount)
	}

	// Channel must be closed and drained.
	if _, ok := <-ch; ok {
		t.Error("expected channel to be closed")
	}

	// Verify no stray goroutines were spawned by Subscribe/cancel.
	time.Sleep(50 * time.Millisecond)
	finalGoroutines := runtime.NumGoroutine()
	if finalGoroutines > initGoroutines+2 {
		t.Errorf("possible goroutine leak: before=%d, after=%d", initGoroutines, finalGoroutines)
	}
}
