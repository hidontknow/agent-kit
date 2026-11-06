---
description: Detect the project's test runner, run the tests and summarize failures.
argument-hint: [test filter]
---

Run the project's tests, filtered by `$ARGUMENTS` if given.

1. Detect the runner from the repo (package.json scripts, pytest.ini/pyproject, go.mod, Cargo.toml, Makefile).
2. Run it. On failure, group failures by root cause and show the key assertion / stack line for each.
3. Suggest the most likely fix for each group. Do not modify code unless asked.
