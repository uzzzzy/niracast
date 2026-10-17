# Known Gaps & Technical Debt

- **M3U Host Header**: IPTV M3U stream URL generation dynamically derives host from `r.Host`. Target: network and reverse-proxy hardening.
- **Browser Testing**: Verified on desktop Chromium browser in Phase 4 (1280x720 HLS playback, HUD, channel drawer, guide sheet, idle card). Unverified on Safari, iOS, and Smart TV browsers.
- **Docker Image Size**: The current Docker production image is 211MB with multi-stage Node build and embedded SPA assets.
- **Discontinuity Across Clients (Unverified)**: Safari and Smart TV client stability across `#EXT-X-DISCONTINUITY` boundaries during live transcode/copy switches.
- **Playout Boundary Edge Case (Unverified)**: When a playlist item resolves with <1s remaining time, supervisor may restart the same file instead of cleanly rolling to the next item.
- **Skip Offset Volatility**: Playout skip offset is stored in-memory only and is lost on restart.
- **SSE Reconnect Under Long Downtime (Unverified)**: Real browser SSE connection verified for Overview live monitor, but reconnection behavior under extended server downtime remains unverified.
- **Database Migrations**: No migration runner needed yet as Phase 2 introduced no database schema changes.
- **First Manifest Wait in Copy Mode**: First manifest generation wait equals the source GOP length for copy mode (`sample.mp4` with 10s keyframes took ~9s, while real movies take 2.5–5s).
- **Frontend Bundle Size**: Admin chunk is 274kB raw / 79kB gzip (includes `@dnd-kit` and `sonner` in the lazy admin chunk); `hls` chunk remains 574kB raw / 179kB gzip in full build.
- **Admin Dialogs & Subpages Manual Testing**: Channels create/edit/delete dialogs and media/system pages verified only by unit tests (not clicked manually in browser run; Overview, login, skip button, and playlist drag-and-drop were verified in real browser).
- **Title Display Inconsistency**: 'NOW PLAYING' in the HUD overlay displays the raw filename with extension (`sample.mp4`), whereas the EPG program guide displays parsed titles without file extensions.
- **Keyboard Shortcut Emulation (Unverified)**: Browser-pane key emulation made keyboard shortcuts unverifiable manually.
- **Viewer Playout Polling**: The viewer page does not consume Server-Sent Events (`GET /api/v1/events`); instead, it polls `/api/v1/channels/{id}/status` every 5s and `/api/v1/channels/{id}/epg` every 15s.
- **Conditional Frontend Pre-commit**: Pre-commit hook runs `pnpm check` and `pnpm typecheck` only when `web/app/node_modules` exists.
- **No Clock-Time Scheduling**: Channels currently loop playlists via wall-clock modulo without fixed-time calendar slot resolution or idle-slate gap filling. Target: Future Plan F1 (`docs/ROADMAP.md`).
- **No Playout Analytics**: No concurrent viewer estimation, outbound bandwidth tracking, or historical audience metrics. Target: Future Plan F2 (`docs/ROADMAP.md`).

