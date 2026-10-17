package analytics

import (
	"context"
	"database/sql"
	"sync"
	"time"
)

// Flusher manages periodic and shutdown writing of analytics metrics to SQLite.
type Flusher struct {
	db       *sql.DB
	tracker  *Tracker
	interval time.Duration
	now      func() time.Time

	mu     sync.Mutex
	stopCh chan struct{}
	doneCh chan struct{}
}

// FlusherOption configures a Flusher.
type FlusherOption func(*Flusher)

// WithFlusherNow sets a custom time hook.
func WithFlusherNow(now func() time.Time) FlusherOption {
	return func(f *Flusher) {
		f.now = now
	}
}

// WithFlusherInterval sets the periodic flush interval (default 1 minute).
func WithFlusherInterval(d time.Duration) FlusherOption {
	return func(f *Flusher) {
		f.interval = d
	}
}

// NewFlusher constructs and starts a Flusher.
func NewFlusher(db *sql.DB, tracker *Tracker, opts ...FlusherOption) *Flusher {
	f := &Flusher{
		db:       db,
		tracker:  tracker,
		interval: time.Minute,
		now:      time.Now,
		stopCh:   make(chan struct{}),
		doneCh:   make(chan struct{}),
	}
	for _, opt := range opts {
		opt(f)
	}

	go f.loop()
	return f
}

func (f *Flusher) nowFunc() time.Time {
	if f.now != nil {
		return f.now()
	}
	return time.Now()
}

func (f *Flusher) loop() {
	defer close(f.doneCh)

	ticker := time.NewTicker(f.interval)
	defer ticker.Stop()

	retentionTicker := time.NewTicker(10 * time.Minute)
	defer retentionTicker.Stop()

	for {
		select {
		case <-f.stopCh:
			return
		case <-ticker.C:
			_ = f.flushPending(false)
		case <-retentionTicker.C:
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			_ = RunRollup(ctx, f.db, f.nowFunc())
			_ = RunRetention(ctx, f.db, f.nowFunc())
			cancel()
		}
	}
}

func (f *Flusher) flushPending(all bool) error {
	drained := f.tracker.Drain(all)
	if len(drained) == 0 {
		return nil
	}

	tx, err := f.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO analytics_minute (bucket_at, channel_id, media_id, viewers_peak, bytes_out, watch_sec)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(bucket_at, channel_id, media_id) DO UPDATE SET
			viewers_peak = MAX(analytics_minute.viewers_peak, excluded.viewers_peak),
			bytes_out = analytics_minute.bytes_out + excluded.bytes_out,
			watch_sec = analytics_minute.watch_sec + excluded.watch_sec;
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for k, stat := range drained {
		if stat.ViewersPeak == 0 && stat.BytesOut == 0 && stat.WatchSec == 0 {
			continue
		}
		if _, err := stmt.Exec(k.BucketAt, k.ChannelID, k.MediaID, stat.ViewersPeak, stat.BytesOut, stat.WatchSec); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// Flush immediately flushes all pending minute statistics to the database.
func (f *Flusher) Flush() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.flushPending(true)
}

// Close gracefully terminates the flusher background loop and flushes all pending data.
func (f *Flusher) Close() error {
	f.mu.Lock()
	select {
	case <-f.stopCh:
		// already closed
	default:
		close(f.stopCh)
	}
	f.mu.Unlock()

	<-f.doneCh
	err := f.Flush()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = RunRollup(ctx, f.db, f.nowFunc())
	_ = RunRetention(ctx, f.db, f.nowFunc())

	return err
}
