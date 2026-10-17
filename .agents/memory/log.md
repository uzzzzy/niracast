# Work Log

Append-only history of work sessions and milestones. Add newest entries at the bottom.

## 2026-10-16
- Original build M1.1–M5.2 completed via MAKER DAG.
- `cmd/server` written, Docker deployed, and end-to-end verified.
- Git repository initialized via agy (commit `3bc5b6c`).

## 2026-10-17
- `.agents/` cleaned up: removed legacy micro-task plans and orchestrator specs.
- Rebuilt cross-agent shared memory system and task templates.
- Generated filler card `assets/filler/siaran_segera_kembali.jpg`.
- Established Git Flow workflow: created `docs/GIT_FLOW.md`, `.githooks/pre-commit`, updated agent guides/conventions, and initialized `develop` branch.
- Architecture brainstorm completed across six expert agy workers (lead architect, frontend specialist, backend engineer, devops engineer, QA specialist, security auditor). Formalized product roadmap, zero-CPU pre-encoded idle loop, React 19 embedded SPA, and Git Flow phased feature branches in `docs/ROADMAP.md`.
- **Phase 1 Playout Supervisor & Idle Stream Completed** (`feature/playout-supervisor-idle`):
  - Playout supervisor auto-advances playlist items and coordinates seamless idle fallback transitions.
  - Pre-encoded idle clip generation with `.meta` cache sidecar, baked `assets/filler` in Docker, and near-zero CPU copy loop.
  - FFmpeg flag fixes: `discont_start`, permanent `omit_endlist`, and `-map 0:v:0 -map 0:a:0? -sn -dn` stream isolation.
  - Verified: E2E with real movies in `sample/` via copy mode; MKV with embedded subtitles fixed; idle->real switch with discontinuity; Docker container ~2% CPU and ~32MiB with 2 channels; manifest first byte ~2s idle / ~3.5s playlist.
  - Unverified: Safari/Smart-TV behaviour across discontinuities; tiny-remaining-time edge case when an item resolves with <1s left may restart the same file.
- **Phase 2 Admin Auth, Playout Status & SSE Event Stream Completed** (`feature/admin-auth`):
  - Repository normalization: `.gitattributes` forces LF line endings repository-wide and binary for media assets, eliminating CRLF discrepancies under `core.autocrlf=true`.
  - Admin authentication (`internal/auth`): HMAC-SHA256 signed session cookie (`tvs_session`, 12h TTL), CSRF double-submit token (`X-CSRF-Token`), rate limiting (5 attempts/min per `RemoteAddr` via `golang.org/x/time/rate`), and route access matrix in `internal/auth/matrix.go`.
  - Auth routes: `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.
  - Real-time SSE hub (`internal/events`): Non-blocking pub/sub dispatcher streaming channel status and playout events to `GET /api/v1/events` (protected).
  - Playout inspection and skip: Added `GET /api/v1/channels/{id}/status` (public) and manual item skip `POST /api/v1/channels/{id}/skip` (protected, shifts supervisor timeline).
  - Legacy dashboard update: Added temporary login modal and session handling to vanilla UI until Phase 5.
  - Verified: Unit tests, route matrix, and E2E HTTP integration tests passed; live `curl` test validated login/logout, CSRF rejection, 429 rate limiting, protected CMS gate, real-time SSE event reception, JSON status inspection, and timeline skip; Docker container run validated with zero regressions.
- **Future Plan Formalized**: Documented unscheduled roadmap proposals in `docs/ROADMAP.md` covering scheduled TV-style broadcast programming (F1) and real-time HLS viewer analytics (F2). Updated architectural decisions and known gaps.
- **Phase 3 Modern Frontend Scaffold & SPA Delivery Completed** (`feature/frontend-scaffold`):
  - Initialized modern React 19 SPA in `web/app` with Vite 8, TypeScript, Tailwind CSS v4, React Router 8, TanStack Query, Biome, and Vitest.
  - Implemented client-side routing for `/`, `/watch/:id`, and `/admin/*` with code-split lazy chunk loading per route.
  - Added channel detail REST endpoint `GET /api/v1/channels/{id}`.
  - Implemented SPA fallback handler `cmd/server/spa.go` backed by `web/embed.go` (`go:embed all:app/dist`, `SPA()` sub-mounted to `app/dist/app`), serving `/assets` with immutable caching, `index.html` with no-cache, 503 fallback when not built, JSON 404 for `/api`, and bypassing `/channels`, `/iptv`, and `/static`.
  - Configured multi-stage `Dockerfile` with `node:22-alpine` web stage using BuildKit pnpm store cache.
  - Isolated Vite build output to `web/app/dist/app` to preserve tracked `web/app/dist/.gitkeep` placeholder across Vite `emptyOutDir`, ensuring clean git clones can build Go binaries without Node.js.
  - Verified: `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm build` passed; all Go unit/integration tests passed; clean-clone `go build` passed without Node; multi-stage Docker build passed (211MB image); live SPA routing and browser rendering of `/watch/1` verified with zero regressions. Legacy dashboard remains accessible at `/static/`.
- **Phase 4 Dedicated HLS Viewer Page & EPG Completed** (`feature/viewer-page`):
  - Backend EPG endpoint: Implemented `GET /api/v1/channels/{id}/epg` with `count=1..20` (default 5), real wall-clock `start_at`/`end_at` calculation aware of supervisor skip offsets, and empty playlist idle card indicator (`idle: true`).
  - Timeline Upcoming: Added `Upcoming()` and `ComputeUpcoming()` in `internal/timeline` to resolve contiguous looping playlist schedules. Updated `internal/auth/matrix.go` to permit public access.
  - Dedicated viewer feature module (`web/app/src/features/viewer`): Built custom `useHlsPlayer` hook with element-in-state binding, exponential backoff (1s..15s), fatal error recreation, and audio codec swap recovery. Built HUD overlay with 3s auto-hide, sliding channel drawer, program guide sheet, idle slate card, and keyboard shortcuts modal.
  - Controls & i18n: Added keyboard controls (M, F, P, G, C, arrows, PageUp/PageDown, channel number digits, Esc, ?) and id/en i18n via `src/lib/i18n.ts`.
  - Vite optimization: Isolated `hls.js` into a dedicated vendor chunk (`hls`).
  - Verified: Go tests and vetting passed; frontend checks (`pnpm check`, `typecheck`, `test`, `build`) passed; real browser verification confirmed 1280x720 HLS playback, late-mount ref fix, HUD auto-hide, channel drawer navigation, EPG guide sheet, and idle card rendering.
- **Phase 5 CMS Studio Completed** (`feature/cms-studio`):
  - Backend admin endpoints: Implemented `GET /api/v1/channels/{id}/playlist` with `models.GetPlaylist`, channel deletion playout termination via `supervisor.StopStream`, `GET /api/v1/media` with video/audio codecs and dimensions, single-flight `MediaScanner` guarding `POST /api/v1/media/rescan` and `scanLoop`, `GET /api/v1/media/scan-status`, and `GET /api/v1/system` (uptime, media/channel counts, running channels, FFmpeg version, idle clip state).
  - Admin feature module (`web/app/src/features/admin`): Built authentication gate, login card, admin shell with sidebar navigation, Overview live monitor via SSE `EventSource` and manual item skip, Channels CRUD with native `<dialog>` modals, drag-and-drop playlist editor with `@dnd-kit/sortable`, loop timeline, and dirty state tracking, Media library with codec badges and rescan status polling, and System metrics page.
  - Tooling & UI: Integrated `@dnd-kit` suite and `sonner` in the lazy admin chunk, native `<dialog>` modals without heavy UI frameworks, and id/en i18n support.
  - Verified: Backend unit/integration tests and live `curl` API tests passed; frontend checks (`pnpm check`, `pnpm typecheck`, `pnpm test` [49 tests], `pnpm build`) passed; real browser run verified login, live Overview via SSE, Skip button live playout advance, and playlist drag-and-drop reordering persisted on the server.
- **Future Plan Extended with Security & Anti-Recording Proposals (F3 & F4)**:
  - Documented F3 (Public link security and request-flood protection, priority normal before any public/internet exposure) and F4 (Anti-recording / stream protection, priority LOW, explicitly deprioritised by user decision) in `docs/ROADMAP.md`.
  - Added Priority overview to Future Plan section.
  - Recorded 2026-10-17 server probing findings (DB and media files protected at 404, /api/v1/media authenticated, live 5x2s segment rolling window; gaps in unauthenticated manifest/segment URLs and lack of rate limiting).
  - Updated `.agents/memory/decisions.md` and `.agents/memory/known-gaps.md`.
- **Phase 6 Motion System Completed** (`feature/motion-system`):
  - Motion tokens & resolver (`web/app/src/lib/motion`): Defined pure duration/easing tokens in `tokens.ts`, runtime mode resolver in `mode.ts` (`full`, `lite`, `reduced`), and `useMotionMode` hook syncing `data-motion` attribute on `<html>` and persisted in `localStorage` under `'motion'` (`auto`, `full`, `lite`).
  - Admin motion: Integrated `motion` 14.3.0 in lazy admin chunk, wrapped admin shell in `MotionProvider` + `AnimatePresence` route transitions, and added motion switcher in `AdminTopBar`.
  - Viewer channel transitions: Implemented lightweight CSS/WAAPI channel-switch transition (fade, volume ramp, channel bump) and added 'N' keyboard shortcut toggle.
  - Guardrails: Added `motionGuard.test.ts` ensuring viewer chunk remains free of the motion library, and verified no layout properties are animated.
  - Verified: `pnpm check`, `pnpm typecheck`, `pnpm test` (74 tests), and `pnpm build` passed; real browser testing verified video playback, ArrowDown channel switching, and `full`/`lite` mode switching (halving `--dur-fast` to 60ms and disabling live pulse).
- **Phase 7 TV UI Completed** (`feature/tv-ui`):
  - TV profile detection (`web/app/src/lib/device.ts`): User agent heuristic detection (Tizen, webOS, Android TV, Google TV, Apple TV, Fire TV) and query parameter override (`?profile=tv`), managing `data-tv="true"` on `<html>`.
  - In-house spatial navigation (`web/app/src/lib/spatialNav.ts`): Built zero-dependency 2D spatial navigation calculating geometric candidate distance with roving tabindex and automatic scroll alignment (avoided `norigin-spatial-navigation`).
  - Remote key map (`web/app/src/lib/remoteKeys.ts`): Normalizes D-pad navigation, Enter/OK, Return/Back, ChannelUp/Down, VolumeUp/Down, numeric key entry, and color buttons across TV platforms.
  - Viewer TV components (`web/app/src/features/viewer/components`): Added `ChannelRailTv` horizontal drawer rail, `DigitEntryOverlay` for direct channel number jumping, `RemoteLegendModal` for on-screen shortcut guidance, and `VolumeToast` on-screen level indicator.
  - Volume persistence (`web/app/src/features/viewer/volumePersistence.ts`): Persists volume level and mute state in `localStorage` across channel switches and page reloads.
  - Styling: High-contrast focus rings, oversized typography, safe area padding (`env(safe-area-inset-*)`), and TV CSS variables in `src/index.css`.
  - Verified: `pnpm check`, `pnpm typecheck`, `pnpm test` (151 unit/integration tests passing), and `pnpm build` passed; all backend Go tests passed. TV profile detection, remote key mapping, spatial nav, and volume persistence verified.
  - Unverified & gaps: Real Tizen and webOS remote keycodes and TV browser performance remain unverified on physical hardware; stray digit overlay '# 6 / CHANNEL 6' was observed once transiently after sending ArrowLeft x2 + Enter via browser automation (slated for investigation in Phase 8).
- **Phase 8 Mobile UI Completed** (`feature/mobile-ui`):
  - Device detection (`web/app/src/lib/device.ts`): Expanded `getDeviceProfile` to detect mobile devices (touch-capable phones/tablets via UA regex or coarse pointer + viewport width < 768px), `?ui=mobile` query param override persisted to `localStorage` under `'ui'`, and TV priority precedence. Added unit tests with authentic iPhone/Android/iPad user-agent strings.
  - Pure gesture detection & bottom-sheet kinematics (`web/app/src/lib/gestures.ts`): Implemented `detectSwipe`, `calculateRubberBand`, `isTap`, `useSwipeGesture`, and `useBottomSheetDrag` hooks with transform-only animations, pointer events, velocity/threshold detection, and reduced-motion adherence.
  - Mobile viewer page & HUD (`web/app/src/pages/ViewerPage.tsx`, `web/app/src/features/viewer`):
    - Replaced 100vh with 100dvh and integrated CSS safe-area insets (`env(safe-area-inset-*)`).
    - Added `playsInline` and `webkit-playsinline` attributes to video element, preventing forced fullscreen on iOS.
    - Added single-tap to toggle HUD, double-tap left half to toggle mute with toast, double-tap right half to toggle fullscreen.
    - Vertical swipe up/down switches channels relative to current channel.
    - Converted `ChannelDrawer` and `ProgramGuideSheet` into interactive mobile bottom sheets with drag handles and swipe-down-to-close behavior.
    - Minimum 44px touch targets on HUD buttons and bottom sheet items; volume slider hidden on mobile touch devices; feature-detected PiP and Fullscreen buttons hidden when unsupported (e.g. iOS Safari).
  - Mobile admin interface (`web/app/src/features/admin`):
    - Added fixed bottom navigation tab bar for mobile viewports while keeping sidebar for desktop.
    - Implemented responsive card stacking for Channels and Media tables via semantic CSS `block md:table`, `block md:table-row`, preventing horizontal scroll down to 320px width.
    - Configured `@dnd-kit/core` `TouchSensor` with 250ms delay and 5px tolerance in `PlaylistEditorPage`, enabling touch drag reordering without conflicting with page scrolling.
  - Guardrails & i18n: Added id/en translations for new mobile strings (`drag_handle`, `swipe_channel_switch`, `double_tap_mute`, `double_tap_fullscreen`); `motionGuard.test.ts` verified viewer bundle remains completely independent of the `motion` package.
  - Verified: `pnpm run check` (Biome, 73 files passed), `pnpm run typecheck` (tsc clean), `pnpm run test` (180 tests across 21 test suites passed), `pnpm run build` (viewer bundle 52.88 kB, admin bundle 418.74 kB, zero motion imports in viewer). Responsive layouts verified down to 320px, 375px, 390px, 414px, 430px, and mobile landscape. The earlier transient stray digit overlay ('# 6 / CHANNEL 6') was investigated and not reproduced.
  - Unverified & notes: Real iOS Safari and Android Chrome behavior, native physical haptics (`navigator.vibrate`), and orientation change on real devices remain unverified. Note that the `?ui=` override persists in `localStorage` per origin, which can make a desktop browser stay in tv/mobile mode until `?ui=desktop` is used.
- **Control Room Glass UI Revamp Completed (2026-10-17)**:
  - Design system & tokens (`web/app/src/index.css`, `docs/DESIGN.md`): Implemented semantic token palette and Apple-style materials. `.glass*` materials and typography classes are placed in `@layer components` allowing utility overrides; radii and monospace font in `@theme`.
  - Theme management (`web/app/src/lib/theme.ts`, `web/app/index.html`): Added light and dark mode support with localStorage key `theme` (`system|light|dark`) and inline pre-paint script to prevent theme flash. The viewer (`/watch/:id`) remains strictly dark via `.scheme-dark`.
  - Shared UI primitives (`web/app/src/components/ui/`): Created `GlassPanel`, `Button`, `Card`, `StatTile`, `Field`/`Input`/`Select`/`Textarea`, `StatusPill`, `SegmentedControl`, `ThemeToggle`, `EmptyState`, and `ChannelArt`. `AmbientBackground` placed in `features/admin/components/`.
  - Decision change: Replaced "no backdrop-blur over video" with "real blur on desktop only". `.glass*` classes fall back to solid tinted fills (no backdrop-filter) on `html[data-ui=tv]`, `html[data-ui=mobile]`, `data-motion=lite|reduced`, `@media (prefers-reduced-transparency: reduce)`, and when backdrop-filter is unsupported. Only shell chrome is blurred; content cards use non-blurred `.surface-card`.
  - Visual assets: Generated 13 WebP images via imagine-agy (`agy generate_image`) in `web/app/src/assets` (336 KB total): dark/light and portrait wallpapers, login-hero, idle-art, empty-state illustrations, and channel placeholders. Rebuilt server idle frame `assets/filler/siaran_segera_kembali.jpg` (1920x1080) from idle-art with ffmpeg drawtext ("JEDA SIARAN" / "Siaran Segera Kembali" / "We'll be right back. Stay tuned."), and regenerated container `/data/idle/idle.mp4` (frame verified).
  - Guardrails & utilities: Added `web/app/src/test/tokenGuard.test.ts` forbidding arbitrary hex color utilities, legacy hex palette, and raw backdrop-blur in features/pages/components. Added `formatTimecode` helper in `features/viewer/utils.ts` (formatting H:MM:SS from one hour up) with unit tests for HUD progress and next-item countdowns.
  - Bug fixes: Fixed admin index/catch-all `<Navigate to="overview">` relative navigation loop under `AnimatePresence mode="wait"` by using absolute path `/admin/overview`.
  - Bundle optimization (`web/app/vite.config.ts`): Refactored `manualChunks` to pin only `hls.js`. Removed manual `admin` chunk that absorbed React, router, and shared code (which previously caused `/watch` to download motion and dnd-kit, and `/admin` to download `hls.js`). Now `/watch` loads index + `ViewerPage` + mode + hls, and `/admin` loads index + `AdminPage` + mode. Chunk sizes: index 358.61 kB (117.09 gzip), `ViewerPage` 49.61 kB (13.19 gzip), `AdminPage` 280.33 kB (85.03 gzip), `hls` 574.39 kB (178.97 gzip).
  - Verified: `pnpm check`, `pnpm typecheck`, `pnpm test` (25 files, 205 tests), `pnpm build`; `go vet ./...`, `go build ./...`, `go test ./...`. Docker redeployed at http://localhost:8080. Browser verified login and overview in light and dark; theme persistence; desktop sidebar and HUD real blur; mobile profile no blur, no overflow at 375px, >=44px tap targets; TV profile no blur, 4px focus ring, no text overlap at 1280x720; lite mode no blur and no ambient drift; video playback operational.
  - Known gaps & unverified: `AmbientBackground` downloads all four wallpapers (~82 KB) via hidden `<img>` tags; blur performance cost on low-end desktop GPUs unmeasured; `prefers-reduced-transparency` browser support varies; not tested on physical Smart TVs or mobile devices; idle JPEG text rendered with Windows Segoe UI font (confirm font licensing if distributed beyond project); agy claude-sonnet-4-6 quota exhausted during work (workers ran on gemini-3.8-flash-high).






