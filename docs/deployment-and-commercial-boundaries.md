# 部署、存储、API Key 与商业边界

本文档定义 Movscript 在本地、云端、自部署三类运行形态下的产品边界。核心目标是把“代码是否开源”“谁部署”“数据存在哪里”“使用谁的 AI API key”“请求是否经过 Movscript 平台”这几个问题分开，避免把开源模式、云服务成本和商业订阅混在一起。

## 基本原则

商业边界不应该由“是否开源”单独决定，而应该由以下因素共同决定：

```text
是否使用 Movscript 云端 backend
是否使用 Movscript 平台 API key
是否使用 Movscript 云端 worker / storage / sync
是否使用 Movscript 托管 model gateway
是否使用团队治理、预算、审计、SSO 等商业能力
```

如果用户完全本地运行、完全使用自己的 provider key、数据和任务都不经过 Movscript 云端，Movscript 不承担持续资源成本，这部分应该作为开源免费核心。

如果用户请求经过 Movscript 平台，或者使用平台 key、托管存储、托管 worker、云同步、托管 gateway、企业治理能力，就进入收费边界。

## 运行形态

### 1. Personal Local

个人本地模式是开源获客和信任基础。

```text
部署：桌面 App 内置本地 backend
存储：本地数据库 / 本地文件 / 可选本地对象存储
AI key：用户自己的 provider key
AI 调用：本地 backend 直接调用上游 provider
Movscript 云资源：不使用
收费：免费
```

该模式应能完整跑通单人创作闭环，包括项目、剧本、资源、分镜、画布、基础 AI 配置、基础插件和基础 agent。

### 2. Cloud Personal

个人云端模式是可选增值服务。

```text
部署：Movscript Cloud
存储：Movscript 云端存储 / 云同步
AI key：平台 key 或用户 BYOK
AI 调用：经过 Movscript Cloud Gateway
Movscript 云资源：使用
收费：订阅、credits、存储或增值服务收费
```

如果使用平台 key，Movscript 承担上游模型成本，必须按 credits 或用量收费。

如果使用 BYOK，用户承担上游模型成本，但 Movscript 仍提供托管网关、密钥托管、同步、备份、审计等服务，因此仍可收取订阅费。

### 3. Team Cloud

团队云端模式是主要商业化产品。

```text
部署：Movscript Cloud
存储：Movscript 云端组织空间
AI key：平台 key、组织 BYOK 或二者混合
AI 调用：统一经过组织级 Model Gateway
Movscript 云资源：使用
收费：席位 + 用量 + 存储 + 高级治理能力
```

团队付费理由不是“多人登录”本身，而是组织治理：

- provider raw key 不下发给成员。
- 管理员统一配置模型、feature routing 和默认模型。
- 按组织、项目、用户、gateway key 记录用量。
- 支持预算、rate limit、scope、项目限制和停用。
- 支持审计、成本中心、资源权限和协作。

### 4. Self-hosted Core

自部署开源核心应尽量免费，且不要远程管控。但它不等于全功能免费版，而是“核心生产闭环完整、企业商业能力不全开”。

```text
部署：用户或组织自己部署
存储：用户自己的数据库、对象存储和文件系统
AI key：用户或组织自己的 provider key
AI 调用：用户自己的 backend 直接调用上游 provider
Movscript 云资源：不使用
收费：基础核心免费
```

这部分不建议远程计量或强制授权，否则会损害开源信任，也会增加隐私、合规、销售和支持成本。

Self-hosted Core 应该包含：

- 自部署 backend。
- 自己的数据库、对象存储和文件系统。
- 项目、剧本、资源、分镜、画布等核心生产能力。
- 基础 AI provider key 配置。
- 基础模型配置和基础 feature routing。
- 基础 model gateway。
- 基础插件机制。
- 单人或小团队的基础协作。
- 基础 usage logging。

Self-hosted Core 不应默认包含：

- SSO / SCIM。
- 高级组织权限和复杂角色策略。
- 高级审计导出和合规报表。
- 成本中心和复杂预算策略。
- 企业级 key rotation 和 vault/KMS 集成。
- 高级 gateway policy。
- 企业部署、升级、迁移和运维工具。
- 官方商业模板市场。
- 商业 worker 编排。
- SLA、专属支持和培训服务。

### 5. Self-hosted Enterprise

企业自部署是自部署全功能版本。它可以收费，但收费点不是“运行开源代码”，而是商业治理、合规、升级和支持。

```text
部署：客户私有环境
存储：客户自己的数据库、对象存储、KMS/HSM
AI key：客户自己的 provider key 或企业 vault
AI 调用：客户私有 gateway
Movscript 云资源：默认不使用，可选连接商业服务
收费：license、企业能力、升级包、支持和专属服务
```

可收费能力包括：

- SSO / SCIM。
- 高级组织权限。
- 审计导出和合规报表。
- 高级 gateway policy。
- 成本中心和预算中心。
- 离线 license。
- 企业升级包和迁移工具。
- 官方模板、workflow marketplace 和商业 worker。
- 专属支持、培训和运维服务。

## Workspace 类型

不要把“本地存储”设计成一个简单开关。更推荐把用户选择抽象成 workspace 类型：

```text
local_workspace
cloud_workspace
self_hosted_workspace
```

每个 workspace 决定：

- backend endpoint。
- storage backend。
- credential storage。
- model gateway 来源。
- sync 行为。
- billing policy。
- entitlement policy。
- audit policy。

首次启动桌面 App 时可以让用户选择：

| 选项 | 说明 | 默认收费 |
| --- | --- | --- |
| 本地工作区 | 数据存在本机，使用自己的 AI API key，本地 backend 执行 | 免费 |
| 云端工作区 | 数据同步到 Movscript Cloud，可协作，可用平台 credits 或 BYOK | 收费 |
| 连接自部署服务 | 连接团队自己的 backend、存储和 key | 开源核心免费，企业能力收费 |

## API Key 边界

需要明确区分三类 key。

### Provider Key

Provider key 是上游模型厂商 key，例如 OpenAI、Gemini、Kling、Volcengine。

```text
用途：调用上游模型厂商
存储：后端加密保存
可见性：只显示 masked key
普通成员：不应看到 raw key
```

在本地模式和自部署核心模式中，provider key 来自用户自己。

在云端模式中，provider key 可以来自 Movscript 平台，也可以来自用户或组织 BYOK。

### Platform Key

Platform key 是 Movscript 自己持有并用于云端服务的 provider key。

```text
用途：Movscript Cloud 替用户调用上游模型
成本：Movscript 承担上游模型账单
收费：必须按 credits / 用量 / 套餐收费
```

平台 key 不应进入免费自部署核心版。自部署用户如果要使用平台 key，调用必须经过 Movscript Cloud Gateway，并按云端服务计费。

### Gateway API Key

Gateway API Key 是 Movscript 发给 agent、插件、外部工具或自动化脚本的访问凭证。

```text
用途：访问 Movscript Model Gateway
存储：只保存 hash，raw key 只返回一次
控制：scope、allowed models、project、rate limit、monthly budget
```

它不是上游 provider key，而是消费侧入口。所有外部工具和 agent 应尽量通过 Gateway API Key 进入 Movscript 的统一治理链路。

## AI 配置关系

推荐关系如下：

```text
Organization / User / Project
        |
        v
Entitlement / Plan / Policy
        |
        v
Gateway API Key / User Session
        |
        v
AI Call Endpoint
        |
        v
FeatureConfig / Capability / Model Routing
        |
        v
AIModelConfig
        |
        v
AICredential
        |
        v
Upstream Provider API
```

不要让业务调用直接持有 provider key。业务调用应先经过身份、权益、策略、额度、路由，再解析到具体模型配置和上游凭证。

## 存储与计算边界

“本地存储”本身不自动等于免费，真正要看是否使用了 Movscript 云资源。

| 数据存储 | 任务计算 | AI key | 请求路径 | 收费判断 |
| --- | --- | --- | --- | --- |
| 本地 | 本地 backend | 用户自己的 key | 本地直接到 provider | 免费 |
| 本地 | 本地 backend | 平台 key | 经过 Movscript Cloud Gateway | 收费 |
| 本地 | 云端 worker | 平台 key 或 BYOK | 经过 Movscript Cloud | 收费 |
| 云端 | 云端 backend | 平台 key 或 BYOK | 经过 Movscript Cloud | 收费 |
| 自部署 | 自部署 backend | 客户自己的 key | 客户环境直接到 provider | 开源核心免费 |
| 自部署 | 自部署 backend | 客户自己的 key | 企业商业能力启用 | license / 支持收费 |

## 桌面 App 打包策略

Movscript 桌面 App 应内置本地 backend，使 Personal Local 可以开箱即用。

推荐结构：

```text
Electron Desktop Shell
        |
        v
Bundled Local Backend
        |
        v
Local SQLite/PostgreSQL + Local Files/Object Storage
        |
        v
User Provider Key -> Upstream AI Provider
```

同一套 Go backend 应支持不同部署模式：

```text
DEPLOYMENT_MODE=personal-local
DEPLOYMENT_MODE=hosted-cloud
DEPLOYMENT_MODE=self-hosted-team
DEPLOYMENT_MODE=enterprise-private
```

不同部署模式复用核心代码，但在以下方面使用不同实现：

- 身份和租户。
- credential storage。
- storage backend。
- worker backend。
- billing policy。
- entitlement policy。
- audit policy。

## 收费规则

推荐使用这条总规则：

> 凡是请求经过 Movscript 平台、使用 Movscript 平台 key、使用 Movscript 托管存储/同步/worker/gateway，或使用企业治理能力，都收费；凡是用户完全本地或自部署运行、完全使用自己的 key、只使用开源核心，尽量不管也不收费。

对应产品边界：

| 模式 | 部署 | 存储 | Key 来源 | 是否收费 |
| --- | --- | --- | --- | --- |
| Personal Local OSS | 用户本地 | 本地 | 用户自己的 key | 免费 |
| Self-hosted Core | 用户或组织自部署 | 客户自己 | 客户自己的 key | 免费 |
| Cloud Personal | Movscript Cloud | 云端或同步 | 平台 key / BYOK | 收费 |
| Team Cloud | Movscript Cloud | 云端组织空间 | 平台 key / 组织 BYOK | 收费 |
| Self-hosted Enterprise | 客户私有部署 | 客户自己 | 客户自己的 key / 企业 vault | 收费 |

## 当前代码映射

当前代码已经有可承接这套边界的基础：

- `AICredential`：上游 provider credential，加密保存 provider key。
- `AIModelConfig`：启用的模型、能力、价格、参数和优先级。
- `FeatureConfig`：业务功能到模型的路由配置。
- `GatewayAPIKey`：Movscript model gateway 的消费侧 key，支持 scope、模型、项目、速率和月预算。
- `UsageLog` / `UsageReservation`：用量记录、预扣和结算。
- `Organization.IsPersonal`：区分个人组织和团队/商业组织的重要信号。

后续应继续把商业策略放到 entitlement、policy、quota、audit 层，而不是散落在 handler 或前端页面里。
