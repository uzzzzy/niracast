package auth

import (
	"net/http"
	"path"
	"strings"
)

// AccessRule documents a route pattern, allowed methods, and access level.
type AccessRule struct {
	Pattern   string
	Methods   []string
	Protected bool
	Comment   string
}

// AccessMatrix documents the routing access control rules.
//
// +----------------------------------+---------------------+-----------+-----------------------------------+
// | Path / Pattern                   | Method(s)           | Status    | Description                       |
// +----------------------------------+---------------------+-----------+-----------------------------------+
// | (any not starting with /api/v1/) | ANY                 | PUBLIC    | Static assets, /, HLS, IPTV feeds |
// | /api/v1/auth/login               | POST, OPTIONS       | PUBLIC    | Admin login endpoint              |
// | /api/v1/auth/me                  | GET, HEAD, OPTIONS  | PUBLIC    | Session status check              |
// | /api/v1/channels                 | GET, HEAD, OPTIONS  | PUBLIC    | Channel list                      |
// | /api/v1/channels/{id}            | GET, HEAD, OPTIONS  | PUBLIC    | Single channel detail             |
// | /api/v1/channels/{id}/status     | GET, HEAD, OPTIONS  | PUBLIC    | Channel playout status (phase 2b) |
// | /api/v1/auth/logout              | POST                | PROTECTED | Session invalidation              |
// | /api/v1/channels (mutations)     | POST                | PROTECTED | Create channel                    |
// | /api/v1/channels/{id} (mutations)| PUT, DELETE         | PROTECTED | Update/delete channel             |
// | /api/v1/channels/{id}/playlist   | POST                | PROTECTED | Set playlist                      |
// | /api/v1/channels/{id}/skip       | POST                | PROTECTED | Skip current item (phase 2b)      |
// | /api/v1/media                    | GET, HEAD           | PROTECTED | Media library listing             |
// | /api/v1/events                   | GET                 | PROTECTED | SSE event stream                  |
// | (all other /api/v1/*)            | ANY                 | PROTECTED | Default deny for API mutations    |
// +----------------------------------+---------------------+-----------+-----------------------------------+
var AccessMatrix = []AccessRule{
	{Pattern: "/* (not /api/v1/*)", Methods: []string{"ANY"}, Protected: false, Comment: "Static files, /, HLS, IPTV"},
	{Pattern: "/api/v1/auth/login", Methods: []string{"POST", "OPTIONS"}, Protected: false, Comment: "Admin login"},
	{Pattern: "/api/v1/auth/me", Methods: []string{"GET", "HEAD", "OPTIONS"}, Protected: false, Comment: "Auth status check"},
	{Pattern: "/api/v1/channels", Methods: []string{"GET", "HEAD", "OPTIONS"}, Protected: false, Comment: "Public channel list"},
	{Pattern: "/api/v1/channels/{id}", Methods: []string{"GET", "HEAD", "OPTIONS"}, Protected: false, Comment: "Public channel detail"},
	{Pattern: "/api/v1/channels/{id}/status", Methods: []string{"GET", "HEAD", "OPTIONS"}, Protected: false, Comment: "Public channel status"},
	{Pattern: "/api/v1/auth/logout", Methods: []string{"POST"}, Protected: true, Comment: "Admin logout"},
	{Pattern: "/api/v1/channels", Methods: []string{"POST"}, Protected: true, Comment: "Create channel"},
	{Pattern: "/api/v1/channels/{id}", Methods: []string{"PUT", "DELETE"}, Protected: true, Comment: "Update / delete channel"},
	{Pattern: "/api/v1/channels/{id}/playlist", Methods: []string{"POST"}, Protected: true, Comment: "Set channel playlist"},
	{Pattern: "/api/v1/channels/{id}/skip", Methods: []string{"POST"}, Protected: true, Comment: "Skip current playing item"},
	{Pattern: "/api/v1/media", Methods: []string{"GET"}, Protected: true, Comment: "Media index"},
	{Pattern: "/api/v1/events", Methods: []string{"GET"}, Protected: true, Comment: "SSE events"},
}

// IsPublic evaluates whether the incoming request matches public routes that require no auth.
func IsPublic(r *http.Request) bool {
	p := path.Clean(r.URL.Path)

	// Anything outside /api/v1/ is public: static files, root, HLS segments/manifests, IPTV feeds.
	if !strings.HasPrefix(p, "/api/v1/") && p != "/api/v1" {
		return true
	}

	// Login is public so operators can submit credentials.
	if p == "/api/v1/auth/login" {
		return true
	}

	// Safe read-only methods on public API routes
	if isSafeMethod(r.Method) {
		if p == "/api/v1/auth/me" {
			return true
		}
		if p == "/api/v1/channels" {
			return true
		}
		if isChannelPublicPath(p) {
			return true
		}
	}

	return false
}

func isSafeMethod(m string) bool {
	return m == http.MethodGet || m == http.MethodHead || m == http.MethodOptions
}

func isChannelPublicPath(p string) bool {
	if !strings.HasPrefix(p, "/api/v1/channels/") {
		return false
	}
	sub := strings.TrimPrefix(p, "/api/v1/channels/")
	parts := strings.Split(sub, "/")
	if len(parts) == 1 && parts[0] != "" {
		return true // /api/v1/channels/{id}
	}
	if len(parts) == 2 && parts[0] != "" && parts[1] == "status" {
		return true // /api/v1/channels/{id}/status
	}
	return false
}

func isMutatingMethod(m string) bool {
	switch m {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	default:
		return false
	}
}
