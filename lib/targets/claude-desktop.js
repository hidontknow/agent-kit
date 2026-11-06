'use strict';
const path = require('path');
const { home, exists } = require('../util');
const { jsonSet, pathAction, stateDir } = require('../state');
const mcp = require('../mcp');
const { zipDir } = require('../zip');
const { prepareMcp, Unsupported } = require('./common');

function configDir() {
  if (process.env.CLAUDE_DESKTOP_CONFIG_DIR) return process.env.CLAUDE_DESKTOP_CONFIG_DIR;
  if (process.platform === 'darwin') return path.join(home(), 'Library', 'Application Support', 'Claude');
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home(), 'AppData', 'Roaming'), 'Claude');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home(), '.config'), 'Claude');
}

module.exports = {
  id: 'claude-desktop',
  name: 'Claude Desktop / claude.ai',
  supports: ['mcp', 'skill'],
  scopes: ['user'],
  detect: () => exists(configDir()),
  paths: () => ({ config: path.join(configDir(), 'claude_desktop_config.json') }),

  install(item, ctx) {
    switch (item.type) {
      case 'mcp': {
        const { actions, vars } = prepareMcp(item, this.id, ctx);
        const cfg = mcp.toClaudeDesktop(mcp.prepare(item.meta, this.id, vars));
        ctx.notes.push('Restart Claude Desktop to load MCP changes.');
        return [...actions, jsonSet(path.join(configDir(), 'claude_desktop_config.json'), ['mcpServers', mcp.serverKey(item)], cfg, ctx)];
      }
      case 'skill': {
        // Skills in Claude Desktop / claude.ai are uploaded as a ZIP in Settings → Capabilities → Skills.
        const out = path.join(stateDir(), 'dist', 'claude-desktop', `${item.name}.zip`);
        if (!ctx.dryRun) zipDir(item.path, out, item.name);
        ctx.notes.push(`Upload ${out} in Claude Desktop / claude.ai: Settings → Capabilities → Skills → Upload skill.`);
        return [pathAction(out)];
      }
      default: throw new Unsupported(`${item.type} not supported`);
    }
  },
};
