# Architecture & Design Decisions

- **Pure-Go SQLite**: Used `modernc.org/sqlite` with `CGO_ENABLED=0` to keep cross-compilation simple and avoid C runtime dependencies in container images.
- **Go 1.22 ServeMux Patterns**: Leveraged standard library enhanced routing patterns (methods and path wildcards) without external web frameworks.
- **Selective Transcoding**: Applied copy-vs-transcode based on media codecs; H.264 video and AAC audio are copied without re-encoding to minimize CPU usage.
- **Lazy On-Demand Streaming**: FFmpeg processes start lazily on the first manifest request (`.m3u8`) at the calculated wall-clock offset, and are automatically reaped by `SessionManager` when idle.
- **RAM Segment Storage**: Placed `/transcode` on a 1GB `tmpfs` volume to protect SSD wear from high-frequency HLS segment creation and deletion.
- **MAKER Methodology**: Used the MAKER framework (atomised micro-tasks, strict verification gates, red-flag abort conditions) for the initial system construction.
- **Git Flow Branching Model**: Adopted Git Flow (`main` for tagged releases, `develop` for integration, short-lived feature/fix/release/hotfix branches) with `.githooks/pre-commit` enforcement (`gofmt`, `go vet`, `go build`, and blocking direct commits on `main`).
- **2026-10-17 Frontend & Playout Architecture Roadmap**:
  - Embedded React 19 SPA (Vite, TypeScript, Tailwind, Radix, `motion`, TanStack Query) built in multi-stage Docker and embedded via `go:embed` with SPA fallback.
  - Viewer device priority: Desktop/Web > Smart TV (10-foot D-pad) > Mobile.
  - Zero-CPU idle stream: pre-encode static card (`siaran_segera_kembali.jpg`) once with silent AAC; loop via `-stream_loop -1 -re -c copy`. Reaped after 60s idle (not 24/7).
  - Auth & Live Status: Env admin password, HTTP-only cookie, CSRF; SSE at `/api/v1/events` for real-time CMS playout tracking. Deferred browser file uploads (retain `/media` volume ingest).

