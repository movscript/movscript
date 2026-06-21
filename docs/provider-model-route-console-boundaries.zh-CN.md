# Provider / Model / Route 与 Console 边界

本文定义 Movscript 在模型调用链路上的权责边界，避免 Frontend、Admin、Hub 与企业扩展在 Provider、Model、Route Group、Route 上互相越权。

## 核心概念

- Provider：上游接入与认证。Provider 层维护 base URL、API Key、adapter family、new-api relay token、本地 credential 与可用性。
- Model：对外稳定模型身份。Model Catalog 定义 Movscript 识别的 public model ID、能力、参数、价格语义和展示信息。
- Route Group：统一线路抽象。Route Group 表示同一业务入口下的线路集合，例如默认线路、低成本线路或高质量线路。
- Route：模型到 provider lane 的绑定。Route binding 决定某个 Catalog Entry 在某个 Route Group 下会进入哪些 provider candidate，以及优先级、容量和启用状态。

字段含义：

- `source_type`：adapter family，例如本地 provider、new-api 或其他兼容网关。
- `provider_id`：Route 选中的 provider lane，由 Provider 层解析实际 credential、base URL 和运行时凭证。
- `credential_id`：数据库兼容字段，只用于历史数据和后端兼容，不作为 Frontend 的配置入口。

## Console 权责

- Movscript Admin：配置与治理权威面。Admin 负责 Provider 接入、Model Catalog、Route Group 与 Route binding 的创建、更新、删除和健康治理。
- Movscript Frontend Agent Console：运行态与工作区视图。Frontend 只读取 Admin 已发布的模型、provider lane 和 route 状态，并让用户选择可用模型。
- Hub Admin Console：生态分发治理面。Hub 管理插件、下载、报告、创作者和扫描，不管理 AI route binding 或 new-api 路由策略。

## Frontend 禁止事项

- Frontend 不创建、更新或删除 route binding。
- Frontend 不保存模型 Provider 的 base URL / API Key override。
- Frontend `agentModelCatalogApi.ts` 只保留读取接口，不导出创建、更新、删除 route binding 的写接口。

## Admin 规则

Admin 的三层页面保持独立：

- Provider 接入页只处理上游接入、凭证和远端模型发现。
- Model Catalog 页维护 Catalog Entry，可从 Provider 获取模型 ID，但不把 Provider discovery 变成 Route mutation。
- Route 页维护 Catalog Entry 到 provider lane 的 route binding。

这个边界让本地开发、社区版、企业版和 Hub 可以共享同一套模型治理语言，同时让 release 与运行时行为更容易验证。
