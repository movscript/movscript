# Movscript Runtime 分发标准

Movscript 公开分发面包含两个用户可见包：Agent Plugin 和 Desktop App。`movscript.local-node` 是二者共享的 runtime component，不作为第三个公开下载轨道。

## Home Layout

标准 Home layout:

- `<home>/plugins/movscript/current`
- `<home>/plugins/movscript/previous`
- `<home>/plugins/movscript/current.identity`
- `<home>/bin/`

`current.identity` 是 bundle 身份的稳定记录，至少包含 version、pluginRoot、bundleHash、apiVersion、minDaemonApiVersion、installedAt 和 reason。

## Release Contract

- Agent Plugin zip 安装到 Home plugin store。
- Desktop 内置 provider plugin 只能作为 Home current 的种子或升级来源。
- Desktop、Agent Plugin、CLI 必须复用同一个 per-user daemon 和同一个 Home current。
- Release smoke 必须验证 Agent Plugin zip 与 Desktop provider plugin 的 runtime manifest 和 bundleHash 兼容。
