# Orchestrator Master Plan & DAG Matrix

Dokumen kendali orkestrasi untuk eksekusi paralel multi-agent dengan konsumsi token minimal. Setiap subagent hanya membaca satu file tugas terisolasi di `.agents/tasks/`.

---

## 1. Aturan Protokol Orkestrasi
1. **Isolated Context:** Subagent worker hanya diberikan link file tugas yang bersangkutan (misal: `.agents/tasks/M1.1.md`). Dilarang memuat seluruh rencana proyek.
2. **Parallel Dispatch:** Tugas dalam **Parallel Group** yang sama dapat dijalankan serentak oleh subagent berbeda jika seluruh **Prerequisites** berstatus `[x] DONE`.
3. **K-Threshold Gate:** Tugas hanya boleh ditandai `[x] DONE` setelah menjalankan perintah verifikasi yang tertulis di file tugas dan memperoleh hasil sukses.
4. **Red-Flag Abort:** Jika subagent melaporkan kondisi red-flag, hentikan tugas, kembalikan status ke `[ ] TODO`, dan lakukan isolasi kode.

---

## 2. DAG Task Matrix

| Task ID | Task Spec File | Scope / Target | Parallel Group | Prerequisites | Status |
| :--- | :--- | :--- | :---: | :--- | :---: |
| **M1.1** | [M1.1.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M1.1.md) | SQLite Schema & DB Init | G0 | - | `[x] DONE` |
| **M1.2** | [M1.2.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M1.2.md) | Filesystem Video Scanner | G1 | M1.1 | `[x] DONE` |
| **M2.1** | [M2.1.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M2.1.md) | Channel & Playlist CRUD | G1 | M1.1 | `[x] DONE` |
| **M5.1** | [M5.1.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M5.1.md) | Multi-Stage Dockerfile | G1 | - | `[x] DONE` |
| **M1.3** | [M1.3.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M1.3.md) | FFprobe Metadata Extractor | G2 | M1.2 | `[x] DONE` |
| **M2.2** | [M2.2.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M2.2.md) | Linear Timeline Calculator | G2 | M2.1 | `[x] DONE` |
| **M4.1** | [M4.1.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M4.1.md) | Web Dashboard UI (HTML/JS) | G2 | M2.1 | `[x] DONE` |
| **M2.3** | [M2.3.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M2.3.md) | Filler/Interstitial Inserter | G3 | M2.2 | `[x] DONE` |
| **M3.1** | [M3.1.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M3.1.md) | FFmpeg Playout & Segmenter | G3 | M2.2 | `[x] DONE` |
| **M4.3** | [M4.3.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M4.3.md) | M3U & XMLTV EPG Generator | G3 | M2.1, M2.2 | `[x] DONE` |
| **M3.2** | [M3.2.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M3.2.md) | Session & Idle Reaper | G4 | M3.1 | `[x] DONE` |
| **M3.3** | [M3.3.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M3.3.md) | Stream Pipeline Optimizer | G4 | M3.1 | `[x] DONE` |
| **M4.2** | [M4.2.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M4.2.md) | Embedded HLS.js Player | G4 | M3.1, M4.1 | `[x] DONE` |
| **M5.2** | [M5.2.md](file:///n:/devenv/.collection/tv-stream/.agents/tasks/M5.2.md) | Compose & Tmpfs Integration | G5 | M5.1, M3.2 | `[x] DONE` |

---

## 3. Status Eksekusi Terkini
- **Grup Aktif:** `G0`
- **Tugas Siap Eksekusi (Ready to Dispatch):**
  - `M1.1` (Foundation Database)
- **Tugas Terblokir (Blocked):** M1.2 s/d M5.2 (menunggu prasyarat selesai).
