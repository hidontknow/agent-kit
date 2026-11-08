#!/usr/bin/env node
'use strict';
const { log, c } = require('../lib/util');
const install = require('../lib/commands/install');
const sync = require('../lib/commands/sync');
const repo = require('../lib/commands/repo');
const pkg = require('../package.json');

const HELP = `${c.bold('agent-kit')} ${pkg.version} — manage skills, MCP servers, agents, commands, hooks, plugins, scripts, CLIs, open-source tools and resources
and install them into Claude Code, Claude Desktop, Codex, Cursor, Windsurf, Gemini CLI and ChatGPT.

${c.bold('Browse')}
  list [type] [--tag t] [--origin collected|original] [--json]   list items in this kit
  list --installed                                               what agent-kit installed where
  info <item>                                                    show details of one item
  targets                                                        supported tools, detection & paths

${c.bold('Install')}
  install <item...> [-t targets] [--scope user|project] [--project dir] [--link] [--expand] [--dry-run]
  uninstall <item...> [-t targets] [--scope user|project] [--any-scope]
      items:   type/name (skill/foo), name, type/* or a bare type (e.g. "mcp")
      targets: claude-code, claude-desktop, codex, cursor, windsurf, gemini, gpt | all | detected (default)
      cli/<name>: installs the tool with its package manager (uv/pipx/pip/npm/brew/cargo/go); --via <manager>, --force
      tool/<name>: same when the tool declares "install", otherwise prints its download link and notes
      resource/<name>: nothing is installed; prints links and usage notes
  pack [skill...] [--out dir]                                    zip skills for Claude Desktop / claude.ai upload

${c.bold('Collect & sync upstream')}
  add <source> [--type t] [--name n] [--ref r] [--path p] [--exclude a,b] [--license l] [--force]
      source: https://github.com/o/r/tree/main/path | o/r/path@ref | any git URL with --path
  outdated [item...] [--verbose] [--json] [--exit-code]          check collected items against upstream
  diff <item...> [--base] [--stat]                               local vs upstream (or base vs upstream)
  update <item...> | --all [--theirs] [--skip-conflicts] [--json] [--dry-run]
                                                                 pull upstream; 3-way merge keeps local edits
  untrack <item...>                                              stop tracking upstream (treat as forked)

${c.bold('Author')}
  new <type> <name>                                              scaffold from templates/
  validate                                                       lint every item
  build [--check]                                                regenerate registry.json, marketplace.json, README catalog
`;

const BOOL = new Set(['json', 'skip-conflicts', 'installed', 'link', 'dry-run', 'expand', 'force', 'check', 'verbose', 'base', 'stat', 'all', 'theirs', 'deep', 'exit-code', 'any-scope', 'help', 'version']);
const SHORT = { t: 'target', s: 'scope', p: 'project', n: 'dry-run', h: 'help', v: 'verbose', o: 'out' };

function parse(argv) {
  const args = []; const opts = {};
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (a === '--') { args.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--') || (a.startsWith('-') && a.length === 2)) {
      let key; let val;
      if (a.startsWith('--')) { [key, val] = a.slice(2).split(/=(.*)/s); } else key = SHORT[a[1]] || a[1];
      if (key === 'targets') key = 'target';
      if (BOOL.has(key)) opts[key] = val === undefined ? true : val !== 'false';
      else { opts[key] = val !== undefined ? val : argv[++i]; if (opts[key] === undefined) throw new Error(`--${key} needs a value`); }
      continue;
    }
    args.push(a);
  }
  return { args, opts };
}

const COMMANDS = {
  list: repo.list, ls: repo.list, info: repo.info, show: repo.info, targets: repo.targets, doctor: repo.targets,
  install: install.run, i: install.run, add: sync.add, uninstall: install.uninstall, remove: install.uninstall, rm: install.uninstall,
  outdated: sync.outdated, diff: sync.diff, update: sync.update, upgrade: sync.update, untrack: sync.untrack,
  new: repo.scaffold, validate: repo.validate, lint: repo.validate, build: repo.build, pack: repo.pack,
};

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { process.stdout.write(HELP); return; }
  if (cmd === '--version' || cmd === '-V' || cmd === 'version') { console.log(pkg.version); return; }
  const fn = COMMANDS[cmd];
  if (!fn) { log.error(`unknown command "${cmd}"`); process.stdout.write(HELP); process.exitCode = 1; return; }
  try {
    const { args, opts } = parse(rest);
    if (opts.help) { process.stdout.write(HELP); return; }
    fn(args, opts);
  } catch (e) {
    log.error(e.message);
    if (process.env.AGENT_KIT_DEBUG) console.error(e.stack);
    process.exitCode = 1;
  }
}

main();
