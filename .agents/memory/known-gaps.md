# Known Gaps & Technical Debt

- **M3U Host Header**: IPTV M3U stream URL generation dynamically derives host from `r.Host`. Target: network and reverse-proxy hardening.
- **Browser Testing**: The web player has not been verified in a real browser environment (relies on `hls.js` fetched from CDN). Target: resolved in Roadmap Phase 4 (`feature/viewer-page` with dedicated `hls.js` hook and automated browser checks).
- **Docker Image Size**: The current Docker production image is 211MB with multi-stage Node build and embedded SPA assets.
- **Discontinuity Across Clients (Unverified)**: Safari and Smart TV client stability across `#EXT-X-DISCONTINUITY` boundaries during live transcode/copy switches.
- **Playout Boundary Edge Case (Unverified)**: When a playlist item resolves with <1s remaining time, supervisor may restart the same file instead of cleanly rolling to the next item.
- **Skip Offset Volatility**: Playout skip offset is stored in-memory only and is lost on restart.
- **SSE Browser Verification**: Server-Sent Events (`GET /api/v1/events`) have only been verified with `curl` and `httptest`, not yet within a real browser `EventSource` client.
- **Database Migrations**: No migration runner needed yet as Phase 2 introduced no database schema changes.
- **First Manifest Wait in Copy Mode**: First manifest generation wait equals the source GOP length for copy mode (`sample.mp4` with 10s keyframes took ~9s, while real movies take 2.5–5s).
- **Placeholder Viewer Page**: The viewer page (`/watch/:id`) is a placeholder until Phase 4 (`feature/viewer-page` with dedicated `hls.js` hook).
- **Frontend Bundle Size**: Measured bundle sizes: index chunk 224kB raw / 70kB gzip, admin chunk 76kB raw / 26kB gzip (measured figures, not a target check).
- **Conditional Frontend Pre-commit**: Pre-commit hook runs `pnpm check` and `pnpm typecheck` only when `web/app/node_modules` exists.
- **No Clock-Time Scheduling**: Channels currently loop playlists via wall-clock modulo without fixed-time calendar slot resolution or idle-slate gap filling. Target: Future Plan F1 (`docs/ROADMAP.md`).
- **No Playout Analytics**: No concurrent viewer estimation, outbound bandwidth tracking, or historical audience metrics. Target: Future Plan F2 (`docs/ROADMAP.md`).

