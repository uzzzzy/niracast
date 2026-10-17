# Contributing to Niracast

Thanks for helping out!

## Setup
```bash
git clone https://github.com/uzzzzy/niracast.git
cd niracast
git config core.hooksPath .githooks   # pre-commit quality gates
cd web/app && pnpm install
```
Requirements: Go 1.27, Node 22 + pnpm, FFmpeg (or just use Docker).

## Workflow
We use Git Flow (see `docs/GIT_FLOW.md`): branch from `develop` as
`feature/<slug>` or `fix/<slug>` and open a pull request against `develop`.
Commit messages follow Conventional Commits (`feat(scope): subject`).

## Quality gates
```bash
go vet ./... && go test ./...
cd web/app && pnpm check && pnpm typecheck && pnpm test && pnpm build
```
CI runs the same checks. Add tests for new behavior.

## Reporting security issues
See `SECURITY.md`.
