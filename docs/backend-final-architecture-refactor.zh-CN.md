# MovScript 后端最终形态与重构方案

本文描述 MovScript 后端的目标形态、边界定义、插件/Provider 体系和渐进式重构路线。它不是对当前代码的逐项盘点，而是用于指导后续后端重构、商业化部署、本地模式和团队模式统一设计的架构文档。

关联文档：

- [backend-role-and-boundary-review.zh-CN.md](./backend-role-and-boundary-review.zh-CN.md)：当前后端职责与边界审视。

## 1. 核心结论

MovScript 后端不应该被定义为“所有能力都自己实现的全能服务”，也不应该被定义为“单纯的插件管理器”。

更准确的定义是：

> MovScript Backend 是 MovScript 的平台控制面与创作运行时。它拥有 MovScript 的核心业务语义、权限、审计、资源、项目、任务和工作流状态；外部基础设施能力通过启动时组装的 Provider Adapter 接入。

因此：

- `商业外部 AI 网关` 是 AI Gateway Provider，不是 MovScript 自己要重写的模型平台。
- `Gitea` 是 Workspace Repository Provider，不是 MovScript 自己要重写的 Git 协作系统。
- `MinIO`、S3、filesystem 是 Blob Storage Provider，不是用户心智里的素材库。
- Redis、向量库、媒体处理器、外部素材源都是可替换基础设施能力。
- MovScript 自己必须牢牢掌握项目、资源、镜头知识、候选/选择、任务、工作流、权限和审计语义。

一句话：

> 外部系统提供能力，MovScript 后端定义语义。

## 2. 目标后端定位

目标后端由三层构成：

```text
MovScript Backend
├── Core Control Plane
│   ├── Identity / Organization / Permission
│   ├── Project / Workspace Metadata
│   ├── Resource / Asset Library Metadata
│   ├── Shot Knowledge Base
│   ├── Decision / Candidate / Selection
│   ├── Workflow / Canvas Runtime State
│   ├── Job / Task State
│   ├── Audit / Usage / Entitlement
│   └── Admin API / User API / Gateway API
│
├── Provider Runtime Layer
│   ├── AI Gateway Provider
│   ├── Workspace Repository Provider
│   ├── Blob Storage Provider
│   ├── Cache Provider
│   ├── Vector Index Provider
│   ├── Media Processing Provider
│   ├── External Resource Provider
│   └── Agent Runtime Provider
│
└── Provider Assembly Layer
    ├── Provider Contract
    ├── Built-in Provider Registry
    ├── Startup Profile Resolver
    ├── Provider Config
    ├── Secret Resolution
    ├── Capability Descriptor
    └── Health Check
```

其中 Core Control Plane 是 MovScript 的核心资产；Provider Runtime Layer 和 Provider Assembly Layer 是让 MovScript 复用外部系统、适配商业部署的机制。基础设施 Provider 当前不做运行时安装，先以内置 adapter 的方式在启动时按 profile/config 组装。

## 3. 本地模式与团队模式的统一

本地模式和团队模式不应该是两套后端，而应该是同一个后端核心的两种部署 profile。

### 3.1 Personal Local Profile

本地一体模式面向个人桌面创作。

推荐依赖：

```text
profile: personal-local
database: sqlite
blob_storage: filesystem
workspace_repository: local-git-http
ai_gateway: local 或 builtin
cache: memory
agent_runtime: desktop-managed
host: Electron
```

产品行为：

- Electron 自动启动本地 backend。
- Electron 自动托管或按需启动 agent runtime。
- 用户不需要理解 backend port、baseURL、SQLite、filesystem、local Git。
- 默认隐藏 API key、baseURL、provider credential。
- 专家模式才暴露底层配置。

### 3.2 Team Cloud Profile

团队云端模式面向多人协作、组织权限和商业化部署。

推荐依赖：

```text
profile: team-cloud
database: postgres
blob_storage: minio 或 s3
workspace_repository: gitea
ai_gateway: 商业外部 AI 网关
cache: redis
agent_runtime: remote-runtime
host: server / container / k8s
```

产品行为：

- Web/Electron frontend 只连接远端 backend。
- 管理员在 Admin 配置模型、存储、Git、用量和审计。
- 普通创作者只看到项目、素材、镜头、模型、工作流和任务。
- 企业部署可以替换 商业外部 AI 网关、Gitea、MinIO，但不改变 MovScript 的业务语义。

### 3.3 Custom Profile

Custom profile 用于开发者、私有化和迁移期。

它允许单项覆盖：

- SQLite + Gitea
- Postgres + filesystem
- builtin AI gateway + Redis
- 商业外部 AI 网关 + local Git HTTP

Custom profile 不应该成为普通用户入口，只用于部署和开发。

## 4. 核心业务边界

以下能力属于 MovScript 后端核心，不应该通过外部系统替代。

### 4.1 Identity and Organization

后端拥有：

- 用户账号。
- 登录 session。
- 组织。
- 成员。
- 角色。
- 邀请。
- 系统权限。

外部系统可以提供 SSO、OIDC、LDAP，但不能替代 MovScript 内部的权限判断。

### 4.2 Project and Workspace Metadata

后端拥有：

- 项目实体。
- 项目成员。
- 项目角色。
- 项目 workspace metadata。
- 项目与 repository 的 binding。

Gitea 或 local Git 只负责 repository 存储和 Git 协议能力。

### 4.3 Resource and Asset Library

后端拥有：

- Resource metadata。
- 文件夹。
- 所属用户/组织/项目。
- 引用保护。
- 派生关系。
- 可见性。
- 删除策略。

MinIO、S3、filesystem 只负责 blob 存储。

### 4.4 Shot Knowledge Base

后端拥有：

- 镜头参考组。
- 镜头参考。
- 镜头语义字段。
- 检索文本。
- 向量文档 metadata。
- 向量索引维护状态。

向量数据库只负责索引和相似度检索，不拥有镜头语义。

### 4.5 Decision, Candidate, Selection

后端拥有生成式工作流的决策记录：

- 候选。
- 选择。
- 采纳。
- target kind/ref。
- 决策上下文。
- 下游 stale/refresh 状态。

这部分是 MovScript 区别于普通 AI 调用平台的核心。

### 4.6 Workflow and Job Runtime State

后端拥有：

- Canvas。
- Workflow template。
- Run。
- Task。
- Job。
- 输入输出 resource binding。
- retry、lease、heartbeat。
- usage reservation。

外部 worker 可以执行任务，但任务状态机和审计归 MovScript 后端所有。

## 5. Provider 与插件类型

Provider 体系需要区分基础设施 Provider 和创作插件。基础设施能力先不做运行时插件系统，而是通过内置 Provider Adapter 在启动时组装；真正的 plugin 留给用户侧创作生态。

### 5.1 Infrastructure Provider Adapter

这类 adapter 面向部署管理员，提供系统能力。

典型类型：

```text
ai_gateway_provider
workspace_repository_provider
blob_storage_provider
cache_provider
vector_index_provider
media_processing_provider
external_resource_provider
auth_provider
notification_provider
```

示例：

- `provider.ai-gateway.商业外部 AI 网关`
- `provider.workspace.gitea`
- `provider.blob.minio`
- `provider.blob.s3`
- `provider.vector.pgvector`
- `provider.vector.qdrant`
- `provider.media.desktop-managed`
- `provider.media.external-worker`
- `provider.external-resource.pexels`

基础设施 Provider 的原则：

- 由 Admin 配置。
- 可以保存 secret。
- 可以暴露 health check。
- 可以声明 capability。
- 不直接出现在普通创作者工作台里。
- 不能定义 MovScript 核心业务对象。
- 当前阶段不支持运行时安装/卸载；只在后端启动时按 profile/config 组装。

### 5.2 Creation Product Plugin

这类插件面向创作者，提供创作能力。

典型类型：

```text
tool
workflow_node
workflow_template
resource_processor
shot_analyzer
exporter
agent_skill
ui_contribution
```

示例：

- 剧本分析工具。
- 镜头拆解工具。
- 图片生成节点。
- 视频生成节点。
- 分镜导出器。
- 参考图处理器。
- 平台内 workflow template。

创作插件的原则：

- 可以出现在用户工作台。
- 可以声明输入输出 schema。
- 可以请求后端能力。
- 不直接持有全局基础设施 secret。
- 需要通过后端权限和任务系统运行。

## 6. Provider Contract 设计

Provider Adapter 不应该直接随意调用系统内部对象，而应该通过稳定 contract 接入。

### 6.1 AI Gateway Provider Contract

用于接入 商业外部 AI 网关、builtin gateway、local gateway 或未来其他模型平台。

最小接口：

```text
ListModels(ctx) -> []ModelDescriptor
ResolveModel(ctx, logicalModelID) -> ModelBinding
EstimateUsage(ctx, ModelBinding, RequestShape) -> UsageEstimate
ReserveUsage(ctx, UsageReserveRequest) -> UsageReservation
SettleUsage(ctx, UsageSettleRequest) -> void
RecordCallAudit(ctx, GatewayCallAuditInput) -> void
Chat(ctx, ChatRequest) -> ChatResponse
ChatStream(ctx, ChatRequest) -> Stream
GenerateImage(ctx, ImageRequest) -> ImageResponse
GenerateVideo(ctx, VideoRequest) -> VideoTaskResponse
PollVideo(ctx, VideoTaskRef) -> VideoTaskState
UploadFile(ctx, FileUploadRequest) -> FileRef
Health(ctx) -> ProviderHealth
```

团队云模式下的 `remote-runtime` 是启动组装 Provider：后端通过 `MOVSCRIPT_AGENT_RUNTIME_BASE_URL` 定位远端 runtime，并可选使用 `MOVSCRIPT_AGENT_RUNTIME_TOKEN` 作为 Bearer token 执行 `/health` 探测；如果远端实现 `/capabilities`，后端会额外读取动态能力，例如 `agent_session.proxy` 和 `agent_permission.probe`。`/health` 只证明远端 runtime 入口可连接，`/capabilities` 才证明远端 host 已接入会话代理或权限探测能力；session 创建、消息流、工具列表和权限治理仍属于 runtime host，不应由 core backend 直接启动本地进程。

MovScript 后端负责：

- 模型展示名称。
- 模型能力归一。
- 价格和用量策略。
- 权限和配额。
- 调用审计。
- 任务状态。

商业外部 AI 网关 负责：

- 上游模型聚合。
- 上游 key 管理，取决于部署策略。
- OpenAI-compatible 转发。
- 自身支持的模型能力。

### 6.2 Workspace Repository Provider Contract

用于接入 Gitea、local Git HTTP、GitLab、GitHub Enterprise 等。

最小接口：

```text
EnsureRepository(ctx, ProjectRepoSpec) -> RepositoryBinding
EnsureUser(ctx, UserRepoSpec) -> RepositoryUserBinding
EnsureCollaborator(ctx, RepoRef, UserRef, Permission) -> void
GetCloneURL(ctx, RepoRef, Actor) -> URL
GetGitHTTPProxyTarget(ctx, RepoRef) -> ProxyTarget
Health(ctx) -> ProviderHealth
```

MovScript 后端负责：

- Project。
- ProjectMember。
- ProjectRepository binding。
- namespace 到 repo 的映射。
- 权限判断。

Gitea 负责：

- repo 创建。
- Git 协议。
- token。
- collaborator。
- branch storage。

### 6.3 Blob Storage Provider Contract

用于接入 filesystem、MinIO、S3、OSS、TOS 等。

最小接口：

```text
Put(ctx, BlobPutRequest) -> BlobLocation
Get(ctx, BlobLocation) -> ReadStream
Delete(ctx, BlobLocation) -> void
PresignGet(ctx, BlobLocation, ttl) -> URL
PresignPut(ctx, BlobPutSpec, ttl) -> URL
Exists(ctx, BlobLocation) -> bool
Health(ctx) -> ProviderHealth
```

MovScript 后端负责：

- Resource。
- ResourceBlob。
- hash 去重。
- ref count。
- owner/scope。
- 删除保护。

Blob provider 负责：

- 字节存储。
- range read。
- presigned URL。
- bucket/path。

### 6.4 Vector Index Provider Contract

用于接入 pgvector、Qdrant、Milvus、Weaviate 等。

最小接口：

```text
Upsert(ctx, VectorDocument) -> void
Delete(ctx, VectorDocumentRef) -> void
Search(ctx, VectorSearchRequest) -> []VectorSearchResult
Stats(ctx) -> VectorIndexStats
Rebuild(ctx, RebuildRequest) -> RebuildTaskRef
Health(ctx) -> ProviderHealth
```

MovScript 后端负责：

- ShotReference。
- retrieval text。
- 语义字段。
- index rebuild 状态。

Vector provider 只负责向量存取和检索。

### 6.5 Media Processing Provider Contract

用于接入本地桌面媒体运行时、远端 media worker 或未来 GPU/云端转码服务。

最小接口：

```text
Probe(ctx, MediaProbeRequest) -> MediaProbeResult
Transcode(ctx, MediaTranscodeRequest) -> MediaTranscodeResult
ExtractFrame(ctx, MediaFrameRequest) -> MediaFrameResult
Health(ctx) -> ProviderHealth
```

MovScript 后端负责：

- Resource metadata。
- 上传、生成结果和派生素材的归档。
- 任务状态、权限和审计。
- 本地模式与团队模式下的 provider 选择。

Media provider 负责：

- 文件探测。
- 转码。
- 抽帧。
- 可选的独立 media worker 执行环境。

当前策略是轻量化：本地模式下媒体处理由 Electron/desktop runtime 管理，后端不直接关心 FFmpeg binary、filter 或命令行参数；团队云模式如果需要服务端媒体处理，应由独立 media worker 或云转码服务实现。后端只定义 media processing 的任务语义、输入输出 resource、权限、状态和审计边界。

团队云模式下的 `external-worker` 也是启动组装 Provider：后端通过 `MOVSCRIPT_MEDIA_WORKER_BASE_URL` 定位外部 media worker，并可选使用 `MOVSCRIPT_MEDIA_WORKER_TOKEN` 作为 Bearer token 执行 `/health` 探测。这个探测只确认 worker 入口可连接；FFmpeg binary、滤镜参数、任务执行和资源调度仍归 Electron desktop runtime 或外部 media worker，不进入 core backend。

### 6.6 Agent Runtime Provider Contract

用于接入 Mova、Codex app-server 或未来其他 agent runtime。

最小接口：

```text
EnsureRuntime(ctx, RuntimeProfile) -> RuntimeSession
StartSession(ctx, WorkspaceRef, AgentConfig) -> AgentSession
SendMessage(ctx, AgentSessionRef, Message) -> AgentEventStream
ListTools(ctx, AgentSessionRef) -> []ToolDescriptor
StopSession(ctx, AgentSessionRef) -> void
Health(ctx) -> ProviderHealth
```

MovScript 后端/桌面负责：

- workspace focus。
- provider session 与项目绑定。
- 权限。
- 审计。
- 工具调用边界。

Agent runtime 负责：

- agent 执行。
- tool protocol。
- session 生命周期的底层运行。

团队云模式下，remote runtime 的 wire protocol 先冻结为 `movscript.agent-runtime.v1`，再实现 core backend 代理；后端不得临时猜测 `/sessions`、`/chat` 之类路径。

控制面探测保持轻量兼容：

```text
GET /health
GET /capabilities
```

`/capabilities` 可返回：

```json
{
  "protocol_version": "movscript.agent-runtime.v1",
  "capabilities": ["agent_runtime.remote", "agent_session.proxy", "agent_permission.probe"],
  "endpoints": {
    "create_session": "/v1/agent/sessions",
    "session_events": "/v1/agent/sessions/{session_id}/events",
    "session_messages": "/v1/agent/sessions/{session_id}/messages",
    "session_tools": "/v1/agent/sessions/{session_id}/tools",
    "stop_session": "/v1/agent/sessions/{session_id}",
    "permission_decisions": "/v1/agent/permissions/{request_id}/decision"
  }
}
```

会话数据面固定为：

```text
POST /v1/agent/sessions
GET  /v1/agent/sessions/{session_id}/events        # SSE event stream
POST /v1/agent/sessions/{session_id}/messages
GET  /v1/agent/sessions/{session_id}/tools
DELETE /v1/agent/sessions/{session_id}
POST /v1/agent/permissions/{request_id}/decision
```

认证统一走 backend 配置的 `MOVSCRIPT_AGENT_RUNTIME_TOKEN` Bearer token；审计、workspace/project/user/org 上下文由 core backend 在代理请求中附带，runtime host 只执行会话与工具协议。permission probe 的请求/决策 DTO 已进入 `internal/providers/contract`，后续实现代理时应先落审计和权限询问闭环，再转发消息流。

## 7. 后端内部模块目标结构

当前 `apps/backend/internal` 已经有 `domain`、`app`、`infra`、`interfaces` 分层。最终形态应进一步明确“核心域”和“provider 接入”。

建议目标结构：

```text
apps/backend/internal/
├── domain/
│   ├── identity/
│   ├── org/
│   ├── project/
│   ├── resource/
│   ├── shotknowledge/
│   ├── decision/
│   ├── workflow/
│   ├── job/
│   ├── audit/
│   └── entitlement/
│
├── app/
│   ├── identity/
│   ├── project/
│   ├── resource/
│   ├── shotknowledge/
│   ├── decision/
│   ├── workflow/
│   ├── job/
│   ├── admin/
│   └── plugin/
│
├── providers/
│   ├── contract/
│   │   ├── aigateway/
│   │   ├── workspace/
│   │   ├── blob/
│   │   ├── cache/
│   │   ├── vector/
│   │   ├── media/
│   │   └── agentruntime/
│   ├── builtin/
│   └── registry/
│
├── infra/
│   ├── persistence/
│   ├── crypto/
│   ├── observability/
│   └── providerimpl/
│       ├── aigateway/
│       │   ├── builtin/
│       │   ├── local/
│       │   └── externalgateway/
│       ├── workspace/
│       │   ├── localgit/
│       │   └── gitea/
│       ├── blob/
│       │   ├── filesystem/
│       │   └── minio/
│       └── cache/
│           ├── memory/
│           └── redis/
│
├── interfaces/
│   ├── http/
│   ├── gateway/
│   ├── worker/
│   └── cli/
│
└── bootstrap/
    ├── config/
    ├── composition/
    └── profile/
```

重点不是一次性移动所有文件，而是让新增代码按这个方向生长，并逐步迁移最混乱的 provider 实现。

## 8. 进程与服务拆分目标

短期保留单体进程，中期拆 worker，长期按负载拆服务。

### 8.1 短期：Modular Monolith

一个 backend 进程内包含：

- API server。
- Admin API。
- OpenAI-compatible gateway。
- Job scheduler。
- Job worker。
- Provider registry。

适合当前阶段，因为：

- 业务模型仍在快速变化。
- 多服务会增加部署和调试成本。
- 本地 Electron 模式需要简单可靠。

### 8.2 中期：Worker Split

先拆运行负载，不拆控制面。

```text
backend-api
backend-worker-generation
backend-worker-media
backend-worker-vector
```

控制面仍由 `backend-api` 持有：

- job 状态机。
- resource metadata。
- usage reservation。
- audit。
- permission。

worker 通过队列或数据库 lease 拉任务。

### 8.3 长期：Selective Service Split

只有当以下条件出现时，才物理拆服务：

- 某模块有独立扩缩容需求。
- 某模块依赖 GPU 或特殊运行环境。
- 某模块故障不能影响主 API。
- 某模块需要独立发布周期。
- 某模块可以用稳定 contract 隔离。

优先候选：

- media processing service。
- vector indexing service。
- generation worker service。
- plugin registry/hub service。
- observability pipeline。

不优先拆：

- identity/org。
- project metadata。
- resource metadata。
- decision/selection。
- admin API。

这些属于强一致核心控制面，过早拆分会放大复杂度。

## 9. Provider Descriptor 初稿

基础设施 Provider 当前不需要动态 plugin manifest。更轻量的做法是给每个内置 Provider Adapter 提供 descriptor，用于 Admin 展示、配置校验和 health check。

示例：

```json
{
  "id": "provider.ai-gateway.商业外部 AI 网关",
  "name": "商业外部 AI 网关",
  "kind": "provider_descriptor",
  "providerType": "ai_gateway",
  "version": "1.0.0",
  "assembly": "startup",
  "capabilities": [
    "model.list",
    "chat.completions",
    "responses",
    "image.generate",
    "video.generate",
    "usage.query"
  ],
  "configSchema": {
    "type": "object",
    "required": ["baseURL"],
    "properties": {
      "baseURL": {
        "type": "string",
        "format": "uri"
      }
    }
  },
  "secretSchema": {
    "type": "object",
    "properties": {
      "apiKey": {
        "type": "string",
        "x-secret": true
      }
    }
  },
  "health": {
    "type": "http",
    "path": "/health"
  },
  "adminUI": {
    "category": "AI Management",
    "label": "商业外部 AI 网关 Gateway"
  }
}
```

Gitea 示例：

```json
{
  "id": "provider.workspace.gitea",
  "name": "Gitea",
  "kind": "provider_descriptor",
  "providerType": "workspace_repository",
  "version": "1.0.0",
  "capabilities": [
    "repository.ensure",
    "user.ensure",
    "collaborator.ensure",
    "git.http_proxy"
  ],
  "configSchema": {
    "type": "object",
    "required": ["baseURL", "repoPrefix", "orgPrefix"],
    "properties": {
      "baseURL": { "type": "string", "format": "uri" },
      "repoPrefix": { "type": "string" },
      "orgPrefix": { "type": "string" }
    }
  },
  "secretSchema": {
    "type": "object",
    "properties": {
      "adminToken": { "type": "string", "x-secret": true },
      "adminUsername": { "type": "string" },
      "adminPassword": { "type": "string", "x-secret": true }
    }
  }
}
```

## 10. Admin 信息架构目标

Admin 应按能力管理，而不是按底层技术名堆页面。

建议结构：

```text
System
├── Users
├── Organizations
├── Roles and Permissions
├── Invitations
└── Security

AI Management
├── AI Gateway Providers
├── Model Catalog
├── Model Routing
├── Gateway API Keys
├── Pricing and Quotas
└── LLM Call Logs

Storage and Assets
├── Asset Library
├── Blob Storage Providers
├── Cloud File Bridge
├── External Resource Sources
└── Resource Maintenance

Workspace
├── Projects
├── Workspace Repository Providers
├── Repository Bindings
└── Git Health

Creation Knowledge
├── Shot Library
├── Vector Index Providers
├── Index Maintenance
└── Search Diagnostics

Runtime
├── Jobs
├── Workers
├── Workflow Runs
├── Agent Runtime Providers
└── Runtime Health

Extensions
├── Provider Adapters
├── Creation Plugins
├── Workflow Market
└── Hub

Operations
├── Audit Logs
├── Usage
├── Metrics
├── Debug
└── Deployment Profile
```

普通用户前端不应该出现这些部署细节。前端只应该展示：

- 当前模型是否可用。
- 当前 agent runtime 是否可用。
- 当前 workspace 是否同步正常。
- 当前任务是否运行正常。

## 11. Frontend 心智目标

普通创作者看到的是创作对象：

```text
Project
Resource
Shot Library
Script
Production
Agent
Workflow
Job Result
```

管理员看到的是系统能力：

```text
Provider
Model
Storage
Repository
Runtime
Quota
Audit
Health
```

开发者看到的是基础设施：

```text
Postgres
SQLite
MinIO
S3
Gitea
商业外部 AI 网关
Redis
app-server
Vector DB
```

这三层不能混在一个 UI 层级里。

## 12. 重构路线

### Phase 0：明确命名

目标：停止概念继续混乱。

动作：

- 把文档里的三类 provider 固定命名：
  - AI Provider / AI Gateway Provider。
  - Agent Runtime Provider。
  - Infrastructure Provider。
- 把运行 profile 固定命名：
  - `personal-local`。
  - `team-cloud`。
  - `custom`。
- 在 Admin 和 Frontend 文案中避免把 MinIO/Gitea/商业外部 AI 网关 暴露给普通用户。

验收：

- README、Admin、Frontend 设置页中不再混用 provider/baseURL/API key。
- `/api/v1/backend/dependencies` 返回的 profile 能被 UI 映射成用户可理解文案。

### Phase 1：Provider Contract 抽象

目标：让外部能力从 infra 实现变成稳定 contract。

动作：

- 新建 `internal/providers/contract`。
- 抽出 AI gateway、workspace repository、blob storage、cache 的接口。
- 当前 builtin/local/商业外部 AI 网关/Gitea/MinIO/filesystem 先作为内置 provider adapter。
- `bootstrap` 只面向 contract 组装，不直接散落选择逻辑。

验收：

- `bootstrap` 可以通过 profile 组装 provider。
- 单元测试覆盖 local profile 和 team-cloud profile。
- 新增 provider 不需要改业务 service。

### Phase 2：Provider Descriptor Registry

目标：把 provider 实现纳入轻量 descriptor registry，而不是运行时插件系统。

动作：

- 定义内置 provider descriptor。
- 建立 provider instance 配置模型。
- 建立 provider secret 加密存储。
- Admin 支持查看、配置、测试 provider instance。
- 内置 provider 也用同一套 descriptor 表示。

验收：

- 商业外部 AI 网关 作为 `ai_gateway_provider` 被描述和配置。
- Gitea 作为 `workspace_repository_provider` 被描述和配置。
- filesystem/minio 作为 `blob_storage_provider` 被描述和配置。

### Phase 3：Admin 重排

目标：让管理员理解系统能力，而不是被底层 env vars 牵着走。

动作：

- 重排 Admin 导航。
- 引入 Deployment Profile 页面。
- Provider 配置页按 provider type 分组。
- Secret 只显示状态，不显示明文。
- Health check 进入每个 provider instance。

验收：

- 管理员能从 UI 判断当前是 local/custom/team-cloud。
- 管理员能知道 AI gateway、workspace repository、blob storage 分别由谁提供。
- 普通用户不需要进入 Admin 才能创作。

### Phase 4：Frontend 收敛

目标：普通用户不再理解基础设施。

动作：

- App settings 只显示运行模式、连接状态、runtime 状态。
- API key/baseURL/provider credential 进入专家模式。
- 模型选择展示 logical model，不展示底层 provider credential。
- Workspace 展示同步状态，不展示 Gitea/local Git 细节。

验收：

- 新用户打开桌面端可以直接进入本地一体模式。
- 团队用户只需要登录团队 backend。
- 专家配置仍可用，但不干扰主流程。

### Phase 5：Worker 拆分

目标：把重负载从 API server 拆出去。

动作：

- Job worker 支持独立进程启动。
- Media worker 支持独立进程。
- Vector indexing worker 支持独立进程。
- API server 只负责任务创建、状态机、权限和查询。

验收：

- 本地模式仍可单进程运行。
- 团队模式可以多 worker 横向扩展。
- worker 崩溃不影响 API server 登录、项目、资源浏览。

## 13. 当前落地状态

截至本文档当前版本，Provider 方向已经开始落到代码里，但仍处于渐进式重构阶段。

已落地：

- `internal/providers/contract`：提供启动组装常量、Provider 类型、Adapter 类型、AI Gateway adapter contract、Blob Storage/Cache contract、Workspace Repository contract 和 Provider health contract。
- AI Gateway Provider Contract：补齐 runtime model catalog/binding 的稳定 DTO/interface，`AIService` 已实现 `ListModels` 与 `ResolveModel`，能把普通用户看到的 logical model 映射到实际 provider-backed model config/provider model id；Provider Descriptor 和 Provider Instance capability 也声明 `model.resolve`。
- `internal/providers/contract`：补齐 Vector Index、Media Processing、External Resource 和 Agent Runtime 的 contract DTO/interface，先建立 provider 边界，具体 adapter 后续迁移。
- `internal/providers/descriptor`：提供内置 Provider Descriptor registry，声明内置 adapter 的 label、assembly mode 和 capabilities；目录已覆盖当前启动组装 adapter 和未来的 vector/media/external-resource/agent-runtime adapter。
- `internal/providers/assembly`：集中组装 blob storage、cache、AI registry/service 和 workspace repository provider，`bootstrap` 不再直接散落选择这些 provider。
- Workspace Repository Provider Contract：补齐 `GetCloneURL` 与 `GetGitHTTPProxyTarget`，Gitea/local Git HTTP adapter 已由 provider 侧产出 clone URL/proxy target；Project Repository Service 通过 contract 获取这些能力，Git proxy handler 只保留 HTTP 认证、Smart HTTP 白名单、请求转发和响应透传。assembly 也修正了 nil Gitea adapter 被装入 interface 的问题，未配置真实 Gitea adapter 时不会误触发 provider 方法。
- Gitea Workspace Repository Health：Gitea adapter 已实现通用 `Health(ctx)`，通过 `/api/v1/user` 验证 token 或 admin basic auth 是否真实可用；`workspace_repository:gitea` 的 Provider Instance test 已开始调用该 health probe，不再只做配置存在性判断。
- `internal/providers/assembly`：增加 `BuildVectorIndexProvider`，当前可在启动组装时选择本地 `LocalVectorStore`、Postgres `pgvector` 或 Qdrant adapter，并统一注入 ShotReference runtime service。
- Vector Index Provider Assembly：`vector_index` 已进入启动组装、dependency profile、Provider Instance 和 Admin env overlay。当前本地/团队默认都使用 `vector_index:local-index`，Admin 可看到并测试该启动实例；`MOVSCRIPT_VECTOR_INDEX_PROVIDER=qdrant` 已具备 Qdrant 数据面 adapter，优先使用 contract 传入的 embedding，没有显式 embedding 时回退到与 local-index 一致的 `movscript-local-hash-v1` embedding，支持 collection ensure、upsert、delete、search、stats 和 reset rebuild，并已接入 ShotReference runtime service。`MOVSCRIPT_VECTOR_INDEX_PROVIDER=pgvector` 已具备 Postgres 数据面 adapter，会在同一数据库内创建 `vector` extension 和 `shot_vector_documents_pgvector` 表，支持 upsert、delete、search、stats、reset rebuild 和 health probe；当前使用 384 维 `movscript-local-hash-v1` fallback embedding，后续可在 contract 上游接入真实 embedding provider 后继续复用该 adapter。
- `internal/providers/assembly`：增加 `BuildExternalResourceProvider`，当前将 Pexels/Pixabay 包装为 `ExternalResourceProvider` contract，External Resource Service 通过该 contract 调用 provider。
- `internal/providers/descriptor` 与 `internal/infra/config`：将媒体运行时表达为 `media_processing:desktop-managed` 和 `media_processing:external-worker`。本地模式默认 `desktop-managed`，表示 Electron/desktop runtime 管理剪辑、抽帧和导出；团队云模式默认 `external-worker`，为后续独立 media worker/云转码服务预留边界。Core backend 不再内置 FFmpeg adapter，也不暴露 FFmpeg binary 配置。
- Media Processing Provider Assembly：新增 control-plane 型 `MediaProcessingProvider` 组装入口，覆盖 `desktop-managed` 和 `external-worker` adapter。该 provider 只表达 media runtime health 边界，并明确拒绝由 core backend 直接执行 probe/transcode/extract frame；本地剪辑、抽帧和导出仍由 Electron/desktop runtime 托管。`external-worker` 已支持 `MOVSCRIPT_MEDIA_WORKER_BASE_URL` 和可选 `MOVSCRIPT_MEDIA_WORKER_TOKEN`，并通过 `/health` 执行真实连通性 probe。
- `internal/providers/descriptor` 与 `internal/infra/config`：将 Agent Runtime 表达为 `agent_runtime:desktop-managed` 和 `agent_runtime:remote-runtime`。本地模式默认 `desktop-managed`，表示 Electron 托管或按需启动 app-server/Mova 这类 agent runtime；团队云模式默认 `remote-runtime`，表示后端只连接远端 runtime，不在 core backend 内管理 agent 进程。Mova/app-server 仍作为未来可接入 adapter descriptor 保留。
- Agent Runtime Provider Assembly：新增 control-plane 型 `AgentRuntimeProvider` 组装入口，覆盖 `desktop-managed`、`remote-runtime`、`mova` 和 `app-server` adapter。该 provider 只表达 runtime health/ensure 边界，本地 app-server/Mova 生命周期仍由 Electron/desktop host 托管。`remote-runtime` 已支持 `MOVSCRIPT_AGENT_RUNTIME_BASE_URL` 和可选 `MOVSCRIPT_AGENT_RUNTIME_TOKEN`，并通过 `/health` 执行真实连通性 probe；远端实现 `/capabilities` 时，health snapshot 会动态暴露 `agent_session.proxy`、`agent_permission.probe` 等由 runtime host 实际支持的能力。Remote runtime v1 的 session/SSE/message/tools/permission endpoint 和 wire DTO 已冻结在 `internal/providers/contract`，core backend 已按该协议提供受保护的 `/api/v1/agent-runtime/*` proxy：创建 session、SSE events、发送 message、列出 tools、停止 session 和 permission decision 都只向上游转发 backend 配置的 runtime token，不泄漏用户 Authorization，并对 session create/message/stop 和 permission decision 记录审计。
- `/api/v1/backend/dependencies`：返回兼容旧字段的 `ProviderAssembly`，同时包含 `deployment_profile`、`assembly_mode`、`providers[]` 和 provider capabilities。
- `/api/v1/backend/provider-descriptors`：返回内置 Provider Adapter 的 descriptor 列表。
- `/api/v1/backend/provider-health`：返回当前启动组装的 Provider 配置级 health 快照。
- `/api/v1/backend/provider-instances`：返回当前启动组装的 Provider Instance 快照，只暴露 config/secret 字段的配置状态，不返回 secret 明文。
- `/api/v1/models`：runtime 模型目录已通过 `AIGatewayModelCatalog.ListModels` contract 获取模型 descriptor，`app/catalog` 只负责缓存和兼容现有前端 `PublicModel` JSON 形状，不再直接调用 `infra/ai` 的内部 `GetModelsByCapability` 方法。
- Model Gateway、Audio models 和 Canvas diagnostics：OpenAI-compatible model list/模型别名解析、audio TTS/STT 模型列表、Canvas diagnostics 可用模型列表已开始消费 `AIGatewayModelCatalog` contract；这些调用点不再直接依赖 `infra/ai.GetModelsByCapability`/`GetModelsByAnyCapability`/`GetAnyTextModel`。
- AI Gateway Routing Policy Contract：补齐 `AIGatewayRoutingPolicy`、`AIGatewayRouteRequest` 和 `AIGatewayModelRoute`，`AIService` 已通过薄适配器暴露 logical model/model config 到 provider-backed model config 的解析结果；Job enqueue、Canvas runtime text route、Canvas diagnostics 和 Model Gateway proxy/chat 已开始消费 routing policy contract，不再直接依赖 `infra/ai.ModelRoute`/`ModelRouteRequest`。
- AI Gateway Routing Policy 内部实现：将 provider-backed model candidate 的优先级、capacity weight、round-robin、熔断/饱和降级排序从 `service_config.go` 拆入 `service_routing_policy.go`，保留旧函数名作为迁移期兼容入口，为后续 provider preference、fallback policy 和 governance policy 拆分提供明确落点。
- `/api/v1/admin/provider-instances`：返回 Admin 侧可管理的 Provider Instance。当前合并启动组装基础设施实例，并将既有 AI credentials 映射为 `ai_gateway` instances、保留 legacy credential ref。
- `/api/v1/admin/usage-logs`、`/api/v1/admin/usage-logs/summary` 和 usage export：Admin usage service 已通过 `AIGatewayUsageReporter` contract 查询 list/export/summary；现有 GORM usage log repository 作为本地 reporter 实现，HTTP JSON/CSV 形状保持兼容。
- `/api/v1/admin/debug/llm-calls` 和 `/api/v1/admin/debug/llm-calls/summary`：Admin debug service 已通过 `AIGatewayAuditLogReader` contract 查询 LLM call log list/summary；现有 GORM LLM call log repository 作为本地 reader 实现，日志保留期设置、清理和过期时间更新仍由 debug service 管理。
- `/api/v1/admin/provider-instances/:id/test`：提供 Provider Instance 级测试连接入口。当前 AI Gateway credential instance 通过 `AIGatewayHealthProbe` contract 执行 credential/provider ping；启动级 `ai_gateway:商业外部 AI 网关` 是只读聚合实例，测试会验证是否存在启用且配置完整的 credential-backed provider instances 和 enabled model routes，并提示具体 live ping 应在 `ai_gateway:credential:{id}` 上执行；Postgres 通过 `PingContext` 验证数据库网络、认证和 DB 权限；Gitea workspace repository instance 通过 adapter `Health(ctx)` 执行 `/api/v1/user` 认证探测；pgvector vector index instance 通过 Postgres 连接、`vector` extension/table ensure 和 count probe 验证 pgvector 可访问；Qdrant vector index instance 通过 collection probe/ensure 验证外部向量库可访问；External Resource source instance 通过 Pexels/Pixabay adapter `Health(ctx)` 执行最小搜索 probe；MinIO 通过 bucket health probe 验证对象存储可访问；Redis 通过 cache round trip 验证读写；Media Processing `external-worker` 通过配置的 base URL/token 执行 `/health` probe；Agent Runtime `remote-runtime` 通过 `/health` 验证连通性，并在远端支持 `/capabilities` 时动态暴露 session proxy/permission probe 能力；启动组装实例仍支持 local filesystem、local Git HTTP、memory/noop cache、SQLite 等轻量测试。
- `/api/v1/admin/debug/model-runtime-health`：真实路由已通过 `AIGatewayHealthProbe.ListGatewayRuntimeHealth` contract 读取 AI Gateway runtime health snapshot，旧 handler 构造路径保留直接快照 fallback 以兼容窄测试和迁移期。
- `/api/v1/admin/provider-instances/:id/config`：提供启动组装基础设施 Provider Instance 的配置草案读写。草案存入 `AdminSetting`，普通 config 字段明文保存，secret 字段使用现有 AES-GCM 加密；响应和审计只暴露字段配置状态，不返回 secret 明文。该接口表示“期望配置”，当前运行实例仍来自启动配置，保存后需要重启才会应用。
- `/api/v1/admin/provider-instances/:id/config/apply`：将配置草案发布为启动 env overlay。默认写入 `MOVSCRIPT_DATA_DIR/provider-startup.env`，也可由 `MOVSCRIPT_PROVIDER_ENV_PATH` 指定；后端启动时会在普通 `.env` 后加载该 overlay，并让其中 provider env 覆盖同名变量。响应和审计只返回 env key 列表，不返回 secret 值；响应会根据 deployment profile 返回 `activation_mode`，本地模式提示重启本地 backend，团队云模式提示执行部署 rollout，custom profile 提示手动重启后端进程。
- Provider Activation Plan：Provider Instance config apply 响应已新增结构化 `activation_plan`，包含 `mode`、`action`、`host`、`env_path`、`requires_restart`、`can_auto_apply`、`auto_apply_channel`、`auto_apply_url`、`auto_apply_endpoint`、`env_keys` 和 `secret_keys`。个人本地模式会返回 `movscript://provider-activation/restart-local-backend`，Admin 可打开该宿主协议触发 Electron 重启本地 backend；团队云模式可通过 `MOVSCRIPT_PROVIDER_ACTIVATION_ROLLOUT_WEBHOOK_URL` 和可选 token 接入部署平台 webhook，Admin 会显示“执行部署 rollout”按钮并由后端 POST webhook，同时继续保留 `activation_mode` 兼容旧调用方。
- AI Gateway Governance Contract：补齐 usage estimate/reserve/settle/release、LLM call audit、provider probe 和 runtime health snapshot 的稳定 DTO/interface，`AIService` 已通过薄适配器实现 `AIGatewayUsageGovernor`、`AIGatewayCallAuditor` 与 `AIGatewayHealthProbe`。Admin Provider Instance test 已开始消费 `AIGatewayHealthProbe`；现有业务仍可继续调用旧方法，后续 assembly、Admin 或外部网关治理层可以依赖 contract，不需要直接耦合 `infra/ai` 的内部结构。
- AI Gateway Governance Policy：补齐 `AIGatewayGovernancePolicy.EvaluateGatewayGovernance` 预检入口，把 route plan、provider preference、fallback、预算估算和 allow/deny 决策合成稳定 contract。当前 community 实现不直接扣费、不调用模型，只做路由和预算预检；后续组织额度、API key 策略、模型黑白名单可挂到这个入口。
- Admin System Settings：展示当前 deployment profile、dependency profile、启动组装方式、内置 adapter 数量、Provider adapter、capability 数量和 readiness。
- Admin Model Provider Config：开始显示 AI Gateway Provider Instance 的 secret 配置状态，并通过 Provider Instance endpoint 触发连接测试。
- Admin Model Provider Config：增加启动组装 Provider Instance 区块，显示 database/blob storage/workspace repository/cache/AI gateway/media processing/agent runtime 等实例的 adapter、managed-by、config/secret 配置状态、是否需要重启，并复用 Provider Instance test endpoint；可编辑实例支持展开配置草案表单，保存时不回填 secret 明文，并可发布到启动 env overlay。发布成功后会显示 activation plan：本地重启 backend、团队部署 rollout 或手动重启。
- Workspace Repository clone URL strategy：`WorkspaceMetadata` 已将当前登录用户转换为 `RepositoryActor` 并透传给 `RepositoryCloneURLRequest`，HTTP handler 不再只请求一个无主体的 clone URL；`MOVSCRIPT_WORKSPACE_CLONE_URL_STRATEGY=proxy|direct|temporary` 已进入启动配置、Provider Instance config fields 和 Admin env overlay。当前 Gitea/local Git/GitHub Enterprise/GitLab 均支持 `proxy` 与 `direct`；显式配置 provider 不支持的策略会返回配置错误，不再静默回退。`temporary` 已落地为后端统一签发的短期 Git proxy URL：workspace metadata 返回带 `git_token` 的 proxy remote、15 分钟有效期、purpose/project/org 约束；Git CLI 请求通过 identity middleware 恢复用户与工作区上下文，再继续走项目角色校验、Smart HTTP 白名单和 provider proxy target。它不是要求 Gitea/GitHub/GitLab 原生生成临时凭证，而是 MovScript control plane 对自身 proxy 入口做短期授权。
- Workspace Repository access probe：`WorkspaceRepositoryIdentity` 已补齐 `CheckRepoAccess`，Gitea adapter 通过 `/api/v1/repos/{owner}/{repo}/collaborators/{username}/permission` 查询远端权限；Git identity service 在确保 collaborator 后会验证用户是否实际具备 write 权限，Git proxy 不再只假设授权调用成功。
- GitHub Enterprise Workspace Repository Provider：新增 `workspace_repository:github-enterprise` 启动组装 adapter，支持 `MOVSCRIPT_GITHUB_ENTERPRISE_BASE_URL`、`MOVSCRIPT_GITHUB_ENTERPRISE_TOKEN`、repo/org prefix、branch 和 clone URL strategy 配置；adapter 可通过 GitHub Enterprise `/api/v3/user` 做真实 health probe，可确认或创建组织/个人仓库，并返回 provider direct/proxy clone URL。当前已支持对已有 GitHub Enterprise 用户执行 collaborator ensure、access probe 和 Git Smart HTTP proxy；仍不声明 user ensure 能力，避免把 Gitea 的用户 token 生命周期错误复用到 GitHub Enterprise。
- GitLab Workspace Repository Provider：新增 `workspace_repository:gitlab` 启动组装 adapter，支持 `MOVSCRIPT_GITLAB_BASE_URL`、`MOVSCRIPT_GITLAB_TOKEN`、repo/org prefix、branch 和 clone URL strategy 配置；adapter 可通过 GitLab `/api/v4/user` 做真实 health probe，可确认或创建 group/personal project，并返回 provider direct/proxy clone URL。当前已支持对已有 GitLab 用户执行 collaborator ensure、access probe 和 Git Smart HTTP proxy；仍不声明 user ensure 能力，避免在 core backend 里混入 GitLab 用户和 token 生命周期管理。
- External Resource Provider Instances：`/api/v1/admin/provider-instances` 已将数据库中的 `external_resource_sources` 映射为 `external_resource:source:{id}` Provider Instance，只暴露 API key 配置状态，不返回 secret 明文；`/api/v1/admin/provider-instances/:id/test` 会复用 Pexels/Pixabay HTTP adapter 的 `HealthChecker` 执行最小搜索 probe，并记录 provider instance test audit。
- Blob Storage Provider Health：`BlobStorage` contract 已补齐 `Health(ctx)`，filesystem adapter 检查本地 storage root，MinIO adapter 通过 `BucketExists` 执行真实 bucket 访问 probe；`blob_storage:minio` Provider Instance test 不再只是构造 client。
- Database Provider Health：`database:postgres` Provider Instance test 已从 no-op 升级为 `database/sql` `PingContext`，用于验证 Postgres 网络连通、认证和目标 DB 权限；失败信息会对 `DB_PASSWORD` 做脱敏。
- AI Gateway 商业外部 AI 网关 Provider Instance Boundary：`ai_gateway:商业外部 AI 网关` 启动实例已收敛为只读聚合目录，不再暴露 `model_credentials`/`model_credential_keys` 这类假启动字段；真实 base URL/API key 仍由 `ai_gateway:credential:{id}` 管理和测试，聚合实例 test 只验证目录中是否存在 enabled credential-backed provider instances 与 enabled model routes。
- Frontend Model Providers：普通用户侧 `/model-providers` 默认展示后端 AI Gateway 提供的模型路由，并说明供应商凭证、Base URL 和 API Key 由 Admin 后台统一管理；workspace 级 Base URL/API Key 只保留在“高级本地覆盖”折叠区，用于临时接入后端目录之外的模型服务。
- Frontend Agent Model Settings：Agent 设置与 Agent Console 中的默认模型入口已从 “Provider 模型 / Base URL / API Key” 心智收敛为“后端模型路由 + 高级直连覆盖”。后端 AI Gateway 目录是默认路径，直连 Base URL、直连模型 ID 和直连 API key 仅作为临时连接后端目录之外模型服务的高级能力保留；Debug Bundle、配置导入导出和待处理项文案也已改为“模型路由配置”。
- Frontend App Settings External Resources：普通用户侧 App Settings 已不再创建/更新 Pexels、Pixabay API Key；该区块只展示外部资源来源启用状态，并跳转 Admin Provider Instances 管理外部资源 provider credential，同时保留进入“外部资源”搜索页的入口。
- Frontend Model Selector / Error Guidance：普通用户侧模型选择器空态已改为“后端路由模型”语义；全局无可用 AI provider 错误不再提示用户去普通 AI 配置添加 provider，而是提示 Admin 启用 AI Gateway providers 和模型路由。
- Frontend Agent Runtime Terminology：Agent Console、Agent Debug、Agent Settings、运行状态灯、activity feed、approval 影响说明、snapshot/import 文案和 model provider 高级本地覆盖提示中的用户可见文案已收敛到 `Agent Runtime` / `runtime session` / `runtime profile` 语义；内部 `provider-session` protocol key、IPC/query key、client 类型和持久化 schema 仍作为迁移期兼容名保留。

后续决策与扩展：

- Workspace Repository Provider Contract 已覆盖 ensure repository、clone URL、clone URL strategy、Git HTTP proxy target 和远端 access probe；Gitea/local Git HTTP/GitHub Enterprise/GitLab 的 provider 细节已从 handler/service 拼装中继续下沉，Gitea、GitHub Enterprise 与 GitLab Provider Instance test 已能真实探测认证，GitHub Enterprise/GitLab adapter 也已补齐对已有外部用户的 collaborator ensure/access probe 和 Git Smart HTTP proxy。临时授权 clone URL 已由 core backend 统一在 Git proxy 入口实现，避免把每个 Git provider 的 token 生命周期塞回 core。后续需要产品决策的是 GitHub Enterprise/GitLab 的 user 生命周期保持完全外部化，还是新增显式的外部身份映射/邀请流程。
- Health/Test 已从配置存在性检查升级为真实 provider/readiness probe：AI Gateway credential ping、`ai_gateway:商业外部 AI 网关` 聚合目录 readiness、Postgres `PingContext`、Gitea `/api/v1/user` 认证探测、GitHub Enterprise `/api/v3/user` 认证探测、GitLab `/api/v4/user` 认证探测、Gitea/GitHub Enterprise/GitLab collaborator permission probe、pgvector schema/table/count probe、Qdrant collection probe/ensure、MinIO bucket probe、Redis cache round trip、Pexels/Pixabay external resource source probe、Media Processing `external-worker` `/health` probe、Agent Runtime `remote-runtime` `/health` probe 与可选 `/capabilities` probe 都已进入同一套 contract。后续新增 adapter 时继续挂到 contract，不再在 core backend 里写散落的 provider 检查逻辑。
- Vector、media、external resource、agent runtime Provider Contract 已建立接口边界；shot reference service 已通过 `VectorIndexProvider` contract 调用本地 `LocalVectorStore`、pgvector 或 Qdrant adapter，`vector_index:local-index`、`vector_index:pgvector` 和 `vector_index:qdrant` 已进入启动组装、Provider Instance、Admin env overlay 和 ShotReference runtime 注入。Pexels/Pixabay 已有 `ExternalResourceProvider` adapter 和 assembly 构造入口；media processing 已通过 `MediaProcessingProvider` contract 统一组装和测试 control-plane health，`external-worker` 已具备真实 `/health` 连通性探测，后端 resource/runner/backend image 不再自动调用或内置 FFmpeg，复杂剪辑/时间线导出归 Electron desktop runtime，团队云端处理交给外部 media worker；agent runtime 已通过 `AgentRuntimeProvider` contract 统一组装和测试 control-plane health，`remote-runtime` 已具备真实 `/health` 连通性探测、可选 `/capabilities` 动态能力探测，以及按 `movscript.agent-runtime.v1` 固定 endpoint 实现的 core backend session proxy 和 permission decision 审计闭环。后续扩展是把 Mova/app-server 这类桌面 runtime 的更深控制面能力纳入同一套 contract，而不是临时反代猜测路径。

## 14. 不建议做的事

### 14.1 不要重写 商业外部 AI 网关

MovScript 应该通过 AI Gateway Provider Contract 接入 商业外部 AI 网关。除非 商业外部 AI 网关 无法满足核心路由、计费或审计需求，否则不要把模型平台重写一遍。

### 14.2 不要重写 Gitea

MovScript 应该通过 Workspace Repository Provider Contract 接入 Gitea。项目、成员、权限、workspace metadata 属于 MovScript；Git repo、Git HTTP、token、collaborator 属于 Gitea。

### 14.3 不要让插件拥有核心业务语义

插件可以提供能力，但不能定义：

- 什么是 Project。
- 什么是 Resource。
- 什么是 ShotReference。
- 什么是 Candidate。
- 什么是 Selection。
- 什么是 Job 状态机。
- 什么是权限。

### 14.4 不要过早微服务化

当前更重要的是 contract、profile、UI 心智和 provider assembly/descriptor。没有稳定 contract 的微服务只会把混乱从代码移动到网络边界。

## 15. 最终判断

MovScript 后端最终应该是一个“可插拔基础设施的创作平台控制面”。

它的商业化边界不在于自研所有底层服务，而在于：

- 把不同模型、资源、Git、Agent、工作流统一成创作对象。
- 把生成结果纳入候选、选择、采纳和审计流程。
- 把团队权限、素材库、镜头知识库和项目 workspace 连接起来。
- 把本地个人创作和团队协作部署用同一套业务语义打通。

因此后端重构的优先级应该是：

1. 先定语义边界。
2. 再定 profile。
3. 再抽 provider contract。
4. 再做 provider descriptor 和 provider instance 管理。
5. 最后按运行负载拆进程或服务。

这条路线能同时支持本地 Electron 模式、团队云服务模式和商业化复用外部成熟项目。
