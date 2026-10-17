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
2. **Smart TV (Priority 2)**: 10-foot viewing experience with spatial D-pad remote navigation, oversized typography, and high contrast.
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
| 5 | `feature/cms-studio` | CMS dashboard: media file library viewer, drag-and-drop playlist reordering, visual schedule planner, and live status monitor. | Operator can reorder channel playlist via drag-and-drop and skip currently playing track via UI. |
| 6 | `feature/motion-system` | Physics spring animation tokens, View Transitions integration, layout morphing, and lite-motion fallback toggle. | UI transitions smoothly with zero layout reflows and honors system reduced-motion preferences. |
| 7 | `feature/tv-ui` | 10-foot viewing interface, spatial D-pad remote navigation, oversized typography, and high-contrast focus rings. | Viewer page navigable entirely via arrow keys and Enter on TV browser simulation. |
| 8 | `feature/mobile-ui` | Responsive layout adaptations, touch gesture controls, bottom drawer navigation, and mobile viewport polish. | Web app functions responsively on standard mobile screen sizes without horizontal clipping. |

## Future Plan (not yet scheduled)

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

### Suggested order
After Phase 8 or interleaved after Phase 5: F1 then F2 (or F2 first if monitoring matters more). Both are proposals to be confirmed by the user.

## Open & Unverified Questions
- **Unverified:** Manifest discontinuity behavior: Verify player stability across `#EXT-X-DISCONTINUITY` boundaries during live transcode-copy switching on Safari and Smart TVs.
- **Unverified:** View Transitions API cross-browser support and performance impact alongside concurrent HLS video playback.
- **Unverified:** Performance on weak devices: Profile motion system and DOM complexity under 4x CPU throttling.
- **Unverified:** Bundle size targets (<150KB initial JS) are design goals, not verified measurements.
