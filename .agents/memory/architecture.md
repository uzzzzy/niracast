# Architecture

## Package Map

- **`cmd/server`**:
  - `main.go`: Application initialization, dependency wiring, and HTTP server startup.
  - `media.go`: `scanLoop` background scanner (every 5 min) and `GET /api/v1/media`.
  - `hls.go`: On-demand FFmpeg session trigger and endpoints `GET /channels/{id}/live.m3u8` and `GET /channels/{id}/{file}.ts`.
  - `epg.go`: EPG endpoint `GET /api/v1/channels/{id}/epg` (public; count 1..20 default 5; items `start_at`/`end_at` in real wall-clock time, skip offset aware; `idle: true` for empty playlist).
  - `spa.go`: SPA HTTP handler with fallback rules (`/api` returns 404 JSON, `/channels`, `/iptv`, and `/static` never fall back, missing file with extension returns 404, `index.html` served with `no-cache`, `/assets` served immutable, 503 Service Unavailable when frontend is not built).
- **`internal/db`**: Database initialization (`InitDB`), WAL mode configuration, and migration execution (`schema.sql`: tables `channels`, `media_files`, `playlists`, `schedules`).
- **`internal/ingest`**: Filesystem `Scanner` for `.mp4`, `.mkv`, and `.mov` (skipping hidden files); `ProbeMedia` utilizing ffprobe with 10s timeout.
- **`internal/models`**: Domain data models and structs.
- **`internal/api`**: Channel CRUD routes (`/api/v1/channels`), playlist updates (`POST /api/v1/channels/{id}/playlist` with JSON body `{"media_ids":[...]}`).
- **`internal/timeline`**: Wall-clock calculation (`now mod total playlist duration` yields current item + seek offset), `Upcoming(channelID, logicalNow, count)` calculating contiguous wall-clock schedule items for looping playlists, `ErrEmptyPlaylist`, and `FillerPolicy`.
- **`internal/stream`**:
  - `supervisor.go`: Playout supervisor managing continuous stream roll across playlist items, handling idle-to-media transitions, and maintaining HLS manifest continuity.
  - `idle.go`: One-time idle clip generation from static image (`IDLE_IMAGE` env, default `assets/filler/siaran_segera_kembali.jpg`) to 720p H.264 + silent AAC (`IDLE_CLIP` env, default `data/idle_card.mp4`), cached with `.meta` sidecar, looped via copy mode at near-zero CPU.
  - `FFmpegController`: FFmpeg process lifecycle management with explicit stream mapping (`-map 0:v:0 -map 0:a:0? -sn -dn`) to strip subtitles and data streams.
  - `SessionManager`: Session lifecycle with idle reaper (60s default timeout, 10s tick).
  - `OptimizePipeline`: Stream optimization detecting codecs (h264 + aac copied directly, others transcoded).
  - HLS generation flags: `-hls_time 2 -hls_list_size 5 -hls_flags delete_segments+append_list+omit_endlist` (and `discont_start` on stream roll/continuity boundaries).
- **`internal/auth`**: Authentication and session management (HMAC-signed HttpOnly session cookie `tvs_session` 12h, CSRF double-submit header `X-CSRF-Token`, login rate limit 5/min per `RemoteAddr` via `golang.org/x/time/rate`, route access matrix in `internal/auth/matrix.go`).
- **`internal/events`**: Non-blocking pub/sub hub for real-time broadcast and event dispatch.
- **`internal/feed`**: IPTV feeds serving `GET /iptv/channels.m3u` and `GET /iptv/epg.xml`.
- **`web/app`**: Modern Single-Page Application (Vite 8, React 19, TypeScript, Tailwind CSS v4, React Router 8, TanStack Query, Biome, Vitest; routes `/`, `/watch/:id`, `/admin/*`; lazy chunks per route).
  - Feature module `web/app/src/features/viewer`: `useHlsPlayer` hook with element-in-state binding, exponential backoff retry (`backoffDelay` 1s..15s), HUD overlay with 3s auto-hide, sliding channel drawer, program guide sheet, idle card, shortcuts modal (shortcuts: `M`, `F`, `P`, `G`, `C`, arrows, `PageUp`/`PageDown`, digits, `Esc`, `?`), i18n (id/en via `src/lib/i18n.ts`), CSS-only motion with reduced-motion support, and strictly no `backdrop-filter` over the video viewport.
- **`web/embed.go`**: Embedded filesystem (`go:embed all:app/dist`), providing `SPA()` sub-filesystem mapped to `app/dist/app`.
- **`web/static`**: Legacy dashboard and player assets (`index.html`, `app.js`, `style.css`, `player.html`, `player.js`), still accessible at `/static/`.

## Key API Routes

- **Channels**:
  - `GET /api/v1/channels`: List all channels.
  - `GET /api/v1/channels/{id}`: Channel details with active playlist items (public).
  - `POST /api/v1/channels`: Create channel (protected).
  - `PUT /api/v1/channels/{id}`: Update channel (protected).
  - `DELETE /api/v1/channels/{id}`: Delete channel (protected).
  - `POST /api/v1/channels/{id}/playlist`: Set channel playlist (protected).
- **Authentication**:
  - `POST /api/v1/auth/login`: Authenticate and issue session cookie with CSRF token.
  - `POST /api/v1/auth/logout`: Terminate session and clear cookie.
  - `GET /api/v1/auth/me`: Check current session authentication status.
- **Playout & Events**:
  - `GET /api/v1/events`: Real-time Server-Sent Events (SSE, protected).
  - `GET /api/v1/channels/{id}/status`: Channel playout status (public).
  - `GET /api/v1/channels/{id}/epg`: Channel EPG upcoming playlist items (public; count 1..20, default 5; items start_at/end_at in real wall-clock time, skip offset aware; idle: true for empty playlist).
  - `POST /api/v1/channels/{id}/skip`: Skip current item and advance playout (protected).

## Environment Variables

- `ADMIN_PASSWORD`: Admin password for authentication (empty = random password generated and logged once on startup).
- `SESSION_SECRET`: HMAC key for signing session cookies (empty = random per process, sessions reset on restart).

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
