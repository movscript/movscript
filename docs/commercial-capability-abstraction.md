# 商业能力抽象设计

本文档定义 Movscript 的商业边界抽象层，目标不是“阻止自部署”，而是让开源版、社区自部署版、托管版、企业版共享同一套核心接口，但使用不同实现。

## 设计目标

1. 开源核心保持可运行。
2. 个人自部署保持低门槛。
3. 组织级治理能力可插拔。
4. 托管能力可以替换本地实现。
5. 商业策略尽量在后端强制，而不是前端提示。

## 运行形态

Movscript 至少有四种形态：

- `personal-local`：单人本地使用，自带 key，本地 backend。
- `self-hosted-team`：团队自部署 backend，多人协作。
- `hosted-cloud`：官方托管服务。
- `enterprise-private`：企业私有部署 + 商业授权。

这些形态不对应不同代码仓库，而是对应不同的服务实现和授权状态。

## 抽象分层

### 1. 身份与租户层

统一把“用户、组织、项目、成员、组”视为 subject/scope。

建议抽象：

```go
type SubjectRef struct {
    UserID  uint
    OrgID   *uint
    ProjectID *uint
}
```

需要解决的问题：

- 当前用户处于哪个 org。
- 当前请求属于个人、组织还是项目范围。
- 当前 subject 是否允许访问某个商业能力。

### 2. 权益层

权益层负责回答“能不能用”和“能用到什么程度”。

建议接口：

```go
type EntitlementService interface {
    Resolve(ctx context.Context, subject SubjectRef) (EntitlementSnapshot, error)
    CanUse(ctx context.Context, subject SubjectRef, capability string) (Decision, error)
    CanAccessFeature(ctx context.Context, subject SubjectRef, featureKey string) (Decision, error)
}
```

`EntitlementSnapshot` 应包含：

- plan: `free | team | enterprise | trialing | past_due`
- deployment_mode
- limits
- enabled_capabilities
- commercial_flags

这层不负责计费，只负责资格判断。

### 3. 策略层

策略层负责把权益翻译成具体业务决策。

建议拆成三类策略：

- `GatewayPolicyService`：模型路由、key 可见性、scope 限制。
- `ResourcePolicyService`：资源、文件夹、成员权限。
- `WorkflowPolicyService`：模板、插件、官方市场能力。

建议接口：

```go
type GatewayPolicyService interface {
    ResolveModelAccess(ctx context.Context, subject SubjectRef, featureKey string) (ModelAccessPolicy, error)
    CanSeeRawKey(ctx context.Context, subject SubjectRef, orgID uint) (bool, error)
}
```

### 4. 计量与额度层

计量层负责回答“用了多少、扣多少、是否超额”。

现有 `usage.go` 和 `infra/ai/billing.go` 已经具备雏形，建议把它们收束成统一接口：

```go
type QuotaService interface {
    Estimate(ctx context.Context, subject SubjectRef, req UsageRequest) (UsageEstimate, error)
    Reserve(ctx context.Context, subject SubjectRef, estimate UsageEstimate) (Reservation, error)
    Settle(ctx context.Context, reservationID uint, actual UsageResult) error
    Release(ctx context.Context, reservationID uint, reason string) error
}
```

这里的 `subject` 不应只绑定 `user_id`，还应支持：

- user quota
- org quota
- project quota
- gateway key quota

### 5. 审计层

审计层负责记录“发生了什么”，不参与决策。

建议接口：

```go
type AuditSink interface {
    Record(ctx context.Context, event AuditEvent) error
}
```

审计事件至少要包含：

- actor
- subject
- action
- target
- plan snapshot
- policy decision
- usage refs

## 核心边界

### 开源核心保持开放

建议继续开放：

- 个人组织
- 基础组织 CRUD
- 基础成员关系
- 本地 provider 配置
- 基础 model gateway
- 基础 usage logging
- 基础插件机制
- 基础 audit

### 商业能力放到权益和策略层

建议商业化的不是“组织本身”，而是组织的治理能力：

- 组织级 raw key 托管
- 统一路由和模型选择
- budget / quota / credit
- 审计导出
- SSO / SCIM
- 托管 worker
- 托管存储与备份
- 升级与支持

### 云端独占能力

不应试图在开源包里完整复制的部分：

- 托管 key vault
- 托管任务队列
- 托管资源存储
- 自动升级
- 官方 marketplace 的商业操作
- 企业级 support tooling

## 与现有代码的映射

### `apps/backend/internal/domain/model/organization.go`

现有 `Organization.IsPersonal` 已经是最重要的边界信号。后续建议在此基础上增加：

- `Plan`
- `Status`
- `EntitlementRef`

但不要把全部商业判断塞进 model。

### `apps/backend/internal/app/org`

保留组织 CRUD、成员、邀请、组、usage 聚合。

不要在这里直接写“订阅逻辑”，这里只负责组织域行为。

### `apps/backend/internal/app/modelgateway`

这里应该引入 `GatewayPolicyService`。

职责拆分建议：

- 解析请求上下文
- 调用 policy 判断是否允许
- 计算 billing context
- 转交给 AI service

### `apps/backend/internal/infra/ai/billing.go`

这里应该逐步演进成 `QuotaService` 的底层实现。

它现在已经在做：

- reserve
- settle
- release
- usage log

下一步应把 `user_id` 扩成 `subject`，并把 `org_id / project_id / gateway_key_id` 纳入一致的账本结构。

### `apps/backend/internal/app/audit`

保留纯审计 sink，不做权限判断。

## 建议的数据模型

最少需要这些抽象实体：

```text
Plan
Entitlement
Subscription
LicenseToken
PolicyRule
UsageLedger
AuditEvent
```

建议语义：

- `Plan`：产品层级，如 free/team/enterprise。
- `Entitlement`：某个 subject 实际拥有的能力集合。
- `Subscription`：商业合同或订阅状态。
- `LicenseToken`：私有部署或离线授权。
- `PolicyRule`：模型路由、key、feature、预算规则。
- `UsageLedger`：统一账本。
- `AuditEvent`：不可变事件流。

## 推荐接口边界

建议新增三个包：

- `internal/app/entitlement`
- `internal/app/policy`
- `internal/app/billing`

以及一个基础接口包：

- `internal/domain/commercial`

其中只放接口、枚举和最小 DTO，不放商业实现。

## 实现优先级

### 第一阶段

- 抽出 `EntitlementService`
- 抽出 `GatewayPolicyService`
- 抽出 `QuotaService`
- 保留本地实现

### 第二阶段

- 让 `org`、`modelgateway`、`ai billing` 统一走这些接口
- 把 `personal` 和 `team` 的能力差异收束到 policy

### 第三阶段

- 接入托管实现
- 增加 subscription / license / entitlement storage
- 增加商业版管理页

## 关键原则

1. 不把收费点放在“组织能否存在”上。
2. 把收费点放在“组织是否需要治理、托管和合规”上。
3. 所有商业决策都在后端做。
4. 开源版可以跑完整闭环，但不等于提供所有托管能力。
5. 商业边界优先通过服务实现和授权状态表达，而不是通过前端隐藏按钮。

