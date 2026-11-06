'use strict';
/**
 * Translate a portable MCP manifest (mcp/<name>.json) into each client's config shape.
 *
 * Placeholders in the manifest:
 *   ${env:NAME}  environment variable (kept as a reference when the client supports it, resolved otherwise)
 *   ${ITEM_DIR}  absolute path of the installed copy of an MCP directory (for servers shipped in this repo)
 *   ${HOME}      user home directory
 */
const { home, deepMap, log } = require('./util');

const ENV_RE = /\$\{env:([A-Za-z0-9_]+)\}/g;

function transportOf(m) {
  if (m.transport) return m.transport;
  return m.url ? 'http' : 'stdio';
}

/** Key used in client configs: "serverName" lets several variants (e.g. local / sandbox) share one name. */
function serverKey(item) {
  return (item.meta && item.meta.serverName) || item.name;
}

/** Apply target overrides + ITEM_DIR/HOME substitution. */
function prepare(manifest, target, vars = {}) {
  const m = { ...manifest, ...((manifest.overrides || {})[target] || {}) };
  delete m.overrides;
  const all = { HOME: home(), ...vars };
  return deepMap(m, (s) => s.replace(/\$\{(ITEM_DIR|HOME)\}/g, (x, k) => (k in all ? all[k] : x)));
}

/** Rewrite ${env:X} according to style: 'claude' -> ${X}, 'cursor' -> ${env:X}, 'resolve' -> value now. */
function envStyle(value, style, missing) {
  return value.replace(ENV_RE, (x, name) => {
    if (style === 'claude') return '${' + name + '}';
    if (style === 'cursor') return x;
    if (process.env[name] === undefined) missing.add(name);
    return process.env[name] || '';
  });
}

function withEnvStyle(obj, style) {
  const missing = new Set();
  const out = deepMap(obj, (s) => envStyle(s, style, missing));
  if (missing.size) log.warn(`environment variable(s) not set, written as empty: ${[...missing].join(', ')}`);
  return out;
}

function stripEmpty(o) {
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v === undefined || (v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) delete o[k];
  }
  return o;
}

/** JSON block used by Claude Code (~/.claude.json, .mcp.json) */
function toClaudeCode(m) {
  const t = transportOf(m);
  const cfg = t === 'stdio'
    ? { type: 'stdio', command: m.command, args: m.args || [], env: m.env }
    : { type: t, url: m.url, headers: m.headers };
  return stripEmpty(withEnvStyle(cfg, 'claude'));
}

/** Claude Desktop only supports local stdio servers in its config file; bridge remote ones via mcp-remote. */
function toClaudeDesktop(m) {
  const t = transportOf(m);
  let cfg;
  if (t === 'stdio') cfg = { command: m.command, args: m.args || [], env: m.env };
  else {
    const args = ['-y', 'mcp-remote', m.url];
    for (const [k, v] of Object.entries(m.headers || {})) args.push('--header', `${k}:${v}`);
    cfg = { command: 'npx', args };
  }
  return stripEmpty(withEnvStyle(cfg, 'resolve'));
}

function toCursor(m) {
  const t = transportOf(m);
  const cfg = t === 'stdio' ? { command: m.command, args: m.args || [], env: m.env } : { url: m.url, headers: m.headers };
  return stripEmpty(withEnvStyle(cfg, 'cursor'));
}

function toWindsurf(m) {
  const t = transportOf(m);
  const cfg = t === 'stdio' ? { command: m.command, args: m.args || [], env: m.env } : { serverUrl: m.url, headers: m.headers };
  return stripEmpty(withEnvStyle(cfg, 'resolve'));
}

function toGemini(m) {
  const t = transportOf(m);
  let cfg;
  if (t === 'stdio') cfg = { command: m.command, args: m.args || [], env: m.env };
  else if (t === 'sse') cfg = { url: m.url, headers: m.headers };
  else cfg = { httpUrl: m.url, headers: m.headers };
  return stripEmpty(withEnvStyle(cfg, 'claude'));
}

// ---------- Codex (TOML) ----------
const tomlStr = (s) => JSON.stringify(String(s));
const tomlKey = (k) => (/^[A-Za-z0-9_-]+$/.test(k) ? k : tomlStr(k));
const tomlInline = (o) => `{ ${Object.entries(o).map(([k, v]) => `${tomlKey(k)} = ${tomlStr(v)}`).join(', ')} }`;
const exactEnv = (v) => { const m = /^\$\{env:([A-Za-z0-9_]+)\}$/.exec(v); return m ? m[1] : null; };

function toCodexToml(name, m) {
  const t = transportOf(m);
  const lines = [`[mcp_servers.${tomlKey(name)}]`];
  const missing = new Set();
  const resolve = (v) => envStyle(v, 'resolve', missing);
  if (t === 'stdio') {
    lines.push(`command = ${tomlStr(resolve(m.command))}`);
    lines.push(`args = [${(m.args || []).map((a) => tomlStr(resolve(a))).join(', ')}]`);
    const passthrough = [];
    const literal = {};
    for (const [k, v] of Object.entries(m.env || {})) {
      if (exactEnv(v) === k) passthrough.push(k);
      else literal[k] = resolve(v);
    }
    if (passthrough.length) lines.push(`env_vars = [${passthrough.map(tomlStr).join(', ')}]`);
    if (Object.keys(literal).length) lines.push(`env = ${tomlInline(literal)}`);
  } else {
    lines.push(`url = ${tomlStr(m.url)}`);
    const staticHeaders = {};
    const envHeaders = {};
    for (const [k, v] of Object.entries(m.headers || {})) {
      const bearer = /^Bearer \$\{env:([A-Za-z0-9_]+)\}$/.exec(v);
      if (k.toLowerCase() === 'authorization' && bearer) lines.push(`bearer_token_env_var = ${tomlStr(bearer[1])}`);
      else if (exactEnv(v)) envHeaders[k] = exactEnv(v);
      else staticHeaders[k] = resolve(v);
    }
    if (Object.keys(staticHeaders).length) lines.push(`http_headers = ${tomlInline(staticHeaders)}`);
    if (Object.keys(envHeaders).length) lines.push(`env_http_headers = ${tomlInline(envHeaders)}`);
  }
  if (m.startup_timeout_sec) lines.push(`startup_timeout_sec = ${Number(m.startup_timeout_sec)}`);
  if (missing.size) log.warn(`environment variable(s) not set, written as empty: ${[...missing].join(', ')}`);
  return lines.join('\n');
}

/** Remote MCP description for ChatGPT connectors (only remote servers can be used there). */
function toChatGPT(m) {
  return transportOf(m) === 'stdio' ? null : { url: m.url, auth: Object.keys(m.headers || {}).length ? 'custom headers / OAuth' : 'none or OAuth' };
}

function validate(m) {
  const errs = [];
  if (!m.name) errs.push('missing "name"');
  if (!m.description) errs.push('missing "description"');
  const t = transportOf(m);
  if (!['stdio', 'http', 'sse'].includes(t)) errs.push(`unknown transport "${t}"`);
  if (t === 'stdio' && !m.command) errs.push('stdio server needs "command"');
  if (t !== 'stdio' && !m.url) errs.push(`${t} server needs "url"`);
  if (m.args && !Array.isArray(m.args)) errs.push('"args" must be an array');
  if (m.serverName && !/^[A-Za-z0-9_-]{1,64}$/.test(m.serverName)) errs.push('"serverName" must be letters, digits, "_" or "-"');
  if (m.notes && !Array.isArray(m.notes)) errs.push('"notes" must be a list of strings');
  return errs;
}

module.exports = { serverKey, prepare, transportOf, toClaudeCode, toClaudeDesktop, toCursor, toWindsurf, toGemini, toCodexToml, toChatGPT, validate };
