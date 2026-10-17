package events

import (
	"sync"
	"time"
)

// Event represents a real-time event for a broadcast channel.
type Event struct {
	Type      string         `json:"type"`
	ChannelID int64          `json:"channel_id"`
	Data      map[string]any `json:"data,omitempty"`
	Time      time.Time      `json:"time"`
}

// Publisher is an interface for emitting events.
// Implementations must not block the caller.
type Publisher interface {
	Publish(ev Event)
}

// Hub manages event subscriptions and fan-out distribution.
type Hub struct {
	mu   sync.RWMutex
	subs map[chan Event]struct{}
}

// NewHub creates and initializes an empty event Hub.
func NewHub() *Hub {
	return &Hub{
		subs: make(map[chan Event]struct{}),
	}
}

// Subscribe registers a new subscriber channel with a buffer size of 16.
// The returned cancel function removes and closes the subscriber channel.
// It is safe to call cancel multiple times concurrently.
func (h *Hub) Subscribe() (<-chan Event, func()) {
	ch := make(chan Event, 16)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()

	var once sync.Once
	cancel := func() {
		once.Do(func() {
			h.mu.Lock()
			if _, ok := h.subs[ch]; ok {
				delete(h.subs, ch)
				close(ch)
			}
			h.mu.Unlock()
		})
	}

	return ch, cancel
}

// Publish distributes the event to all subscribers.
// It never blocks; if a subscriber channel buffer is full, the event is dropped.
func (h *Hub) Publish(ev Event) {
	if h == nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()

	for ch := range h.subs {
		select {
		case ch <- ev:
		default:
			// Buffer full, drop event for slow subscriber
		}
	}
}
