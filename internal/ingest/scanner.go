package ingest

import (
	"io/fs"
	"path/filepath"
	"strings"
)

// Scanner walks a media directory and lists supported video files.
type Scanner struct {
	MediaDir string
}

var videoExts = map[string]struct{}{
	".mp4": {},
	".mkv": {},
	".mov": {},
}

func NewScanner(mediaDir string) *Scanner {
	return &Scanner{MediaDir: mediaDir}
}

// Scan recursively returns absolute paths of video files (.mp4, .mkv, .mov),
// ignoring hidden files and directories. Only paths/extensions are inspected.
func (s *Scanner) Scan() ([]string, error) {
	root, err := filepath.Abs(s.MediaDir)
	if err != nil {
		return nil, err
	}
	var out []string
	err = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if path == root {
			return nil
		}
		if strings.HasPrefix(d.Name(), ".") {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.IsDir() {
			return nil
		}
		if _, ok := videoExts[strings.ToLower(filepath.Ext(d.Name()))]; ok {
			out = append(out, path)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}
