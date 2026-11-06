'use strict';
const path = require('path');
const { home, which, exists, stringifyFrontmatter } = require('../util');
const { textBlockSet } = require('../state');
const mcp = require('../mcp');
const { put, writeText, prepareMcp, projectDir, Unsupported } = require('./common');

function codexHome(ctx) {
  if (ctx.scope === 'project') return path.join(projectDir(ctx), '.codex');
  return process.env.CODEX_HOME || path.join(home(), '.codex');
}

/** Codex custom prompts live in $CODEX_HOME/prompts (user level) and are invoked as /prompts:<name>. */
function promptFile(item, ctx) {
  if (ctx.scope === 'project') ctx.notes.push('Codex custom prompts are user-level; installed into $CODEX_HOME/prompts.');
  const dir = path.join(process.env.CODEX_HOME || path.join(home(), '.codex'), 'prompts');
  return path.join(dir, `${item.name}.md`);
}

module.exports = {
  id: 'codex',
  name: 'OpenAI Codex (CLI / IDE)',
  supports: ['skill', 'agent', 'command', 'mcp'],
  scopes: ['user', 'project'],
  detect: () => !!which('codex') || exists(path.join(home(), '.codex')),
  paths: (ctx) => ({ home: codexHome(ctx), config: path.join(codexHome(ctx), 'config.toml') }),

  install(item, ctx) {
    switch (item.type) {
      case 'skill': return [put(item.path, path.join(codexHome(ctx), 'skills', item.name), ctx)];
      case 'command': {
        const data = { description: item.description, 'argument-hint': item.meta['argument-hint'] };
        return [writeText(promptFile(item, ctx), stringifyFrontmatter(data, item.body), ctx)];
      }
      case 'agent': {
        // Codex has no sub-agent file format: expose the agent as a reusable prompt (/prompts:<name>).
        const body = `You are acting as the "${item.name}" agent.\n\n${item.body.trim()}\n\nTask: $ARGUMENTS\n`;
        return [writeText(promptFile(item, ctx), stringifyFrontmatter({ description: item.description }, body), ctx)];
      }
      case 'mcp': {
        const { actions, vars } = prepareMcp(item, this.id, ctx);
        const toml = mcp.toCodexToml(item.name, mcp.prepare(item.meta, this.id, vars));
        return [...actions, textBlockSet(path.join(codexHome(ctx), 'config.toml'), `mcp/${item.name}`, toml, ctx)];
      }
      default: throw new Unsupported(`${item.type} not supported`);
    }
  },
};
