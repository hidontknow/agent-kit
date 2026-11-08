'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'agent-kit.js');

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-kit-test-'));
  const env = {
    ...process.env,
    AGENT_KIT_HOME_OVERRIDE: path.join(dir, 'home'),
    AGENT_KIT_STATE_DIR: path.join(dir, 'home', '.agent-kit'),
    AGENT_KIT_BIN: path.join(dir, 'home', 'bin'),
    CLAUDE_DESKTOP_CONFIG_DIR: path.join(dir, 'home', 'desktop'),
    NO_COLOR: '1',
    GITHUB_PERSONAL_ACCESS_TOKEN: 'test-token',
  };
  delete env.CLAUDE_CONFIG_DIR;
  delete env.CODEX_HOME;
  fs.mkdirSync(env.AGENT_KIT_HOME_OVERRIDE, { recursive: true });
  const run = (...args) => {
    const r = spawnSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8', cwd: dir });
    if (r.status !== 0) throw new Error(`agent-kit ${args.join(' ')} failed (${r.status}):\n${r.stdout}\n${r.stderr}`);
    return r.stdout + r.stderr;
  };
  const home = (...p) => path.join(env.AGENT_KIT_HOME_OVERRIDE, ...p);
  const read = (p) => fs.readFileSync(p, 'utf8');
  return { dir, env, run, home, read };
}

test('claude-code: install & uninstall every native type', () => {
  const s = sandbox();
  fs.writeFileSync(s.home('.claude.json'), JSON.stringify({ numStartups: 3, mcpServers: { mine: { command: 'x' } } }));
  s.run('install', 'skill/conventional-commit', 'agent/code-reviewer', 'command/explain', 'mcp/github', 'mcp/kit-tools', 'hook/block-dangerous-commands', '-t', 'claude-code');

  assert.ok(fs.existsSync(s.home('.claude/skills/conventional-commit/SKILL.md')));
  assert.ok(fs.existsSync(s.home('.claude/agents/code-reviewer.md')));
  assert.ok(fs.existsSync(s.home('.claude/commands/explain.md')));
  const cfg = JSON.parse(s.read(s.home('.claude.json')));
  assert.strictEqual(cfg.numStartups, 3, 'keeps unrelated keys');
  assert.deepStrictEqual(cfg.mcpServers.github, { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: 'Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}' } });
  assert.match(cfg.mcpServers['kit-tools'].args[0], /\.agent-kit\/mcp\/claude-code\/kit-tools\/server\.js$/);
  assert.ok(fs.existsSync(cfg.mcpServers['kit-tools'].args[0]));
  const settings = JSON.parse(s.read(s.home('.claude/settings.json')));
  assert.match(settings.hooks.PreToolUse[0].hooks[0].command, /guard\.js" --format claude$/);

  // installing twice must not duplicate hooks
  s.run('install', 'hook/block-dangerous-commands', '-t', 'claude-code');
  assert.strictEqual(JSON.parse(s.read(s.home('.claude/settings.json'))).hooks.PreToolUse.length, 1);

  assert.match(s.run('list', '--installed'), /skill\/conventional-commit/);
  s.run('uninstall', 'conventional-commit', 'code-reviewer', 'explain', 'github', 'kit-tools', 'block-dangerous-commands', '-t', 'claude-code');
  assert.ok(!fs.existsSync(s.home('.claude/skills/conventional-commit')));
  const after = JSON.parse(s.read(s.home('.claude.json')));
  assert.deepStrictEqual(after.mcpServers, { mine: { command: 'x' } });
  assert.deepStrictEqual(JSON.parse(s.read(s.home('.claude/settings.json'))), {});
});

test('claude-code project scope writes .claude/ and .mcp.json in the project', () => {
  const s = sandbox();
  const proj = path.join(s.dir, 'proj');
  fs.mkdirSync(proj);
  s.run('install', 'skill/readme-writer', 'mcp/context7', '-t', 'claude-code', '--project', proj);
  assert.ok(fs.existsSync(path.join(proj, '.claude/skills/readme-writer/references/sections.md')));
  assert.strictEqual(JSON.parse(s.read(path.join(proj, '.mcp.json'))).mcpServers.context7.command, 'npx');
});

test('codex: toml blocks, prompts, skills; uninstall keeps user config', () => {
  const s = sandbox();
  fs.mkdirSync(s.home('.codex'), { recursive: true });
  fs.writeFileSync(s.home('.codex/config.toml'), 'model = "gpt-5"\n');
  s.run('install', 'mcp/github', 'mcp/context7', 'skill/conventional-commit', 'command/fix-issue', 'agent/debugger', '-t', 'codex');
  const toml = s.read(s.home('.codex/config.toml'));
  assert.match(toml, /^model = "gpt-5"/);
  assert.match(toml, /\[mcp_servers\.github\]\nurl = "https:\/\/api\.githubcopilot\.com\/mcp\/"\nbearer_token_env_var = "GITHUB_PERSONAL_ACCESS_TOKEN"/);
  assert.match(toml, /\[mcp_servers\.context7\]\ncommand = "npx"\nargs = \["-y", "@upstash\/context7-mcp@latest"\]/);
  assert.ok(fs.existsSync(s.home('.codex/skills/conventional-commit/SKILL.md')));
  assert.match(s.read(s.home('.codex/prompts/fix-issue.md')), /\$ARGUMENTS/);
  assert.match(s.read(s.home('.codex/prompts/debugger.md')), /"debugger" agent/);
  s.run('uninstall', 'github', 'context7', '-t', 'codex');
  assert.strictEqual(s.read(s.home('.codex/config.toml')).trim(), 'model = "gpt-5"');
});

test('cursor: mcp env refs, hooks, project rules', () => {
  const s = sandbox();
  const proj = path.join(s.dir, 'proj');
  fs.mkdirSync(proj);
  s.run('install', 'mcp/github', 'hook/block-dangerous-commands', 'command/explain', '-t', 'cursor');
  const m = JSON.parse(s.read(s.home('.cursor/mcp.json')));
  assert.strictEqual(m.mcpServers.github.headers.Authorization, 'Bearer ${env:GITHUB_PERSONAL_ACCESS_TOKEN}');
  const hooks = JSON.parse(s.read(s.home('.cursor/hooks.json')));
  assert.strictEqual(hooks.version, 1);
  assert.match(hooks.hooks.beforeShellExecution[0].command, /--format cursor/);
  assert.ok(fs.existsSync(s.home('.cursor/commands/explain.md')));

  // skills/agents are project-scoped rules; user scope is skipped, not an error
  assert.match(s.run('install', 'skill/readme-writer', '-t', 'cursor'), /skipped/);
  s.run('install', 'skill/readme-writer', 'agent/code-reviewer', '-t', 'cursor', '--project', proj);
  const rule = s.read(path.join(proj, '.cursor/rules/readme-writer.mdc'));
  assert.match(rule, /^---\ndescription: /);
  assert.match(rule, /alwaysApply: false/);
  assert.match(rule, /@\.cursor\/rules\/readme-writer\/references\/sections\.md/);
  assert.ok(fs.existsSync(path.join(proj, '.cursor/rules/code-reviewer.mdc')));
});

test('claude-desktop: resolves env vars, bridges remote servers, zips skills', () => {
  const s = sandbox();
  s.run('install', 'mcp/github', 'mcp/fetch', 'skill/conventional-commit', '-t', 'claude-desktop');
  const cfg = JSON.parse(s.read(path.join(s.env.CLAUDE_DESKTOP_CONFIG_DIR, 'claude_desktop_config.json')));
  assert.deepStrictEqual(cfg.mcpServers.github.args, ['-y', 'mcp-remote', 'https://api.githubcopilot.com/mcp/', '--header', 'Authorization:Bearer test-token']);
  assert.strictEqual(cfg.mcpServers.fetch.command, 'uvx');
  const zip = s.home('.agent-kit/dist/claude-desktop/conventional-commit.zip');
  const listing = execFileSync('unzip', ['-l', zip], { encoding: 'utf8' });
  assert.match(listing, /conventional-commit\/SKILL\.md/);
});

test('plugins expand into tools without plugin support', () => {
  const s = sandbox();
  const out = s.run('install', 'plugin/dev-essentials', '-t', 'codex,claude-code');
  assert.ok(fs.existsSync(s.home('.codex/skills/changelog/SKILL.md')));
  assert.ok(fs.existsSync(s.home('.codex/prompts/review.md')));
  assert.ok(fs.existsSync(s.home('.codex/prompts/test-writer.md')));
  assert.match(out, /claude plugin marketplace add/);
  s.run('install', 'plugin/dev-essentials', '-t', 'claude-code', '--expand');
  assert.ok(fs.existsSync(s.home('.claude/agents/test-writer.md')));
});

test('gpt export, gemini command, windsurf mcp, scripts', () => {
  const s = sandbox();
  const out = path.join(s.dir, 'gpt');
  s.run('install', 'agent/code-reviewer', 'mcp/github', '-t', 'gpt', '--out', out);
  assert.match(s.read(path.join(out, 'code-reviewer/instructions.md')), /^# code-reviewer/);
  assert.match(s.read(path.join(out, 'github.connector.md')), /api\.githubcopilot\.com/);
  assert.match(s.run('install', 'mcp/fetch', '-t', 'gpt', '--out', out), /skipped/);

  s.run('install', 'command/explain', 'mcp/context7', '-t', 'gemini');
  assert.match(s.read(s.home('.gemini/commands/explain.toml')), /\{\{args\}\}/);
  assert.ok(JSON.parse(s.read(s.home('.gemini/settings.json'))).mcpServers.context7);

  s.run('install', 'mcp/github', '-t', 'windsurf');
  assert.strictEqual(JSON.parse(s.read(s.home('.codeium/windsurf/mcp_config.json'))).mcpServers.github.serverUrl, 'https://api.githubcopilot.com/mcp/');

  s.run('install', 'script/agent-context');
  const bin = path.join(s.env.AGENT_KIT_BIN, 'agent-context');
  assert.ok(fs.statSync(bin).mode & 0o100);
});

test('dry-run changes nothing', () => {
  const s = sandbox();
  s.run('install', 'mcp/github', 'skill/conventional-commit', '-t', 'claude-code,codex', '--dry-run');
  assert.ok(!fs.existsSync(s.home('.claude.json')));
  assert.ok(!fs.existsSync(s.home('.claude')));
  assert.ok(!fs.existsSync(s.home('.codex')));
});

// ---------------------------------------------------------------- upstream sync
function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' }).trim();
}

function upstreamFixture() {
  const s = sandbox();
  const up = path.join(s.dir, 'upstream');
  fs.mkdirSync(path.join(up, 'skills/demo'), { recursive: true });
  fs.writeFileSync(path.join(up, 'skills/demo/SKILL.md'), '---\nname: demo\ndescription: Demo skill. Use for tests.\n---\n\nline 1\nline 2\nline 3\nline 4\nline 5\n');
  fs.writeFileSync(path.join(up, 'skills/demo/notes.md'), 'notes v1\n');
  git(s.dir, 'init', '-q', '-b', 'main', up);
  git(up, 'add', '.');
  git(up, 'commit', '-qm', 'init');
  // the kit repo under test
  const kit = path.join(s.dir, 'kit');
  fs.mkdirSync(kit);
  s.env.AGENT_KIT_REPO = kit;
  return { ...s, up, kit, url: `file://${up}` };
}

test('sync: add → outdated → update (clean and with 3-way merge)', () => {
  const f = upstreamFixture();
  f.run('add', f.url, '--path', 'skills/demo', '--ref', 'main');
  const skill = path.join(f.kit, 'skills/demo/SKILL.md');
  assert.ok(fs.existsSync(skill));
  const src = JSON.parse(f.read(path.join(f.kit, 'sources.json'))).items['skill/demo'];
  assert.strictEqual(src.path, 'skills/demo');
  assert.match(f.run('outdated'), /up-to-date\s+skill\/demo/);
  assert.match(f.run('list'), /demo .*\[collected\]/);

  // upstream changes line 1 and notes; clean update
  fs.writeFileSync(path.join(f.up, 'skills/demo/notes.md'), 'notes v2\n');
  git(f.up, 'commit', '-qam', 'v2');
  assert.match(f.run('outdated', '--verbose'), /update-available\s+skill\/demo[\s\S]*v2/);
  assert.match(f.run('diff', 'demo'), /\+notes v2/);
  f.run('update', 'demo');
  assert.strictEqual(f.read(path.join(f.kit, 'skills/demo/notes.md')), 'notes v2\n');
  assert.match(f.run('outdated'), /up-to-date/);

  // local edit + non-overlapping upstream edit → merged, local edit kept
  fs.writeFileSync(skill, f.read(skill).replace('line 5', 'line 5 (local)'));
  assert.match(f.run('outdated'), /local-modified/);
  fs.writeFileSync(path.join(f.up, 'skills/demo/SKILL.md'), f.read(path.join(f.up, 'skills/demo/SKILL.md')).replace('line 1', 'line 1 (upstream)'));
  fs.writeFileSync(path.join(f.up, 'skills/demo/new.md'), 'new file\n');
  git(f.up, 'add', '.');
  git(f.up, 'commit', '-qm', 'v3');
  assert.match(f.run('outdated'), /diverged/);
  f.run('update', 'demo');
  const merged = f.read(skill);
  assert.match(merged, /line 1 \(upstream\)/);
  assert.match(merged, /line 5 \(local\)/);
  assert.ok(fs.existsSync(path.join(f.kit, 'skills/demo/new.md')));
  assert.match(f.run('outdated'), /local-modified/);

  // overlapping edits → conflict markers + non-zero exit
  fs.writeFileSync(skill, f.read(skill).replace('line 3', 'line 3 local'));
  fs.writeFileSync(path.join(f.up, 'skills/demo/SKILL.md'), f.read(path.join(f.up, 'skills/demo/SKILL.md')).replace('line 3', 'line 3 upstream'));
  git(f.up, 'commit', '-qam', 'v4');
  assert.throws(() => f.run('update', 'demo'), /conflicts/);
  assert.match(f.read(skill), /<<<<<<< local[\s\S]*line 3 local[\s\S]*=======[\s\S]*line 3 upstream[\s\S]*>>>>>>> upstream/);

  // --theirs discards local edits
  f.run('update', 'demo', '--theirs');
  assert.strictEqual(f.read(skill), f.read(path.join(f.up, 'skills/demo/SKILL.md')));
  assert.match(f.run('outdated'), /up-to-date/);
});

test('sync: --exclude drops upstream files on add and on every later update', () => {
  const f = upstreamFixture();
  fs.mkdirSync(path.join(f.up, 'skills/demo/docs'));
  fs.writeFileSync(path.join(f.up, 'skills/demo/docs/guide.md'), 'guide v1\n');
  git(f.up, 'add', '.');
  git(f.up, 'commit', '-qm', 'docs');
  f.run('add', f.url, '--path', 'skills/demo', '--exclude', 'docs/,./notes.md');
  const dir = path.join(f.kit, 'skills/demo');
  assert.ok(fs.existsSync(path.join(dir, 'SKILL.md')));
  assert.ok(!fs.existsSync(path.join(dir, 'docs')));
  assert.ok(!fs.existsSync(path.join(dir, 'notes.md')));
  assert.deepStrictEqual(JSON.parse(f.read(path.join(f.kit, 'sources.json'))).items['skill/demo'].exclude, ['docs', 'notes.md']);
  assert.match(f.run('outdated'), /up-to-date/);

  // changes only in excluded paths are not updates; real changes still apply without the excluded paths
  fs.writeFileSync(path.join(f.up, 'skills/demo/docs/guide.md'), 'guide v2\n');
  git(f.up, 'commit', '-qam', 'docs v2');
  assert.match(f.run('outdated'), /up-to-date/);
  fs.writeFileSync(path.join(f.up, 'skills/demo/extra.md'), 'extra\n');
  git(f.up, 'add', '.');
  git(f.up, 'commit', '-qm', 'extra');
  f.run('update', 'demo');
  assert.ok(fs.existsSync(path.join(dir, 'extra.md')));
  assert.ok(!fs.existsSync(path.join(dir, 'docs')));
  assert.match(f.run('outdated'), /up-to-date/);
  assert.throws(() => f.run('add', f.url, '--path', 'skills/demo', '--name', 'x', '--exclude', '../y'), /inside the item/);
});

test('sync: importing a folder of skills', () => {
  const f = upstreamFixture();
  fs.mkdirSync(path.join(f.up, 'skills/other'));
  fs.writeFileSync(path.join(f.up, 'skills/other/SKILL.md'), '---\nname: other\ndescription: Other. Use for tests.\n---\n\nbody\n');
  git(f.up, 'add', '.');
  git(f.up, 'commit', '-qm', 'other');
  const out = f.run('add', f.url, '--path', 'skills');
  assert.match(out, /Found 2 items/);
  const items = JSON.parse(f.read(path.join(f.kit, 'sources.json'))).items;
  assert.deepStrictEqual(Object.keys(items).sort(), ['skill/demo', 'skill/other']);
  assert.strictEqual(items['skill/other'].path, 'skills/other');
});

test('repo content is valid and generated files are current', () => {
  const s = sandbox();
  s.run('validate');
  s.run('build', '--check');
});

test('bundles: build generates topic plugins from existing items and detects drift', () => {
  const s = sandbox();
  const kit = path.join(s.dir, 'kit');
  for (const d of ['skills', 'mcp', 'hooks']) fs.cpSync(path.join(ROOT, d), path.join(kit, d), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(kit, 'package.json'));
  fs.mkdirSync(path.join(kit, 'bundles'));
  fs.writeFileSync(path.join(kit, 'bundles/topic.json'), JSON.stringify({
    name: 'topic', description: 'Topic bundle.', include: ['skill/readme-writer', 'mcp/kit-tools', 'mcp/filesystem', 'hook/block-dangerous-commands'],
  }));
  s.env.AGENT_KIT_REPO = kit;
  s.run('build');
  const p = path.join(kit, 'plugins/topic');
  assert.ok(fs.existsSync(path.join(p, 'skills/readme-writer/references/sections.md')));
  const m = JSON.parse(s.read(path.join(p, '.mcp.json'))).mcpServers;
  assert.deepStrictEqual(m['kit-tools'].args, ['${CLAUDE_PLUGIN_ROOT}/mcp/kit-tools/server.js']);
  assert.ok(fs.existsSync(path.join(p, 'mcp/kit-tools/server.js')));
  assert.strictEqual(m.filesystem.args[2], '${HOME}', 'HOME is not baked in at build time');
  const hooks = JSON.parse(s.read(path.join(p, 'hooks/hooks.json'))).hooks;
  assert.match(hooks.PreToolUse[0].hooks[0].command, /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/block-dangerous-commands\/guard\.js/);
  const market = JSON.parse(s.read(path.join(kit, '.claude-plugin/marketplace.json')));
  assert.deepStrictEqual(market.plugins.map((x) => x.source), ['./plugins/topic']);
  s.run('build', '--check');

  // editing the source item makes the generated plugin stale
  fs.appendFileSync(path.join(kit, 'skills/readme-writer/SKILL.md'), '\nextra\n');
  assert.throws(() => s.run('build', '--check'), /out of date: plugins\/topic\//);
  s.run('build');
  assert.match(s.read(path.join(p, 'skills/readme-writer/SKILL.md')), /extra/);

  // unknown items and name clashes with hand-written plugins are rejected
  fs.writeFileSync(path.join(kit, 'bundles/bad.json'), JSON.stringify({ name: 'bad', description: 'x', include: ['skill/nope'] }));
  assert.throws(() => s.run('validate'), /bundles\/bad\.json: Not found: skill\/nope/);
  fs.rmSync(path.join(kit, 'bundles/bad.json'));

  // removing the bundle removes its generated plugin
  fs.rmSync(path.join(kit, 'bundles/topic.json'));
  s.run('build');
  assert.ok(!fs.existsSync(p));
});

test('bundles: version omitted by default (Claude Code falls back to the commit SHA), pinned when set', () => {
  const s = sandbox();
  const kit = path.join(s.dir, 'kit');
  fs.cpSync(path.join(ROOT, 'skills'), path.join(kit, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(kit, 'bundles'));
  fs.writeFileSync(path.join(kit, 'bundles/a.json'), JSON.stringify({ name: 'a', description: 'A.', include: ['skill/readme-writer'] }));
  fs.writeFileSync(path.join(kit, 'bundles/b.json'), JSON.stringify({ name: 'b', description: 'B.', version: '1.2.3', include: ['skill/readme-writer'] }));
  s.env.AGENT_KIT_REPO = kit;
  s.run('build');
  assert.ok(!('version' in JSON.parse(s.read(path.join(kit, 'plugins/a/.claude-plugin/plugin.json')))));
  assert.strictEqual(JSON.parse(s.read(path.join(kit, 'plugins/b/.claude-plugin/plugin.json'))).version, '1.2.3');
  const market = JSON.parse(s.read(path.join(kit, '.claude-plugin/marketplace.json')));
  assert.deepStrictEqual(market.plugins.map((p) => [p.name, p.version]), [['a', undefined], ['b', '1.2.3']]);
});

test('sync: update --all --skip-conflicts --json updates clean items, skips conflicts, reports errors', () => {
  const f = upstreamFixture();
  fs.mkdirSync(path.join(f.up, 'skills/other'));
  fs.writeFileSync(path.join(f.up, 'skills/other/SKILL.md'), '---\nname: other\ndescription: Other. Use for tests.\n---\n\nx\n');
  git(f.up, 'add', '.');
  git(f.up, 'commit', '-qm', 'other');
  f.run('add', f.url, '--path', 'skills');
  const demo = path.join(f.kit, 'skills/demo/SKILL.md');
  const other = path.join(f.kit, 'skills/other/SKILL.md');
  // demo: conflicting edits on both sides; other: clean upstream change
  fs.writeFileSync(demo, f.read(demo).replace('line 3', 'line 3 local'));
  fs.writeFileSync(path.join(f.up, 'skills/demo/SKILL.md'), f.read(path.join(f.up, 'skills/demo/SKILL.md')).replace('line 3', 'line 3 upstream'));
  fs.writeFileSync(path.join(f.up, 'skills/other/SKILL.md'), f.read(path.join(f.up, 'skills/other/SKILL.md')).replace('x', 'y'));
  git(f.up, 'commit', '-qam', 'change both');
  // a third item whose upstream is unreachable
  fs.mkdirSync(path.join(f.kit, 'skills/gone'));
  fs.writeFileSync(path.join(f.kit, 'skills/gone/SKILL.md'), '---\nname: gone\ndescription: Gone. Use for tests.\n---\n\nz\n');
  const srcFile = path.join(f.kit, 'sources.json');
  const sources = JSON.parse(f.read(srcFile));
  sources.items['skill/gone'] = { repo: `file://${f.dir}/missing`, path: 'x', commit: 'a'.repeat(40), hash: 'sha256:x' };
  fs.writeFileSync(srcFile, JSON.stringify(sources));

  const r = spawnSync(process.execPath, [CLI, 'update', '--all', '--skip-conflicts', '--json'], { env: f.env, encoding: 'utf8' });
  assert.strictEqual(r.status, 1, 'unreachable upstream makes the run fail');
  const results = Object.fromEntries(JSON.parse(r.stdout).map((x) => [x.id, x]));
  assert.strictEqual(results['skill/other'].action, 'updated');
  assert.strictEqual(results['skill/demo'].action, 'conflict');
  assert.deepStrictEqual(results['skill/demo'].conflicts, ['SKILL.md']);
  assert.strictEqual(results['skill/gone'].action, 'error');
  assert.match(f.read(other), /\ny\n/);
  assert.doesNotMatch(f.read(demo), /<<<<<<<|line 3 upstream/, 'conflicting item left untouched');
  const after = JSON.parse(f.read(srcFile)).items;
  assert.strictEqual(after['skill/demo'].commit, sources.items['skill/demo'].commit, 'conflicting item keeps its base');
  assert.notStrictEqual(after['skill/other'].commit, sources.items['skill/other'].commit);
});

test('cli: link-only tools install/uninstall through a package manager', () => {
  const s = sandbox();
  const stub = path.join(s.dir, 'stub');
  const logFile = path.join(s.dir, 'calls.log');
  fs.mkdirSync(stub);
  // fake `uv` that logs its arguments and "installs" the tool's binary
  fs.writeFileSync(path.join(stub, 'uv'), `#!/bin/sh\necho "uv $*" >> "${logFile}"\nif [ "$2" = install ]; then printf '#!/bin/sh\\n' > "${stub}/goofish"; chmod +x "${stub}/goofish"; else rm -f "${stub}/goofish"; fi\n`);
  fs.chmodSync(path.join(stub, 'uv'), 0o755);
  const sysPath = (process.env.PATH || '').split(path.delimiter).filter((d) => !fs.existsSync(path.join(d, 'uv')) && !fs.existsSync(path.join(d, 'pipx')) && !fs.existsSync(path.join(d, 'goofish')));
  s.env.PATH = [stub, ...sysPath].join(path.delimiter);

  const out = s.run('install', 'cli/goofish-cli');
  assert.match(out, /goofish auth login/, 'prints usage notes');
  assert.strictEqual(s.read(logFile).trim(), 'uv tool install goofish-cli');
  assert.ok(fs.existsSync(path.join(stub, 'goofish')));
  assert.ok(!fs.existsSync(path.join(ROOT, 'clis', 'goofish-cli')), 'nothing vendored');

  // already on PATH → skipped, not reinstalled
  assert.match(s.run('install', 'cli/goofish-cli'), /already on PATH/);
  assert.strictEqual(s.read(logFile).trim().split('\n').length, 1);

  s.run('uninstall', 'goofish-cli');
  assert.strictEqual(s.read(logFile).trim().split('\n')[1], 'uv tool uninstall goofish-cli');
  assert.ok(!fs.existsSync(path.join(stub, 'goofish')));

  // no package manager available → skipped with the manual commands
  s.env.PATH = sysPath.join(path.delimiter);
  const none = s.run('install', 'cli/goofish-cli', '--via', 'pipx', '--dry-run');
  assert.match(none, /would run: pipx install goofish-cli/);
});

test('cli: package names are unpinned for uninstall', () => {
  const { packageName } = require('../lib/clis');
  assert.strictEqual(packageName('uv', 'goofish-cli==0.6.3'), 'goofish-cli');
  assert.strictEqual(packageName('npm', '@scope/tool@1.2.3'), '@scope/tool');
  assert.strictEqual(packageName('npm', 'tool'), 'tool');
  assert.strictEqual(packageName('cargo', 'ripgrep@14'), 'ripgrep');
});

test('mcp: variants sharing serverName replace each other cleanly', () => {
  const s = sandbox();
  fs.mkdirSync(s.home('.codex'), { recursive: true });
  s.run('install', 'mcp/goofish', 'mcp/context7', '-t', 'claude-code,codex');
  let cfg = JSON.parse(s.read(s.home('.claude.json'))).mcpServers;
  assert.deepStrictEqual(cfg.goofish, { type: 'stdio', command: 'uvx', args: ['goofish-cli'] });

  const out = s.run('install', 'mcp/goofish-sandbox', '-t', 'claude-code,codex');
  assert.match(out, /replaced mcp\/goofish with mcp\/goofish-sandbox/);
  cfg = JSON.parse(s.read(s.home('.claude.json'))).mcpServers;
  assert.deepStrictEqual(cfg.goofish, { type: 'stdio', command: 'goofish', args: ['sandbox', 'mcp'] });
  assert.ok(!('goofish-sandbox' in cfg), 'written under the shared server name');
  assert.ok(cfg.context7, 'other servers untouched');
  const toml = s.read(s.home('.codex/config.toml'));
  assert.strictEqual(toml.match(/\[mcp_servers\.goofish\]/g).length, 1);
  assert.match(toml, /command = "goofish"\nargs = \["sandbox", "mcp"\]/);
  const installed = s.run('list', '--installed');
  assert.doesNotMatch(installed, /mcp\/goofish\s/);
  assert.match(installed, /mcp\/goofish-sandbox/);

  s.run('uninstall', 'goofish-sandbox', '-t', 'claude-code,codex');
  assert.ok(!('goofish' in JSON.parse(s.read(s.home('.claude.json'))).mcpServers));
  assert.doesNotMatch(s.read(s.home('.codex/config.toml')), /goofish/);
});

test('tool: link-only open-source tools; install optional', () => {
  const s = sandbox();
  // no automated install → skipped with the download link and notes
  const out = s.run('install', 'tool/craft-anything');
  assert.match(out, /skipped — no automated install — get it from https:\/\/github\.com\/storytold\/craft-anything\/releases\/latest/);
  assert.match(out, /craft-anything-cli mcp/);
  assert.match(s.run('list', 'tools'), /craft-anything/);
  assert.match(s.run('info', 'tool/craft-anything'), /license:\s+MIT OR Apache-2\.0/);

  // a tool that declares install (with custom args) goes through the package manager
  const kit = path.join(s.dir, 'kit');
  fs.mkdirSync(path.join(kit, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(kit, 'tools/demo.json'), JSON.stringify({
    name: 'demo', description: 'Demo.', repo: 'https://example.com/demo', bin: 'demo-bin-not-installed',
    install: [{ manager: 'cargo', package: 'demo', args: ['--git', 'https://example.com/demo', 'demo', '--locked'] }],
  }));
  s.env.AGENT_KIT_REPO = kit;
  s.run('validate');
  assert.match(s.run('install', 'tool/demo', '--via', 'cargo', '--dry-run'), /would run: cargo install --git https:\/\/example\.com\/demo demo --locked/);
  fs.writeFileSync(path.join(kit, 'tools/demo.json'), JSON.stringify({ name: 'demo', description: 'Demo.', repo: 'not-a-url', category: 'thing' }));
  assert.throws(() => s.run('validate'), /"repo" must be an http\(s\) URL[\s\S]*"category" must be one of/);
});

test('mcp: craft-anything matches the upstream setup entry', () => {
  const s = sandbox();
  fs.mkdirSync(s.home('.codex'), { recursive: true });
  const out = s.run('install', 'mcp/craft-anything', '-t', 'claude-code,codex');
  assert.deepStrictEqual(JSON.parse(s.read(s.home('.claude.json'))).mcpServers['craft-anything'], { type: 'stdio', command: 'craft-anything-cli', args: ['mcp'] });
  assert.match(s.read(s.home('.codex/config.toml')), /\[mcp_servers\.craft-anything\]\ncommand = "craft-anything-cli"\nargs = \["mcp"\]\nstartup_timeout_sec = 30/);
  assert.match(out, /--allow-run/);
  assert.throws(() => s.run('info', 'craft-anything'), /Ambiguous name "craft-anything"/);
});

test('resource: link-only, never installed, validated kinds', () => {
  const s = sandbox();
  const out = s.run('install', 'resource/polyfork');
  assert.match(out, /skipped — a resource, nothing to install — use it from https:\/\/polyfork\.dev\/assets/);
  assert.match(out, /npx polyfork add/);
  assert.match(s.run('list', 'resources'), /polyfork/);
  assert.match(s.run('info', 'polyfork'), /kind:\s+assets[\s\S]*api:\s+https:\/\/polyfork\.dev\/llms\.txt/);

  const kit = path.join(s.dir, 'kit');
  fs.mkdirSync(path.join(kit, 'resources'), { recursive: true });
  fs.writeFileSync(path.join(kit, 'resources/bad.json'), JSON.stringify({
    name: 'bad', description: 'x', homepage: 'https://example.com', kind: 'stuff', install: [{ manager: 'npm', package: 'x' }],
  }));
  s.env.AGENT_KIT_REPO = kit;
  assert.throws(() => s.run('validate'), /"kind" must be one of[\s\S]*resources have no "install"/);
});

test('tool with claudePlugin is listed in the marketplace with a GitHub source', () => {
  const s = sandbox();
  const kit = path.join(s.dir, 'kit');
  fs.mkdirSync(path.join(kit, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(kit, 'tools/ext.json'), JSON.stringify({
    name: 'ext', description: 'External plugin.', repo: 'https://github.com/o/ext', category: 'skills', claudePlugin: { repo: 'o/ext', ref: 'v1' },
  }));
  s.env.AGENT_KIT_REPO = kit;
  s.run('build');
  const market = JSON.parse(s.read(path.join(kit, '.claude-plugin/marketplace.json')));
  assert.deepStrictEqual(market.plugins, [{ name: 'ext', source: { source: 'github', repo: 'o/ext', ref: 'v1' }, description: 'External plugin.', homepage: 'https://github.com/o/ext' }]);

  fs.mkdirSync(path.join(kit, 'bundles'));
  fs.cpSync(path.join(ROOT, 'skills/readme-writer'), path.join(kit, 'skills/readme-writer'), { recursive: true });
  fs.writeFileSync(path.join(kit, 'bundles/ext.json'), JSON.stringify({ name: 'ext', description: 'x', include: ['skill/readme-writer'] }));
  assert.throws(() => s.run('validate'), /claudePlugin name "ext" clashes/);
  fs.writeFileSync(path.join(kit, 'tools/ext.json'), JSON.stringify({ name: 'ext', description: 'x', repo: 'https://github.com/o/ext', claudePlugin: { repo: 'https://github.com/o/ext' } }));
  assert.throws(() => s.run('validate'), /"claudePlugin\.repo" must be "owner\/repo"/);
});

test('claudePlugin: npm source, extra entry fields, allowed on clis but not resources', () => {
  const s = sandbox();
  const kit = path.join(s.dir, 'kit');
  for (const d of ['clis', 'resources']) fs.mkdirSync(path.join(kit, d), { recursive: true });
  fs.writeFileSync(path.join(kit, 'clis/npmtool.json'), JSON.stringify({
    name: 'npmtool', description: 'x', repo: 'https://github.com/o/npmtool', bin: 'npmtool',
    install: [{ manager: 'npm', package: 'npmtool' }],
    claudePlugin: { npm: '@o/npmtool', version: '1.2.3', entry: { strict: false, mcpServers: { t: { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/x.mjs'] } } } },
  }));
  s.env.AGENT_KIT_REPO = kit;
  s.run('build');
  const [p] = JSON.parse(s.read(path.join(kit, '.claude-plugin/marketplace.json'))).plugins;
  assert.deepStrictEqual(p.source, { source: 'npm', package: '@o/npmtool', version: '1.2.3' });
  assert.strictEqual(p.strict, false);
  assert.deepStrictEqual(p.mcpServers.t.args, ['${CLAUDE_PLUGIN_ROOT}/x.mjs']);

  // a resource may ship a companion plugin living in a subfolder of its repo
  fs.writeFileSync(path.join(kit, 'resources/r.json'), JSON.stringify({ name: 'r', description: 'x', kind: 'list', homepage: 'https://e.com', claudePlugin: { repo: 'o/r', path: 'plugins/claude/r/' } }));
  s.run('build');
  const sub = JSON.parse(s.read(path.join(kit, '.claude-plugin/marketplace.json'))).plugins.find((x) => x.name === 'r');
  assert.deepStrictEqual(sub.source, { source: 'git-subdir', url: 'https://github.com/o/r.git', path: 'plugins/claude/r' });
  fs.writeFileSync(path.join(kit, 'resources/r.json'), JSON.stringify({ name: 'r', description: 'x', kind: 'list', homepage: 'https://e.com', claudePlugin: { repo: 'o/r', path: '../x' } }));
  assert.throws(() => s.run('validate'), /"claudePlugin\.path" must be a relative folder/);
  fs.rmSync(path.join(kit, 'resources/r.json'));
  fs.writeFileSync(path.join(kit, 'clis/npmtool.json'), JSON.stringify({
    name: 'npmtool', description: 'x', repo: 'https://github.com/o/npmtool', bin: 'npmtool', install: [{ manager: 'npm', package: 'npmtool' }],
    claudePlugin: { npm: 'npmtool', repo: 'o/npmtool', entry: { source: 'x' } },
  }));
  assert.throws(() => s.run('validate'), /either "repo" or "npm"[\s\S]*must not set "source"/);
});

test('bundles: overlay folder adds files (package.json, bin/, .mcp.json) to the generated plugin', () => {
  const s = sandbox();
  const kit = path.join(s.dir, 'kit');
  fs.cpSync(path.join(ROOT, 'skills/readme-writer'), path.join(kit, 'skills/readme-writer'), { recursive: true });
  fs.mkdirSync(path.join(kit, 'bundles/ov/bin'), { recursive: true });
  fs.writeFileSync(path.join(kit, 'bundles/ov.json'), JSON.stringify({ name: 'ov', description: 'Overlay.', include: ['skill/readme-writer'] }));
  fs.writeFileSync(path.join(kit, 'bundles/ov/bin/tool'), '#!/bin/sh\necho hi\n');
  fs.chmodSync(path.join(kit, 'bundles/ov/bin/tool'), 0o755);
  fs.writeFileSync(path.join(kit, 'bundles/ov/.mcp.json'), '{"mcpServers":{}}\n');
  fs.writeFileSync(path.join(kit, 'bundles/ov/package.json'), '{"dependencies":{"x":"1.0.0"}}\n');
  s.env.AGENT_KIT_REPO = kit;
  assert.throws(() => s.run('validate'), /needs a lockfile/);
  fs.writeFileSync(path.join(kit, 'bundles/ov/package-lock.json'), '{"lockfileVersion":3}\n');
  s.run('build');
  const p = path.join(kit, 'plugins/ov');
  assert.ok(fs.statSync(path.join(p, 'bin/tool')).mode & 0o100, 'executable bit kept');
  assert.strictEqual(s.read(path.join(p, '.mcp.json')), '{"mcpServers":{}}\n');
  assert.ok(fs.existsSync(path.join(p, 'package-lock.json')));
  assert.ok(fs.existsSync(path.join(p, 'skills/readme-writer/SKILL.md')));
  s.run('build', '--check');
  fs.writeFileSync(path.join(kit, 'bundles/ov/README.md'), 'x');
  assert.throws(() => s.run('validate'), /would replace a generated file/);
});
