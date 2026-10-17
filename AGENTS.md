# Agent Guide (`AGENTS.md`)

## Project Overview
`niracast` is an automated 24/7 linear TV broadcast stream server ("mulai otomatis") built with Go 1.27, SQLite, and FFmpeg, delivering continuous HLS streams with on-demand transcoding.

## Orientation
Always read these first before starting any task:
1. `.agents/README.md`
2. `.agents/memory/INDEX.md`

## 5 Key Commands
```bash
docker compose up -d --build   # Build and run server in background
docker compose down            # Stop running containers
docker compose logs -f         # Follow container logs
go test ./...                  # Run all unit and integration tests
go vet ./...                   # Run code vetting and static checks
```

### Frontend Commands
```bash
cd web/app && pnpm install     # Install frontend dependencies
cd web/app && pnpm dev         # Run Vite dev server
cd web/app && pnpm check       # Run Biome lint & format check
cd web/app && pnpm typecheck   # Run TypeScript type check
cd web/app && pnpm test        # Run Vitest unit tests
cd web/app && pnpm build       # Build production SPA bundle
```

## Environment Variables
- `ADMIN_PASSWORD`: Admin authentication password (empty = random password logged once on startup).
- `SESSION_SECRET`: Secret key for HMAC cookie signing (empty = random per process, sessions reset on restart).
- `TIMEZONE`: Server timezone for scheduled broadcasting (default `Asia/Jakarta`).

## Git Flow
This repository follows Git Flow (`main`, `develop`, `feature/*`, `fix/*`, `release/*`, `hotfix/*`). See [docs/GIT_FLOW.md](docs/GIT_FLOW.md).
Run `git config core.hooksPath .githooks` after cloning to activate pre-commit quality gates.

## Work Logging Rule
Append a dated summary of completed changes to `.agents/memory/log.md` at the conclusion of every work session.
