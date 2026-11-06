# 收藏工具的上游同步

## sources.json

所有收藏的工具都登记在仓库根目录的 `sources.json` 中，键为 `type/name`：

```json
{
  "version": 1,
  "items": {
    "skill/mcp-builder": {
      "repo": "https://github.com/anthropics/skills",
      "ref": "main",
      "path": "skills/mcp-builder",
      "commit": "ca45fc496a3436251f191354091d557da31c15b5",
      "hash": "sha256:…",
      "license": "Apache-2.0",
      "addedAt": "2026-11-06",
      "updatedAt": "2026-11-06"
    }
  }
}
```

| 字段 | 含义 |
| --- | --- |
| `repo` / `ref` / `path` | 上游的仓库、分支、tag 或 commit，以及工具在上游仓库中的路径。不写 `ref` 时跟随默认分支 |
| `commit` | 上次同步时上游的 commit，作为三方合并的 **base** |
| `hash` | 该 commit 下上游内容的哈希，用来判断本地是否改过、上游是否变化 |

`ref` 写成 tag 或 commit SHA 可以锁定版本，这时 `outdated` 不会报告更新；需要升级时手动修改 `ref`。

## 状态判定

| 状态 | 本地 vs `hash` | 上游 vs `hash` |
| --- | --- | --- |
| `up-to-date` | 相同 | 相同 |
| `update-available` | 相同 | 不同 |
| `local-modified` | 不同 | 相同 |
| `diverged` | 不同 | 不同 |
| `removed-upstream` | – | 上游路径已不存在 |

`outdated` 会先用 `git ls-remote` 比较远端 commit，只有远端变化时才拉取内容（blobless clone，只下载需要的文件）。所以上游仓库很大时也很快。

## 更新策略

- `update-available`：直接用上游版本替换本地文件。
- `diverged`：以 `commit` 为 base，对 local 和 upstream 逐个文件做三方合并（`git merge-file`）：
  - 只有一侧改了的文件，采用改动的那一侧，包括新增和删除
  - 两侧都改了的文本文件，按行合并；有冲突时写入 `<<<<<<< local` / `>>>>>>> upstream` 标记
  - 两侧都改了的二进制文件，或一侧删除一侧修改的文件：保留本地版本，上游版本另存为 `*.upstream`
- `--theirs`：放弃本地修改，强制使用上游版本。
- `--dry-run`：只显示会发生什么，不改动文件。

更新完成后，`commit` 和 `hash` 会改成上游的新状态。如果你保留了本地修改，之后的状态会显示为 `local-modified`，这是正常的。

## 建议工作流

```bash
agent-kit outdated -v            # 查看哪些有更新、上游新增了哪些 commit
agent-kit diff <item> --base     # 看上游自导入以来改了什么
agent-kit update <item>          # 合并更新
git diff                         # 检查结果，处理冲突
agent-kit validate && agent-kit build   # build 会同时重新生成包含该工具的 bundle 插件
git add -A && git commit -m "chore(sync): update <item> from upstream"
```

## 每日自动同步（GitHub Actions）

`.github/workflows/upstream-sync.yml` 每天 01:23 UTC（北京时间 09:23）运行一次，也可以在 Actions 页面手动触发（Run workflow）。流程如下：

1. `agent-kit update --all --skip-conflicts --json`：拉取所有收藏工具的上游更新。能干净更新或合并的工具会写入改动；与本地修改冲突的工具保持原样，只记录下来。
2. `agent-kit build` 重新生成 registry、marketplace、README 目录表和 bundle 插件，然后执行 `npm run check`。检查不通过时不提交，这次运行会标红。
3. 把更新提交到默认分支，提交信息形如 `chore(sync): update N upstream item(s)`，正文列出每个工具的 commit 范围。
4. 有冲突时，基于最新的默认分支创建 `upstream-sync/conflicts` 分支，写入带冲突标记的合并结果，然后开 PR。PR 打开期间，后续的每日运行只刷新 PR 说明，**不会覆盖这个分支**，所以你可以放心在分支上处理冲突。
5. 上游仓库无法访问，或工具在上游被删除时，会写进运行摘要（Summary），并让这次运行标红。GitHub 默认会发邮件通知运行失败。

没有更新时什么都不提交。上游仓库有新 commit、但收藏的工具本身没变时，也不会产生提交。

### 启用前需要的设置

- **Settings → Actions → General → Workflow permissions**：选择 *Read and write permissions*，并勾选 *Allow GitHub Actions to create and approve pull requests*。不开的话，推送和开 PR 都会失败。
- **定时任务只在默认分支上运行**。把仓库的默认分支设为包含这个 workflow 的分支，比如合并后的 `main`。
- 默认分支开启了保护规则、不允许直接推送时，改成 PR 模式：在 *Settings → Secrets and variables → Actions → Variables* 中添加 `UPSTREAM_SYNC_MODE=pr`。之后的更新会推送到 `upstream-sync/auto` 分支并开 PR，由你合并。手动触发时也可以选 mode。
- 用 `GITHUB_TOKEN` 推送的提交和创建的 PR **不会触发其他 workflow**，比如 CI。所以同步 workflow 会在提交前自己跑完整的 `npm run check`。
- 仓库连续 60 天没有活动时，GitHub 会自动停用定时任务，需要在 Actions 页面重新启用。

### 不想自动提交，只想收到提醒？

设置 `UPSTREAM_SYNC_MODE=pr`，所有更新都会先变成 PR，由你审核后合并。
