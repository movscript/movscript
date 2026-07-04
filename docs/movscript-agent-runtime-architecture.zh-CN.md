# Movscript Agent Runtime 架构

本机 full runtime owner 是 per-user `movscript.local-node` daemon。

MovScript Home 是本机运行时事实目录。Home 是本机应用/服务运行状态、端口、pid、session、日志和 profile 配置的 canonical 目录；cache、tmp、socket、log、pid、port 文件不能散落在项目 source 或随机 cwd。Home 目录是本机发现事实，不是授权绕过。

Desktop App 是可视化工作台和用户操作入口，不是业务 sidecar owner。Agent Plugin App 是 Agent/provider 侧的接入包，不是和 Desktop 平级竞争 runtime 的应用。

不存在“Desktop 启动了 Project Service、Plugin 再补一个 Editing Service”的双 owner 模式。Project Service、Editing Service、Canvas Service、Media Pipeline、local-surface-host 等本机服务都归 local-node daemon 管理。

## Ownership

- Agent Plugin full-local 模式先 ensure daemon，再用 basic MCP session 接入 daemon MCP endpoint。
- Desktop connected 模式读取 runtime descriptor、status 和 gateway endpoint，不直接拥有业务服务进程。
- Cloud 或 external runtime 通过 runtime gateway endpoint 接入，仍保持 MCP host 是 thin adapter。
