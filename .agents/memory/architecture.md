# Architecture

## Package Map

- **`cmd/server`**:
  - `main.go`: Application initialization, dependency wiring, and HTTP server startup.
  - `media.go`: `scanLoop` background scanner (every 5 min) and `GET /api/v1/media` (now with `codec_video`, `codec_audio`, `width`, `height`).
  - `system.go`: `MediaScanner` single-flight scan coordinator, `POST /api/v1/media/rescan`, `GET /api/v1/media/scan-status`, and `GET /api/v1/system` (uptime, counts, running_channels, ffmpeg version, idle clip state).
  - `hls.go`: On-demand FFmpeg session trigger and endpoints `GET /channels/{id}/live.m3u8` and `GET /channels/{id}/{file}.ts`.
  - `epg.go`: EPG endpoint `GET /api/v1/channels/{id}/epg` (public; count 1..20 default 5; items `start_at`/`end_at` in real wall-clock time, skip offset aware; `idle: true` for empty playlist).
  - `spa.go`: SPA HTTP handler with fallback rules (`/api` returns 404 JSON, `/channels`, `/iptv`, and `/static` never fall back, missing file with extension returns 404, `index.html` served with `no-cache`, `/assets` served immutable, 503 Service Unavailable when frontend is not built).
- **`internal/db`**: Database initialization (`InitDB`), WAL mode configuration, and schema version 2 management (`schema.sql`: tables `channels` with `mode` loop|scheduled, `media_files`, `playlist_items`, and `schedule_slots` with `idx_slots_channel(channel_id, start_at)`; compatibility view `schedules` with INSTEAD OF triggers; `playlists` table dropped; `PRAGMA user_version = 2` enforced, rejecting legacy v0 databases).
- **`internal/ingest`**: Filesystem `Scanner` for `.mp4`, `.mkv`, and `.mov` (skipping hidden files); `ProbeMedia` utilizing ffprobe with 10s timeout.
- **`internal/models`**: Domain data models and CRUD operations (`channels` with `mode`, `media_files`, `playlist_items`, and `schedule_slots` with 60-day overlap validation and `ConflictError`).
- **`internal/api`**: Channel CRUD routes (`/api/v1/channels` with `mode`), channel deletion stopping active playout via `PlayoutStopper`, playlist queries (`GET /api/v1/channels/{id}/playlist`), playlist updates (`POST /api/v1/channels/{id}/playlist`), and schedule slot management (`GET/POST /api/v1/channels/{id}/schedule`, `/api/v1/channels/{id}/schedule/slots`, and `PUT/DELETE .../slots/{slotId}`).
- **`internal/timeline`**: Playout timeline calculation: loop calculation (`now mod total playlist duration` yields current item + seek offset), slot recurrence expansion (`Expand`) across daily/weekly rules in server timezone, gap filling with idle slate and overrun clipping (`ProgrammesBetween`), scheduled playout resolution (`GetCurrentPlayout`), `Upcoming` projections, `ErrEmptyPlaylist`, and `FillerPolicy`.
- **`internal/stream`**:
  - `supervisor.go`: Playout supervisor managing continuous stream roll across playlist items, handling idle-to-media transitions, maintaining HLS manifest continuity, exposing `RunningCount()`, tracking restart counts and error state across failures, emitting `channel.health` SSE events, and stopping streams on channel removal (`StopStream`).
  - `idle.go`: One-time idle clip generation from static image (`IDLE_IMAGE` env, default `assets/filler/siaran_segera_kembali.jpg`) to 720p H.264 + silent AAC (`IDLE_CLIP` env, default `data/idle_card.mp4`), cached with `.meta` sidecar, looped via copy mode at near-zero CPU.
  - `FFmpegController`: FFmpeg process lifecycle management with explicit stream mapping (`-map 0:v:0 -map 0:a:0? -sn -dn`) to strip subtitles and data streams.
  - `SessionManager`: Session lifecycle with idle reaper (60s default timeout, 10s tick).
  - `OptimizePipeline`: Stream optimization detecting codecs (h264 + aac copied directly, others transcoded).
  - HLS generation flags: `-hls_time 2 -hls_list_size 5 -hls_flags delete_segments+append_list+omit_endlist` (and `discont_start` on stream roll/continuity boundaries).
- **`internal/analytics`**: Real-time playout analytics and audience metrics engine:
  - `Tracker`: In-memory HLS request observer, privacy-preserving client IDs (`SHA-256(daily_salt + ClientIP + User-Agent)` rotating daily), 10s sliding active viewer window, and `countingResponseWriter` response byte accumulation.
  - `Flusher`: Periodic 1-minute ticker batching minute observations into `analytics_minute` with `ON CONFLICT` updates and graceful shutdown flush.
  - `Rollup`: Hourly worker executing daily aggregation into `analytics_daily` and retention pruning (30 days for minute records, 365 days for daily rollups).
  - `Query`: Query service for live concurrency (`QueryLive`), timeseries buckets (`QueryTimeseries` for 1h/24h/7d/30d), and top media rankings (`QueryTopMedia`).
- **`internal/auth`**: Authentication and session management (HMAC-signed HttpOnly session cookie `tvs_session` 12h, CSRF double-submit header `X-CSRF-Token`, login rate limit 5/min per `RemoteAddr` via `golang.org/x/time/rate`, route access matrix in `internal/auth/matrix.go`).
- **`internal/events`**: Non-blocking pub/sub hub for real-time broadcast and event dispatch.
- **`internal/feed`**: IPTV feeds serving `GET /iptv/channels.m3u` and `GET /iptv/epg.xml`.
- **`web/app`**: Modern Single-Page Application (Vite 8, React 19, TypeScript, Tailwind CSS v4, React Router 8, TanStack Query, Biome, Vitest; routes `/`, `/watch/:id`, `/admin/*`; lazy chunks per route).
  - Theme system `web/app/src/lib/theme.ts`: Resolves `system|light|dark` with localStorage persistence under key `'theme'` and `matchMedia` listener. Inline pre-paint script in `web/app/index.html` sets `data-theme` before first paint. Viewer root is always dark via `.scheme-dark`.
  - UI primitives `web/app/src/components/ui`: Control Room Glass shared components (`GlassPanel`, `Button`, `Card`, `StatTile`, `Field`/`Input`/`Select`/`Textarea`, `StatusPill`, `SegmentedControl`, `ThemeToggle`, `EmptyState`, `ChannelArt`, `AreaChart`, `BarChart`). `AmbientBackground` lives in `features/admin/components/`.
  - Vite chunk layout (`web/app/vite.config.ts`): `manualChunks` pins only `hls.js`. Routes use `React.lazy` code splitting (`ViewerPage` and `AdminPage`), so `/watch` loads index + `ViewerPage` + mode + hls, and `/admin` loads index + `AdminPage` + mode.
  - Device module `web/app/src/lib/device.ts`: TV profile detection via user agent (Tizen, webOS, Android TV, Google TV, Apple TV, Fire TV, etc.) or URL parameter (`?profile=tv`), mobile profile detection via user agent regex or coarse pointer (`(pointer: coarse)`) + viewport width < 768px, and URL parameter override `?ui=mobile|tv|desktop` persisted to `localStorage` under key `'ui'`. Sets `data-tv="true"`, `data-mobile="true"`, and `data-ui="mobile|tv|desktop"` on `<html>`. Note: `?ui=` override persists in `localStorage` per origin, keeping a desktop browser in tv or mobile mode until `?ui=desktop` is used.
  - Remote key map `web/app/src/lib/remoteKeys.ts`: Normalizes D-pad arrows, Enter/OK, Back/Esc, ChannelUp/Down, VolumeUp/Down, 0-9 numeric digits, and TV color buttons (Red, Green, Yellow, Blue).
  - Spatial navigation `web/app/src/lib/spatialNav.ts`: Zero-dependency, in-house DOM geometric spatial navigation algorithm computing directional Euclidean distance, roving focus management, and automatic container scrolling.
  - Pure gesture engine `web/app/src/lib/gestures.ts`: Zero-dependency pointer-event gesture detection (`detectSwipe`, `calculateRubberBand`, `isTap`, `useSwipeGesture`, `useBottomSheetDrag`), velocity and distance thresholding, transform-only GPU animations, and reduced-motion compliance.
  - Motion module `web/app/src/lib/motion`: `tokens.ts` pure tokens, `mode.ts` resolver (`full`, `lite`, `reduced`), `useMotionMode` hook, `data-motion` attribute on `<html>`, localStorage key `'motion'` (`auto`, `full`, `lite`).
  - Feature module `web/app/src/features/viewer`: `useHlsPlayer` hook with element-in-state binding, exponential backoff retry (`backoffDelay` 1s..15s), HUD overlay with 3s auto-hide, sliding channel drawer, program guide sheet, idle card, shortcuts modal (shortcuts: `M`, `F`, `P`, `G`, `C`, `N` for motion toggle, arrows, `PageUp`/`PageDown`, digits, `Esc`, `?`), i18n (id/en via `src/lib/i18n.ts`), viewer channel-switch transition via CSS/WAAPI (fade, volume ramp, channel bump), and real backdrop-blur on desktop only (falling back to solid tinted fills on mobile, TV, reduced motion, or unsupported browsers; content cards use non-blurred `.surface-card`).
    - TV UI extensions: `ChannelRailTv.tsx` horizontal 10-foot channel rail, `DigitEntryOverlay.tsx` direct channel number jump, `RemoteLegendModal.tsx` on-screen D-pad and color key legend, `VolumeToast.tsx` visual volume/mute toast bar, volume persistence via `src/features/viewer/volumePersistence.ts` (`tv_stream_volume`, `tv_stream_muted` in localStorage), and high-contrast focus rings with safe-area padding in `src/index.css`.
    - Mobile UI extensions: Interactive bottom sheets for `ChannelDrawer.tsx` and `ProgramGuideSheet.tsx` with drag handles and touch swipe-down-to-dismiss; HUD overlay tap-to-toggle, double-tap gestures (left half: mute toggle with toast, right half: fullscreen toggle), vertical swipe for channel switching, 44px minimum touch targets, `100dvh` viewport height and CSS safe-area insets (`env(safe-area-inset-*)`), and `playsInline`/`webkit-playsinline` on video element.
  - Feature module `web/app/src/features/admin`: Auth gate, shell with `MotionProvider` + `AnimatePresence` route transitions, motion switcher UI in `AdminTopBar`, Overview live monitor via SSE EventSource with live viewer and restart badges, Channels CRUD, Playlist editor with dnd-kit sortable + loop timeline + dirty tracking, Media library with rescan polling, System page, Analytics dashboard (`/admin/analytics`, `AnalyticsPage`), sonner toasts, native `<dialog>` modals, and i18n id/en.
    - Admin Mobile UI: Fixed bottom navigation tab bar (`AdminBottomBar`), responsive card stacking for Channels and Media tables (clean layout down to 320px width), and `@dnd-kit/core` `TouchSensor` with 250ms delay and 5px tolerance on `PlaylistEditorPage`.
- **`web/embed.go`**: Embedded filesystem (`go:embed all:app/dist`), providing `SPA()` sub-filesystem mapped to `app/dist/app`.
- **`web/static`**: Legacy dashboard and player assets (`index.html`, `app.js`, `style.css`, `player.html`, `player.js`), still accessible at `/static/`.

## Key API Routes

- **Channels**:
  - `GET /api/v1/channels`: List all channels (includes `mode: 'loop' | 'scheduled'`).
  - `GET /api/v1/channels/{id}`: Channel details with active playlist items and mode (public).
  - `POST /api/v1/channels`: Create channel (protected).
  - `PUT /api/v1/channels/{id}`: Update channel (protected).
  - `DELETE /api/v1/channels/{id}`: Delete channel and stop its playout (protected).
  - `GET /api/v1/channels/{id}/playlist`: Get channel playlist items and duration (protected).
  - `POST /api/v1/channels/{id}/playlist`: Set channel playlist (protected).
- **Schedule**:
  - `GET /api/v1/channels/{id}/schedule`: List slots and expanded occurrences for a window (`from`, `to`, default 7 days, max 31 days).
  - `POST /api/v1/channels/{id}/schedule/slots`: Add schedule slot with 60-day overlap validation (protected, returns 409 Conflict on collision, triggers supervisor reload).
  - `PUT /api/v1/channels/{id}/schedule/slots/{slotId}`: Update schedule slot (protected, returns 409 Conflict on collision, triggers supervisor reload).
  - `DELETE /api/v1/channels/{id}/schedule/slots/{slotId}`: Delete schedule slot (protected, triggers supervisor reload).
- **Media**:
  - `GET /api/v1/media`: Media library listing with codec_video, codec_audio, width, height (protected).
  - `POST /api/v1/media/rescan`: Trigger media rescan (single-flight, shared guard with 5-minute scanLoop, protected).
  - `GET /api/v1/media/scan-status`: Media scan status (protected).
- **Analytics**:
  - `GET /api/v1/analytics/live`: Current active viewer concurrency per channel and total, playout health, and supervisor restarts (protected).
  - `GET /api/v1/analytics/timeseries`: Timeseries data points for viewers peak and total bytes out (`range=1h|24h|7d|30d`, optional `channel_id`, protected).
  - `GET /api/v1/analytics/top-media`: Most-watched media files ranked by watch duration and viewer sessions (`range=1h|24h|7d|30d`, protected).
- **System**:
  - `GET /api/v1/system`: System runtime info: uptime, counts, running_channels, ffmpeg version, idle clip state, server timezone (protected).
- **Authentication**:
  - `POST /api/v1/auth/login`: Authenticate and issue session cookie with CSRF token.
  - `POST /api/v1/auth/logout`: Terminate session and clear cookie.
  - `GET /api/v1/auth/me`: Check current session authentication status.
- **Playout & Events**:
  - `GET /api/v1/events`: Real-time Server-Sent Events (SSE, protected; streams playout status, periodic ~5s `viewers.update`, and `channel.health` restart alerts).
  - `GET /api/v1/channels/{id}/status`: Channel playout status with viewer count, restart count, and last error (public).
  - `GET /api/v1/channels/{id}/epg`: Channel EPG upcoming playlist items (public; count 1..20, default 5; includes `kind: "programme" | "slate"`, items start_at/end_at in real wall-clock time, skip offset aware in loop mode; idle: true for empty playlist).
  - `POST /api/v1/channels/{id}/skip`: Skip current item and advance playout (protected; returns 409 Conflict `{"error":"skip_unavailable"}` in scheduled mode).

## Environment Variables

- `ADMIN_PASSWORD`: Admin password for authentication (empty = random password generated and logged once on startup).
- `SESSION_SECRET`: HMAC key for signing session cookies (empty = random per process, sessions reset on restart).
- `TIMEZONE`: Server timezone for schedule slot recurrence expansion, EPG generation, and timeline calculations (default `Asia/Jakarta`).

## Docker Setup

- **Web Stage**: `node:22-alpine` building `web/app` with BuildKit pnpm cache (`--mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store`).
- **Builder**: `golang:1.27-alpine` copying compiled frontend from `web` stage into `web/app/dist/app`.
- **Runtime**: `alpine:3.21` with `ffmpeg`
- **User**: Non-root user `app` (`uid 100`)
- **Assets**: `assets/filler` baked directly into the image for idle fallback card.
- **Mounts & Volumes**:
  - `tmpfs /transcode`: 1GB in-memory filesystem to prevent SSD wear from HLS segments.
  - Media volume: Mounted read-only (`:ro`).
  - Data directory: `./data` persisted on host.
