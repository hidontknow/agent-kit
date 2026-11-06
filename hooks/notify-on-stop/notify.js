#!/usr/bin/env node
'use strict';
/** Cross-platform desktop notification. Never fails the agent: always exits 0. */
const { spawn } = require('child_process');

const title = 'agent-kit';
let message = process.argv[2] || 'Agent finished';
let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input || '{}');
    if (data.message) message = data.message;
  } catch { /* ignore */ }
  const esc = (s) => s.replace(/["\\]/g, '\\$&');
  let cmd; let args;
  if (process.platform === 'darwin') {
    cmd = 'osascript'; args = ['-e', `display notification "${esc(message)}" with title "${title}"`];
  } else if (process.platform === 'win32') {
    cmd = 'powershell';
    args = ['-NoProfile', '-Command', `[reflection.assembly]::loadwithpartialname('System.Windows.Forms') | Out-Null; $n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.Visible = $true; $n.ShowBalloonTip(5000, '${title}', '${message.replace(/'/g, "''")}', 'Info')`];
  } else {
    cmd = 'notify-send'; args = [title, message];
  }
  try {
    const p = spawn(cmd, args, { stdio: 'ignore', detached: true });
    p.on('error', () => process.stdout.write('\x07'));
    p.unref();
  } catch { /* ignore */ }
  setTimeout(() => process.exit(0), 50);
});
