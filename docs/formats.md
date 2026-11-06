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
  "overrides": { "claude-desktop": { "args": ["-y", "pkg@1.2.3"] } },
  // 可选：写入客户端配置时使用的 server 名，默认等于 name
  "serverName": "github",
  // 可选：依赖的命令，安装时检查 PATH，缺失时给出提示
  "requires": { "bin": ["npx"] },
  // 可选：安装后显示的使用提示
  "notes": ["首次使用前先登录：…"]
}
```

`serverName` 用于同一个服务的多种运行方式，比如 `mcp/goofish`（本机）和 `mcp/goofish-sandbox`（Docker 沙箱）都写成 `goofish`。
这样 skills 里引用的工具名 `mcp__goofish__*` 不用改。在同一客户端、同一作用域中安装其中一个时，会先卸载另一个，避免两份配置同时存在。

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

## Tool — `tools/<name>.json`

用于收藏其他开源工具：桌面应用、库、框架、服务、模型等。和 CLI 一样**只登记链接，不复制源码**，但不要求能自动安装。

```json
{
  "name": "craft-anything",
  "description": "这个工具是什么、为什么值得收藏",
  "category": "app",
  "tags": ["rust"],
  "repo": "https://github.com/storytold/craft-anything",
  "homepage": "https://getartcraft.com/",
  "docs": "https://…",
  "downloads": "https://github.com/storytold/craft-anything/releases/latest",
  "license": "MIT OR Apache-2.0",
  "platforms": ["macos", "windows", "linux"],
  "status": "alpha",
  "notes": ["安装方法、使用提示、注意事项"],
  "bin": "tool-command",
  "install": [{ "manager": "cargo", "package": "crate", "args": ["--git", "https://…", "crate"] }]
}
```

- 必填字段：`name`（与文件名一致）、`description`、`repo` 或 `homepage`。其余都是可选的。
- `category` 可选值：`app`、`cli`、`skills`、`library`、`framework`、`service`、`model`、`dataset`、`other`。
- `skills` 用于自带安装程序的 skill 套件（比如 gstack）。这类 skill 依赖套件里的脚本、hooks 或编译产物，单独复制到 `skills/` 里无法运行，所以只登记链接和官方安装方式。
- 没有 `install` 时，`agent-kit install tool/<name>` 不会执行任何操作，只打印下载地址和 `notes`。
- 声明了 `install` 时，行为和 CLI 类型一样（需要同时填 `bin`）。`args` 可以替换默认的包参数，比如 `cargo install --git <url> <crate>`；这时 `package` 只在卸载时使用。
- 主要通过包管理器安装的命令行工具，优先使用 CLI 类型（`clis/`）。
- `claudePlugin`：如果这个工具本身就是 Claude Code 插件，`agent-kit build` 会把它写进本仓库的插件市场，`/plugin install <name>@agent-kit` 直接从上游安装、始终是最新版，本仓库不保存任何文件。`tools/` 和 `clis/` 都可以用，`resources/` 不行。
  - 来源二选一：GitHub 仓库 `{ "repo": "owner/repo", "ref": "可选分支或 tag" }`（仓库根目录是插件），或 npm 包 `{ "npm": "package-name", "version": "可选" }`（上游发布的是构建好的 npm 包时用这个，比如 REA）。
  - `name`：插件名，默认等于工具名，不能和 `plugins/` 下的插件重复。
  - `entry`：可选，合并进市场条目的额外字段。上游包缺少某些声明时用它补上，比如 `{ "strict": false, "mcpServers": { … } }`；不能覆盖 `name` 和 `source`。

## Resource — `resources/<name>.json`

用于收藏**拿来用的资源**，而不是需要运行或安装的程序，比如素材库、数据集、文档、精选列表、公开 API。只登记链接、许可和用法，不复制内容，也不安装。

```json
{
  "name": "polyfork",
  "description": "这份资源包含什么、什么时候用得上",
  "kind": "assets",
  "tags": ["3d"],
  "repo": "https://github.com/lucas-martinic/polyfork-catalog",
  "homepage": "https://polyfork.dev/assets",
  "docs": "https://…",
  "api": "https://polyfork.dev/llms.txt",
  "license": "用一句话说清楚能怎么用",
  "licenseUrl": "https://polyfork.dev/licensing",
  "notes": ["怎么用：命令、加载方式、给 Agent 的入口"]
}
```

- 必填字段：`name`（与文件名一致）、`description`、`kind`、`repo` 或 `homepage`。
- `kind` 可选值：`assets`（素材库）、`dataset`（数据集）、`docs`（文档）、`list`（精选列表、资源导航站）、`api`、`course`（教程）、`other`。
- 资源经常不是标准开源许可，比如"免费商用但不能再分发"。`license` 写一句话说明，原文链接放在 `licenseUrl`。
- `agent-kit install resource/<name>` 不安装任何东西，只打印链接和 `notes`。资源没有 `install` 字段，validate 会拒绝；可以安装的东西请登记到 `tools/` 或 `clis/`。

**怎么判断放哪一类：** 能用包管理器一条命令装好的命令行工具放 `clis/`；需要运行或安装的程序（应用、库、框架、服务）放 `tools/`；拿来查阅、下载或引用的内容放 `resources/`。

## Script — `scripts/<file>`

任意可执行脚本。在前 15 行内写一行 `# description: …` 作为说明。
`agent-kit install script/<name>` 会把脚本安装到 `~/.local/bin/<name>`（Windows 上是 `~/.agent-kit/bin`），可以用 `AGENT_KIT_BIN` 修改安装位置。
