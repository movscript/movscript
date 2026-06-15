# MovScript 前端工程质量审查与重构方案

## 范围与结论

本文档基于当前工作树审查 `apps/frontend`、`packages/ui`、`packages/tokens` 以及前端直接依赖的 `packages/core/src/content` 运行时。审查重点是用户反馈中高频出问题的四类场景：

- UI 改动
- 逻辑调整
- 数据共享展示
- 数据更新

结论：当前前端不是单纯“代码多”，而是多个关键边界同时失守。路由 shell、业务页面、数据源适配、运行时状态、持久化状态、全局事件、查询缓存和样式覆盖经常在同一组件或同一层里混合，导致一次小改动会穿透多个所有权边界。短期继续补丁式修复会提高回归概率；需要用“壳层拆分、数据源收敛、事件总线替换、查询键治理、样式契约执行”的方式重构。

`packages/ui` 需要单独重构。它当前约 82k 行，包含大量 business 页面级组件、全量样式入口和过宽 barrel 导出，已经不只是 primitive/layout 包。详细审查和迁移方案见 `docs/package-ui-refactor.zh-CN.md`。

## 当前证据

### 规模与集中度

前端生产代码约 105k 行。最大文件集中在核心交互路径：

| 文件 | 行数 | 风险 |
| --- | ---: | --- |
| `apps/frontend/src/features/agent/components/AIAgentSettingsPage.tsx` | 4440 | 设置页包含大量查询、复制、表单与展示逻辑 |
| `apps/frontend/src/features/content-workbench/components/ContentSourceWorkspacePage.css` | 3499 | 单页 CSS 承载大量组件外观和状态样式 |
| `apps/frontend/src/features/content-workbench/components/ContentSourceWorkspacePage.tsx` | 3247 | 运行时、选中态、编辑、候选、展示同文件 |
| `apps/frontend/src/features/resources/components/ResourcesPage.tsx` | 2538 | 资源列表、外部搜索、上传、分享、绑定逻辑集中 |
| `apps/frontend/src/features/agent/components/AgentChatDataSourceShell.tsx` | 2329 | 数据源、线程缓存、全局事件、运行时 reducer、UI 状态混合 |
| `apps/frontend/src/features/shot-library/components/ShotLibraryPage.tsx` | 2275 | 查询、导入、分析、布局、详情展示集中 |
| `apps/frontend/src/features/canvas/components/CanvasEditorPage.tsx` | 1747 | 编辑器文档、快捷键、保存、诊断、路由上下文混合 |
| `apps/frontend/src/App.tsx` | 1305 | 应用入口承担路由、布局、项目创建、后端启动、全局事件 |

### 数据源与副作用分散

当前前端中可检索到：

- `queryKey: [...]` 约 151 处。
- `invalidateQueries` / `setQueriesData` / `setQueryData` 约 66 处。
- `window.addEventListener` / `window.dispatchEvent` / `localStorage` / `sessionStorage` 约 104 处。

这些数字本身不是问题，问题是它们缺少统一所有权。例如：

- `queryClient` 只有全局默认 `staleTime: 10_000, retry: 1`，没有 query key 工厂、资源域失效策略或 mutation contract（`apps/frontend/src/shared/infrastructure/queryClient.ts:3`）。
- 资源、画布、脚本、语义实体、Agent 线程等 query key 在各组件内手写，存在同一实体多个 key 前缀的情况，例如 `resources`、`resources, agent-panel`、`canvas-resource-shelf, resources`、`resource-bindings`。
- 候选变更需要手写长失效清单，`invalidateAssetCandidateConsumers` 一次失效 18 个 query key（`apps/frontend/src/shared/infrastructure/assetCandidateQueryInvalidation.ts:5`）。
- `providerSessionThreadQueryCache` 直接按 predicate 更新所有 `provider-session-threads` 查询（`apps/frontend/src/features/agent/application/providerSessionThreadQueryCache.ts:208`），这和其他地方的 invalidate 策略并行存在。

## 工程质量问题清单

### 1. App shell 职责过载

`App.tsx` 同时负责：

- 路由 lazy import 与 route element 编排（`App.tsx:65` 到 `App.tsx:103`）。
- 后端启动状态监听、重试和 Electron API 调用（`App.tsx:155` 到 `App.tsx:215`）。
- 项目创建 mutation 与跳转（`App.tsx:349` 到 `App.tsx:381`）。
- 全局 redirect 与 workspace handoff 事件监听（`App.tsx:1148` 到 `App.tsx:1165`）。
- 复杂 pane layout 与 route layout spec 绑定。

影响：

- UI 壳层改动很容易影响认证、项目选择、后端启动或 Agent dock。
- 逻辑调整无法只在 feature 内验证，必须担心根路由副作用。
- 路由、布局和全局事件没有可替换的测试夹具。

### 2. Agent Chat shell 混合数据源适配、运行时状态和 UI 交互

`AgentChatDataSourceShell.tsx` 维护：

- 模块级缓存 `persistentPendingServerRequests`、`sourceThreadListCache`（`AgentChatDataSourceShell.tsx:104`）。
- 本地 loading/sending/error/history/thread list/visible window/draft conversation 状态（`AgentChatDataSourceShell.tsx:348` 到 `AgentChatDataSourceShell.tsx:363`）。
- React Query 资源查询（`AgentChatDataSourceShell.tsx:370`）。
- 多个全局事件监听：打开线程、面板线程、决策请求、新会话、workspace task、Escape stop（`AgentChatDataSourceShell.tsx:743`、`:773`、`:978`、`:1035`、`:1056`、`:1593`）。
- server request subscription 与 AbortController（`AgentChatDataSourceShell.tsx:996`）。
- window event 广播当前线程（`AgentChatDataSourceShell.tsx:2295`）。

影响：

- 同一个业务事件同时可能经过 data source subscription、window event、Zustand store 和 module cache。
- “打开线程”“新会话”“决策请求”这类逻辑无法单测完整状态机，只能测试局部 helper。
- 多实例 shell 依赖 `sourceId` 规避自触发，容易出现重复消费、漏消费、历史缓存污染。

### 3. 状态源过多且边界不清

Agent 状态至少分散在：

- `useAgentStore`：设置、审计、导入备份、工具过滤等，持久化为 `agent-store-v4`（`agentStore.ts:150`）。
- `useAgentSessionStore`：活动会话、conversation registry、workspace、page task、thread binding、runtime states，同时保留 deprecated provider session state（`agentSessionStore.ts:143` 到 `agentSessionStore.ts:191`）。
- `useAgentContentAreaStore`：conversation 到 browser/content tab 的持久化映射（`agentContentAreaStore.ts:74` 到 `agentContentAreaStore.ts:89`）。
- React Query：服务端会话、线程、模型、资源、运行状态。
- 模块级 Map：Agent chat pending request 与 thread list。
- `localStorage`/`sessionStorage`：布局、debug、语言、app server URL、settings return path 等。

影响：

- 同一个概念会有多个名字和生命周期：conversation、thread、session、provider session tree、active tab。
- store 内含 deprecated API，迁移状态不明确（`agentSessionStore.ts:150` 到 `agentSessionStore.ts:188`）。
- “数据共享展示”容易出现 A 面板已更新、B 面板仍旧、刷新后又变回来的问题。

### 4. 内容工作台单文件承载过多职责

`ContentSourceWorkspacePage.tsx` 同时承担：

- 创建 runtime port 与 runtime 实例。
- project/user/org owner context。
- 本地 panel 宽度持久化。
- workspace 数据加载、demo fallback、debug window 写入。
- 生产树、选中 moment/shot/node、候选选择、asset 选择、prompt 编辑。
- 大量 JSX 展示和 1000 行以上纯 helper 文案/映射。

关键证据：

- 直接读写 localStorage 保存 pane 宽度（`ContentSourceWorkspacePage.tsx:150` 到 `:165`）。
- 运行时订阅直接进入组件 state（`ContentSourceWorkspacePage.tsx:256`）。
- workspace 数据变化时重置本地选中态（`ContentSourceWorkspacePage.tsx:294` 到 `:296`）。
- 候选选择同时改本地 selection state、切 mode、调用 runtime（`ContentSourceWorkspacePage.tsx:337` 到 `:365`）。
- 文件末尾仍包含大量 label、copy、节点解析 helper（`ContentSourceWorkspacePage.tsx:3000` 到 `:3247`）。

影响：

- UI 小改动必须理解业务数据模型。
- 数据更新失败时组件和 runtime 的状态同步很难判断。
- 选中态由 workspaceData 推导又被本地 state 覆盖，容易在 reload 或 optimistic update 后跳选中。

### 5. 内容工作台更新策略缺少事务语义

`packages/core/src/content/sourceWorkspaceRuntime.ts` 的多个操作先更新内存，再写 port：

- `selectCandidate` 先 `setData`，再 `selectContentUnitCandidate`（`sourceWorkspaceRuntime.ts:228` 到 `:240`）。
- `updateEditPrompt` 先更新内存 prompt，再写文件/API（`sourceWorkspaceRuntime.ts:263` 到 `:278`）。
- `updateExpressionUnit`、`updateAudioCue`、`updateTransition`、`updateStoryboardTimeline`、`createHierarchyNode` 同样先乐观写内存再调用 port（`sourceWorkspaceRuntime.ts:280` 到 `:380`）。

失败时只 `captureError`，没有统一 rollback、reload 或 mutation result reconciliation。

影响：

- 写入失败后 UI 可能展示已修改数据，但真实 workspace 未更新。
- 再次加载、切项目、同步后用户看到状态回退，却缺少明确冲突提示。
- 多个字段连续保存时，dirty/error/synced 无法表达哪个操作失败。

### 6. 查询键和失效策略没有领域所有权

同一类数据散落在多个 query key：

- 资源：`['resources']`、`['resources', 'agent-panel']`、`['canvas-resource-shelf', 'resources']`、`['resource-folders', 'mine']`、`['resource-bindings', ...]`。
- Agent 线程：`['provider-session-threads', baseURL, identity, surface]`、`['provider-session-panel-thread-history', baseURL]`、`['agent-console-threads', 'provider-sessions']`。
- 内容/语义实体：`semantic-*`、`work-targets`、`workbench`、`project-workspace`。

影响：

- mutation 作者必须知道所有消费者。
- 新增展示面默认不会被老 mutation 刷新。
- invalidate 过宽时会造成额外请求和闪烁；过窄时出现陈旧展示。

### 7. UI 包、应用全局 CSS、页面 CSS 边界模糊

已有 `@movscript/theme/theme.css` 和 `@movscript/ui/styles.css`，但：

- `apps/frontend/src/index.css` 除 reset 外还承载 `shot-library-page` 等具体业务页样式（`index.css:34` 起）。
- 内容工作台页面 CSS 单文件 3499 行，定义大量状态色、布局、卡片、树、预览、inspector 样式。
- `ContentSourceWorkspacePage.css` 内直接混用 `--ms-*`、`--cw-*`、硬编码 HSL、`color-mix`、页面级 BEM class（例如 `ContentSourceWorkspacePage.css:98` 到 `:102`、`:373` 到 `:390`、`:3301` 到 `:3330`）。
- `packages/ui` 自身也有大量 business component 样式，最大聚合出口 `packages/ui/src/components/business/index.ts` 2619 行，UI 包越来越像另一个应用层。

影响：

- UI 改动经常需要在 app CSS、feature CSS、UI package CSS 三处找覆盖来源。
- 页面级 class 和 UI 包 business class 没有稳定 API 边界。
- 视觉状态 token 不统一，状态色和密度在不同页面表现不一致。

### 8. 全局事件作为跨组件通信主路径

当前有多处 `window.dispatchEvent` / `window.addEventListener`：

- Axios response interceptor 触发 `api:redirect`（`shared/infrastructure/api.ts:66` 到 `:70`），`App.tsx` 再监听跳转。
- Agent panel bridge 通过 `AGENT_PANEL_*` CustomEvent 通信。
- Agent chat shell 监听多种 window event 并从 consume queue 取 payload。
- Timeline local event、workspace handoff、overlay dismiss、资源页 click/keydown 等也走 window。

影响：

- 事件顺序、payload 消费、重复监听和 cleanup 很难全局推理。
- 事件不是类型安全边界，无法通过编译器追踪生产者/消费者。
- 多窗口/Electron/测试 harness 下行为更难稳定。

### 9. Electron API 直接进入页面和组件

页面/组件直接调用 `window.api` 的例子很多：

- App 后端状态与设置写入（`App.tsx:173`、`:203`）。
- 内容工作台 runtime port 直接从 `Window['api']` 取 MovScript engine API（`contentSourceWorkspaceData.ts:50` 到 `:130`）。
- Agent browser、workspace files、workspace review、terminal 等直接读写 Electron API。

影响：

- 浏览器模式、Electron 模式、e2e harness 需要各自 mock 同一批 API。
- 领域操作缺少统一错误模型和可观测日志。
- 组件测试不得不绕过 Electron API，覆盖容易变成字符串 contract。

### 10. 测试多但偏“边界字符串合同”，缺少端到端状态一致性门禁

前端已有大量 test 文件，边界意识是存在的，例如 `agentChatProtocolBoundary.test.ts` 会检查 core 层不依赖 React/window/localStorage。但当前高风险问题主要是运行时一致性：

- mutation 成功/失败后的多视图一致。
- Agent 多 shell/多 surface 事件消费。
- 内容工作台连续更新、失败恢复、reload reconciliation。
- UI CSS cascade 改动后跨页面回归。

这些场景不是简单的 source regex 能证明的。

## 高频问题清单

### A. UI 改动频繁出问题

1. 页面 CSS 和全局 CSS 混用，修改某个页面样式可能影响同 class 约定或 UI package business style。
2. 组件缺少稳定 slots/props/CSS variables，调用方倾向于覆盖内部 DOM class。
3. 大型页面内 JSX、文案 helper、布局 helper、样式状态同文件，局部视觉调整会触碰业务逻辑。
4. 路由 shell 的 pane ownership 不够隔离，详情模式、Agent 模式、Canvas 模式共享 App shell 状态。
5. 响应式规则分散在页面 CSS 和 UI package CSS，无法快速确认某个断点的真实来源。

### B. 逻辑调整频繁出问题

1. 业务状态机没有集中 owner，逻辑散在 component state、Zustand、React Query、module Map、window event。
2. Agent 会话概念过多，conversation/thread/session/run/page task/runtime state 的映射缺少单一选择器层。
3. deprecated store API 仍保留，新增逻辑容易接入旧字段。
4. App 根组件承担全局逻辑，导致 feature 逻辑调整牵连启动、路由、布局和全局监听。
5. Electron API 直接进入 UI 层，导致逻辑无法在纯 domain/application 层稳定测试。

### C. 数据共享展示频繁出问题

1. 同一实体多个 query key，消费者新增后默认不会被相关 mutation 刷新。
2. `setQueriesData`、`invalidateQueries`、Zustand 持久化状态、module cache 并存，无法确定哪个是最新展示源。
3. Agent 多面板通过 window event 同步 active thread，存在多实例和消费顺序问题。
4. 内容工作台本地选中态依赖 workspaceData 初始化，又在数据变化时整体 reset，容易造成展示跳变。
5. 资源、候选、语义实体、项目 overview 之间的派生数据没有统一 materialized projection。

### D. 数据更新频繁出问题

1. 乐观更新没有统一 rollback/reload 策略，失败后 UI 和真实数据可能不一致。
2. mutation 之后手写失效清单，容易漏掉新消费者。
3. 过宽 invalidate 导致多个面板闪烁、重复请求和中间态覆盖。
4. Electron 写文件/API 操作缺少统一事务结果，如 `appliedRevision`、`snapshotVersion`、`changedPaths`。
5. 连续更新没有队列/去重/版本检查，后返回的旧请求可能覆盖先返回的新状态。

## 重构目标

### 目标架构

前端每个 feature 按以下层级收敛：

```text
route/shell
  只做路由、布局装配、权限和错误边界

feature application
  负责 use case、mutation、query key、事件转命令、Electron/API adapter 注入

feature domain
  负责纯函数、状态机、projection、选择器、patch/reducer

feature components
  只接收 view model 与 command props，不直接知道全局事件和后端细节

shared infrastructure
  统一 axios、Electron API、provider session client、query client、event bridge

packages/ui / packages/tokens
  只提供稳定 primitive/layout/business 组件契约和 token
```

### 重构原则

1. 一个业务事实只能有一个 source of truth。
2. 一个 mutation 必须声明影响的领域事件，而不是手写所有 query key。
3. UI 组件不直接订阅 window event，不直接读写 Electron API。
4. 页面 CSS 不覆盖 UI package 内部结构；跨层定制走 props、slots、data attributes、CSS variables。
5. 大页面先抽状态机和 selector，再拆 JSX；避免只按视觉区域机械拆组件。
6. 每一阶段都要新增防回流测试或脚本，不接受“口头约定”。

## 分阶段重构方案

### 第 0 阶段：建立门禁和可见度

产出：

- 新增前端质量 dashboard 脚本，输出：
  - 最大 TS/TSX/CSS 文件排行。
  - 组件内 `window.api`、`window.addEventListener`、`localStorage`、裸 `queryKey` 数量。
  - `invalidateQueries` 目标排行。
- 新增 CI 阈值：
  - 新增或修改的生产 TSX 文件超过 800 行必须拆分或豁免。
  - feature component 中新增 `window.api`、`window.dispatchEvent`、裸 `localStorage` 默认失败。
  - 新增 query key 必须来自 query key factory。

优先治理文件：

- `App.tsx`
- `AgentChatDataSourceShell.tsx`
- `ContentSourceWorkspacePage.tsx`
- `ContentSourceWorkspacePage.css`
- `ResourcesPage.tsx`
- `AIAgentSettingsPage.tsx`

### 第 1 阶段：App shell 拆分

拆分目标：

- `AppProviders`：QueryClientProvider、stores hydration、i18n、runtime bridge。
- `AppRouterConfig`：lazy routes 和 route element 表。
- `AppLayoutShell`：根据 route layout spec 装配 pane。
- `BackendBootBoundary`：后端状态、retry、Electron/local probe。
- `GlobalNavigationEffects`：redirect、workspace handoff，但输入改为 typed event bus。
- `ProjectRequiredFlow`：项目创建与选择。

验收：

- `App.tsx` 降到 250 行以内，只做组合。
- 后端启动、项目创建、redirect listener 都有独立测试。
- route layout spec 不再需要从 App 读写具体 pane storage。

### 第 2 阶段：统一前端事件总线

替换策略：

- 建立 `shared/application/eventBus.ts`，提供 typed topic、subscribe、publish、once/replay queue。
- `AGENT_PANEL_*`、`api:redirect`、workspace handoff、timeline local event 先迁入 event bus。
- window event 只保留在最外层 adapter，用于跨窗口或第三方事件；feature 内部禁用直接 window event。

验收：

- Agent chat shell 不再直接 `window.addEventListener(AGENT_PANEL_*)`。
- 所有 event payload 有类型、生产者和消费者索引。
- 多实例 Agent shell 通过 scoped subscription，而不是 `sourceId` 自过滤。

### 第 3 阶段：React Query key 与 mutation 失效治理

新增 query key factory：

```ts
export const resourceKeys = {
  all: ['resources'] as const,
  list: (input: ResourceListInput) => [...resourceKeys.all, 'list', normalize(input)] as const,
  panel: (input: ResourcePanelInput) => [...resourceKeys.all, 'panel', normalize(input)] as const,
  bindings: (projectId: number) => [...resourceKeys.all, 'bindings', projectId] as const,
}
```

新增领域事件到 query invalidation 映射：

```text
ResourceCreated -> resourceKeys.all
AssetCandidateSelected -> contentCandidateKeys.byProject(projectId), projectOverviewKeys.detail(projectId)
ProviderThreadUpdated -> providerThreadKeys.byProvider(...)
WorkspaceFileChanged -> workspaceReviewKeys.byPath(...), contentWorkspaceKeys.snapshot(projectId)
```

替换目标：

- 删除 `invalidateAssetCandidateConsumers` 这种散列表式失效，改为领域事件映射。
- 禁止组件直接手写 query key。
- mutation hook 返回标准结果：`{ event, changedIds, changedPaths, snapshotVersion }`。

验收：

- 新增 query key 只能从 `*Keys` factory 导出。
- mutation 测试验证“触发领域事件 -> 命中正确 query key”。
- 资源、候选、Agent 线程三个高频域先完成迁移。

### 第 4 阶段：Agent 状态模型收敛

目标：

- 建立 `AgentConversationRuntimeModel`，统一 conversation/thread/session/run binding。
- `useAgentSessionStore` 只保存必须跨刷新持久化的 registry 与 draft workspace。
- active runtime、pending server requests、thread list cache 迁到 runtime reducer 或 React Query cache。
- 移除 deprecated provider session state API。

拆分 `AgentChatDataSourceShell`：

- `useAgentChatRuntimeController`
- `useAgentChatThreadList`
- `useAgentChatServerRequests`
- `useAgentChatPanelCommands`
- `AgentChatShellView`
- `AgentChatShellDataBoundary`

验收：

- `AgentChatDataSourceShell.tsx` 降到 500 行以内。
- shell 组件不含 window event、module Map、query key 字面量。
- 多 surface 打开同一 thread 的同步由 runtime selector 测试覆盖。
- pending server request replay 有专门状态机测试。

### 第 5 阶段：内容工作台运行时事务化

目标：

- `ContentSourceWorkspaceRuntime` 每次更新产生 operation：
  - `operationId`
  - `target`
  - `optimisticPatch`
  - `commit`
  - `rollback`
  - `reloadPolicy`
  - `changedPaths`
- port 写入返回 `snapshotVersion` 或 `changedPaths`。
- 失败时按操作类型执行 rollback 或 reload，并给 UI 标明失败对象。

拆分 `ContentSourceWorkspacePage`：

- `useContentSourceWorkspaceRuntime`
- `useContentSourceWorkspaceSelection`
- `useContentSourceWorkspaceCommands`
- `ContentSourceWorkspaceNav`
- `ContentSourceWorkspaceStage`
- `ContentSourceWorkspaceInspector`
- `ContentSourceWorkspaceDialogs`
- `contentSourceWorkspaceViewModel.ts`

验收：

- 页面 TSX 降到 700 行以内。
- helper 文案和 label 迁到 presentation/domain 文件。
- 连续更新、失败回滚、reload reconciliation 有单测。
- 选中态不因 workspaceData reload 无条件重置。

### 第 6 阶段：样式契约落地

已有 `docs/frontend-style-contract-layer-design.zh-CN.md`，本阶段把文档变成门禁。

动作：

- `apps/frontend/src/index.css` 只保留 app base/reset/import，不再放业务页样式。
- 每个 feature 的 CSS 只作用于本 feature root class。
- UI package business 组件暴露稳定 props/slots/data attributes；应用不得覆盖内部 element class。
- 硬编码颜色收敛到 `--ms-color-*` 或 feature-scoped semantic token。
- 单个 CSS 文件超过 1000 行必须按 component/section 拆分。

验收：

- 新增 style boundary test：
  - 禁止 `index.css` 出现 feature 页面 class。
  - 禁止 app CSS 选择 `packages/ui` 内部 element class。
  - 禁止 feature 定义全局 `--ms-*`。
- 内容工作台 CSS 拆为 layout/nav/stage/inspector/dialogs/tokens。

### 第 6.5 阶段：`packages/ui` 包边界重构

详细方案见 `docs/package-ui-refactor.zh-CN.md`。本阶段与样式契约同步推进，但需要单独验收：

- 新增 `@movscript/ui/primitives`、`@movscript/ui/layout`、`@movscript/ui/business/*`、`@movscript/ui/debug` 等窄入口。
- `@movscript/ui/styles.css` 标记为 legacy all-in-one，新增 base/primitives/layout/business domain 样式入口。
- `AppPanel`、`AppSection`、`WorkbenchSection`、`AgentSurfaceBlock`、`EntityListCard` 等重复 frame/card/section 模式收敛到统一 primitive。
- `resource/page/*`、`agent/settings/*`、`agent/page/*`、`canvas/workflow/*` 等页面级 business 组件逐步迁回 app feature。
- 禁止新增 business 组件从 `@movscript/ui` 根入口导出。

验收：

- 新代码不再从 `@movscript/ui` 根入口导入 business 组件。
- 应用可以只导入 primitives/layout，而不加载全部 business CSS。
- `packages/ui/src/components/business/index.ts` 不再继续增长。
- `packages/ui` source 中无 `.DS_Store` 等系统垃圾文件。

### 第 7 阶段：Electron API adapter 收敛

目标：

- UI 组件只依赖 application service。
- Electron API 调用集中在 infrastructure adapter。
- 每个 adapter 暴露统一错误模型和 mock factory。

示例：

```text
contentWorkspaceService
  load(projectId)
  applyOperation(operation)
  sync(projectId)

providerSessionService
  listThreads(input)
  readThread(input)
  subscribeRequests(input)

workspaceFileService
  list(path)
  read(path)
  write(path, content)
```

验收：

- feature component 中新增 `window.api` 失败。
- Electron/browser/e2e mock 只 mock service，不 mock任意 `window.api` shape。

## 优先级排序

### P0：立即停止问题扩散

- Query key factory 与 mutation invalidation registry。
- feature component 禁止新增 window event / window.api / localStorage。
- 大文件新增阈值。
- `App.tsx` 的 BackendBoot、RedirectListener、ProjectRequiredDialog 拆出。
- `packages/ui` 新增分层入口和样式入口，禁止新增 business 组件进入根 barrel。

### P1：解决高频数据不一致

- Agent chat event bus 和 runtime controller。
- 内容工作台事务化 runtime。
- 资源/候选/语义实体领域事件失效映射。

### P2：降低 UI 回归

- `index.css` 业务样式迁出。
- 内容工作台 CSS 拆分。
- UI package business 组件补稳定定制 API。
- `packages/ui` 抽统一 Frame/Card primitives，迁移重复的 App/Agent/Workbench surface preset。

### P3：长期维护性

- 删除 deprecated Agent session API。
- 拆分 `AIAgentSettingsPage`、`ResourcesPage`、`ShotLibraryPage`。
- 建立前端 architecture decision records，新增 feature 必须声明 state owner、query keys、events、style owner。

## 建议的验收门禁

### 自动化脚本

1. `pnpm frontend:audit`
   - 输出最大文件、裸副作用、裸 query key、直接 Electron API。
2. `pnpm frontend:contracts`
   - 运行边界测试、样式契约测试、query key factory 测试。
3. `pnpm frontend:state-consistency`
   - 覆盖 Agent thread 更新、资源候选更新、内容工作台事务失败恢复。

### Code review checklist

- 这个变更的 source of truth 是谁？
- mutation 成功后发出哪个领域事件？
- 哪些 query key 会被刷新，是否由 registry 统一管理？
- UI 组件是否直接知道 Electron/window/localStorage？
- CSS 是否只作用于本 feature root？
- 是否新增了跨 feature class 覆盖？
- 是否有失败、取消、并发、重复事件的测试？

## 迁移风险与控制

- 不建议一次性重写 Agent 或内容工作台。先建立门禁和 adapter，再沿高频问题切片迁移。
- 每个阶段都应保留旧入口，但新增逻辑只接新边界。
- 对于正在修改中的文件，先加 characterization tests，记录当前行为，再拆实现。
- 对于 UI 样式，先把 cascade 来源可视化，再移动 CSS，避免同时改视觉和所有权。
- 对于数据更新，先统一 mutation result 和领域事件，再替换 query key。

## 完成定义

这次前端质量重构不应以“文件变小”为完成标准，而应以以下事实为准：

- 修改一个 UI 组件，不需要阅读 App shell 或 Electron API。
- 修改一个数据更新，不需要手写所有消费者 query key。
- 打开两个 Agent surface，同一线程状态不会靠 window event 互相猜测。
- 内容工作台写入失败后，UI 能明确回滚或重新加载，并标明失败对象。
- 新增 feature 时，state owner、query key owner、event owner、style owner 都能在代码中找到。
- CI 能阻止旧问题模式回流。
