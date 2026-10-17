# Product Roadmap & Architecture Decisions

## Goals
- **CMS for Streaming**: Centralized management for channels, schedules, playlists, media library, and live playout monitoring.
- **Dedicated Viewer Page**: Clean, distraction-free viewer interface (`/watch/{id}`) featuring glass HUD, now/next EPG, and channel switching.
- **Modern Web Framework**: Type-safe, declarative component system with high-performance reactive updates.
- **Idle Streaming with Static Image**: Seamless fallback stream broadcasting a branded static card when playlists are empty or during schedule gaps.
- **Modern Apple-like UI**: Polished visual aesthetic, refined typography, translucent glass surfaces, and minimal visual friction.
- **Premium UX**: Spatial navigation, keyboard shortcuts, optimistic state management, and resilient player error recovery.
- **Full Motion UI**: Cohesive physics-based transitions, spring tokens, and fluid layout morphing.

## Approved Product & Architectural Decisions

### Frontend Stack & Binary Delivery
- **Technology Stack**: React 19, Vite, TypeScript, Tailwind CSS, Radix UI primitives, `motion` animation library, and TanStack Query.
- **Packaging & Delivery**: Multi-stage Docker build with a Node build stage generating static assets, directly embedded into the Go binary via `go:embed`.
- **Runtime Model**: Single binary and container execution with zero Node.js runtime footprint. Go standard library `net/http` handles SPA fallback routing for client paths.

### Viewer Device Priority
1. **Web / Desktop (Priority 1)**: Primary target platform with mouse hover glass HUD, keyboard shortcuts, and picture-in-picture.
2. **Smart TV (Priority 2)**: 10-foot viewing experience with spatial D-pad remote navigation, oversized typography, and high contrast. Spatial navigation is implemented in-house with zero new dependencies instead of external libraries like `norigin-spatial-navigation` to keep bundle size lightweight and maintain full control over DOM focus behavior.
3. **Mobile (Priority 3)**: Responsive touch polish, swipe gestures, and compact drawer navigation (addressed last).

### Zero-CPU Idle Playout Architecture
- **Trigger Condition**: Activates automatically when a channel playlist is empty or during programming gaps.
- **On-Demand Lifecycle**: Idle channels are not continuous 24/7 encoders; they terminate automatically via the existing 60-second idle reaper when viewer count drops to zero.
- **One-Time Pre-encoding**: `assets/filler/siaran_segera_kembali.jpg` is pre-encoded ONCE into a short idle clip (~720p H.264 stillimage, low bitrate, silent AAC track via FFmpeg `anullsrc`). The generated clip is cached on disk and regenerated only when the source image file changes.
- **Runtime Copy Pipeline**: FFmpeg loops the pre-encoded clip using `-stream_loop -1 -re -c copy` through the existing copy transcode pipeline, maintaining near-zero runtime CPU load.
- **Silent Audio Track**: Silent AAC audio track is strictly required for seamless playback compatibility on Safari, iOS, and Smart TV engines.
- **Discontinuity Marker**: Transitions between active playlist media and the idle stream must emit an HLS `#EXT-X-DISCONTINUITY` tag (Unverified: to be verified in prototype).

### Media Ingestion & File Management
- **Directory Ingestion**: Media ingest continues to use mounted host storage via `/media`.
- **Browser Uploads**: Browser-based file uploads are deferred until robust authentication and access control layers are active.

### Authentication & Access Control
- **Authentication**: Single administrator password configured via environment variable.
- **Session Management**: Secure HTTP-only session cookies with CSRF protection.
- **Protected Surface**: Authentication required on all CMS mutation and configuration endpoints.

### Real-Time Playout & Status
- **Server-Sent Events (SSE)**: Playout progress, active program details, and channel lifecycle events streamed via `GET /api/v1/events`.
- **Status & Control APIs**: Dedicated status inspection at `GET /api/v1/channels/{id}/status` and manual skip control at `POST /api/v1/channels/{id}/skip`.

### Motion System Rules
- **Hardware Acceleration**: Animate exclusively `transform` and `opacity` properties to prevent DOM reflows.
- **Spring Tokens & Durations**: Standardized spring transitions with fixed durations: 120ms (micro-interactions), 240ms (surface reveals), and 350ms (page transitions).
- **Accessibility**: Honor `prefers-reduced-motion` system settings unconditionally.
- **Video Overlays**: Avoid GPU-intensive `backdrop-blur` directly over active video rendering viewports.
- **Lite Motion**: Provide an explicit lite-motion mode for resource-constrained hardware.

## Phased Roadmap

| Phase | Branch | Scope Summary | Done Criterion |
|---|---|---|---|
| 1 | `feature/playout-supervisor-idle` | Playout supervisor auto-advancing playlist items, pre-encoded idle video generator, and copy-loop fallback on empty channels. | **DONE**: Playout rolls seamlessly across items and falls back to low-CPU idle card without 404s (~2% CPU, ~32MiB). |
| 2 | `feature/admin-auth` | Admin env password verification, HTTP-only cookie sessions, CSRF protection, SSE event stream (`/api/v1/events`), and channel status/skip APIs. | **DONE**: Admin auth, CSRF, and rate limiting protect CMS APIs; status inspection and live SSE events operational. |
| 3 | `feature/frontend-scaffold` | React 19 + Vite setup in `web/`, Dockerfile Node build stage, binary embedding via `go:embed`, and SPA fallback routing. | **DONE**: React 19 SPA embedded via go:embed, SPA fallback routing active, multi-stage Docker build verified (211MB). |
| 4 | `feature/viewer-page` | Dedicated viewer (`/watch/{id}`) with custom `hls.js` hook (exponential backoff), glass HUD, channel switcher, and Now/Next EPG. | **DONE**: Desktop browser plays 1280x720 HLS stream with operational HUD, channel drawer, EPG guide sheet, and idle fallback card. |
| 5 | `feature/cms-studio` | CMS dashboard: media file library viewer, drag-and-drop playlist reordering, visual schedule planner, and live status monitor. | **DONE**: Operator can reorder channel playlist via drag-and-drop, advance live track via skip, manage channels/media, and inspect real-time SSE playout. |
| 6 | `feature/motion-system` | Physics spring animation tokens, View Transitions integration, layout morphing, and lite-motion fallback toggle. | **DONE**: Motion tokens, full/lite/reduced modes, admin AnimatePresence route transitions, and CSS/WAAPI viewer channel transitions operational. |
| 7 | `feature/tv-ui` | 10-foot viewing interface, spatial D-pad remote navigation, oversized typography, and high-contrast focus rings. | **DONE**: In-house zero-dependency spatial nav, remote key map (Tizen/webOS/Android TV), TV channel rail, numeric direct jump, volume persistence, and TV profile detection verified. |
| 8 | `feature/mobile-ui` | Responsive layout adaptations, touch gesture controls, bottom drawer navigation, and mobile viewport polish. | Web app functions responsively on standard mobile screen sizes without horizontal clipping. |

## Future Plan (not yet scheduled)

**Priority overview**: F3 normal (before any public/internet exposure), F1/F2 as already suggested, F4 low (explicitly deprioritised).

### F1: Scheduled broadcast (TV-style programming)
- **Goal**: Enable clock-time broadcast programming alongside loop playback. Today a channel is a 24/7 wall-clock loop of its playlist (`now mod total playlist duration`) with no clock times; the `schedules` table already has `start_time`/`duration_sec` columns that are unused by the resolver.
- **Scope**:
  - Per-channel mode: `"loop"` (current behaviour) or `"scheduled"`.
  - Time-slot resolver in `internal/timeline` picking the item by `start_time` window.
  - Schedule gaps: play the idle slate using the existing supervisor idle fallback.
  - Recurrence: daily and weekly repeat rules.
  - Feed generation: XMLTV EPG and M3U generated from the real schedule.
  - CMS planner: day/week timeline, drag-and-drop slots, overlap/conflict warnings, timezone handling (default `Asia/Jakarta`, configurable).
- **Dependencies**: Phase 5 (CMS studio) done first so the UI is not built twice; careful interaction with the in-memory skip offset (decide: skip in scheduled mode only advances to next slot item).
- **Risks / Unverified**: Timezone/DST edge cases; items whose real duration differs from scheduled slot (truncate or fill with idle); schema migration needed (add a migration runner then).
- **Done criterion**: A channel plays programme A at 19:00 and slate in gaps without manual action, EPG matches.

### F2: Realtime analytics
- **Goal**: Provide real-time playout and audience metrics for operational monitoring.
- **Scope**:
  - Live concurrency: concurrent viewers per channel and total, shown live in the CMS monitor via the existing SSE hub (`internal/events`).
  - Historical metrics: peak per hour/day, total watch time, most-watched media, estimated outbound bandwidth aggregated per minute into SQLite with retention (raw minutes 30 days, daily rollups 1 year).
  - Channel health: idle/error state, FFmpeg restart count.
  - Analytics API: `GET /api/v1/analytics/*` (protected).
  - Viewer counting model: inferred from HLS request patterns (a client counts as active if it requested a manifest or segment within the last ~10 s; client id = daily-salted hash of IP+User-Agent), so numbers are estimates, not exact; players behind one NAT with the same UA collapse into one.
  - Privacy: no raw IPs stored, hashes rotate daily, no PII, no GeoIP in the first version.
- **Dependencies**: Phase 5 for the UI; the existing `SessionManager` activity pings and events hub.
- **Risks / Unverified**: Viewer counting accuracy under NAT and caching (UNVERIFIED accuracy, must be measured with real clients).
- **Done criterion**: CMS shows live viewer counts per channel within ~5 s and a 24 h history chart.

### F3: Public link security and request-flood protection
- **Priority**: normal (before any public/internet exposure).
- **Goal**: Protect public HLS streaming routes from request floods, unauthorized hotlinking, and resource exhaustion while preserving legitimate viewer access. Probing the running server (verified 2026-10-17) confirmed original media files and the DB are not exposed (404), path traversal attempts fail, `/api/v1/media` is protected, and viewers only receive the live rolling window (5 x 2s segments, old ones deleted); remaining gaps are that HLS manifest/segment URLs are public with no token, and there is no rate limit on HLS routes, so rapid repeated manifest requests keep or restart FFmpeg per existing channel.
- **Scope**:
  - Short-lived signed URLs/tokens for public stream links (HMAC like the session cookie, expiry configurable, issued by the viewer page API and by the M3U feed, validated on `live.m3u8` and `.ts`, optional per-channel on/off for open IPTV use).
  - Per-IP rate limiting on HLS routes and on manifest requests that would start a channel (`golang.org/x/time/rate` is already a dependency; do not trust `X-Forwarded-For` unless a trusted-proxy setting is configured).
  - Cap on concurrently running FFmpeg processes and a per-channel start cooldown.
  - HTTP 429 response with `Retry-After`, metrics/log lines for blocked requests.
  - Review CORS and security headers (`X-Content-Type-Options`, `Referrer-Policy`) on public routes.
- **Dependencies**: None hard; pair with F2 analytics for visibility; decide token UX for third-party IPTV players (M3U with token query parameter, unverified player compatibility).
- **Risks / Unverified**: Token in URL can leak via logs/referrer and can be shared; some IPTV apps may not refresh tokens in long-running playback; NAT/shared IPs can be throttled together.
- **Done criterion**: Tokenless or expired requests get 401/403, a flood from one IP is throttled while other viewers are unaffected, FFmpeg process count never exceeds the cap, covered by tests and a live curl check.

### F4: Anti-recording / stream protection
- **Priority**: LOW (explicitly deprioritised by the user).
- **Goal**: Raise the effort needed to record the live stream. Honest limitation to state: any stream that is playable can be recorded; these measures only deter casual copying, and the key is delivered to legitimate clients, so determined users can still capture it; visible or forensic watermarking costs CPU and eliminates the zero-CPU copy path.
- **Scope**:
  - HLS AES-128 encryption with a key endpoint that requires a valid token.
  - Visible or forensic watermark per session (FFmpeg overlay or burned session ID, which needs transcoding and gives up the zero-CPU copy path).
  - Shorter-lived tokens.
- **Dependencies**: F3 tokens.
- **Risks / Unverified**: Watermarking and on-the-fly re-encoding sacrifice zero-CPU copy performance; keys delivered to client players can be captured by determined actors; older IPTV device compatibility with encrypted HLS.
- **Done criterion**: Defined at implementation time; do not start before F3.

### Suggested order
After Phase 8 or interleaved after Phase 5: F3 before any public/internet exposure; F1 then F2 (or F2 first if monitoring matters more); F4 low (user-deprioritised). All proposals to be confirmed by the user.

## Open & Unverified Questions
- **Unverified:** Manifest discontinuity behavior: Verify player stability across `#EXT-X-DISCONTINUITY` boundaries during live transcode-copy switching on Safari and Smart TVs.
- **Unverified:** View Transitions API cross-browser support and performance impact alongside concurrent HLS video playback.
- **Unverified:** Performance on weak devices: Profile motion system and DOM complexity under 4x CPU throttling.
- **Unverified:** Bundle size targets (<150KB initial JS) are design goals, not verified measurements.
