# Niracast

Self-hosted **24/7 linear TV channel server**. Point it at a folder of videos,
build channels with looping playlists or weekly schedules, and Niracast
broadcasts them continuously as HLS, with an IPTV playlist (M3U), XMLTV EPG,
a web viewer, and an admin CMS.

*Niracast comes from the Sanskrit "nirantara" (without pause) plus "cast".*

## Features
- Continuous HLS playout powered by FFmpeg, started on demand and stopped when nobody watches (idle reaper); h264/aac sources are stream-copied, others transcoded
- Channel modes: **loop** (playlist repeats) and **scheduled** (daily/weekly slots with overlap validation, timezone aware)
- Branded slate stream for empty playlists and schedule gaps
- IPTV feeds: `/iptv/channels.m3u` and `/iptv/epg.xml`
- Viewer UI (`/watch/{id}`) with now/next guide, keyboard, Smart TV remote and touch support
- Admin CMS: channels, playlists, schedule planner, media library, live monitor, privacy-preserving analytics
- Single Go binary with embedded React SPA; SQLite (pure Go, no CGO)
- English and Indonesian UI

## Quickstart (Docker)
```bash
git clone https://github.com/uzzzzy/niracast.git
cd niracast
cp .env.example .env        # set ADMIN_PASSWORD, SESSION_SECRET, MEDIA_PATH
docker compose up -d --build
```
Open <http://localhost:8080>. Drop `.mp4`, `.mkv` or `.mov` files into `MEDIA_PATH`;
the library rescans every 5 minutes (or press rescan in the admin).
If `ADMIN_PASSWORD` is empty a random password is printed once in the logs
(`docker compose logs`).

## Configuration
| Variable | Default | Description |
|---|---|---|
| `PORT` (compose) | `8080` | Host port |
| `MEDIA_PATH` (compose) | `./media` | Host folder mounted read-only at `/media` |
| `ADMIN_PASSWORD` | random, logged once | Admin password |
| `SESSION_SECRET` | random per process | HMAC key for session cookies |
| `TIMEZONE` | `UTC` in compose (`Asia/Jakarta` if unset in the binary) | Schedule timezone (IANA name) |
| `DB_PATH` | `/data/niracast.db` | SQLite file |
| `MEDIA_DIR`, `TRANSCODE_DIR` | `/media`, `/transcode` | Source and HLS output dirs |
| `IDLE_IMAGE`, `IDLE_CLIP` | bundled card, `/data/idle/idle.mp4` | Slate image and generated clip |
| `FFMPEG_PATH` | `ffmpeg` | Override binary |

## Development
```bash
go vet ./... && go test ./...
cd web/app && pnpm install && pnpm dev      # Vite dev server
cd web/app && pnpm check && pnpm typecheck && pnpm test && pnpm build
```
Requires Go 1.27, Node 22 + pnpm, FFmpeg. See [CONTRIBUTING.md](CONTRIBUTING.md),
[docs/API.md](docs/API.md), [docs/DESIGN.md](docs/DESIGN.md) and [docs/ROADMAP.md](docs/ROADMAP.md).

## Disclaimer
Niracast is software only and does not provide or host media. You are
responsible for the rights to everything you broadcast. See [NOTICE.md](NOTICE.md)
for third-party licenses (including FFmpeg, GPL, in the Docker image).

## License
[MIT](LICENSE)
