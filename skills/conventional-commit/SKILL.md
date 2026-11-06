---
name: conventional-commit
description: Write a Conventional Commits message for the staged changes. Use when the user asks to commit, write a commit message, or summarize staged changes for git.
tags: [git, writing]
---

# Conventional Commit

Write a commit message that follows [Conventional Commits 1.0](https://www.conventionalcommits.org/).

## Steps

1. Run `git diff --staged --stat` and `git diff --staged` to see what is staged. If nothing is staged, say so and stop.
2. Pick the **type** that best fits the main change:
   `feat` · `fix` · `docs` · `style` · `refactor` · `perf` · `test` · `build` · `ci` · `chore` · `revert`
3. Pick an optional **scope**: the package, module or directory most affected (e.g. `api`, `cli`, `auth`).
4. Write the message:

```
<type>(<scope>): <summary in imperative mood, ≤ 72 chars, no trailing period>

<body: what changed and why, wrapped at 72 chars — omit for trivial changes>

<footer: BREAKING CHANGE: ..., Closes #123>
```

## Rules

- Summary uses the imperative mood ("add", not "added"/"adds") and lower-case after the colon.
- One logical change per commit. If the staged diff mixes unrelated changes, suggest splitting it.
- Mark breaking changes with `!` after the type/scope **and** a `BREAKING CHANGE:` footer.
- Do not invent issue numbers. Only reference issues mentioned by the user or in branch names.
- Match the language of existing commit messages (`git log --oneline -20`).
