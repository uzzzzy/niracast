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
- **Phase 1 Playout Supervisor & FFmpeg Flags**:
  - Correct HLS discontinuity flag: The FFmpeg flag is `discont_start` (not `discontinuity_start`).
  - Infinite live manifests: `omit_endlist` is always set in `-hls_flags` so live broadcast manifests never terminate with `#EXT-X-ENDLIST`.
  - Explicit stream mapping: `-map 0:v:0 -map 0:a:0? -sn -dn` is strictly used because real MKV containers frequently carry ASS subtitles and font attachments that break HLS muxing.
  - Idle clip 2s keyframes: Idle clip pre-encoding forces keyframes every 2s so the initial HLS manifest appears in ~2s.
  - Zero-CPU idle looping: Idle channels are copy-looped (`-stream_loop -1 -re -c copy`), consuming ~0 CPU overhead.
- **Phase 2 Auth & Playout Decisions**:
  - In-memory skip offset: Playout skip offset is held in-memory only and shifts the supervisor timeline; EPG and M3U feeds continue to compute from wall clock, so their schedule metadata can differ from actual playout after a skip.
  - Direct RemoteAddr rate limiting: The login rate limiter strictly inspects `r.RemoteAddr` and does not trust `X-Forwarded-For` to prevent unauthenticated header spoofing without explicit proxy configuration.
  - Temporary vanilla dashboard auth: Added a minimal login modal to the legacy vanilla dashboard to support authenticated operations until Phase 5 replaces the UI.
  - Repository-wide LF enforcement: Added `.gitattributes` forcing LF endings repository-wide because `core.autocrlf=true` generated CRLF line breaks that broke `gofmt -l` checks during pre-commit.
- **Phase 3 Frontend Scaffold Decisions**:
  - Exact version pins: Configured `.npmrc` with `save-exact=true` and enforced `packageManager` in `package.json` (`pnpm@10.5.2`) for reproducible and deterministic dependency lockfiles.
  - Vite outDir is dist/app: Vite build output is isolated to `web/app/dist/app` so that the tracked placeholder `web/app/dist/.gitkeep` survives Vite's `emptyOutDir`. A clean git clone can immediately run `go build` out of the box without Node installed (bug found and fixed).
- **Phase 4 Viewer Page Decisions**:
  - Exact `hls.js` 1.7.3 pinned and isolated into a dedicated manual vendor chunk (`hls`) in `vite.config.ts` to prevent bloating the main app bundle.
  - Real browser mount timing bug: When `ViewerPage` loads, the video element is only mounted after the asynchronous channel query completes. An initial hook effect using a standard `useRef` ran once when the ref was still `null`, leaving playback uninitialized. Fixed by holding the video element in React state (`videoEl`) so the player effect triggers immediately when the DOM node attaches, backed by a regression test.
  - Verification lesson: Unit tests using a mocked `hls.js` missed the lifecycle timing mismatch entirely because the mock executed synchronously against synthetic DOM nodes; always perform real-browser playback checks.
- **Phase 5 CMS Studio Decisions**:
  - Dependencies added: `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, `@dnd-kit/utilities` 3.2.2, and `sonner` 2.0.8, kept isolated in the lazy `admin` chunk in `vite.config.ts`.
  - Minimal stack: No Radix UI or external form libraries added; used native HTML `<dialog>` elements and lightweight controlled forms to avoid runtime bloat.
  - Schedule planner deferred: Visual schedule planner was deliberately not built here because F1 (scheduled broadcast) in the roadmap Future Plan owns calendar slot resolution.
  - Filler management view-only: Filler management is view-only on the System page; idle card generation remains automated server-side.
- **2026-10-17**: Future plan recorded: scheduled broadcast (F1) and realtime analytics (F2), not scheduled yet; see docs/ROADMAP.md.



