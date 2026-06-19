# Provider / Model / Route 与 Console 边界

本文记录当前 Movscript 代码库中 AI provider、model catalog、route binding 的职责边界，以及 Admin、Frontend、Hub 中几个 console 的关系。它描述的是当前代码事实，不是未来接口承诺。

## 核心概念

### Provider：上游接入与认证

Provider 负责连接真实运行时来源，包括 base URL、API key 或 relay token、adapter 类型、启动时装配、健康检查、计费身份解析和转发能力。

社区版中，provider 通常来自本地后台保存的 `AICredential` 或启动期 provider instance。Route 只选择 provider lane；本地 credential 是 Provider 层解析这个 lane 时使用的实现细节。

企业版 runtime overlay 中，AI gateway provider 被收敛到 `new-api`：

- `enterprise/overlays/movscript/apps/backend/internal/infra/config/edition_config_enterprise.go` 读取 `MOVSCRIPT_AI_GATEWAY_PROVIDER`，允许 `builtin`、`local`、`new-api`，并要求配置 `MOVSCRIPT_NEW_API_BASE_URL`。
- `enterprise/overlays/movscript/apps/backend/internal/infra/ai/registry_edition_enterprise.go` 在 `providerMode == "new-api"` 时构建 `NewAPIForwardAdapter`。
- `enterprise/overlays/movscript/apps/backend/internal/infra/ai/adapter_newapi.go` 用 MovScript 用户或组织上下文换取 new-api relay token，再转发到 OpenAI-compatible adapter。

Provider 不应该保存 MovScript 对外暴露的稳定模型身份；它只回答“这个 provider lane 对当前 user/org 怎么连上游、用哪个 token、走哪个上游 group、归属哪个计费身份”。

### Model：对外稳定模型身份

Model 的系统身份由 `AIModelCatalogEntry` 管理，定义在 `movscript/apps/backend/internal/infra/persistence/model/ai_model_catalog.go`。

关键字段：

- `public_model_id`：MovScript 对客户端、业务页面、agent 配置暴露的稳定模型 ID。
- `capabilities`：模型能力，如 text、reasoning、image、video、audio_tts。
- `pricing_mode` 与 credits 字段：MovScript 侧计费语义。
- 输入限制与参数 schema：如 `accepts_image`、`max_input_images`、`supported_params`。

调用方只应依赖 `public_model_id`。Catalog 不保存 provider model id，也不表达线路选择；它只回答“这个 MovScript 模型是什么、能做什么、怎么计费”。

### Route Group：统一线路抽象

Route Group 是 MovScript 的产品线路名，例如 `default`、`standard`、`priority`、`economy`。调用方可以通过 `tier` 或 `route_group` 表达期望线路；后端根据认证上下文得到 user/org，不信任前端直接传入计费主体。

Route Group 不等于 new-api group。Enterprise adapter 可以把 MovScript route group 映射到 new-api group，但这个映射属于 Provider adapter 实现细节。

### Route：模型到 provider lane 的绑定

Route 由 `AIModelRouteBinding` 管理，同样定义在 `ai_model_catalog.go`。

关键字段：

- `catalog_entry_id`：绑定到哪个 catalog entry。
- `source_type`：adapter family，当前支持 `local_provider` 和 `new_api`；它不表达 group，可由后端从 `provider_id` 推导。
- `route_group`：MovScript 线路名，例如 default、priority、economy。
- `provider_id`：Route 选中的 provider lane，例如社区版 `local_provider:12`，企业版 `new_api`。
- `provider_model_id`：实际发给 provider 或 new-api 的模型 ID。
- `credential_id`：数据库兼容字段，仅供社区版 Provider 层由 `provider_id=local_provider:<id>` 回填并读取 credential；Route API 输入和前端状态不再提交它。企业 new-api route 不使用。
- `priority`、`capacity_weight`、`max_concurrency`：多 route 候选和健康策略的输入。

Route 的职责是回答“这个 public model 在当前能力、route group、预算和健康状态下，实际落到哪条 provider lane，并用哪个上游 model id 调用”。

企业版 overlay 明确收紧 route：

- `enterprise/overlays/movscript/apps/backend/internal/app/admin/ai/model_catalog_edition_enterprise.go` 会把 route binding 输入强制成 `source_type=new_api`、`provider_id=new_api`，数据库兼容字段 `credential_id` 保持为空。
- `supportsLocalProviderRouteBindings()` 返回 `false`。
- `supportsNewAPIRouteBindings()` 返回 `true`。

## 运行时调用链

OpenAI-compatible gateway 的典型链路：

```text
客户端请求 model = public_model_id + tier/route_group
  -> ModelGatewayHandler.OpenAIProxy
  -> 后端 auth principal 推导 user/org
  -> gateway.Service.PrepareOpenAIProxy
  -> Catalog 校验 public model、能力、参数和计费语义
  -> Route 根据 catalog_entry_id + route_group 选择 provider lane
  -> Provider 根据 provider lane + user/org 解析 base URL、token、上游 group 和 billing context
  -> Adapter 发起请求
  -> 上游请求 model = route.provider_model_id
```

主要代码入口：

- `movscript/apps/backend/internal/interfaces/http/handler/model_gateway_proxy.go`
- `movscript/apps/backend/internal/app/gateway/service.go`
- `movscript/apps/backend/internal/infra/ai/service_config.go`
- `movscript/apps/backend/internal/infra/ai/service_model_catalog.go`
- `enterprise/overlays/movscript/apps/backend/internal/infra/ai/service_model_catalog_enterprise.go`

### route_tier 与 route_group

外部调用可使用 `X-MovScript-Route-Tier` header，或请求体 / query 中的 `route_tier`、`service_tier`。这些是产品层线路名。Enterprise 的 new-api adapter 会通过 `MOVSCRIPT_NEW_API_ROUTE_GROUP_MAP` 把 MovScript route group 映射到 new-api group。

默认映射：

```text
standard:default,priority:priority,economy:economy
```

相关代码：

- `enterprise/overlays/movscript/apps/backend/internal/interfaces/http/handler/model_gateway_proxy.go`
- `enterprise/overlays/movscript/apps/backend/internal/interfaces/http/handler/models_route_tier_enterprise.go`
- `enterprise/overlays/movscript/apps/backend/internal/app/gateway/api_key_runtime_enterprise.go`

如果 API key 自身设置了 `new_api_group`，它优先于请求中的 route tier。否则系统会尝试用订阅 plan、组织 plan 或充值余额推导 new-api group。

## Admin 与 Frontend Console 的关系

当前代码里有多个名为 console 或类似 console 的产品面，它们不是同一层。

### Movscript Admin：配置与治理权威面

路径：

- `movscript/apps/admin`
- 企业 overlay：`enterprise/overlays/movscript/apps/admin`

Admin 是 provider / catalog / route 的权威配置面。社区版和企业版共用同一组三层页面；企业版只是在 Provider 接入和 Route 线路上叠加 new-api、SSO、quota ownership 和 route tier 等扩展：

- `/models/providers`：Provider 接入。社区版维护本地 provider credential、provider instance、Base URL、API key 和连接测试；企业版只读展示 new-api 接入状态、SSO、quota 来源和计量状态，不在 Enterprise Admin 执行 provider 配置动作。
- `/models/catalog`：Model Catalog，维护 `AIModelCatalogEntry`，即稳定 model id、能力、参数、价格语义。Catalog 可以从 Provider 层获取模型 ID：社区版从 credential 的 remote models 读取，企业版从 new-api group models 读取；Catalog 只形成和编辑模型列表，不配置路由策略。
- `/models/routes`：Route 线路，维护 `AIModelRouteBinding`。社区版绑定 catalog entry 到 provider lane；企业版绑定 catalog entry 到 `new_api` provider lane，并由 adapter 把 route tier 映射到 new-api group。Route 是 catalog 路由策略的唯一配置面。

关键文件：

- `enterprise/overlays/movscript/apps/admin/src/edition/enterprise.tsx`
- `enterprise/overlays/movscript/apps/admin/src/pages/enterprise/EnterpriseAIConfigPages.tsx`
- `enterprise/overlays/movscript/apps/admin/src/pages/enterprise/NewAPIConsolePage.tsx`
- `movscript/apps/admin/src/pages/admin/AdminPage.tsx`

边界规则：

- Admin 可以创建、更新、删除 catalog entry 和 route binding。
- Admin 可以查看并配置 provider instance / new-api 集成状态。
- Admin 是运营和治理入口，不应该被桌面 Frontend 的运行态设置替代。

### Movscript Frontend Agent Console：运行态与工作区视图

路径：

- `movscript/apps/frontend/src/features/agent/components/AgentConsolePage.tsx`
- `movscript/apps/frontend/src/features/agent/components/ModelProvidersPage.tsx`
- `movscript/apps/frontend/src/features/agent/application/agentModelCatalogApi.ts`

Frontend Agent Console 是用户状态面，只聚合当前 workspace 下用户关心的 Agent 状态，包括：

- 当前 Agent 是谁、是否可用、是否需要用户处理。
- 当前会话、Run、工具、Skill、Plugin 的健康摘要。
- Conversation 与内部 thread binding 的恢复状态。
- 指向 Agent 设置、连接诊断和 Skills/Tools 的入口。

边界规则：

- Frontend 可以读取 catalog 和 route 信息用于展示、诊断、选择，但这些信息不再作为 Agent Console 的一等 tab。
- Frontend 不创建、更新或删除 route binding；`ModelProvidersPage` 仅作为只读治理视图，配置变更在 Admin 完成。
- Frontend 不保存模型 Provider 的 base URL / API Key override；这些入口属于 Admin Provider 接入层。
- SDK package、runtime host、home/config 投影等细节属于系统后台或具体 Agent 的高级连接配置，不是 Console 主入口。
- 业务页面应该消费已经配置好的能力和 public model id，不应该直接承担 provider 或 new-api 治理。

### Hub Admin Console：生态分发治理面

路径：

- `enterprise/apps/hub/src/app/admin/page.tsx`
- `enterprise/apps/hub/src/components/hub/admin-console.tsx`

Hub Admin Console 管的是 Hub 包分发和审核：

- 包审核、上架、拒绝、下架。
- 下载审计。
- 举报处理。
- 创作者认证。
- 包扫描和企业桌面发版状态。

边界规则：

- Hub Admin 不管理 AI provider、model catalog、route binding。
- 它通过 Next route handler 代理 `/api/hub/admin/*` 到后端 hub API。
- 它和 Movscript Admin 都有“admin”语义，但产品域不同：一个是生态分发治理，一个是平台运营和 AI gateway 治理。

## 当前推荐边界

| 层 | 拥有内容 | 不应拥有内容 |
| --- | --- | --- |
| Provider | 上游连接、认证、adapter、token、计费身份、健康检查 | public model id、业务模型能力语义 |
| Catalog Entry | public model id、能力、参数、价格 | provider model id、具体 credential、请求用户的线路选择 |
| Route Binding | catalog 到 route group / provider lane 的绑定、provider model id、优先级和容量 | 模型能力定义、provider secret、token 解析 |
| Movscript Admin | 全局 provider/catalog/route 配置与运营治理 | workspace-local agent 运行状态 |
| Frontend Agent Console | 当前 Agent、会话状态、能力摘要、待处理事项、连接诊断入口 | 全局 provider/catalog/route 治理配置、runtime 选择器、进程生命周期总控 |
| Hub Admin Console | Hub 包审核、举报、下载审计、发版 | AI gateway provider/model/route |
| new-api Console | 上游渠道、quota、new-api 自身管理 | MovScript catalog public model id 语义 |

## 判断新功能归属

新增功能时可以按这些问题判断落点：

1. 是否改变所有用户可见的模型 ID、能力、参数或价格语义？
   - 是：放 Admin Catalog。
2. 是否改变某个模型请求会走哪个 route group / provider lane？
   - 是：放 Admin Route。
3. 是否改变上游网关连接、token、SSO、quota ownership 或 provider lane 如何解析 credential/token？
   - 是：Community 放 Admin Provider；Enterprise 展示 new-api 状态，实际上游动作留在 new-api。
4. 是否只影响当前桌面 workspace 或当前 agent SDK runtime？
   - 是：放 Frontend Agent Console 或 workspace settings。
5. 是否是 Hub 包审核、创作者认证、下载审计或发版？
   - 是：放 Hub Admin Console。

## 已确定的线路优先级

- 如果 API key 自身设置了 `new_api_group`，它是固定上游分组，优先于请求中的 `route_tier` 或 `route_group`。
- 如果 API key 没有固定 `new_api_group`，后端使用请求中的 `route_tier` / `route_group` 选择 MovScript route group，再由 Enterprise adapter 映射到 new-api group。
- 如果请求没有提供 tier，后端使用默认 route group；Enterprise adapter 再根据订阅 plan、组织 plan 或充值余额解析 new-api group。
