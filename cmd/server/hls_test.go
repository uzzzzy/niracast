package main

import (
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/uzzzzy/niracast/internal/db"
	"github.com/uzzzzy/niracast/internal/ingest"
	"github.com/uzzzzy/niracast/internal/stream"
	"github.com/uzzzzy/niracast/internal/timeline"
)

// --- fakes ---

// testCtrl satisfies stream.ProcessController; all calls are no-ops.
type testCtrl struct{}

func (testCtrl) StartStream(_ context.Context, _ stream.StreamConfig) error { return nil }
func (testCtrl) StopStream(_ int64) error                                   { return nil }
func (testCtrl) IsRunning(_ int64) bool                                     { return false }
func (testCtrl) Done(_ int64) <-chan struct{} {
	ch := make(chan struct{})
	close(ch)
	return ch
}
func (testCtrl) StderrTail(_ int64) string { return "" }

// testActive always reports the channel as active.
type testActive struct{}

func (testActive) IsActive(_ int64) bool { return true }

// testCalcEmpty always returns ErrEmptyPlaylist.
type testCalcEmpty struct{}

func (testCalcEmpty) GetCurrentPlayout(_ int64, _ time.Time) (*timeline.PlayoutItem, error) {
	return nil, timeline.ErrEmptyPlaylist
}

// --- helpers ---

// openRealDB initialises a fresh SQLite database using the project schema and
// returns the connection and a temp directory for HLS output.
func openRealDB(t *testing.T) (*sql.DB, string) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "test.db")
	conn, err := db.InitDB(dbPath)
	if err != nil {
		t.Fatalf("init db: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	return conn, t.TempDir()
}

// buildRealHandler wires up a complete hlsHandler with the given DB and root.
func buildRealHandler(t *testing.T, conn *sql.DB, root string) *hlsHandler {
	t.Helper()
	ctrl := testCtrl{}
	sessions := stream.NewSessionManager(ctrl, root)
	active := testActive{}
	calc := testCalcEmpty{}
	noopLookup := func(_ int64) ingest.MediaMetadata { return ingest.MediaMetadata{} }
	supervisor := stream.NewSupervisor(calc, ctrl, active, noopLookup, "idle.mp4", root)
	return &hlsHandler{
		ctx:        context.Background(),
		db:         conn,
		calc:       calc,
		ctrl:       ctrl,
		sessions:   sessions,
		supervisor: supervisor,
		root:       root,
	}
}

// --- tests ---

// TestHLSManifest_UnknownChannel ensures a non-existent channel ID returns 404.
func TestHLSManifest_UnknownChannel(t *testing.T) {
	conn, root := openRealDB(t)
	h := buildRealHandler(t, conn, root)

	req := httptest.NewRequest("GET", "/channels/999/live.m3u8", nil)
	req.SetPathValue("id", "999")
	w := httptest.NewRecorder()
	h.manifest(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("unknown channel: status = %d, want %d", w.Code, http.StatusNotFound)
	}
}

// TestHLSManifest_EmptyPlaylistNotFound ensures that a channel that exists but
// has no playlist items does NOT return 404. The supervisor will attempt to
// play the idle clip; because no real FFmpeg is available in the test, the
// handler returns 503 (stream not ready) — which is acceptable. What matters
// is that 404 is never returned for a known channel.
func TestHLSManifest_EmptyPlaylistNotFound(t *testing.T) {
	conn, root := openRealDB(t)

	if _, err := conn.Exec(`INSERT INTO channels (id, name) VALUES (1, 'ch1')`); err != nil {
		t.Fatalf("insert channel: %v", err)
	}

	h := buildRealHandler(t, conn, root)

	req := httptest.NewRequest("GET", "/channels/1/live.m3u8", nil)
	req.SetPathValue("id", "1")
	// The manifest handler waits up to 20 s for live.m3u8 to appear.
	// We give it a request context that times out quickly.
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	req = req.WithContext(ctx)

	w := httptest.NewRecorder()
	h.manifest(w, req)

	if w.Code == http.StatusNotFound {
		t.Errorf("empty-playlist channel returned 404, want non-404 (got %d)", w.Code)
	}
}

// TestHLSManifest_ServerShutdownUnblocks ensures that when the server context
// is cancelled during manifest polling, the handler unblocks immediately and
// does not wait out the full 20 s deadline.
func TestHLSManifest_ServerShutdownUnblocks(t *testing.T) {
	conn, root := openRealDB(t)
	if _, err := conn.Exec(`INSERT INTO channels (id, name) VALUES (1, 'ch1')`); err != nil {
		t.Fatalf("insert channel: %v", err)
	}

	h := buildRealHandler(t, conn, root)

	// Cancel the server context shortly after entering manifest.
	srvCtx, cancelSrv := context.WithCancel(context.Background())
	h.ctx = srvCtx

	req := httptest.NewRequest("GET", "/channels/1/live.m3u8", nil)
	req.SetPathValue("id", "1")

	start := time.Now()
	go func() {
		time.Sleep(50 * time.Millisecond)
		cancelSrv()
	}()

	w := httptest.NewRecorder()
	h.manifest(w, req)
	elapsed := time.Since(start)

	if elapsed > 2*time.Second {
		t.Errorf("manifest blocked for %v on server shutdown, expected prompt unblock", elapsed)
	}
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
}

// TestHLSSegment_UnknownChannel ensures that requesting a segment for a
// non-existent channel ID returns 404.
func TestHLSSegment_UnknownChannel(t *testing.T) {
	conn, root := openRealDB(t)
	h := buildRealHandler(t, conn, root)

	req := httptest.NewRequest("GET", "/channels/999/live0.ts", nil)
	req.SetPathValue("id", "999")
	req.SetPathValue("file", "live0.ts")

	w := httptest.NewRecorder()
	h.segment(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("unknown channel segment: status = %d, want %d", w.Code, http.StatusNotFound)
	}
}
