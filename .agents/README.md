# Agent Workspace (`.agents/`)

Shared memory and task coordination directory for autonomous and human agents working on `tv-stream`.

## Directory Map

- `README.md` — Workspace purpose, layout, and operating protocol.
- `memory/` — Cross-agent shared knowledge base and project context.
  - `INDEX.md` — Quick routing map to memory files.
  - `project.md` — Project goal, technology stack, environment variables, and run commands.
  - `architecture.md` — Package map, component flows, and Docker setup.
  - `decisions.md` — Architectural and design decisions.
  - `conventions.md` — Development conventions, quality gates, and repository hygiene.
  - `known-gaps.md` — Documented limitations, technical debt, and missing features.
  - `log.md` — Chronological append-only session history.
- `tasks/` — Task specifications and progress board.
  - `TEMPLATE.md` — Standard task template for single-agent tasks.
  - `BOARD.md` — Active task tracker and historical reference.

## Protocol

1. **Orientation**: Always read `AGENTS.md` and `.agents/memory/INDEX.md` first.
2. **Session Logging**: Append a dated entry to `.agents/memory/log.md` at the end of every work session.
3. **Fact Maintenance**: Update the relevant topic files in `.agents/memory/` whenever facts change.
4. **Task Isolation**: Tasks live in `.agents/tasks/` as one self-contained file each (copy `TEMPLATE.md`). Workers read only their assigned task file.
5. **Strict Verification**: A task is DONE only after its verification command passes. Never record unverified claims.
