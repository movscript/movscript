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
Order
Invoice
PaymentIntent
WalletSnapshot
LicenseToken
PolicyRule
UsageLedger
AuditEvent
```

建议语义：

- `Plan`：产品层级，如 free/team/enterprise。
- `Entitlement`：某个 subject 实际拥有的能力集合。
- `Subscription`：商业合同或订阅状态。
- `WalletSnapshot`：账户余额与冻结金额快照。
- `PaymentIntent`：收款渠道的一次支付意图。
- `Order` / `Invoice`：交易单据与账单。
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

## 企业实现仓库边界

当前工程方向调整为：

- `movscript` 仓库构建社区版。
- `enterprise` 仓库构建商业版。
- `movscript` 仓库只保留商业能力的共享接口、共享数据模型字段和社区实现。
- 社区版不创建 `user_quota`、`org_quota`、钱包、订单、支付、发票表。
- 新的商业实现、企业路由、企业部署脚本和商业授权逻辑应进入 `enterprise` 仓库的 MovScript overlay。

因此，社区仓中的 `//go:build enterprise` 文件只作为迁移期遗留存在。后续不要继续在社区仓新增企业实现文件；如果需要新增商业能力，应先在社区仓补稳定接口或社区默认实现，再在 enterprise overlay 中实现商业版本。

目标构建关系：

```text
movscript                         -> community build
enterprise + movscript checkout   -> enterprise build
```

`enterprise` 仓库当前通过 `overlays/movscript` 叠加商业文件，并用 `-tags enterprise` 产出商业后端。

## 条件编译与企业 Overlay

第一步落地采用“社区默认实现 + 企业 overlay 替换”的方式：

```text
apps/backend/internal/domain/commercial/
  commercial.go              # 稳定接口、枚举、DTO，社区版和企业版共享

apps/backend/internal/app/entitlement/
  service.go                 # 对外构造函数
  edition_community.go       # //go:build !enterprise，社区默认实现

enterprise/overlays/backend/
  internal/app/entitlement/
    edition_enterprise.go    # //go:build enterprise，企业实现
```

社区版必须始终满足：

- 不依赖 `enterprise/` 目录。
- 不需要 license 即可编译和运行。
- `go build ./cmd/server` 使用 `!enterprise` 默认实现。
- 默认实现可以返回 plan/status/capability 快照，但不得开启平台 key、远程计量、托管 worker/storage、SSO/SCIM、审计导出等企业能力。

企业版构建时由发布脚本把 `enterprise/overlays/backend` 中的同路径文件覆盖或挂载到 `apps/backend` module 内，再执行：

```bash
go build -tags enterprise ./cmd/server
```

由于 Go 的 `internal/` 规则，企业后端实现不能作为旁边独立 Go module 直接 import `apps/backend/internal/...`。企业实现要么以 overlay 方式进入同一个 module 编译，要么通过 RPC/进程级插件与社区 backend 通信。短期推荐 overlay，后续如果商业能力需要独立部署，再拆 RPC 边界。

插件机制用于扩展商业模板、workflow、Hub 分发和企业 UI，不用于单独强制 license、扣费、预算、provider raw key 可见性等核心商业判断。这些判断必须落在 `EntitlementService`、`GatewayPolicyService`、`QuotaService` 和 `AuditSink` 一类后端接口上。

## 当前已落地的社区版切口

社区版已经先落了一个最小可演进切口：

- `internal/domain/commercial`：商业边界接口和 DTO。
- `internal/app/entitlement`：社区默认权益实现。
- `GET /api/v1/entitlement`：返回当前 workspace 的 entitlement snapshot。
- `MOVSCRIPT_DEPLOYMENT_MODE`：显式区分 `personal-local`、`self-hosted-team` 等部署模式。

这个切口不引入企业依赖，不影响 `go build ./cmd/server`，后续企业版只要覆盖同路径实现即可。

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
