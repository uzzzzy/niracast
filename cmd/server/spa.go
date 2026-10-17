package main

import (
	"bytes"
	"errors"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"
)

func init() {
	_ = mime.AddExtensionType(".js", "text/javascript; charset=utf-8")
	_ = mime.AddExtensionType(".css", "text/css; charset=utf-8")
	_ = mime.AddExtensionType(".html", "text/html; charset=utf-8")
	_ = mime.AddExtensionType(".json", "application/json")
	_ = mime.AddExtensionType(".svg", "image/svg+xml")
}

// newSPAHandler returns an http.Handler serving files from fsys (typically
// web/app/dist/app via web.SPA()) with SPA fallback.
func newSPAHandler(fsys fs.FS) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cleanPath := path.Clean(r.URL.Path)

		// 1. API routes never fall back to SPA: return 404 JSON.
		if strings.HasPrefix(cleanPath, "/api/") || cleanPath == "/api" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"error":"not found"}` + "\n"))
			return
		}

		// 2. Reserved prefix routes never fall back to SPA.
		if strings.HasPrefix(cleanPath, "/channels/") || cleanPath == "/channels" ||
			strings.HasPrefix(cleanPath, "/iptv/") || cleanPath == "/iptv" ||
			strings.HasPrefix(cleanPath, "/static/") || cleanPath == "/static" {
			http.NotFound(w, r)
			return
		}

		// 3. Try to serve existing file from fsys.
		filePath := strings.TrimPrefix(cleanPath, "/")
		if filePath == "" {
			filePath = "index.html"
		}

		file, err := fsys.Open(filePath)
		if err == nil {
			stat, err := file.Stat()
			if err == nil && !stat.IsDir() {
				defer file.Close()
				serveSPAFile(w, r, filePath, file, stat)
				return
			}
			_ = file.Close()
		}

		// 4. If path has a file extension and does not exist in fsys, return 404 (not index.html).
		if path.Ext(cleanPath) != "" {
			http.NotFound(w, r)
			return
		}

		// 5. SPA fallback to index.html.
		indexFile, err := fsys.Open("index.html")
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				w.Header().Set("Content-Type", "text/plain; charset=utf-8")
				w.WriteHeader(http.StatusServiceUnavailable)
				_, _ = w.Write([]byte("frontend not built: run 'pnpm build' in web/app\n"))
				return
			}
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		defer indexFile.Close()

		stat, err := indexFile.Stat()
		if err != nil || stat.IsDir() {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte("frontend not built: run 'pnpm build' in web/app\n"))
			return
		}

		serveSPAFile(w, r, "index.html", indexFile, stat)
	})
}

func serveSPAFile(w http.ResponseWriter, r *http.Request, name string, file fs.File, stat fs.FileInfo) {
	cleanPath := path.Clean("/" + name)
	if name == "index.html" || cleanPath == "/index.html" {
		w.Header().Set("Cache-Control", "no-cache")
	} else if strings.HasPrefix(cleanPath, "/assets/") {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	}

	ext := path.Ext(name)
	if ctype := mime.TypeByExtension(ext); ctype != "" {
		w.Header().Set("Content-Type", ctype)
	}

	seeker, ok := file.(io.ReadSeeker)
	if !ok {
		data, err := io.ReadAll(file)
		if err != nil {
			http.Error(w, "failed to read file", http.StatusInternalServerError)
			return
		}
		http.ServeContent(w, r, stat.Name(), stat.ModTime(), bytes.NewReader(data))
		return
	}

	http.ServeContent(w, r, stat.Name(), stat.ModTime(), seeker)
}
