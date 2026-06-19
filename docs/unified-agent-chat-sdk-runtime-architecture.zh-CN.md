# Unified Agent Chat SDK Runtime 架构设计

本文定义 MovScript 桌面端统一 Agent Chat 的目标架构。目标不是建设多 Agent 协作编排系统，而是建设一个用户可以在 Codex、Mova、Claude 之间切换的统一 Agent Chat。系统需要保持同一套聊天 UI、同一套会话索引、同一套运行时契约，同时允许每个 provider 通过自己的 SDK 执行。

本文是面向重构和验收的设计文档。它描述目标边界、模块职责、数据模型、调用链、迁移计划和验收标准。

## 结论

目标架构是标准的 port/adapter 形态：

```text
Frontend Agent UI
  -> Agent Application Services
  -> AgentChatDataSource
  -> SdkRuntimeClient
  -> Electron SDK Runtime Host
  -> codex-sdk / mova-sdk / claude-sdk
  -> MovScript Backend Gateway or direct provider credentials
```

关键原则：

- 用户看到的是 `AgentProfile`，不是 runtime、SDK package、app-server 进程或 provider-session。
- UI 只依赖 `AgentChatDataSource`，不直接依赖 Codex、Mova、Claude 私有协议。
- SDK runtime 是唯一普通聊天执行路径。
- `app-server` 彻底废弃，不再作为普通 Agent Chat 的运行、鉴权、配置或会话路径。
- 切换当前 Agent 只影响新会话，不改变历史会话绑定的 provider/runtime。
- 模型选择按 provider/runtime 隔离，不能继续作为全局单值长期存在。

## 范围

### 范围内

- Codex、Mova、Claude 三个内置 Agent 的统一 Chat。
- Provider 切换、Agent profile 展示、runtime readiness、account readiness。
- Thread list/read/start/resume/start turn/steer/interrupt 的统一契约。
- 本地 conversation registry，用于恢复历史会话和记录 active thread。
- SDK package 加载、contract probe、运行时账号解析。
- 从旧 app-server/provider-session 路径迁移到 SDK runtime 路径。

### 范围外

- 多 Agent 协作、任务委派、agent-to-agent delegation。
- Planner/worker 编排系统。
- Hub 包治理、Admin provider/catalog/route 治理。
- 后端 model catalog、route binding、billing gateway 的治理模型。
- 对 Codex/Mova/Claude SDK 本身的协议改造。

## 当前问题

当前代码已经有清晰的目标方向：`packages/core/src/agent/chat` 定义中立聊天协议，`createAgentChatDataSourceForProvider` 负责把 provider/runtime 转成 `AgentChatDataSource`。但实现层还残留两条历史路径。

### 双运行路径

现状同时存在：

- 新路径：`AgentChatDataSource -> sdk-runtime -> provider SDK`
- 旧路径：`provider-session/app-server -> HTTP/JSON-RPC -> provider session`

这会导致同一件事有两种入口：会话、鉴权、配置、日志、健康检查都可能各走一套。目标架构只保留 SDK runtime 路径。

### ProviderConfig 过重

`ProviderConfig` 同时携带：

- provider 身份
- protocol/message adapter
- SDK runtime profile
- SDK package/env/version
- 旧 app-server profile

目标架构中，`ProviderConfig` 只表达 provider 和 runtime 选择，不再携带 app-server lifecycle 配置。

### 鉴权来源分散

当前鉴权来源包括：

- renderer 的 user token
- workspace backend auth
- environment API key
- workspace config provider auth
- app-server `auth.json`
- local provider home

目标架构需要收敛为一个 `AgentRuntimeAccountResolver`，统一输出 SDK runtime 能消费的 account。

### 会话概念混杂

历史字段包括：

- `providerThreadId`
- `providerSessionTreeId`
- deprecated `sessionId`
- local conversation id
- app-server provider session id

目标架构只把 `providerThreadId` 作为 provider SDK thread 的稳定 ID，把 `providerInstanceId` 作为 runtime identity 的一部分。本地 conversation registry 只做索引，不冒充 provider 的 canonical history。

## 目标概念模型

### AgentProfile

用户可见的 Agent。Codex、Mova、Claude 都是 `AgentProfile`。

职责：

- 展示名称、启用状态、当前状态。
- 指向设置和诊断入口。
- 显示运行时 readiness 摘要。
- 封装 provider/runtime 细节，不把 SDK package、HOME、env 作为默认管理面。

不负责：

- 保存 API key。
- 保存 SDK package 的底层解析逻辑。
- 保存 thread history。
- 表达模型路由治理。

建议字段：

```ts
interface AgentProfile {
  id: string
  label: string
  enabled: boolean
  current: boolean
  providerId: string
  runtimeId: string
  connectionKind: 'sdk'
  readiness: AgentProfileReadiness
}
```

### ProviderConfig

技术配置。它连接一个 AgentProfile 到一个 runtime。

职责：

- provider identity：`codex`、`mova`、`claude`
- provider label 和 enabled 状态
- runtime profile

不负责：

- app-server profile
- app-server executable path
- app-server config distribution
- auth materialization
- local process lifecycle

目标字段：

```ts
interface ProviderConfig {
  id: string
  kind: 'codex' | 'mova' | 'claude' | (string & {})
  label: string
  enabled: boolean
  runtime: ProviderRuntimeProfile
}

interface ProviderRuntimeProfile {
  id: string
  api: 'codex-sdk' | 'mova-sdk' | 'claude-sdk' | (string & {})
  label: string
  packageName?: string
  sdkPackageName?: string
  binaryPackageName?: string
  packageVersion?: string
  envVarNames?: Record<string, string>
  protocolVersion?: string
}
```

`envVarNames` 只允许保存环境变量名或非敏感 package resolution hints，不能保存 API key、token、session cookie 等 secret。用户凭证由 `AgentRuntimeAccountResolver` 在 Electron 侧解析，renderer 持久化状态不保存明文 secret。

### ProviderRuntimeApiContract

runtime contract 是 SDK runtime host 和 renderer 之间的能力契约。

职责：

- runtime api 名称。
- 支持的 provider kinds。
- 需要的 package exports。
- 需要的 RPC methods。
- 是否支持 thread list/read/start/resume/interrupt/stream。
- 是否支持 tools/permissions/mcp/config/account 等能力。

要求：

- 所有内置 Agent 必须有 contract。
- readiness 和 probe 使用 contract 判定，不靠 UI 特判。
- contract 不保存用户凭证。

### AgentChatDataSource

唯一聊天端口。UI、presentation hooks、thread tabs、composer、server request UI 都只能依赖它。

职责：

- `listThreads`
- `readThread`
- `startThread`
- `resumeThread`
- `startTurn` / `startTextTurn`
- `steerTurn`
- `interruptTurn`
- `subscribeThread`
- `subscribeServerRequests`

不负责：

- 解析 API key。
- 加载 SDK package。
- 启动本地 app-server。
- 管理 provider/catalog/route。

### SdkRuntimeClient

renderer 到 Electron runtime host 的 RPC client。

职责：

- 发送 `SdkRuntimeRpcMethod`。
- 转发 subscriptions。
- 不包含 provider-specific 业务逻辑。

### Electron SDK Runtime Host

Electron 侧执行 provider SDK 的进程内 host。

职责：

- 加载 SDK package。
- 校验 SDK package contract。
- 解析 runtime account。
- 创建或恢复 provider SDK thread。
- 执行 turn。
- 把 SDK 原生结果映射为 `AgentChatThread` / `AgentChatTurn` / notifications。

不负责：

- React 状态。
- UI readiness copy。
- app-server config 写入。
- Admin provider/catalog/route 治理。

建议拆分：

```text
electron/services/sdkRuntimeHandlers.ts
electron/services/sdkRuntimePackageResolver.ts
electron/services/agentRuntimeAccountResolver.ts
electron/services/sdkRuntimeThreadRepository.ts
electron/services/sdkRuntimeMessageMapper.ts
electron/services/sdkRuntimeHost.ts
```

### SdkRuntimeThreadRepository

SDK runtime host 需要一个 thread repository，但它不是新的 provider-session。

职责：

- 保存 runtime host 需要的 provider thread handle metadata。
- 在 SDK 不提供 thread list/read 时，为 UI 提供最小 thread index。
- 把 provider SDK 返回的 thread id、session id、cwd、execution settings 映射到 neutral thread。
- 支持同一个 `providerInstanceId + providerThreadId` 的 resume。

不负责：

- 复制完整 canonical transcript，除非 provider SDK 无法读取且 UI 需要本地最小恢复。
- 作为跨 provider 的共享 history store。
- 暴露 app-server session 语义。

规则：

- provider SDK 能提供 canonical history 时，以 provider SDK 为准。
- provider SDK 只能提供当前进程 handle 时，repository 可以保存本地 summary，但必须在 UI 中表达 history completeness。
- repository key 必须包含 `provider`, `providerId`, `providerInstanceId`, `providerThreadId`。
- 删除/归档 thread 时同时调用 provider SDK 能力和清理本地 index；如果 provider SDK 不支持，至少清理本地 index 并返回 capability-limited 状态。

### AgentRuntimeAccountResolver

统一账号解析器。

职责：

- 从 workspace backend auth、runtime env、workspace provider config 中解析账号。
- 输出 SDK runtime 能直接使用的 baseURL/API key/env。
- 解释凭证来源，用于 readiness。

不负责：

- 写 app-server `config.toml`。
- 写 app-server `auth.json`。
- 启动 app-server。
- 修改 Admin provider/catalog/route。

目标输出：

```ts
type AgentRuntimeAccount =
  | {
      kind: 'apiKey'
      baseURL: string
      apiKey: string
      source: 'movscript-backend-session' | 'workspace-provider-auth' | 'environment' | 'runtime-env'
      backendProviderSelected: boolean
    }
  | {
      kind: 'env'
      baseURL: string
      envName: string
      source: 'launch-env' | 'runtime-env'
      backendProviderSelected: boolean
    }
  | {
      kind: 'none'
      baseURL: string
      source: 'none'
      backendProviderSelected: boolean
    }
```

账号解析必须显式区分 `auto`、`backend`、`direct` 三种意图：

- `auto`：Codex/Mova 默认优先 MovScript backend session；Claude 默认优先 direct provider credentials。
- `backend`：必须使用 MovScript backend gateway，没有 backend session 或 gateway token 就返回 `account_missing`。
- `direct`：必须使用 provider direct credentials，没有 provider API key 就返回 `account_missing`。

解析优先级建议：

1. 明确的 provider account mode：`backend` 或 `direct`。
2. 明确 runtime/provider override 中的非敏感配置，例如 baseURL、account mode、env var name。
3. 如果 mode 是 `backend`，读取 MovScript backend session/token。
4. 如果 mode 是 `direct`，读取 provider-specific env 或 workspace provider auth。
5. 如果 mode 是 `auto`，按 provider 默认策略选择 backend 或 direct。
6. 无凭证，返回 structured readiness error。

Codex/Mova 默认优先 MovScript backend gateway，但显式 direct mode 可以改用 provider API key。Claude 默认优先 Anthropic direct credentials，除非后续明确支持 Claude backend gateway。这个差异属于 account resolver，不应该散在 UI 或 runtime handler 里。

安全规则：

- renderer 不接收明文 API key。
- renderer 只接收 readiness summary 和 masked source。
- Electron 可以把 API key 注入 provider SDK constructor 或 child env，但不得把明文 secret 写回 browser storage。
- workspace config 中如果支持 auth 引用，应优先保存引用、mode、env var name；保存明文 secret 时必须只落在受权限保护的 Node-side auth file，并作为后续专门安全设计处理。
- 日志、probe error、debug payload 必须走 redaction。

### BaseURL 与模型协议端点

当前代码里 `baseURL` 至少混用了两层含义：

| 概念 | 示例 | 归属 | 用途 |
| --- | --- | --- | --- |
| `backendBaseURL` | `http://localhost:8765` | MovScript backend session/runtime config | 产品后端入口；登录、项目、Admin、模型目录等 API 的 origin |
| `backendApiBaseURL` | `http://localhost:8765/api/v1` | MovScript backend client | 产品后端 REST API 前缀 |
| `modelEndpointBaseURL` | `https://api.openai.com/v1`、`https://api.anthropic.com`、`http://localhost:8765/v1` | Provider lane / gateway endpoint | SDK 或 gateway 调用模型协议的 endpoint |

这三者必须分开命名。新代码禁止在跨边界 API 中继续使用裸 `baseURL`，除非对象名已经明确说明它属于 `BackendConnection` 或 `ModelEndpointProfile`。

结论：应该按模型协议族/`apiKind` 解析 endpoint，但不应该按每个 model id 手工配置一条 URL。正确粒度是 provider lane 或 endpoint profile：

```ts
type ModelEndpointProfile = {
  id: string
  owner: 'movscript-gateway' | 'provider-lane' | 'direct-sdk'
  adapterType: 'openai_compat' | 'anthropic' | 'gemini' | 'volcen' | string
  apiKinds: Array<'openai_responses' | 'openai_chat_completions' | 'anthropic_messages'>
  modelEndpointBaseURL: string
  authRef: string
}

type ModelRouteBinding = {
  publicModelId: string
  providerLaneId: string
  providerModelId: string
  apiKind?: 'openai_responses' | 'openai_chat_completions' | 'anthropic_messages'
  routeGroup?: string
}
```

规则：

- `backendBaseURL` 永远不是 provider endpoint；只有显式的 `movscript-gateway` endpoint profile 才能把它派生为模型 gateway endpoint。
- OpenAI Responses、OpenAI Chat Completions、Anthropic Messages 是不同 wire protocol。即使它们暂时共用同一个 gateway origin，也必须通过不同 `apiKind` 表达，不能靠字符串后缀推断。
- Admin Provider Credential / Provider Lane 拥有 upstream `modelEndpointBaseURL`、adapter、auth。Agent Settings 只选择 public model 和用途，不再保存 provider endpoint URL。
- Catalog Entry 拥有 public model identity、能力、价格、参数 schema；它不拥有 provider endpoint URL。
- Route Binding 负责把 public model 映射到 provider lane + provider model id，并声明或继承 `apiKind`。
- SDK Runtime Account Resolver 输入 `providerId`、`runtimeApi`、`apiKind`、`modelId`、`accountMode`，输出具体 SDK 需要的 endpoint/env/key。
- 如果一个 provider 同时暴露 OpenAI-compatible 和 Anthropic-native 接口，必须建两个 endpoint profile 或两个 provider lane；不要让一个 `baseURL` 承担多种协议含义。

对当前实现的判断：

- 后端 `AICredential.BaseURL` + `AdapterType`、`AIModelCatalogEntry`、`AIModelRouteBinding.APIKinds` 已经接近正确边界。
- `ProviderRuntimeApiContract.modelAPIKinds` 也已经表达 Codex/Mova 走 OpenAI-compatible，Claude 走 Anthropic Messages。
- 混乱主要在前端 app-server 兼容层：`resolveAppServerBaseURL()` 同时合并 account/provider/backend/modelConfig baseURL，`apiKindBaseURLPlaceholder()` 又把三种 `apiKind` 都显示成 `${backend}/v1`。
- 重构时应保留后端 Provider/Catalog/Route 模型，删除 app-server URL 分发语义，把 endpoint 解析移入 `AgentRuntimeAccountResolver`。

### SDK 配置注入边界

SDK 配置注入不是 app-server config distribution。它只发生在 Electron SDK Runtime Host 内部，目标是把 provider-neutral 的会话请求翻译成具体 SDK 的构造参数、环境变量和 turn options。

当前实现已经有可保留的行为：

- `ProviderRuntimeProfile` 管 SDK 包名、binary 包名、版本和 runtime env override。
- `runtime/probe` 检查 package load、required exports、required RPC methods、credentials readiness。
- `sdkRuntimeHomeEnv()` 会给 Codex/Mova/Claude 创建独立 home/config dir。
- Codex/Mova constructor 已注入 `baseUrl`、`apiKey`、`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_API_BASE_URL`。
- Claude query options 已注入 `ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`、`ANTHROPIC_API_BASE_URL`、`CLAUDE_CONFIG_DIR`。
- turn/start 已经能传 `cwd`、`model`，Claude 还会传 `resume`。

这次重构已经把原先耦合拆开：

- `sdkRuntimeDefaultHandlers.ts` 只保留 RPC 分发和运行编排；账号、endpoint、home、config injection、thread repository、notification mapping 已拆到独立模块。
- `AgentRuntimeAccountResolver` 不再 import app-server config distribution，也不写 `config.toml` / `auth.json`。
- Codex/Mova/Claude 的 home 由 `AgentRuntimeHomeResolver` 解析，不再读取 `appServerProfile.home`。
- Claude endpoint 由 `apiKind=anthropic_messages` 的 endpoint resolver 处理，不再复用 OpenAI 默认 base URL 判断。
- credential readiness 必须走 redacted diagnostics；renderer 永远不能拿到明文 key/token。

目标拆分：

```text
SdkRuntimeRequestContext
  -> RuntimePackageResolver
  -> AgentRuntimeAccountResolver
  -> AgentRuntimeHomeResolver
  -> SdkRuntimeConfigInjector
  -> provider SDK constructor/query/thread options
```

建议目标类型：

```ts
type AgentRuntimeResolvedAccount = {
  mode: 'backend' | 'direct' | 'none'
  apiKind: 'openai_responses' | 'openai_chat_completions' | 'anthropic_messages'
  modelEndpointBaseURL: string
  auth:
    | { kind: 'apiKey'; apiKey: string; source: string }
    | { kind: 'env'; envName: string; source: string }
    | { kind: 'none'; source: 'none' }
  readiness: {
    ok: boolean
    source: string
    acceptedEnv: string[]
    redactedEndpoint: string
    errorCode?: 'account_missing' | 'endpoint_missing' | 'api_kind_unsupported'
  }
}

type AgentRuntimeHome = {
  path: string
  env: Record<string, string>
  source: 'managed-workspace' | 'override'
}

type SdkRuntimeInjectedConfig = {
  providerId: string
  runtimeApi: string
  account: AgentRuntimeResolvedAccount
  home: AgentRuntimeHome
  sdkEnv: Record<string, string>
  constructorOptions?: Record<string, unknown>
  queryOptions?: Record<string, unknown>
}
```

注入规则：

- renderer 只传 `provider`、`runtime`、`model`、`cwd`、thread/turn 控制参数；不传明文 API key。
- Electron 侧解析 secret、backend token、endpoint profile，并只把明文 secret 注入 SDK constructor 或 child env。
- Codex/Mova 只消费 OpenAI-compatible endpoint：`baseUrl`、`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_API_BASE_URL`。
- Claude 只消费 Anthropic endpoint：`ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`、`ANTHROPIC_API_BASE_URL`、`CLAUDE_CONFIG_DIR`。
- `model` 和 `cwd` 属于 thread/turn execution settings，不属于 account resolver。
- SDK home/config dir 属于 runtime home resolver，不属于 account resolver，也不再使用 app-server 命名。
- SDK package name/version 属于 package resolver，不属于 account resolver。
- readiness 返回 masked source、accepted env、endpoint 摘要和 error code；不得返回 `apiKey`、backend token、auth json。

各 SDK 的注入形状：

| Runtime | SDK 入口 | Account/endpoint 注入 | Home/config 注入 | Turn 注入 |
| --- | --- | --- | --- | --- |
| Codex SDK | `new Codex(options)` | `baseUrl`、`apiKey`、`OPENAI_*` env | `CODEX_HOME` | `workingDirectory`、`model` |
| Mova SDK | `new Codex(options)` 或 Mova 兼容入口 | `baseUrl`、`apiKey`、`OPENAI_*` env | `MOVA_HOME`，兼容期可同时写 `CODEX_HOME` | `workingDirectory`、`model` |
| Claude Agent SDK | `query({ prompt, options })` | `ANTHROPIC_*` env | `CLAUDE_CONFIG_DIR` | `cwd`、`model`、`resume` |

迁移验收：

```text
sdkRuntimeDefaultHandlers 不 import appServerConfigDistribution
Codex/Mova/Claude 的注入 mapper 各有单元测试
runtime/probe 的 credentials readiness 来自 AgentRuntimeAccountResolver
runtime home 不再读取 appServerProfile；legacy appServerProfile 字段被忽略并从新持久化结果中消失
Claude endpoint 注入不依赖 DEFAULT_OPENAI_BASE_URL
renderer 永远拿不到 apiKey/backend token
```

### 流式输出与通知通道

统一 Chat 的 streaming 不应恢复 provider-session event stream，也不应把 `turn/start` 改成 renderer 直接消费 provider SDK 的 async iterator。更合理的模型是双通道：

```text
Command channel:
  AgentChatDataSource.startTurn/startTextTurn
    -> SdkRuntimeClient.request('turn/start')
    -> returns final AgentChatTurn when turn settles

Event channel:
  AgentChatDataSource.subscribeThread
    -> SdkRuntimeClient.subscribe
    -> Electron SDK Runtime Host publishes AgentChatNotification
    -> core runtime reducer applies deltas
```

当前实现的好部分：

- `AgentChatNotificationDispatcher` 已支持 `turn/started`、`item/started`、`item/agentMessage/delta`、`item/reasoning/textDelta`、`item/commandExecution/outputDelta`、`item/fileChange/outputDelta`、`item/completed`、`turn/completed`。
- `AgentChatRuntimeState` 已有 `streamingAgentItems`、pending user items、realtime transcript/audio projection。
- `SdkRuntimeClient.subscribe`、Electron IPC subscription、`publishSdkRuntimeNotification()` 已能按 runtime/provider/thread 过滤通知。
- UI lifecycle 已在 active thread 上订阅 notification，viewport 会把 streaming item 保持可见并自动滚动。

当前落地状态与剩余约束：

- `SdkRuntimeTurnEvent` 和 `SdkRuntimeNotificationMapper` 已成为 provider native event -> neutral notification 的增量通道。
- Claude `query()` async iterable 已在 `for await` 中转成 `agent.delta` / `reasoning.delta` 并实时 publish。
- Codex/Mova 如果 SDK 暂未提供原生事件流，仍允许 final text fallback，但必须通过 capability/readiness 标明 streaming 受限。
- `turn/failed` 会通过 notification 留下 failed turn；不能只 reject request。
- interrupt 必须绑定 provider SDK 的 abort/interrupt 句柄；如果某个 SDK 不支持，应在 runtime probe 中暴露 capability-limited 状态。

目标拆分：

```text
provider SDK native stream/result
  -> SdkRuntimeStreamAdapter
  -> SdkRuntimeTurnEvent
  -> SdkRuntimeNotificationMapper
  -> publishSdkRuntimeNotification()
  -> AgentChatNotificationDispatcher
  -> visible streaming items
```

建议事件模型：

```ts
type SdkRuntimeTurnEvent =
  | { type: 'turn.started'; turnId: string }
  | { type: 'item.started'; turnId: string; item: AgentChatThreadItem }
  | { type: 'agent.delta'; turnId: string; itemId: string; delta: string; phase?: string | null }
  | { type: 'reasoning.delta'; turnId: string; itemId: string; delta: string; summary?: boolean; index?: number }
  | { type: 'tool.progress'; turnId: string; itemId: string; message: string }
  | { type: 'command.output'; turnId: string; itemId: string; delta: string }
  | { type: 'file.patch'; turnId: string; itemId: string; delta: string }
  | { type: 'item.completed'; turnId: string; item: AgentChatThreadItem }
  | { type: 'turn.completed'; turn: AgentChatTurn }
  | { type: 'turn.failed'; turnId: string; error: { message: string; code?: string } }
  | { type: 'turn.interrupted'; turnId: string; reason?: string }
```

映射规则：

- 每个 provider adapter 必须产生稳定 `turnId` 和 `itemId`。delta、completed item、final turn 必须能按同一个 item id 合并。
- `turn/started` 必须先于任何 item delta；`turn/completed` 或 `turn/failed` 必须最终落盘并清理 streaming buffer。
- `item/agentMessage/delta` 只承载增量，不承载最终全文。最终全文通过 `item/completed` 或 `turn/completed` 合并。
- `turn/completed` 是权威最终状态；dispatcher 负责把 streaming item 与 final item merge，避免重复显示。
- 对高频 delta 做轻量 coalescing，例如 16-50ms 或按字符阈值批量 publish；不要在 React 组件里处理 backpressure。
- stream error 要发布 `turn/failed` 和 `thread/status/changed`，不能只 reject `turn/start`。
- interrupt 要绑定 provider SDK 的 abort/interrupt 句柄；如果某个 SDK 不支持，应在 runtime probe 中暴露 capability-limited 状态。

各 SDK 的目标策略：

| Runtime | 当前状态 | 目标 |
| --- | --- | --- |
| Codex SDK | `thread.run()` 后一次性映射 result | 优先接入 SDK 原生 event/callback；没有原生流时标记为 non-streaming fallback |
| Mova SDK | 复用 Codex-compatible runner | 同 Codex，保持 OpenAI-compatible event mapping |
| Claude Agent SDK | `query()` async iterable 被收集后一次性映射 | `for await` 中逐条转换为 `SdkRuntimeTurnEvent`，实时发布 text/reasoning/tool/status |

验收：

```text
turn/start 期间 UI 能在 request promise resolve 前看到 item/agentMessage/delta
Claude query async iterable 每 yield 一条可见事件都会 publish notification
final turn 不重复显示 streaming assistant text
interruptTurn 能停止正在运行的 provider stream，或 probe 明确标记 unsupported
stream error 会留下 failed turn 和可读错误，而不是只让 composer 恢复输入
```

### Skill 管理：全局与项目

Skill 是 Agent 能力配置，不属于 app-server，也不应该绑定某一个 provider-session。但 Skill 的运行机制应该优先尊重各 SDK 自己的约定：项目级 Skill 基本就是当前 `cwd` 下的 provider-native 文件夹，例如 `.codex`、`.claude`、`.mova`。统一 Chat 不应该重新发明一套隐藏的 Skill runtime；中立层只做索引、展示、校验和可选安装管理。

```text
provider-native skill dirs in cwd/global home
  -> SkillIndex / Inspector
  -> optional selection UI
  -> SDK runtime consumes provider-native dirs
```

职责边界：

| 层 | 职责 | 不负责 |
| --- | --- | --- |
| Provider-native dirs | `.codex`、`.claude`、`.mova`、provider global home 中的 Skill/commands/settings | 不提供跨 provider 抽象 |
| `SkillIndex` / Inspector | 扫描当前 provider + cwd 可见的 Skill，解析 metadata，给 UI/诊断提供列表 | 不改变 SDK 的原生发现规则 |
| `SkillSelectionResolver` | 只处理产品管理的启用/禁用、依赖/冲突、插件安装目标 | 不把一个 provider 的 Skill 强行映射成另一个 provider 的 Skill |
| Runtime setup | 设置正确 `cwd`、`CODEX_HOME`、`CLAUDE_CONFIG_DIR`、`MOVA_HOME`，必要时确保 managed skill 已物化 | 不在每次 turn 动态改写项目 Skill |

全局 Skill 与项目 Skill 的区别：

| Scope | 生命周期 | 典型内容 | 存储原则 |
| --- | --- | --- | --- |
| Global skill | 当前用户安装，跨 workspace 可用 | `$CODEX_HOME`、`$CLAUDE_CONFIG_DIR`、`$MOVA_HOME` 下的用户级 Skill/commands/settings | 存在 provider global home 或桌面/user data；不进入项目仓库 |
| Project skill | 跟随当前 `cwd`，团队可复现 | `cwd/.codex/**`、`cwd/.claude/**`、`cwd/.mova/**` | provider-native 目录就是运行真相，可提交的项目配置应放这里 |
| Builtin skill | 应用/插件随包分发 | MovScript core/project/planning/editing/generation/review skill | 只读来源；版本由应用或插件包管理 |
| Managed plugin skill | 由 MovScript UI 安装/启用的 Skill 包 | 插件 bundle、lock、可选物化到 `.codex` / `.claude` / `.mova` | lock 记录来源；provider-native 目录负责被 SDK 消费 |

推荐目录语义：

```text
Global:
  $CODEX_HOME/...
  $CLAUDE_CONFIG_DIR/...
  $MOVA_HOME/...

Project:
  <cwd>/.codex/...
  <cwd>/.claude/...
  <cwd>/.mova/...

Optional MovScript-managed plugin metadata:
  <cwd>/.agents/plugins/manifest.json
  <cwd>/.agents/plugins/lock.json
  <cwd>/.agents/plugins/bundles/<plugin>/...
```

当前 `apps/frontend/electron/services/projectPluginStore.ts` 有价值的是项目插件 manifest/lock、插件缓存和 Skill 发现逻辑；旧问题是它曾把 `.agents/skills` 和 `.codex/skills` 都当成项目 Skill source，却没有 provider target 概念。目标状态下，`.agents` 只记录 MovScript-managed plugin 的来源和锁；真正给 SDK 消费的内容要物化到对应 provider 的当前 `cwd` 目录，比如 Codex 到 `.codex`、Claude 到 `.claude`、Mova 到 `.mova`。已落地的第一步是停止写入和读取 `.agents/skills`；已落地的第二步是让 managed project plugin 显式记录 `providerTargets`，并按 Codex / Mova / Claude target 分别物化到 `.codex/skills`、`.mova/skills`、`.claude/skills`。如果用户手写 `.codex` / `.claude`，那就是该 provider 的原生项目 Skill，不需要经过 MovScript 转译。

选择与覆盖规则：

- `SkillIndex` 输出当前 provider + cwd 可见 Skill，带 `providerScope`、`sourceScope`、`sourceType`、`pluginKey`、`version`、`path`、`contentHash`。
- Skill id 必须带 provider scope；`.codex` 和 `.claude` 下同名 Skill 不能默认视为同一个 Skill。
- 同一个 provider scope 内的 logical skill id 出现多个来源时，按 `project native > managed project plugin > global user > global plugin > builtin` 解析；冲突必须进入 warning，不允许静默随机选一个。
- `agentCatalog.configFiles[].skillIds` 只表达当前 config file 的启用选择；它不表达 Skill 安装来源。
- 全局默认启用只影响新 workspace 或没有显式项目选择的 config file；项目 config file 一旦存在，项目选择优先。
- `dependencies` 和 `conflicts` 由 `SkillSelectionResolver` 统一处理；UI 只展示 resolver 给出的 issue，不在组件中重复实现依赖算法。
- Provider/runtime capability 会影响最终启用结果：例如某 Skill 需要工具或 MCP，而当前 runtime 不支持，对应 Skill 应标记为 `blocked` 或 `capability-limited`，不能假装已启用。

建议 catalog/index 输出。这个结构用于 UI、诊断和可选 managed plugin，不替代 provider-native 文件发现：

```ts
interface ResolvedSkillManifest {
  scopeKey: string
  provider: string
  providerId: string
  providerInstanceId: string
  workspaceContext?: AgentSessionWorkspaceContext
  configFileId?: string
  cwd: string
  skills: Array<{
    id: string
    name: string
    instruction: string
    providerScope: 'codex' | 'mova' | 'claude'
    sourceScope: 'builtin' | 'global' | 'project'
    sourceType: 'builtin' | 'local' | 'plugin' | 'team' | 'mcp'
    version?: string
    path?: string
    contentHash: string
    toolGrants: string[]
  }>
  warnings: string[]
}
```

运行时注入规则：

- renderer 只能选择 provider、cwd、config file / skill id；不传明文 secret，也不直接改写其他 provider 的 Skill 目录。
- SDK runtime handler 负责传正确 `cwd`，并设置 `CODEX_HOME`、`CLAUDE_CONFIG_DIR`、`MOVA_HOME` 等 global home。
- Codex/Mova/Claude 优先按各自 SDK 规则读取当前 `cwd` 下的 `.codex` / `.mova` / `.claude`。
- Managed plugin 的安装/启用可以把 Skill 物化到 provider-native cwd 目录；这是安装动作，不是每次 turn 的隐式 runtime projection。
- Claude 不应该消费 `.codex`；Codex 不应该消费 `.claude`。跨 provider Skill 需要插件包显式提供不同 target。
- Skill index 可以在 startTurn 前做 readiness/probe，但普通执行不依赖 app-server `skills/list`。

与现有代码的迁移判断：

| 当前入口 | 去留 | 目标 |
| --- | --- | --- |
| `ProviderCatalogSkill` / `ProviderCatalogConfigFile` core 类型 | 保留并中立化 | 从 provider-session 类型迁到 core/agent catalog contract |
| `agentSettingsSkillModel.ts` | 保留 UI/presentation 规则 | 类型来源改为 neutral skill catalog，不 import providerSessionClient 类型 |
| `AIAgentSettingsPage` `providerSessionClient.inspect()` | 替换 | 调用 `AgentSkillCatalogService.inspect()` |
| `projectPluginStore.ts` | 保留项目插件价值，拆分职责 | `.agents` 记录 plugin lock/source，启用时按 provider target 写 `.codex` / `.claude` / `.mova` |
| `appServerHub` `skills/list` | 删除普通 Chat 依赖 | catalog service 提供等价 inspect/list |
| `saveSkillInstructions` | 已删除旧入口 | Skill instruction 修改走 project/global Skill source 或 config file 管理 |

验收：

```text
Skill catalog query key 不包含 provider-session baseURL
Agent Settings 的 skill 类型不来自 providerSessionClient
Codex/Mova/Claude 分别读取当前 cwd 下的 provider-native Skill 目录
项目插件安装有 provider target，不再默认只写 .codex
禁用项目 skill 只影响当前 cwd/provider target，不直接修改 global skill source
app-server skills/list 不再是普通 Chat / Settings 的数据来源
```

### ConversationRegistry

本地会话索引，不是 canonical thread store。

职责：

- 记录用户打开过哪些 provider thread。
- 记录当前用户 active conversation。
- 支持历史 thread tab 恢复。
- 根据 provider identity 隔离 thread。

关键规则：

- conversation id 必须包含 provider scope，避免不同 provider 的 thread id 冲突。
- 新建 thread 时写入 `provider`, `providerId`, `providerInstanceId`, `providerThreadId`。
- 打开历史 thread 时必须使用 registry 里的 provider identity 创建 data source。
- 当前 provider 切换只影响新会话，不改变历史会话绑定。

建议记录：

```ts
interface AgentConversationRegistryRecord {
  id: string
  userId: string
  provider: string
  providerId: string
  providerInstanceId: string
  providerThreadId: string
  workspaceContext?: AgentSessionWorkspaceContext
  projectId?: number
  title?: string
  status?: string
  open: boolean
  archived: boolean
  createdAt: number
  updatedAt: number
}
```

Legacy 字段：

- `providerSessionId` 和 `sessionId` 只能用于迁移读取。
- 新 SDK 会话不再写这些字段；Claude resume token 只保存在 SDK provider thread 内部，不投影到公共 thread/registry。
- 迁移完成后删除 legacy 字段。

### ActiveProvider 与 ActiveThread

当前选中 Agent 和当前打开 thread 是两件事。

```text
selectedProviderId
  -> only affects new conversations

activeConversationId
  -> points to a registry record
  -> record decides provider/runtime for this thread
```

目标容器不应该只由 `resolveNewConversationProvider` 决定 data source。它需要先看 active conversation：

```text
if active conversation exists:
  provider = provider from active conversation registry record
else:
  provider = newConversationProvider
```

这样用户切到 Claude 后，仍然可以打开历史 Codex thread；打开历史 Codex thread 时，shell 应创建 Codex data source，而不是当前 Claude data source。

### ModelSelection

模型选择不能长期是全局单值。Codex/Mova/Claude 的可用模型集合和 API kind 不同。

建议结构：

```ts
interface AgentSettings {
  activeProviderProfileConfigId: string
  selectedModelByProviderId: Record<string, string | null>
  selectedModelByRuntimeApi?: Record<string, string | null>
}
```

规则：

- 读取当前模型时先按 `providerId` 取。
- providerId 没有值时可按 runtime api 取 fallback。
- 当前 provider 的模型列表不包含已选模型时，只清理当前 provider 的选择。
- 新建/继续某个历史 thread 时，优先使用该 thread 的 execution settings，其次使用 provider-scoped selection。
- 如果 provider SDK 或 thread 已经保存 execution settings，UI 不应在读历史 thread 时强行覆盖模型。

## 目标调用链

### 应用启动

```text
Electron
  -> getRuntimeConfig
  -> expose provider runtime env
Renderer
  -> normalize ProviderSettings
  -> project AgentProfiles
  -> render current Agent
```

启动阶段不加载所有 SDK package。SDK package probe 应按需触发，避免启动慢和副作用。

### 当前 Agent 切换

```text
User selects AgentProfile
  -> commitAgentProviderActivation
  -> ProviderSettings.defaultProviderId/newConversationProviderId
  -> clear active conversation for current user
  -> next new thread uses selected provider
```

切换 Agent 不修改已有 conversations。

### 新建会话

```text
AgentUnifiedChatShell
  -> resolveNewConversationProvider
  -> createAgentChatDataSourceForProvider
  -> SdkRuntimeClient.thread/start
  -> Electron SDK Runtime Host
  -> provider SDK startThread
  -> AgentChatThread
  -> ConversationRegistry upsert
```

新 thread 必须保存 provider identity。

### 打开历史会话

```text
User opens registry record
  -> read provider/providerId/providerInstanceId/providerThreadId from record
  -> resolve matching ProviderConfig
  -> createAgentChatDataSourceForProvider(record provider)
  -> dataSource.readThread(record.providerThreadId)
```

禁止用当前选中 provider 去读历史 thread，除非历史 record 本身就是当前 provider。

### 在历史会话中继续发送

```text
Active thread belongs to Codex
Current selected Agent is Claude
User sends message in active Codex thread
  -> message must go to Codex data source
```

发送动作绑定 active thread provider，不绑定当前 selected provider。用户想用 Claude 开新对话时，应显式新建 Claude conversation。

### 发送消息

```text
Composer submit
  -> build AgentChatInput
  -> resolve model for this provider/thread
  -> dataSource.startTurn/startTextTurn
  -> SdkRuntimeClient.turn/start
  -> SDK Runtime Host
  -> provider SDK thread.run/query
  -> map SDK native result to AgentChatTurn
  -> update core runtime state
  -> render neutral thread items
```

### Runtime probe

```text
Settings/Console
  -> dataSource.capabilities.runtime.probe
  -> SdkRuntimeClient.runtime/probe
  -> package resolver checks load/export
  -> account resolver checks credentials
  -> contract checks required RPC methods
  -> structured readiness result
```

Readiness 必须是结构化数据，UI 再投影成 copy。

## app-server 废弃边界

以下能力全部废弃：

- app-server binary discovery。
- app-server process lifecycle。
- app-server config distribution。
- app-server JSON-RPC client。
- app-server realtime logs。
- app-server health 作为普通 Agent Chat readiness。
- provider-session app-server 兼容聊天路径。
- 普通 Agent Chat 中的 `ensureAppServer`、`getAppServerStatus`、`distributeAppServerConfig`、`stopAppServer`。

以下能力不属于 app-server，不应误删：

- MovScript backend API。
- MovScript backend auth/session。
- Backend model gateway。
- Admin provider/catalog/route。
- Core agent chat protocol。
- Electron SDK runtime host。
- Provider SDK package store。

## 当前实现功能迁移盘点

本节基于当前代码中的实际入口做功能去留判断。目标是废弃 app-server/provider-session 作为普通聊天运行路径，同时保留已经有产品价值的能力，并把它们迁移到更清晰的模块。

### 已经应当保留的统一聊天主链

这些代码方向是正确的，应作为新架构主链继续强化：

- `packages/core/src/agent/chat/agentChatProtocol.ts`：保留。它已经提供 provider-neutral 的 `AgentChatThread`、`AgentChatTurn`、`AgentChatDataSource`、server request、notification、capabilities。
- `apps/frontend/src/features/agent/components/AgentChatDataSourceShell.tsx`：保留。它已经把 thread list、thread bootstrap、turn controls、server requests、thread tabs 组织在 `AgentChatDataSource` 周围。
- `apps/frontend/src/features/agent/components/AgentRuntimeChatShell.tsx` 和 `AgentUnifiedChatShell.tsx`：保留。它们是 Codex/Mova/Claude 统一入口；当前选中 provider 只影响新会话，历史会话通过 conversation registry 的 provider identity 恢复。
- `apps/frontend/src/features/agent/application/useAgentChatTurnControls.ts`：保留。发送、排队输入、停止 turn 已经走 `dataSource.startTurn/startTextTurn/interruptTurn`。
- `apps/frontend/src/features/agent/application/useAgentChatServerRequests.ts`：保留。server request/persistent request 的 UI 机制可以继续复用。
- `apps/frontend/src/shared/infrastructure/sdk-runtime/sdkRuntimeChatDataSource.ts`：保留。它是 renderer 到 SDK runtime 的标准 adapter。

已落地/仍需调整：

- 普通 SDK Chat 的模型选择已迁到 `agentStore.settings.modelIdByProviderProfile`；旧 `modelId` 只作为 persisted migration 输入并在 normalize 后归零。
- 主 Chat 和 Agent Settings 模型 controller 都通过 `agentSettingsModelSelectionPatch` 写入 provider-scoped 模型选择；契约测试禁止重新写入 `updateSettings({ modelId: ... })`。
- 当前 shell 已按 registry-open conversation 恢复历史 thread 的 provider identity；当前选中 provider 只影响新会话。
- `useAgentThreadRegistryHydration.ts` 中的 `AgentThreadSummary` / `sessionId` 只服务 legacy provider-session 历史读取；SDK 新记录不再写 `providerSessionId`、`providerSessionTreeId` 或 `sessionId`。
- 旧普通聊天发送链已删除：`agentSendCommit.ts`、`agentSendCompletion.ts`、`agentSendStream.ts`、`agentSendWorkspace.ts`、`ProviderSessionClient.runMessageStream`、`RunMessageResult` 不再存在。普通聊天发送只走 `useAgentChatTurnControls -> AgentChatDataSource.startTurn/startTextTurn`。

### SDK Runtime 现状

当前 `apps/frontend/electron/services/sdkRuntimeDefaultHandlers.ts` 已经能承接 Codex/Mova/Claude 的基本 SDK 运行，但还只是可跑通的聚合实现。

保留：

- `runtime/probe`、`runtime/describe`。
- `thread/list/read/start/resume/rename/archive/unarchive/delete`。
- `thread/settings/update`、`thread/goal/set`。
- `turn/start`、`turn/text/start`、`turn/steer`、`turn/interrupt`。
- SDK package load/export probe。
- SDK native result 到 neutral `AgentChatThreadItem` 的映射。

已重构/仍需强化：

- 账号解析已抽到 `agentRuntimeAccountResolver.ts`。
- endpoint 解析已抽到 `agentRuntimeEndpointResolver.ts`。
- runtime home 已抽到 `agentRuntimeHomeResolver.ts`。
- SDK option/env 注入已抽到 `sdkRuntimeConfigInjector.ts`。
- thread index 已抽到 `sdkRuntimeThreadRepository.ts`。
- thread/turn RPC 生命周期已抽到 `sdkRuntimeRequestHandler.ts`；`sdkRuntimeDefaultHandlers.ts` 只保留 provider SDK package/probe/account 适配和 handler 注册。
- streaming 事件已抽到 `sdkRuntimeTurnEvents.ts`、`sdkRuntimeNotificationMapper.ts`、`claudeSdkRuntimeStreamAdapter.ts`；后续 provider adapter 继续补全 tool call、system notice、resume token 等 provider-specific case。
- core `agent/protocol.ts` 已继续拆分为纯 re-export 入口：attachment/client-input contract 移到 `agentAttachmentProtocol.ts`，conversation/status projection contract 移到 `agentConversationProtocol.ts`，telemetry 移到 `agentTelemetry.ts`，generation job/audit contract 移到 `agentGenerationProtocol.ts`，plan contract 移到 `agentPlanProtocol.ts`，protocol version 移到 `agentProtocolVersion.ts`，prompt/context/debug preview contract 移到 `agentPromptDebugProtocol.ts`，run contract 移到 `agentRunProtocol.ts`，status helper 移到 `agentStatusProtocol.ts`，task graph contract 移到 `agentTaskGraphProtocol.ts`，thread/session/message contract 移到 `agentThreadProtocol.ts`，timeline item/stream/activity contract 移到 `agentTimelineProtocol.ts`，tool-call contract 移到 `agentToolProtocol.ts`，trace event/query contract 移到 `agentTraceProtocol.ts`，media artifact/provider contract 移到 `mediaArtifacts.ts`，共享 JSON 类型移到 `protocolJson.ts`，provider catalog/tool/skill/capability contract 移到 `providerCatalog.ts`，approval/input/work/continuation contract 移到 `providerInteractionProtocol.ts`，provider model API/config/test contract 移到 `providerModelProtocol.ts`，provider-session snapshot/event schema 移到 `providerSessionProtocol.ts`。`protocol.ts` 只保留公共聚合导出，不再承载具体协议定义。

验收：

```text
sdkRuntimeDefaultHandlers 只负责注册和分发
account/package/thread/message mapping 各有独立测试
thread list/read 在应用重启后仍能恢复最小本地索引
Claude/Codex/Mova 的缺失能力由 runtime/probe 返回，不靠 UI 特判
```

### app-server 生命周期与 JSON-RPC

当前入口：

- `apps/frontend/electron/services/appServerManager.ts`
- `apps/frontend/electron/services/appServerHub.ts`
- `apps/frontend/electron/ipc/appServerIpc.ts`
- `apps/frontend/electron/ipc/appServerHubIpc.ts`
- `apps/frontend/electron/preload/api/appServer.ts`
- `apps/frontend/src/shared/infrastructure/app-server/*`
- `apps/frontend/electron/managedServices/bootstrap.ts`
- `apps/frontend/electron/managedServices/shutdown.ts`

结论：普通 Agent Chat 下全部废弃。

迁移方式：

- app-server process lifecycle 没有新等价物；由 SDK Runtime Host 进程内执行 SDK。
- app-server hub 没有新等价物；由 `SdkRuntimeClient.subscribe` / Electron IPC subscription 承担 notification/server request。
- app-server JSON-RPC thread/turn 方法迁到 `SdkRuntimeRpcMethod`。
- app-server protocol adapter、notification mapper、server request mapper 中仍有价值的 mapping case，可以复制语义到 `sdkRuntimeMessageMapper` 或 provider-specific mapper；旧 adapter 文件最终删除。
- desktop bootstrap/prewarm 不再启动 app-server；可改成轻量 runtime env 初始化，SDK package probe 按需触发。

验收：

```text
Electron preload 不再暴露 ensureAppServer/getAppServerStatus/distributeAppServerConfig/stopAppServer
managedServices/bootstrap 不再预热 app-server
normal chat import graph 中没有 shared/infrastructure/app-server
```

### ProviderSession HTTP Client

当前入口：

- `apps/frontend/src/shared/infrastructure/providerSessionHttpClient.ts`
- `apps/frontend/src/shared/infrastructure/provider-session-client/*`
- `apps/frontend/src/features/agent/application/providerSessionThreadQueryCache.ts`

结论：不能整体作为新架构保留。它原来混合了聊天 runtime、配置中心、thread index、run control、timeline、plan、artifact、memory、plugin 等职责，必须继续拆迁。

当前落地状态：

- `providerSessionHttpClient.ts` 已收缩为薄门面，只导出稳定 `ProviderSessionClient`、公共类型和 `forSession()`。
- `provider-session-client/providerSessionThreadClient.ts` 承担 session/thread/message/timeline 读写。
- `provider-session-client/providerSessionRuntimeClient.ts` 承担 health、telemetry、workspace session list 和 lease。
- `provider-session-client/providerSessionCatalogClient.ts` 承担 catalog/config-file/plugin/capabilities。
- `provider-session-client/providerSessionWorkspaceClient.ts` 承担 workspace config bridge；provider-session model config bridge 已删除，模型选择改由 provider-scoped agent settings 管理。
- run、debug、artifact、streaming 仍在已有分层文件中，不再回流到 `providerSessionHttpClient.ts`。

下一步：保留这些能力文件只作为 backend/output/diagnostics/config 的过渡 API；普通 Unified Agent Chat 不能再把它们当 runtime send/stream 主路径。

已删除的普通聊天旧入口：

- `ProviderSessionClient.runMessageStream`
- `apps/frontend/src/features/agent/application/agentSendCommit.ts`
- `apps/frontend/src/features/agent/application/agentSendCompletion.ts`
- `apps/frontend/src/features/agent/application/agentSendStream.ts`
- `apps/frontend/src/features/agent/application/agentSendWorkspace.ts`

功能迁移表：

| 当前能力 | 当前入口 | 去留 | 新架构等价实现 |
| --- | --- | --- | --- |
| 普通聊天 send/stream | `runMessageStream`、`agentSendCommit.ts` | 已删除旧链 | `AgentChatDataSource.startTurn/startTextTurn` |
| 停止生成 | `cancelRun`、`cancelRunTree` | 保留行为 | `AgentChatDataSource.interruptTurn`；plan tree stop 迁到可选 task capability |
| approval/input | `approveInteraction`、`rejectInteraction`、`answerRunInput` | 保留行为 | `AgentChatServerRequest` + `AgentChatServerRequestResponse` |
| thread list/read/update/delete | `listThreads`、`getThread`、`updateThread`、`deleteThread` | 保留行为 | `AgentChatDataSource` + `ConversationRegistry` + `SdkRuntimeThreadRepository` |
| provider sessions | `listSessions`、`getSession`、`listProviderSessionsFromWorkspace` | 删除普通聊天依赖 | 历史恢复只读迁移到 `ConversationRegistry`；新会话不创建 provider session |
| session lease | `acquireProviderSessionLease`、`releaseProviderSessionLease` | 删除 | SDK runtime 不需要 session lease；并发控制放在 thread repository/adapter |
| provisional conversation | `startProvisionalConversation` | 替代 | `createAgentChatDraftConversationId` + `ConversationRegistry` draft，不调用 runtime |
| runtime health | `health`、`ensureRunning` | 替代 | `runtime/probe` readiness |
| telemetry | `getProviderSessionTelemetry` | 可选保留 | 新 `AgentRuntimeDiagnosticsService`，只读结构化 runtime telemetry |
| catalog inspect/capabilities | `inspect`、`getCapabilities` | 保留价值，替代入口 | `AgentChatCapabilities` / `AgentExtensionCatalogService` |
| config files/tool permissions/skills | `saveProviderConfigFile`、`saveConfigFileToolPermissions` | 保留价值，替代入口 | workspace/core config service 或 SDK `config/skills/plugins` capability；Skill instruction 不再有 provider-session 写入口 |
| plugins install/remove | `listPlugins`、`installPlugin`、`removePlugin` | 保留价值，替代入口 | plugin catalog service；不要通过 provider-session/app-server |
| model config/test | `getProviderModelConfig`、`saveProviderModelConfig`、`testModelConfig` | 保留 UX，替代入口 | provider-scoped model selection + `AgentRuntimeAccountResolver` + runtime probe/model test |
| workspace config | `getWorkspaceConfig`、`saveWorkspaceConfig` | 保留 | core workspace config service，不挂在 provider session client 上 |
| timeline | `listThreadTimeline`、`streamThreadTimeline` | 可选保留 | neutral notification/activity projection；不是普通 chat 必需 API |
| run debug/evidence/generation view | `getRunTrace*`、`getRunDebug*`、`getRunGenerationView` | 可选保留 | `AgentRuntimeDiagnosticsService` 或 provider-specific debug capability |
| task graph/plan | `createTaskGraph`、`dispatchTaskGraph`、`replanRun` | 移出统一 Chat MVP | 后续 `AgentTaskCapability`，不能阻塞 Codex/Mova/Claude 统一聊天 |
| workspace artifacts | `listWorkspaceArtifacts`、`getWorkspaceArtifact`、`applyWorkspaceArtifact` | 保留，但不属于 Chat runtime | `AgentOutputService` 或 backend/workspace artifact API |
| memories | `listMemories`、`createMemory`、`deleteMemory` | 可选保留 | provider-neutral memory service，按 provider/thread scope 隔离 |

### 设置页与 Console 能力

当前入口：

- `apps/frontend/src/features/agent/components/AIAgentSettingsPage.tsx`
- `apps/frontend/src/features/agent/application/useAgentSettingsModelController.ts`
- `apps/frontend/src/features/agent/application/useAgentSettingsConfigFileController.ts`
- `apps/frontend/src/features/agent/application/useAgentSettingsWorkspaceConfigController.ts`
- `apps/frontend/src/features/agent/presentation/useAgentControlCenter.ts`
- `apps/frontend/src/features/agent/components/AgentsPage.tsx`

结论：保留用户价值，但重建数据来源。

新职责划分：

- Agent Console 只展示 `AgentProfile`、runtime readiness、account readiness、model selection、permission profile、capability 摘要。
- 不展示 app-server process、端口、binary path、config distribution、realtime app-server logs。
- provider model config 不再通过 provider-session endpoint 写入；保存到 provider-scoped settings/workspace config，secret 由 Electron side secret store 处理。
- tool/skill/plugin 如果继续作为产品能力，必须经过 neutral service 或 SDK capability，不经过 app-server catalog。
- `useAgentControlCenter` 中的 provider session 列表应替换为 conversation registry + runtime readiness。

验收：

```text
Agent Console 能切换 Codex/Mova/Claude
每个 provider 显示独立模型选择和 credential readiness
Settings 页面不调用 providerSessionClient.ensureRunning()
Settings 页面不展示 app-server lifecycle
```

### ProviderConfig 与默认配置

当前入口：

- `apps/frontend/src/shared/infrastructure/providerConfigStore.ts`
- `apps/frontend/src/shared/infrastructure/providerConfigDefaults.ts`
- `apps/frontend/src/shared/infrastructure/providerConfigAppServerProfile.ts`

结论：保留 provider/runtime 配置，删除 app-server profile。

迁移方式：

- `ProviderConfig.protocol` 可逐步简化；内置 Codex/Mova/Claude 都是 SDK runtime provider。
- 删除 `AppServerProfile`、`AppServerLifecycle`、`providerSupportsAppServerRuntime`、`resolveAppServerProfile`。
- `DEFAULT_CODEX_MOVSCRIPT_HOME_PROFILE` / `DEFAULT_MOVA_MOVSCRIPT_HOME_PROFILE` 中的 home 语义迁到 runtime home hints，但 binary discovery、app-server candidate path 删除。
- persisted settings 中的旧 app-server 字段不再参与运行时解析，也不写回。
- `providerProtocol` 如果仍用于 registry scope，应保证 SDK provider 的值稳定；不再出现 `app-server` 新记录。

验收：

```text
ProviderConfig has provider identity + runtime profile only
new persisted provider settings contain no appServerProfile
legacy appServerProfile is ignored and normalized away
```

### 账号与鉴权

当前入口：

- `apps/frontend/electron/services/appServerConfigDistribution.ts`
- `apps/frontend/electron/services/appSettingsSecrets.ts`
- `packages/core/src/backend/node/config.ts`
- `apps/frontend/electron/services/sdkRuntimeDefaultHandlers.ts`

结论：账号解析能力必须保留，但 app-server materialization 必须删除。

迁移方式：

- 新建 `agentRuntimeAccountResolver.ts`。
- 保留 backend session、MovScript backend gateway、direct provider env、app settings secret 等来源。
- 把 `backendBaseURL`、`backendApiBaseURL`、`modelEndpointBaseURL` 拆成不同字段；禁止用一个 `baseURL` 跨产品后端和模型 endpoint 传递。
- Account resolver 按 `runtimeApi + apiKind + accountMode + selectedModel` 解析 endpoint profile。
- Codex/Mova 使用 `openai_responses` / `openai_chat_completions` endpoint；Claude 使用 `anthropic_messages` endpoint。三者可以同源，但不能同义。
- 删除 `config.toml` / `auth.json` 写入。
- 删除 `appServerSpawnEnvironmentFromDistribution`。
- readiness 返回 masked source、accepted env、baseURL、mode、error code。
- SDK adapter 获取明文 secret 后只能传给 SDK constructor/env，不返回 renderer。

验收：

```text
account resolver 不 import appServerConfigDistribution
account resolver 不写文件
account resolver 不把 backendBaseURL 当作 modelEndpointBaseURL，除非 endpoint owner 是 movscript-gateway
openai_responses/openai_chat_completions/anthropic_messages 有独立 endpoint 解析测试
renderer probe response 不包含 apiKey/token/cookie
Codex/Mova auto mode 优先 backend session；Claude auto mode 优先 direct Anthropic credentials
```

### 模型选择

当前入口：

- `apps/frontend/src/features/agent/state/agentStore.ts`
- `apps/frontend/src/features/agent/application/agentChatDataSourceFactory.ts`
- `apps/frontend/src/features/agent/components/AgentRuntimeChatShell.tsx`
- `apps/frontend/src/features/agent/application/useAgentSettingsModelController.ts`

结论：保留模型选择 UX，但删除全局 `modelId` 作为长期来源。

迁移方式：

- 新增 `modelIdByProviderProfile`。
- 可选新增 `selectedModelByRuntimeApi` fallback，用于同一 provider 下存在多个 runtime profile 的场景。
- `createAgentChatDataSourceForProvider` 按当前 provider 读取模型选择。
- 模型 catalog 请求必须携带 runtime 支持的 `apiKinds`，并只展示当前 runtime 可调用的 public models。
- Agent Settings 不再写 direct provider `baseURL`；endpoint、credential、route 由 Admin Provider/Catalog/Route 管理。
- 继续发送历史 thread 时，先使用 thread execution settings；没有时才使用 provider-scoped selection。
- 设置页保存/清空只影响当前 provider。

验收：

```text
Codex 选择模型不会清空 Claude 模型
切换 provider 能恢复各自上次选择
Claude 设置页不会展示 OpenAI-only route；Codex/Mova 设置页不会展示 Anthropic-only route
历史 thread 已保存 executionSettings.model 时不被当前 provider 全局选择覆盖
```

### Activity、Page Task、Run UI

当前入口：

- `apps/frontend/src/features/agent/state/agentSessionStore.ts`
- `apps/frontend/src/features/agent/state/agentSessionTaskModel.ts`
- `apps/frontend/src/features/agent/domain/agentRunActivity.ts`
- `apps/frontend/src/features/agent/components/AgentRunActivityPanel.tsx`

结论：保留用户可见的活动和任务状态，但去掉 `AgentRun`/provider-session 作为唯一底层模型。

迁移方式：

- 新增 neutral `AgentTurnActivity` / `AgentRuntimeActivityEvent` 投影。
- `AgentRun` 相关 store 字段进入 legacy 兼容层；新 SDK turn 更新写 neutral activity。
- approval/activity 从 `AgentChatServerRequest` 和 notification 投影。
- page task 绑定 conversation/thread 时使用 provider-scoped registry id。
- 计划树和 worker run UI 暂时作为 legacy/optional capability，不进入统一 Chat MVP。

验收：

```text
SDK turn started/completed/failed 能生成 activity
server request 能生成 approval activity
新 SDK 会话不要求 AgentRun 对象也能更新 UI
```

### Workspace Artifact、Project Standards、Memory

当前入口：

- `apps/frontend/src/shared/infrastructure/provider-session-client/providerSessionWorkspaceArtifactClient.ts`
- `apps/frontend/src/features/agent/components/AgentArtifactResultCards.tsx`
- `apps/frontend/src/features/project-standards/components/ProjectStandardsPage.tsx`

结论：这些不是普通聊天 runtime，但部分已经是产品功能，不能随 app-server 一起误删。

迁移方式：

- workspace artifact 迁到 backend/workspace API 或独立 `AgentOutputService`。
- project standards 页面继续使用 workspace artifact 能力，但不依赖 provider-session client。
- chat 中展示 artifact card 时，从 neutral item metadata 或 `AgentOutputService` 读取。
- memory 能力如果继续存在，必须有 provider/thread/workspace scope，并通过 neutral memory service 暴露。

验收：

```text
ProjectStandardsPage 不 import providerSessionClient
AgentArtifactResultCards 从 AgentOutputService 读取 artifact
普通聊天 runtime 删除后 artifact 页面仍可工作
```

### 可以直接删除的旧概念

这些概念在统一 SDK Agent Chat 中没有等价物：

- app-server binary discovery。
- app-server managed endpoint。
- app-server process status/log/prewarm。
- app-server config distribution。
- app-server hub。
- provider-session lease。
- provider-session provisional conversation endpoint。
- provider-session session 作为新聊天会话模型。
- `app-server` provider protocol。

### 需要保留但改名/换层的概念

- provider home：改为 SDK runtime home hint，不再叫 app-server home。
- provider session id：只作为某些 SDK 的 provider-native resume token 或 legacy migration 字段，不作为统一会话概念。
- provider catalog/capabilities：改为 runtime/capability/service 层，不挂 provider-session。
- run profile/permissions/sandbox：作为 `AgentChatRunProfileOptions` 和 SDK capability 保留。
- MCP/tool status：作为 `AgentChatNotification` / capability 保留。
- telemetry/debug：作为 diagnostics service，可选保留。

## 模块职责

### `packages/core/src/agent/chat`

拥有：

- neutral chat protocol。
- runtime reducer。
- pending server requests。
- notification dispatch。
- thread item/view helpers。

不得依赖：

- React。
- Electron。
- browser APIs。
- app-server clients。
- Codex/Mova/Claude SDK。

### `apps/frontend/src/features/agent`

拥有：

- Agent UI composition。
- AgentProfile projection。
- React hooks orchestration。
- ConversationRegistry store。
- settings UI。
- provider switching UX。

不得依赖：

- app-server infrastructure。
- provider-session HTTP client for normal chat。
- provider-specific SDK packages。

### `apps/frontend/src/shared/infrastructure/sdk-runtime`

拥有：

- renderer-side SDK runtime protocol types。
- `SdkRuntimeClient`。
- `createSdkRuntimeChatDataSource`。

不得拥有：

- Electron Node implementation。
- app-server compatibility。
- UI state。

### `apps/frontend/electron/services`

拥有：

- SDK runtime handler implementation。
- SDK package resolver。
- runtime account resolver。
- runtime thread repository。
- runtime stream adapter。
- mapping from SDK native messages to neutral chat items。
- mapping from SDK native stream events to neutral chat notifications。

不得拥有：

- React state。
- Agent settings UI decisions。
- app-server config materialization。

## 数据隔离规则

### Provider identity

Provider identity 至少包含：

```ts
{
  provider: provider.kind,
  providerId: provider.id,
  providerInstanceId: provider.runtime.id
}
```

所有 registry query、thread scope key、subscription filter 都必须包含 provider identity。

### Thread scope

Thread scope key 不能只用 provider kind。应包含：

```text
provider.kind + provider.id + provider.runtime.id
```

这样用户切换 SDK package 或 runtime profile 时，不会把不同 runtime 的 thread 混在一起。

### Workspace context

Workspace context 表达这个 thread 属于 global/project/production 哪个范围。

规则：

- `workspaceContext` 可以参与 start/resume/startTurn。
- `workspaceContext` 不参与 provider identity。
- 同一个 provider thread 可以有 cwd/execution settings；打开历史 thread 时以 provider thread 的 settings 为准。

## Server request 与权限

SDK adapter 必须把 provider 原生请求转成 `AgentChatServerRequest`：

- command approval。
- file change approval。
- permissions request。
- user input request。
- elicitation。
- account refresh。
- dynamic tool result request。

规则：

- request 必须带足够的 `threadId` / `turnId` / `itemId` / provider request id。
- 如果 SDK 不提供可执行 ID，只能展示为不可操作请求，不能伪造 approve path。
- response 必须经由 data source/server request handler 回到 runtime host。

## 错误与 readiness

Readiness 分层：

```text
Agent enabled
Runtime contract known
SDK package loadable
SDK package exports valid
Runtime account configured
Model selection valid for provider
Thread operation probe optional
```

错误分类：

- `runtime_unavailable`
- `package_missing`
- `package_contract_invalid`
- `account_missing`
- `model_unavailable`
- `provider_thread_not_found`
- `turn_failed`
- `subscription_unavailable`

UI 只展示分类后的错误，不解析低层 exception 字符串。

Capability-limited provider 规则：

- 如果某个 SDK 不支持 thread list，runtime host 可以用 local thread repository 返回本地 index。
- 如果某个 SDK 不支持读取完整历史，`readThread` 必须返回明确的 `itemsView` / completeness 信息，UI 不能假装历史完整。
- 如果某个 SDK 不支持 server request response，request 必须显示为只读或不可操作。
- capability fallback 必须由 runtime contract/probe 表达，不能由 UI 根据 provider 名称硬编码。

## 迁移计划

### 阶段 1：冻结旧路径

- 加边界测试，禁止 `features/agent` 新增 app-server/provider-session 普通聊天依赖。
- 在架构文档中明确 app-server 为 legacy。
- 保留旧文件，但不允许新增功能使用。

验收：

```text
features/agent normal chat imports createAgentChatDataSourceForProvider
features/agent normal chat does not import app-server runtime clients
```

### 阶段 2：抽出 AgentRuntimeAccountResolver

- 从 app-server config distribution 中提取账号解析规则。
- 同时拆出 endpoint profile 解析，输出 `modelEndpointBaseURL`，不再输出裸 `baseURL`。
- 新模块不写 `config.toml` / `auth.json`。
- SDK runtime handler 只调用 account resolver，不直接读 workspace provider auth。

验收：

```text
sdkRuntimeDefaultHandlers no longer imports appServerConfigDistribution
account resolver tests cover backend session, env, workspace provider auth, none
account resolver tests cover openai_responses, openai_chat_completions, anthropic_messages
```

### 阶段 3：拆分 SDK runtime host

- 拆出 package resolver。
- 拆出 account resolver。
- 拆出 runtime home resolver。
- 拆出 SDK-specific config injector。
- 拆出 stream adapter / notification mapper。
- 拆出 thread repository。
- 保留 RPC contract。

验收：

```text
handler file mainly dispatches RPC methods
package/account/thread/message mapping each has focused tests
Codex/Mova/Claude injection mapper tests cover env, endpoint, model, cwd/resume
SDK stream adapter tests cover started/delta/completed/failed/interrupted ordering
```

### 阶段 4：ProviderConfig 去 app-server 化

- 删除 `AppServerProfile` 字段。
- 删除 app-server protocol/runtime 判断。
- 旧 persisted provider settings 中 app-server 字段不参与运行时解析，不写回。

验收：

```text
ProviderConfig has no appServerProfile
providerConfigStore has no providerSupportsAppServerRuntime
provider settings migration keeps Codex/Mova/Claude usable
```

### 阶段 5：ConversationRegistry 中立化

- 新 SDK conversation 不再写 provider-session fields。
- Thread summary 类型迁到 core neutral 类型。
- 打开历史 thread 根据 record provider identity 选择 data source。
- shell/container 从 active registry record 解析 provider；没有 active record 时才使用 new conversation provider。

验收：

```text
new SDK conversations contain provider/providerId/providerInstanceId/providerThreadId
new SDK conversations do not write providerSessionId/providerSessionTreeId/sessionId
historical Codex thread opens with Codex even when current provider is Claude
sending in historical Codex thread goes to Codex even when current provider is Claude
```

### 阶段 6：模型选择 per provider/runtime

- `modelId` 迁到 provider-scoped map；`modelId` 旧字段只读迁移到当前 active provider 后归零。
- 当前落地使用 `modelIdByProviderProfile` 和 `agentSettingsModelSelectionPatch`；普通 SDK Chat、旧 composer 辅助入口、设置页模型操作都不再直接写全局 `modelId`。
- selector 支持 provider fallback；runtimeApi fallback 仅在同一 provider 拆出多个 runtime profile 时再补。
- 设置页只清理当前 provider 的无效模型。

验收：

```text
Codex selected model does not affect Claude selected model
switch provider preserves each provider's previous model choice
legacy global modelId is normalized into modelIdByProviderProfile and not written back
composer and settings handlers do not write updateSettings({ modelId })
```

### 阶段 7：Skill index 与 provider-native 目录

- 抽出 `AgentSkillIndexService`，统一索引 builtin/global/project/plugin/mcp/team Skill source 和当前 `cwd` 的 provider-native Skill 目录。
- `ProviderCatalogSkill` / `ProviderCatalogConfigFile` 从 provider-session 类型来源迁到 core neutral contract。
- Settings 页面不再通过 provider-session `inspect()` 获取 skill catalog。
- `projectPluginStore` 拆成 project plugin declaration/lock 与 provider target 物化两部分；`.agents` 记录来源和锁，`.codex` / `.claude` / `.mova` 才是 SDK 消费目录。
- SDK runtime startTurn 传正确 `cwd` 和 provider home，让 SDK 按原生规则读取 Skill；index/probe 只用于 UI 与诊断。
- 删除 `saveSkillInstructions` 旧入口，Skill 内容修改走 provider-native global/project source 管理。

验收：

```text
agentSettingsKeys.skillCatalog does not include provider-session baseURL
Agent Settings skill components do not import providerSessionClient types
project plugin install records source/lock under .agents and materializes enabled skills to the selected provider target
Codex/Mova/Claude read skills from cwd provider-native dirs plus their global home
app-server skills/list is not used by normal Chat or Settings
```

### 阶段 8：UI 删除 app-server surface

- 删除 app-server lifecycle panel。
- 删除 app-server realtime log panel。
- 删除 config distribution UI。
- Console 只展示 SDK runtime/account/model readiness。

验收：

```text
Agent Console has no app-server process controls
AgentsPage has no app-server lifecycle controls
```

### 阶段 9：删除 app-server infrastructure

删除 renderer/electron/release/test 中仅服务 app-server 的代码。保留 backend API 和 SDK runtime。

验收搜索：

```bash
rg "app-server|AppServer|ensureAppServer|distributeAppServerConfig|providerSupportsAppServerRuntime" apps/frontend packages/core scripts tests
```

只允许：

- migration tests。
- historical docs/changelog。
- third-party source text。

## 测试计划

### Unit tests

- Provider settings normalization ignores legacy app-server fields。
- Agent profile projection only exposes SDK profiles。
- Runtime contract rejects unsupported provider/runtime pair。
- Account resolver handles all credential sources。
- Account resolver separates backendBaseURL/backendApiBaseURL/modelEndpointBaseURL。
- Endpoint resolver selects by runtimeApi + apiKind and does not infer Anthropic from `/v1` string shape。
- SDK stream event mapper preserves stable turnId/itemId across delta and completion。
- Notification dispatcher merges streaming delta with final item without duplicate assistant text。
- Model selection is provider-scoped。
- Conversation id includes provider identity。
- Legacy conversation records can be read but new records do not write legacy fields。

### Integration tests

- Codex runtime probe success/failure。
- Mova runtime probe success/failure。
- Claude runtime probe success/failure。
- New thread creates provider-scoped registry record。
- Opening historical thread uses historical provider.
- Switching current Agent creates new thread on new provider.
- Missing credentials produces readiness action, not crash。
- Streaming turn shows first assistant delta before `turn/start` request resolves。
- Interrupting an active streaming turn stops the provider stream or returns capability-limited unsupported state。

### Contract tests

- `AgentChatDataSource` supports required operations for all built-in runtimes。
- `SdkRuntimeRpcMethod` required method list matches runtime contracts。
- Renderer SDK runtime client forwards all required methods。
- Runtime host subscriptions filter by runtime/provider/thread。
- Runtime host preserves notification order per runtime/provider/thread subscription。

### Boundary tests

- `features/agent` normal chat does not import app-server infrastructure。
- `packages/core/src/agent/chat` does not import frontend/electron/provider SDK modules。
- Electron runtime host does not import React stores。
- Account resolver does not write app-server files。
- Renderer storage does not persist API keys or provider tokens。
- Active thread provider takes precedence over selected new-conversation provider。

## 关键不变量

- UI 永远不直接调用 provider SDK。
- 普通 Agent Chat 永远不启动 app-server。
- 新会话使用当前 provider。
- 历史会话使用创建它的 provider。
- Provider 切换不迁移历史 thread。
- Account resolver 是 SDK runtime 鉴权的唯一入口。
- 模型 endpoint 解析必须按 `runtimeApi/apiKind/provider lane`，不能复用产品后端 API URL 字段。
- 流式输出只通过 SDK runtime notification stream 更新 UI；renderer 不直接消费 provider SDK 原生 stream。
- `turn/completed` 是最终权威状态，delta 只是临时投影。
- Provider runtime readiness 使用 contract/probe，不使用 UI 特判。
- 模型选择按 provider/runtime 隔离；legacy global modelId 不再作为普通 SDK Chat 的长期来源。
- Conversation registry 是索引，不是 canonical message store。
- Legacy provider-session 字段只能读迁移，不能写新数据。

## 反模式

禁止：

- 在组件中根据 `provider.kind` 直接调用 SDK。
- 在 UI 中解析 SDK exception 字符串决定状态。
- 把 app-server lifecycle 作为 Agent readiness。
- 把 provider 选择和模型 catalog/route 治理混在一起。
- 用当前 provider 打开历史 provider thread。
- 用一个全局 `modelId` 驱动所有 provider。
- 在 account resolver 中写 app-server auth/config 文件。
- 在 core chat protocol 中引入 Electron 或 provider SDK 类型。

## 审阅清单

每次相关重构合并前，需要逐项检查：

- 是否仍然只有一个普通聊天入口：`AgentChatDataSource`。
- 是否仍然只有一个 SDK runtime 账号解析入口。
- 是否新增了 app-server/provider-session 依赖。
- 是否破坏历史 thread 的 provider 绑定。
- 是否把 provider/runtime 细节暴露到了用户默认管理面。
- 是否把模型选择写成全局单值。
- 是否把 backend provider/catalog/route 治理放进了桌面 Agent Console。
- 是否把 `backendBaseURL`、`backendApiBaseURL`、`modelEndpointBaseURL` 混成了一个字段。
- 是否按 `apiKind` 做 endpoint 解析，而不是按 URL 字符串猜协议。
- 是否有测试证明 Codex/Mova/Claude 三个 provider 的切换和历史恢复。
- 是否有测试证明历史会话继续发送时不会跑到当前新会话 provider。
- 是否有测试证明 renderer 不持久化明文 secret。

## 设计自审记录

### 第一轮：目标收敛

确认本文不是多 Agent 编排设计。删除 RunCoordinator、AgentRouter、delegation 等不必要方向，把目标收敛到“单用户、多 provider/runtime 可切换的统一 Agent Chat”。

### 第二轮：app-server 去留

明确 app-server 不再承担普通聊天、鉴权、配置分发、健康检查或会话路径。同时保留 MovScript backend API、backend auth、model gateway 和 SDK runtime host，避免误删后端能力。

### 第三轮：历史会话稳定性

补充 `ActiveProvider` 与 `ActiveThread` 的区别。当前选中 Agent 只影响新会话，历史会话必须按 registry record 的 provider identity 恢复和继续发送。

### 第四轮：安全边界

补充 renderer 不保存明文 secret、account resolver 在 Electron 侧解析、probe/debug 必须 redaction。`ProviderRuntimeProfile` 保存 env var names，不保存 env secret values。

### 第五轮：SDK 能力差异

补充 capability-limited provider 规则。不同 SDK 对 list/read/resume/server request 的能力可能不同，fallback 必须由 runtime contract/probe 表达，不能由 UI provider-name 特判。

### 第六轮：BaseURL 边界

补充 `backendBaseURL`、`backendApiBaseURL`、`modelEndpointBaseURL` 三层概念。确认“按模型协议族解析 endpoint”是正确方向，但粒度应是 provider lane / endpoint profile，不是每个模型手写 URL，也不是把所有 `apiKind` 都压到 `${backend}/v1`。

## 目标完成定义

当以下条件全部成立时，可以认为统一 Agent Chat 重构完成：

- Codex/Mova/Claude 都通过 SDK runtime 运行。
- 普通 Agent Chat 无 app-server 启动、配置分发、JSON-RPC、日志面板。
- Agent UI 只依赖 `AgentChatDataSource`。
- Provider 切换只影响新会话。
- 历史会话按 provider identity 恢复。
- 历史会话继续发送按 active thread provider 执行。
- Runtime/account/model readiness 都是结构化状态。
- 模型选择按 provider/runtime 隔离。
- Renderer 不持久化明文 provider secret。
- Legacy provider-session 字段只读迁移；SDK 新会话不再写 providerSessionId/providerSessionTreeId/sessionId。
- app-server infrastructure 的调用点清零。
- 边界测试和核心 runtime contract tests 通过。
