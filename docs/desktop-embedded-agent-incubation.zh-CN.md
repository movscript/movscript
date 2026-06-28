# Desktop 内嵌对话 Agent 孵化分支

本文件记录 `incubate/desktop-embedded-agent` 分支的长期用途：先把 Desktop 内嵌对话 Agent 从 `main` 的稳定发布面隔离出来，保留当前可运行实现，等运行时、权限、会话管理、测试和产品边界成熟后，再分阶段合回 `main`。

## 分支目标

- `main` 保持稳定：发布包、默认导航、公开文档和 release contract 不默认暴露未成熟的 Desktop 内嵌对话 Agent。
- `incubate/desktop-embedded-agent` 保持可运行：保留现有 Desktop 内嵌对话、Agent Console、Agent Mode、runtime bridge、协议包和测试资产。
- 未来回并时按层拆分：协议层、agent chat runtime、Desktop runtime bridge、Desktop UI、E2E/发布门禁分别进入 `main`。

## 受保护范围

机器可读清单位于：

```text
docs/desktop-embedded-agent-incubation.pathspec
```

这份清单覆盖以下类别：

- Desktop Agent feature 本体：`apps/desktop/src/features/agent`
- Desktop Agent 页面入口：`apps/desktop/src/pages/agent`、`apps/desktop/src/pages/agent-mode`
- Agent runtime bridge 和 shared UI：`apps/desktop/src/shared/infrastructure/agent-runtime`、`AgentComposerUi`、`AgentMessageUi`
- Electron/MCP context bridge、provider runtime catalog、agent connection debug store
- Agent Mode / Agent Console 的 route、shell、runtime、CSS 和 E2E 入口
- 协议与对话核心包：`packages/agent-chat`、`packages/agent-protocol`

`apps/plugin`、`packages/mcp-host`、`packages/local-runtime` 暂不作为本分支专属迁移资产。它们属于 Agent Plugin、CLI 或本地 runtime 基础设施，应该继续按稳定 runtime 边界维护，除非后续明确拆出 Desktop-only 行为。

## 为什么不能只建分支

如果 `incubate/desktop-embedded-agent` 从 `main` 分出后没有修改某些 Agent 文件，而 `main` 后续删除了这些文件，那么未来普通 merge 时 Git 会认为：

```text
main 删除了文件
incubate 分支没有改这些文件
```

结果通常是删除生效，代码不会自动回来。因此本分支需要在 `main` 清理后执行一次保留性 merge，让 Git 历史明确记录：“本分支知道 main 删除了这些路径，但选择保留它们”。

## Main 清理后的保留性 merge

当 `main` 合入隐藏或删除 Desktop 内嵌 Agent 的 PR 后，在本分支执行：

```bash
git switch incubate/desktop-embedded-agent
git fetch origin
git merge --no-commit origin/main
git restore --source=HEAD --pathspec-from-file=docs/desktop-embedded-agent-incubation.pathspec
git add -A
git commit -m "chore(agent): preserve desktop embedded agent after main quarantine"
```

这一步是关键锚点。它会把 `main` 的新历史合进来，同时把受保护范围恢复为本分支版本。之后未来从本分支回并 `main` 时，这些路径会以“本分支明确保留/继续演进”的状态参与合并，而不是被 `main` 的删除静默吞掉。

## Main 的建议清理方式

优先顺序：

1. 先隐藏入口，而不是大面积物理删除。
2. 关闭默认导航、route 可见性、release 暴露面和文档入口。
3. 保留稳定 runtime contract、Agent Plugin、MCP host、本地 runtime 能力。
4. 如果必须删除代码，先合并本分支中的本文件和 pathspec 清单，再执行上面的保留性 merge。

## 未来回并路径

建议拆成多个小 PR：

1. `packages/agent-protocol`
2. `packages/agent-chat`
3. Desktop agent runtime bridge
4. Desktop Agent Mode / Agent Console UI
5. E2E、发布门禁、文档和默认入口

必要时也可以按路径从本分支恢复：

```bash
git restore --source=incubate/desktop-embedded-agent --pathspec-from-file=docs/desktop-embedded-agent-incubation.pathspec
```

回并前需要验证：

```bash
pnpm --filter @movscript/desktop typecheck
pnpm --filter @movscript/desktop test
pnpm test:packages
```
