'use strict';
/**
 * Installation state + reversible "actions".
 * Every installer returns a list of actions describing what it changed so `uninstall` can undo them
 * without each target having to implement its own uninstall logic.
 */
const fs = require('fs');
const path = require('path');
const { home, exists, readJSON, writeJSON, backup, rmrf, ensureDir } = require('./util');

function stateDir() {
  return process.env.AGENT_KIT_STATE_DIR || path.join(home(), '.agent-kit');
}
function stateFile() { return path.join(stateDir(), 'state.json'); }

function loadState() { return readJSON(stateFile(), { version: 1, installs: {} }); }
function saveState(s) { writeJSON(stateFile(), s); }

function key(target, scope, id, project) {
  return [target, scope, scope === 'project' ? project : '', id].join('|');
}

function record(entry) {
  const s = loadState();
  s.installs[key(entry.target, entry.scope, entry.id, entry.project)] = { ...entry, at: new Date().toISOString() };
  saveState(s);
}

function forget(target, scope, id, project) {
  const s = loadState();
  const k = key(target, scope, id, project);
  const entry = s.installs[k];
  delete s.installs[k];
  saveState(s);
  return entry;
}

function find(target, scope, id, project) {
  return loadState().installs[key(target, scope, id, project)];
}

// ---------- reversible operations ----------

/** Set obj[keys...] = value in a JSON file. */
function jsonSet(file, keys, value, { dryRun } = {}) {
  if (!dryRun) {
    const data = readJSON(file, {});
    let cur = data;
    for (const k of keys.slice(0, -1)) cur = cur[k] = cur[k] && typeof cur[k] === 'object' ? cur[k] : {};
    cur[keys[keys.length - 1]] = value;
    backup(file);
    writeJSON(file, data);
  }
  return { kind: 'json-key', file, keys };
}

function jsonDelete(file, keys) {
  if (!exists(file)) return;
  const data = readJSON(file, {});
  let cur = data;
  for (const k of keys.slice(0, -1)) { if (!cur[k]) return; cur = cur[k]; }
  if (!(keys[keys.length - 1] in cur)) return;
  delete cur[keys[keys.length - 1]];
  backup(file);
  writeJSON(file, data);
}

function blockMarkers(id) {
  return { start: `# >>> agent-kit ${id} >>>`, end: `# <<< agent-kit ${id} <<<` };
}

/** Insert/replace a marked block of text (used for TOML configs we don't want to fully parse). */
function textBlockSet(file, id, content, { dryRun } = {}) {
  if (!dryRun) {
    const { start, end } = blockMarkers(id);
    let txt = exists(file) ? fs.readFileSync(file, 'utf8') : '';
    txt = removeBlock(txt, id);
    const block = `${start}\n${content.trimEnd()}\n${end}\n`;
    txt = txt.trimEnd() ? `${txt.trimEnd()}\n\n${block}` : block;
    backup(file);
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, txt);
  }
  return { kind: 'text-block', file, id };
}

function removeBlock(txt, id) {
  const { start, end } = blockMarkers(id);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return txt.replace(new RegExp(`\\n*${esc(start)}[\\s\\S]*?${esc(end)}\\n?`, 'g'), '\n').replace(/^\n+/, '');
}

/**
 * Merge hook entries into a settings file. Each command we add contains `tag` (the hook's install dir)
 * so we can find and remove exactly our entries later.
 *  format "claude": { hooks: { Event: [ { matcher, hooks: [ {type, command} ] } ] } }
 *  format "cursor": { version: 1, hooks: { event: [ { command } ] } }
 */
function hooksAdd(file, format, events, tag, { dryRun } = {}) {
  if (!dryRun) {
    const data = readJSON(file, {});
    stripHooks(data, format, tag);
    if (format === 'cursor' && !data.version) data.version = 1;
    data.hooks = data.hooks || {};
    for (const [event, entries] of Object.entries(events)) {
      data.hooks[event] = (data.hooks[event] || []).concat(entries);
    }
    backup(file);
    writeJSON(file, data);
  }
  return { kind: 'hooks', file, format, tag };
}

function stripHooks(data, format, tag) {
  if (!data.hooks) return;
  const mine = (cmd) => typeof cmd === 'string' && cmd.includes(tag);
  for (const event of Object.keys(data.hooks)) {
    let list = data.hooks[event];
    if (!Array.isArray(list)) continue;
    if (format === 'claude') {
      list = list
        .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !mine(h.command)) }))
        .filter((g) => g.hooks.length);
    } else {
      list = list.filter((h) => !mine(h.command));
    }
    if (list.length) data.hooks[event] = list;
    else delete data.hooks[event];
  }
  if (!Object.keys(data.hooks).length) delete data.hooks;
}

function pathAction(p) { return { kind: 'path', path: p }; }

function undo(action) {
  switch (action.kind) {
    case 'path': rmrf(action.path); break;
    case 'json-key': jsonDelete(action.file, action.keys); break;
    case 'text-block':
      if (exists(action.file)) { backup(action.file); fs.writeFileSync(action.file, removeBlock(fs.readFileSync(action.file, 'utf8'), action.id)); }
      break;
    case 'hooks':
      if (exists(action.file)) { const d = readJSON(action.file, {}); stripHooks(d, action.format, action.tag); backup(action.file); writeJSON(action.file, d); }
      break;
    default: throw new Error(`Unknown action kind ${action.kind}`);
  }
}

module.exports = { stateDir, loadState, record, forget, find, jsonSet, textBlockSet, hooksAdd, pathAction, undo, removeBlock };
