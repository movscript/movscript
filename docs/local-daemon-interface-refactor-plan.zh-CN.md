# Local Daemon 接口收口改造计划

## 背景

这份文档记录一次针对 MovScript 本地运行时接口边界的现状盘点和改造计划。核心问题不是“本地 API 是否存在”，而是产品层把“本地”和“云端”当成了两套不同接口来理解，导致 Desktop、local-surface-host 和 surface runtime 暴露并依赖了 daemon 内部服务拓扑。

目标判断如下：

- 本机只有一个强制入口：每个用户唯一的 `movscript.local-node` daemon。
- Desktop 和 local-surface-host 只感知 daemon，不感知 daemon 下的 Data Service、Auth Service、Project Service、Canvas Service 等内部服务。
- Desktop 可以知道当前连接的数据是在本地、云端还是外部服务，用于状态展示、设置和诊断，但不能在接口层因为本地/云端选择不同 API。
- `user_id`、`project_id`、`project_cwd` 等系统上下文由 daemon 统一产出，其他入口只消费 context snapshot，不各自拼装上下文。
- Data Service 和 Auth Service 是否本地运行、云端运行、外部托管，是 daemon 的运行时配置和调度选择。
- `/local-api` 可以短期作为 daemon gateway 的兼容路由存在，但不应该继续出现在 Desktop renderer、local-surface-host、surface domain 等产品接口层。

用户遇到的请求也正是这个问题的典型症状：

```text
GET http://127.0.0.1:8766/local-api/canvas/canvases/:id
404 Not Found
```

从实现看，这条链路目前会先命中 `movscript.local-node.gateway` 的 `/local-api/canvas/*` 兼容代理，再转到 Canvas Service 的 `/v1/canvas/*`，Canvas Service 再访问 Data Service。404 本身可能来自 canvas/data 路由或资源不存在，但更大的问题是：产品层已经暴露在 `local-api -> canvas-service -> data-service` 的代理细节里，调试时自然会被迫思考“本地 API”“Canvas Service”“Data Service”这些 daemon 内部概念。

## 目标边界

### Desktop

Desktop 是窗口、视觉工作台、用户设置和系统集成入口。它可以：

- ensure/attach 本机唯一 `movscript.local-node` daemon；
- 读取 daemon 的运行状态和能力描述；
- 读取 daemon 产出的 system/workspace session context；
- 通过 daemon 配置接口设置 data plane 连接意图，例如本地、云端、外部 Data Service；
- 展示当前数据位置、账户、同步状态、诊断信息。

Desktop 不应该：

- 读取或拼接 `movscript.data.service`、`movscript.project.service`、`movscript.canvas.service` 等内部服务 endpoint；
- 将 `localAPIBaseURL`、`projectServiceBaseURL`、`canvasServiceBaseURL`、`dataServiceBaseURL` 暴露给 renderer；
- 在 renderer 或 shared settings 中用 `apiBaseURL` 区分本地 API 和云端 API；
- 根据 URL hostname 推断 data plane 并直接配置 Data Service。
- 在 renderer、settings、local storage 中把 `user_id`、`project_id`、`project_cwd` 当作权威上下文。

### local-surface-host

local-surface-host 是 daemon 提供给本机 surface 的 host 能力，不是第二个后端入口。它可以：

- 从同源 daemon gateway 或启动注入的 descriptor 获取 host 能力；
- 从 daemon 获取 workspace session context；
- 通过 daemon gateway 请求 project/canvas/editing/media 等能力；
- 暴露本机文件访问、窗口、拖拽、资源预览等 host capability。

local-surface-host 不应该：

- 直接拼接 `/local-api/data`、`/local-api/project`；
- 接收或传递 `projectServiceBaseURL` 这类内部 service URL；
- 在 surface runtime 中告诉 surface “Project Service 在哪里”。
- 自己生成 `project_id`、`project_cwd` 或 user context。

### surface domain

surface domain 是业务 UI 和交互模型。它应该只拿到 host capability 和 daemon gateway 抽象。它可以展示“本地数据 / 云端数据 / 外部连接”的产品状态，但不应该出现：

- `Data Service`、`Project Service`、`Canvas Service` 等内部服务名；
- `dataServiceBaseURL`、`projectServiceBaseURL`、`editingServiceBaseURL` 等字段；
- `/local-api` 作为错误提示、请求路径或 runtime contract 的一部分。
- 自行从 URL、cwd、local storage 拼装权威 user/project context。

### daemon

daemon 是唯一知道服务拓扑的本地 owner。它负责：

- 决定 data plane：`local | cloud | external`；
- 决定是否启动本地 Data Service；
- 决定是否连接云端或外部 Data Service；
- 配置 Data Service 的 auth 模式；
- 启动并监控 Project、Editing、Canvas、Media、local-surface-host 等本地服务；
- 提供稳定的 gateway API 和 runtime descriptor。
- 产出统一的 system context 与 workspace session context。

在本地 data plane 中，不应该有本地 Auth Service。当前设计里 Data Service 使用 `local-owner` 身份模式即可。Auth Service 是云端或测试配置的一部分，或者是远端 Data Service 背后的依赖。

## 当前已经对齐的部分

### 架构文档

`docs/movscript-agent-runtime-architecture.zh-CN.md` 和 `docs/movscript-surface-runtime-supplement.zh-CN.md` 已经基本写出了目标方向：

- 本地完整运行时 owner 是每个用户唯一的 `movscript.local-node`。
- Desktop、Agent Plugin、CLI 都 attach 到同一个 daemon。
- `MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE=local|cloud|external` 决定 daemon 使用哪种数据面。
- local data plane 启动本地 `movscript.data.service`。
- cloud/external data plane 不启动本地 Data Service，但仍启动 Project、Editing、Canvas、Media、local-surface-host 等本地能力，并连接远端或外部 Data Service。
- 本地默认不启动本地 Auth Service，Data Service 使用 `local-owner`。

这说明产品方向已经清楚，主要问题在实现层和运行时 contract 还没有完全收口。

### local-runtime

`packages/local-runtime/src/index.ts` 已经提供了正确的 daemon-first 基础：

- `LOCAL_RUNTIME_DAEMON_APP_ID = "movscript.local-node"`；
- 通过 control service 探测并复用已有 daemon；
- 使用启动锁避免多个入口并发启动多个 daemon；
- daemon required services 根据 data plane 决定是否包含 `movscript.data.service`。

这部分应继续作为 Desktop、Plugin、CLI 的唯一 ensure/attach 入口。

### Plugin full-local

`apps/plugin/src/agent-mcp.ts` 的 full-local 运行方式已经接近目标：

- plugin-full-local 启动前会 prepare `movscript.local-node`；
- session 内 MCP host 不再自己拥有一组独立服务；
- daemon 根据 data plane 启动服务。

需要注意的是，Plugin 里仍然有 `/local-api` compatibility routes 和内部服务 manifest。这些可以作为 daemon 内部兼容层继续存在一段时间，但对 Desktop/surface 不应该是公开 contract。

### Data/Auth Service 关系

`services/auth-service` 的 manifest 只定义 cloud/test profile，符合“本地不启动 Auth Service”的方向。

Data Service config 和 authprovider 已支持：

- `local-owner`：本地 owner 身份；
- `opaque-key`：通过 Auth Service introspect；
- `no-auth` / `test`：测试或特殊模式。

后续要保持这个原则：Desktop 不配置 Auth Service，也不判断 auth 模式。daemon 根据 data plane 和服务配置生成 Data Service 环境。

## 当前主要越界点

### 1. Electron runtime config 暴露内部服务

典型位置：

- `apps/desktop/electron/services/runtimeConfig.ts`
- `apps/desktop/src/shared/contracts/electronApiCore.ts`
- `apps/desktop/src/shared/infrastructure/config.ts`

现状问题：

- Electron main 读取 runtime home 中的 `movscript.data.service`、`movscript.project.service`、`movscript.canvas.service`、`movscript.local-node.gateway` endpoint。
- renderer contract 暴露 `gatewayBaseURL`、`dataServiceBaseURL`、`apiBaseURL`、`projectServiceBaseURL`、`canvasServiceBaseURL`、`canvasServiceV1BaseURL`、`localAPIBaseURL`。
- `canvasServiceV1BaseURL` 目前会被计算成 gateway `/local-api` 或 service `/v1`，这把兼容路由和内部服务路径都泄露到了 renderer。

目标：

- Electron 只暴露 daemon runtime descriptor。
- renderer 只知道 daemon gateway 和 capability，不知道内部 service URL。
- `localAPIBaseURL` 从 renderer contract 中消失。

### 2. Desktop settings 把本地/云端建模成 API URL

典型位置：

- `packages/shared/src/appSettings.ts`
- `apps/desktop/src/shared/infrastructure/appSettingsStore.ts`
- `apps/desktop/electron/ipc/settingsIpc.ts`
- `apps/desktop/src/features/onboarding/components/ModeSelectionPanel.tsx`

现状问题：

- AppSettings 包含 `apiBaseURL`、`cloudAPIBaseURL`、`localAPIBaseURL`。
- launch mode 会直接把 active `apiBaseURL` 切成 local 或 cloud URL。
- `settingsIpc.ts` 通过 URL hostname 推断 data plane，并直接处理 Data Service URL。
- Onboarding UI 选择本地/云端时也在写 API base URL。

目标：

- settings 存 product intent，而不是 transport URL。
- 建议字段形态：

```ts
type DataConnectionIntent =
  | { kind: "local" }
  | { kind: "cloud"; workspaceId?: string; accountId?: string }
  | { kind: "external"; dataServiceURL: string; label?: string };
```

- Desktop 把 intent 交给 daemon configure API。
- daemon 返回实际 descriptor，Desktop 用 descriptor 展示状态。
- renderer 不根据 local/cloud 选择 API origin。

### 3. Desktop project surface runtime 同时理解 gateway 和 service

典型位置：

- `apps/desktop/src/features/app-shell/application/desktopProjectSurfaceRuntime.tsx`

现状问题：

- runtime 中同时存在 `/v1/project/...` 和 `/local-api/project/...` 常量。
- `createGatewayClient` 会在 gatewayBaseURL 和 projectServiceBaseURL 之间选择。
- decision store 使用 `dataServiceBaseURL`。
- read model 根据 `gatewayBaseURL || projectServiceBaseURL` 判断是否启用。

目标：

- Desktop Project Surface Runtime 只使用 daemon gateway client。
- Project command/query/read-model 统一走 daemon gateway API。
- Data decision store 通过 daemon capability 或 project gateway 间接访问，不直接拿 Data Service base URL。

### 4. local-surface-host 硬编码 `/local-api`

典型位置：

- `services/local-surface-host/src/host-runtime/infrastructure/api.ts`
- `services/local-surface-host/src/host-runtime/infrastructure/config.ts`
- `services/local-surface-host/src/project/localProjectSurfaceRuntime.ts`
- `services/local-surface-host/src/adapters/localContentSurfaceHostApi.ts`
- `services/local-surface-host/src/routes/localRouteLinks.ts`
- `services/local-surface-host/src/adapters/resourceSurfaceRoutes.tsx`
- `services/local-surface-host/src/admin/LocalAdminSurfaceRoute.tsx`

现状问题：

- 多处直接拼接 `/local-api/data/api/v1`、`/local-api/project/...`。
- localProjectSurfaceRuntime 接收 `projectServiceBaseURL`，并在 direct service path 与 local endpoint 之间切换。
- admin/resource routes 将 Data API path 暴露为 surface host 的固定路径。

目标：

- local-surface-host 的 bootstrap 输入只包含 daemon gateway descriptor 或 same-origin gateway root。
- 去掉 `projectServiceBaseURL` 作为 surface runtime contract。
- 所有 project/canvas/data/editing/media 请求通过 daemon gateway 的稳定 API。
- `/local-api` 只能留在 daemon gateway 内部作为 backward-compatible alias。

### 5. surface/project runtime 仍然把 service URL 当 contract

典型位置：

- `surface/project/src/runtime/ProjectSurfaceRuntime.ts`
- `surface/project/src/components/overview/ProjectOverviewSurface.tsx`
- `surface/project/src/components/resource-view/ProjectResourceViewSurface.tsx`
- `surface/project/src/components/settings/ProjectSettingsSurface.tsx`
- `surface/project/src/components/home/ProjectPickerSurface.tsx`

现状问题：

- `ProjectSurfaceRuntime.services` 包含 `dataServiceBaseURL`、`projectServiceBaseURL`、`editingServiceBaseURL`、`mediaPipelineBaseURL` 等字段。
- UI 中会展示 `Project Service` / `Data Service` 等内部服务名称。
- ProjectPickerSurface 里仍会构造 `/local-api/data/api/v1`。

目标：

- surface runtime 改为：

```ts
type ProjectSurfaceRuntime = {
  host: {
    gatewayBaseURL: string;
    dataConnection: DataConnectionSummary;
    capabilities: ProjectSurfaceCapabilities;
  };
};
```

- UI 展示“数据位置”“连接状态”“同步状态”“本机能力”，不展示内部 service endpoint。
- surface domain 不再拥有 service-level contract。

### 6. canvas/editing surface 暴露 `/local-api` 字样

典型位置：

- `surface/canvas/src/i18n/locales/en-US.json`
- `surface/canvas/src/i18n/locales/zh-CN.json`
- `surface/editing/src/service-host-api.ts`
- `surface/editing/src/features/media/localMedia.ts`

现状问题：

- Canvas error copy 提醒检查 `/local-api/canvas/canvases`。
- Editing/local media 直接请求 `/local-api/editing/import-file`、`/local-api/editing/media-file`。

目标：

- Canvas API client 可以继续使用 host 注入的 relative path，但错误信息不能提 `/local-api`。
- Editing/media 这类本机能力 endpoint 应命名为 daemon/host capability，例如 `/v1/editing/import-file` 或 `/v1/host/media-file`。
- host capability 可以本地-only，但不能叫 local-api。

### 7. Node service clients 的 runtime discovery 需要限定使用边界

典型位置：

- `packages/data-client/src/index.ts`
- `packages/project/src/index.ts`
- `packages/editing/src/service-client.ts`
- `services/canvas-service/src/server.mjs`
- `services/project-service/src/server.mjs`

现状判断：

- 这些包里存在 service name、runtime endpoint discovery、`MOVSCRIPT_*_SERVICE_URL` env override，是合理的后端/daemon/internal 工具能力。
- 问题不是它们存在，而是不能被 Desktop renderer、surface domain 或 browser host 当作 product contract。

目标：

- 保留 Node/daemon/service 侧 discovery。
- 明确 browser bundle 禁止 import runtime-home service discovery。
- 对 browser/surface 暴露 gateway-level clients，而不是 service-level clients。

## 已定架构决策

### Decision 1：canonical gateway prefix 统一使用 `/v1`

长期 public gateway prefix 定为 `/v1`，不另设 `/daemon-api/v1`。

原因：

- Desktop、Surface Host、surface domain 面向的是 MovScript runtime capability，不是某个实现形态的“daemon API”。
- 同一套 surface/runtime contract 应该可以覆盖 local、cloud、external data plane。`/daemon-api/v1` 会把“本机 daemon”这个实现细节写进调用路径，后续云端或外部 host 复用同一套 surface contract 时会继续制造心智负担。
- daemon 身份应该出现在 runtime descriptor 的 `runtime.appId = "movscript.local-node"` 中，而不是出现在每个业务 API path 中。

因此：

- canonical runtime gateway 使用 `/v1/...`。
- `/local-api/...` 只作为 `movscript.local-node.gateway` 内部 backward-compatible alias。
- 不引入 `/daemon-api/v1`。

### Decision 2：`local-surface-host` 只保留为内部服务名

`local-surface-host` 可以暂时保留为 daemon 内部 package/process/service 名，避免把这次接口收口变成大规模机械 rename。但它不再作为 Desktop/surface 的 public contract 词汇。

公开 contract 使用：

- 产品概念：`Surface Host`；
- descriptor capability 字段：`surfaceHost`；
- host 能力路径：`/v1/host/...`。

禁止继续扩散：

- `local backend`；
- `local API`；
- `localSurfaceHost` 作为 renderer/surface contract 字段；
- 让 surface runtime 知道 `local-surface-host` 这个服务名。

后续如果要做包名清理，可以把 `services/local-surface-host` 机械迁移成 `services/surface-host`，但这不是接口收口的前置条件。

### Decision 3：debug diagnostics 允许展示内部服务拓扑，但必须隔离

允许 diagnostics 展示 daemon 内部 service topology，包括 service name、endpoint、health、pid、profile、data plane、auth mode 等信息。但它必须是 debug-only contract，不能进入普通 runtime descriptor，也不能成为业务调用分支依据。

规则：

- 普通 descriptor：`GET /v1/runtime/descriptor`，不包含内部 service endpoint。
- 普通状态：`GET /v1/runtime/status`，只返回产品级 readiness 和 data connection summary。
- 调试诊断：`GET /v1/runtime/diagnostics`，可以返回内部服务拓扑。
- diagnostics API 需要显式 debug/dev 权限或本机 owner 权限。
- diagnostics response 中的 token、secret、auth header、database path 中的敏感片段必须 redacted。
- Desktop 可以有 debug-only 页面展示 diagnostics，但正常 UI 和业务 runtime 不得读取 diagnostics 来决定 API path。
- architecture tests 应限制 diagnostics client 只出现在 debug/diagnostics 模块中。

### Decision 4：web-surface-host 复用同一 descriptor 形态

web-surface-host 的云端部署也应复用 `MovScriptRuntimeDescriptor` 的形状，但字段含义从“本机 daemon”泛化为“当前 host runtime”。

也就是说：

- local Desktop 场景：descriptor 来自 `movscript.local-node`。
- cloud web 场景：descriptor 来自 cloud host/runtime gateway。
- surface domain 只消费同一种 `runtime descriptor + capabilities`，不分 local/web/cloud host。

为了避免类型名长期过窄，后续实现时可以把公开类型命名为 `MovScriptRuntimeDescriptor`，其中 local 场景的 `runtime.owner` 或 `runtime.appId` 再表达 `movscript.local-node`。

## 建议目标 API

### Runtime Descriptor

Desktop、Surface Host、surface domain 应只消费 runtime descriptor。建议公开形态：

```ts
type MovScriptRuntimeDescriptor = {
  runtime: {
    owner: "local-daemon" | "cloud-host" | "external-host";
    appId?: "movscript.local-node";
    version: string;
    status: "starting" | "ready" | "degraded" | "stopped";
    gatewayBaseURL: string;
    controlBaseURL?: string;
  };
  dataConnection: {
    kind: "local" | "cloud" | "external";
    label: string;
    accountId?: string;
    workspaceId?: string;
    dataResidency?: string;
    health: "unknown" | "checking" | "ready" | "degraded" | "offline";
  };
  capabilities: {
    project: boolean;
    canvas: boolean;
    editing: boolean;
    mediaPipeline: boolean;
    surfaceHost: boolean;
    localFileAccess: boolean;
  };
  surfaces: {
    project?: string;
    canvas?: string;
    admin?: string;
    editing?: string;
  };
};
```

descriptor 里不出现：

- Data Service URL；
- Project Service URL；
- Canvas Service URL；
- Auth Service URL；
- `/local-api`。
- `local-surface-host` 内部服务名。

### System Context API

`user_id`、`project_id`、`project_cwd` 这类系统上下文应该统一由 daemon 产出。更准确地说，daemon 是 context composer/issuer：它不一定是所有字段的原始来源，但它是唯一对 Desktop、Surface Host、surface domain、Plugin、CLI 发放权威 context snapshot 的入口。

字段来源原则：

- `user_id` / principal：来自当前 data/auth plane。本地 data plane 下由 daemon/Data Service 映射为 `local-owner`；云端 data plane 下来自云端 auth/session；external data plane 下来自外部连接的 principal summary。
- `project_id`：来自 Project Service 或 Data Service 中的项目记录，由 daemon gateway 归一化为当前 project context。
- `project_cwd`：只在具备本机文件访问能力时存在。Desktop 可以让用户选择本地目录，但 daemon 必须校验、归一化并作为 session context 发放。
- route params、local storage、env vars 可以作为启动 hint，但不能作为权威 context。

建议公开类型：

```ts
type MovScriptContextEnvelope = {
  contextId: string;
  revision: number;
  issuedAt: string;
  runtime: MovScriptRuntimeDescriptor["runtime"];
  principal: {
    userId: string;
    kind: "local-owner" | "cloud-user" | "service-account" | "external-user";
    accountId?: string;
    displayName?: string;
  };
  dataConnection: MovScriptRuntimeDescriptor["dataConnection"];
  session?: MovScriptWorkspaceSessionContext;
};

type MovScriptWorkspaceSessionContext = {
  sessionId: string;
  windowId?: string;
  project?: {
    id: string;
    slug?: string;
    title?: string;
  };
  workspace?: {
    kind: "local-fs" | "cloud" | "external";
    projectCwd?: string;
    rootUri?: string;
  };
  capabilities: {
    localFileAccess: boolean;
    fileImport: boolean;
    mediaPreview: boolean;
  };
};
```

上下文需要分两层：

- system context：用户、data connection、runtime owner、全局 capability。
- workspace session context：当前窗口或当前 surface session 的 project、cwd、workspace root。

不能把所有上下文都做成 daemon 全局单例，因为 Desktop 可能有多个窗口，Plugin/CLI 也可能同时操作不同项目。daemon 应支持多个 workspace session，每个 session 有自己的 `sessionId`、`project.id` 和 `workspace.projectCwd`。

建议 API：

```http
GET  /v1/context
POST /v1/context/sessions
GET  /v1/context/sessions/:sessionId
PATCH /v1/context/sessions/:sessionId
GET  /v1/context/sessions/:sessionId/events
```

约束：

- Desktop 创建或切换项目时，调用 daemon context session API，而不是只在 renderer/store 里改 project id。
- Surface Host 启动 surface 时注入 `MovScriptContextEnvelope`，surface 只消费这个 envelope。
- Plugin/CLI 获取上下文也走同一套 API，避免 MCP、Desktop、surface 对同一项目产生不同理解。
- context snapshot 必须带 `revision`，长任务和写操作应携带 revision 或 session id，daemon 负责检测 stale context。
- `projectCwd` 属于本机 host capability，不应出现在 cloud web surface 的普通 context 中。
- diagnostics 可以展示更完整 context graph，但普通 context envelope 不包含内部 service endpoint 和 secrets。

### Runtime Configure API

Desktop 设置页需要配置云端或外部连接时，调用 daemon，不直接改 service 环境：

```http
GET  /v1/runtime/status
POST /v1/runtime/configure-data-connection
GET  /v1/runtime/descriptor
GET  /v1/runtime/diagnostics
GET  /v1/context
POST /v1/context/sessions
```

请求示例：

```json
{
  "dataConnection": {
    "kind": "external",
    "dataServiceURL": "https://data.example.com",
    "label": "Team Data Service"
  }
}
```

daemon 负责：

- 校验连接；
- 决定 data plane；
- 写入本地 daemon config；
- 重启或热更新相关服务；
- 返回新的 descriptor。

Desktop 只展示结果。

`/v1/runtime/diagnostics` 是 debug-only API，不属于正常业务 runtime contract。

### Daemon Gateway API

长期 public gateway prefix 使用 `/v1`，把 `/local-api` 降级成 daemon 内部兼容 alias：

```text
/v1/runtime/...
/v1/project/...
/v1/canvas/...
/v1/editing/...
/v1/media/...
/v1/host/...
```

兼容期：

```text
/local-api/project/* -> /v1/project/*
/local-api/canvas/*  -> /v1/canvas/*
/local-api/editing/* -> /v1/editing/*
/local-api/data/*    -> daemon-owned data facade or legacy proxy
```

约束：

- 只有 daemon gateway 实现 `/local-api` alias。
- Desktop、local-surface-host、surface 新代码禁止引用 `/local-api`。
- Tests 可以引用 `/local-api` 仅用于兼容层验证。

## 分阶段改造计划

### Phase 0：加边界护栏

目标：先防止继续扩大泄漏面。

工作项：

- 在 docs 中明确本文件作为 Desktop/surface/daemon runtime boundary 的依据。
- 增加或更新 architecture tests，禁止以下 pattern 出现在 Desktop renderer、local-surface-host、surface domain：
  - `/local-api`
  - `localAPIBaseURL`
  - `dataServiceBaseURL`
  - `projectServiceBaseURL`
  - `canvasServiceBaseURL`
  - `movscript.data.service`
  - `movscript.project.service`
  - `movscript.canvas.service`
- 增加 context boundary tests，禁止 Desktop renderer、Surface Host、surface domain 将 local storage、route params、env vars 中的 `user_id`、`project_id`、`project_cwd` 当作权威上下文。
- 允许例外目录：
  - `apps/plugin/src/agent-mcp.ts` daemon gateway compatibility layer；
  - `packages/local-runtime`；
  - backend services；
  - Node-only service clients；
  - tests explicitly named compatibility tests。

交付标准：

- 新代码不能再把 internal service URL 传进 renderer/surface。
- 文档中列出的 deprecated fields 有清晰替代物。

### Phase 1：补齐 daemon descriptor/config API

目标：让 Desktop 和 local-surface-host 有一个稳定的 daemon-only contract。

工作项：

- 在 `movscript.local-node.gateway` 或 control server 上提供 runtime descriptor。
- 在 daemon gateway 上提供 system context 和 workspace session context API。
- 增加 data connection configure API，把 `settingsIpc.ts` 中的 URL 推断和 data plane 决策搬到 daemon。
- daemon config 中保存 data connection intent，而不是让 Desktop 保存 active API URL。
- descriptor 返回 data location summary，供 Desktop UI 展示。
- context envelope 返回 principal、data connection、project、workspace root/cwd 和 capability summary。
- Desktop/Plugin/CLI 的 project focus、cwd、workspace root 切换都写入 daemon session context。
- 保留 service-level health diagnostics，但放到 debug-only 字段或单独 diagnostics API，不能作为 renderer 业务分支依据。

交付标准：

- Desktop 可以只靠 descriptor 展示本地/云端/外部数据状态。
- 修改 data connection 不需要 Desktop 直接知道 Data Service endpoint。
- Desktop、Plugin、CLI、Surface Host 对同一 `sessionId` 看到一致的 `userId`、`project.id`、`workspace.projectCwd`。

### Phase 2：收口 Desktop runtime contract

目标：Desktop renderer 不再理解 daemon 内部服务。

工作项：

- 改造 `ElectronRuntimeConfig`：
  - 删除 `dataServiceBaseURL`、`projectServiceBaseURL`、`canvasServiceBaseURL`、`canvasServiceV1BaseURL`、`localAPIBaseURL`；
  - 新增 `runtime: MovScriptRuntimeDescriptor`。
- 改造 `apps/desktop/src/shared/infrastructure/config.ts`：
  - 移除 `LOCAL_API_ORIGIN` 作为 renderer API contract；
  - 保留云端默认值仅作为 data connection intent 的默认配置，不作为 active API origin。
- 改造 `appSettingsStore` 和 onboarding：
  - `launchMode` 可以保留为产品选择；
  - API URL 字段迁移为 `dataConnection` intent。
- 改造 Desktop project/window context：
  - renderer 不再把 route/local storage 中的 `project_id` 或 cwd 当作权威值；
  - project selection、workspace folder selection 通过 daemon context session API 提交；
  - renderer 从 `MovScriptContextEnvelope` 读取当前 user/project/workspace context。
- 改造 `desktopProjectSurfaceRuntime.tsx`：
  - project/canvas/read-model/decision-store 都通过 daemon gateway client；
  - 删除 gateway vs project service dual path。
- 改名 `BackendBootBoundary`、`localBackend` 等 UI/状态概念：
  - 建议迁移为 `DaemonBootBoundary`、`runtimeDaemonStatus`、`dataConnectionStatus`。

交付标准：

- renderer contract 中没有 service URL。
- Desktop 切本地/云端不会改变 renderer 使用的 API abstraction，只改变 daemon descriptor 返回的 data connection 状态。

### Phase 3：收口 local-surface-host

目标：local-surface-host 不再自己理解 local-api 或 Project Service。

工作项：

- bootstrap 时注入 daemon descriptor 或 same-origin gateway root。
- bootstrap 时注入 `MovScriptContextEnvelope`，并用 `sessionId` 绑定当前 surface session。
- 移除 `localProjectSurfaceRuntime.ts` 的 `projectServiceBaseURL` 输入。
- 改造 `localContentSurfaceHostApi.ts`、`localRouteLinks.ts`、`resourceSurfaceRoutes.tsx` 等：
  - 从 hardcoded `/local-api/...` 切到 daemon gateway client；
  - 路由 helper 命名从 `localDataAPIV1BaseURL` 改为 host/gateway capability。
- admin surface 不直接显示 Data API base URL。
- Surface Host 不自行生成 `user_id`、`project_id`、`project_cwd`，只传递 daemon-issued context。

交付标准：

- local-surface-host 中只有 gateway/client abstraction，没有 `/local-api` string。
- surface host 不再能绕过 daemon gateway 直接打 Project Service。
- 同一个 surface session 的 context revision 在 host 和 surface domain 中一致。

### Phase 4：收口 surface runtime

目标：surface domain 不再携带 service topology。

工作项：

- 改造 `ProjectSurfaceRuntime.services` 为 `host` 或 `runtime` descriptor。
- 改造 `ProjectSurfaceRuntime` 注入 context envelope，surface 从 context 读取 project/user/workspace，而不是从 service URL、route 或 local storage 推断。
- 移除 project/canvas/settings UI 中的 `Project Service`、`Data Service` endpoint 展示。
- ProjectPickerSurface 不再生成 `/local-api/data/api/v1`。
- Canvas error copy 改成“Canvas runtime unavailable / daemon gateway unavailable”一类产品语言。
- Editing/media local endpoints 改成 daemon host capability path。

交付标准：

- surface/project、surface/canvas、surface/editing 里没有 service URL contract。
- 用户看到的是数据连接状态和 host 能力，不是内部服务名。
- surface domain 不自行生成权威 `user_id`、`project_id`、`project_cwd`。

### Phase 5：整理 internal service clients

目标：保留必要的后端能力，同时防止 browser 误用。

工作项：

- 给 `packages/data-client`、`packages/project`、`packages/editing` 明确 Node-only entrypoint 和 browser-safe entrypoint。
- service discovery、runtime-home、`MOVSCRIPT_*_SERVICE_URL` 只存在于 Node-only entrypoint。
- browser/surface entrypoint 只接受 daemon gateway base URL 或 host client。
- Canvas/Project/Editing Service 的 fallback `http://127.0.0.1:8766` 改成 daemon-internal default，并用注释说明只供 daemon/dev 使用。

交付标准：

- bundler/test 能阻止 surface/browser import Node runtime discovery。
- daemon 和 backend 服务仍可用 service-level discovery。

### Phase 6：兼容层下线

目标：把 `/local-api` 留作临时 alias，再逐步下线。

工作项：

- daemon gateway 为 `/local-api` alias 加 deprecation log 或 metrics。
- 更新所有 product callers 后，只保留 compatibility tests。
- 发布一个迁移窗口后删除 `/local-api` alias，或者保留但明确为 private compatibility。

交付标准：

- 运行时产品路径全部通过 `/v1/...` daemon gateway。
- `/local-api` 不再是开发者需要理解的概念。

## 优先级建议

1. 先做 Phase 0 和 Phase 1。没有 descriptor/config API，就会逼着 Desktop 继续传 service URL。
2. 第二优先级是 Desktop renderer contract。它是心智负担最大的入口，也是本地/云端 API 特殊化最明显的位置。
3. 第三优先级是 local-surface-host，因为它目前直接把 `/local-api` 固化进 surface 运行时。
4. surface domain 的 UI 和 runtime contract 可以跟着 host 改造逐步替换。
5. internal clients 最后清理，不要一开始动太多服务内部发现逻辑。

## 验收清单

架构验收：

- 本机只有一个 `movscript.local-node` daemon owner。
- Desktop、Plugin、CLI 都 attach 同一个 daemon。
- local data plane 不启动本地 Auth Service。
- cloud/external data plane 不要求 Desktop 直连远端 Data Service。
- `user_id`、`project_id`、`project_cwd` 等系统上下文由 daemon context envelope 统一产出。
- project/cwd 是 workspace session scope，不是 daemon 全局单例。

代码边界验收：

- Desktop renderer contract 不包含 `*ServiceBaseURL`。
- Desktop renderer 不包含 `/local-api`。
- local-surface-host 不包含 `/local-api`。
- surface domain 不包含 `Data Service` / `Project Service` endpoint contract。
- service discovery 只存在于 daemon/backend/Node-only clients。
- Desktop renderer、Surface Host、surface domain 不把 route params、local storage、env vars 当作权威 user/project/workspace context。
- `projectCwd` 只通过 host capability/context envelope 暴露，不进入云端普通 web surface context。

行为验收：

- Desktop 本地启动：daemon ready，descriptor 显示 `dataConnection.kind = "local"`。
- Desktop 云端连接：daemon ready，descriptor 显示 `dataConnection.kind = "cloud"`，renderer 调用方式不变。
- Desktop 外部 Data Service：daemon ready，descriptor 显示 `dataConnection.kind = "external"`，renderer 调用方式不变。
- Desktop 创建/切换项目：daemon 创建或更新 workspace session context，surface 收到同一 `sessionId` 和 context revision。
- Plugin/CLI attach 同一项目 session：读取到与 Desktop 一致的 `principal.userId`、`project.id`、`workspace.projectCwd`。
- Canvas detail route 不再通过产品层拼接 `/local-api/canvas/canvases/:id`。
- 切换 data connection 后，daemon 负责重启/重配服务，Desktop 只刷新 descriptor。

## 一句话结论

当前代码已经有 `movscript.local-node` 作为唯一 daemon owner 的骨架，但 Desktop、local-surface-host 和 surface runtime 仍把 `/local-api`、内部服务 URL、以及 user/project/workspace 上下文当成各自可拼装的 contract。下一步不应该先大规模删除代码，而是先补 daemon descriptor/config/context API，再逐层把 Desktop 和 surface 的 contract 收到 daemon gateway 与 daemon-issued context envelope 上；本地/云端只作为 daemon 的 data connection 状态存在，不再成为 UI 层选择 API 或拼装系统上下文的依据。
