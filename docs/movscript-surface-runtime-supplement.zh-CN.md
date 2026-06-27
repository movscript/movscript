# MovScript Surface Runtime 补充设计

## 背景

`movscript-agent-runtime-architecture.zh-CN.md` 已经定义了 MovScript 的总体方向：同一套核心能力，多种运行宿主。Desktop App、Agent Plugin App、Cloud App 不应该各自复制一套业务实现，而应通过 shared packages、service contracts 和可启动 Program 组合出不同运行形态。

本补充文档聚焦 Surface 层的产品和工程边界，回答下面几个问题：

- Project 创作页面到底归 Desktop、Agent Plugin，还是 Web Program 管理？
- `agent-surface` 是否应该改名为 `project-surface`？
- Project Surface 和 Admin Surface 如何同时存在而不混淆？
- 本机 Web Program 如果同时承载 Project 和 Admin，是否仍应叫 `project-surface-web`？
- Desktop、Local、Web 三类 Surface Host 如何漂亮且实用地复用同一套 Surface？

Project 模式从 Desktop 私有页面系统性收敛为 host-neutral `surface/project` 的专项重构设计，见 `project-surface-refactor.zh-CN.md`。该文档定义 Desktop 退出 Project 业务逻辑后的目标目录、runtime/gateway interface、迁移顺序和边界测试策略。

## 核心结论

MovScript Surface 应采用 **assembly-boundary first** 架构：

```text
apps/      # 应用组装：Desktop App、Agent Plugin App、Cloud App
services/  # 程序组装：可启动的 service/program，例如 local/web Surface Host
surface/   # 页面组装：Project/Admin 等共享 Surface Domain package
```

Surface 不是 Desktop 内部页面，也不是 Agent Plugin 临时返回的网站。Surface Domain 是共享 UI 和交互语义；Surface Host 负责把这些 domain 挂载成可访问、可嵌入、可获得 capability 的运行界面。

当前实现约束进一步收紧为：

```text
surface/*/src/features   # 页面业务与交互组件，不能以 desktop/local/web 命名
surface/*/src/pages      # Surface route page 组装，不能以 desktop/local/web 命名
surface/*/src/host       # 可选的 host adapter contract / browser host shared adapter
apps/*                   # 应用宿主实现，例如 Electron bridge、窗口、菜单、native capability
services/*               # 可启动宿主或 service program，例如 local-surface-host
```

`surface/*` 不应出现 `src/desktop`、`DesktopAdapter`、`hostKind: "desktop"` 这类实现分支。Surface 可以声明 capability、runtime、gateway、render slot 或 host adapter contract；Desktop、Local、Web 的差异由宿主在创建 runtime/gateway 时注入。

已落地的中性路径包括：

```text
surface/project/src/features
surface/resource/src/features
surface/resource/src/pages
surface/canvas/src/features
surface/canvas/src/pages
surface/editing/src/features
surface/editing/src/pages
surface/shot-library/src/features
surface/shot-library/src/pages
```

`services/local-surface-host` 现在从这些中性 Surface 路径编译 `canvas`、`editing`、`resource` 和 `admin` 页面；`apps/desktop` 也通过 alias 指向同一套 Surface Domain，而不是保留 Desktop 私有页面副本。

Surface Host 应分成三类：

```text
desktop-surface-host  # Desktop 内部宿主，负责窗口、WebView/native bridge、project focus
local-surface-host    # 本机 HTTP/WebView 宿主，供 Plugin fallback、本地浏览器、headless local 使用
web-surface-host      # 云端/浏览器宿主，供远程访问、协作和 cloud profile 使用
```

Desktop App 的职责是窗口宿主、项目 focus 管理者、`desktop-surface-host` owner 和增强 capability provider。本机 full runtime owner 是 per-user `movscript.local-node` daemon；Desktop 只负责 ensure/attach 这个 daemon。Surface 页面本身应归 shared Surface Domain packages。

Admin 不应再拥有第四种独立 Surface Host，也不再保留独立 `admin-web` service wrapper。Admin 是 `surface/admin` 页面域，可以被 Desktop 内部宿主、`services/local-surface-host` 或 `services/web-surface-host` 挂载。

## 命名修正：Agent Surface 应演进为 Project Surface

历史上 `agent-surface` 这个名字是合理的，因为它最早承接的是 Agent 返回给用户的 browser handoff 页面。但随着设计推进，这组页面的本质已经变成：

```text
项目创作、审阅、协作和交付的 Surface。
```

Agent 只是打开这些页面的一种入口，不是页面的主语。

因此长期命名应从：

```text
surface/project
```

演进为：

```text
surface/project
```

`agent` 一词应保留在 handoff / trigger / provider 层，例如 Agent 触发打开某个 Project Surface，而不是 Agent 拥有这个 Surface。

但可启动 Web Program 不应命名为 `project-surface-web`。原因是本机 Web Program 不只承载 Project Surface，还可能承载 Admin Surface。更准确的命名是：

```text
services/local-surface-host
movscript.local-surface.host
```

也可以在更短的产品/工程语境中简称为 `local-host`，但正式 service name 建议带上 `surface`，避免和网络语义里的 `localhost` 混淆。

因此新的命名分工是：

```text
surface/project              # 项目创作页面域 package
surface/admin                # 管理控制页面域 package
apps/desktop                 # 内含 desktop-surface-host，不单独作为 service 分发
services/local-surface-host  # 本机 Surface Web 宿主，可挂载 /studio/* 和 /admin/*
services/web-surface-host    # 云端/浏览器 Surface Web 宿主，可与 local host 复用实现
```

## Project Surface 与 Admin Surface 分域

MovScript 至少存在两类 Surface，它们可以共享运行时机制，但产品域必须分开。

### Project Surface

Project Surface 面向创作者、导演、项目用户。它的主语是：

```text
这部片现在发生了什么？我下一步怎么创作？
```

它关心项目进展、候选选择、生成任务、prompt 修改、stale impact、粗剪和成片候选。

典型页面：

```text
/studio/:projectId/progress       进展墙
/studio/:projectId/dailies        审片台
/studio/:projectId/live-room      生成现场
/studio/:projectId/edit-desk      创作桌
/studio/:projectId/impact         影响决策
/studio/:projectId/timeline       剪辑台
/studio/:projectId/resources      资源与引用
/studio/:projectId/settings       项目设置
```

### Admin Surface

Admin Surface 面向系统管理、agent 管理、运维、开发者和高级权限用户。它的主语是：

```text
MovScript 系统现在如何运转？哪里需要人工介入？
```

它关心 agent 队列、job trace、provider 健康、用户组织、审计、成本、失败恢复和管理后台 BFF。

典型页面：

```text
/admin/overview                   系统总览
/admin/agents                     Agent 状态
/admin/jobs                       任务队列
/admin/jobs/:jobId                Job Trace
/admin/providers                  Provider 健康
/admin/users                      用户管理
/admin/orgs                       组织管理
/admin/audit                      审计日志
/admin/costs                      成本与配额
/admin/incidents                  人工介入
```

Project Surface 是电影项目的创作现场；Admin Surface 是 agent 系统和平台运行的控制面。

## Surface Runtime 统一，Surface Domain 分开

Project Surface 和 Admin Surface 不应该揉成一个信息架构，但它们可以共享底层 runtime 能力：

- route resolution
- auth/session
- capability gating
- data loader contract
- action dispatch
- realtime update
- deep link
- host-injected capability contract
- host-owned URL resolver

也就是说：

```text
统一的是 Surface Runtime。
分开的是真实业务域和信息架构。
```

Project Surface 通过 Project/Editing/Data Service 聚合项目状态。Admin Surface 通过 Auth/Data/job/provider APIs 和必要的管理 BFF 聚合系统状态。两者不共享业务 read model，也不互相调用 UI 私有状态。

## Desktop、Plugin、Cloud 的宿主关系

### Desktop App

Desktop 是本机可视化工作台、窗口宿主和增强 capability provider；本机 full runtime 的默认 owner 是 per-user `movscript.local-node` daemon。

Desktop 应负责：

- 解析 MovScript Home。
- ensure/attach 本机 `movscript.local-node` daemon。
- 管理项目 focus。
- 管理窗口、tab、多项目、多 Surface 打开状态。
- 拥有 `desktop-surface-host`，在 Desktop 内部打开 Project/Admin Surface。
- 必要时连接 `local-surface-host` 或 `web-surface-host`。
- 在高级权限下通过 `desktop-surface-host` 打开本机 Admin Surface。
- 提供 desktop bridge、本地资源能力、文件拖拽、通知、导入导出等增强能力。

Desktop 不应该复制 Project Surface 的页面源码，也不应该直接拥有 Project/Editing/Data 业务规则。

### Agent Plugin App

Agent Plugin App 是 Agent/provider 接入壳。它启动 session-scoped MCP host，并 ensure/attach 同一个 `movscript.local-node` daemon。

Plugin 不接管一组独立 headless runtime。`plugin-full-local` 表示“通过插件入口确保本机 daemon 可用，并让 MCP 会话连接 daemon-owned runtime”。多个 Agent 会话必须复用同一个 daemon。

daemon 的 local data plane 可以启动：

```text
movscript.local-node.control
movscript.data.service
movscript.canvas.service
movscript.project.service
movscript.editing.service
movscript.media.pipeline
movscript.local-surface.host
Admin Surface 由 local-surface-host 挂载
```

daemon 的 cloud/external data plane 不启动本地 `movscript.data.service`，但仍启动 Project/Editing/Canvas/Media/Local Surface，并把它们连接到云端或外部 Data Service。

Canvas Service 的后端边界按“存储外置、运行本地”处理：Canvas 编排、节点运行历史和 palette/node catalog 已由 Canvas Surface 本地承接；Canvas Service 正式声明 Canvas 文档存储 API 和 runtime adapter，其中存储可在过渡期继续借用 Data Service 的 canvas storage compatibility route，runtime/model/media/resource 调用由 Canvas Service adapter 承接，不能再代理 Data Service 的 Canvas runtime route，也不让 Canvas Surface 直接越过 Canvas Service 执行 runtime。具体盘点见 `docs/canvas-service-backend-boundary.zh-CN.md`。

Plugin、Desktop、CLI 不应混合拥有服务。不存在 Desktop 启动 Project Service、Plugin 再补一个 Editing Service 的局部拼接模式，也不存在每个 Agent 会话各自启动一套 full local 的模式。

### Cloud Deployment

Cloud App 是 deployment/ops 容器，不内嵌启动这些服务源码。

云端需要 Project Surface、Admin Surface 或核心服务时，应由 Kubernetes、Docker Compose、systemd、CI deploy job 或等价平台启动独立 service instance。

Cloud 形态可以部署：

```text
movscript.data.service
movscript.canvas.service
movscript.project.service
movscript.editing.service
movscript.media.pipeline
movscript.web-surface.host
Admin Surface 由 web-surface-host 挂载
movscript.mcp.host
```

Cloud App 不应变成云端大单体 runtime。

`desktop-surface-host`、`local-surface-host` 和 `web-surface-host` 可以共享同一套 Surface Domain 实现；区别在于 profile、endpoint、auth/session、Desktop bridge、本地文件能力、窗口能力和部署所有权。Surface Domain 不能通过 `hostKind` 或 Desktop/Plugin/Web 分支感知这些差异，差异必须由宿主创建 runtime/gateway 时注入。不要因为 UI 实现可复用，就把三种宿主命名成同一个 runtime service。

## Surface Descriptor：Agent 返回 Intent，而不是拥有页面

Agent/MCP tool result 不应该被理解成“Agent 返回一个网站”。更准确的是：

```text
Agent 返回 Surface Descriptor。
Host 决定如何打开。
```

建议 descriptor 结构：

```ts
type SurfaceDescriptor = {
  scope: "project" | "admin"
  surface: string
  projectId?: string
  params: Record<string, string>
  reason?: string
  source?: "agent" | "desktop" | "web" | "admin"
}
```

示例：

```json
{
  "scope": "project",
  "surface": "dailies",
  "projectId": "chang-an-rain-night",
  "params": {
    "contentUnitId": "04_chase_video"
  },
  "reason": "需要用户审片并选择稳定候选",
  "source": "agent"
}
```

不同 host 解析方式不同：

- Desktop 可用：通过 `desktop-surface-host` 打开 Desktop 内部 tab 或 WebView route。
- Local daemon：返回本地 `local-surface-host` URL。
- Cloud/Web：返回 `web-surface-host` URL。
- Admin scope：在当前 host 中挂载 `surface/admin` route，并走管理权限或 BFF 能力。

## 推荐路由

### Project Surface 新路由

新产品路由建议使用 `/studio`，因为它比 `/agent` 更贴近页面心智：

```text
/studio/:projectId/progress
/studio/:projectId/dailies
/studio/:projectId/live-room
/studio/:projectId/edit-desk
/studio/:projectId/impact
/studio/:projectId/timeline
/studio/:projectId/resources
/studio/:projectId/settings
```

旧 `/agent/*` route 可以保留为兼容入口或 handoff route，但新页面和新文档应逐步转向 `/studio/*`。

### Admin Surface 路由

Admin 继续使用 `/admin`：

```text
/admin/overview
/admin/agents
/admin/jobs
/admin/jobs/:jobId
/admin/providers
/admin/users
/admin/orgs
/admin/audit
/admin/costs
/admin/incidents
```

## 数据边界

Project Surface 不直接拼 workspace source、candidate decision、timeline、job 数据。

它应通过：

```text
Project Service
Editing Service
Data Service
Media Pipeline
```

获得统一 read model、candidate/selection 状态、stale impact、preview timeline 和 render/export 状态。

Admin Surface 不直接把 management token 放进浏览器，也不直接绕过 Auth/Data Service。它应通过：

```text
Auth Service
Data Service
Job/Provider APIs
```

完成用户、组织、队列、provider、审计、成本等管理能力。

## 与当前 HTML 原型的关系

当前 `docs/surface-*.html` 原型定义的是未来 Project Surface 的产品形态，而不是 Agent Plugin 专属页面。

对应关系：

```text
surface-atlas.html            -> /studio/:projectId/progress
surface-dailies.html          -> /studio/:projectId/dailies
surface-live-room.html        -> /studio/:projectId/live-room
surface-edit-desk.html        -> /studio/:projectId/edit-desk
surface-continuity-room.html  -> /studio/:projectId/impact
surface-timeline.html         -> /studio/:projectId/timeline
```

这些页面后续应迁入 `surface/project` 的真实 route/component，而不是停留在 Desktop 私有 UI 或 Agent Plugin 私有页面。

## 迁移建议

### 第一阶段：文档和语义改名

- 在架构文档中将 `Agent Surface` 标注为历史命名。
- 新增目标名 `Project Surface`。
- 新文档、新 issue、新设计稿优先使用 `Project Surface`。
- 保留 `/agent/*` 作为既有 handoff 兼容语义。

### 第二阶段：包级 alias

- 新增 `@movscript/project-surface`。
- 初期可以 re-export `@movscript/project-surface`。
- Desktop 和新代码优先 import `@movscript/project-surface`。
- 旧 import 逐步迁移。

### 第三阶段：Surface Host 分层迁移

- 在 `apps/desktop` 内明确 `desktop-surface-host` 作为 Desktop 内部宿主层。
- 新增 `services/local-surface-host`，并删除旧的 `services/local-surface-host`。
- 新增 `services/web-surface-host`，用于 cloud/browser profile。
- service name 使用 `movscript.local-surface.host`；旧的 `movscript.local-surface.host` 不再作为可启动 Program。
- MovScript Home runtime records 支持新 service name。
- 旧 service name 可短期作为 alias，但不应继续扩展能力。
- `surface/project` 只表达项目页面域，不作为可启动 service name。

### 第四阶段：路由迁移

- 新增 `/studio/:projectId/*` routes。
- `/agent/*` 继续作为 handoff redirect 或 legacy route。
- Desktop Project Mode 默认进入 `/studio/:projectId/progress`。
- Agent tool result 返回 Surface Descriptor，由 host resolver 打开正确 route。

### 第五阶段：Admin Surface 分域强化

- Admin 不拥有独立 Surface Host。
- Admin 进入 `surface/admin`，与 `surface/project` 平级。
- Desktop、local host、web host 都可以按权限挂载 Admin routes。
- 不再保留 `services/admin-web`；Admin 的页面源码、Vite 构建和静态 dist 都由 `surface/admin` 负责。
- Admin 不进入 `surface/project` 包。
- Agent 管理后台、job trace、provider 健康、用户组织和审计能力都归 Admin Surface。

## 最终目标

最终 MovScript 应形成下面的清晰结构：

```text
apps/desktop
  Desktop shell
  attaches movscript.local-node daemon
  owns desktop-surface-host

apps/plugin
  Agent/provider access shell
  starts session mcp-host
  ships movscript daemon CLI
  ensures/attaches movscript.local-node daemon

apps/cloud
  deployment/ops container
  does not embed service implementations

surface/project
  shared Project Surface UI
  Studio routes/components
  surface descriptor contract
  host-neutral runtime contracts

surface/admin
  shared Admin Surface UI
  Admin route components
  management UI contracts

services/local-surface-host
  movscript.local-surface.host
  /studio/* local Web host
  optional /admin/* local Web host
  browser handoff support

services/web-surface-host
  movscript.web-surface.host
  /studio/* cloud/browser Web host
  optional /admin/* cloud/browser Web host
  remote collaboration support
```

一句话总结：

```text
Project Surface 是项目创作现场。
Admin Surface 是系统控制面。
Desktop 是本机最佳宿主。
Plugin 是 Agent 接入壳和 fallback headless runtime。
Cloud 是部署形态。
Surface 是宿主无感的 Domain Package；Surface Host 才是可启动 Program。
```
