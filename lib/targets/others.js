'use strict';
/** Smaller adapters: Windsurf, Gemini CLI, ChatGPT (export only). */
const path = require('path');
const { home, which, exists, listFiles, stringifyFrontmatter } = require('../util');
const { jsonSet } = require('../state');
const mcp = require('../mcp');
const { zipDir } = require('../zip');
const { pathAction } = require('../state');
const { put, writeText, prepareMcp, asInstructions, projectDir, requireProject, Unsupported } = require('./common');

const windsurf = {
  id: 'windsurf',
  name: 'Windsurf',
  supports: ['skill', 'agent', 'command', 'mcp'],
  scopes: ['user', 'project'],
  detect: () => exists(path.join(home(), '.codeium', 'windsurf')),
  paths: () => ({ mcp: path.join(home(), '.codeium', 'windsurf', 'mcp_config.json') }),
  install(item, ctx) {
    switch (item.type) {
      case 'skill':
      case 'agent': {
        const root = requireProject(ctx, 'Windsurf rules');
        const data = { trigger: 'model_decision', description: item.description };
        return [writeText(path.join(root, '.windsurf', 'rules', `${item.name}.md`), stringifyFrontmatter(data, item.body), ctx)];
      }
      case 'command': {
        const root = requireProject(ctx, 'Windsurf workflows');
        return [writeText(path.join(root, '.windsurf', 'workflows', `${item.name}.md`), stringifyFrontmatter({ description: item.description }, item.body), ctx)];
      }
      case 'mcp': {
        const { actions, vars } = prepareMcp(item, this.id, ctx);
        const cfg = mcp.toWindsurf(mcp.prepare(item.meta, this.id, vars));
        return [...actions, jsonSet(this.paths().mcp, ['mcpServers', item.name], cfg, ctx)];
      }
      default: throw new Unsupported(`${item.type} not supported`);
    }
  },
};

function geminiBase(ctx) {
  return ctx.scope === 'project' ? path.join(projectDir(ctx), '.gemini') : path.join(home(), '.gemini');
}

const gemini = {
  id: 'gemini',
  name: 'Gemini CLI',
  supports: ['command', 'mcp'],
  scopes: ['user', 'project'],
  detect: () => !!which('gemini') || exists(path.join(home(), '.gemini')),
  paths: (ctx) => ({ settings: path.join(geminiBase(ctx), 'settings.json') }),
  install(item, ctx) {
    switch (item.type) {
      case 'command': {
        const prompt = item.body.trim().replace(/\$ARGUMENTS/g, '{{args}}');
        const toml = `description = ${JSON.stringify(item.description)}\nprompt = """\n${prompt.replace(/"""/g, '\\"\\"\\"')}\n"""\n`;
        return [writeText(path.join(geminiBase(ctx), 'commands', `${item.name}.toml`), toml, ctx)];
      }
      case 'mcp': {
        const { actions, vars } = prepareMcp(item, this.id, ctx);
        const cfg = mcp.toGemini(mcp.prepare(item.meta, this.id, vars));
        return [...actions, jsonSet(path.join(geminiBase(ctx), 'settings.json'), ['mcpServers', item.name], cfg, ctx)];
      }
      default: throw new Unsupported(`${item.type} not supported`);
    }
  },
};

/**
 * ChatGPT / Custom GPTs have no local config to write. We export ready-to-paste material into
 * ./dist/gpt (or --out): instructions for a GPT/Project, knowledge files, skill ZIPs and connector notes.
 */
const gpt = {
  id: 'gpt',
  name: 'ChatGPT / Custom GPTs (export)',
  supports: ['skill', 'agent', 'command', 'mcp'],
  scopes: ['user', 'project'],
  detect: () => false,
  paths: (ctx) => ({ out: outDir(ctx) }),
  install(item, ctx) {
    const out = outDir(ctx);
    const actions = [];
    switch (item.type) {
      case 'skill': {
        actions.push(writeText(path.join(out, item.name, 'instructions.md'), asInstructions(item), ctx));
        const resources = listFiles(item.path).filter((f) => f !== 'SKILL.md');
        if (resources.length) actions.push(put(item.path, path.join(out, item.name, 'knowledge'), { ...ctx, link: false }));
        const zip = path.join(out, `${item.name}.skill.zip`);
        if (!ctx.dryRun) zipDir(item.path, zip, item.name);
        actions.push(pathAction(zip));
        break;
      }
      case 'agent':
      case 'command': {
        const text = asInstructions(item);
        if (text.length > 8000) ctx.notes.push(`${item.id}: ${text.length} chars — Custom GPT instructions are limited to 8000.`);
        actions.push(writeText(path.join(out, item.name, 'instructions.md'), text, ctx));
        break;
      }
      case 'mcp': {
        const remote = mcp.toChatGPT(mcp.prepare(item.meta, this.id));
        if (!remote) throw new Unsupported('ChatGPT can only use remote (http/sse) MCP servers');
        const doc = `# ${item.name} (MCP connector)\n\n${item.description}\n\n- Server URL: ${remote.url}\n- Auth: ${remote.auth}\n\n` +
          'Add it in ChatGPT: Settings → Apps & Connectors → Advanced → enable Developer mode → Create connector, paste the URL.\n';
        actions.push(writeText(path.join(out, `${item.name}.connector.md`), doc, ctx));
        break;
      }
      default: throw new Unsupported(`${item.type} not supported`);
    }
    ctx.notes.push(`ChatGPT export written to ${out}`);
    return actions;
  },
};

function outDir(ctx) {
  return path.resolve(ctx.out || path.join(projectDir(ctx), 'dist', 'gpt'));
}

module.exports = { windsurf, gemini, gpt };
