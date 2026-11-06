# agent-kit

> 个人 AI Agent 工具包：集中存放自己开发或收藏的 **Skill / MCP / Agent / Command / Hook / Plugin / Script / CLI / 开源工具**，
> 一条命令安装到 **Claude Code、Claude Desktop、Codex、Cursor、Windsurf、Gemini CLI、ChatGPT**。收藏的工具会记录上游来源，之后可以随时同步、对比和更新。

- **一份源文件，多端安装**：每类工具只写一次。安装时自动转换成各客户端需要的格式和路径，比如 MCP 会写成 JSON 或 TOML，Skill 会写成 Cursor Rule 或 Codex Skill。
- **收藏可追踪**：`agent-kit add <github-url>` 会导入第三方工具，并在 `sources.json` 记录仓库、路径、commit 和内容哈希。之后用 `outdated` / `diff` / `update` 检查、对比、更新。更新用三方合并，**本地改动会保留**。
- **安装可撤销**：每次安装都会记录改了哪些文件和配置键。`uninstall` 只删除 agent-kit 写入的内容，你自己的配置不受影响。修改配置文件前会自动备份。
- **原生 Claude Code 插件市场**：仓库本身就是一个 marketplace，可以直接 `/plugin marketplace add`。
- **零依赖**：只需要 Node.js ≥ 18 和 git。

## 快速开始

```bash
# 方式 1：一键安装 CLI（克隆到 ~/.agent-kit/repo，并链接到 ~/.local/bin/agent-kit）
curl -fsSL https://raw.githubusercontent.com/hidontknow/agent-kit/main/install.sh | bash

# 方式 2：不安装，直接运行
npx github:hidontknow/agent-kit list

# 方式 3：克隆仓库（推荐给维护者，可以配合 --link 做开发）
git clone https://github.com/hidontknow/agent-kit && cd agent-kit && node bin/agent-kit.js list
```

```bash
agent-kit targets                                   # 查看检测到的客户端和配置路径
agent-kit list                                      # 浏览全部工具
agent-kit install skill/conventional-commit         # 安装到所有检测到的客户端
agent-kit install mcp/github -t claude-code,codex,cursor
agent-kit install agent/code-reviewer -t cursor --project .   # 项目级安装
agent-kit install hook/block-dangerous-commands -t claude-code --dry-run
agent-kit install mcp                               # 安装某一类的全部工具
agent-kit uninstall mcp/github -t codex
agent-kit install cli/goofish-cli                   # 外部 CLI：自动选用本机已有的 uv / pipx / pip 安装
agent-kit list tools && agent-kit info craft-anything # 浏览收藏的开源工具和它们的链接、下载地址
agent-kit list --installed                          # 查看装了什么、装在哪
```

常用参数：

| 参数 | 说明 |
| --- | --- |
| `-t, --target` | `claude-code`、`claude-desktop`、`codex`、`cursor`、`windsurf`、`gemini`、`gpt`，可用逗号分隔多个；也可以写 `all`；不写时为 `detected`（安装到检测到的客户端） |
| `--scope user\|project` | 用户级（默认）或项目级；传 `--project <dir>` 时自动视为 project |
| `--link` | 用符号链接代替复制，改仓库里的文件后立即生效，适合开发调试 |
| `--expand` | 把插件拆成组件后安装（Claude Code 默认走插件市场） |
| `--dry-run` | 只显示将要执行的操作，不改动任何文件 |
| `--out <dir>` | `gpt` 导出目录（默认 `./dist/gpt`） |

## 支持矩阵

| 工具类型 | Claude Code | Claude Desktop | Codex | Cursor | Windsurf | Gemini CLI | ChatGPT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| skill | `~/.claude/skills` | 打包 ZIP 后上传 | `~/.codex/skills` | `.cursor/rules/*.mdc` ¹ | `.windsurf/rules` ¹ | – | 导出为 instructions 和 ZIP |
| agent | `~/.claude/agents` | – | `~/.codex/prompts` ² | `.cursor/rules/*.mdc` ¹ | `.windsurf/rules` ¹ | – | 导出为 GPT instructions |
| command | `~/.claude/commands` | – | `~/.codex/prompts` | `~/.cursor/commands` | `.windsurf/workflows` ¹ | `~/.gemini/commands/*.toml` | 导出 |
| mcp | `~/.claude.json` / `.mcp.json` | `claude_desktop_config.json` ³ | `config.toml` | `~/.cursor/mcp.json` | `mcp_config.json` | `settings.json` | 导出 connector 说明 ⁴ |
| hook | `settings.json` hooks | – | – | `~/.cursor/hooks.json` | – | – | – |
| plugin | 插件市场 / `--expand` | 拆成组件 | 拆成组件 | 拆成组件 | 拆成组件 | 拆成组件 | 拆成组件 |
| script | 安装到 `~/.local/bin`，与客户端无关 | | | | | | |
| cli | 只登记链接，通过 uv / pipx / pip / npm / brew / cargo / go 安装到本机，与客户端无关 | | | | | | |
| tool | 其他开源工具（应用、库、框架、服务…）：只登记链接、下载地址和说明；声明了 `install` 时可以自动安装 | | | | | | |

¹ 仅项目级（`--project`）。² Codex 没有子 Agent 格式，转换为 `/prompts:<name>` 自定义提示词。
³ Claude Desktop 配置文件只支持本地 stdio 服务；远程服务会通过 `mcp-remote` 桥接，`${env:X}` 在安装时展开成实际值。
⁴ ChatGPT 只能使用远程（http/sse）MCP，需要在 Settings → Apps & Connectors（开发者模式）中手动添加。

各客户端的具体路径和格式转换规则见 [docs/targets.md](docs/targets.md)。

## 收藏第三方工具并同步上游

```bash
# 导入单个工具（类型自动识别，也可以用 --type 指定）
agent-kit add https://github.com/anthropics/skills/tree/main/skills/mcp-builder --license Apache-2.0
# 简写形式：owner/repo/path@ref；也支持任意 git URL 加 --path
agent-kit add anthropics/skills/skills/webapp-testing@main
# 指向一个装有多个工具的目录时，会逐个导入
agent-kit add https://github.com/some/repo/tree/main/agents

agent-kit outdated            # 检查上游状态：up-to-date / update-available / local-modified / diverged / removed-upstream
agent-kit outdated -v         # 同时列出上游新增的 commit
agent-kit diff mcp-builder    # 本地 vs 上游最新；--base 显示上游自导入以来改了什么
agent-kit update mcp-builder  # 更新：本地没改过就直接替换；改过就做三方合并，保留本地修改
agent-kit update --all        # 更新全部收藏
agent-kit update x --theirs   # 放弃本地修改，直接使用上游版本
agent-kit untrack x           # 不再跟踪上游（视为自己 fork 的版本）
```

合并冲突时，冲突的文件里会留下 `<<<<<<< local / >>>>>>> upstream` 标记，二进制文件会另存一份 `*.upstream`，同时命令以非零状态退出。
仓库内置的 GitHub Action（`.github/workflows/upstream-sync.yml`）**每天自动同步一次**：能干净更新的工具，会在全部检查通过后直接提交到默认分支，bundle 插件也会一起重新生成；与本地修改冲突的工具，会开一个带冲突标记的 PR 等你处理。启用前需要在仓库设置中给 Actions 开写权限，见 [docs/sync.md](docs/sync.md#每日自动同步github-actions)。
原理和 `sources.json` 格式见 [docs/sync.md](docs/sync.md)。

## 作为 Claude Code 插件市场使用

```bash
claude plugin marketplace add hidontknow/agent-kit
claude plugin install dev-essentials@agent-kit     # 通用开发：/review、/test、test-writer、changelog
claude plugin install rust-migration@agent-kit     # 迁移到 Rust（migrate-to-rust）
claude plugin install wxjava@agent-kit             # WxJava 微信开发（wxjava-integration-guide）
```

在 Claude Code 里也可以用 `/plugin marketplace add hidontknow/agent-kit`，然后 `/plugin install <name>@agent-kit`。`.claude-plugin/marketplace.json` 由 `agent-kit build` 根据 `plugins/` 目录自动生成。

### 按主题打包（bundle）

想把仓库里已有的 skill / agent / command / MCP / hook 按主题组合成插件，不需要复制文件，只要在 `bundles/` 下写一份清单：

```json
// bundles/wxjava.json
{
  "name": "wxjava",
  "description": "WxJava 微信开发 …",
  "keywords": ["wechat", "java"],
  "include": ["skill/wxjava-integration-guide"]
}
```

执行 `agent-kit build` 后会生成 `plugins/wxjava/`。生成的目录不要手动修改，内容以 `skills/` 等源目录为准。
收藏的工具经过 `agent-kit update` 同步上游后，再执行一次 `build`，插件内容就会跟着更新；CI 中的 `build --check` 会拦截没有重新生成的情况。
bundle 默认不写 `version`，Claude Code 会把 git commit SHA 当作版本号，所以每次推送后，用户都能通过 `claude plugin marketplace update agent-kit` 拿到更新。这种情况下 `claude plugin validate` 会提示缺少 version，属于预期行为。如果想手动发版，可以在清单里写 `"version": "1.0.0"` 固定版本。格式见 [docs/formats.md](docs/formats.md#bundle--bundlesnamejson)。

## 目录结构

```
agent-kit/
├── skills/<name>/SKILL.md        # Agent Skills（可附带 scripts/、references/ 等资源）
├── agents/<name>.md              # 子 Agent（Claude Code subagent 格式）
├── commands/<name>.md            # 斜杠命令 / 自定义提示词
├── mcp/<name>.json               # 通用 MCP 清单；本地服务用目录形式 mcp/<name>/mcp.json + 代码
├── hooks/<name>/hook.json        # Hook 清单（claude / cursor 两套事件）和脚本
├── plugins/<name>/               # Claude Code 插件（.claude-plugin/plugin.json）
├── bundles/<name>.json           # 主题插件清单，build 时生成 plugins/<name>/
├── scripts/                      # 独立的命令行脚本
├── clis/<name>.json              # 外部 CLI 工具，只保存链接和安装方式，不复制源码
├── tools/<name>.json             # 其他开源工具（应用、库、框架、服务…），只保存链接和说明
├── templates/                    # `agent-kit new` 使用的模板
├── sources.json                  # 收藏工具的上游锁文件
├── registry.json                 # 生成的索引（供其他工具或网站读取）
├── .claude-plugin/marketplace.json
├── bin/ lib/                     # CLI 源码
└── docs/                         # 格式规范、客户端适配、同步机制
```

## 添加自己的工具

```bash
agent-kit new skill my-skill        # 也可以是 agent / command / mcp / hook / plugin / script / cli / tool
$EDITOR skills/my-skill/SKILL.md
agent-kit validate                  # 检查格式
agent-kit build                     # 更新 registry.json、marketplace.json 和下面的目录表
agent-kit install skill/my-skill --link   # 用软链接安装，边改边测
```

各类型的文件格式见 [docs/formats.md](docs/formats.md)，贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 工具目录

<!-- catalog:start -->
#### skills (5)

| 名称 | 说明 | 来源 |
| --- | --- | --- |
| [`conventional-commit`](skills/conventional-commit) | Write a Conventional Commits message for the staged changes. Use when the user asks to commit, write a commit message, … | original |
| [`mcp-builder`](skills/mcp-builder) | Guide for creating high-quality MCP (Model Context Protocol) servers that enable LLMs to interact with external service… | [collected](https://github.com/anthropics/skills) |
| [`migrate-to-rust`](skills/migrate-to-rust) | Clones, analyzes, plans, and migrates legacy codebases (C++, Fortran, Java, Python, C, Shell) from a GitHub URL or loca… | [collected](https://github.com/google/skills) |
| [`readme-writer`](skills/readme-writer) | Draft or improve a project README by inspecting the repository. Use when the user asks to write, rewrite, or improve a … | original |
| [`wxjava-integration-guide`](skills/wxjava-integration-guide) | 为 Java、Spring Boot 或 Solon 项目生成可验证的 WxJava 接入方案，包括模块选择、BOM、配置、最小调用代码以及单/多账号集成。适用于用户要求接入公众号、小程序、支付、企业微信、开放平台、视频号或微信小店时。 | [collected](https://github.com/binarywang/WxJava) |

#### agents (2)

| 名称 | 说明 | 来源 |
| --- | --- | --- |
| [`code-reviewer`](agents/code-reviewer.md) | Reviews code changes for bugs, security issues and maintainability. Use proactively after writing or modifying code, or… | original |
| [`debugger`](agents/debugger.md) | Root-cause analysis for errors, failing tests and unexpected behavior. Use when something is broken and the cause is no… | original |

#### commands (2)

| 名称 | 说明 | 来源 |
| --- | --- | --- |
| [`explain`](commands/explain.md) | Explain how a file, function or feature works, with a short walkthrough. | original |
| [`fix-issue`](commands/fix-issue.md) | Investigate and fix a GitHub issue end to end — reproduce, fix, test. | original |

#### mcp (8)

| 名称 | 说明 | 来源 |
| --- | --- | --- |
| [`context7`](mcp/context7.json) | Up-to-date, version-specific library documentation and code examples pulled into the prompt. | original |
| [`fetch`](mcp/fetch.json) | Fetch web pages and convert them to markdown for the model (official reference server, needs uv). | original |
| [`filesystem`](mcp/filesystem.json) | Read, write and search files inside allowed directories (official reference server). | original |
| [`github`](mcp/github.json) | GitHub's official remote MCP server: repos, issues, pull requests, actions, code search. | original |
| [`goofish-sandbox`](mcp/goofish-sandbox.json) | 闲鱼 MCP server（Docker 沙箱模式）：浏览器自动化在容器虚拟桌面中运行，不占用本机浏览器。与 mcp/goofish 使用同一个 server 名，二者互相替换。 | original |
| [`goofish`](mcp/goofish.json) | 闲鱼（Goofish/Xianyu）MCP server（本机模式）：商品查询/发布/下架、搜索、图片上传、AI 类目识别、IM 消息收发等 17 个工具，由 goofish-cli 提供。 | original |
| [`kit-tools`](mcp/kit-tools) | Example self-hosted MCP server shipped in this repo (zero dependencies): current time, UUIDs, text hashing. | original |
| [`playwright`](mcp/playwright.json) | Browser automation via Playwright accessibility snapshots (Microsoft). | original |

#### hooks (2)

| 名称 | 说明 | 来源 |
| --- | --- | --- |
| [`block-dangerous-commands`](hooks/block-dangerous-commands) | Blocks destructive shell commands (rm -rf /, force-push to main, mkfs, dd to disks, curl \| sh …) before the agent runs … | original |
| [`notify-on-stop`](hooks/notify-on-stop) | Desktop notification when the agent finishes a turn or needs your input (macOS, Linux, Windows). | original |

#### plugins (3)

| 名称 | 说明 | 来源 |
| --- | --- | --- |
| [`dev-essentials`](plugins/dev-essentials) | Everyday development bundle: /review and /test commands, a test-writer sub-agent and a changelog skill. | original |
| [`rust-migration`](plugins/rust-migration) | 把 C/C++、Fortran、Java、Python、Shell 等遗留代码迁移到 Safe Rust：分析、规划、迁移、PGO 与遥测报告。 | bundle（[bundles/rust-migration.json](bundles/rust-migration.json)） |
| [`wxjava`](plugins/wxjava) | WxJava 微信开发：为 Java / Spring Boot / Solon 项目生成公众号、小程序、支付、企业微信、开放平台等的最小接入方案。 | bundle（[bundles/wxjava.json](bundles/wxjava.json)） |

#### scripts (2)

| 名称 | 说明 | 来源 |
| --- | --- | --- |
| [`agent-context`](scripts/agent-context.sh) | Print a compact project snapshot (tree, manifests, recent commits) to paste into any AI chat. | original |
| [`git-prune-branches`](scripts/git-prune-branches.sh) | Delete local git branches whose upstream is gone or that are merged into the default branch. | original |

#### clis (1)

| 名称 | 说明 | 来源 |
| --- | --- | --- |
| [`goofish-cli`](clis/goofish-cli.json) | 闲鱼（Goofish/Xianyu）自动化 CLI，原生支持 MCP：商品发布/下架/查询、图片上传、AI 类目识别、IM 实时收发、风控限流，内置 5 个 Claude Skills。 | [link](https://github.com/fancyboi999/goofish-cli) |

#### tools (1)

| 名称 | 说明 | 来源 |
| --- | --- | --- |
| [`craft-anything`](tools/craft-anything.json) | 研究任意网站、应用或游戏的实现方式，再让 AI 编码 Agent 按要求重建一个自己的版本（Study → Build → Check → Refine）。纯 Rust 的开源 clean-room 引擎，带桌面应用、CLI 和 MCP … | [link](https://github.com/storytold/craft-anything) |
<!-- catalog:end -->

## 参考与致谢

本项目的结构和格式参考了以下开源项目：

- [anthropics/skills](https://github.com/anthropics/skills)：Agent Skills 规范和官方示例
- [anthropics/claude-code](https://github.com/anthropics/claude-code)：插件和 marketplace 格式
- [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers)：MCP 参考服务
- [wshobson/agents](https://github.com/wshobson/agents)、[VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents)：子 Agent 合集的组织方式
- [davila7/claude-code-templates](https://github.com/davila7/claude-code-templates)：用 CLI 安装组件的思路
- [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code)：资源整理

## License

自有内容采用 [MIT](LICENSE)。收藏的工具保留各自原始的许可证（见 `sources.json` 中的 `license` 字段和各工具目录内的 LICENSE 文件）。
