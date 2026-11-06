'use strict';
/**
 * Discovers every item in the repository (or inside a plugin) and normalizes it into:
 *   { type, name, id, description, tags, path, dir, meta, body, origin }
 */
const fs = require('fs');
const path = require('path');
const { repoRoot, exists, isDir, readJSON, parseFrontmatter } = require('./util');

const TYPES = ['skill', 'agent', 'command', 'mcp', 'hook', 'plugin', 'script'];
const TYPE_DIRS = { skill: 'skills', agent: 'agents', command: 'commands', mcp: 'mcp', hook: 'hooks', plugin: 'plugins', script: 'scripts' };
const TYPE_ALIASES = {
  skills: 'skill', agents: 'agent', subagent: 'agent', subagents: 'agent', commands: 'command', cmd: 'command', prompt: 'command', prompts: 'command',
  mcps: 'mcp', 'mcp-server': 'mcp', hooks: 'hook', plugins: 'plugin', scripts: 'script',
};

function normalizeType(t) {
  if (!t) return null;
  t = t.toLowerCase();
  return TYPES.includes(t) ? t : TYPE_ALIASES[t] || null;
}

function readMarkdownItem(type, file, name) {
  const text = fs.readFileSync(file, 'utf8');
  const { data, body } = parseFrontmatter(text);
  return {
    type, name: data.name || name, description: data.description || '', tags: toList(data.tags),
    path: file, dir: path.dirname(file), meta: data, body,
  };
}

function toList(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : String(v).split(',').map((s) => s.trim()).filter(Boolean);
}

function scriptDescription(file) {
  const head = fs.readFileSync(file, 'utf8').split(/\r?\n/).slice(0, 15);
  for (const line of head) {
    const m = /^\s*(?:#|\/\/|--|::|REM)\s*description:\s*(.+)$/i.exec(line);
    if (m) return m[1].trim();
  }
  return '';
}

const loaders = {
  skill(root) {
    const base = path.join(root, 'skills');
    if (!isDir(base)) return [];
    return fs.readdirSync(base).filter((n) => exists(path.join(base, n, 'SKILL.md'))).map((n) => {
      const it = readMarkdownItem('skill', path.join(base, n, 'SKILL.md'), n);
      it.path = path.join(base, n);
      it.dir = it.path;
      return it;
    });
  },
  agent(root) { return mdFiles(root, 'agents', 'agent'); },
  command(root) { return mdFiles(root, 'commands', 'command'); },
  mcp(root) {
    const base = path.join(root, 'mcp');
    if (!isDir(base)) return [];
    const out = [];
    for (const n of fs.readdirSync(base)) {
      const p = path.join(base, n);
      let file = null;
      let dir = base;
      if (n.endsWith('.json')) file = p;
      else if (exists(path.join(p, 'mcp.json'))) { file = path.join(p, 'mcp.json'); dir = p; }
      if (!file) continue;
      const meta = readJSON(file, {});
      const name = meta.name || path.basename(n, '.json');
      out.push({ type: 'mcp', name, description: meta.description || '', tags: toList(meta.tags), path: dir === base ? file : dir, dir, file, meta });
    }
    return out;
  },
  hook(root) {
    const base = path.join(root, 'hooks');
    if (!isDir(base)) return [];
    return fs.readdirSync(base).filter((n) => exists(path.join(base, n, 'hook.json'))).map((n) => {
      const dir = path.join(base, n);
      const meta = readJSON(path.join(dir, 'hook.json'), {});
      return { type: 'hook', name: meta.name || n, description: meta.description || '', tags: toList(meta.tags), path: dir, dir, meta };
    });
  },
  plugin(root) {
    const base = path.join(root, 'plugins');
    if (!isDir(base)) return [];
    return fs.readdirSync(base).filter((n) => exists(path.join(base, n, '.claude-plugin', 'plugin.json'))).map((n) => {
      const dir = path.join(base, n);
      const meta = readJSON(path.join(dir, '.claude-plugin', 'plugin.json'), {});
      return { type: 'plugin', name: meta.name || n, description: meta.description || '', tags: toList(meta.keywords), path: dir, dir, meta };
    });
  },
  script(root) {
    const base = path.join(root, 'scripts');
    if (!isDir(base)) return [];
    return fs.readdirSync(base, { withFileTypes: true })
      .filter((e) => e.isFile() && !e.name.startsWith('.') && e.name.toLowerCase() !== 'readme.md')
      .map((e) => {
        const file = path.join(base, e.name);
        return { type: 'script', name: e.name.replace(/\.[^.]+$/, ''), fileName: e.name, description: scriptDescription(file), tags: [], path: file, dir: base, meta: {} };
      });
  },
};

function mdFiles(root, dirName, type) {
  const base = path.join(root, dirName);
  if (!isDir(base)) return [];
  return fs.readdirSync(base)
    .filter((n) => n.endsWith('.md') && n.toLowerCase() !== 'readme.md')
    .map((n) => readMarkdownItem(type, path.join(base, n), n.replace(/\.md$/, '')));
}

/** Load all items under `root` (defaults to this repo). */
function loadCatalog(root = repoRoot(), types = TYPES) {
  const sources = readJSON(path.join(root, 'sources.json'), { items: {} }).items || {};
  const items = [];
  for (const t of types) {
    for (const it of loaders[t](root)) {
      it.id = `${it.type}/${it.name}`;
      it.origin = sources[it.id] ? 'collected' : 'original';
      it.source = sources[it.id] || null;
      items.push(it);
    }
  }
  return items;
}

/** Components shipped inside a Claude Code plugin, so they can be installed into other tools. */
function loadPluginComponents(plugin) {
  const items = loadCatalog(plugin.dir, ['skill', 'agent', 'command']);
  const mcpFile = path.join(plugin.dir, '.mcp.json');
  if (exists(mcpFile)) {
    const servers = readJSON(mcpFile, {}).mcpServers || {};
    for (const [name, cfg] of Object.entries(servers)) {
      items.push({ type: 'mcp', id: `mcp/${name}`, name, description: `from plugin ${plugin.name}`, tags: [], path: mcpFile, dir: plugin.dir, meta: fromClaudeMcp(name, cfg) });
    }
  }
  return items;
}

function fromClaudeMcp(name, cfg) {
  const m = { name };
  if (cfg.url) { m.transport = cfg.type === 'sse' ? 'sse' : 'http'; m.url = cfg.url; if (cfg.headers) m.headers = cfg.headers; }
  else { m.command = cfg.command; m.args = cfg.args || []; if (cfg.env) m.env = cfg.env; }
  return m;
}

/** Resolve CLI selectors like "skill/foo", "skill:foo", "foo", "skill/*" or "mcp" (whole type). */
function select(catalog, selectors) {
  const out = [];
  const add = (it) => { if (!out.includes(it)) out.push(it); };
  for (const sel of selectors) {
    const m = /^([a-z-]+)[/:](.+)$/i.exec(sel);
    if (m && normalizeType(m[1])) {
      const t = normalizeType(m[1]);
      const pattern = m[2];
      const matches = catalog.filter((it) => it.type === t && (pattern === '*' || it.name === pattern));
      if (!matches.length) throw new Error(`Not found: ${t}/${pattern}`);
      matches.forEach(add);
      continue;
    }
    if (normalizeType(sel) && !catalog.some((it) => it.name === sel)) {
      catalog.filter((it) => it.type === normalizeType(sel)).forEach(add);
      continue;
    }
    const matches = catalog.filter((it) => it.name === sel);
    if (!matches.length) throw new Error(`Not found: ${sel}  (try \`agent-kit list\`)`);
    if (matches.length > 1) throw new Error(`Ambiguous name "${sel}": ${matches.map((x) => x.id).join(', ')} — use type/name`);
    add(matches[0]);
  }
  return out;
}

module.exports = { TYPES, TYPE_DIRS, normalizeType, loadCatalog, loadPluginComponents, select, fromClaudeMcp };
