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



