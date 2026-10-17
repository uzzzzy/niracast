package web

import (
	"embed"
	"io/fs"
)

// Dist embeds the compiled frontend application.
//
//go:embed all:app/dist
var Dist embed.FS

// SPA returns an fs.FS sub-filesystem rooted at app/dist.
func SPA() (fs.FS, error) {
	return fs.Sub(Dist, "app/dist")
}
