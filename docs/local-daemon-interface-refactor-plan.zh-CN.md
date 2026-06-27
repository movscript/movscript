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

### Decision 5：Project source 完全收口到 Project Service

Project Service 是 project source、project read model、project resource view、project context snapshot 和 project source 派生产物的唯一公开 owner。

纳入 Project Service 的 project source 范围包括：

- `project.json`
- `project_standards.json`
- `settings/**`
- `scripts/**`
- `content_units/**`
- `productions/**`

Project standards 的 provider skill 编译也归 Project Service 所有。也就是说，`project_standards.json` 编译/同步出的 `.codex`、`.claude`、`.mova` provider skill files 是 Project Service source command 的派生产物，而不是 Desktop、Plugin、CLI、Surface Host、surface domain 或 MCP tool 自己负责的副作用。

实现上可以继续让 workspace package 提供低层文件写入、标准 skill 编译、script markdown 解析、script version snapshot 等纯实现能力。但这些实现能力只能作为 Project Service 内部调用，不能成为产品入口的 public contract。

目标边界：

- 创建或更新 project standards：走 Project Service。
- 读取 project standards/context snapshot：走 Project Service。
- 编译或同步 project standards provider skills：由 Project Service 命令触发并返回结果。
- 创建或更新 script metadata 与 `script.md`：走 Project Service。
- 读取 script source：走 Project Service。
- 创建 script version / script blocks：走 Project Service。
- resource view 中的 scripts、script versions、project standards/context 都由 Project Service 产出。
- MCP/domain tools 可以保留工具名，但实现必须调用 Project Service client，而不是本进程直接读写 project source files。

禁止边界：

- Desktop/Surface Host/surface domain 直接读写 `project_standards.json` 或 `scripts/**`。
- Plugin/MCP tool 直接调用 workspace service 写入 project standards、script 或 standard skill files。
- Agent/runtime code 把 `project_standards.json -> provider skills` 当成本地后处理任务。
- Project standards/script 的读取路径绕过 Project Service，直接从 workspace engine、file repository 或 local path 推导结果。

### Decision 6：Project Service 性能排查是收口前置项

Project source 完全收口会把更多读写、context snapshot、interpret、candidate command 和派生产物同步集中到 Project Service。如果当前一次 `interpret + candidate` 链路约 1s，必须把性能排查纳入同一轮改造，而不是等收口完成后再补。

性能排查使用真实 `~/.movscript` local daemon 作为主环境，不只依赖临时目录或单元测试 fixture。原因是性能问题很可能来自真实 MovScript Home 里的 runtime records、local sqlite、项目规模、provider skill files、`.interpret` 写入、candidate decision store、服务间 JSON 序列化和 daemon gateway 代理开销。

建议基线环境：

```bash
MOVSCRIPT_HOME="$HOME/.movscript" apps/plugin/bin/movscript daemon restart --data-plane local
MOVSCRIPT_HOME="$HOME/.movscript" apps/plugin/bin/movscript daemon status
```

测量原则：

- 分开 cold start 与 warm request，不把 daemon/service 启动时间混进 Project Service 单次请求。
- 分开测 `interpret`、candidate command、`interpret + candidate` 串行链路。
- 同时记录 daemon gateway 总耗时、Project Service handler 耗时、workspace/index/interpret 耗时、Data Service/decision store 耗时。
- 每次记录 project id、project cwd、source file count、source hash、是否写 `.interpret`、是否触发 provider skill sync、data plane、decision store 类型。
- 性能诊断结果属于 debug diagnostics，不进入普通 runtime descriptor，也不能让 Desktop/surface 按内部服务拓扑分支。

初始判断标准：

- warm `interpret + candidate` 约 1s 应视为需要优化的性能缺口。
- 优先确认是否存在重复 source scan、重复 engine/index rebuild、重复 interpret、同步写 `.interpret`、重复 provider skill compilation、candidate command 内部重复读写 Data Service。
- 优化目标先以真实 `~/.movscript` 项目的 p50/p95 基线为准，避免只优化小 fixture。

### Decision 7：内容画布归 Project Service，工作流画布归 Canvas Service

画布需要先按产品语义拆成两个 owner，而不是只按 UI 都叫 canvas 来路由。

内容画布是 project content model 的图形化编辑与运行入口。它表达的是项目内容结构、script/content units/productions、资源引用、候选与选择状态、以及这些内容之间的关系。它的存储、列表、打开、编辑、保存、运行、interpret/read-model 同步都归 Project Service。也就是说，内容画布不是一个独立于 project source 的 Canvas Service 文档，而是 Project Service 对 project source/read model/source-derived artifacts 的一等视图和命令入口。

内容画布还必须有稳定的产品级 metadata。`name` / `title` 不是前端临时显示字段，而是 Project Service 持久化、列表、打开、改名、保存、运行 response 都能返回的一等字段。内容画布可以有默认名，但必须支持创建时命名、后续重命名，并在 revision、read model 和 context snapshot 中保持一致。

工作流画布是 workflow/automation/process graph 的文档。它的存储、列表、打开、编辑、保存归 Canvas Service。工作流画布可以引用 project entity、raw resource、editing task、media job 等对象，但引用必须使用 typed refs 和 daemon-issued context；Canvas Service 不能把 project source 文件结构当作自己的存储模型，也不能直接绕过 Project Service 修改内容项目。

边界规则：

- 内容画布 public API 放在 daemon gateway 的 `/v1/project/...` 族下，背后由 Project Service 处理。
- 工作流画布 public API 放在 daemon gateway 的 `/v1/canvas/...` 族下，背后由 Canvas Service 处理。
- Desktop、Surface Host、surface domain 不能因为“这是本地内容画布”或“这是工作流画布”选择内部 service URL；它们只调用 daemon gateway。
- 内容画布运行产生的 project source 变更、candidate/selection、read model、context snapshot 都由 Project Service 保证 revision 和一致性。
- 工作流画布如果触发 project/editing/media 行为，只能通过 daemon capability APIs 调用 Project Service、Editing Service、Media Pipeline 等 owner，不能由 Canvas Service 直接读写对应内部存储。
- 两类画布的 ID、URL、route 可以在 UI 上并存，但 contract 里必须携带 `canvasKind` 或等价 discriminator，避免用字符串路径或 URL 猜 owner。

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

### Project Source API

Project source 的公开 API 由 daemon gateway 暴露为 `/v1/project/...`，背后只路由到 Project Service。Desktop、Surface Host、surface domain、Plugin、CLI 和 MCP tools 不直接访问 Project Service endpoint，更不直接访问 project source files。

建议 Project Service 能力补齐为：

```http
GET  /v1/project/source/context
POST /v1/project/source/entities/query
GET  /v1/project/source/project-standards
PUT  /v1/project/source/project-standards
POST /v1/project/source/project-standards/compile-skills
GET  /v1/project/source/scripts/:scriptId
PUT  /v1/project/source/scripts/:scriptId
GET  /v1/project/source/scripts/:scriptId/source
PUT  /v1/project/source/scripts/:scriptId/source
POST /v1/project/source/scripts/:scriptId/versions
POST /v1/project/resources/view
```

其中：

- `project-standards/compile-skills` 可以作为显式 debug/maintenance endpoint，也可以由 `PUT /project-standards` 默认触发；无论哪种形式，owner 都是 Project Service。
- `source/context` 返回 project standards + namespace vocabulary + project context hash，替代 MCP/runtime 进程内拼装 context snapshot。
- `scripts/:scriptId/source` 替代当前任何直接读取 `script.md` 的公开路径。
- `resources/view` 需要补齐 `project-standards` 和 `script-versions` 的一等视图。

兼容期可以继续保留 generic `POST /v1/project/source/command`，但它只能作为 Project Service 内部 command facade。迁移完成后，产品层应优先调用 typed project source APIs，减少“字符串 command name”在 Desktop/surface/MCP 之间扩散。

### Canvas Boundary API

画布 API 需要显式区分内容画布和工作流画布。建议公开 contract 先稳定在以下能力面，具体 path 可以按现有 router 命名微调，但 owner 不能再混用。

内容画布由 Project Service 提供：

```http
GET  /v1/project/content-canvases
POST /v1/project/content-canvases
GET  /v1/project/content-canvases/:canvasId
PATCH /v1/project/content-canvases/:canvasId
PUT  /v1/project/content-canvases/:canvasId
POST /v1/project/content-canvases/:canvasId/rename
POST /v1/project/content-canvases/:canvasId/run
GET  /v1/project/content-canvases/:canvasId/snapshots/:revision
```

工作流画布由 Canvas Service 提供：

```http
GET  /v1/canvas/workflows
POST /v1/canvas/workflows
GET  /v1/canvas/workflows/:canvasId
PATCH /v1/canvas/workflows/:canvasId
PUT  /v1/canvas/workflows/:canvasId
GET  /v1/canvas/workflows/:canvasId/versions/:revision
```

统一要求：

- list 返回稳定的 id、title、kind、owner、updatedAt、revision、project/session scope、dirty/conflict summary。
- open 返回完整 document/read model、revision、capabilities、refs resolve policy，不返回内部 service endpoint。
- create 支持传入 `title` / `name`；没有传入时由 Project Service 生成默认名，并返回可持久化的 title。
- 内容画布 rename 使用显式 rename command 或 title-only patch，需要携带 base revision，并返回新 revision、normalized title、validation diagnostics。
- edit 使用 patch 或 command，需要携带 base revision；冲突时返回 conflict，而不是 silent overwrite。
- save 返回新 revision、normalized document summary、validation diagnostics。
- 内容画布 run 返回 Project Service operation id、trace/context revision、read-model/candidate impact summary。
- 工作流画布保存只保存 workflow document；引用的 project/resource/editing 对象用 typed refs，不内嵌 owner 服务 URL。
- 两类画布都需要 autosave/manual save 的一致语义、undo/redo 所需的 revision/operation metadata，以及可恢复的 validation error。

### Project Service Performance Profiling

Project Service 需要提供 debug-only performance profiling，至少覆盖这些入口：

- `POST /v1/project/source/interpret`
- `POST /v1/project/candidates/command`
- `POST /v1/project/source/command`
- `POST /v1/project/read-model`
- `POST /v1/project/resources/view`
- `GET /v1/project/source/context`
- script/project-standards typed source APIs

建议在 Project Service response 的 debug-only metadata 或 `/v1/runtime/diagnostics` 中暴露：

```ts
type ProjectServicePerformanceTrace = {
  traceId: string;
  projectDir: string;
  dataPlane: "local" | "cloud" | "external";
  operation: string;
  coldStart: boolean;
  totalMs: number;
  spans: Array<{
    name: string;
    ms: number;
    count?: number;
  }>;
  counters: {
    sourceFiles?: number;
    sourceBytes?: number;
    entities?: number;
    candidatesRead?: number;
    candidatesWritten?: number;
    interpretArtifactsWritten?: number;
    standardSkillFilesWritten?: number;
  };
  cache: {
    sourceHash?: string;
    indexCacheHit?: boolean;
    readModelCacheHit?: boolean;
    interpretationCacheHit?: boolean;
  };
};
```

必须打点的内部阶段：

- daemon gateway proxy overhead；
- Project Service request body parse / response serialization；
- `readProjectSourceContext`；
- workspace file scan / source snapshot / source hash；
- domain index load/build；
- interpreter run；
- `.interpret` debug artifact writes；
- read-model projection；
- prompt/context compilation；
- candidate decision store read/write；
- Data Service round trip / sqlite query；
- project standards provider skill compilation/sync；
- script markdown read/write and script version block generation。

优先排查的性能假设：

- 每个 candidate command 之前重复 interpret 或重复 loadIndex。
- 每个 request 都重新创建 engine/workspace service，导致缓存无法复用。
- Project Service resource view 和 context snapshot 重复扫描同一批 source files。
- `.interpret` debug artifact 在普通 warm path 中同步写入过多。
- project standards provider skill compilation 在非 standards 写入路径中被重复触发。
- candidate decision store 通过 Data Service 做了过多小请求，应该批量读写或缓存。
- daemon gateway 和 Project Service 之间存在不必要的 JSON 深拷贝或大对象序列化。

性能排查交付物：

- 一份真实 `~/.movscript` 项目的基线表：cold start、warm interpret、candidate command、interpret+candidate、read-model、resource view。
- 一份 flame/spans 摘要，指出 1s 主要花在 source scan、interpret、decision store、Data Service、artifact write、gateway proxy 还是 serialization。
- 一组优化后对比数据，并纳入 Project Service regression test 或 smoke benchmark。

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
- 增加 project source boundary tests，禁止 Desktop、Surface Host、surface domain、Plugin/MCP tools 直接读写 `project_standards.json`、`scripts/**` 或 provider skill output paths；允许 Project Service、workspace package 内部实现和明确的 Project Service tests。
- 增加 canvas owner boundary tests，禁止内容画布走 Canvas Service document CRUD，禁止工作流画布走 Project Service source command；允许 daemon gateway、Project Service、Canvas Service 和明确的 compatibility tests。
- 增加 Project Service performance smoke benchmark，先记录现状，不要求第一步优化到目标值，但必须能稳定测出 warm `interpret`、candidate command、`interpret + candidate`。
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
- daemon gateway 的 `/v1/project/...` 只代理 Project Service，不让 Desktop/surface 选择 Project Service URL。
- 保留 service-level health diagnostics，但放到 debug-only 字段或单独 diagnostics API，不能作为 renderer 业务分支依据。

交付标准：

- Desktop 可以只靠 descriptor 展示本地/云端/外部数据状态。
- 修改 data connection 不需要 Desktop 直接知道 Data Service endpoint。
- Desktop、Plugin、CLI、Surface Host 对同一 `sessionId` 看到一致的 `userId`、`project.id`、`workspace.projectCwd`。

### Phase 1.5：Project source 完全收口到 Project Service

目标：project standards 和 scripts 不只是“部分写入走 Project Service”，而是读、写、resource view、context snapshot、派生产物都由 Project Service 统一产出。

工作项：

- 补齐 Project Service typed source APIs：
  - read/upsert project standards；
  - compile/sync project standards provider skills；
  - query project source entities；
  - read/upsert script metadata；
  - read/update script source；
  - create script version and script blocks；
  - project context snapshot；
  - resource view for `project-standards`、`scripts`、`script-versions`。
- 把 `project_standards.json -> provider skill files` 的编译/同步明确为 Project Service command result，返回 `standardSkillFiles`、status、diagnostics。
- 改造 MCP/domain runtime：
  - `domain_read_project_context_snapshot` 调 Project Service，不在 MCP 进程内通过 `queryEntities/loadIndex` 拼装；
  - `domain_read_script_source` 调 Project Service，不直接调用 workspace service；
  - `domain_query_entities`、`domain_get_model` 等 project source read path 逐步切到 Project Service read/query API。
- 改造 project resource readers：
  - `movscript://project/:id/scripts` 继续走 Project Service；
  - 新增 `movscript://project/:id/project-standards` 或等价 resource；
  - script versions 和 project standards/context snapshot 都由 Project Service resource view 提供。
- 保留 workspace package 的底层写文件、解析、编译函数，但只作为 Project Service 内部实现，不作为外部调用入口。

交付标准：

- 对外没有任何入口直接读写 `project_standards.json` 或 `scripts/**`。
- 更新 project standards 后，provider skill files 的同步由 Project Service 完成并出现在 Project Service command response 中。
- 读取 project context snapshot 不绕过 Project Service。
- 读取 script source 不绕过 Project Service。
- MCP、Plugin、Desktop、Surface Host、surface domain 都只通过 daemon gateway / Project Service contract 访问 project standards 和 scripts。

### Phase 1.6：Project Service 性能排查与优化

目标：在真实 `~/.movscript` local daemon 下解释并降低 `interpret + candidate` 约 1s 的延迟，避免 Project Service 完全收口后把性能问题固化为新架构成本。

工作项：

- 使用真实 MovScript Home 启动 local daemon：
  - `MOVSCRIPT_HOME="$HOME/.movscript" apps/plugin/bin/movscript daemon restart --data-plane local`
  - `MOVSCRIPT_HOME="$HOME/.movscript" apps/plugin/bin/movscript daemon status`
- 选择真实项目做基线，记录 project cwd、source file count、entity count、candidate count、data plane、debug artifact 设置。
- 给 Project Service 增加 debug-only spans/counters：
  - gateway proxy；
  - request parse/serialization；
  - source scan/hash；
  - loadIndex/domain index；
  - interpret；
  - read model；
  - candidate decision store；
  - Data Service/sqlite；
  - `.interpret` writes；
  - standard skill compilation；
  - script version block generation。
- 分别测量：
  - cold daemon start；
  - warm `source/interpret`；
  - warm candidate command；
  - warm `interpret + candidate`；
  - read-model；
  - resource view；
  - project context snapshot。
- 根据 spans 排序优化：
  - 缓存 source hash / domain index / read model；
  - 避免 candidate command 内部重复 interpret；
  - 批量化 decision store 和 Data Service 小请求；
  - 只在需要时写 `.interpret` debug artifacts；
  - 只在 standards 变更时触发 provider skill compilation；
  - 避免大对象在 daemon gateway 与 Project Service 间重复 JSON 序列化。
- 输出 baseline 与优化后对比，作为后续 regression benchmark。

交付标准：

- 能用真实 `~/.movscript` local daemon 复现并解释当前 `interpret + candidate` 约 1s 的耗时构成。
- Project Service diagnostics 能返回每段耗时与关键 counters。
- 至少识别出首轮主要瓶颈，并给出明确优化项或已完成优化数据。
- 后续 Project Service source 收口不能让 warm `interpret + candidate` 比基线明显退化。

### Phase 1.7：画布 owner 边界收口

目标：把内容画布和工作流画布从“都叫 canvas 的 UI/路由”收口成两个稳定 owner，达到可成熟使用的存储、列表、打开、编辑、保存、运行能力。

工作项：

- 梳理现有 canvas route、canvas document、project content view、workflow graph、surface/canvas client、Canvas Service API 的调用路径，给每个入口标注 `canvasKind = content | workflow`。
- 内容画布：
  - 迁移到 Project Service API；
  - 存储与 project source/read model/revision 对齐；
  - 创建时支持命名，后续支持重命名，`title` / `name` 由 Project Service 持久化并进入 list/open/save/run response；
  - list/open/edit/save/run 都返回 Project Service revision、validation diagnostics、read-model/candidate impact；
  - run 不绕过 Project Service interpret/candidate/read-model pipeline。
- 工作流画布：
  - 保留在 Canvas Service API；
  - 存储 workflow document、nodes、edges、layout、metadata、versions；
  - 引用 project/raw resource/editing/media 对象时使用 typed refs；
  - 保存 workflow document 不直接修改 project source。
- daemon gateway：
  - `/v1/project/content-canvases...` 只代理 Project Service；
  - `/v1/canvas/workflows...` 只代理 Canvas Service；
  - 兼容旧 `/v1/canvas/canvases/:id` 时必须能判断 legacy document kind，并返回迁移/deprecation 信息。
- surface：
  - 内容画布 UI 只使用 Project Service owner 的 gateway client；
  - 内容画布列表或工具栏必须提供新建内容画布按钮；
  - 内容画布标题区域或更多菜单必须提供重命名按钮；
  - 新建和重命名都使用弹窗或对话框收集名称，并展示必填、长度、重复名、非法字符、stale revision 等校验错误；
  - 工作流画布 UI 只使用 Canvas Service owner 的 gateway client；
  - route、URL、local storage 不作为 owner 判断依据，只作为 UI navigation hint。
- 增加 mature workflow 测试：
  - create/list/open/edit/save/reopen；
  - content canvas create with name / rename / validation；
  - autosave/manual save；
  - stale revision conflict；
  - validation error recovery；
  - content canvas run；
  - workflow canvas typed-ref persistence。

交付标准：

- 内容画布的存储、列表、打开、编辑、保存、运行都由 Project Service 提供并和 project revision/read model 一致。
- 内容画布能创建时命名、后续重命名；前端有明确的新建按钮、重命名按钮和命名/重命名弹窗，且与 Project Service revision/validation 对齐。
- 工作流画布的存储、列表、打开、编辑、保存都由 Canvas Service 提供，并能稳定保存/恢复 workflow graph。
- Desktop、Surface Host、surface domain 不再根据 URL/path/service name 猜画布 owner。
- 旧 canvas route 的兼容行为有明确 deprecation 说明和迁移路径。

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
2. 接着做 Phase 1.5。Project standards、scripts、context snapshot 和 standard skill compilation 必须先完全收口到 Project Service，否则 Desktop/surface/MCP 后续仍会被迫理解 project source 文件结构。
3. 同步做 Phase 1.6。Project Service 当前 `interpret + candidate` 约 1s，性能排查必须与收口同时推进，否则架构收口会放大延迟问题。
4. 接着做 Phase 1.7。内容画布和工作流画布如果 owner 不清楚，后续 canvas route 和 project source 收口会继续互相污染。
5. 第五优先级是 Desktop renderer contract。它是心智负担最大的入口，也是本地/云端 API 特殊化最明显的位置。
6. 第六优先级是 local-surface-host，因为它目前直接把 `/local-api` 固化进 surface 运行时。
7. surface domain 的 UI 和 runtime contract 可以跟着 host 改造逐步替换。
8. internal clients 最后清理，不要一开始动太多服务内部发现逻辑。

## 验收条件

这次收口的验收对象是 runtime/surface/project 的 public contract，不是内部服务是否改名。`services/local-surface-host`、workspace package、service-level discovery 可以作为 daemon 内部实现继续存在；只要它们不泄漏到 Desktop、Surface Host、surface domain、Plugin/MCP 的业务入口里，就不阻塞验收。

### 一票否决项

出现以下任一情况，本轮收口不能判定通过：

- Desktop renderer、Surface Host 或 surface domain 的业务调用仍然拼接 `/local-api`。
- Desktop renderer contract 仍暴露 `DataServiceBaseURL`、`ProjectServiceBaseURL`、`CanvasServiceBaseURL`、`AuthServiceBaseURL` 或同类内部服务 endpoint。
- Desktop/Surface Host/surface domain 因为 `local`、`cloud`、`external` data connection 选择不同业务 API path。
- 普通 runtime descriptor/status 返回内部服务 topology、service URL、pid、sqlite path、auth service URL，或业务代码读取 diagnostics 后决定业务调用分支。
- Desktop、Surface Host、surface domain、Plugin/MCP tools 直接读写 `project_standards.json`、`scripts/**` 或 provider skill output paths，而不是走 Project Service。
- `user_id`、`project_id`、`project_cwd` 由 Desktop/surface/Plugin/MCP 各自从 route params、local storage、env vars、cwd 推导并当作权威上下文。
- raw resource 在业务 contract 中同时以裸字符串、HTTP URL、`resourceId`、`resource_id`、`resourceUrl` 多种形态作为权威身份传递，且没有统一 normalize/resolve 边界。
- 内容画布和工作流画布继续共用模糊的 canvas CRUD contract，导致调用方需要靠 URL、route、service name 或 document shape 猜 owner。
- 内容画布不能创建时命名、不能重命名，或前端没有明确的新建按钮、重命名按钮和命名/重命名弹窗。
- Project Service 收口后没有真实 `~/.movscript` local daemon 性能基线和 trace，导致 `interpret + candidate` 约 1s 的问题不可解释。

### Contract 验收

必须同时满足：

- 本机 runtime owner 唯一为 `movscript.local-node` daemon；Desktop、Plugin、CLI 只 attach daemon，不各自启动或选择 Data/Auth/Project/Canvas 服务。
- public gateway canonical prefix 是 `/v1`。`/local-api` 只能存在于 daemon gateway 的 backward-compatible alias、兼容测试或 deprecation telemetry 中。
- `GET /v1/runtime/descriptor` 只表达 runtime owner、gateway、data connection summary、capabilities，不包含内部服务 URL 或 `local-surface-host` 服务名。
- `dataConnection.kind = "local" | "cloud" | "external"` 只用于状态展示、配置入口和诊断说明，不进入业务 API 分支。
- local data plane 使用 local-owner 身份，不启动默认本地 Auth Service；cloud/external data plane 的 Auth/Data Service 也只由 daemon 感知和适配。
- debug diagnostics 可以展示内部 service topology，但只能通过 debug-only diagnostics API 或 debug 页面访问，并且需要 redaction 和权限边界。

可观察证据：

- `rg "/local-api|ServiceBaseURL|Data Service|Project Service" desktop services/local-surface-host surface apps packages` 的剩余命中都在 whitelist 文件中。
- browser/surface bundle 的架构测试能阻止 Node runtime discovery、service-level discovery、diagnostics client 进入业务模块。
- local/cloud/external 三种 data connection 的 renderer 调用栈使用同一个 daemon gateway client。

### Context 验收

必须同时满足：

- `user_id`、`project_id`、`project_cwd` 等系统上下文由 daemon context envelope 统一产出。
- project/cwd 属于 workspace session scope，不是 daemon 全局单例；多窗口、多项目、Plugin/CLI attach 不互相覆盖。
- context envelope 带 `sessionId` 和 `revision`；写操作和长任务携带 revision，遇到 stale context 能返回明确错误或刷新指令。
- `projectCwd` 只在具备 local file access capability 的 session 中暴露；云端普通 web surface 不得到本机 cwd。
- Desktop 创建/切换项目时只请求 daemon 创建或更新 workspace session context；surface 和 Plugin/CLI 读取同一个 session context。

可观察证据：

- Desktop 创建/切换项目后，surface、Plugin、CLI 看到一致的 `principal.userId`、`project.id`、`workspace.projectCwd`、`sessionId`、`revision`。
- route params、local storage、env vars 可以作为 UI hint 或启动参数，但不能覆盖 daemon-issued context。

### Project Service 验收

必须同时满足：

- Project Service 是 project source、read model、resource view、context snapshot 和 source-derived artifacts 的唯一公开 owner。
- `project.json`、`project_standards.json`、`settings/**`、`scripts/**`、`content_units/**`、`productions/**` 的产品级读写都走 daemon gateway 下的 Project Service API。
- `project_standards.json -> .codex/.claude/.mova provider skill files` 的编译/同步由 Project Service command 触发、记录并返回 `standardSkillFiles` 或等价 diagnostics。
- scripts 的 metadata、`script.md`、script version、script blocks、diagnostics 都通过 Project Service 读写和投影。
- project resource view 覆盖 `project-standards`、`scripts`、`script-versions`，并与 source revision 对齐。
- 内容画布作为 project source/read-model 的一等视图和命令入口，由 Project Service 提供存储、列表、打开、编辑、保存、运行。
- 内容画布的 `title` / `name` 由 Project Service 持久化，支持创建时命名和后续重命名，并进入 list/open/save/run response。
- `domain_read_project_context_snapshot`、`domain_read_script_source`、`domain_query_entities`、project resources 等 MCP/domain 工具保留工具名也可以，但实现必须调用 Project Service client。

可观察证据：

- 更新 project standards 后，Project Service 返回 source revision、skill sync 结果和 diagnostics；后续 context snapshot/resource view 看到同一 revision。
- 更新 script source 后，Project Service 写入 `script.json` / `script.md`；后续 script source read、resource view、script version snapshot 看到同一 revision。
- 内容画布保存后，Project Service 返回新的 project/content canvas revision；后续 project read model、content canvas open、context snapshot 看到一致状态。
- 内容画布 rename 后，列表、打开页、标题栏、context/read-model 中的 title 一致，并返回新的 revision。
- 内容画布 run 后，Project Service 返回 operation id、trace/context revision、read-model/candidate impact summary。
- 静态检查中，Desktop、Surface Host、surface domain、Plugin/MCP tool 不直接 import workspace service 来读写 standards/scripts/provider skill files。

### Canvas Boundary 验收

必须同时满足：

- 内容画布和工作流画布在 public contract 中有明确 discriminator，例如 `canvasKind: "content" | "workflow"`，调用方不靠 URL、route、title、document shape 或服务名猜 owner。
- 内容画布的存储、列表、打开、编辑、保存、运行归 Project Service；public path 属于 daemon gateway `/v1/project/...` 族。
- 内容画布支持 create-with-name 和 rename；rename 必须携带 base revision，返回新 revision、normalized title 和 validation diagnostics。
- 工作流画布的存储、列表、打开、编辑、保存归 Canvas Service；public path 属于 daemon gateway `/v1/canvas/...` 族。
- 工作流画布可以引用 project entity、raw resource、editing asset、media job，但只能保存 typed refs，不能内嵌 Project Service/Data Service/Media endpoint，也不能直接写 project source。
- 内容画布运行必须进入 Project Service interpret/read-model/candidate pipeline，不能由 Canvas Service 或 surface 自己执行 project source mutation。
- list/open/edit/save 都有 revision 语义；edit/save 需要 base revision；stale revision 返回 conflict，不 silent overwrite。
- autosave 和 manual save 使用同一套持久化语义；失败时能恢复 dirty state、validation errors 和上一次成功 revision。
- 旧 `/v1/canvas/canvases/:id` 或 `/local-api/canvas/canvases/:id` 兼容入口如果保留，必须能返回 legacy kind/deprecation 信息，并迁移到明确的 content/workflow owner contract。

可观察证据：

- 内容画布 create/list/open/edit/save/reopen/run 的端到端测试全部通过，并验证 Project Service revision、read model、context snapshot 一致。
- 内容画布前端有新建按钮、重命名按钮、命名/重命名弹窗；测试覆盖输入空名称、重复名称、超长名称、取消、确认、保存失败、stale revision conflict。
- 工作流画布 create/list/open/edit/save/reopen 的端到端测试全部通过，并验证 nodes、edges、layout、metadata、typed refs 完整恢复。
- stale revision conflict、validation error recovery、autosave/manual save、delete/archive 或 equivalent lifecycle 行为有测试覆盖。
- 静态检查中，内容画布没有调用 Canvas Service document CRUD；工作流画布没有调用 Project Service source command 来保存 graph document。
- Desktop、Surface Host、surface domain 只通过 daemon gateway client 调用两类画布，不直接读取 Canvas Service 或 Project Service endpoint。

### Raw Resource 验收

必须同时满足：

- raw resource 的 public contract 使用统一的 typed reference，例如 `ResourceRef` / `RawResourceRef`，至少包含 `kind`、`resourceId`、可选 `projectId`/`scope`/`revision`；不能让调用方在字符串、数字、HTTP URL 之间自行猜测身份。
- HTTP URL 只能是 daemon/resource gateway resolve 后得到的读取结果，用于 `<img>`、`<video>`、download、blob cache 或短期预览；不能作为 raw resource 的持久身份写入 candidate、selection、timeline、shot library entry、project source 或 MCP/domain command。
- 如果需要文本中的人类可读引用，可以保留 `{{resource::123}}` 这类 semantic marker，但进入 API 边界前必须 normalize 成 `RawResourceRef`，不能让下游业务继续解析自由字符串。
- `resource_id`、`resourceId` 等 legacy 字段可以在 service 内部、DB schema 或兼容 API 中暂存，但 daemon gateway/public client 必须有一个规范输入输出形态，并在边界层完成兼容转换。
- 读取 raw resource file 必须走 daemon gateway 的 canonical resource API，例如 `/v1/resources/:resourceId/file` 或等价 resolve API；surface 不直接拼 `/api/v1/resources/:id/file`、`/local-api/...` 或远端 Data Service URL。
- media preview、generation input、editing asset、candidate output、selection、shot reference library、MCP raw-resource tools 都共享同一套 `ResourceRef -> resolved access` 工具函数或 daemon client。
- resolved access response 必须表达 access type，例如 authenticated gateway URL、blob URL、local file capability、external URL proxy，并带上必要的 ttl/cache/auth 语义；业务层不能从 URL 字符串形态推断本地/云端。

可观察证据：

- 静态检查中，业务模型和 command schema 不再把 `resourceUrl`、`url`、`/api/v1/resources/:id/file` 当作 raw resource 身份字段；这些字段只出现在 resolver、media rendering、download、debug 或 compatibility adapter 中。
- candidate/selection/timeline/shot library 的快照里保存的是 resource reference 或 resource id compatibility 字段，不保存 daemon/data-service 生成的 file URL 作为 source of truth。
- local/cloud/external data connection 下，同一个 `RawResourceRef` 通过同一个 daemon gateway resolver 得到可读媒体，不需要 surface 按 data connection 拼接不同 URL。
- MCP 工具如 `domain_register_raw_resource_as_content_unit_candidate` 的输入输出 schema 明确区分 `sourceResourceRef`/`outputResourceRef` 与 resolved media URL。

### 性能验收

必须同时满足：

- 使用真实 `~/.movscript` local daemon 产出基线，不只使用 fixture。至少记录 cold start、warm interpret、candidate command、warm `interpret + candidate`、read-model、resource view、context snapshot。
- 每个基线项至少记录 p50/p95、样本数、project id、project cwd、source file count、source hash、data plane、是否写 `.interpret`、是否触发 provider skill sync。
- Project Service performance trace 能把单次总耗时拆到 daemon gateway、Project Service handler、source scan/hash、domain index、interpret、read-model projection、candidate decision store、Data Service/sqlite、artifact write、JSON serialization 等 span。
- `interpret + candidate` 约 1s 时，trace 至少能解释 90% 以上 wall time 归属；不能出现大段 unexplained time。
- warm path 不应因为 Project Service 收口而明显退化。默认验收线：p50 不高于收口前基线，p95 退化不超过 10%。如果收口前 warm `interpret + candidate` p50 高于 800ms，第一轮优化应给出至少 30% p50 改善，或把无法改善的外部瓶颈记录为阻塞项和后续专门任务。
- `.interpret` debug artifact、provider skill compilation、全量 source scan、全量 domain index rebuild 不能在 source hash 未变化的 warm candidate path 中无条件发生。

可观察证据：

- 有一份真实 `~/.movscript` benchmark 记录或 CI artifact，包含优化前后对比。
- debug-only diagnostics 能查看 trace；普通 descriptor/status、业务 API response 不包含内部性能拓扑。

### 行为验收

必须覆盖以下端到端场景：

- Desktop 本地启动：daemon ready，descriptor 显示 `dataConnection.kind = "local"`，业务调用走 `/v1/...`。
- Desktop 云端连接：daemon ready，descriptor 显示 `dataConnection.kind = "cloud"`，renderer 调用方式与本地一致。
- Desktop 外部 Data Service：daemon ready，descriptor 显示 `dataConnection.kind = "external"`，renderer 调用方式与本地一致。
- Desktop 创建/切换项目：daemon 创建或更新 workspace session context，surface 收到同一 `sessionId` 和 context revision。
- Plugin/CLI attach 同一项目 session：读取到与 Desktop 一致的 principal、project、workspace context。
- 更新 project standards：Project Service 写入 source，编译/同步 provider skills，并返回 sync result/diagnostics。
- 读取 project context snapshot：结果来自 Project Service，包含 project standards、namespace vocabulary、hash、agent guidance。
- 更新 script source：Project Service 写入 source，后续 resource view 和 script source read 看到同一 revision。
- 创建 script version：Project Service 从 script markdown 生成 version、blocks 和 diagnostics。
- 内容画布：create/list/open/edit/save/reopen/run 全链路稳定，保存和运行后的 revision/read model/context snapshot 一致。
- 内容画布命名：新建按钮打开命名弹窗，确认后列表出现该名称；重命名按钮打开重命名弹窗，确认后列表、打开页、标题栏都更新，刷新后仍保持。
- 工作流画布：create/list/open/edit/save/reopen 全链路稳定，workflow graph、layout、typed refs 完整恢复。
- Canvas detail route：产品层不再拼接 `/local-api/canvas/canvases/:id`，而是通过 daemon gateway 的 canonical canvas API。
- 切换 data connection：daemon 负责重启/重配服务，Desktop 只刷新 descriptor/context，不改业务 client。

### 兼容层验收

`/local-api` 下线前允许保留 alias，但必须满足：

- alias 只存在于 daemon gateway compatibility layer。
- alias 命中有 deprecation log 或 telemetry。
- product caller 全部迁移到 `/v1/...` 后，只保留 compatibility tests。
- 文档和类型定义不再把 `/local-api` 描述为推荐入口。

## 一句话结论

当前代码已经有 `movscript.local-node` 作为唯一 daemon owner 的骨架，但 Desktop、local-surface-host 和 surface runtime 仍把 `/local-api`、内部服务 URL、project source 文件结构、canvas owner、raw resource URL/ID、以及 user/project/workspace 上下文当成各自可拼装的 contract。下一步不应该先大规模删除代码，而是先补 daemon descriptor/config/context API，并把 project standards、scripts、内容画布、context snapshot、standard skill compilation 完全收口到 Project Service；把工作流画布的 document CRUD 稳定收口到 Canvas Service；同时用真实 `~/.movscript` local daemon 排查 `interpret + candidate` 约 1s 的 Project Service 性能链路，再逐层把 Desktop 和 surface 的 contract 收到 daemon gateway 与 daemon-issued context envelope 上。本地/云端只作为 daemon 的 data connection 状态存在，不再成为 UI 层选择 API、拼装系统上下文、直接读写 project source、猜测 canvas owner、保存 raw resource URL 或绕过 Project Service 性能诊断的依据。
