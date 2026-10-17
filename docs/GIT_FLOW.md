# Git Flow Specification

This repository follows a strict Git Flow branching model. Direct commits to `main` are prohibited. Force pushes are forbidden. Pushes to remote and remote configuration require explicit user consent.

## Branch Strategy

### Long-Lived Branches
- **`main`**: Always releasable, production-ready code. Tagged releases only (`vX.Y.Z`). Direct commits are forbidden.
- **`develop`**: Integration branch and default working branch for active development.

### Short-Lived Branches
- **`feature/<slug>`**: New features. Branched from `develop`, merged back into `develop`.
- **`fix/<slug>`**: Bug fixes for ongoing development. Branched from `develop`, merged back into `develop`.
- **`release/vX.Y.Z`**: Preparation for a new production release. Branched from `develop`, merged into `main` (tagged `vX.Y.Z`) and back into `develop`.
- **`hotfix/<slug>`**: Urgent production fixes. Branched from `main`, merged into `main` (bump patch tag) and `develop`.

---

## Merge Rules & Quality Gates

1. **Non-Fast-Forward**: All branch merges must use `git merge --no-ff` to preserve history.
2. **Quality Gate**: Before merging into `develop` or `main`, the following checks must pass:
   ```bash
   go vet ./...
   go build ./...
   go test ./...
   ```
3. **Commit Messages**: Follow Conventional Commits format (`type(scope): subject`, imperative mood, maximum 72 characters):
   ```
   feat(stream): add idle reaper timeout
   fix(feed): resolve playlist parsing edge case
   chore(git): configure git flow hooks
   ```
4. **Remotes & Safety**:
   - Never force-push (`git push --force` or `-f`).
   - Push and remote operations require explicit user consent.

---

## Command Cheat-Sheet

Typical commands:

### 1. Feature Branch (`feature/<slug>`)
```bash
# Branch from develop
git checkout develop
git checkout -b feature/<slug>

# Work and commit
git commit -m "feat(<scope>): <subject>"

# Merge back into develop
git checkout develop
git merge --no-ff feature/<slug>
git branch -d feature/<slug>
```

### 2. Bugfix Branch (`fix/<slug>`)
```bash
# Branch from develop
git checkout develop
git checkout -b fix/<slug>

# Work and commit
git commit -m "fix(<scope>): <subject>"

# Merge back into develop
git checkout develop
git merge --no-ff fix/<slug>
git branch -d fix/<slug>
```

### 3. Release Branch (`release/vX.Y.Z`)
```bash
# Branch from develop
git checkout develop
git checkout -b release/vX.Y.Z

# Prepare release (bump version, docs, verify gates)
git commit -m "chore(release): prepare vX.Y.Z"

# Merge into main and tag
git checkout main
ALLOW_MAIN_COMMIT=1 git merge --no-ff release/vX.Y.Z
git tag -a vX.Y.Z -m "Release vX.Y.Z"

# Merge back into develop
git checkout develop
git merge --no-ff release/vX.Y.Z
git branch -d release/vX.Y.Z
```

### 4. Hotfix Branch (`hotfix/<slug>`)
```bash
# Branch from main
git checkout main
git checkout -b hotfix/<slug>

# Fix and commit
git commit -m "fix(<scope>): <subject>"

# Merge into main and tag
git checkout main
ALLOW_MAIN_COMMIT=1 git merge --no-ff hotfix/<slug>
git tag -a vX.Y.Z -m "Hotfix vX.Y.Z"

# Merge back into develop
git checkout develop
git merge --no-ff hotfix/<slug>
git branch -d hotfix/<slug>
```
