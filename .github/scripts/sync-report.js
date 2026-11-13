#!/usr/bin/env node
'use strict';
// Turns `agent-kit update --json` output into GitHub step outputs + markdown bodies.
//   node sync-report.js result.json
const fs = require('fs');

const results = JSON.parse(fs.readFileSync(process.argv[2], 'utf8') || '[]');
const changed = results.filter((r) => ['updated', 'merged', 'replaced'].includes(r.action));
const conflicts = results.filter((r) => r.action === 'conflict');
const errors = results.filter((r) => r.action === 'error' || r.action === 'removed-upstream');

const short = (sha) => (sha || '').slice(0, 7);
const link = (r) => `${r.repo}/compare/${r.from}...${r.to}`;
const row = (r) => `| \`${r.id}\` | ${r.action} | [${short(r.from)}…${short(r.to)}](${link(r)}) | ${(r.commits || []).length} |`;
const table = (list) => ['| item | result | upstream | commits |', '| --- | --- | --- | --- |', ...list.map(row)].join('\n');

const out = process.env.GITHUB_OUTPUT;
const set = (k, v) => out && fs.appendFileSync(out, `${k}=${v}\n`);
set('changed', changed.length);
set('conflicts', conflicts.length);
set('errors', errors.length);
set('conflict_ids', conflicts.map((r) => r.id).join(' '));

fs.writeFileSync('commit-msg.txt', [
  `chore(sync): update ${changed.length} upstream item(s)`,
  '',
  ...changed.map((r) => `- ${r.id}: ${short(r.from)} → ${short(r.to)} (${r.action})`),
  '',
].join('\n'));

fs.writeFileSync('conflicts.md', [
  '上游更新与本地修改冲突，需要手动处理。这个分支已经写入合并结果，冲突的位置留有 `<<<<<<< local` / `>>>>>>> upstream` 标记，二进制冲突另存为 `*.upstream`。',
  '',
  table(conflicts),
  '',
  '处理方法：在本分支上解决冲突，然后执行 `node bin/agent-kit.js build && npm run check`，提交后合并本 PR。',
  '如果想放弃本地修改，直接使用上游版本：`node bin/agent-kit.js update <item> --theirs`。',
  '',
  'PR 打开期间，每日同步不会覆盖这个分支。',
].join('\n'));

const summary = [
  '## Upstream sync',
  '',
  results.length ? table(results) : '_no collected items_',
  '',
  ...errors.map((r) => `- ⚠️ \`${r.id}\`: ${r.error || r.action}`),
  ...(errors.some((r) => r.action === 'removed-upstream')
    ? ['', '`removed-upstream`: the recorded path no longer exists upstream (moved or deleted); local copies were left untouched. If it moved, re-register it with `agent-kit add <new GitHub URL> --force`; if it was deleted, `agent-kit untrack <item>`.']
    : []),
].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
console.log(summary);
