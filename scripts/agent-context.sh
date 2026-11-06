#!/usr/bin/env bash
# description: Print a compact project snapshot (tree, manifests, recent commits) to paste into any AI chat.
set -euo pipefail

root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$root"
echo "# Project: $(basename "$root")"
echo
echo "## Files"
if git rev-parse >/dev/null 2>&1; then git ls-files | head -200; else find . -type f -not -path '*/.*' | head -200; fi
for f in package.json pyproject.toml Cargo.toml go.mod README.md AGENTS.md CLAUDE.md; do
  [[ -f "$f" ]] || continue
  echo; echo "## $f"; echo '```'; head -80 "$f"; echo '```'
done
if git rev-parse >/dev/null 2>&1; then echo; echo "## Recent commits"; git log --oneline -15; fi
