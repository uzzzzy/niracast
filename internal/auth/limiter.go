package auth

import (
	"net"
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

type ipLimiterEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// IPRateLimiter limits login attempts per client IP address.
type IPRateLimiter struct {
	mu       sync.Mutex
	limiters map[string]*ipLimiterEntry
	limit    rate.Limit
	burst    int
	now      func() time.Time
}

// NewIPRateLimiter creates a new rate limiter with the specified rate and burst.
func NewIPRateLimiter(limit rate.Limit, burst int, now func() time.Time) *IPRateLimiter {
	return &IPRateLimiter{
		limiters: make(map[string]*ipLimiterEntry),
		limit:    limit,
		burst:    burst,
		now:      now,
	}
}

func (l *IPRateLimiter) nowFunc() time.Time {
	if l.now != nil {
		return l.now()
	}
	return time.Now()
}

// Allow reports whether a request from ip is permitted.
func (l *IPRateLimiter) Allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.nowFunc()
	entry, exists := l.limiters[ip]
	if !exists {
		entry = &ipLimiterEntry{
			limiter:  rate.NewLimiter(l.limit, l.burst),
			lastSeen: now,
		}
		l.limiters[ip] = entry
	} else {
		entry.lastSeen = now
	}

	// Opportunistic eviction if map size exceeds 500
	if len(l.limiters) > 500 {
		cutoff := now.Add(-10 * time.Minute)
		for k, v := range l.limiters {
			if v.lastSeen.Before(cutoff) {
				delete(l.limiters, k)
			}
		}
	}

	return entry.limiter.Allow()
}

// EvictIdle removes limiters that have been idle for longer than idleTimeout.
func (l *IPRateLimiter) EvictIdle(idleTimeout time.Duration) int {
	l.mu.Lock()
	defer l.mu.Unlock()

	cutoff := l.nowFunc().Add(-idleTimeout)
	evicted := 0
	for ip, entry := range l.limiters {
		if entry.lastSeen.Before(cutoff) {
			delete(l.limiters, ip)
			evicted++
		}
	}
	return evicted
}

// Count returns the number of active IP limiters tracked in memory.
func (l *IPRateLimiter) Count() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.limiters)
}

// ClientIP extracts the host portion from r.RemoteAddr without trusting X-Forwarded-For.
func ClientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
