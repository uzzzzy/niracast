# Architecture

## Package Map

- **`cmd/server`**:
  - `main.go`: Application initialization, dependency wiring, and HTTP server startup.
  - `media.go`: `scanLoop` background scanner (every 5 min) and `GET /api/v1/media`.
  - `hls.go`: On-demand FFmpeg session trigger and endpoints `GET /channels/{id}/live.m3u8` and `GET /channels/{id}/{file}.ts`.
- **`internal/db`**: Database initialization (`InitDB`), WAL mode configuration, and migration execution (`schema.sql`: tables `channels`, `media_files`, `playlists`, `schedules`).
- **`internal/ingest`**: Filesystem `Scanner` for `.mp4`, `.mkv`, and `.mov` (skipping hidden files); `ProbeMedia` utilizing ffprobe with 10s timeout.
- **`internal/models`**: Domain data models and structs.
- **`internal/api`**: Channel CRUD routes (`/api/v1/channels`), playlist updates (`POST /api/v1/channels/{id}/playlist` with JSON body `{"media_ids":[...]}`).
- **`internal/timeline`**: Wall-clock calculation (`now mod total playlist duration` yields current item + seek offset), `ErrEmptyPlaylist`, and `FillerPolicy`.
- **`internal/stream`**:
  - `supervisor.go`: Playout supervisor managing continuous stream roll across playlist items, handling idle-to-media transitions, and maintaining HLS manifest continuity.
  - `idle.go`: One-time idle clip generation from static image (`IDLE_IMAGE` env, default `assets/filler/siaran_segera_kembali.jpg`) to 720p H.264 + silent AAC (`IDLE_CLIP` env, default `data/idle_card.mp4`), cached with `.meta` sidecar, looped via copy mode at near-zero CPU.
  - `FFmpegController`: FFmpeg process lifecycle management with explicit stream mapping (`-map 0:v:0 -map 0:a:0? -sn -dn`) to strip subtitles and data streams.
  - `SessionManager`: Session lifecycle with idle reaper (60s default timeout, 10s tick).
  - `OptimizePipeline`: Stream optimization detecting codecs (h264 + aac copied directly, others transcoded).
  - HLS generation flags: `-hls_time 2 -hls_list_size 5 -hls_flags delete_segments+append_list+omit_endlist` (and `discont_start` on stream roll/continuity boundaries).
- **`internal/feed`**: IPTV feeds serving `GET /iptv/channels.m3u` and `GET /iptv/epg.xml`.
- **`web/static`**: Frontend assets (`index.html`, `app.js`, `style.css`, `player.html`, `player.js`).

## Docker Setup

- **Builder**: `golang:1.27-alpine`
- **Runtime**: `alpine:3.21` with `ffmpeg`
- **User**: Non-root user `app` (`uid 100`)
- **Assets**: `assets/filler` baked directly into the image for idle fallback card.
- **Mounts & Volumes**:
  - `tmpfs /transcode`: 1GB in-memory filesystem to prevent SSD wear from HLS segments.
  - Media volume: Mounted read-only (`:ro`).
  - Data directory: `./data` persisted on host.
