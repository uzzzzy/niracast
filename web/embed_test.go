package web

import (
	"errors"
	"io/fs"
	"testing"
)

// TestSPA verifies that SPA() returns a sub-filesystem rooted at app/dist/app.
func TestSPA(t *testing.T) {
	spa, err := SPA()
	if err != nil {
		t.Fatalf("SPA() failed: %v", err)
	}
	if spa == nil {
		t.Fatal("expected non-nil fs.FS from SPA()")
	}
	// When built, stat on "." succeeds. In a clean clone where web/app/dist/app
	// has not been built yet, stat on "." returns fs.ErrNotExist.
	if _, err := fs.Stat(spa, "."); err != nil && !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("stat on SPA() root failed: %v", err)
	}
}

// TestDistPlaceholder verifies that the placeholder web/app/dist/.gitkeep is
// tracked and embedded so clean clones compile without a prior frontend build.
func TestDistPlaceholder(t *testing.T) {
	if _, err := fs.Stat(Dist, "app/dist/.gitkeep"); err != nil {
		t.Fatalf("placeholder app/dist/.gitkeep missing from embedded FS: %v", err)
	}
}
