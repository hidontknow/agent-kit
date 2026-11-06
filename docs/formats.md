# 工具格式规范

所有名称统一使用 `kebab-case`（小写字母、数字、连字符，最长 64 个字符），并且必须和文件名或目录名一致。
`agent-kit validate` 会检查本文列出的规则。

## Skill — `skills/<name>/SKILL.md`

遵循 [Agent Skills](https://github.com/anthropics/skills) 规范：

```markdown
---
name: my-skill
description: 这个 skill 做什么。Use when ...（写清楚触发场景，最长 1024 个字符）
tags: [git, writing]          # 可选，agent-kit 用来筛选
---

# 正文：步骤、规则，以及 references/xxx.md 等资源的链接
```

目录下可以放 `scripts/`、`references/`、`assets/` 等资源文件，安装时会整个目录一起复制。
SKILL.md 尽量保持简短，长篇资料放到 `references/` 里，正文中只放链接（渐进式加载）。

## Agent — `agents/<name>.md`

Claude Code 子 Agent 格式：

```markdown
---
name: code-reviewer
description: 擅长什么、何时委派给它（"Use proactively when ..."）
tools: Read, Grep, Glob, Bash   # 可选，不写时继承全部工具
model: inherit                  # 可选：sonnet / opus / haiku / inherit
globs: "**/*.ts"                # 可选，仅用于 Cursor rule
---

系统提示词正文
```

## Command — `commands/<name>.md`

```markdown
---
name: explain
description: 命令说明
argument-hint: <file | symbol>
---

用 $ARGUMENTS 引用参数。安装到 Gemini CLI 时会自动替换成 {{args}}。
```

## MCP — `mcp/<name>.json` 或 `mcp/<name>/mcp.json`

一份清单可以生成所有客户端的配置：

```jsonc
{
  "name": "github",
  "description": "…",
  "tags": ["github"],
  "homepage": "https://…",
  "transport": "stdio",                      // stdio | http | sse；不写时根据 url / command 推断
  // stdio
  "command": "npx",
  "args": ["-y", "pkg@latest", "${HOME}"],
  "env": { "API_KEY": "${env:API_KEY}" },
  // http / sse
  "url": "https://example.com/mcp",
  "headers": { "Authorization": "Bearer ${env:TOKEN}" },
  // 可选：针对某个客户端覆盖部分字段
  "overrides": { "claude-desktop": { "args": ["-y", "pkg@1.2.3"] } }
}
```

支持的占位符：

| 占位符 | 含义 |
| --- | --- |
| `${env:NAME}` | 环境变量。支持变量引用的客户端（Claude Code、Cursor、Gemini、Codex）会保留引用；不支持的客户端（Claude Desktop、Windsurf）在安装时展开成实际值 |
| `${ITEM_DIR}` | 目录形式 MCP 的安装位置（`~/.agent-kit/mcp/<target>/<name>`），用于随仓库分发的本地服务，示例见 `mcp/kit-tools` |
| `${HOME}` | 用户主目录 |

**不要把密钥写进清单。** validate 会拦截疑似 token 的字符串。

## Hook — `hooks/<name>/hook.json` + 脚本

```json
{
  "name": "block-dangerous-commands",
  "description": "…",
  "claude": {
    "PreToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command", "command": "node \"${HOOK_DIR}/guard.js\"" }] }]
  },
  "cursor": {
    "beforeShellExecution": [{ "command": "node \"${HOOK_DIR}/guard.js\" --format cursor" }]
  }
}
```

- `claude` 段的结构和 Claude Code `settings.json` 里的 `hooks` 相同，`cursor` 段和 `~/.cursor/hooks.json` 里的 `hooks` 相同，两段至少要有一段。
- `${HOOK_DIR}` 会替换成 hook 目录的安装位置。整个目录会复制到 `~/.agent-kit/hooks/<target>/<name>`，所以脚本可以随仓库一起分发。
- 卸载时，只删除 command 中包含该 hook 目录路径的条目。

## Plugin — `plugins/<name>/`

标准 [Claude Code 插件](https://docs.claude.com/en/docs/claude-code/plugins) 结构：

```
plugins/my-plugin/
├── .claude-plugin/plugin.json   # name / version / description / author / keywords
├── commands/  agents/  skills/
├── hooks/hooks.json             # 可选，路径用 ${CLAUDE_PLUGIN_ROOT}
└── .mcp.json                    # 可选
```

安装到其他客户端时，插件会被拆成 skills / agents / commands / .mcp.json 分别安装，hooks 只对 Claude Code 生效。

## Bundle — `bundles/<name>.json`

把仓库里已有的工具按主题组合成 Claude Code 插件，不需要复制文件：

```json
{
  "name": "rust-migration",
  "description": "插件说明",
  "keywords": ["rust"],
  "include": ["skill/migrate-to-rust", "agent/debugger", "mcp/context7", "hook/notify-on-stop"],
  "version": "1.0.0"
}
```

- `include` 中可以写 `type/name` 或 `type/*`，支持 skill、agent、command、mcp、hook，不能包含 plugin 或 script。
- `agent-kit build` 会重新生成 `plugins/<name>/`，并在其中的 README 第一行写入 generated 标记。这个目录不要手动修改；删除 bundle 清单后，再次 build 会删除对应的插件目录。
- MCP 汇总写入插件的 `.mcp.json`。目录形式的本地 MCP 服务会复制到 `mcp/<name>/`，`${ITEM_DIR}` 改写为 `${CLAUDE_PLUGIN_ROOT}/mcp/<name>`，`${HOME}` 保持原样，由 Claude Code 在运行时展开。
- hook 的 `claude` 段汇总写入 `hooks/hooks.json`，`${HOOK_DIR}` 改写为 `${CLAUDE_PLUGIN_ROOT}/hooks/<name>`。
- 不写 `version` 时，Claude Code 使用 git commit SHA 作为版本号，源工具更新后用户一定能收到；写了 `version` 就固定为这个版本，需要手动升版本号才会推送更新。
- 和手写插件重名时，validate 会报错。

## CLI — `clis/<name>.json`

用于收藏外部命令行工具。**只保存链接和安装方式，不复制源码**，所以没有上游同步的问题，升级交给包管理器。

```json
{
  "name": "goofish-cli",
  "description": "这个 CLI 做什么",
  "tags": ["python"],
  "repo": "https://github.com/fancyboi999/goofish-cli",
  "homepage": "",
  "docs": "https://…/docs/mcp-setup.md",
  "license": "Apache-2.0",
  "bin": "goofish",
  "requires": "Python >= 3.11",
  "install": [
    { "manager": "uv", "package": "goofish-cli" },
    { "manager": "pipx", "package": "goofish-cli" },
    { "manager": "pip", "package": "goofish-cli" }
  ],
  "notes": ["安装后的使用提示，install / info 时显示"]
}
```

- 必填字段：`name`（与文件名一致）、`description`、`repo` 或 `homepage`、`bin`（工具提供的命令名）、`install`。
- `install` 按顺序尝试，使用第一个本机可用的包管理器，也可以用 `--via <manager>` 指定。支持 `uv`（`uv tool install`）、`pipx`、`pip`（`--user`）、`npm`（`-g`）、`brew`、`cargo`、`go`。`package` 里可以写版本，如 `pkg==1.2.3` 或 `pkg@1.2.3`。
- `bin` 已经在 PATH 上时跳过安装，加 `--force` 可以强制安装。
- `uninstall` 会调用对应包管理器的卸载命令（`go` 没有卸载命令，需要手动删除）。
- 升级用包管理器自己的命令，比如 `uv tool upgrade goofish-cli`。
- 如果这个工具还提供 MCP server 或 skills，可以另外在 `mcp/` 下登记一份配置，或在 `notes` 里写明用法。

## Script — `scripts/<file>`

任意可执行脚本。在前 15 行内写一行 `# description: …` 作为说明。
`agent-kit install script/<name>` 会把脚本安装到 `~/.local/bin/<name>`（Windows 上是 `~/.agent-kit/bin`），可以用 `AGENT_KIT_BIN` 修改安装位置。
