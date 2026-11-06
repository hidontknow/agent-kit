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
agent-kit validate && agent-kit build
git commit -am "chore(sync): update <item> from upstream"
```

`.github/workflows/upstream-check.yml` 每周执行一次 `outdated --json`。有更新时，它会创建或更新标题为 "Upstream updates available for collected items" 的 issue。
