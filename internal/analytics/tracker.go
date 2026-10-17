package analytics

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/uzzzzy/niracast/internal/auth"
)

type countingResponseWriter struct {
	http.ResponseWriter
	bytesWritten int64
	statusCode   int
}

func newCountingResponseWriter(w http.ResponseWriter) *countingResponseWriter {
	return &countingResponseWriter{
		ResponseWriter: w,
		statusCode:     http.StatusOK,
	}
}

func (w *countingResponseWriter) Write(b []byte) (int, error) {
	n, err := w.ResponseWriter.Write(b)
	w.bytesWritten += int64(n)
	return n, err
}

func (w *countingResponseWriter) WriteHeader(statusCode int) {
	w.statusCode = statusCode
	w.ResponseWriter.WriteHeader(statusCode)
}

func (w *countingResponseWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

func (w *countingResponseWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// MinuteKey identifies an analytics minute aggregation bucket.
type MinuteKey struct {
	BucketAt  int64
	ChannelID int64
	MediaID   int64
}

// MinuteStat holds in-memory minute counters before flush to SQLite.
type MinuteStat struct {
	ViewersPeak int
	BytesOut    int64
	WatchSec    float64
}

type clientPing struct {
	clientID  string
	channelID int64
	mediaID   int64
	lastSeen  time.Time
}

type chanMedia struct {
	channelID int64
	mediaID   int64
}

// Tracker monitors active viewers and delivers byte-counting middleware for HLS streams.
type Tracker struct {
	mu sync.Mutex

	now func() time.Time

	saltDate string
	saltHex  string

	pings   map[string]clientPing
	pending map[MinuteKey]*MinuteStat

	mediaLookup func(channelID int64) int64
	lastTick    time.Time
}

// NewTracker constructs a Tracker.
func NewTracker() *Tracker {
	return &Tracker{
		pings:    make(map[string]clientPing),
		pending:  make(map[MinuteKey]*MinuteStat),
		now:      time.Now,
		lastTick: time.Now(),
	}
}

// SetNow overrides the current time provider for testing.
func (t *Tracker) SetNow(fn func() time.Time) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.now = fn
	if fn != nil {
		t.lastTick = fn()
	}
}

func (t *Tracker) nowFunc() time.Time {
	if t.now != nil {
		return t.now()
	}
	return time.Now()
}

// SetMediaLookup configures a callback to resolve currently playing media ID for a channel.
func (t *Tracker) SetMediaLookup(fn func(channelID int64) int64) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.mediaLookup = fn
}

func (t *Tracker) dailySalt(at time.Time) string {
	dateStr := at.UTC().Format("2006-01-02")
	if t.saltDate != dateStr || t.saltHex == "" {
		b := make([]byte, 16)
		if _, err := rand.Read(b); err != nil {
			t.saltHex = "niracast-salt-" + dateStr
		} else {
			t.saltHex = hex.EncodeToString(b)
		}
		t.saltDate = dateStr
	}
	return t.saltHex
}

// ClientID generates a privacy-preserving daily rotating client hash.
// Formula: SHA-256(daily in-memory salt + auth.ClientIP(r) + User-Agent).
func (t *Tracker) ClientID(r *http.Request, at time.Time) string {
	t.mu.Lock()
	salt := t.dailySalt(at)
	t.mu.Unlock()

	ip := auth.ClientIP(r)
	ua := r.UserAgent()
	h := sha256.Sum256([]byte(salt + ip + ua))
	return hex.EncodeToString(h[:])
}

// RecordPing registers an active request arrival from clientID for channelID at 'at'.
// Returns the resolved mediaID.
func (t *Tracker) RecordPing(channelID int64, clientID string, at time.Time) int64 {
	t.mu.Lock()
	defer t.mu.Unlock()

	var mediaID int64
	if t.mediaLookup != nil {
		mediaID = t.mediaLookup(channelID)
	}

	key := clientID + ":" + strconv.FormatInt(channelID, 10)
	t.pings[key] = clientPing{
		clientID:  clientID,
		channelID: channelID,
		mediaID:   mediaID,
		lastSeen:  at,
	}

	t.tickLocked(at)
	return mediaID
}

// RecordBytes accumulates bytes delivered for channelID and mediaID.
func (t *Tracker) RecordBytes(channelID int64, mediaID int64, bytesOut int64) {
	t.mu.Lock()
	defer t.mu.Unlock()

	now := t.nowFunc()
	bucketAt := (now.Unix() / 60) * 60
	key := MinuteKey{BucketAt: bucketAt, ChannelID: channelID, MediaID: mediaID}

	stat, ok := t.pending[key]
	if !ok {
		stat = &MinuteStat{}
		t.pending[key] = stat
	}
	stat.BytesOut += bytesOut
}

// ChannelViewers returns the count of unique clients active on channelID in the last ~10s.
func (t *Tracker) ChannelViewers(channelID int64) int {
	t.mu.Lock()
	defer t.mu.Unlock()

	now := t.nowFunc()
	active := make(map[string]struct{})
	for _, p := range t.pings {
		if p.channelID == channelID {
			diff := now.Sub(p.lastSeen)
			if diff >= 0 && diff <= 10*time.Second {
				active[p.clientID] = struct{}{}
			}
		}
	}
	return len(active)
}

// TotalViewers returns the count of unique clients active across all channels in the last ~10s.
func (t *Tracker) TotalViewers() int {
	t.mu.Lock()
	defer t.mu.Unlock()

	now := t.nowFunc()
	active := make(map[string]struct{})
	for _, p := range t.pings {
		diff := now.Sub(p.lastSeen)
		if diff >= 0 && diff <= 10*time.Second {
			active[p.clientID] = struct{}{}
		}
	}
	return len(active)
}

// Tick advances time to 'now', accumulating watch seconds and updating peak viewers.
func (t *Tracker) Tick(now time.Time) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.tickLocked(now)
}

func (t *Tracker) tickLocked(now time.Time) {
	if t.lastTick.IsZero() {
		t.lastTick = now
		return
	}
	if now.Before(t.lastTick) {
		return
	}

	stepFrom := t.lastTick
	if now.Sub(stepFrom) > 60*time.Second {
		stepFrom = now.Add(-60 * time.Second)
	}

	for step := stepFrom.Add(time.Second); !step.After(now); step = step.Add(time.Second) {
		bucketAt := (step.Unix() / 60) * 60

		activePerChanMedia := make(map[chanMedia]int)
		activePerChan := make(map[int64]map[string]struct{})

		for k, p := range t.pings {
			diff := step.Sub(p.lastSeen)
			if diff >= 0 && diff <= 10*time.Second {
				cm := chanMedia{channelID: p.channelID, mediaID: p.mediaID}
				activePerChanMedia[cm]++

				if activePerChan[p.channelID] == nil {
					activePerChan[p.channelID] = make(map[string]struct{})
				}
				activePerChan[p.channelID][p.clientID] = struct{}{}
			} else if diff > 60*time.Second {
				delete(t.pings, k)
			}
		}

		for cm, count := range activePerChanMedia {
			key := MinuteKey{BucketAt: bucketAt, ChannelID: cm.channelID, MediaID: cm.mediaID}
			stat, ok := t.pending[key]
			if !ok {
				stat = &MinuteStat{}
				t.pending[key] = stat
			}
			stat.WatchSec += float64(count)
		}

		for chID, clients := range activePerChan {
			count := len(clients)
			var curMedia int64
			if t.mediaLookup != nil {
				curMedia = t.mediaLookup(chID)
			}
			key := MinuteKey{BucketAt: bucketAt, ChannelID: chID, MediaID: curMedia}
			stat, ok := t.pending[key]
			if !ok {
				stat = &MinuteStat{}
				t.pending[key] = stat
			}
			if count > stat.ViewersPeak {
				stat.ViewersPeak = count
			}
		}
	}

	t.lastTick = now
}

// Drain extracts pending minute statistics.
// If all is false, only minutes strictly earlier than current minute are returned.
func (t *Tracker) Drain(all bool) map[MinuteKey]MinuteStat {
	t.mu.Lock()
	defer t.mu.Unlock()

	now := t.nowFunc()
	t.tickLocked(now)

	curMinute := (now.Unix() / 60) * 60
	drained := make(map[MinuteKey]MinuteStat)

	for k, v := range t.pending {
		if all || k.BucketAt < curMinute {
			drained[k] = *v
			delete(t.pending, k)
		}
	}
	return drained
}

// WrapHLS wraps an HLS handler to observe client arrival time and count outbound bytes.
func (t *Tracker) WrapHLS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		chIDStr := r.PathValue("id")
		if chIDStr == "" {
			parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/"), "/")
			if len(parts) >= 2 && parts[0] == "channels" {
				chIDStr = parts[1]
			}
		}
		var chID int64
		if chIDStr != "" {
			chID, _ = strconv.ParseInt(chIDStr, 10, 64)
		}

		var mediaID int64
		if chID > 0 {
			now := t.nowFunc()
			clientID := t.ClientID(r, now)
			mediaID = t.RecordPing(chID, clientID, now)
		}

		crw := newCountingResponseWriter(w)
		next.ServeHTTP(crw, r)

		if chID > 0 && crw.bytesWritten > 0 {
			t.RecordBytes(chID, mediaID, crw.bytesWritten)
		}
	})
}
