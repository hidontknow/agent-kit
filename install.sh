#!/usr/bin/env bash
# One-line installer: clones (or updates) agent-kit and links the `agent-kit` CLI into ~/.local/bin.
#   curl -fsSL https://raw.githubusercontent.com/hidontknow/agent-kit/main/install.sh | bash
set -euo pipefail

REPO="${AGENT_KIT_REPO_URL:-https://github.com/hidontknow/agent-kit.git}"
DIR="${AGENT_KIT_DIR:-$HOME/.agent-kit/repo}"
BIN="${AGENT_KIT_BIN:-$HOME/.local/bin}"

command -v git >/dev/null || { echo "git is required" >&2; exit 1; }
command -v node >/dev/null || { echo "Node.js >= 18 is required" >&2; exit 1; }

if [[ -d "$DIR/.git" ]]; then
  git -C "$DIR" pull --ff-only --quiet
else
  mkdir -p "$(dirname "$DIR")"
  git clone --depth 1 --quiet "$REPO" "$DIR"
fi

mkdir -p "$BIN"
ln -sf "$DIR/bin/agent-kit.js" "$BIN/agent-kit"
chmod +x "$DIR/bin/agent-kit.js"

echo "agent-kit installed → $BIN/agent-kit"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "Add $BIN to your PATH:  export PATH=\"$BIN:\$PATH\"";; esac
echo "Try:  agent-kit list   |   agent-kit targets"
