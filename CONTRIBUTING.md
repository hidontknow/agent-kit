# 贡献指南

## 添加自己的工具

1. `node bin/agent-kit.js new <skill|agent|command|mcp|hook|plugin|script> <name>` 生成模板
2. 按 [docs/formats.md](docs/formats.md) 编写内容
3. `node bin/agent-kit.js install <type>/<name> --link -t <target>` 用软链接在本地实际试用
4. `npm run check`（validate、build --check、测试）
5. `node bin/agent-kit.js build` 后提交，生成的 `registry.json`、`marketplace.json` 和 README 目录表也一起提交

## 收藏第三方工具

- 一律用 `agent-kit add <url>` 导入，**不要手动复制**，否则 `sources.json` 不会登记，之后无法同步上游。
- 用 `--license` 记录许可证。许可证不允许再分发的内容，不要收进公开仓库。
- 可以直接修改收藏的工具，`update` 会通过三方合并保留你的修改。如果不想再跟上游同步，执行 `agent-kit untrack <item>`。

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/)，例如 `feat(skill): add pdf-tools`、`chore(sync): update mcp-builder`。

## 新增客户端适配

在 `lib/targets/` 下新增一个 adapter，导出 `{ id, name, supports, scopes, detect, paths, install }`。
`install(item, ctx)` 返回可撤销的操作列表（见 `lib/state.js`），卸载由框架统一处理。
然后在 `lib/targets/index.js` 中注册，并在 `test/cli.test.js` 中补充测试。
