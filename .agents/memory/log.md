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

