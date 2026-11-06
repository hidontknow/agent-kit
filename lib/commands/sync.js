'use strict';
/** add / outdated / diff / update — manage collected items that track an upstream source. */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { c, log, exists, isDir, place, hashPath, repoRoot } = require('../util');
const { loadCatalog, select, normalizeType } = require('../catalog');
const src = require('../sources');

const rel = (p) => path.relative(repoRoot(), p);

// ------------------------------------------------------------------ add
function add(args, opts) {
  const spec = args[0];
  if (!spec) throw new Error('usage: agent-kit add <github-url | owner/repo/path[@ref] | git-url --path p> [--type t] [--name n]');
  const parsed = src.parseSpec(spec, { ref: opts.ref, subpath: opts.path });
  if (!parsed) throw new Error(`Cannot parse source "${spec}"`);
  const sources = src.loadSources();
  try {
    const repo = src.fetchRepo(parsed.repo, parsed.ref);
    const upstream = repo.extract(repo.commit, parsed.path);
    if (!upstream) throw new Error(`path "${parsed.path}" not found in ${parsed.repo}@${parsed.ref || 'HEAD'}`);

    // A directory with no marker but with skill sub-directories: import each one.
    let entries = [{ upstream, subpath: parsed.path }];
    let type = normalizeType(opts.type) || src.detectType(upstream);
    if (!type && isDir(upstream)) {
      const subs = fs.readdirSync(upstream).filter((n) => src.detectType(path.join(upstream, n)));
      if (!subs.length) throw new Error('Could not detect item type — pass --type');
      entries = subs.map((n) => ({ upstream: path.join(upstream, n), subpath: [parsed.path, n].filter(Boolean).join('/') }));
      log.info(`Found ${entries.length} items under ${parsed.path || '/'}`);
    }
    if (entries.length > 1 && opts.name) throw new Error('--name cannot be used when importing several items');

    for (const e of entries) {
      const t = type || src.detectType(e.upstream);
      if (!t) { log.warn(`skip ${e.subpath}: unknown type`); continue; }
      const name = opts.name || src.nameFor(t, e.upstream);
      const id = `${t}/${name}`;
      const dest = src.localPathFor(t, name, e.upstream);
      if (exists(dest) && !opts.force) { log.warn(`${id} already exists at ${rel(dest)} (use --force to overwrite, or \`update\`)`); continue; }
      place(e.upstream, dest);
      sources.items[id] = {
        repo: parsed.repo,
        ref: parsed.ref || undefined,
        path: e.subpath,
        commit: repo.commit,
        hash: hashPath(dest),
        license: opts.license || undefined,
        addedAt: new Date().toISOString().slice(0, 10),
        updatedAt: new Date().toISOString().slice(0, 10),
      };
      log.ok(`added ${c.bold(id)} ← ${parsed.repo}/${e.subpath} @ ${repo.commit.slice(0, 7)}  → ${rel(dest)}`);
    }
    src.saveSources(sources);
    log.info(c.gray('Run `agent-kit build` to refresh registry.json / marketplace.json / README catalog.'));
  } finally {
    src.cleanup();
  }
}

// ------------------------------------------------------------------ status
function collected(args) {
  const catalog = loadCatalog();
  const items = args.length ? select(catalog, args) : catalog;
  return items.filter((it) => it.source);
}

/** Compute status for one collected item. Fetches only when the remote head moved (or `deep`). */
function status(item, { deep } = {}) {
  const s = item.source;
  const localHash = hashPath(item.path);
  const localChanged = localHash !== s.hash;
  const head = src.remoteHead(s.repo, s.ref);
  if (!head) return { item, state: 'error', note: 'cannot reach upstream' };
  let upstreamChanged = false;
  let upstreamGone = false;
  let log1 = '';
  if (head !== s.commit || deep) {
    const repo = src.fetchRepo(s.repo, s.ref);
    const up = repo.extract(repo.commit, s.path);
    if (!up) upstreamGone = true;
    else upstreamChanged = hashPath(up) !== s.hash;
    log1 = repo.log(s.commit, repo.commit, s.path);
  }
  let state;
  if (upstreamGone) state = 'removed-upstream';
  else if (upstreamChanged && localChanged) state = 'diverged';
  else if (upstreamChanged) state = 'update-available';
  else if (localChanged) state = 'local-modified';
  else state = 'up-to-date';
  return { item, state, from: s.commit, to: head, commits: log1 ? log1.split('\n') : [] };
}

const STATE_COLOR = {
  'up-to-date': c.green, 'update-available': c.yellow, 'local-modified': c.cyan, diverged: c.red, 'removed-upstream': c.red, error: c.red,
};

function outdated(args, opts) {
  const items = collected(args);
  if (!items.length) { log.info('No collected items (sources.json is empty).'); return; }
  try {
    const results = items.map((it) => status(it, { deep: opts.deep }));
    if (opts.json) {
      console.log(JSON.stringify(results.map((r) => ({ id: r.item.id, state: r.state, repo: r.item.source.repo, path: r.item.source.path, from: r.from, to: r.to, commits: r.commits, note: r.note })), null, 2));
    } else {
      for (const r of results) {
        const range = r.from && r.to && r.from !== r.to ? c.gray(` ${r.from.slice(0, 7)}..${r.to.slice(0, 7)}`) : '';
        log.info(`${STATE_COLOR[r.state](r.state.padEnd(17))} ${c.bold(r.item.id)}${range}${r.note ? c.gray(`  (${r.note})`) : ''}`);
        if (opts.verbose) for (const line of r.commits.slice(0, 10)) log.dim(`      ${line}`);
      }
      const pending = results.filter((r) => ['update-available', 'diverged'].includes(r.state)).length;
      log.info(`\n${pending} item(s) have upstream updates.${pending ? ' Review with `agent-kit diff <item>`, apply with `agent-kit update <item>`.' : ''}`);
    }
    if (opts['exit-code'] && results.some((r) => r.state !== 'up-to-date' && r.state !== 'local-modified')) process.exitCode = 1;
  } finally {
    src.cleanup();
  }
}

// ------------------------------------------------------------------ diff
function diff(args, opts) {
  const items = collected(args);
  if (!items.length) throw new Error('usage: agent-kit diff <collected item...> [--base]');
  try {
    for (const it of items) {
      const s = it.source;
      const repo = src.fetchRepo(s.repo, s.ref);
      const up = repo.extract(repo.commit, s.path);
      let left = it.path; let leftLabel = 'local';
      if (opts.base) { left = repo.extract(s.commit, s.path); leftLabel = `base ${s.commit.slice(0, 7)}`; }
      log.info(c.bold(`\n=== ${it.id}: ${leftLabel} ↔ upstream ${repo.commit.slice(0, 7)} ===`));
      if (!up) { log.warn('removed upstream'); continue; }
      const args2 = ['diff', '--no-index', '--no-prefix', opts.stat ? '--stat' : '--patch', process.stdout.isTTY ? '--color=always' : '--color=never', left, up];
      const r = spawnSync('git', args2, { encoding: 'utf8' });
      const out = (r.stdout || '').split(left).join(leftLabel).split(up).join('upstream');
      process.stdout.write(out || c.gray('(no differences)\n'));
    }
  } finally {
    src.cleanup();
  }
}

// ------------------------------------------------------------------ update
/**
 * Update collected items from upstream.
 *   --theirs          discard local edits
 *   --skip-conflicts  leave items whose 3-way merge conflicts untouched (reported as "conflict")
 *   --json            print a machine-readable result list on stdout (logs go to stderr)
 * Errors on one item (e.g. upstream unreachable) are reported and do not stop the others.
 */
function update(args, opts) {
  const items = opts.all ? collected([]) : collected(args);
  if (!items.length) throw new Error('usage: agent-kit update <collected item...> | --all  [--theirs] [--skip-conflicts] [--dry-run] [--json]');
  const dry = !!opts['dry-run'];
  const say = opts.json ? { info: (...a) => console.error(...a), ok: (...a) => console.error('✔', ...a), warn: (...a) => console.error('!', ...a) } : log;
  const sources = src.loadSources();
  const results = [];
  try {
    for (const it of items) {
      const s = it.source;
      const r = { id: it.id, repo: s.repo, path: s.path, from: s.commit, to: s.commit, action: 'up-to-date', conflicts: [] };
      results.push(r);
      try {
        const head = src.remoteHead(s.repo, s.ref);
        if (!head) throw new Error('cannot reach upstream');
        if (head === s.commit && !opts.deep && !opts.theirs) { say.info(`${c.green('up-to-date')}  ${it.id}`); continue; }
        const repo = src.fetchRepo(s.repo, s.ref);
        r.to = repo.commit;
        r.commits = repo.log(s.commit, repo.commit, s.path).split('\n').filter(Boolean);
        const up = repo.extract(repo.commit, s.path);
        if (!up) { r.action = 'removed-upstream'; say.warn(`${it.id}: removed upstream — left untouched`); continue; }
        const upHash = hashPath(up);
        const localHash = hashPath(it.path);
        const localChanged = localHash !== s.hash;
        const record = { ...s, commit: repo.commit, hash: upHash, updatedAt: new Date().toISOString().slice(0, 10) };
        const range = `${s.commit.slice(0, 7)} → ${repo.commit.slice(0, 7)}`;

        if (upHash === s.hash && !(opts.theirs && localHash !== upHash)) {
          // upstream repo moved but this item did not change: just advance the recorded commit
          say.info(`${c.green('up-to-date')}  ${it.id}${head !== s.commit ? ' (upstream moved, item unchanged)' : ''}`);
          r.action = head !== s.commit ? 'bumped' : 'up-to-date';
          if (!dry) sources.items[it.id] = record;
          continue;
        }
        if (!localChanged || opts.theirs) {
          if (!dry) { place(up, it.path); sources.items[it.id] = record; }
          r.action = localChanged ? 'replaced' : 'updated';
          say.ok(`${dry ? '[dry-run] ' : ''}updated ${c.bold(it.id)} ${range}${localChanged ? c.yellow(' (local changes discarded)') : ''}`);
          continue;
        }
        // local edits + upstream edits: 3-way merge
        const base = repo.extract(s.commit, s.path);
        if (!base) say.warn(`${it.id}: base commit ${s.commit.slice(0, 7)} unavailable — merging against empty base`);
        const result = src.merge3(src.readTree(base), src.readTree(it.path), src.readTree(up));
        r.conflicts = result.conflicts;
        if (result.conflicts.length && opts['skip-conflicts']) {
          r.action = 'conflict';
          say.warn(`${it.id}: ${range} conflicts with local edits (${result.conflicts.join(', ')}) — skipped`);
          continue;
        }
        if (!dry) { src.writeTree(it.path, result.files, !isDir(it.path)); sources.items[it.id] = record; }
        r.action = result.conflicts.length ? 'merged-with-conflicts' : 'merged';
        const msg = `${dry ? '[dry-run] ' : ''}merged ${c.bold(it.id)} ${range} (kept local edits; ${result.changed.length} file(s) changed)`;
        if (result.conflicts.length) say.warn(`${msg}\n    ${c.red('conflicts')}: ${result.conflicts.join(', ')} — resolve the <<<<<<< markers / *.upstream files`);
        else say.ok(msg);
      } catch (e) {
        r.action = 'error';
        r.error = e.message.split('\n')[0];
        say.warn(`${it.id}: ${r.error}`);
      }
    }
    if (!dry) src.saveSources(sources);
    if (opts.json) console.log(JSON.stringify(results, null, 2));
    if (results.some((r) => r.action === 'merged-with-conflicts' || r.action === 'error')) process.exitCode = 1;
  } finally {
    src.cleanup();
  }
  return results;
}

/** Stop tracking an item (it becomes an "original"/forked item). */
function untrack(args) {
  const sources = src.loadSources();
  for (const a of args) {
    const id = a.replace(':', '/');
    if (sources.items[id]) { delete sources.items[id]; log.ok(`untracked ${id}`); } else log.warn(`${id} is not tracked`);
  }
  src.saveSources(sources);
}

module.exports = { add, outdated, diff, update, untrack, status };
