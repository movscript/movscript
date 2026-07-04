# Movscript Surface Runtime 补充

Desktop 是本机可视化工作台。

本机 full runtime owner 是 per-user `movscript.local-node` daemon。Plugin 不接管一组独立 headless runtime，多个 Agent 会话必须复用同一个 daemon。

## Surface Hosts

- `local-surface-host` 提供本机 surface runtime。
- `desktop-surface-host` 负责 Desktop 连接和可视化承载。
- Project/Editing/Data 相关业务服务由 daemon 统一编排，surface host 只消费 gateway 和 project runtime context。

该补充约束 Agent Plugin、Desktop App、CLI、local-surface-host 在同一个本机 runtime ownership 模型下协作。
