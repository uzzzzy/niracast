@AGENTS.md

## Git workflow
- Every git-related action (init, add, commit, branch, merge, tag, push, remote setup, and similar) must be performed by the `agy` CLI, not directly by Claude.
- Run it as `agy -p "<self-contained prompt>" --mode accept-edits --model gemini-3.8-flash-high --print-timeout 300s --output-format text`.
- Claude only verifies the result afterwards with read-only git commands (`git status`, `git log`, `git show`).
- Push or adding a remote still requires the user's explicit consent first.
- Commit messages are written solely by `agy`. Claude must not supply, suggest, or dictate any commit message text (subject, body, or trailers) in the prompt; only tell agy to commit and let it inspect the diff and compose the message itself.

## Analysis and context reading
- For every analysis task or any work that requires reading project context (code review, codebase exploration, log or diff reading, research), use `agy` as the worker: `agy -p "<self-contained prompt>" --mode plan --model gemini-3.8-flash-high --print-timeout 300s --output-format text`.
- Claude reads only agy's summary, then spot-checks the key claims itself (e.g. open the cited `file:line`) before relying on them.
- Use the `--mode plan` (read-only) so analysis never edits files.

## agy model fallback
- If an `agy` run fails with a quota or rate-limit error (e.g. `RESOURCE_EXHAUSTED` / 429 "Individual quota reached"), switch to another model from `agy models` and re-run; do not wait for the quota reset. Order: `claude-sonnet-4-6` -> `gemini-3.8-flash-high` -> `gemini-3.8-flash-medium` -> `gpt-oss-120b-medium`.
- Check `agy`'s stderr and the end of its output for `AGY_ERROR` after every run, since a quota stop can end with exit code 0.
