# 24/7 TV Broadcast Stream App — Project Index

Proyek ini menggunakan metodologi arsitektur **MAKER** (*Maximal Agentic Decomposition*, *K-Threshold Error Mitigation*, dan *Red-Flagging*) dengan antrean tugas teratomisasi multi-file untuk eksekusi paralel hemat token.

## Master Orchestrator
Daftar seluruh tugas, dependensi DAG, grup paralel, dan status pelacakan pengerjaan dikelola di:
👉 **[orchestrator.md](file:///n:/devenv/.collection/tv-stream/.agents/orchestrator.md)**

## Antrean Tugas Atomik (Micro-Tasks)
Spesifikasi mandiri per tugas yang dapat dibaca secara terisolasi oleh subagent:
- **Fase 1 (Data & Ingestion):**
  - [M1.1.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M1.1.md): Schema & SQLite DB Init
  - [M1.2.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M1.2.md): Filesystem Scanner Engine
  - [M1.3.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M1.3.md): FFprobe Metadata Extractor
- **Fase 2 (Channel & Timeline):**
  - [M2.1.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M2.1.md): Channel & Playlist CRUD Handlers
  - [M2.2.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M2.2.md): Linear Timeline Calculator (Wall-Clock)
  - [M2.3.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M2.3.md): Filler & Interstitial Inserter
- **Fase 3 (Streaming Engine):**
  - [M3.1.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M3.1.md): FFmpeg Process Controller & HLS Segmenter
  - [M3.2.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M3.2.md): Session & Idle Reaper (60s Timeout)
  - [M3.3.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M3.3.md): Stream Pipeline Optimizer (Codec Copy vs Transcode)
- **Fase 4 (UI & Feed Exporter):**
  - [M4.1.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M4.1.md): Web Dashboard UI (Vanilla JS)
  - [M4.2.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M4.2.md): Embedded Web Player (HLS.js)
  - [M4.3.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M4.3.md): IPTV M3U & XMLTV EPG Generator
- **Fase 5 (Deployment):**
  - [M5.1.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M5.1.md): Multi-Stage Dockerfile (Alpine + FFmpeg)
  - [M5.2.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M5.2.md): Docker Compose & Tmpfs Setup
