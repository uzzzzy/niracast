package web

import (
	"io/fs"
	"testing"
)

func TestSPA(t *testing.T) {
	spa, err := SPA()
	if err != nil {
		t.Fatalf("SPA() failed: %v", err)
	}
	_, err = fs.Stat(spa, ".")
	if err != nil {
		t.Fatalf("stat on SPA() root failed: %v", err)
	}
}
