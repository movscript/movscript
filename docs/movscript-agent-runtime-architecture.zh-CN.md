# MovScript Agent Runtime Architecture

## Local Runtime Owner

本机运行时只有一个本地 owner：per-user `movscript.local-node` daemon。

Desktop App 是可视化工作台，不是业务 sidecar owner；它负责窗口、用户交互、Electron 能力桥接、状态展示和配置写入。

Agent Plugin App 是 agent/provider 入口，不是和 Desktop 平级竞争 runtime 的应用；它应该连接现有 daemon，或者在 full-local 模式下先确保 daemon 存在，再启动最小 MCP 会话。

不存在“Desktop 启动了 Project Service、Plugin 再补一个 Editing Service”这种混合 ownership。Project Service、Data Service、Canvas Service、Editing Service、Media Pipeline、Local Surface Host 都由同一个 local-node daemon 统一管理生命周期。

## Gateway Boundary

对 UI、preload、surface、provider/plugin 外部入口来说，daemon gateway 是唯一公开 HTTP 边界。前端只应该持有 `gatewayBaseURL`，不应该发现、保存、透传或直连 `projectServiceBaseURL`、`canvasServiceBaseURL`、`editingServiceBaseURL` 等内部服务 URL。

内部服务拆分是 daemon 的实现细节。gateway 负责把 `/v1/project/*`、`/v1/canvas/*`、`/v1/editing/*`、`/v1/media-pipeline/*` 等稳定 namespace 转发到对应服务，并统一处理 CORS、错误形状、鉴权上下文、诊断、观测和兼容别名。

允许的内部直连只存在于 daemon/gateway 内部、服务启动与健康检查、测试夹具、CLI 诊断或服务自身的 server-to-server 调用里。任何用户界面或外部插件能力面都不能依赖内部端口拓扑。

## MovScript Home

MovScript Home 是本机运行时事实目录。Home 是本机应用/服务运行状态、端口、pid、session、日志和 profile 配置的 canonical 目录。

runtime records、endpoint records、service records、agent/profile 状态、desktop state、provider 配置和本机诊断日志都应该写入 Home 管理的明确位置。cache、tmp、socket、log、pid、port 文件不能散落在项目 source 或随机 cwd。

Home 目录是本机发现事实，不是授权绕过。服务仍然必须在 gateway、data connection、principal scope 和资源访问策略层面执行权限与可见性规则。

## Project Workspace

项目 Git workspace 是创作源文件和 production/source artifacts 的地方。`project.json`、`project_standards.json`、`settings/**`、`scripts/**`、`content_units/**`、`productions/**` 等属于项目 source；runtime endpoint、pid、服务日志和本机 profile 状态不属于项目 source。

Project Service 是项目 source 与 read-model 的权威业务服务，但它不直接暴露给前端。前端发起的 project home、制作、设定、scripts、content canvas 等读取都应该通过 gateway 的 `/v1/project/*` namespace 进入 Project Service。
