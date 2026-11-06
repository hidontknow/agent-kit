#!/usr/bin/env node
'use strict';
// Reads the event JSON from stdin. Exit 0 = continue; (Claude Code) exit 2 + stderr = block / feed back to the agent.
let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  const event = JSON.parse(input || '{}');
  // TODO: inspect `event` and act
  void event;
  process.exit(0);
});
