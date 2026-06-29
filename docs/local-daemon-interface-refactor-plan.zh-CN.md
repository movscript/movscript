# Local Daemon Interface Refactor Plan

## Decisions

Decision 1：canonical gateway prefix 统一使用 `/v1`。Desktop、surface、plugin、MCP host 和 CLI 都应该把 `/v1` 当成本机 daemon gateway 的稳定协议前缀，legacy `/local-api` 只允许作为兼容入口存在于 gateway 内部。

Decision 5：Project source 完全收口到 Project Service。项目 source 的读写、read-model、resource view、candidate view、standards、scripts、content units 与 content canvas project 数据都从 `/v1/project/*` 进入，由 gateway 转发到 Project Service。

Decision 6：Project Service 性能排查是收口前置项。read-model 需要可压测、可观测、可分阶段记录耗时，并能在真实 `MOVSCRIPT_HOME` 项目上跑 benchmark，避免把慢读取隐藏在 UI fallback 中。

Decision 7：内容画布归 Project Service，工作流画布归 Canvas Service。内容画布是项目 source/read-model 的一部分；工作流画布是独立 workflow/canvas service 能力。两者都通过 daemon gateway 暴露，但 namespace 和 ownership 不混用。

### Canvas Boundary 验收

- Project content canvas 走 `/v1/project/content-canvas/read-model` 与 `/v1/project/content-canvases/*`。
- Workflow canvas 走 `/v1/canvas/*`。
- Surface 层不出现新的 `/local-api/canvas` 或内部 canvas service URL。
- 内容画布不能创建时命名、不能重命名这类产品行为必须在 Project Service contract 和 UI 入口同时验收。

### Raw Resource 验收

- Raw resource URL、public URL、signed relay、artifact ref 的转换集中在 resolver 或 legacy adapter。
- Product UI 不直接拼接内部 Data Service、Project Service 或 Canvas Service URL。
- Resource 访问错误必须被诊断为 profile、public URL、签名 secret 或权限问题，而不是暴露内部服务拓扑。

### 性能验收

- `benchmark:project-service` 是本地质量门的一部分，用来压测 Project Service read-model、resource view、candidate view。
- benchmark 必须支持真实 `MOVSCRIPT_HOME`、显式 `MOVSCRIPT_PROJECT_UID`、`MOVSCRIPT_PROJECT_RESOURCE_VIEW_KIND`，并在 candidate timings 中传入 scoped `decisionStore`。
- Project home、制作、设定、scripts、content canvas 读取不能依赖失败后 fallback 才完成；gateway 的 `/v1/project/*` namespace 必须直接命中 Project Service。
