# agent-kit

> 个人 AI Agent 工具包：集中存放自己开发或收藏的 **Skill / MCP / Agent / Command / Hook / Plugin / Script / CLI / 开源工具 / 资源**，
> 一条命令安装到 **Claude Code、Claude Desktop、Codex、Cursor、Windsurf、Gemini CLI、ChatGPT**。收藏的工具会记录上游来源，之后可以随时同步、对比和更新。

- **一份源文件，多端安装**：每类工具只写一次。安装时自动转换成各客户端需要的格式和路径，比如 MCP 会写成 JSON 或 TOML，Skill 会写成 Cursor Rule 或 Codex Skill。
- **收藏可追踪**：`agent-kit add <github-url>` 会导入第三方工具，并在 `sources.json` 记录仓库、路径、commit 和内容哈希。之后用 `outdated` / `diff` / `update` 检查、对比、更新。更新用三方合并，**本地改动会保留**。
- **安装可撤销**：每次安装都会记录改了哪些文件和配置键。`uninstall` 只删除 agent-kit 写入的内容，你自己的配置不受影响。修改配置文件前会自动备份。
- **原生 Claude Code 插件市场**：仓库本身就是一个 marketplace，可以直接 `/plugin marketplace add`。
- **零依赖**：只需要 Node.js ≥ 18 和 git。

## 快速开始

```bash
# 方式 1：一键安装 CLI（克隆到 ~/.agent-kit/repo，并链接到 ~/.local/bin/agent-kit）
curl -fsSL https://raw.githubusercontent.com/hidontknow/agent-kit/master/install.sh | bash

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
agent-kit list tools && agent-kit info tool/craft-anything # 浏览收藏的开源工具和它们的链接、下载地址
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
| resource | 资源（素材库、数据集、文档、精选列表、资源站、API…）：只登记链接、许可和用法，不安装 | | | | | | |

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
claude plugin install security@agent-kit           # 安全审计（Cloudflare security-audit）
claude plugin install desktop-automation@agent-kit # 桌面 computer use（agent-desktop skill + MCP，插件自带 agent-desktop）
claude plugin install cad-modeling@agent-kit       # 参数化 3D CAD（SolidCraft MCP + 4 个建模 skill，需先装 SolidCraft）
claude plugin install ponytail@agent-kit           # 懒惰资深开发模式（直接从上游 DietrichGebert/ponytail 安装）
claude plugin install design-engineering@agent-kit # 动画与设计工程（Emil Kowalski 的 18 个 skill）
claude plugin install interfaces@agent-kit         # 界面设计：排版、配色、无障碍、布局、文案（直接从上游 jakubkrehel/skills 安装）
claude plugin install taste-skill@agent-kit        # 高水准公司官网（直接从上游 Leonxlnx/taste-skill 安装）
claude plugin install superpowers@agent-kit        # 完整开发方法论：计划、TDD、调试、审查（直接从上游 obra/superpowers 安装）
claude plugin install mattpocock-skills@agent-kit  # Matt Pocock 的工程 skill（直接从上游 mattpocock/skills 安装）
claude plugin install rea@agent-kit                # 逆向工程 MCP + skill（从 npm 包 rea-agents 安装）
claude plugin install text-to-cad@agent-kit        # 用 Python 脚本设计实体产品 + 加工服务（上游 earthtojake/text-to-cad 的 latest 分支）
claude plugin install rust-native-ui@agent-kit     # Rust 原生 UI：NSH 与 GPUI Kit 的编码和设计规范 skill
claude plugin install ecc@agent-kit                # ECC 大型增强套件：子 Agent、skill、命令、hooks（直接从上游 affaan-m/ECC 安装）
claude plugin install prompts-chat@agent-kit       # prompts.chat 提示词库：MCP + 检索 skill（上游仓库子目录中的官方插件）
claude plugin install utools@agent-kit             # uTools 插件开发（官方 utools-plugin-dev skill）
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
├── resources/<name>.json         # 资源（素材库、数据集、文档、精选列表、API…），只保存链接、许可和用法
├── templates/                    # `agent-kit new` 使用的模板
├── sources.json                  # 收藏工具的上游锁文件
├── registry.json                 # 生成的索引（供其他工具或网站读取）
├── .claude-plugin/marketplace.json
├── bin/ lib/                     # CLI 源码
└── docs/                         # 格式规范、客户端适配、同步机制
```

## 添加自己的工具

```bash
agent-kit new skill my-skill        # 也可以是 agent / command / mcp / hook / plugin / script / cli / tool / resource
$EDITOR skills/my-skill/SKILL.md
agent-kit validate                  # 检查格式
agent-kit build                     # 更新 registry.json、marketplace.json 和下面的目录表
agent-kit install skill/my-skill --link   # 用软链接安装，边改边测
```

各类型的文件格式见 [docs/formats.md](docs/formats.md)，贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 工具目录

<!-- catalog:start -->
#### skills (38)

| 名称 | 说明 | 来源 |
| --- | --- | --- |
| [`agent-desktop`](skills/agent-desktop) | Operate desktop applications on macOS, Windows and Linux through native accessibility trees, using the agent-desktop CL… | [collected](https://github.com/vercel-labs/agent-desktop) |
| [`animate`](skills/animate) | Build an animation from scratch, making the decisions in the order that determines whether it feels right — should it a… | [collected](https://github.com/emilkowalski/skills) |
| [`animate-expo`](skills/animate-expo) | Build animations in React Native and Expo, making the decisions in the order that determines whether they feel right — … | [collected](https://github.com/emilkowalski/skills) |
| [`animation-performance`](skills/animation-performance) | Keep web animations inside the frame budget — animate composite-only properties, keep motion off the main thread when t… | [collected](https://github.com/emilkowalski/skills) |
| [`animation-vocabulary`](skills/animation-vocabulary) | Reverse-lookup glossary that turns a vague description of a web animation or motion effect into its exact term ("the bo… | [collected](https://github.com/emilkowalski/skills) |
| [`apple-design`](skills/apple-design) | Apple's approach to interface design and fluid, physical motion, translated for the web. Use when building or reviewing… | [collected](https://github.com/emilkowalski/skills) |
| [`ask-sonner`](skills/ask-sonner) | Guide to Sonner, the React toast library — install and wire up the Toaster, pick the right toast() call, promise and lo… | [collected](https://github.com/emilkowalski/skills) |
| [`book-to-skill`](skills/book-to-skill) | Converts books and documents (PDF, EPUB, DOCX, HTML, Markdown, plain text, RTF, MOBI/AZW with Calibre) into structured … | [collected](https://github.com/virgiliojr94/book-to-skill) |
| [`break-ui`](skills/break-ui) | Try to break a piece of UI by feeding it worst-case data — long names, unbreakable emails, one-letter names, missing fi… | [collected](https://github.com/emilkowalski/skills) |
| [`choreograph`](skills/choreograph) | Coordinate several elements that animate together — decide what moves, in what order, how much they overlap, and what s… | [collected](https://github.com/emilkowalski/skills) |
| [`conventional-commit`](skills/conventional-commit) | Write a Conventional Commits message for the staged changes. Use when the user asks to commit, write a commit message, … | original |
| [`diagram-design`](skills/diagram-design) | Create branded architecture, architecture delta, IT current-state, flowchart, sequence, state machine, ER/data model, t… | [collected](https://github.com/cathrynlavery/diagram-design) |
| [`emil-design-eng`](skills/emil-design-eng) | This skill encodes Emil Kowalski's philosophy on UI polish, component design, animation decisions, and the invisible de… | [collected](https://github.com/emilkowalski/skills) |
| [`find-animation-opportunities`](skills/find-animation-opportunities) | Search a codebase or UI for places that don't animate but should, and reject everything that shouldn't. Read-only; it p… | [collected](https://github.com/emilkowalski/skills) |
| [`gestures`](skills/gestures) | Build drag, swipe, and sheet interactions that track the finger 1:1 and stay interruptible. Use when building or fixing… | [collected](https://github.com/emilkowalski/skills) |
| [`gpui-kit`](skills/gpui-kit) | How to build desktop applications with GPUI Kit, the Rust framework published as the gpui-kit crate (GPUI plus gpui_kit… | [collected](https://github.com/longbridge/gpui-kit) |
| [`gpui-kit-design-guides`](skills/gpui-kit-design-guides) | The normative Design Guides for GPUI Kit desktop applications. Read in full before designing or changing any screen, la… | [collected](https://github.com/longbridge/gpui-kit) |
| [`humanizer`](skills/humanizer) | Rewrite AI-sounding text so it reads like the writer without changing what it says. Use when editing or reviewing prose… | [collected](https://github.com/blader/humanizer) |
| [`improve-animations`](skills/improve-animations) | Survey a codebase's animation and motion code as a senior motion advisor, then produce a prioritized audit and self-con… | [collected](https://github.com/emilkowalski/skills) |
| [`mcp-builder`](skills/mcp-builder) | Guide for creating high-quality MCP (Model Context Protocol) servers that enable LLMs to interact with external service… | [collected](https://github.com/anthropics/skills) |
| [`migrate-to-rust`](skills/migrate-to-rust) | Clones, analyzes, plans, and migrates legacy codebases (C++, Fortran, Java, Python, C, Shell) from a GitHub URL or loca… | [collected](https://github.com/google/skills) |
| [`mobile-native`](skills/mobile-native) | Make a web app feel native on a phone — the small CSS and meta-tag fixes that separate "a website in a browser" from so… | [collected](https://github.com/emilkowalski/skills) |
| [`nsh`](skills/nsh) | Build, run, test and package Native Shell (NSH) apps in Rust, TSX or both. Use for NSH development requests and project… | [collected](https://github.com/longbridge/nsh) |
| [`nsh-design-guides`](skills/nsh-design-guides) | The normative Design Guides for Native Shell (NSH) apps. Read before designing or changing any screen, layout, spacing,… | [collected](https://github.com/longbridge/nsh) |
| [`pick-ui-library`](skills/pick-ui-library) | Pick the right library for a given frontend task from a curated, opinionated list — numbers, OTP inputs, charts, comman… | [collected](https://github.com/emilkowalski/skills) |
| [`prototype`](skills/prototype) | Build multiple genuinely different versions of a UI piece you describe, rendered behind a visual picker so you can flip… | [collected](https://github.com/emilkowalski/skills) |
| [`readme-writer`](skills/readme-writer) | Draft or improve a project README by inspecting the repository. Use when the user asks to write, rewrite, or improve a … | original |
| [`remove-animations`](skills/remove-animations) | Find the animations an interface doesn't need and remove them — motion on keyboard actions, high-frequency surfaces, fu… | [collected](https://github.com/emilkowalski/skills) |
| [`review-animations`](skills/review-animations) | Reviews animation and motion code against a high craft bar derived from Emil Kowalski's design engineering philosophy. … | [collected](https://github.com/emilkowalski/skills) |
| [`security-audit`](skills/security-audit) | Security guidance and vulnerability review for codebases, APIs, services, CLI tools, libraries, and daemons. Use for se… | [collected](https://github.com/cloudflare/security-audit-skill) |
| [`solidcraft-checking`](skills/solidcraft-checking) | Use alongside solidcraft-modeling and solidcraft-editing whenever you build, change or port a SolidCraft design. Checks… | [collected](https://github.com/tangency-labs/solidcraft) |
| [`solidcraft-editing`](skills/solidcraft-editing) | Use when changing, fixing or extending an existing SolidCraft design through its MCP server - a .sc file (or an older .… | [collected](https://github.com/tangency-labs/solidcraft) |
| [`solidcraft-mechanisms`](skills/solidcraft-mechanisms) | Use when building, driving or animating an assembly or mechanism in SolidCraft through its MCP server - components, gro… | [collected](https://github.com/tangency-labs/solidcraft) |
| [`solidcraft-modeling`](skills/solidcraft-modeling) | Use when building a new part, enclosure, bracket, plate, flange or any other 3D solid in SolidCraft through its MCP ser… | [collected](https://github.com/tangency-labs/solidcraft) |
| [`untangle-codebase`](skills/untangle-codebase) | Untangle a whole codebase in one pass, so agents working in it read less per change, break less without noticing, and d… | [collected](https://github.com/caldoai/skills) |
| [`utools-plugin-dev`](skills/utools-plugin-dev) | 开发和维护 uTools 插件应用时使用。适用于已有插件项目的功能实现、代码修改、uTools API 集成、问题排查与开发规范查询。 | [collected](https://github.com/uTools-Labs/utools-plugin-dev-skill) |
| [`write-swift`](skills/write-swift) | How to write modern Swift well — modeling with value types, Swift 6 data-race safety and approachable concurrency (@con… | [collected](https://github.com/emilkowalski/skills) |
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

#### mcp (18)

| 名称 | 说明 | 来源 |
| --- | --- | --- |
| [`agent-desktop`](mcp/agent-desktop.json) | agent-desktop 的 MCP server（stdio）：每个命令都是一个工具（desktop_snapshot、desktop_click、desktop_session_start…），通过无障碍树查看和操作 macOS /… | original |
| [`browser-harness`](mcp/browser-harness.json) | browser-harness 的 MCP server（stdio）：让 Cursor 等 MCP 客户端通过 CDP 控制你的 Chrome 或 Browser Use 云浏览器。 | original |
| [`context7`](mcp/context7.json) | Up-to-date, version-specific library documentation and code examples pulled into the prompt. | original |
| [`craft-anything`](mcp/craft-anything.json) | Craft Anything 的 MCP server：320 个工具，用于研究网站/应用/游戏的实现（页面、代码、文件、运行行为），并驱动编码 Agent 重建（rebuild）。需要先安装 tool/craft-anything。 | original |
| [`fetch`](mcp/fetch.json) | Fetch web pages and convert them to markdown for the model (official reference server, needs uv). | original |
| [`filesystem`](mcp/filesystem.json) | Read, write and search files inside allowed directories (official reference server). | original |
| [`github`](mcp/github.json) | GitHub's official remote MCP server: repos, issues, pull requests, actions, code search. | original |
| [`goofish-sandbox`](mcp/goofish-sandbox.json) | 闲鱼 MCP server（Docker 沙箱模式）：浏览器自动化在容器虚拟桌面中运行，不占用本机浏览器。与 mcp/goofish 使用同一个 server 名，二者互相替换。 | original |
| [`goofish`](mcp/goofish.json) | 闲鱼（Goofish/Xianyu）MCP server（本机模式）：商品查询/发布/下架、搜索、图片上传、AI 类目识别、IM 消息收发等 17 个工具，由 goofish-cli 提供。 | original |
| [`graphify`](mcp/graphify.json) | Graphify 的 MCP server（stdio）：把当前项目的知识图谱 graphify-out/graph.json 提供给 Agent，支持 query_graph 等图查询工具。 | original |
| [`iconmcp`](mcp/iconmcp.json) | IconMCP 的远程 MCP server（无需登录）：按含义搜索约 6,800 个原创图标（search_icons），取 SVG 或 React 组件（get_icon），浏览主题图标集（list_sets / get_set）；找… | original |
| [`kit-tools`](mcp/kit-tools) | Example self-hosted MCP server shipped in this repo (zero dependencies): current time, UUIDs, text hashing. | original |
| [`playwright`](mcp/playwright.json) | Browser automation via Playwright accessibility snapshots (Microsoft). | original |
| [`prompts-chat`](mcp/prompts-chat.json) | prompts.chat 的远程 MCP server：搜索和获取提示词、Agent skill 和 Bot，改进提示词；登录后还能保存自己的提示词和 skill。 | original |
| [`rea`](mcp/rea.json) | REA 的 MCP server（stdio）：逆向分析原生二进制、JavaScript / Electron 应用、.NET 程序集和网站，结果附带证据与局限。 | original |
| [`scenario`](mcp/scenario.json) | Scenario（scenario.com）的远程 MCP server：生成和编辑图片、视频、音频、贴图、天空盒、3D 模型、精灵图等游戏素材，选模型、跑 LoRA、训练自定义模型、管理团队用量。需要 Scenario 账号（OAuth… | original |
| [`solidcraft`](mcp/solidcraft.json) | SolidCraft 的 MCP server（stdio）：Agent 用和界面相同的命令建模（batch、execute、measure、screenshot…）；无界面时自带设计会话，桌面应用运行时自动连接，可以看着 Agent 建… | original |
| [`treg`](mcp/treg.json) | treg（"工具界的 OpenRouter"）的远程 MCP server：用一个账号按次付费调用数千个第三方 API（SEO 与外链、社媒与趋势、人员与公司信息补全、广告库、网页抓取、图片视频生成），以及团队自己登记的密钥、CLI 和 … | original |

#### hooks (2)

| 名称 | 说明 | 来源 |
| --- | --- | --- |
| [`block-dangerous-commands`](hooks/block-dangerous-commands) | Blocks destructive shell commands (rm -rf /, force-push to main, mkfs, dd to disks, curl \| sh …) before the agent runs … | original |
| [`notify-on-stop`](hooks/notify-on-stop) | Desktop notification when the agent finishes a turn or needs your input (macOS, Linux, Windows). | original |

#### plugins (9)

| 名称 | 说明 | 来源 |
| --- | --- | --- |
| [`cad-modeling`](plugins/cad-modeling) | 用 SolidCraft 做参数化 3D CAD 建模：MCP server，加上官方推荐的 4 个建模 skill（新建零件、修改设计、参数与 STEP 校验、装配与机构）。需要先安装 SolidCraft。 | bundle（[bundles/cad-modeling.json](bundles/cad-modeling.json)） |
| [`design-engineering`](plugins/design-engineering) | Emil Kowalski 的设计工程 skill（18 个）：动画从零构建、手势交互、编排、性能、审查与精简，Apple 设计原则，移动端原生体验，破坏性测试 UI，多版本原型，UI 库选择，Sonner，现代 Swift。 | bundle（[bundles/design-engineering.json](bundles/design-engineering.json)） |
| [`desktop-automation`](plugins/desktop-automation) | 桌面 computer use：用 Vercel Labs 的 agent-desktop 通过无障碍树查看和操作 macOS / Windows / Linux 桌面应用（skill + MCP server）。插件自带 agent-d… | bundle（[bundles/desktop-automation.json](bundles/desktop-automation.json)） |
| [`dev-essentials`](plugins/dev-essentials) | Everyday development bundle: /review and /test commands, a test-writer sub-agent and a changelog skill. | original |
| [`rust-migration`](plugins/rust-migration) | 把 C/C++、Fortran、Java、Python、Shell 等遗留代码迁移到 Safe Rust：分析、规划、迁移、PGO 与遥测报告。 | bundle（[bundles/rust-migration.json](bundles/rust-migration.json)） |
| [`rust-native-ui`](plugins/rust-native-ui) | 长桥 Longbridge 的 Rust 原生 UI 开发：Native Shell（NSH，iOS / Android / 桌面 / Web / 终端跨平台）和 GPUI Kit（GPUI 桌面应用框架）各自的编码 skill 与设计规… | bundle（[bundles/rust-native-ui.json](bundles/rust-native-ui.json)） |
| [`security`](plugins/security) | 安全审计：对代码库、API、服务、CLI、库和守护进程做漏洞审查与安全评估，按信任边界给出证据、复现方式、优先级和最小修复（Cloudflare security-audit skill）。 | bundle（[bundles/security.json](bundles/security.json)） |
| [`utools`](plugins/utools) | uTools 插件应用开发：uTools 官方的 utools-plugin-dev skill，内置 uTools 8.0+ 的 API 参考和开发规范，辅助编写、修改和排查 uTools 插件。 | bundle（[bundles/utools.json](bundles/utools.json)） |
| [`wxjava`](plugins/wxjava) | WxJava 微信开发：为 Java / Spring Boot / Solon 项目生成公众号、小程序、支付、企业微信、开放平台等的最小接入方案。 | bundle（[bundles/wxjava.json](bundles/wxjava.json)） |

#### scripts (2)

| 名称 | 说明 | 来源 |
| --- | --- | --- |
| [`agent-context`](scripts/agent-context.sh) | Print a compact project snapshot (tree, manifests, recent commits) to paste into any AI chat. | original |
| [`git-prune-branches`](scripts/git-prune-branches.sh) | Delete local git branches whose upstream is gone or that are merged into the default branch. | original |

#### clis (8)

| 名称 | 说明 | 来源 |
| --- | --- | --- |
| [`agent-desktop`](clis/agent-desktop.json) | Vercel Labs 的桌面 computer use 工具：通过操作系统无障碍树（macOS AX / Windows UI Automation / Linux AT-SPI）读取并操作桌面应用，输出带 ref 的 JSON，不依赖… | [link](https://github.com/vercel-labs/agent-desktop) |
| [`browser-harness`](clis/browser-harness.json) | Browser Use 出的浏览器控制工具：通过 Chrome DevTools Protocol 直接驱动你正在用的 Chrome（带登录态），也能连 Browser Use 云浏览器。截图 + 坐标点击、持久化 Python 会话，A… | [link](https://github.com/browser-use/browser-harness) |
| [`caveman`](clis/caveman.json) | Caveman：让 AI 编码 Agent 少说、少读、少花钱。回答压缩成「原始人」短句（代码、命令、报错原样保留）；日志、JSON、CSV、测试输出在模型读到前先压缩；Auto 按问题难度选模型和推理强度；Blocks 复用 Agent… | [link](https://github.com/JuliusBrussee/caveman) |
| [`goofish-cli`](clis/goofish-cli.json) | 闲鱼（Goofish/Xianyu）自动化 CLI，原生支持 MCP：商品发布/下架/查询、图片上传、AI 类目识别、IM 实时收发、风控限流，内置 5 个 Claude Skills。 | [link](https://github.com/fancyboi999/goofish-cli) |
| [`graphify`](clis/graphify.json) | Graphify：把整个项目（代码、文档、PDF、图片、视频）转成可查询的知识图谱，让 Agent 查图而不是逐个 grep / 读文件。代码用 tree-sitter 在本地解析（约 40 种语言，不调用 LLM），每条边标明是源码里明… | [link](https://github.com/Graphify-Labs/graphify) |
| [`impeccable`](clis/impeccable.json) | Impeccable：给编码 Agent 的前端设计词汇和审查工具。一个 skill 带 24 个命令：bolder / quieter / distill / colorize / typeset / layout 调整风格，criti… | [link](https://github.com/pbakaus/impeccable) |
| [`rea`](clis/rea.json) | REA（Reverse Engineer Anything）：给 Agent 用的逆向工程工具，一个 MCP 覆盖原生二进制、JavaScript / Electron 应用、.NET 程序集和网站，本地分析并给出每个结论的证据和局限；也… | [link](https://github.com/morluto/rea) |
| [`wxa-runner`](clis/wxa-runner.json) | wxa-runner：在普通浏览器里用微信官方基础库运行小程序（原生小程序目录，或 uni-app / Taro 编译产物），渲染、组件、setData、生命周期都和真机一致；用于本地调试（Chrome DevTools、热更新、地址直达… | [link](https://github.com/open-wxa/wxa-runner) |

#### tools (23)

| 名称 | 说明 | 来源 |
| --- | --- | --- |
| [`bui`](tools/bui.json) | BUI：把 Blender 的用户界面拆成独立的 UI 库，可以在 Python、Rust、JavaScript（React、Svelte）、C / C++ 和 Dear ImGui 里使用；提供 Blender 风格组件（面板、数值滑块… | [link](https://github.com/ppmpreetham/BUI) |
| [`craft-anything`](tools/craft-anything.json) | 研究任意网站、应用或游戏的实现方式，再让 AI 编码 Agent 按要求重建一个自己的版本（Study → Build → Check → Refine）。纯 Rust 的开源 clean-room 引擎，带桌面应用、CLI 和 MCP … | [link](https://github.com/storytold/craft-anything) |
| [`cui`](tools/cui.json) | CUI：C 语言的原生 UI 组件库，约 150 个组件（表单、选择器、对话框、表格、命令面板、虚拟化数据表格、看板、日历、甘特图、十几种图表、AI 聊天组件），带弹簧动效和完整键盘支持；一份 C99 代码跑 Windows / macO… | [link](https://github.com/yappologistic/CUI) |
| [`diagram-design`](tools/diagram-design.json) | Diagram Design：让 Agent 画出编辑级品质的图表，每张图是一个自包含的 HTML + SVG 文件，可套用你自己的品牌配色和字体。支持 45 种类型：架构图（含改动前后对比）、流程图、时序图、状态机、ER / 数据库表结… | [link](https://github.com/cathrynlavery/diagram-design) |
| [`ecc`](tools/ecc.json) | ECC（Everything Claude Code，"Agent 运行环境的操作系统"）：超大型 Agent 增强套件，71 个子 Agent、300+ skill、98 个命令、规则、可复用的 hooks 和 MCP 约定，覆盖 TD… | [link](https://github.com/affaan-m/ECC) |
| [`gpui-kit`](tools/gpui-kit.json) | GPUI Kit（长桥 Longbridge）：基于 GPUI 的 Rust 桌面应用框架，75+ 组件和基础构件，内置 AccessKit 无障碍、UI 集成测试、WebAssembly、可承载 20 万行的代码编辑器（Tree-sit… | [link](https://github.com/longbridge/gpui-kit) |
| [`gstack`](tools/gstack.json) | Garry Tan（YC）的开源"虚拟工程团队" skill 套件：约 80 个斜杠命令，覆盖产品梳理（/office-hours）、方案评审（/autoplan）、代码审查（/review）、真实浏览器 QA（/qa）、安全审计（/cs… | [link](https://github.com/garrytan/gstack) |
| [`interfaces`](tools/interfaces.json) | Jakub Krehel 的界面设计 skill 套件（14 个）：界面综合审查（better-interface）、UI 细节、排版、配色系统、无障碍（WCAG 2.2）、布局、界面文案，以及按 Figma 构建、组件压力测试、状态机预… | [link](https://github.com/jakubkrehel/skills) |
| [`last30days`](tools/last30days.json) | /last30days：把任意话题、人物、公司、产品最近 30 天在 Reddit、X、YouTube（含字幕）、TikTok、Instagram、Hacker News、Polymarket、GitHub、arXiv、Techmeme、… | [link](https://github.com/mvanhorn/last30days-skill) |
| [`mattpocock-skills`](tools/mattpocock-skills.json) | Matt Pocock 的工程 skill（27 个）：用提问打磨需求（grill-me / grilling）、需求转规格与工单（to-spec、to-tickets）、实现、TDD、诊断 bug、代码审查、PR、领域建模、代码库架构改… | [link](https://github.com/mattpocock/skills) |
| [`nsh`](tools/nsh.json) | Native Shell（NSH，长桥 Longbridge）：Rust 写的原生 UI 框架，一套组件、状态和逻辑跑在 iOS、Android、macOS、Windows、Linux、Web、GPUI 和终端上，各平台用自己的原生控件渲… | [link](https://github.com/longbridge/nsh) |
| [`openmausbot`](tools/openmausbot.json) | OpenMausBot：开源的"聊天软件式"Agent 团队（Grok Bot / Meta Muse / OpenAI dots / Cue 的开源替代）。侧边栏里每个联系人都是一个真实 Agent，底层跑你本机的 claude、cod… | [link](https://github.com/milind-soni/OpenMausBot) |
| [`orca`](tools/orca.json) | Orca（Stably AI）：AI 编码 Agent 编排桌面应用。让 Claude Code、Codex 等任意编码 Agent 并行运行，每个在自己的 git worktree 里；可以把大任务交给一个协调 Agent 拆分给多个子… | [link](https://github.com/stablyai/orca) |
| [`paperclip`](tools/paperclip.json) | Paperclip：开源、可自托管的 AI Agent 团队编排平台（Node.js 服务 + React 界面）。给一个业务目标，"雇"一组 Agent（CEO、CTO、工程师、设计、市场……可混用 Claude Code、Codex、… | [link](https://github.com/paperclipai/paperclip) |
| [`ponytail`](tools/ponytail.json) | "懒惰的资深开发"模式：让 Agent 只写任务需要的代码（YAGNI、优先标准库、不做没要求的抽象），但不省校验、错误处理、安全和可访问性；附带 /ponytail-review 代码审查、/ponytail-audit 全仓库审计等命… | [link](https://github.com/DietrichGebert/ponytail) |
| [`sand3d`](tools/sand3d.json) | sand3d（Sandflow）：给大模型用的 Python 3D 建模库，在 Blender 的 bpy 之上用很短的程序描述零件、实体、编辑、坐标系、关节和装配体；零件和边面按名字引用、结果确定可复现，同一个零件比 Blender P… | [link](https://github.com/Sandflow-ai/sand3d) |
| [`scenario-skills`](tools/scenario-skills.json) | Scenario 官方 Agent skill 套件：168 个 skill，分成 23 个插件，覆盖图片、视频、音频、3D 生成与编辑，游戏美术（精灵、图标、瓦片、贴图、天空盒、可行走场景），社交媒体内容，角色与风格一致性和自定义模型训… | [link](https://github.com/scenario-labs/skills) |
| [`scientific-agent-skills`](tools/scientific-agent-skills.json) | Scientific Agent Skills（原 Claude Scientific Skills）：K-Dense 出的 177 个科研 skill，覆盖生物信息与基因组、化学信息学与药物发现、蛋白质组与质谱、临床研究、医学影像与数字… | [link](https://github.com/K-Dense-AI/scientific-agent-skills) |
| [`solidcraft`](tools/solidcraft.json) | 开源参数化 3D CAD（纯 Rust）：草图与约束、特征时间线（拉伸/旋转/扫掠/放样/圆角/抽壳…）、参数与配置、装配与运动、钣金，支持 STEP/IGES/3MF/STL/OBJ/glTF；有桌面版、浏览器版、无界面 CLI 和 M… | [link](https://github.com/tangency-labs/solidcraft) |
| [`superpowers`](tools/superpowers.json) | Superpowers：给编码 Agent 的完整开发方法论，由可组合的 skill 构成：头脑风暴、写计划、执行计划、TDD、系统化调试、代码审查（请求与接收）、子 Agent 驱动开发、并行派发、git worktree、完成前验证、… | [link](https://github.com/obra/superpowers) |
| [`taste-skill`](tools/taste-skill.json) | Taste Skill：让 Agent 做出 figma.com、x.ai 水准的公司官网（每屏一个区块、真实照片、真实产品 UI，科技和游戏页才加特效），并用真实浏览器做一致性检查。 | [link](https://github.com/Leonxlnx/taste-skill) |
| [`text-to-cad`](tools/text-to-cad.json) | text-to-cad：让 Agent 设计实体产品。模型写成 build123d Python 脚本，生成 STEP / GLB / STL / 3MF，带 CAD 查看器；另有 12 个 skill，覆盖标准件查找（step.part… | [link](https://github.com/earthtojake/text-to-cad) |
| [`treg`](tools/treg.json) | treg（Superdesign 出品，"工具界的 OpenRouter"）：一个地址、一个 token，让 Agent 按次付费调用 4,000+ 个第三方工具接口（SEO、外链、关键词、社媒与趋势、人员和公司信息补全、广告库、网页抓取… | [link](https://github.com/superdesigndev/treg) |

#### resources (7)

| 名称 | 说明 | 来源 |
| --- | --- | --- |
| [`ai-pose-gallery-zh`](resources/ai-pose-gallery-zh.json) | AI 角色参考与合成工作台（中文版）：姿势（素体白模 + 深度图）、服装（写实、中国历代、动漫、二次元）、人像三大参考图库共 6,000+ 条，元数据全中文；附带网页合成台（人像 + 服装 + 姿势组合，直连 Gemini、GPT Ima… | [link](https://github.com/anhao/ai-pose-gallery-zh) |
| [`awesome-claude-skills`](resources/awesome-claude-skills.json) | Awesome Claude Skills（Composio 维护）：Claude Skills 精选列表，按文档处理、开发工具、数据分析、商业营销、写作沟通、创意媒体、效率、协作、安全等分类收录约 180 个 skill 链接；仓库里还… | [link](https://github.com/ComposioHQ/awesome-claude-skills) |
| [`iconmcp`](resources/iconmcp.json) | IconMCP：原创图标库，约 6,800 个图标、58 套主题，16 单位网格绘制，提供线框、实心和双色三种风格，可导出 SVG 或 React 组件；附带一个 MCP server，让编码 Agent 按含义搜索图标。可免费用于任何用… | [link](https://iconmcp.com/) |
| [`polyfork`](resources/polyfork.json) | Polyfork 免费低多边形（low-poly）3D 模型库：2,791 个模型、26 个主题套件（同一调色板和比例），提供 GLB 与可调参数的 ES module，适用于 three.js、游戏和网页，无需账号和 key。 | [link](https://github.com/lucas-martinic/polyfork-catalog) |
| [`prompts-chat`](resources/prompts-chat.json) | prompts.chat（原 Awesome ChatGPT Prompts）：最大的开源提示词库，适用于 ChatGPT、Claude、Gemini 等，可在网站浏览、下载 CSV 或用 Hugging Face 数据集；另有 Agen… | [link](https://github.com/f/prompts.chat) |
| [`secki`](resources/secki.json) | 面向设计工程师的精选链接库（332 个）：UI 组件、图标与 SVG、着色器与动效、图片素材、视频动画、设计工具、配色字体、Agent skills、开发工具、工作流自动化，每条都由用过的人收录。免费浏览，无广告、无需注册。 | [link](https://secki.dev/) |
| [`skillstore`](resources/skillstore.json) | Skill Store（skillstore.io）：Agent Skill 应用商店，收录约 7,100 个经人工审核的 skill（来自 900+ 作者），每个都附自动安全审计报告（危险代码、越界文件访问、外部网络请求、混淆代码、凭据… | [link](https://github.com/aiskillstore/marketplace) |
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
