'use strict';
const others = require('./others');

const TARGETS = [
  require('./claude-code'),
  require('./claude-desktop'),
  require('./codex'),
  require('./cursor'),
  others.windsurf,
  others.gemini,
  others.gpt,
];

const ALIASES = {
  claude: 'claude-code', cc: 'claude-code', 'claude-code': 'claude-code',
  desktop: 'claude-desktop', 'claude-desktop': 'claude-desktop', 'claude-ai': 'claude-desktop',
  codex: 'codex', openai: 'codex',
  cursor: 'cursor', windsurf: 'windsurf', gemini: 'gemini', 'gemini-cli': 'gemini',
  gpt: 'gpt', chatgpt: 'gpt',
};

function getTarget(id) {
  const t = TARGETS.find((x) => x.id === (ALIASES[id] || id));
  if (!t) throw new Error(`Unknown target "${id}". Known: ${TARGETS.map((x) => x.id).join(', ')}`);
  return t;
}

/** "claude-code,codex" | "all" (supported+detected) | "detected" */
function resolveTargets(spec) {
  if (!spec || spec === 'detected') {
    const found = TARGETS.filter((t) => t.detect());
    if (!found.length) throw new Error('No supported tool detected. Pass --target <id>.');
    return found;
  }
  if (spec === 'all') return TARGETS.filter((t) => t.id !== 'gpt');
  return [...new Set(spec.split(',').map((s) => s.trim()).filter(Boolean))].map(getTarget);
}

module.exports = { TARGETS, getTarget, resolveTargets };
