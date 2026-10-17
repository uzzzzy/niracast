# Known Gaps & Technical Debt

- **Continuous Stream Roll**: FFmpeg stops at the end of a single media file; the stream does not automatically roll over to the next playlist item without a new client request. Target: resolved in Roadmap Phase 1 (`feature/playout-supervisor-idle`).
- **Filler Video Wiring**: The fallback filler asset `assets/filler/siaran_segera_kembali.mp4` does not exist on disk, and `FillerPolicy` is not yet wired into the HTTP server. Target: resolved in Roadmap Phase 1 (`feature/playout-supervisor-idle` via one-time pre-encoded idle card).
- **Empty Playlist Handling**: Requesting stream manifests on an empty playlist returns HTTP 404. Target: resolved in Roadmap Phase 1 (`feature/playout-supervisor-idle` via zero-CPU copy-loop idle stream).
- **M3U Host Header**: IPTV M3U stream URL generation dynamically derives host from `r.Host`. Target: network and reverse-proxy hardening.
- **Browser Testing**: The web player has not been verified in a real browser environment (relies on `hls.js` fetched from CDN). Target: resolved in Roadmap Phase 4 (`feature/viewer-page` with dedicated `hls.js` hook and automated browser checks).
- **Image Size**: The current Docker production image is ~209MB. Target: addressed during multi-stage Docker pipeline refinement in Roadmap Phase 3 (`feature/frontend-scaffold`).

