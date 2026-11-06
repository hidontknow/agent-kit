'use strict';
/** list / info / targets / validate / build / new / pack */
const fs = require('fs');
const path = require('path');
const { c, log, exists, isDir, readJSON, ensureDir, repoRoot, copyDir, listFiles } = require('../util');
const { TYPES, TYPE_DIRS, loadCatalog, select, normalizeType } = require('../catalog');
const { TARGETS } = require('../targets');
const { loadState } = require('../state');
const mcp = require('../mcp');
const { zipDir } = require('../zip');
const { loadSources } = require('../sources');

const rel = (p) => path.relative(repoRoot(), p).split(path.sep).join('/');

// ------------------------------------------------------------------ list / info
function list(args, opts) {
  if (opts.installed) return listInstalled(opts);
  let items = loadCatalog();
  const t = normalizeType(args[0]);
  if (args[0] && !t) throw new Error(`unknown type "${args[0]}"`);
  if (t) items = items.filter((i) => i.type === t);
  if (opts.tag) items = items.filter((i) => i.tags.includes(opts.tag));
  if (opts.origin) items = items.filter((i) => i.origin === opts.origin);
  if (opts.json) { console.log(JSON.stringify(items.map(summary), null, 2)); return; }
  for (const type of TYPES) {
    const group = items.filter((i) => i.type === type);
    if (!group.length) continue;
    log.info(c.bold(`\n${TYPE_DIRS[type]} (${group.length})`));
    for (const it of group) {
      const mark = it.origin === 'collected' ? c.gray(' [collected]') : '';
      log.info(`  ${c.cyan(it.name.padEnd(28))} ${truncate(it.description, 90)}${mark}`);
    }
  }
}

function truncate(s, n) { s = (s || '').replace(/\s+/g, ' '); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function listInstalled(opts) {
  const entries = Object.values(loadState().installs);
  if (opts.json) { console.log(JSON.stringify(entries, null, 2)); return; }
  if (!entries.length) { log.info('Nothing installed by agent-kit yet.'); return; }
  for (const e of entries.sort((a, b) => a.id.localeCompare(b.id))) {
    log.info(`  ${c.cyan(e.id.padEnd(32))} ${e.target.padEnd(15)} ${e.scope}${e.project ? c.gray(` ${e.project}`) : ''} ${c.gray(e.at.slice(0, 10))}`);
  }
}

function summary(it) {
  return {
    id: it.id, type: it.type, name: it.name, description: it.description, tags: it.tags, origin: it.origin, path: rel(it.path),
    ...(it.source ? { source: { repo: it.source.repo, path: it.source.path, ref: it.source.ref, commit: it.source.commit } } : {}),
    ...(it.type === 'mcp' ? { transport: mcp.transportOf(it.meta) } : {}),
    targets: TARGETS.filter((t) => t.supports.includes(it.type) || it.type === 'plugin').map((t) => t.id),
  };
}

function info(args) {
  const [it] = select(loadCatalog(), args.slice(0, 1));
  const s = summary(it);
  log.info(c.bold(it.id));
  log.info(`  ${it.description}`);
  log.info(`  path:    ${s.path}`);
  log.info(`  origin:  ${it.origin}${it.source ? `  ${it.source.repo}/${it.source.path} @ ${it.source.commit.slice(0, 7)}` : ''}`);
  if (it.tags.length) log.info(`  tags:    ${it.tags.join(', ')}`);
  log.info(`  targets: ${it.type === 'script' ? 'local bin' : s.targets.join(', ')}`);
  if (it.type === 'mcp') log.info(`  config:  ${JSON.stringify(it.meta, null, 2).replace(/\n/g, '\n           ')}`);
}

function targets() {
  log.info(c.bold('target           detected  supports'));
  for (const t of TARGETS) {
    const found = t.detect();
    log.info(`${t.id.padEnd(17)}${found ? c.green('yes'.padEnd(10)) : c.gray('no'.padEnd(10))}${t.supports.join(', ')}`);
    try {
      const p = t.paths({ scope: 'user', notes: [] });
      for (const [k, v] of Object.entries(p)) log.dim(`                   ${k}: ${v}`);
    } catch { /* ignore */ }
  }
}

// ------------------------------------------------------------------ validate
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function validateItems() {
  const errors = []; const warnings = [];
  const err = (it, m) => errors.push(`${it.id}: ${m}`);
  const warn = (it, m) => warnings.push(`${it.id}: ${m}`);
  let catalog;
  try { catalog = loadCatalog(); } catch (e) { return { errors: [e.message], warnings, catalog: [] }; }
  const seen = new Map();
  for (const it of catalog) {
    if (seen.has(it.id)) err(it, `duplicate id (also ${seen.get(it.id)})`);
    seen.set(it.id, rel(it.path));
    if (!NAME_RE.test(it.name)) err(it, 'name must be lowercase letters, digits and hyphens (≤64)');
    if (!it.description) (it.type === 'script' ? warn : err)(it, 'missing description');
    switch (it.type) {
      case 'skill':
        if (path.basename(it.path) !== it.name) err(it, `"name" in SKILL.md must match the directory name (${path.basename(it.path)})`);
        if (it.description.length > 1024) err(it, 'description longer than 1024 chars');
        break;
      case 'agent': case 'command':
        if (path.basename(it.path, '.md') !== it.name) err(it, 'front matter "name" must match the file name');
        if (!it.body.trim()) err(it, 'empty body');
        break;
      case 'mcp':
        for (const m of mcp.validate(it.meta)) err(it, m);
        if (/\$\{(?!env:|ITEM_DIR|HOME)[^}]*\}/.test(JSON.stringify(it.meta))) err(it, 'unknown placeholder (use ${env:VAR}, ${ITEM_DIR} or ${HOME})');
        if (/(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|xox[bp]-)/.test(JSON.stringify(it.meta))) err(it, 'looks like it contains a secret — use ${env:VAR}');
        break;
      case 'hook': {
        if (!it.meta.claude && !it.meta.cursor) err(it, 'hook.json needs a "claude" and/or "cursor" section');
        const refs = JSON.stringify(it.meta).match(/\$\{HOOK_DIR\}\/([\w./-]+)/g) || [];
        for (const r of refs) if (!exists(path.join(it.dir, r.replace('${HOOK_DIR}/', '')))) err(it, `referenced file missing: ${r}`);
        break;
      }
      case 'plugin': {
        if (path.basename(it.dir) !== it.name) err(it, 'plugin.json "name" must match the directory name');
        const hooks = path.join(it.dir, 'hooks', 'hooks.json');
        if (exists(hooks)) { try { JSON.parse(fs.readFileSync(hooks, 'utf8')); } catch (e) { err(it, `hooks/hooks.json: ${e.message}`); } }
        break;
      }
      default: break;
    }
  }
  const sources = loadSources().items || {};
  for (const [id, s] of Object.entries(sources)) {
    if (!seen.has(id)) errors.push(`sources.json: "${id}" does not match any item`);
    for (const k of ['repo', 'path', 'commit', 'hash']) if (s[k] === undefined) errors.push(`sources.json: "${id}" missing "${k}"`);
  }
  return { errors, warnings, catalog };
}

function validate() {
  const { errors, warnings, catalog } = validateItems();
  for (const w of warnings) log.warn(w);
  for (const e of errors) log.error(e);
  if (errors.length) { process.exitCode = 1; log.info(`\n${errors.length} error(s).`); } else log.ok(`${catalog.length} items valid.`);
  return !errors.length;
}

// ------------------------------------------------------------------ build
function buildOutputs() {
  const root = repoRoot();
  const catalog = loadCatalog();
  const pkg = readJSON(path.join(root, 'package.json'), {});
  const out = {};
  out['registry.json'] = JSON.stringify({ name: 'agent-kit', items: catalog.map(summary) }, null, 2) + '\n';

  const plugins = catalog.filter((i) => i.type === 'plugin');
  const market = {
    $schema: 'https://anthropic.com/claude-code/marketplace.schema.json',
    name: 'agent-kit',
    owner: { name: (pkg.author && (pkg.author.name || pkg.author)) || 'agent-kit' },
    metadata: { description: pkg.description || '', version: pkg.version || '0.0.0' },
    plugins: plugins.map((p) => ({
      name: p.name,
      source: `./${rel(p.dir)}`,
      description: p.description,
      version: p.meta.version,
      ...(p.meta.author ? { author: p.meta.author } : {}),
      ...(p.tags.length ? { keywords: p.tags } : {}),
      ...(p.meta.category ? { category: p.meta.category } : {}),
    })),
  };
  out['.claude-plugin/marketplace.json'] = JSON.stringify(market, null, 2) + '\n';

  const readmePath = path.join(root, 'README.md');
  if (exists(readmePath)) {
    const readme = fs.readFileSync(readmePath, 'utf8');
    const table = catalogMarkdown(catalog);
    const next = readme.replace(/(<!-- catalog:start -->)[\s\S]*?(<!-- catalog:end -->)/, `$1\n${table}\n$2`);
    out['README.md'] = next;
  }
  return out;
}

function catalogMarkdown(catalog) {
  const parts = [];
  for (const type of TYPES) {
    const group = catalog.filter((i) => i.type === type);
    if (!group.length) continue;
    parts.push(`#### ${TYPE_DIRS[type]} (${group.length})\n`);
    parts.push('| 名称 | 说明 | 来源 |', '| --- | --- | --- |');
    for (const it of group) {
      const origin = it.source ? `[collected](${it.source.repo.replace(/\.git$/, '')})` : 'original';
      parts.push(`| [\`${it.name}\`](${rel(it.path)}) | ${truncate(it.description, 120).replace(/\|/g, '\\|')} | ${origin} |`);
    }
    parts.push('');
  }
  return parts.join('\n').trim();
}

function build(args, opts) {
  const { errors } = validateItems();
  if (errors.length) { for (const e of errors) log.error(e); throw new Error('fix validation errors first'); }
  const outputs = buildOutputs();
  const stale = [];
  for (const [file, content] of Object.entries(outputs)) {
    const p = path.join(repoRoot(), file);
    const cur = exists(p) ? fs.readFileSync(p, 'utf8') : null;
    if (cur === content) continue;
    stale.push(file);
    if (!opts.check) { ensureDir(path.dirname(p)); fs.writeFileSync(p, content); log.ok(`wrote ${file}`); }
  }
  if (opts.check && stale.length) {
    log.error(`out of date: ${stale.join(', ')} — run \`agent-kit build\``);
    process.exitCode = 1;
  } else if (!stale.length) log.ok('generated files are up to date');
}

// ------------------------------------------------------------------ new
function scaffold(args, opts) {
  const type = normalizeType(args[0]);
  const name = args[1];
  if (!type || !name) throw new Error(`usage: agent-kit new <${TYPES.join('|')}> <name>`);
  if (!NAME_RE.test(name)) throw new Error('name must be lowercase letters, digits and hyphens');
  const tplRoot = path.join(repoRoot(), 'templates', type);
  const root = repoRoot();
  const destByType = {
    skill: path.join(root, 'skills', name),
    agent: path.join(root, 'agents', `${name}.md`),
    command: path.join(root, 'commands', `${name}.md`),
    mcp: path.join(root, 'mcp', `${name}.json`),
    hook: path.join(root, 'hooks', name),
    plugin: path.join(root, 'plugins', name),
    script: path.join(root, 'scripts', `${name}.${opts.ext || 'sh'}`),
  };
  const dest = destByType[type];
  if (exists(dest)) throw new Error(`${rel(dest)} already exists`);
  if (!exists(tplRoot)) throw new Error(`no template at templates/${type}`);
  const render = (s) => s.replace(/\{\{name\}\}/g, name);
  if (isDir(tplRoot) && ['skill', 'hook', 'plugin'].includes(type)) {
    copyDir(tplRoot, dest);
    for (const f of listFiles(dest)) {
      const p = path.join(dest, f);
      fs.writeFileSync(p, render(fs.readFileSync(p, 'utf8')));
    }
  } else {
    const file = isDir(tplRoot) ? path.join(tplRoot, fs.readdirSync(tplRoot)[0]) : tplRoot;
    ensureDir(path.dirname(dest));
    fs.writeFileSync(dest, render(fs.readFileSync(file, 'utf8')));
    if (type === 'script') fs.chmodSync(dest, 0o755);
  }
  log.ok(`created ${rel(dest)}`);
}

// ------------------------------------------------------------------ pack
function pack(args, opts) {
  const items = select(loadCatalog(), args.length ? args : ['skill/*']).filter((i) => i.type === 'skill');
  const out = path.resolve(opts.out || path.join(repoRoot(), 'dist', 'skills'));
  for (const it of items) {
    const f = zipDir(it.path, path.join(out, `${it.name}.zip`), it.name);
    log.ok(`${it.id} → ${f}`);
  }
}

module.exports = { list, info, targets, validate, validateItems, build, buildOutputs, scaffold, pack };
