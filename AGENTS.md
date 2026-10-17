# Agent Guide (`AGENTS.md`)

## Project Overview
`tv-stream` is an automated 24/7 linear TV broadcast stream server ("mulai otomatis") built with Go 1.27, SQLite, and FFmpeg, delivering continuous HLS streams with on-demand transcoding.

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

## Git Flow
This repository follows Git Flow (`main`, `develop`, `feature/*`, `fix/*`, `release/*`, `hotfix/*`). See [docs/GIT_FLOW.md](docs/GIT_FLOW.md).
Run `git config core.hooksPath .githooks` after cloning to activate pre-commit quality gates.

## Work Logging Rule
Append a dated summary of completed changes to `.agents/memory/log.md` at the conclusion of every work session.
