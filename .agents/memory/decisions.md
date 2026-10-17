# Architecture & Design Decisions

- **Pure-Go SQLite**: Used `modernc.org/sqlite` with `CGO_ENABLED=0` to keep cross-compilation simple and avoid C runtime dependencies in container images.
- **Go 1.22 ServeMux Patterns**: Leveraged standard library enhanced routing patterns (methods and path wildcards) without external web frameworks.
- **Selective Transcoding**: Applied copy-vs-transcode based on media codecs; H.264 video and AAC audio are copied without re-encoding to minimize CPU usage.
- **Lazy On-Demand Streaming**: FFmpeg processes start lazily on the first manifest request (`.m3u8`) at the calculated wall-clock offset, and are automatically reaped by `SessionManager` when idle.
- **RAM Segment Storage**: Placed `/transcode` on a 1GB `tmpfs` volume to protect SSD wear from high-frequency HLS segment creation and deletion.
- **MAKER Methodology**: Used the MAKER framework (atomised micro-tasks, strict verification gates, red-flag abort conditions) for the initial system construction.
