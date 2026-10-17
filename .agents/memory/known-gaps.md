# Known Gaps & Technical Debt

- **M3U Host Header**: IPTV M3U stream URL generation dynamically derives host from `r.Host`. Target: network and reverse-proxy hardening.
- **Browser Testing**: The web player has not been verified in a real browser environment (relies on `hls.js` fetched from CDN). Target: resolved in Roadmap Phase 4 (`feature/viewer-page` with dedicated `hls.js` hook and automated browser checks).
- **Image Size**: The current Docker production image is ~209MB. Target: addressed during multi-stage Docker pipeline refinement in Roadmap Phase 3 (`feature/frontend-scaffold`).
- **Discontinuity Across Clients (Unverified)**: Safari and Smart TV client stability across `#EXT-X-DISCONTINUITY` boundaries during live transcode/copy switches.
- **Playout Boundary Edge Case (Unverified)**: When a playlist item resolves with <1s remaining time, supervisor may restart the same file instead of cleanly rolling to the next item.

