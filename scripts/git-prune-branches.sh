#!/usr/bin/env bash
# description: Delete local git branches whose upstream is gone or that are merged into the default branch.
set -euo pipefail

dry_run=1
[[ "${1:-}" == "--force" ]] && dry_run=0

git fetch --prune --quiet
default=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || echo main)
current=$(git branch --show-current)

mapfile -t gone < <(git for-each-ref --format '%(refname:short) %(upstream:track)' refs/heads | awk '$2=="[gone]"{print $1}')
mapfile -t merged < <(git branch --merged "$default" --format '%(refname:short)' | grep -vxE "$default|$current" || true)

branches=$(printf '%s\n' "${gone[@]}" "${merged[@]}" | grep -v '^$' | sort -u || true)
if [[ -z "$branches" ]]; then echo "Nothing to prune."; exit 0; fi

echo "Branches to delete:"; echo "$branches" | sed 's/^/  /'
if (( dry_run )); then echo; echo "Dry run. Re-run with --force to delete."; exit 0; fi
echo "$branches" | xargs -n1 git branch -D
