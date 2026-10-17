# Development Conventions

- **Code Style & Dependencies**: Standard library first. Avoid external dependencies unless strictly necessary.
- **Testing**:
  - Keep test files located right next to the code under test (`*_test.go`).
  - Always run verification gates before claiming done:
    ```bash
    go test ./...
    go vet ./...
    ```
  - Never claim a task or change is done without executing and passing the verification gate.
- **Git Hygiene**:
  - `media/`, `data/`, `.env`, `*.db`, and `*.exe` are git-ignored.
  - Commits are made via git on branch `main`.
  - Never push to remote or configure remote sync without explicit user consent.
- **Language Policy**:
  - Code, identifiers, comments, and documentation must be written in English (short natural Indonesian notes allowed where appropriate).
  - User interaction language is Indonesian.
