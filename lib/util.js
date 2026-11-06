'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..');
/** Content root (the toolkit repo). Overridable for tests / forks. */
const repoRoot = () => (process.env.AGENT_KIT_REPO ? path.resolve(process.env.AGENT_KIT_REPO) : REPO_ROOT);

const color = (code) => (s) => (process.stdout.isTTY && !process.env.NO_COLOR ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = { red: color(31), green: color(32), yellow: color(33), blue: color(34), gray: color(90), bold: color(1), cyan: color(36) };

const log = {
  info: (...a) => console.log(...a),
  ok: (...a) => console.log(c.green('✔'), ...a),
  warn: (...a) => console.warn(c.yellow('!'), ...a),
  error: (...a) => console.error(c.red('✖'), ...a),
  dim: (...a) => console.log(c.gray(a.join(' '))),
};

function home() {
  return process.env.AGENT_KIT_HOME_OVERRIDE || os.homedir();
}

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJSON(p, fallback) {
  if (!exists(p)) return fallback;
  const txt = fs.readFileSync(p, 'utf8');
  if (!txt.trim()) return fallback;
  try {
    return JSON.parse(txt);
  } catch (e) {
    throw new Error(`Failed to parse JSON ${p}: ${e.message}`);
  }
}

function writeJSON(p, data) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

/** Back up a user config file once per run before we modify it. */
const backedUp = new Set();
function backup(p) {
  if (backedUp.has(p) || !exists(p)) return;
  backedUp.add(p);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(p, `${p}.agent-kit-bak-${stamp}`);
}

function copyDir(src, dest, { filter } = {}) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (filter && !filter(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d, { filter });
    else if (entry.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(s), d);
    else fs.copyFileSync(s, d);
  }
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

/** Copy (or symlink when link=true) src to dest, replacing whatever is at dest. */
function place(src, dest, { link = false } = {}) {
  rmrf(dest);
  ensureDir(path.dirname(dest));
  if (link) fs.symlinkSync(src, dest, isDir(src) ? 'dir' : 'file');
  else if (isDir(src)) copyDir(src, dest, { filter: (n) => n !== '.DS_Store' });
  else fs.copyFileSync(src, dest);
}

function listFiles(dir, base = dir) {
  const out = [];
  if (!isDir(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '.DS_Store') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p, base));
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out.sort();
}

/** Stable content hash of a file or directory (paths + bytes). */
function hashPath(p) {
  const h = crypto.createHash('sha256');
  if (isDir(p)) {
    for (const rel of listFiles(p)) {
      h.update(rel + '\0');
      h.update(fs.readFileSync(path.join(p, rel)));
      h.update('\0');
    }
  } else if (exists(p)) {
    h.update(fs.readFileSync(p));
  } else {
    return null;
  }
  return 'sha256:' + h.digest('hex');
}

// ---------- minimal YAML front matter (subset) ----------
function parseScalar(v) {
  v = v.trim();
  if (v === '') return '';
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map((s) => parseScalar(s)).filter((s) => s !== '');
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text };
  const data = {};
  let lastKey = null;
  let multiline = null; // { key, lines }
  for (const raw of m[1].split(/\r?\n/)) {
    if (multiline) {
      if (/^\s+\S/.test(raw) || raw.trim() === '') { multiline.lines.push(raw.trim()); continue; }
      data[multiline.key] = multiline.lines.join(multiline.fold ? ' ' : '\n').trim();
      multiline = null;
    }
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const li = /^\s+-\s+(.*)$/.exec(raw);
    if (li && lastKey) {
      if (!Array.isArray(data[lastKey])) data[lastKey] = [];
      data[lastKey].push(parseScalar(li[1]));
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+):\s?(.*)$/.exec(raw);
    if (kv) {
      lastKey = kv[1];
      if (kv[2].trim() === '|' || kv[2].trim() === '>') {
        multiline = { key: kv[1], lines: [], fold: kv[2].trim() === '>' };
      } else {
        data[kv[1]] = parseScalar(kv[2]);
      }
    }
  }
  if (multiline) data[multiline.key] = multiline.lines.join(multiline.fold ? ' ' : '\n').trim();
  return { data, body: text.slice(m[0].length) };
}

function yamlValue(v) {
  if (Array.isArray(v)) return `[${v.map(yamlValue).join(', ')}]`;
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  return /^[\w ./,()-]*$/.test(s) && !/^\s|\s$/.test(s) && s !== '' ? s : JSON.stringify(s);
}

function stringifyFrontmatter(data, body) {
  const lines = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${yamlValue(v)}`);
  return `---\n${lines.join('\n')}\n---\n\n${body.replace(/^\s+/, '')}`;
}

/** Replace ${VAR} placeholders from a map. Unknown keys are left untouched. */
function template(str, vars) {
  return str.replace(/\$\{([A-Za-z0-9_]+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

function deepMap(value, fn) {
  if (Array.isArray(value)) return value.map((v) => deepMap(v, fn));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepMap(v, fn)]));
  }
  return typeof value === 'string' ? fn(value) : value;
}

function which(bin) {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    for (const ext of exts) {
      const p = path.join(dir, bin + ext);
      if (exists(p)) return p;
    }
  }
  return null;
}

module.exports = {
  REPO_ROOT, repoRoot, c, log, home, exists, isDir, ensureDir, readJSON, writeJSON, backup, copyDir, rmrf, place,
  listFiles, hashPath, parseFrontmatter, stringifyFrontmatter, template, deepMap, which,
};
