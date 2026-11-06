---
name: readme-writer
description: Draft or improve a project README by inspecting the repository. Use when the user asks to write, rewrite, or improve a README or project documentation landing page.
tags: [docs, writing]
---

# README Writer

Produce a README that lets a newcomer understand, install and use the project in five minutes.

## Process

1. **Inspect, don't guess.** Read the package manifest (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`…),
   entry points, existing docs, CI config and `LICENSE`. Note the real install and run commands.
2. **Choose sections** from [references/sections.md](references/sections.md). Keep only those the project needs.
3. **Write** in the language of the existing docs. Prefer short paragraphs, runnable code blocks and tables.
4. **Verify** every command you document exists (script names, CLI flags, file paths).

## Style

- First line: project name + one-sentence value proposition.
- Show the quickest path to a working result before any detail.
- No badges or sections with placeholder content ("TODO", "coming soon").
- Link to deeper docs instead of duplicating them.
