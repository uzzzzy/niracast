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
- **Public HLS Links Unauthenticated & No Rate Limiting**: HLS manifest (`live.m3u8`) and segment (`.ts`) URLs are public with no access tokens, and routes lack rate limiting, allowing rapid manifest requests to keep or restart FFmpeg per channel. Media files and DB remain secure. Target: Future Plan F3 (`docs/ROADMAP.md`).
- **Live Stream Recording Not Prevented**: Live stream can be recorded or captured by viewers; casual deterrence only (AES-128, watermarking), and watermarking sacrifices zero-CPU copy mode. Priority: LOW (user decision). Target: Future Plan F4 (`docs/ROADMAP.md`).
- **Admin Chunk Growth**: Admin chunk grew to 415kB raw / 126kB gzip because of the motion library (idea: `LazyMotion`/`m` components to shrink).
- **Sonner Height Transition**: `sonner`'s own CSS transitions `height` (third-party, admin only).
- **Volume Reset on Channel Switch (Fixed)**: Volume level and mute state now persist across channel switches and page reloads via `volumePersistence.ts` in `localStorage` (`tv_stream_volume`, `tv_stream_muted`).
- **TV Profile Detection, Remote Key Map, Spatial Nav (Fixed)**: Smart TV profile detection (`device.ts`), remote key normalization (`remoteKeys.ts`), and zero-dependency spatial navigation (`spatialNav.ts`) are implemented and verified in tests and simulation.
- **Motion Performance & Browser Compatibility (Unverified)**: FPS under 4x CPU throttle and Safari/TV behaviour unverified.
- **Smart TV Keycodes & Browser Performance (Unverified)**: Real physical Tizen and webOS device keycode reception, input latency, and low-end TV browser performance remain unverified on hardware (tested via emulation and test suites).
- **Stray Digit Overlay Transient Glitch (Not Reproduced / Closed)**: The earlier transient glitch ('# 6 / CHANNEL 6' after ArrowLeft x2 + Enter via browser automation) was investigated and not reproduced during Phase 8 testing.
- **Mobile Device Behavior & Haptics (Unverified)**: Real physical iOS Safari and Android Chrome touch gesture performance, native haptics (`navigator.vibrate`), and orientation change jitter/aspect ratio resizing during active live HLS playback remain unverified on physical hardware (verified in test suites and responsive viewport emulations down to 320px).
- **Origin-wide `?ui=` Override Persistence**: The `?ui=` query parameter override is persisted in `localStorage` under key `'ui'` per origin. Consequently, a desktop browser navigated to `?ui=mobile` or `?ui=tv` will stay in mobile/tv mode across page visits until explicitly cleared or overridden via `?ui=desktop`.


