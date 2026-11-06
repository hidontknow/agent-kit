---
name: changelog
description: Update CHANGELOG.md from git history in Keep a Changelog format. Use when preparing a release or when asked to update the changelog.
---

# Changelog

1. Find the last release tag: `git describe --tags --abbrev=0` (if none, use the first commit).
2. Collect commits since then: `git log <tag>..HEAD --no-merges --pretty='%s (%h)'`.
3. Group into **Added / Changed / Deprecated / Removed / Fixed / Security** (map Conventional Commit types:
   feat→Added, fix→Fixed, perf/refactor→Changed, `!`/BREAKING→Changed with a **BREAKING** prefix).
4. Write user-facing entries (what changed for users, not implementation detail). Drop chore/ci/test noise.
5. Insert under `## [Unreleased]` in CHANGELOG.md (create the file with the standard header if missing).
