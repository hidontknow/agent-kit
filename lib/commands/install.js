'use strict';
const fs = require('fs');
const path = require('path');
const { home, c, log, place } = require('../util');
const { loadCatalog, loadPluginComponents, select } = require('../catalog');
const { resolveTargets } = require('../targets');
const state = require('../state');
const { installCli } = require('../clis');
const { serverKey } = require('../mcp');
const { which } = require('../util');

function makeCtx(opts) {
  const scope = opts.scope || (opts.project ? 'project' : 'user');
  if (!['user', 'project'].includes(scope)) throw new Error('--scope must be "user" or "project"');
  return {
    scope,
    project: path.resolve(opts.project || process.cwd()),
    link: !!opts.link,
    dryRun: !!opts['dry-run'],
    expand: !!opts.expand,
    out: opts.out,
    notes: [],
  };
}

function binDir() {
  if (process.env.AGENT_KIT_BIN) return process.env.AGENT_KIT_BIN;
  return process.platform === 'win32' ? path.join(state.stateDir(), 'bin') : path.join(home(), '.local', 'bin');
}

function installScript(item, ctx) {
  const name = process.platform === 'win32' ? item.fileName : item.name;
  const dest = path.join(binDir(), name);
  if (!ctx.dryRun) {
    place(item.path, dest, { link: ctx.link });
    if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
  }
  const onPath = (process.env.PATH || '').split(path.delimiter).includes(binDir());
  if (!onPath) ctx.notes.push(`${binDir()} is not on your PATH.`);
  return [state.pathAction(dest)];
}

/** Install one item into one target; plugins are expanded into components when needed. */
function installInto(target, item, ctx) {
  if (item.type === 'plugin' && (ctx.expand || !target.supports.includes('plugin'))) {
    const actions = [];
    const parts = loadPluginComponents(item);
    for (const part of parts) {
      if (!target.supports.includes(part.type)) { ctx.notes.push(`${target.id}: skipped ${part.id} from plugin ${item.name} (unsupported)`); continue; }
      try { actions.push(...target.install(part, ctx)); } catch (e) {
        if (e.unsupported) ctx.notes.push(`${target.id}: skipped ${part.id}: ${e.message}`); else throw e;
      }
    }
    if (!parts.length) throw Object.assign(new Error('plugin has no skills/agents/commands/.mcp.json to expand'), { unsupported: true });
    return actions;
  }
  if (!target.supports.includes(item.type)) {
    throw Object.assign(new Error(`${target.name} does not support ${item.type}s`), { unsupported: true });
  }
  return target.install(item, ctx);
}

/** MCP variants sharing one server name (e.g. goofish / goofish-sandbox) replace each other per target. */
function replaceSameServer(target, item, ctx) {
  if (item.type !== 'mcp') return;
  const key = serverKey(item);
  const project = ctx.scope === 'project' ? ctx.project : '';
  for (const e of Object.values(state.loadState().installs)) {
    if (e.target !== target.id || e.scope !== ctx.scope || (e.project || '') !== project) continue;
    if (e.id === item.id || !e.id.startsWith('mcp/') || (e.serverKey || e.id.slice(4)) !== key) continue;
    if (ctx.dryRun) { ctx.notes.push(`${target.id}: would replace ${e.id} (same server name "${key}")`); continue; }
    for (const a of [...e.actions].reverse()) state.undo(a);
    state.forget(e.target, e.scope, e.id, e.project);
    ctx.notes.push(`${target.id}: replaced ${e.id} with ${item.id} (both use server name "${key}")`);
  }
}

function run(args, opts) {
  if (!args.length) throw new Error('usage: agent-kit install <type/name...> [-t targets] [--scope user|project]');
  const items = select(loadCatalog(), args);
  const ctx = makeCtx(opts);
  const LOCAL = ['script', 'cli']; // installed on the machine, independent of AI clients
  const needTargets = items.some((i) => !LOCAL.includes(i.type));
  const targets = needTargets ? resolveTargets(opts.target) : [];
  let ok = 0; let skipped = 0;
  for (const item of items) {
    const pairs = item.type === 'script' ? [{ id: 'bin', name: 'local bin', install: (it) => installScript(it, ctx) }]
      : item.type === 'cli' ? [{ id: 'system', name: 'system', install: (it) => installCli(it, ctx, opts) }]
        : targets;
    for (const target of pairs) {
      const label = `${c.bold(item.id)} → ${target.id}${ctx.scope === 'project' ? c.gray(` (project ${ctx.project})`) : ''}`;
      try {
        if (!LOCAL.includes(item.type) && (target.supports || []).includes(item.type)) replaceSameServer(target, item, ctx);
        const actions = LOCAL.includes(item.type) ? target.install(item) : installInto(target, item, ctx);
        if (!ctx.dryRun && actions.length) {
          state.record({
            target: target.id, scope: ctx.scope, project: ctx.scope === 'project' ? ctx.project : '', id: item.id, actions,
            ...(item.type === 'mcp' ? { serverKey: serverKey(item) } : {}),
          });
        }
        log.ok(`${ctx.dryRun ? '[dry-run] ' : ''}${label}`);
        for (const a of actions) {
          if (a.kind === 'exec' || a.kind === 'note') continue;
          log.dim(`    ${a.kind === 'path' ? a.path : `${a.file}${a.keys ? ` [${a.keys.join('.')}]` : ''}`}`);
        }
        ok++;
      } catch (e) {
        if (!e.unsupported) throw e;
        skipped++;
        log.warn(`${label}: skipped — ${e.message}`);
      }
    }
  }
  for (const item of items) {
    if (item.type === 'cli') continue; // installCli prints its own notes
    const req = (item.meta && item.meta.requires && item.meta.requires.bin) || [];
    for (const b of req) if (!which(b)) ctx.notes.push(`${item.id}: needs \`${b}\` on PATH (not found)`);
    for (const n of (item.meta && Array.isArray(item.meta.notes) && item.meta.notes) || []) ctx.notes.push(`${item.id}: ${n}`);
  }
  for (const n of [...new Set(ctx.notes)]) log.info(c.cyan('ℹ ') + n);
  log.info(`\n${ok} installed, ${skipped} skipped.`);
}

function uninstall(args, opts) {
  if (!args.length) throw new Error('usage: agent-kit uninstall <type/name...> [-t targets]');
  const ctx = makeCtx(opts);
  const s = state.loadState();
  const ids = args.map((a) => (a.includes('/') || a.includes(':') ? a.replace(':', '/') : a));
  const targetFilter = opts.target && opts.target !== 'all' && opts.target !== 'detected' ? resolveTargets(opts.target).map((t) => t.id) : null;
  let n = 0;
  for (const entry of Object.values(s.installs)) {
    const matchId = ids.some((id) => entry.id === id || entry.id.split('/')[1] === id);
    if (!matchId) continue;
    if (targetFilter && !targetFilter.includes(entry.target) && !['bin', 'system'].includes(entry.target)) continue;
    if (entry.scope !== ctx.scope && !opts['any-scope']) continue;
    if (entry.scope === 'project' && entry.project !== ctx.project && !opts['any-scope']) continue;
    if (!ctx.dryRun) {
      for (const a of [...entry.actions].reverse()) state.undo(a);
      state.forget(entry.target, entry.scope, entry.id, entry.project);
    }
    log.ok(`${ctx.dryRun ? '[dry-run] ' : ''}removed ${entry.id} from ${entry.target} (${entry.scope})`);
    n++;
  }
  if (!n) log.warn('nothing matched in install state (see `agent-kit list --installed`).');
}

module.exports = { run, uninstall, makeCtx, installInto, binDir };
