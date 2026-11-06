---
description: Review the current changes (staged, unstaged or last commit) and report issues by severity.
argument-hint: [path or git range]
---

Review the changes in $ARGUMENTS (or the working tree if empty).

Use `git diff --staged`, `git diff` or `git diff HEAD~1` (first non-empty) unless a path or range is given.
Report **Must fix / Should fix / Nit** with `file:line` and a concrete fix. Skip empty groups; no praise.
