# Shell Frontend Design

状态：实施标准

Shell Workbench 默认隐藏，只在 workflow 需要用户可见 shell session 时显示。Shell session 来自 daemon 生成的 shell intent，由 Desktop shell host 接管。

## UI Contract

- Shell session 以工作台形式呈现，绑定 ownerFeature 和 project context。
- 默认入口保持安静，只有存在待执行或待查看的 shell intent 时才提升可见性。
- Remotion Studio install/start 等场景使用“在 Shell 打开”动作，保持用户可审阅。
