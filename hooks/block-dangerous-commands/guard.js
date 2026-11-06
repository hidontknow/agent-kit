#!/usr/bin/env node
'use strict';
/**
 * Shell command guard for Claude Code (PreToolUse/Bash) and Cursor (beforeShellExecution).
 *   Claude Code: reads {tool_input:{command}} on stdin, exit 2 + stderr blocks the call.
 *   Cursor:      reads {command} on stdin, prints {permission:"deny"|"allow", ...} on stdout.
 * Extra patterns: AGENT_KIT_GUARD_EXTRA="regex1;;regex2"
 */
const RULES = [
  [/\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|--recursive\s+--force|--force\s+--recursive)[a-zA-Z]*\s+(\/|~|\$HOME|\/\*|~\/\*?)(\s|$)/, 'recursive delete of / or home'],
  [/\bgit\s+push\b.*\s(--force|-f|--force-with-lease)\b.*\b(main|master)\b/, 'force push to main/master'],
  [/\bgit\s+push\b.*\b(main|master)\b.*\s(--force|-f)\b/, 'force push to main/master'],
  [/\bgit\s+reset\s+--hard\s+origin\//, 'hard reset to remote (discards local work)'],
  [/\bmkfs(\.\w+)?\b/, 'formatting a filesystem'],
  [/\bdd\b.*\bof=\/dev\/(sd|nvme|disk|hd)/, 'writing raw to a disk device'],
  [/:\(\)\s*\{\s*:\|:&\s*\};:/, 'fork bomb'],
  [/\bchmod\s+-R\s+777\s+\/(\s|$)/, 'chmod 777 on /'],
  [/\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b/, 'piping a download straight into a shell'],
  [/>\s*\/dev\/(sd|nvme|disk)\w*/, 'redirecting into a disk device'],
];

const extra = (process.env.AGENT_KIT_GUARD_EXTRA || '').split(';;').filter(Boolean).map((r) => [new RegExp(r), `custom rule ${r}`]);
const format = (process.argv.indexOf('--format') > -1 && process.argv[process.argv.indexOf('--format') + 1]) || 'claude';

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let data = {};
  try { data = JSON.parse(input || '{}'); } catch { /* not JSON: allow */ }
  const command = (data.tool_input && data.tool_input.command) || data.command || '';
  const hit = [...RULES, ...extra].find(([re]) => re.test(command));
  if (format === 'cursor') {
    process.stdout.write(JSON.stringify(hit
      ? { permission: 'deny', userMessage: `Blocked by agent-kit guard: ${hit[1]}`, agentMessage: `This command was blocked (${hit[1]}). Use a safer alternative or ask the user to run it.` }
      : { permission: 'allow' }));
    process.exit(0);
  }
  if (hit) {
    process.stderr.write(`Blocked by agent-kit guard: ${hit[1]}. Use a safer alternative or ask the user to run it manually.\n`);
    process.exit(2);
  }
  process.exit(0);
});
