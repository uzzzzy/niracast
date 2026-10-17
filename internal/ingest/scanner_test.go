package ingest

import (
	"os"
	"path/filepath"
	"sort"
	"testing"
)

func TestScan(t *testing.T) {
	dir := t.TempDir()
	files := []string{
		"a.mp4", "b.MKV", "sub/c.mov", "sub/deep/d.mp4",
		"notes.txt", "sub/e.srt", ".hidden.mp4", ".hid/f.mp4", "sub/.g.mkv",
	}
	for _, f := range files {
		p := filepath.Join(dir, f)
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	got, err := NewScanner(dir).Scan()
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		filepath.Join(dir, "a.mp4"),
		filepath.Join(dir, "b.MKV"),
		filepath.Join(dir, "sub", "c.mov"),
		filepath.Join(dir, "sub", "deep", "d.mp4"),
	}
	sort.Strings(got)
	sort.Strings(want)
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
		if !filepath.IsAbs(got[i]) {
			t.Fatalf("not absolute: %s", got[i])
		}
	}
}

func TestScanMissingDir(t *testing.T) {
	if _, err := NewScanner(filepath.Join(t.TempDir(), "nope")).Scan(); err == nil {
		t.Fatal("expected error")
	}
}
