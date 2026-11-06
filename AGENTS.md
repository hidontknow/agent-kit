# AGENTS.md

本仓库是一个 AI Agent 工具包，同时包含：(1) 内容：skills/agents/commands/mcp/hooks/plugins/scripts，以及只保存链接的外部 CLI（clis/）、其他开源工具（tools/）和资源（resources/，素材库、数据集、文档等）；(2) 一个零依赖的 Node CLI（`bin/`、`lib/`），负责把内容安装到 Claude Code、Codex、Cursor 等客户端，并同步收藏工具的上游。

## 常用命令

- `node bin/agent-kit.js validate`：检查所有工具的格式
- `node bin/agent-kit.js build`：根据 `bundles/*.json` 重新生成主题插件，并重新生成 `registry.json`、`.claude-plugin/marketplace.json` 和 README 中的目录表。改动任何工具后都要执行
- `npm test`：运行 `test/` 下的端到端测试（在临时 HOME 中运行，不会改动真实配置）
- `npm run check`：执行 CI 中的全部检查

## 约定

- 不要引入 npm 依赖，只使用 Node ≥ 18 标准库和 git。
- 名称使用 kebab-case，并且必须和文件名或目录名一致。
- 收藏的第三方工具必须用 `agent-kit add` 导入，保证 `sources.json` 有登记；不要手动编辑其中的 `commit` / `hash`。
- 外部 CLI、开源工具和资源只在 `clis/`、`tools/`、`resources/` 下的 `<name>.json` 中登记链接和说明，不要把它们的源码或内容复制进仓库。
- 由 bundle 生成的 `plugins/<name>/`（README 第一行带 generated 标记）不要手动修改，改源工具或 `bundles/<name>.json` 后重新 build。
- MCP 清单里不能出现密钥，用 `${env:VAR}` 引用。
- 新增客户端适配器时，`install()` 必须返回可撤销的操作（`lib/state.js`），不要在适配器里自己实现卸载。
- 格式规范：`docs/formats.md`；各客户端的路径和转换规则：`docs/targets.md`；上游同步：`docs/sync.md`。
