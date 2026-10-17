# Known Gaps & Technical Debt

- **Continuous Stream Roll**: FFmpeg stops at the end of a single media file; the stream does not automatically roll over to the next playlist item without a new client request (requires a continuous supervisor).
- **Filler Video Wiring**: The fallback filler asset `assets/filler/siaran_segera_kembali.mp4` does not exist on disk, and `FillerPolicy` is not yet wired into the HTTP server.
- **Empty Playlist Handling**: Requesting stream manifests on an empty playlist returns HTTP 404.
- **M3U Host Header**: IPTV M3U stream URL generation dynamically derives host from `r.Host`.
- **Browser Testing**: The web player has not been verified in a real browser environment (relies on `hls.js` fetched from CDN).
- **Image Size**: The current Docker production image is ~209MB.
