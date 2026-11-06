'use strict';
const path = require('path');
const { home, which, exists, listFiles } = require('../util');
const { jsonSet, hooksAdd } = require('../state');
const mcp = require('../mcp');
const { put, writeText, prepareHook, prepareMcp, asCursorRule, projectDir, requireProject, Unsupported } = require('./common');

function base(ctx) {
  return ctx.scope === 'project' ? path.join(projectDir(ctx), '.cursor') : path.join(home(), '.cursor');
}

module.exports = {
  id: 'cursor',
  name: 'Cursor',
  supports: ['skill', 'agent', 'command', 'mcp', 'hook'],
  scopes: ['user', 'project'],
  detect: () => !!which('cursor') || exists(path.join(home(), '.cursor')),
  paths: (ctx) => ({ config: base(ctx), mcp: path.join(base(ctx), 'mcp.json') }),

  install(item, ctx) {
    switch (item.type) {
      case 'skill': {
        // Skills become an "agent requested" rule; bundled resources are copied next to it.
        const root = requireProject(ctx, 'Cursor rules (skills/agents)');
        const rulesDir = path.join(root, '.cursor', 'rules');
        const actions = [];
        let extra = '';
        const resources = listFiles(item.path).filter((f) => f !== 'SKILL.md');
        if (resources.length) {
          const resDir = path.join(rulesDir, item.name);
          actions.push(put(item.path, resDir, ctx));
          extra = `\n\nSupporting files for this rule are in \`.cursor/rules/${item.name}/\`:\n${resources.map((f) => `- @.cursor/rules/${item.name}/${f}`).join('\n')}\n`;
        }
        actions.push(writeText(path.join(rulesDir, `${item.name}.mdc`), asCursorRule(item, extra), ctx));
        return actions;
      }
      case 'agent': {
        const root = requireProject(ctx, 'Cursor rules (skills/agents)');
        return [writeText(path.join(root, '.cursor', 'rules', `${item.name}.mdc`), asCursorRule(item), ctx)];
      }
      case 'command': return [put(item.path, path.join(base(ctx), 'commands', `${item.name}.md`), ctx)];
      case 'mcp': {
        const { actions, vars } = prepareMcp(item, this.id, ctx);
        const cfg = mcp.toCursor(mcp.prepare(item.meta, this.id, vars));
        return [...actions, jsonSet(path.join(base(ctx), 'mcp.json'), ['mcpServers', mcp.serverKey(item)], cfg, ctx)];
      }
      case 'hook': {
        const { actions, events, tag } = prepareHook(item, this.id, 'cursor', ctx);
        return [...actions, hooksAdd(path.join(base(ctx), 'hooks.json'), 'cursor', events, tag, ctx)];
      }
      default: throw new Unsupported(`${item.type} not supported`);
    }
  },
};
