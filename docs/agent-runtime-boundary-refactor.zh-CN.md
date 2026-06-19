# Agent Runtime 边界重构规范

本文用于规范 MovScript Agent 会话管理、消息展示、数据源、runtime host、app-server、SDK adapter、provider-session 相关模块的边界。它不是一份“删除 app-server”的迁移文档；相反，本文明确承认 app-server 是 Codex/Mova 当前不可替代的一等 runtime backend，因为 codex-sdk 暴露的语义不足以覆盖完整产品需求。

本文面向后续重构、代码评审和验收。新增 Agent 相关代码时，应优先遵守本文；已有代码可以分阶段迁移，但不得继续扩大当前混杂边界。

## 结论

目标架构不是“SDK runtime 唯一路径”，而是“统一 Agent Chat 端口 + 多 runtime backend”：

```text
Frontend Agent UI
  -> Agent Feature Application
  -> AgentChatDataSource
  -> AgentRuntimeClient
  -> Electron AgentRuntimeHost
  -> RuntimeBackend
       -> AppServerRuntimeBackend
       -> SdkRuntimeBackend
  -> ProviderProtocolAdapter
       -> codex app-server JSON-RPC
       -> mova app-server JSON-RPC
       -> codex SDK
       -> mova SDK
       -> claude SDK
  -> Provider native execution
```

核心原则：

- `app-server` 是一等 `RuntimeBackend`，不是待删除的二等兼容路径。
- `SDK` 也是一等 `RuntimeBackend`，但能力按 contract 显式声明，不能假装和 app-server 等价。
- UI 只能依赖 `AgentChatDataSource` 和中立 view model，不能依赖 app-server、Codex、Mova、Claude 的私有协议。
- Electron host 负责 runtime backend 路由、账号解析、进程/SDK 生命周期、provider protocol mapping。
- local conversation registry 只是本地索引和打开状态，不是 provider canonical history。
- provider thread、provider session、local conversation、runtime process/session 必须分开命名。
- 消息展示必须收敛到中立 item/render contract；provider-native event 只能在 adapter 边界被翻译。

## 当前事实

当前代码已经有一些正确方向，但命名和层级没有诚实表达真实架构：

- `packages/core/src/agent/chat/agentChatProtocol.ts` 定义了中立 `AgentChatDataSource`，这是正确的 UI 端口。
- `apps/frontend/src/features/agent/application/agentChatDataSourceFactory.ts` 已经通过 provider/runtime contract 创建 data source。
- `apps/frontend/src/shared/infrastructure/sdk-runtime/sdkRuntimeChatDataSource.ts` 把 data source 操作转成 runtime RPC。
- `apps/frontend/electron/services/sdkRuntimeHost.ts` 注册 runtime handler，但同时接受 `sdk-client` 和 `app-server`。
- `apps/frontend/electron/services/appServerRuntimeHandler.ts` 已经把 app-server 包装成 runtime handler，说明 app-server 实际仍在承担普通 Agent Chat 语义。
- `apps/frontend/src/shared/infrastructure/providerConfigDefaults.ts` 默认 Codex/Mova runtime 仍是 `codex-app-server` / `mova-app-server`。
- `AgentChatDataSourceShell` 当前承担 data source loading、conversation registry、thread lifecycle、server request、composer、viewport、tabs 和 presentation glue，壳层过厚。
- `AgentSessionStore` 当前混合了 conversation registry、workspace draft、page task、runtime state、provider-thread binding、provider-session id、standalone task，缺少明确子领域边界。
- 消息展示同时存在 `AgentChatThreadItem` 新链路和 timeline/transcript/run interaction projection 旧链路。

因此问题不是“没有抽象”，而是：

- 一些抽象名字不准确，例如 `sdkRuntime*` 实际覆盖 app-server。
- 一些一等概念没有被提升命名，例如 `RuntimeBackend`。
- 一些历史概念被继续复用，例如 `provider-session` 既指 app-server session，又被当作泛化 runtime session。
- 一些组件承担了过多应用编排职责。

## 非目标

本次边界重构不应做以下事情：

- 不以删除 app-server 为目标。
- 不要求 Codex/Mova 立即切换到 SDK backend。
- 不把 app-server 能力降级成临时兼容层。
- 不把 provider native protocol 泄漏到 React 组件。
- 不让 renderer 直接持有 API key、auth token、provider auth json 明文。
- 不让 local conversation registry 成为跨 provider 的 canonical transcript store。
- 不用一次重构完成所有迁移；可以分阶段，但新增代码必须朝目标边界移动。

## 术语表

### Agent

用户可见的助手身份，例如 Codex、Mova、Claude Code。

Agent 负责回答“用户当前在和谁工作”。Agent 不等于 SDK 包、app-server 进程、provider session 或模型路由。

### Provider

能力提供方或产品内置助手类型，例如 `codex`、`mova`、`claude`。

Provider 负责回答“这个 Agent 属于哪类能力生态”。Provider 不负责表达具体连接方式。

### RuntimeBackend

实际执行 Agent turn 的运行时后端。内置 backend 包括：

- `codex-app-server`
- `mova-app-server`
- `codex-sdk`
- `mova-sdk`
- `claude-sdk`

RuntimeBackend 负责回答“这次 thread/turn 由哪种执行后端处理”。

### ProviderProtocolAdapter

把 RuntimeBackend 的 native protocol 翻译成中立 Agent Chat protocol 的适配层。

示例：

- app-server JSON-RPC thread/turn/notification/server request -> `AgentChatThread` / `AgentChatTurn` / `AgentChatNotification`
- SDK async iterator / response object -> `AgentChatThreadItem` / notification

### AgentChatDataSource

renderer feature 使用的唯一普通聊天端口。它是 UI 与 runtime execution 的边界。

### AgentRuntimeClient

renderer 到 Electron host 的 RPC client。它只传递中立 runtime request，不包含 provider-specific 业务逻辑。

当前代码中 `SdkRuntimeClient` 应逐步改名或包裹为 `AgentRuntimeClient`。

### AgentRuntimeHost

Electron 侧 runtime router。它负责接收 renderer request，选择 backend handler，管理 subscriptions/server requests，并保证 account、process、SDK package、thread repository 都在 Node/Electron 边界内完成。

当前代码中 `sdkRuntimeHost.ts` 应逐步改名或包裹为 `agentRuntimeHost.ts`。

### AppServerRuntimeBackend

以本地 app-server 子进程为执行后端的 runtime backend。

它负责 app-server binary discovery、process lifecycle、stdio JSON-RPC、initialize、request/response、notification/server request bridging、app-server native result normalization。

它不负责 React 状态、UI 文案、settings 表单、conversation registry、Admin provider/catalog/route 治理。

### SdkRuntimeBackend

以 provider SDK 包为执行后端的 runtime backend。

它负责 SDK package resolution、contract probe、SDK constructor/query 调用、SDK event mapping、SDK 能力缺失时的最小 thread repository fallback。

它不负责模拟 app-server 未暴露的全部语义，除非 contract 明确声明已实现。

### ProviderSession

ProviderSession 只允许表示 app-server/native runtime 的 session tree 或旧 provider-session HTTP 体系中的 session 概念。

禁止把 ProviderSession 当作“任何 Agent 会话”的泛称。普通 UI 语境应使用：

- `conversation`：本地 UI 索引和打开状态。
- `thread`：provider/runtime 中的对话线程。
- `turn`：一次用户输入到 agent 输出的执行轮次。
- `runtimeBackend`：执行后端。
- `providerSessionTreeId`：app-server session/tree 语义存在时的可选绑定。

## 分层规范

### L0 Core Neutral Contracts

位置：

- `packages/core/src/agent/chat`
- `packages/core/src/agent/*Protocol.ts`
- `packages/core/src/agent/sessionRegistry.ts`

职责：

- 定义中立协议和纯函数。
- 定义 `AgentChatThread`、`AgentChatTurn`、`AgentChatThreadItem`、`AgentChatNotification`、`AgentChatServerRequest`。
- 定义 local conversation registry 纯数据结构和 selector。
- 定义消息 item view helper、server request model、notification dispatcher 等纯逻辑。

禁止：

- import React。
- import Electron。
- import browser API。
- import provider-session HTTP client。
- import app-server client。
- import provider SDK。
- 读取文件系统、环境变量、localStorage。
- 保存 runtime process handle 或 SDK thread handle。

### L1 Product Profile And Settings Model

位置：

- `apps/frontend/src/features/agent/application/agentProfileModel.ts`
- `apps/frontend/src/shared/infrastructure/providerConfigStore.ts`
- 后续建议新增 `agentRuntimeProfileStore.ts` 或 `agentRuntimeBackendConfig.ts`

职责：

- 把用户可见 Agent、provider identity、runtime backend 选择、默认模型选择拆开。
- 输出 `AgentProfile` 给 Agent 列表、Console、Settings 页面。
- 保存非敏感设置，例如当前 Agent、runtime backend id、model selection、account mode、env var name。

禁止：

- 保存明文 API key。
- 保存 provider SDK runtime handle。
- 保存 app-server process state。
- 把 app-server executable path 当成 AgentProfile 的默认展示字段。
- 把模型路由治理混入 Agent 身份。

### L2 Frontend Agent Application

位置：

- `apps/frontend/src/features/agent/application`

职责：

- 组合 data source。
- 协调 thread list、thread bootstrap、turn controls、server request、conversation registry、tabs、workspace draft。
- 调用 `AgentChatDataSource`，不直接调用 provider-native API。
- 处理 product workflow，例如 project agent mode、page task intake、cross-page notifications。

允许：

- import `@movscript/core/agent/chat`。
- import `createAgentChatDataSourceForProvider`。
- import state store。
- import frontend infrastructure 的 client factory。

禁止：

- 直接 import app-server runtime handler。
- 直接 import provider SDK。
- 普通 chat send path 直接 import `providerSessionClient`。
- 把 provider-native event 作为 UI 状态保存。

### L3 Frontend Presentation And Components

位置：

- `apps/frontend/src/features/agent/components`
- `apps/frontend/src/features/agent/presentation`

职责：

- 渲染中立 view model。
- 管理组件内部交互状态。
- 提供 render window、layout、tabs、composer UI。

禁止：

- provider-specific branch，例如 `if provider === 'codex'` 决定消息结构。
- import provider-session HTTP client。
- import Electron service。
- 解析 app-server JSON-RPC payload。
- 把 provider-native message 当作 component props。

允许的 provider 差异：

- 仅在 profile label、icon、readiness summary、capability badge 等产品展示层做差异。
- 这些差异必须来自 `AgentProfile` / capability summary，不从 native payload 推断。

### L4 AgentChatDataSource Port

位置：

- `packages/core/src/agent/chat/agentChatProtocol.ts`

职责：

- 作为普通 chat 的唯一端口。
- 提供 thread list/read/start/resume/update/archive/delete。
- 提供 turn start/steer/interrupt。
- 提供 server request subscription 和 notification subscription。
- 暴露中立 capabilities。

不负责：

- 解析 API key。
- 启动 app-server。
- 加载 SDK package。
- 管理 provider catalog/route。
- 维护完整 canonical transcript。
- 决定 UI 如何布局。

规则：

- 新普通聊天入口必须依赖 `AgentChatDataSource`。
- `AgentChatDataSource` 可以由 app-server backend 或 SDK backend 提供。
- UI 不应知道 data source 背后是哪种 backend，除非展示 readiness/capability。

### L5 AgentRuntimeClient

当前位置：

- `apps/frontend/src/shared/infrastructure/sdk-runtime/electronSdkRuntimeClient.ts`
- `apps/frontend/src/shared/infrastructure/sdk-runtime/sdkRuntimeProtocol.ts`

目标位置建议：

- `apps/frontend/src/shared/infrastructure/agent-runtime/electronAgentRuntimeClient.ts`
- `apps/frontend/src/shared/infrastructure/agent-runtime/agentRuntimeProtocol.ts`

职责：

- renderer 到 Electron host 的 typed RPC。
- request/notify/subscribe。
- 不做 provider-specific mapping。
- 不做 account resolution。
- 不做 process lifecycle。

改名策略：

- 保留 `sdk-runtime` 兼容 export 一段时间。
- 新代码使用 `agent-runtime` 命名。
- `SdkRuntimeRpcMethod` 过渡为 `AgentRuntimeRpcMethod`。
- `SdkRuntimeClient` 过渡为 `AgentRuntimeClient`。

### L6 Electron AgentRuntimeHost

当前位置：

- `apps/frontend/electron/services/sdkRuntimeHost.ts`

目标位置建议：

- `apps/frontend/electron/services/agent-runtime/agentRuntimeHost.ts`

职责：

- 注册 runtime backend handler。
- 校验 runtime backend 支持 provider kind。
- 路由 request 到 handler。
- 管理 subscriptions。
- 管理 server request pending/response。
- 发布中立 notification。

禁止：

- 保存 React/UI 状态。
- 写 browser storage。
- 知道具体组件或 route。
- 直接拼接 UI 文案。

命名要求：

- 如果 host 同时支持 app-server 和 SDK，文件、类型、日志必须叫 `agentRuntime*`，不能继续只叫 `sdkRuntime*`。
- 如果保留旧名称作为兼容层，文档和注释必须说明它是 `AgentRuntime` 的旧名。

### L7 RuntimeBackend

RuntimeBackend 是 Electron host 内部的执行后端接口。

目标接口建议：

```ts
interface AgentRuntimeBackend {
  id: string
  api: AgentRuntimeBackendApi
  transport: 'app-server' | 'sdk'
  providerKinds: string[]
  supportedMethods: AgentRuntimeRpcMethod[]
  request<M extends AgentRuntimeRpcMethod>(
    input: AgentRuntimeRequestInput<M>,
  ): Promise<AgentRuntimeRequestResult<M>>
}
```

RuntimeBackend 负责：

- runtime-specific readiness。
- runtime-specific capabilities。
- runtime-specific account consumption。
- runtime-specific thread creation/resume/read/list。
- runtime-specific turn execution。
- native event -> neutral notification。

RuntimeBackend 不负责：

- React orchestration。
- local conversation registry。
- global product settings UI。
- Admin route/provider/model governance。

### L8 ProviderProtocolAdapter

ProviderProtocolAdapter 是 backend 内部的 protocol mapper。

示例：

- `codexAppServerJsonRpcAdapter`
- `movaAppServerJsonRpcAdapter`
- `codexSdkMessageAdapter`
- `movaSdkMessageAdapter`
- `claudeSdkStreamAdapter`

职责：

- native request params mapping。
- native result normalization。
- native event/notification mapping。
- native server request mapping。
- provider-specific capability gap handling。

禁止：

- 修改 React state。
- 访问 localStorage。
- 读取 Agent settings store。
- 直接决定 UI render。

### L9 Persistence And Indexes

Persistence 必须拆成不同职责，不再塞进一个 `AgentSessionStore` 概念里。

#### AgentConversationRegistry

位置：

- `packages/core/src/agent/sessionRegistry.ts`
- `apps/frontend/src/features/agent/state/agentSessionStore.ts` 当前持久化实现

职责：

- 本地 UI conversation 索引。
- active/open/archived/deckOrder。
- provider identity + provider thread id 绑定。
- title/status/project/cwd summary。

不负责：

- canonical transcript。
- provider session lifecycle。
- runtime process lifecycle。
- page task 队列。
- SDK thread handle。

#### AgentConversationWorkspaceDraft

职责：

- 保存 composer draft。
- 保存附件草稿。
- 保存 workspace context。

不负责：

- thread canonical metadata。
- provider execution state。

#### AgentThreadBinding

职责：

- 连接 local conversation id 和 provider thread id。
- 可选保存 provider session tree id。
- 可选保存 providerThreadCwd。
- 保存绑定更新时间。

规则：

- `providerThreadId` 必填。
- `providerSessionTreeId` 只在 app-server/native session tree 存在时出现。
- 不能把 `sessionId` 裸字段继续扩散。

#### AgentRuntimeThreadRepository

位置：

- 当前 `apps/frontend/electron/services/sdkRuntimeThreadRepository.ts`
- 目标 `apps/frontend/electron/services/agent-runtime/agentRuntimeThreadRepository.ts`

职责：

- Electron runtime host 内部 thread handle/index。
- provider SDK 不提供 list/read 时，提供最小 UI 恢复数据。
- 保存 providerThread handle metadata。

不负责：

- 跨 provider 共享 history。
- 替代 app-server canonical history。
- 暴露 provider-session HTTP 语义。

#### ProviderSessionWorkspaceIndex

位置：

- 当前 `apps/frontend/electron/services/providerSessionWorkspace.ts`

职责：

- app-server/provider-session workspace 记录索引。
- 用于诊断、迁移、历史发现、兼容工具。

不负责：

- 普通 unified chat 的 canonical local conversation registry。
- 普通 renderer send path。

#### AgentPageTaskQueue

职责：

- 页面发起的 agent task intake。
- requestId、taskType、projectId、pending/running/settled。

不负责：

- conversation registry。
- provider thread canonical metadata。

#### AgentStandaloneTaskState

职责：

- 非 chat tab 的一次性 task 状态。

不负责：

- 普通 chat 会话管理。

## Runtime Backend 能力矩阵

| Backend | 当前重要性 | Canonical history | Process/package | Server request | Tools/permissions | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| `codex-app-server` | 高 | app-server | Electron 子进程 | 应支持 | 应支持 | Codex 当前完整语义来源；不可删除 |
| `mova-app-server` | 高 | app-server | Electron 子进程 | 应支持 | 应支持 | Mova 当前完整语义来源；不可删除 |
| `codex-sdk` | 中 | SDK 或本地 fallback | SDK package | 取决于 SDK | 取决于 SDK | 语义不足时不能作为默认替代 |
| `mova-sdk` | 中 | SDK 或本地 fallback | SDK package | 取决于 SDK | 取决于 SDK | 可作为未来直接 SDK backend |
| `claude-sdk` | 高 | SDK/session token | SDK/binary package | 应支持 | 部分支持 | Claude 当前天然走 SDK |

规则：

- Contract 必须逐项声明能力，不允许用 `available` 代表全部能力等价。
- UI 按 capability 显示和禁用功能，不按 backend 名字猜测。
- app-server backend 和 SDK backend 共享 `AgentChatDataSource`，但不共享 implementation 内部命名。
- SDK backend 如果语义不足，必须返回 structured capability/readiness gap，而不是静默降级。

## app-server 边界

app-server 是一等 backend，承担以下职责：

- binary discovery。
- process spawn/exit/error 管理。
- stdio JSON-RPC initialize。
- request/response correlation。
- app-server native method 调用。
- app-server native notification 订阅和 mapping。
- app-server native server request 转成 `AgentChatServerRequest`。
- account/env/config 注入。
- thread/read/list/start/resume/turn/interrupt 等能力 mapping。

app-server 不承担：

- React state。
- UI tab state。
- local conversation open/closed state。
- model settings UI。
- Agent Profile 展示。
- Admin provider/catalog/route 治理。
- browser storage。

边界规则：

- app-server 进程只能由 Electron service 管理。
- renderer 不能直接 spawn app-server。
- renderer 普通 chat 不能直接调用 app-server JSON-RPC。
- app-server handler 输出必须是中立 `AgentChat*` 类型或 `AgentRuntime*` 类型。
- app-server native `sessionId` 只能在 mapping 层转成 `providerSessionTreeId`，不得继续传播为泛化 `sessionId`。
- app-server readiness 是 runtime backend readiness，不是 AgentProfile 自身状态。
- app-server logs 可以进入 diagnostics，但不能成为普通 message stream。

## SDK backend 边界

SDK backend 承担以下职责：

- package resolution。
- package contract probe。
- SDK constructor/query 调用。
- provider SDK event/response mapping。
- SDK account/env/options injection。
- SDK thread handle/repository fallback。

SDK backend 不承担：

- 伪造 app-server 全量能力。
- 写 app-server config。
- 读取 provider-session HTTP index。
- 暴露 app-server session lifecycle。

规则：

- SDK backend 不能因为 app-server 能做某事就宣称自己也能做。
- SDK backend 不能把本地 fallback repository 伪装成 canonical provider history。
- SDK backend 缺能力时，contract/capability/probe 必须显式返回。
- SDK backend 的 provider message mapping 必须有测试覆盖。

## ProviderConfig 重构目标

当前 `ProviderConfig` 同时承载 provider 身份、protocol/message adapter、runtime profile、package/env/version、app-server executable hints。目标是拆成四类概念。

### AgentProfile

面向用户：

```ts
interface AgentProfile {
  id: string
  label: string
  providerId: string
  runtimeBackendId: string
  enabled: boolean
  current: boolean
  readiness: AgentProfileReadiness
}
```

不保存：

- API key。
- app-server command。
- SDK package path。
- runtime process state。

### ProviderProfile

面向 provider 身份：

```ts
interface ProviderProfile {
  id: string
  kind: 'codex' | 'mova' | 'claude' | (string & {})
  label: string
  enabled: boolean
  defaultRuntimeBackendId: string
}
```

### RuntimeBackendProfile

面向执行后端：

```ts
interface RuntimeBackendProfile {
  id: string
  api: 'codex-app-server' | 'mova-app-server' | 'codex-sdk' | 'mova-sdk' | 'claude-sdk' | (string & {})
  transport: 'app-server' | 'sdk'
  label: string
  providerKinds: string[]
  package?: RuntimePackageProfile
  executable?: RuntimeExecutableProfile
  protocolVersion?: string
}
```

### AgentRuntimeAccountPolicy

面向账号解析：

```ts
interface AgentRuntimeAccountPolicy {
  mode: 'auto' | 'backend' | 'direct' | 'none'
  backendProviderRef?: string
  directCredentialRef?: string
  apiKeyEnvVar?: string
  baseUrlEnvVar?: string
}
```

迁移规则：

- 现有 `ProviderConfig.runtime` 可以短期保留。
- 新代码避免继续增加 `ProviderConfig` 字段。
- 新 runtime 字段应加在 `RuntimeBackendProfile` 或派生 helper 中。
- app-server executable 归属 runtime backend profile，不归属 AgentProfile。
- message adapter 如果仍需存在，应归属 ProviderProtocolAdapter contract，不归属用户可见 provider config。

## Account Resolver 边界

账号解析必须在 Electron/Node 边界完成。

职责：

- 读取 workspace backend session。
- 读取 workspace provider auth config。
- 读取 app settings secret store。
- 读取 runtime env。
- 读取 provider-native auth file metadata。
- 输出 backend 可消费的 account config。
- 输出 masked readiness summary。

不职责：

- React 状态。
- Settings 页面表单。
- app-server process spawn。
- SDK package loading。
- model catalog 查询。

账号模式：

- `auto`：按 provider/backend 默认策略。
- `backend`：必须走 MovScript backend gateway。
- `direct`：必须走 provider direct credential。
- `none`：仅允许无凭证能力，例如本地 dry-run/probe。

Codex/Mova 默认策略：

- 优先 app-server backend。
- 默认优先 MovScript backend session/gateway token。
- 如果用户显式配置 direct，则读取 OpenAI-compatible direct credential。

Claude 默认策略：

- 默认 direct Anthropic/Claude credential。
- 如果未来支持 backend gateway，再通过 account policy 显式打开。

安全规则：

- renderer 永远不接收明文 key。
- logs/probe/errors 必须 redaction。
- 明文 secret 不写入 browser localStorage。
- `AgentRuntimeAccountResolver` 返回给 renderer 的 readiness 只能包含 source、configured、masked env/key name、detail。
- Agent runtime credential UI 只通过 `ElectronAgentRuntimeCredentialSummary.savedProviderKeys` 读取保存状态；真实 `agentRuntimeApiKeys` 只留在 Electron service，`get-settings-secrets` 不向 renderer 返回 Agent runtime API key 明文。

## Model Selection 边界

模型选择必须按 provider/runtime backend 作用域保存。

错误做法：

- 单个全局 `modelId` 长期控制所有 Agent。
- 用 UI 当前 tab 推断 model provider。
- 在 runtime adapter 内部读取 React store。

正确做法：

- `modelIdByProviderProfile` 短期可保留。
- 中期迁移到 `modelSelectionByRuntimeBackend` 或 `modelSelectionByAgentProfile`。
- `AgentChatDataSourceFactory` 可以注入 `resolveModelForRequest`，但不应直接读取 Zustand store。
- backend/app-server/SDK adapter 只消费请求里的 `model` / `modelProvider`。

## Thread And Session 命名规则

以下名字必须严格区分：

| 名称 | 含义 | 是否持久 | 所属层 |
| --- | --- | --- | --- |
| `conversationId` | 本地 UI conversation registry id | 是 | frontend/core registry |
| `providerThreadId` | provider/runtime thread id | 是 | provider/runtime |
| `providerSessionTreeId` | app-server session/tree id，可选 | 是 | app-server backend |
| `runtimeBackendId` | runtime backend profile id | 是 | provider/runtime config |
| `runtimeProcessId` | app-server 子进程或 SDK runtime host 内部 id | 否 | Electron |
| `turnId` | 一次 turn id | 是/视 provider | provider/runtime |
| `requestId` | server request/page task id | 是/临时 | application/runtime |

禁止：

- 新增裸 `sessionId`。
- 把 `providerSessionId` 用作所有 backend 的通用字段。
- 用 `threadId` 同时表示 local conversation id 和 provider thread id。
- 在 route/query/localStorage 中保存 provider-native opaque session 而不带 provider/runtime scope。

过渡规则：

- 读取旧 `sessionId` 时，立即 normalize 到 `providerSessionTreeId`。
- 新 canonical 写入只写 `providerSessionTreeId`；确需兼容旧协议/旧缓存时，可以同步写 deprecated/legacy `sessionId` mirror，但上层读取必须优先 `providerSessionTreeId`。
- `agentConversationIdForRegistryInput` key 必须包含 provider/runtime scope，避免不同 backend thread id 碰撞。

## Message Display 边界

普通 unified chat 的目标链路：

```text
Provider native event/result
  -> ProviderProtocolAdapter
  -> AgentChatThreadItem / AgentChatNotification / AgentChatServerRequest
  -> core chat runtime
  -> visible item window
  -> AgentChatThreadItemView
```

旧 timeline/projection 链路允许继续存在，但必须限定用途：

```text
Provider-session timeline / transcript / run interaction
  -> AgentConversationProjection
  -> AgentProjected* components
```

旧链路适用范围：

- 旧 provider-session history。
- run diagnostics。
- plan/task graph 页面。
- 特定 project agent mode 的迁移期展示。

旧链路不应继续作为普通 unified chat 的主要 message stream。

规则：

- provider-native message 只能在 adapter 层被解析。
- components 只渲染 `AgentChatThreadItem` 或明确的 projection item。
- `AgentChatThreadItemView` 不得依赖 provider kind。
- tool/internal tool display 应先使用中立 tool item，再由 frontend domain classifier 做业务展示。
- server request 卡片是一等 chat state，不是 tool row side effect。
- live activity、status strip、debug panel、message stream 必须使用显式 `surface` 或 item type，不靠 role/kind 猜测。

## AgentChatDataSourceShell 重构边界

当前 `AgentChatDataSourceShell` 是超厚 orchestrator。目标不是删除它，而是把它拆成清晰 controllers。

建议拆分：

```text
AgentChatBoundaryContainer
  - 加载 data source
  - 注入 provider/profile/runtime context

AgentConversationRegistryController
  - local conversation registry
  - active/open/closed/deck order

AgentThreadLifecycleController
  - list/read/bootstrap/resume
  - source thread cache

AgentTurnController
  - send/start/steer/interrupt
  - optimistic user item
  - queued input

AgentServerRequestController
  - request queue
  - persistent pending request
  - response dispatch

AgentComposerController
  - composer text/attachments/drop/paste/draft

AgentThreadViewportController
  - visible window
  - scroll/load older

AgentChatShellView
  - pure render composition
```

拆分规则：

- Controller 可以调用 data source。
- View 不调用 data source。
- View 不读/write persistent store。
- Registry controller 不负责 send turn。
- Turn controller 不负责 route/tab layout。
- Server request controller 不负责 provider-native request mapping。

## Provider-session HTTP Client 边界

`providerSessionClient` 仍可存在，但必须缩小用途。

允许用途：

- app-server/provider-session diagnostics。
- 旧历史迁移。
- telemetry collection。
- run trace/debug 兼容页面。
- provider catalog/config 旧入口过渡。

禁止用途：

- 普通 chat send path。
- 普通 unified chat thread start/read/turn。
- React component 直接调用。
- 新 Settings 页面直接以 provider-session client 作为数据源，除非功能明确是 legacy diagnostics。

迁移方向：

- 能力查询走 `AgentChatDataSource.capabilities`。
- thread/turn 走 `AgentChatDataSource`。
- app-server native 能力由 `AppServerRuntimeBackend` 暴露。
- diagnostics 页面如果必须使用 provider-session client，要在文件名和 UI 文案中明确 legacy/diagnostics。

## Runtime Contract 边界

当前 `ProviderRuntimeApiContract` 可以短期保留，但语义应升级为 `RuntimeBackendContract`。

目标字段：

```ts
interface RuntimeBackendContract {
  api: AgentRuntimeBackendApi
  label: string
  transport: 'app-server' | 'sdk'
  providerKinds: string[]
  lifecycle: {
    process: boolean
    package: boolean
    localHome: boolean
  }
  thread: {
    list: CapabilitySupport
    read: CapabilitySupport
    start: CapabilitySupport
    resume: CapabilitySupport
    archive: CapabilitySupport
    delete: CapabilitySupport
  }
  turn: {
    start: CapabilitySupport
    steer: CapabilitySupport
    interrupt: CapabilitySupport
    stream: CapabilitySupport
  }
  capabilities: {
    serverRequests: CapabilitySupport
    tools: CapabilitySupport
    permissions: CapabilitySupport
    mcp: CapabilitySupport
    skills: CapabilitySupport
    plugins: CapabilitySupport
    config: CapabilitySupport
    account: CapabilitySupport
  }
}

type CapabilitySupport =
  | { support: 'native' }
  | { support: 'adapter' }
  | { support: 'fallback'; limitation: string }
  | { support: 'unsupported'; reason: string }
```

规则：

- `available` 不够表达能力差异。
- app-server 和 SDK 的支持来源必须可见。
- readiness/probe 使用 contract 生成，不在 UI 写 provider 特判。
- contract 不保存 secret。

## Dependency Rules

### Core

Allowed:

- TypeScript types。
- pure helpers。
- JSON-safe domain values。

Forbidden:

- React。
- Electron。
- Node fs/process/env。
- provider-session HTTP client。
- SDK package。
- app-server process。

### Frontend Components

Allowed:

- core neutral types。
- presentation helpers。
- application callbacks。

Forbidden:

- provider-session client。
- Electron service imports。
- SDK/runtime handler imports。
- app-server JSON-RPC types。
- account resolver。

### Frontend Application

Allowed:

- `AgentChatDataSource`。
- data source factory。
- state stores。
- query clients。
- product event bus。

Forbidden:

- provider SDK。
- app-server process lifecycle。
- provider-native protocol parsing。

### Shared Frontend Infrastructure

Allowed:

- Electron preload API client。
- HTTP API clients。
- storage adapters。
- runtime client protocol.

Forbidden:

- React component state。
- provider-native message display logic。

### Electron Services

Allowed:

- Node fs/process/env。
- app-server process lifecycle。
- SDK package loader。
- account resolver。
- provider protocol adapter。

Forbidden:

- React。
- browser localStorage。
- component routes/layout.

## Target Directory Shape

建议目标结构：

```text
packages/core/src/agent/chat/
  agentChatProtocol.ts
  agentChatRuntime.ts
  agentChatThreadItems.ts
  agentChatNotificationDispatcher.ts
  ...

packages/core/src/agent/runtime/
  runtimeBackendContract.ts
  runtimeCapabilityModel.ts
  runtimeReadiness.ts

apps/frontend/src/features/agent/application/
  agentChatDataSourceFactory.ts
  agentChatBoundaryContainer.ts
  agentConversationRegistryController.ts
  agentThreadLifecycleController.ts
  agentTurnController.ts
  agentServerRequestController.ts
  ...

apps/frontend/src/features/agent/presentation/
  agentChatThreadProjectionModel.ts
  agentMessageBubbleModel.ts
  ...

apps/frontend/src/features/agent/components/
  AgentChatShellView.tsx
  agent-chat-items/
  agent-chat-events/
  ...

apps/frontend/src/shared/infrastructure/agent-runtime/
  agentRuntimeProtocol.ts
  electronAgentRuntimeClient.ts
  agentRuntimeChatDataSource.ts

apps/frontend/electron/services/agent-runtime/
  agentRuntimeHost.ts
  runtimeBackendRegistry.ts
  app-server/
    appServerRuntimeBackend.ts
    appServerJsonRpcConnection.ts
    appServerMessageMapper.ts
  sdk/
    sdkRuntimeBackend.ts
    sdkPackageResolver.ts
    codexSdkAdapter.ts
    claudeSdkAdapter.ts
  account/
    agentRuntimeAccountResolver.ts
  thread/
    agentRuntimeThreadRepository.ts
```

过渡期可以保留现有文件名，但新模块应按目标结构命名。当前过渡落点包括：

- `apps/frontend/src/shared/infrastructure/agent-runtime/agentRuntimeProtocol.ts`
- `apps/frontend/src/shared/infrastructure/agent-runtime/electronAgentRuntimeClient.ts`
- `apps/frontend/src/shared/infrastructure/agent-runtime/agentRuntimeChatDataSource.ts`
- `apps/frontend/electron/services/agentRuntimeHost.ts`
- `apps/frontend/electron/services/agentRuntimeDefaultHandlers.ts`
- `apps/frontend/electron/services/appServerRuntimeBackend.ts`
- `apps/frontend/electron/services/sdkRuntimeBackend.ts`

## Migration Plan

### Phase 0: 文档和命名护栏

目标：

- 本文作为规范入口。
- 旧 “SDK runtime 唯一路径” 文档标记为过时或修正。
- 新增边界测试，阻止继续引入明显违规依赖。

动作：

- 新增 lint/rg contract：
  - components 不 import `providerSessionClient`。
  - core 不 import React/Electron/provider-session。
  - ordinary chat send path 不 import provider-session HTTP client。
- 在 README/docs 中说明 app-server 是一等 runtime backend。

验收：

- 搜索 `app-server 废弃` 不再作为当前目标表述。
- 新文档明确 runtime backend model。

### Phase 1: AgentRuntime 命名兼容层

目标：

- 不再让 `sdkRuntime*` 承担 app-server 的唯一命名。

动作：

- 新增 `agent-runtime` wrapper exports。
- `SdkRuntimeClient` alias 到 `AgentRuntimeClient`。
- `sdkRuntimeHost` alias 到 `agentRuntimeHost`。
- app-server handler 从 `agentRuntimeHost` 和 `appServerRuntimeBackend` 入口接入。
- logs 从 `SDK runtime flow` 改为 `Agent runtime flow`，或至少在 app-server path 使用 app-server backend log label。

验收：

- 新代码使用 `agentRuntime*`。
- app-server handler 注册在 `RuntimeBackendRegistry` 语义下。

### Phase 2: RuntimeBackendContract 升级

目标：

- contract 明确 app-server/SDK 能力差异。

动作：

- 从 `ProviderRuntimeApiContract` 派生 `RuntimeBackendContract`。
- 增加 capability support level。
- probe 输出 structured gaps。
- settings/console 使用 contract 渲染 readiness。

当前过渡落点：

- `apps/frontend/src/shared/infrastructure/providerRuntimeApiCatalog.ts` 已把 `RuntimeBackendContract` 升级为带 `RuntimeBackendSupportContract` 的 contract；旧 `thread` / `capabilities` boolean 字段保留为兼容镜像，新 `support.thread.*` / `support.capabilities.*` 提供 `supported`、`level` 和可选 `reason`。
- Claude SDK 的 `config` / `account` gap 已通过 contract support reason 表达，避免 handler 或 UI 按 backend 名称硬猜能力差异。
- `apps/frontend/src/shared/infrastructure/agent-runtime/agentRuntimeProtocol.ts` 的 describe/capabilities response 已携带 `support`，为 Settings/Console/readiness 使用 structured gaps 铺路。
- `apps/frontend/electron/services/agentRuntimeCapabilities.ts` 已成为 capabilities response 的 canonical 实现；`sdkRuntimeCapabilities.ts` 仅保留旧名 re-export，避免 app-server/SDK 共用能力响应继续住在 SDK 命名空间。
- `appServerRuntimeReadiness` 和 `sdkRuntimeDefaultHandlers` 的 `runtime/describe` response 已返回 contract support。
- `AgentProfile` 已把 runtime account support gap 投影为 `credentialHint`；Settings readiness 和 Console credential panel 读取该投影，不再按 `provider.kind` 猜测 Claude/SDK 凭据入口。
- `AgentProfile.runtimeBackend.capabilitySummary` 已从 `RuntimeBackendSupportContract` 派生完整/受限/不可用三态；Settings 状态卡的能力文案读取该 summary，不再用 Catalog/SDK 二分或 backend name 猜能力。
- Console 会话集成面板已改为消费 `AgentProfile`，使用 `runtimeBackend.label` / `runtimeBackend.id` / `routeKey` 展示连接来源，不再由组件直接拼 `provider.kind` 作为 runtime/binding 事实。
- Console 能力 metric 和能力健康 panel 已把 `runtimeBackend.capabilitySummary` 作为 contract support 事实展示，运行 probe 结果只作为健康补充，不再用局部 tool/skill 计数替代 runtime capability contract。
- Console 能力 panel 文案已明确拆成 `Runtime contract` 和 `Probe health` 两层，避免把运行探测计数误写成能力声明。
- Settings 的 readiness/status card 已消费 `selectedAgentProfile.runtimeBackend.capabilitySummary`、`runtimeBackend.label` 和 `credentialHint`；源码契约测试禁止回退到 provider-session catalog/config 直连或 backend name 猜能力。
- Console/Settings 的 diagnostics 入口已收敛为 runtime contract、probe health、Admin 只读治理入口和 provider-session compatibility gateway；不再暴露 standalone advanced diagnostics 页面作为普通 Agent Console 主面。

验收：

- UI 不用 backend name 猜能力。
- Codex SDK 不被误判为等价 app-server。

### Phase 3: ProviderConfig 瘦身

目标：

- 分离 AgentProfile、ProviderProfile、RuntimeBackendProfile、AccountPolicy。

动作：

- 新增 selector/model 层，先不改 storage schema。
- 现有 `ProviderConfig` 只作为 persisted legacy shape。
- 所有 UI 页面消费 `AgentProfile` 或派生 view model。
- runtime handler 消费 `RuntimeBackendProfile`。

当前过渡落点：

- `agentProfileModel.ts` 已输出 `AgentProfile`、`AgentProviderProfile`、`AgentRuntimeBackendProfile` 和 `AgentRuntimeAccountPolicy`，Settings/Console/Agent 列表优先消费这些 projection。
- `AgentsPage` 的列表渲染和激活入口已切到 `AgentProfile`，通过 `commitAgentProfileActivation` 使用 `profile.id` / `profile.enabled` 更新当前 Agent，不再在页面层通过 `profile.provider` 或 provider list 反查 `ProviderConfig`。
- `AgentUnifiedChatShell` 的页面级选择已改为先解析 `AgentProfile`，`ProviderConfig` 只在传入 `AgentRuntimeChatShell` / data source 边界时作为 runtime input 保留。
- `ProjectAgentModeWorkspace` 和 `ProjectAgentContentPanel` 已使用 `AgentProfile.providerProfile` 组装 conversation registry 的 provider identity；页面层不再直接调用 `providerInstanceId(provider)` / `providerProtocol(provider)` 拆解 `ProviderConfig`。
- `commitAgentProviderActivation` 保留为 legacy/provider-shape 兼容入口，内部转调 profile activation 语义。

验收：

- Agent 列表不直接展示 runtime internals。
- runtime executable/package/env 不再被加入 AgentProfile。

### Phase 4: Session Store 拆分

目标：

- conversation registry、draft、task、runtime state、thread binding 分域。

动作：

- 提取 `agentConversationRegistryStore`。
- 提取 `agentConversationDraftStore`。
- 提取 `agentTaskQueueStore`。
- 保留旧 `agentSessionStore` 作为 facade。
- 新代码只用细分 store。

当前过渡落点：

- `apps/frontend/src/features/agent/state/agentConversationRegistryStore.ts` 作为 conversation registry/thread binding 的应用层 facade。
- `apps/frontend/src/features/agent/state/agentConversationRuntimeStore.ts` 作为 conversation runtime state 的应用层 facade。
- `apps/frontend/src/features/agent/state/agentConversationDraftStore.ts` 作为 composer draft/attachments/workspace context 的应用层 facade。
- `apps/frontend/src/features/agent/state/agentTaskQueueStore.ts` 作为 page task queue 的应用层 facade。
- `agentPanelBridge` / page task intake 已支持 `providerSessionTreeId` 优先的 panel event payload；旧 `sessionId` 仅作为 legacy compatibility 输入/输出归一。
- `agentSessionStore.createProviderSessionConversation` 旧 facade 已改为 `providerSessionTreeId` 优先输入，旧 `sessionId` 仅作为 legacy fallback。
- `AgentPageTaskState` 内部字段已从裸 `sessionId` 收敛为 `providerSessionTreeId`；旧 run/thread/panel payload 的 `sessionId` 只作为 legacy 输入，在 `agentSessionTaskState` 入口立即 normalize。
- Agent Terminal 的 React 层使用 `shellId` / `terminalSessionId` 区分本地 shell 与 provider session；只有 Electron local terminal IPC contract 保留 `sessionId` 字段，且不参与 Agent runtime/provider-session 语义。
- `apps/frontend/src/features/agent/application/useAgentChatConversationRegistry.ts` 已改为依赖 registry facade，而不是直接读取完整 `agentSessionStore`。
- `apps/frontend/src/features/agent/application/useAgentChatDraftConversation.ts`、`apps/frontend/src/features/agent/application/useAgentChatShellCoreState.ts`、`apps/frontend/src/features/agent/application/useAgentChatTurnControls.ts` 和 `apps/frontend/src/features/agent/presentation/useAgentComposerController.ts` 已改为依赖 draft facade。
- `apps/frontend/src/features/agent/application/agentPanelBridge.ts` 已改为依赖 task queue facade。
- `apps/frontend/src/features/agent/presentation/useAgentConversationTabProviderSessionStatusLights.ts` 已改为依赖 registry/runtime facades，而不是直接读取完整 `agentSessionStore`。
- `apps/frontend/src/features/agent/presentation/useHasOpenAgentConversations.ts` 已改为依赖 registry facade。
- `application` / `presentation` / `components` / `domain` 非 state 层已不再直接 import 完整 `agentSessionStore`，共享类型改从 `agentSessionRuntimeModel` / `agentSessionTaskModel` 等细分 model 获取。
- `apps/frontend/src/features/agent/components/AgentRuntimeChatShell.tsx`、`AgentsPage.tsx`、`ProjectAgentModeWorkspace.tsx`、`ProjectAgentContentPanel.tsx`、`ProjectAgentModeSidebar.tsx`、`AgentSessionOutputPane.tsx` 已改为依赖 registry/draft/runtime/task facades，不再直接读取完整 `agentSessionStore`。
- 当前 `agentSessionStore` 仍是底层持久化和旧 action 聚合 facade，但业务 application/presentation/components 层不再直接依赖它；测试中保留源码断言防止回退。

验收：

- 新文件不再把 page task 和 conversation registry 混写。
- `providerSessionTreeId` 只存在于 binding、adapter、provider-session compatibility model，不作为普通 Agent 会话 ID 使用。

### Phase 5: AppServerRuntimeBackend 正名

目标：

- app-server 作为独立 backend 模块，而不是 sdk runtime 分支。

动作：

- 移动/包装 `appServerRuntimeHandler.ts`。
- 新增 `appServerRuntimeBackend.ts` 作为 app-server backend 的正式入口。
- 拆分 connection、mapper、params builder、readiness。
- app-server native session mapping 集中到 mapper。

当前过渡落点：

- `apps/frontend/electron/services/appServerRuntimeBackend.ts` 作为 app-server backend 的正式 re-export 入口。
- `apps/frontend/electron/services/appServerRuntimeHandler.ts` 使用 `AgentRuntime*` host、capability 和 config injector 命名；handler 签名使用 `ElectronAgentRuntime*` 合约别名。
- `apps/frontend/electron/services/appServerRuntimeCommand.ts` 已提取 app-server executable/env/npm package binary discovery 和 shell command parsing，handler 只消费解析后的 command。
- `apps/frontend/electron/services/appServerRuntimeConnection.ts` 已提取 app-server 子进程生命周期、stdio JSON-RPC、连接缓存、notification/server request bridging；handler 只消费 `connection.request(...)`。
- `apps/frontend/electron/services/appServerRuntimeContext.ts` 已提取 app-server contract/kind/account/env/config/command 的运行上下文解析。
- `apps/frontend/electron/services/appServerRuntimeReadiness.ts` 已提取 `runtime/probe` 和 `runtime/describe` 的 readiness response 组装。
- `apps/frontend/electron/services/appServerRuntimeParams.ts` 已提取 app-server JSON-RPC params builder 和 execution settings projection；`appServerRuntimeHandler.ts` 不再直接拼接 thread/start、thread/resume、turn/start、turn/steer、thread/settings/update 的 app-server 参数。
- `apps/frontend/electron/services/appServerRuntimeMapper.ts` 已提取 app-server native thread/turn/item/notification -> `AgentChatThread` / `AgentChatTurn` / `AgentChatThreadItem` / `AgentChatNotification` 的中立协议映射。
- `appServerRuntimeMapper` 已把 app-server native `sessionId` normalize 为 `providerSessionTreeId`；旧 `sessionId` 只作为 deprecated compatibility mirror 保留。
- `apps/frontend/electron/services/appServerRuntimeServerRequests.ts` 已提取 app-server native server request -> `AgentChatServerRequest` 以及 renderer response -> app-server result 的映射。
- `apps/frontend/electron/services/agentRuntimeHost.ts` 是 Electron 侧正式 Agent runtime host 实现，负责 handler registry、notification subscription 和 server request broker；`sdkRuntimeHost.ts` 仅作为旧名兼容 re-export。
- `apps/frontend/electron/services/sdkRuntimeBackend.ts` 是 SDK backend 的正式注册/导出入口；`sdkRuntimeDefaultHandlers.ts` 只承载真实 SDK handler 实现，不再注册 app-server backend。
- `apps/frontend/electron/services/agentRuntimeDefaultHandlers.ts` 组合 `appServerRuntimeBackend` 和 `sdkRuntimeBackend`，作为多 backend 默认安装入口；`installDefaultSdkRuntimeHandlers` 仅作为 SDK backend 兼容 alias。
- `apps/frontend/electron/services/agentRuntimeBundledPluginCatalog.ts` 是 runtime 共享 bundled plugin catalog 入口；`sdkRuntimePluginCatalog.ts` 仅作为旧名兼容 re-export，app-server bundled plugin installer 不再 import SDK 命名 catalog。
- `apps/frontend/src/shared/contracts/electronApiSdkRuntime.ts` 已把 `ElectronAgentRuntime*` 作为 canonical contract 类型，`ElectronSdkRuntime*` 仅作为 legacy IPC compatibility alias；app-server/backend 新代码不再从 SDK-only 泛型继承语义。
- `apps/frontend/src/shared/infrastructure/agent-runtime/agentRuntimeProtocol.ts` 已承载 canonical `AgentRuntime*` RPC method、request/response、client/subscription 类型；`sdkRuntimeProtocol.ts` 只 re-export legacy `SdkRuntime*` alias，避免 Agent runtime 协议继续从 SDK 命名反向派生。
- `apps/frontend/src/shared/infrastructure/agent-runtime/agentRuntimeChatDataSource.ts` 已承载 canonical `AgentChatDataSource` runtime adapter 实现；`sdkRuntimeChatDataSource.ts` 只保留旧名转发，避免普通 chat data source 实现继续住在 SDK 命名空间。
- Agent Settings、Console、本地 architecture 文档和 runtime unavailable 文案已从用户可见 “SDK runtime” 调整为中立 runtime/backend 表达；仅真实 SDK backend 和 legacy IPC 兼容路径继续使用 SDK 命名。

验收：

- app-server handler 文件内部不依赖 UI/application。
- app-server native `sessionId` 不直接外溢。

### Phase 6: AgentChatDataSourceShell 拆分

目标：

- 壳层职责清晰。

动作：

- 先提取 pure controller hooks。
- 再拆 view props。
- 最后把 `AgentChatDataSourceShell` 变成 thin composition。

当前过渡落点：

- `AgentChatDataSourceShell.tsx` 已变成 thin composition：调用 `useAgentChatDataSourceShellController`，再把 controller 产物交给 `AgentChatShellView`。
- `apps/frontend/src/features/agent/application/useAgentChatDataSourceShellController.ts` 已集中承接 data source loading、conversation registry、thread bootstrap/lifecycle/runtime effects、server request、panel commands、draft conversation、thread creation、thread tabs、viewport、run profile、turn controls 和 presentation state 的 controller orchestration。
- `AgentChatShellView` 已作为纯渲染组合入口，view 层不直接调用 data source。
- `AgentChatShellView` 的 composer/ref/queued input/drag-paste/workspace lock/model/run profile/server request/send-stop/goal state 相关顶层 props 已收敛为 `composerPanel` view model，避免 composer 和 run controls 领域继续散落在 Shell View 的顶层参数面。
- `AgentChatShellView` 的 history thread list/loading/pagination/endpoint 相关顶层 props 已收敛为 `historyPanel` view model，View 层只消费 `hasMoreThreadPages` 等展示语义，不再直接持有 thread list cursor。
- `AgentChatShellView` 的当前 thread surface 相关顶层 props 已收敛为 `threadSurface` view model，包括 active conversation、tabs、visible items、status shelf、scroll、load-earlier 和 conversation 操作。
- `useAgentChatDataSourceShellController` 已把 `composerPanel` / `historyPanel` / `threadSurface` 的拼装提取为显式 view model builder，controller 主返回体不再内联展开大型展示对象。
- `apps/frontend/src/features/agent/application/agentChatShellViewModels.ts` 已承载 Shell view model builder；controller 只编排 hooks 并调用 builder，不再在同一文件内维护大段 view prop 结构类型。
- 本轮进一步把 Shell 依赖的 registry/draft/task/runtime state 入口迁到细分 facade，减少 Shell/controller 对完整 `agentSessionStore` 的横向依赖。

验收：

- Shell 文件只负责组合，不再拥有 10+ 个领域 controller 的细节。
- View 无 data source 调用。

### Phase 7: Message Display 收敛

目标：

- 普通 chat 只走 `AgentChatThreadItem`。
- 旧 projection 链路限定为 diagnostics/legacy surfaces。

动作：

- 标记每个 projection 使用场景。
- 新普通 chat surface 禁止使用 timeline/transcript projection。
- app-server adapter 补齐 native event -> `AgentChatThreadItem` mapping。
- SDK adapter 补齐 stream event -> notification mapping。

当前过渡落点：

- `apps/frontend/src/features/agent/ARCHITECTURE.md` 已把普通 Agent chat 的 message contract 改为 `AgentChatThreadItem`，并把 timeline/transcript/run interaction projection 限定为 legacy diagnostics、provider-session compatibility、status/process surface。
- `apps/frontend/src/features/agent/domain/agentChatProtocolBoundary.test.ts` 已覆盖 neutral item protocol 和 `AgentChatThreadItemView` 不依赖 provider-native协议。
- SDK handler 流式事件已通过中立 notification/thread item 流转；app-server backend 也走 `AgentRuntime` notification 和 `AgentChatThreadItem` normalize。
- 普通组件/展示层不再直接 import `providerSessionClient`，避免普通 chat render path 回到 provider-session projection。
- 旧 `AgentConversationTabs` 仍需要 transcript 数量时，通过 `agentLegacyConversationTabsModel` 这个明确的 legacy compatibility 入口读取；普通 chat render path 已用源码边界测试禁止 import timeline/transcript projection helper。

验收：

- 普通 chat render tree 入口可追溯到 `AgentChatThreadItemView`。
- provider-session projection 不再参与普通 send/read path。

### Phase 8: Provider-session HTTP Client 收口

目标：

- provider-session client 只服务 legacy diagnostics/migration。

动作：

- 为每个 `providerSessionClient` import 分类。
- 普通 chat 相关 import 改成 data source/capability。
- diagnostics 文件名和 route copy 明确 legacy/runtime diagnostics。

当前过渡落点：

- `components` / `presentation` 层普通 chat 和 message render 入口不再 import `providerSessionClient`。
- `AgentChatDataSourceShell`、`AgentRuntimeChatShell`、`agentChatDataSourceFactory`、chat conversation registry、shell core state、thread creation、turn controls、composer controller、chat item renderer 等普通 chat 路径已有源码测试禁止 `providerSessionClient` 回流。
- `apps/frontend/src/features/agent/infrastructure/agentProviderSessionCompatibility.ts` 已作为 feature-local provider-session compatibility gateway；Agent feature 内非测试源码只有该文件可以直接 import shared `providerSessionClient` / `ProviderSessionClient` / `providerSessionHttpClient` / `provider-session-client` 内部 helper/type。
- telemetry、Control Center、legacy provider-session thread cache、run trace/debug、session output、workspace artifact、plan snapshot、provider activation/settings 兼容服务已通过 gateway 传入明确 owner，例如 `control-center-diagnostics`、`legacy-thread-cache`、`run-trace-diagnostics`、`settings-catalog-compat`。
- provider-session event facts 和 run trace response type 也已通过 gateway re-export；domain/presentation/application 层不再直接依赖 shared HTTP client 内部目录。
- command、health、plan snapshot、run trace 等 provider-session compatibility service 已改为 `providerSessionTreeId` 优先入参，并通过 `agentProviderSessionTreeIdForCompatibilityInput` 统一 normalize；旧 `sessionId` 只作为 legacy fallback。
- provider-session health / plan snapshot 等 query key helper 已把参数命名收敛为 `providerSessionTreeId`，避免 React Query cache 入口继续传播裸 `sessionId`。
- provider-session status light controller 和 conversation tab status light target 已把 presentation-facing target 改为 `providerSessionTreeId`；只在调用 legacy stream client 的 `forSession({ sessionId })` 处做旧协议映射。
- `AgentThread` / `AgentThreadSummary` / `AgentRun` / `AgentTaskGraph` / timeline refs / provider work/interaction 等 core compatibility model 已新增 `providerSessionTreeId`，旧 `sessionId` 标记 deprecated；provider-session thread/run cache 双写新字段和 deprecated mirror，上层 hydration、Console、Plan UI 优先读取新字段。
- Settings 普通模型/能力展示已更多依赖 runtime contract / AgentProfile projection；状态卡能力文案消费 `runtimeBackend.capabilitySummary`，Console 的 Runtime credential panel 消费 `AgentProfile.credentialHint`，能力健康 panel 消费 runtime capability summary，会话集成面板消费 `AgentProfile` / runtime backend projection；provider-session client 不再作为普通 chat data source。

验收：

- 新普通 chat path 搜不到 `providerSessionClient`。
- Settings 普通能力读取走 `AgentChatDataSource.capabilities` 或 runtime contract。

## Acceptance Checklist

每个 Agent runtime 相关 PR 都应检查：

- 是否新增了裸 `sessionId` 字段。如果是，必须改为更具体名称。
- 是否让 React component import provider-session client。如果是，必须改成 application/data source。
- 是否让 UI 根据 provider kind 解析消息结构。如果是，必须移到 adapter。
- 是否让 SDK backend 声称支持 app-server-only 能力。如果是，必须加 capability gap。
- 是否把 API key 暴露给 renderer。如果是，必须移到 Electron/account resolver。
- 是否把 conversation registry 当 transcript store。如果是，必须改为 provider/runtime canonical read。
- 是否把 page task、conversation、runtime process state 混入同一新 store。如果是，必须拆分。
- 是否新增 `sdkRuntime*` 命名承载 app-server。如果是，必须使用 `agentRuntime*` 或明确 legacy alias。
- 是否新增 app-server 直接调用绕过 `AgentChatDataSource`。如果是，必须说明是 diagnostics/migration。
- 是否新增普通 chat render chain 走旧 projection。如果是，必须说明 surface 非普通 chat。

## Suggested Search Gates

这些不是最终测试，但可作为 review 辅助：

```bash
rg -n "providerSessionClient" apps/frontend/src/features/agent/components
rg -n "from '@/shared/infrastructure/providerSessionClient'" apps/frontend/src/features/agent/components apps/frontend/src/features/agent/presentation
rg -n "sessionId" apps/frontend/src/features/agent packages/core/src/agent | rg -v "providerSessionTreeId|deprecated|legacy|test"
rg -n "sdkRuntime" apps/frontend/electron/services apps/frontend/src/shared/infrastructure | rg "app-server|appServer|codex-app-server|mova-app-server"
rg -n "process\\.env|fs|node:" packages/core/src/agent
rg -n "from 'react'|from \"react\"" packages/core/src/agent
```

预期：

- components 中不应有 provider-session client。
- 新代码中裸 `sessionId` 需要强理由。
- app-server 不应只出现在 `sdkRuntime*` 命名下。
- core 不应有 React/Node runtime dependency。

## Review Questions

评审 Agent runtime 改动时优先问：

1. 这个逻辑属于 UI、application、data source、runtime host、runtime backend、protocol adapter，还是 persistence？
2. 这个模块是否知道了不该知道的 provider-native 事实？
3. app-server 能力是被正名为 runtime backend，还是被藏进 SDK runtime 兼容壳？
4. 如果换成另一个 backend，这段代码是否仍成立？
5. 如果 provider SDK 没有某能力，contract 是否能表达？
6. 如果 provider native session id 改变，本地 conversation registry 会不会误当 canonical history？
7. 这段代码是否让 renderer 接触了 secret？
8. 这段展示逻辑是否能只通过中立 item/view model 工作？

## 当前代码到目标边界映射

| 当前模块 | 当前问题 | 目标归属 |
| --- | --- | --- |
| `sdkRuntimeHost.ts` | 名称只承认 SDK，但实际支持 app-server | `AgentRuntimeHost` |
| `sdkRuntimeProtocol.ts` | RPC 名称绑定 SDK | `AgentRuntimeProtocol` |
| `sdkRuntimeChatDataSource.ts` | data source adapter 名称绑定 SDK | `AgentRuntimeChatDataSource` |
| `appServerRuntimeHandler.ts` | 正确承担 app-server backend，但被注册进 sdk runtime | `AppServerRuntimeBackend` |
| `providerRuntimeApiCatalog.ts` | contract 混合 provider/runtime/backend，能力粒度粗 | `RuntimeBackendContract` |
| `providerConfigStore.ts` | ProviderConfig 过重 | ProviderProfile + RuntimeBackendProfile + AccountPolicy |
| `AgentChatDataSourceShell.tsx` | 壳层过厚 | BoundaryContainer + controllers + View |
| `agentSessionStore.ts` | 状态桶过大 | registry/draft/task/runtime/binding stores |
| `AgentConversationProjection*` | 旧消息投影链路仍易被误用 | legacy/diagnostics/project mode surface |
| `AgentChatThreadItemView` | 新普通 chat render 方向正确 | 继续作为普通 chat render 主入口 |

## Strong Invariants

以下规则应视为硬边界：

- 普通 chat UI 只通过 `AgentChatDataSource` 执行。
- app-server 是 runtime backend，不是 UI service。
- SDK 是 runtime backend，不是架构中心。
- RuntimeHost 只在 Electron。
- Secret 只在 Electron/Node trusted side。
- Provider-native payload 只在 adapter 层解析。
- Conversation registry 不保存完整 transcript。
- `providerSessionTreeId` 是 app-server/native session tree 的可选绑定，不是 universal session。
- `AgentChatThreadItem` 是普通 chat message display 的中立输入。
- 任何跨边界对象都要带 provider/runtime scope，避免 id 碰撞。

## 最终目标状态

完成重构后，开发者看到的心智模型应该非常简单：

- 我要做普通 chat UI：只看 `AgentChatDataSource`、chat runtime、chat item renderer。
- 我要接一个新执行后端：实现 `RuntimeBackend` 和 `ProviderProtocolAdapter`。
- 我要展示 Agent 列表/状态：看 `AgentProfile` 和 readiness summary。
- 我要处理账号：只改 `AgentRuntimeAccountResolver`。
- 我要维护 app-server：只进 `AppServerRuntimeBackend`。
- 我要维护 SDK：只进 `SdkRuntimeBackend`。
- 我要看旧 provider-session 历史/诊断：进 legacy diagnostics/provider-session workspace index。

这就是本次边界重构要达成的主要收益：不是减少代码量，而是让每段代码的位置和名字都承认它真实负责的事情。
