# 客户端适配说明

`agent-kit targets` 会列出当前机器上检测到的客户端和实际使用的路径。下面的路径都是默认值，括号里是可以覆盖默认值的环境变量。

## Claude Code (`claude-code`)

| 类型 | user 级 | project 级 |
| --- | --- | --- |
| skill | `~/.claude/skills/<name>/` | `.claude/skills/<name>/` |
| agent | `~/.claude/agents/<name>.md` | `.claude/agents/<name>.md` |
| command | `~/.claude/commands/<name>.md` | `.claude/commands/<name>.md` |
| mcp | `~/.claude.json` → `mcpServers` | `.mcp.json` → `mcpServers` |
| hook | `~/.claude/settings.json` → `hooks` | `.claude/settings.json` → `hooks` |
| plugin | 提示使用插件市场命令；加 `--expand` 时拆成组件，复制到上面这些位置 | |

`CLAUDE_CONFIG_DIR` 会改变 `~/.claude` 的位置。MCP 中的 `${env:X}` 会写成 `${X}`，由 Claude Code 在运行时展开。

## Claude Desktop / claude.ai (`claude-desktop`)

- MCP 写入 `claude_desktop_config.json`，路径（`CLAUDE_DESKTOP_CONFIG_DIR`）：
  - macOS: `~/Library/Application Support/Claude/`
  - Windows: `%APPDATA%\Claude\`
  - Linux: `~/.config/Claude/`
- 环境变量在安装时展开成实际值（该配置文件不支持变量引用），缺失的变量会给出警告。
- 远程 MCP 服务会转换为 `npx -y mcp-remote <url> --header ...`。也可以在 Settings → Connectors 中直接添加远程服务。
- Skill 会打包成 ZIP，放在 `~/.agent-kit/dist/claude-desktop/<name>.zip`，需要在 Settings → Capabilities → Skills 中手动上传。用 `agent-kit pack` 可以批量打包。
- 修改配置后需要重启 Claude Desktop。

## Codex (`codex`)

| 类型 | 位置（`CODEX_HOME`，默认 `~/.codex`） |
| --- | --- |
| skill | `$CODEX_HOME/skills/<name>/`（project 级：`.codex/skills/`） |
| command | `$CODEX_HOME/prompts/<name>.md`，用 `/prompts:<name>` 调用 |
| agent | 转换为 `$CODEX_HOME/prompts/<name>.md` 提示词 |
| mcp | `$CODEX_HOME/config.toml` 中的 `[mcp_servers.<name>]` |

`config.toml` 中由 agent-kit 写入的内容会放在 `# >>> agent-kit mcp/<name> >>>` 标记块里，卸载时只删除这些块，不动其他内容。
环境变量的转换规则：
- `env` 中形如 `KEY: ${env:KEY}`（同名直通）的项 → `env_vars = ["KEY"]`
- 请求头 `Authorization: Bearer ${env:T}` → `bearer_token_env_var = "T"`
- 其他请求头中的 `${env:X}` → `env_http_headers`
- 其余值在安装时展开

## Cursor (`cursor`)

| 类型 | user 级 (`~/.cursor`) | project 级 (`.cursor`) |
| --- | --- | --- |
| mcp | `mcp.json` | `mcp.json` |
| command | `commands/<name>.md` | `commands/<name>.md` |
| hook | `hooks.json`（`version: 1`） | `hooks.json` |
| skill / agent | – | `rules/<name>.mdc`（agent requested 类型；skill 的资源文件放在 `rules/<name>/` 并在 rule 中引用） |

`${env:X}` 原样保留，Cursor 原生支持这种写法。

## Windsurf (`windsurf`)

- MCP 写入 `~/.codeium/windsurf/mcp_config.json`（远程服务使用 `serverUrl` 字段），环境变量在安装时展开。
- skill / agent 转换为 `.windsurf/rules/<name>.md`（`trigger: model_decision`），command 转换为 `.windsurf/workflows/<name>.md`，都只支持项目级。

## Gemini CLI (`gemini`)

- MCP 写入 `~/.gemini/settings.json`（project 级：`.gemini/settings.json`），远程 http 服务使用 `httpUrl` 字段。
- command 转换为 `~/.gemini/commands/<name>.toml`，其中 `$ARGUMENTS` 替换为 `{{args}}`。

## ChatGPT / Custom GPTs (`gpt`)

ChatGPT 没有可写的本地配置，所以只做导出，输出到 `--out`（默认 `./dist/gpt`）：
- agent / command / skill 导出为 `<name>/instructions.md`，可以直接粘贴到 GPT 或 Project 的 Instructions 中。超过 8000 字符时会给出提示。
- skill 的资源文件放到 `<name>/knowledge/`，作为 Knowledge 上传；同时生成 `<name>.skill.zip`。
- 远程 MCP 生成 `<name>.connector.md`，说明在 Settings → Apps & Connectors（开发者模式）中添加的步骤。本地 stdio 服务会被跳过。

## 安装状态与备份

- 安装记录保存在 `~/.agent-kit/state.json`（`AGENT_KIT_STATE_DIR`），记录了每次安装写入的文件和修改的配置键。`uninstall` 根据记录逐条撤销。
- 每次运行时，第一次修改某个已有配置文件之前，会先备份为 `<file>.agent-kit-bak-<时间戳>`。
