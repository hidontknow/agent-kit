---
name: fix-issue
description: Investigate and fix a GitHub issue end to end — reproduce, fix, test.
argument-hint: <issue number or URL>
tags: [github, workflow]
---

Fix GitHub issue $ARGUMENTS.

1. Read the issue (use `gh issue view` or the GitHub MCP tools) and restate the problem in one sentence.
2. Find the relevant code and reproduce the problem (write a failing test if feasible).
3. Implement the smallest correct fix.
4. Run the project's tests, linters and type checks; fix anything you broke.
5. Summarize: root cause, the change, and how it was verified. Do not commit unless asked.
