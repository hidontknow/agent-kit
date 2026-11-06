'use strict';
const fs = require('fs');
const path = require('path');
const { place, ensureDir, template, deepMap, stringifyFrontmatter, isDir } = require('../util');
const { pathAction, stateDir } = require('../state');

class Unsupported extends Error {
  constructor(msg) { super(msg); this.unsupported = true; }
}

/** Copy/symlink an item to dest and return the undo action. */
function put(src, dest, ctx) {
  if (!ctx.dryRun) place(src, dest, { link: ctx.link });
  return pathAction(dest);
}

/** Write generated text content to dest. */
function writeText(dest, content, ctx) {
  if (!ctx.dryRun) {
    ensureDir(path.dirname(dest));
    fs.rmSync(dest, { force: true });
    fs.writeFileSync(dest, content);
  }
  return pathAction(dest);
}

/** Private install area for files that tools execute (hook scripts, local MCP servers). */
function runtimeDir(kind, target, name) {
  return path.join(stateDir(), kind, target, name);
}

/**
 * Hooks: copy the hook directory into a stable location and render ${HOOK_DIR} in its config.
 * Returns { actions, events, tag }.
 */
function prepareHook(item, target, key, ctx) {
  const events = item.meta[key];
  if (!events || !Object.keys(events).length) throw new Unsupported(`hook "${item.name}" has no "${key}" section`);
  const dir = runtimeDir('hooks', target, item.name);
  const actions = [put(item.dir, dir, { ...ctx, link: false })];
  if (!ctx.dryRun) {
    for (const f of fs.readdirSync(dir)) {
      if (/\.(sh|py|js|mjs|ts|rb)$/.test(f)) fs.chmodSync(path.join(dir, f), 0o755);
    }
  }
  const rendered = deepMap(events, (s) => template(s, { HOOK_DIR: dir }));
  return { actions, events: rendered, tag: dir };
}

/** MCP servers shipped as a directory in this repo are copied so ${ITEM_DIR} is stable. */
function prepareMcp(item, target, ctx) {
  if (!item.file || !isDir(item.path)) return { actions: [], vars: {} };
  const dir = runtimeDir('mcp', target, item.name);
  return { actions: [put(item.dir, dir, ctx)], vars: { ITEM_DIR: dir } };
}

/** Convert an agent/skill/command into a plain instruction document (for tools without that concept). */
function asInstructions(item) {
  const title = item.meta.name || item.name;
  return `# ${title}\n\n${item.description ? `> ${item.description}\n\n` : ''}${item.body.trim()}\n`;
}

/** Cursor .mdc rule */
function asCursorRule(item, extra = '') {
  const data = { description: item.description, globs: item.meta.globs, alwaysApply: item.meta.alwaysApply === true };
  return stringifyFrontmatter(data, `${item.body.trim()}\n${extra}`);
}

function projectDir(ctx) {
  return path.resolve(ctx.project || process.cwd());
}

function requireProject(ctx, what) {
  if (ctx.scope !== 'project') throw new Unsupported(`${what} only supports --scope project`);
  return projectDir(ctx);
}

module.exports = { Unsupported, put, writeText, runtimeDir, prepareHook, prepareMcp, asInstructions, asCursorRule, projectDir, requireProject };
