'use strict';
const path = require('path');
const { home, which, repoRoot, exists } = require('../util');
const { jsonSet, hooksAdd } = require('../state');
const mcp = require('../mcp');
const { put, prepareHook, prepareMcp, projectDir, Unsupported } = require('./common');

function configDir(ctx) {
  if (ctx.scope === 'project') return path.join(projectDir(ctx), '.claude');
  return process.env.CLAUDE_CONFIG_DIR || path.join(home(), '.claude');
}

function mcpFile(ctx) {
  if (ctx.scope === 'project') return path.join(projectDir(ctx), '.mcp.json');
  return process.env.CLAUDE_CONFIG_DIR ? path.join(process.env.CLAUDE_CONFIG_DIR, '.claude.json') : path.join(home(), '.claude.json');
}

module.exports = {
  id: 'claude-code',
  name: 'Claude Code',
  supports: ['skill', 'agent', 'command', 'mcp', 'hook', 'plugin'],
  scopes: ['user', 'project'],
  detect: () => !!which('claude') || exists(path.join(home(), '.claude')),
  paths: (ctx) => ({ config: configDir(ctx), mcp: mcpFile(ctx) }),

  install(item, ctx) {
    const base = configDir(ctx);
    switch (item.type) {
      case 'skill': return [put(item.path, path.join(base, 'skills', item.name), ctx)];
      case 'agent': return [put(item.path, path.join(base, 'agents', `${item.name}.md`), ctx)];
      case 'command': return [put(item.path, path.join(base, 'commands', `${item.name}.md`), ctx)];
      case 'mcp': {
        const { actions, vars } = prepareMcp(item, this.id, ctx);
        const cfg = mcp.toClaudeCode(mcp.prepare(item.meta, this.id, vars));
        return [...actions, jsonSet(mcpFile(ctx), ['mcpServers', mcp.serverKey(item)], cfg, ctx)];
      }
      case 'hook': {
        const { actions, events, tag } = prepareHook(item, this.id, 'claude', ctx);
        return [...actions, hooksAdd(path.join(base, 'settings.json'), 'claude', events, tag, ctx)];
      }
      case 'plugin': {
        // Native plugin install goes through Claude Code's marketplace system.
        const market = 'agent-kit';
        const src = ctx.marketplace || repoRoot();
        ctx.notes.push(
          `Claude Code plugins are installed through the plugin marketplace. Run:\n` +
          `    claude plugin marketplace add ${src}\n` +
          `    claude plugin install ${item.name}@${market}\n` +
          `  (or inside Claude Code: /plugin marketplace add ${src}  then  /plugin install ${item.name}@${market})\n` +
          `  Use --expand to copy the plugin's components into ~/.claude directly instead.`,
        );
        return [];
      }
      default: throw new Unsupported(`${item.type} not supported`);
    }
  },
};
