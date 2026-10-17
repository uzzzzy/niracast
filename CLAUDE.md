@AGENTS.md

## Git workflow
- Every git-related action (init, add, commit, branch, merge, tag, push, remote setup, and similar) must be performed by the `agy` CLI, not directly by Claude.
- Run it as `agy -p "<self-contained prompt>" --mode accept-edits --model gemini-3.8-flash-high --print-timeout 300s --output-format text`.
- Claude only verifies the result afterwards with read-only git commands (`git status`, `git log`, `git show`).
- Push or adding a remote still requires the user's explicit consent first.
