'use strict';
/**
 * Upstream tracking for collected (third-party) items.
 *
 * sources.json records, for every collected item, where it came from and the exact upstream state
 * it was copied from (commit + content hash). That lets us:
 *   - detect upstream updates and local modifications   (outdated)
 *   - show what changed                                 (diff)
 *   - pull updates with a 3-way merge that keeps local edits (update)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { repoRoot, exists, isDir, readJSON, writeJSON, hashPath, listFiles, rmrf, ensureDir, place, parseFrontmatter } = require('./util');
const { TYPE_DIRS } = require('./catalog');

const SOURCES_FILE = () => path.join(repoRoot(), 'sources.json');

function loadSources() { return readJSON(SOURCES_FILE(), { version: 1, items: {} }); }
function saveSources(s) {
  s.items = Object.fromEntries(Object.entries(s.items).sort(([a], [b]) => a.localeCompare(b)));
  writeJSON(SOURCES_FILE(), s);
}

function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
}

/**
 * Parse a source spec:
 *   https://github.com/owner/repo/tree/<ref>/<path>   (also /blob/)
 *   github:owner/repo[/path][@ref]  or  owner/repo[/path][@ref]
 *   any git URL (use --path / --ref)
 */
function parseSpec(spec, { ref, subpath } = {}) {
  let m = /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/(?:tree|blob)\/([^/]+)\/?(.*)$/.exec(spec);
  if (m) return { repo: `https://github.com/${m[1]}/${m[2]}`, ref: ref || m[3], path: subpath || m[4].replace(/\/$/, '') };
  m = /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?\/?$/.exec(spec);
  if (m) return { repo: `https://github.com/${m[1]}/${m[2]}`, ref: ref || null, path: subpath || '' };
  m = /^(?:github:)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)((?:\/[^@]*)?)(?:@(.+))?$/.exec(spec);
  if (m && !exists(spec)) return { repo: `https://github.com/${m[1]}/${m[2]}`, ref: ref || m[4] || null, path: subpath || m[3].replace(/^\/|\/$/g, '') };
  if (/^(https?|ssh|git|file):\/\//.test(spec) || /^[\w.-]+@[\w.-]+:/.test(spec)) return { repo: spec, ref: ref || null, path: subpath || '' };
  return null;
}

/** Clone (blobless, no checkout) once per repo@ref; returns { dir, commit, extract(commit, path, dest) }. */
const clones = new Map();
function fetchRepo(repo, ref) {
  const k = `${repo}@${ref || ''}`;
  if (clones.has(k)) return clones.get(k);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-kit-src-'));
  const isSha = ref && /^[0-9a-f]{7,40}$/i.test(ref);
  const args = ['clone', '--quiet', '--filter=blob:none', '--no-checkout'];
  if (ref && !isSha) args.push('--branch', ref);
  git([...args, repo, dir]);
  const commit = git(['-C', dir, 'rev-parse', isSha ? ref : 'HEAD']);
  const handle = {
    dir,
    commit,
    /** Materialize `sub` at `rev` into a temp dir; returns path to the extracted file/dir or null. */
    extract(rev, sub) {
      const out = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-kit-x-'));
      try {
        git(['-C', dir, `--work-tree=${out}`, 'checkout', rev, '--', sub || '.']);
        git(['-C', dir, 'reset', '--quiet']);
      } catch {
        return null;
      }
      const p = path.join(out, sub || '');
      return exists(p) ? p : null;
    },
    log(from, to, sub) {
      try { return git(['-C', dir, 'log', '--oneline', '--no-decorate', `${from}..${to}`, '--', sub || '.']); } catch { return ''; }
    },
  };
  clones.set(k, handle);
  return handle;
}

function cleanup() {
  for (const h of clones.values()) rmrf(h.dir);
  clones.clear();
}

/** Quick check of the remote head without cloning. */
function remoteHead(repo, ref) {
  if (ref && /^[0-9a-f]{40}$/i.test(ref)) return ref;
  try {
    const out = git(['ls-remote', repo, ref || 'HEAD']);
    const line = out.split('\n').find((l) => l.endsWith(`refs/heads/${ref}`) || l.endsWith(`refs/tags/${ref}^{}`)) ||
      out.split('\n').find((l) => l.endsWith(`refs/tags/${ref}`)) || out.split('\n')[0];
    return line ? line.split(/\s+/)[0] : null;
  } catch {
    return null;
  }
}

// ---------- type detection & placement ----------

function detectType(p) {
  if (isDir(p)) {
    if (exists(path.join(p, 'SKILL.md'))) return 'skill';
    if (exists(path.join(p, '.claude-plugin', 'plugin.json'))) return 'plugin';
    if (exists(path.join(p, 'hook.json'))) return 'hook';
    if (exists(path.join(p, 'mcp.json'))) return 'mcp';
    return null;
  }
  const lower = p.toLowerCase();
  if (lower.endsWith('.md')) {
    if (/(^|\/)commands?\//.test(lower) || /(^|\/)prompts?\//.test(lower)) return 'command';
    const { data } = parseFrontmatter(fs.readFileSync(p, 'utf8'));
    if (/(^|\/)agents?\//.test(lower) || data.tools || data.model) return 'agent';
    return null;
  }
  if (lower.endsWith('.json')) return 'mcp';
  if (/\.(sh|bash|zsh|py|js|mjs|ts|rb|ps1)$/.test(lower)) return 'script';
  return null;
}

function localPathFor(type, name, upstreamPath) {
  const root = repoRoot();
  const dir = path.join(root, TYPE_DIRS[type]);
  switch (type) {
    case 'agent': case 'command': return path.join(dir, `${name}.md`);
    case 'mcp': return isDir(upstreamPath) ? path.join(dir, name) : path.join(dir, `${name}.json`);
    case 'script': return path.join(dir, `${name}${path.extname(upstreamPath)}`);
    default: return path.join(dir, name);
  }
}

function nameFor(type, p) {
  const base = path.basename(p);
  return type === 'skill' || type === 'plugin' || type === 'hook' || (type === 'mcp' && isDir(p)) ? base : base.replace(/\.[^.]+$/, '');
}

// ---------- tree helpers for 3-way merge ----------

function readTree(p) {
  const out = new Map();
  if (!p || !exists(p)) return out;
  if (isDir(p)) for (const rel of listFiles(p)) out.set(rel, fs.readFileSync(path.join(p, rel)));
  else out.set(path.basename(p), fs.readFileSync(p));
  return out;
}

const same = (a, b) => (a === undefined && b === undefined) || (a !== undefined && b !== undefined && a.equals(b));
const isText = (b) => !b || !b.includes(0);

/**
 * 3-way merge base→ours (local) and base→theirs (upstream).
 * Returns { files: Map(rel → Buffer|null), conflicts: [rel], changed: [rel] }
 */
function merge3(baseTree, oursTree, theirsTree) {
  const files = new Map();
  const conflicts = [];
  const changed = [];
  const all = new Set([...baseTree.keys(), ...oursTree.keys(), ...theirsTree.keys()]);
  for (const rel of [...all].sort()) {
    const b = baseTree.get(rel); const o = oursTree.get(rel); const t = theirsTree.get(rel);
    if (same(o, t)) { files.set(rel, o ?? null); continue; }
    if (same(o, b)) { files.set(rel, t ?? null); changed.push(rel); continue; }
    if (same(t, b)) { files.set(rel, o ?? null); continue; }
    // both sides changed
    if (o && t && isText(o) && isText(t) && isText(b)) {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-kit-m-'));
      const [fo, fb, ft] = ['ours', 'base', 'theirs'].map((n) => path.join(tmp, n));
      fs.writeFileSync(fo, o); fs.writeFileSync(fb, b || ''); fs.writeFileSync(ft, t);
      let merged; let conflict = false;
      try {
        merged = execFileSync('git', ['merge-file', '-p', '-L', 'local', '-L', 'base', '-L', 'upstream', fo, fb, ft]);
      } catch (e) {
        if (e.status > 0 && e.stdout) { merged = e.stdout; conflict = true; } else throw e;
      }
      rmrf(tmp);
      files.set(rel, Buffer.from(merged));
      changed.push(rel);
      if (conflict) conflicts.push(rel);
    } else {
      // binary or delete/modify conflict: keep local, keep upstream next to it for manual resolution
      files.set(rel, o ?? null);
      if (t) files.set(`${rel}.upstream`, t);
      conflicts.push(rel);
    }
  }
  return { files, conflicts, changed };
}

function writeTree(dest, files, isFile) {
  if (isFile) {
    const buf = [...files.values()].find((v) => v);
    if (buf) fs.writeFileSync(dest, buf); else rmrf(dest);
    for (const [rel, buf2] of files) if (rel.endsWith('.upstream') && buf2) fs.writeFileSync(`${dest}.upstream`, buf2);
    return;
  }
  for (const [rel, buf] of files) {
    const p = path.join(dest, rel);
    if (buf === null) rmrf(p);
    else { ensureDir(path.dirname(p)); fs.writeFileSync(p, buf); }
  }
}

module.exports = {
  SOURCES_FILE, loadSources, saveSources, parseSpec, fetchRepo, remoteHead, cleanup,
  detectType, localPathFor, nameFor, readTree, merge3, writeTree, hashPath, place,
};
