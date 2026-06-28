# Desktop 内嵌 Agent 的 main 分支隔离策略

## 背景

Desktop 内嵌对话 Agent 仍处在孵化阶段。为了避免未成熟的窗口、路由、设置页和项目面板继续影响 main 分支的默认体验，main 分支只保留必要代码，但默认不暴露这些入口。

完整功能继续保存在 `incubate/desktop-embedded-agent` 分支。等 Desktop Agent 管理模型成熟后，再从该分支把功能合回 main。

## main 分支行为

- 默认关闭 Desktop 内嵌 Agent 入口。
- `/project/agent`、`/agent/*`、`/agents/*`、模型供应商、Agent 连接、Workspace config/review 等内嵌 Agent 管理入口会被重定向到稳定页面。
- Project shell 的 Agent 右侧面板和 terminal dock 默认不挂载。
- Home 页不再展示 Agent work mode 卡片。
- Plugins 入口继续保留，因为它仍是 Desktop 插件管理的稳定入口。

如需在 main 或本地调试中临时启用这些入口，设置：

```bash
VITE_MOVSCRIPT_DESKTOP_EMBEDDED_AGENT=1
```

Electron 主进程兼容读取：

```bash
MOVSCRIPT_DESKTOP_EMBEDDED_AGENT=1
```

## 孵化分支维护

`incubate/desktop-embedded-agent` 是功能保留分支，不应该被 main 的后续删除意外清空。每次 main 大幅清理或合并到孵化分支前，先使用孵化分支里的 pathspec 做锚点恢复：

```bash
git switch incubate/desktop-embedded-agent
git fetch origin
git merge --no-commit origin/main
git restore --source=HEAD --pathspec-from-file=docs/desktop-embedded-agent-incubation.pathspec
git add -A
git commit -m "chore(agent): preserve desktop embedded agent after main sync"
```

这一步的含义是：允许孵化分支吸收 main 的稳定改动，但对 Desktop 内嵌 Agent 相关文件使用孵化分支合并前的版本重新锚定，避免因为 main 删除或隐藏入口导致完整实现丢失。

## 合回 main 的建议

未来准备合回 main 时，先在孵化分支完成：

1. 明确 Desktop Agent 的生命周期所有权。
2. 明确多 Agent 会话、窗口、项目上下文和插件 runtime 的边界。
3. 补齐端到端测试和失败恢复策略。
4. 移除或反转 `desktopEmbeddedAgentEnabled()` 的默认隔离逻辑。
5. 以小 PR 分批恢复路由、设置页、项目面板和窗口入口。
