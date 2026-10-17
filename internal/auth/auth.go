package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"golang.org/x/time/rate"
)

const (
	SessionCookieName = "tvs_session"
	CSRFCookieName    = "tvs_csrf"
	SessionLifetime   = 12 * time.Hour
)

// SessionPayload is the signed JSON payload carried inside tvs_session.
type SessionPayload struct {
	Exp  int64  `json:"exp"`
	CSRF string `json:"csrf"`
}

// Config holds configuration parameters for the Auth service.
type Config struct {
	AdminPassword string
	SessionSecret []byte
	Now           func() time.Time
}

// Auth provides authentication endpoints, token management, rate limiting, and protection middleware.
type Auth struct {
	adminPassword string
	sessionSecret []byte
	limiter       *IPRateLimiter
	Now           func() time.Time
}

// New creates and initializes an Auth instance.
func New(cfg Config) *Auth {
	nowFunc := cfg.Now
	if nowFunc == nil {
		nowFunc = time.Now
	}
	return &Auth{
		adminPassword: cfg.AdminPassword,
		sessionSecret: cfg.SessionSecret,
		limiter:       NewIPRateLimiter(rate.Every(time.Minute/5), 5, nowFunc),
		Now:           nowFunc,
	}
}

func (a *Auth) now() time.Time {
	if a.Now != nil {
		return a.Now()
	}
	return time.Now()
}

// Limiter returns the internal IP rate limiter.
func (a *Auth) Limiter() *IPRateLimiter {
	return a.limiter
}

// Register mounts the auth routes onto the provided ServeMux.
func (a *Auth) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/auth/login", a.Login)
	mux.HandleFunc("POST /api/v1/auth/logout", a.Logout)
	mux.HandleFunc("GET /api/v1/auth/me", a.Me)
}

func (a *Auth) createToken(csrf string) (string, error) {
	exp := a.now().Add(SessionLifetime).Unix()
	payload := SessionPayload{
		Exp:  exp,
		CSRF: csrf,
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadBytes)

	mac := hmac.New(sha256.New, a.sessionSecret)
	mac.Write([]byte(payloadB64))
	sigB64 := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return payloadB64 + "." + sigB64, nil
}

func decodeBase64URL(s string) ([]byte, error) {
	if b, err := base64.RawURLEncoding.DecodeString(s); err == nil {
		return b, nil
	}
	return base64.URLEncoding.DecodeString(s)
}

func (a *Auth) verifyToken(token string) (*SessionPayload, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return nil, errors.New("invalid token format")
	}
	payloadB64, sigB64 := parts[0], parts[1]

	sig, err := decodeBase64URL(sigB64)
	if err != nil {
		return nil, errors.New("invalid signature encoding")
	}

	mac := hmac.New(sha256.New, a.sessionSecret)
	mac.Write([]byte(payloadB64))
	expectedSig := mac.Sum(nil)
	if !hmac.Equal(sig, expectedSig) {
		return nil, errors.New("signature mismatch")
	}

	payloadBytes, err := decodeBase64URL(payloadB64)
	if err != nil {
		return nil, errors.New("invalid payload encoding")
	}

	var payload SessionPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return nil, errors.New("invalid payload json")
	}

	if payload.Exp <= a.now().Unix() {
		return nil, errors.New("session expired")
	}

	if payload.CSRF == "" {
		return nil, errors.New("missing csrf token")
	}

	return &payload, nil
}

func isSecure(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

func (a *Auth) setCookies(w http.ResponseWriter, r *http.Request, token, csrf string) {
	secure := isSecure(r)
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(SessionLifetime.Seconds()),
		Secure:   secure,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     CSRFCookieName,
		Value:    csrf,
		Path:     "/",
		HttpOnly: false,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(SessionLifetime.Seconds()),
		Secure:   secure,
	})
}

func (a *Auth) clearCookies(w http.ResponseWriter, r *http.Request) {
	secure := isSecure(r)
	http.SetCookie(w, &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
		Secure:   secure,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     CSRFCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: false,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
		Secure:   secure,
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// Login handles POST /api/v1/auth/login.
func (a *Auth) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}

	clientIP := ClientIP(r)
	if !a.limiter.Allow(clientIP) {
		w.Header().Set("Retry-After", "60")
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "rate limit exceeded"})
		return
	}

	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}

	adminHash := sha256.Sum256([]byte(a.adminPassword))
	givenHash := sha256.Sum256([]byte(body.Password))
	if subtle.ConstantTimeCompare(adminHash[:], givenHash[:]) != 1 {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	csrf := GenerateRandomHex(32)
	token, err := a.createToken(csrf)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal error"})
		return
	}

	a.setCookies(w, r, token, csrf)
	writeJSON(w, http.StatusOK, map[string]string{"csrf": csrf})
}

// Logout handles POST /api/v1/auth/logout.
func (a *Auth) Logout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
		return
	}
	a.clearCookies(w, r)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// Me handles GET /api/v1/auth/me.
func (a *Auth) Me(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(SessionCookieName)
	if err != nil || cookie.Value == "" {
		writeJSON(w, http.StatusOK, map[string]any{"authenticated": false, "csrf": ""})
		return
	}

	payload, err := a.verifyToken(cookie.Value)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"authenticated": false, "csrf": ""})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"authenticated": true, "csrf": payload.CSRF})
}

// Protect wraps an http.Handler with authentication and CSRF checks.
func (a *Auth) Protect(next http.Handler, public func(r *http.Request) bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		isPub := false
		if public != nil {
			isPub = public(r)
		} else {
			isPub = IsPublic(r)
		}

		if isPub {
			next.ServeHTTP(w, r)
			return
		}

		cookie, err := r.Cookie(SessionCookieName)
		if err != nil || cookie.Value == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}

		payload, err := a.verifyToken(cookie.Value)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}

		if isMutatingMethod(r.Method) {
			csrf := r.Header.Get("X-CSRF-Token")
			if csrf == "" || subtle.ConstantTimeCompare([]byte(csrf), []byte(payload.CSRF)) != 1 {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "csrf"})
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

// Protect is a package-level convenience function wrapping an Auth instance's Protect method.
func Protect(a *Auth, next http.Handler, public func(r *http.Request) bool) http.Handler {
	return a.Protect(next, public)
}

// CreateSessionToken exposes token creation for testing and internal session seeding.
func (a *Auth) CreateSessionToken(csrf string) (string, error) {
	return a.createToken(csrf)
}

const passwordCharset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

// GenerateRandomPassword creates a random alphanumeric password of the given length.
func GenerateRandomPassword(length int) string {
	b := make([]byte, length)
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand: " + err.Error())
	}
	for i := range b {
		b[i] = passwordCharset[int(b[i])%len(passwordCharset)]
	}
	return string(b)
}

// GenerateRandomBytes generates n cryptographically random bytes.
func GenerateRandomBytes(n int) []byte {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand: " + err.Error())
	}
	return b
}

// GenerateRandomHex returns a hex-encoded string of n random bytes.
func GenerateRandomHex(n int) string {
	return hex.EncodeToString(GenerateRandomBytes(n))
}
