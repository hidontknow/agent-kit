---
name: explain
description: Explain how a file, function or feature works, with a short walkthrough.
argument-hint: <file | symbol | question>
tags: [learning]
---

Explain **$ARGUMENTS** in this codebase.

1. Locate the relevant code (search for the symbol / file / feature).
2. Give a 2–3 sentence overview of what it does and why it exists.
3. Walk through the main flow step by step, citing `file:line`.
4. Point out non-obvious behavior: edge cases, side effects, performance or concurrency concerns.
5. End with where to look next if the reader wants to change it.

Keep it concise; prefer a short diagram or list over long prose.
