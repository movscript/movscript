# Movscript Commercialization Strategy

本文档记录 Movscript 当前阶段的商业化判断，用于后续产品、工程、开源和收费策略推进。

## 结论

Movscript 不适合优先走纯闭源桌面软件路线。更合适的方向是：

> 开源个人版作为获客和生态基础，组织版、托管模型网关、企业能力和生产服务作为主要收费来源。

个人用户应该可以低门槛本地使用，自己配置模型 provider key，完成单人生产流程。团队和组织一旦需要统一管理模型、资源、成员、权限、额度、审计和协作，就应该进入付费路径。

## 当前项目基础

Movscript 已经具备商业化所需的关键骨架：

- local-first 桌面工作台。
- Go backend 承载项目、资源、AI provider、模型配置、任务和权限。
- 后端保存 provider credential，并使用加密字段存储敏感 key。
- OpenAI-compatible model gateway 已经有 API key、scope、project 限制、rate limit 和 monthly budget 设计。
- organization、membership、role、invitation、user group、org quota 已经有基础模型。
- usage log、quota reservation 和 credit pricing 已经可以成为后续计费基础。
- agent、plugin、canvas workflow 已经具备平台化潜力。

这些能力说明，商业化的中心不应是简单隐藏代码，而应是把服务端治理能力产品化。

## 开源与闭源边界

推荐长期保留开源核心：

- 桌面端基础体验。
- 本地 backend。
- 基础项目、剧本、资源、分镜、画布能力。
- 基础 AI provider 配置。
- 基础 model gateway。
- 插件 SDK 和基础插件机制。
- 单人 local personal mode。

商业能力应集中在组织、托管和生产治理：

- 托管 Movscript Cloud。
- 组织级 model gateway 高级策略。
- 组织级 provider key 托管和密钥轮换。
- 成员、席位、角色和高级权限。
- 组织额度、预算、用量报表和成本中心。
- 审计日志、导出和合规能力。
- SSO、SCIM、企业身份集成。
- 高级工作流模板和官方 workflow marketplace。
- 托管任务队列、视频任务 worker、资源存储和备份。
- 企业私有部署、升级、运维和支持。

## 产品版本建议

| 版本 | 代码策略 | 收费策略 | 核心价值 |
| --- | --- | --- | --- |
| Personal Local | 开源 | 免费 | 单人、本地项目、自带 API key |
| Pro Individual | 开源核心 + 可选商业服务 | 低价订阅或一次性 | 个人云同步、高级模板、高级 agent |
| Self-hosted Core | 开源核心 | 免费 | 自部署、自己的 key、核心生产闭环完整 |
| Hosted Cloud | 商业托管服务 | 席位 + 用量 + 存储 | 免部署、托管 key、托管 worker、自动升级 |
| Self-hosted Enterprise | 开源核心 + 商业企业能力 | 年费或商业 license | 全功能私有部署、SSO、合规、专属支持 |
| Enterprise Cloud | 商业合同 | 年费 + 用量 | SSO、合规、托管运维、专属支持 |

## 收费原则

部署、存储、API key 和收费边界的详细设计见 [部署、存储、API Key 与商业边界](deployment-and-commercial-boundaries.md)。本节只记录商业判断。

### 个人不应成为主要收入来源

个人用户更适合作为社区、口碑、插件生态和组织转化入口。个人版应让用户真正跑通核心价值，但不能无限消耗高成本资源。

个人免费版可以保留以下限制：

- 只支持 personal organization。
- 用户自己配置 provider key。
- 本地运行，数据和任务不经过 Movscript 云端，不提供托管 worker、云同步和云存储。
- 基础模板和基础 agent 能力。
- 无团队审计、无组织成本中心、无 SSO。

### 组织应该成为主要付费单元

组织付费的理由不是“多人登录”本身，而是团队会产生明确的治理需求：

- 成员不应该接触 provider raw key。
- 管理员需要统一配置模型和 feature routing。
- 团队需要知道谁在什么时候用哪个模型产生了多少成本。
- 项目资源需要权限隔离。
- AI 生成和 agent 写入需要审计。
- 组织需要预算、额度、风控和停用能力。

因此，非 personal organization 应成为商业化边界。可以允许小团队免费试用，但正式团队功能应该付费。

自部署需要单独划线：Self-hosted Core 可以允许个人或小团队免费使用核心生产能力，但不应默认开放全套企业能力。全功能自部署应归入 Self-hosted Enterprise，通过商业 license、升级包和支持服务收费。

## Model Gateway 作为核心商业产品

Movscript Model Gateway 应成为商业化主轴。

它的价值不是简单代理 OpenAI API，而是为影视/短剧生产团队提供统一模型治理：

- provider key 不下发到成员机器。
- 多 provider、多模型统一路由。
- 按 feature 选择默认模型。
- 按组织、项目、用户、API key 记录 usage。
- 支持 budget、rate limit、scope 和项目限制。
- 对 agent、plugin、canvas workflow、外部工具提供统一入口。
- 失败、重试、debug trace 和脱敏由后端统一处理。

短期可以先把现有 gateway 打磨成自托管团队能力；中长期再推出托管 gateway。

需要明确区分两种 key：

- `Provider Key`：上游模型厂商 key，由后端加密保存，用于调用 OpenAI、Gemini、Kling、Volcengine 等 provider。
- `Gateway API Key`：Movscript 发给 agent、插件、外部工具或自动化脚本的访问凭证，用于进入 Movscript Model Gateway，并受 scope、模型、项目、rate limit 和 budget 控制。

免费本地和免费自部署核心可以使用用户自己的 provider key，但不应内置或下发 Movscript 平台 key。只要调用使用 Movscript 平台 key，或经过 Movscript Cloud Gateway，就必须进入云端计费和限额。

## 与 Cursor 路线的差异

Cursor 选择闭源，核心原因不只是 API key 管理，还包括模型路由、索引、prompt、评测、上下文工程、云服务和产品体验等商业资产。

Movscript 可以借鉴 Cursor 的商业逻辑，但不必复制闭源路线。Movscript 更适合：

- 用开源降低创作者和开发者的采用门槛。
- 用插件和 workflow 建立生态。
- 用组织治理和托管服务收费。
- 用行业生产模板和影视工作流形成差异化。

真正需要保护的资产包括：

- 托管云中的模型路由策略和成本优化。
- 高质量影视/短剧生产 workflow 模板。
- agent 的生产级执行策略、评测和提示词资产。
- 组织治理、审计、额度、成本中心的产品体验。
- 稳定运维能力和企业支持。

## 许可证风险

当前项目使用 MIT License。MIT 对社区友好，但商业防御较弱，第三方可以基于代码构建竞品 SaaS。

可选路径：

- 继续 MIT，优先换取社区扩散和开发者信任。
- 未来将企业版和托管服务代码放在私有仓库。
- 对 server-side 商业能力采用单独许可证。
- 在大量外部贡献进入前，尽早明确 CLA、贡献协议和商业边界。

许可证调整涉及法律风险，正式变更前需要法律意见。

## 工程调整建议

商业能力抽象的接口边界和推荐分层，见 [商业能力抽象设计](commercial-capability-abstraction.md)。

## 当前已落地的产品边界

当前代码已经按“个人默认免费、团队 workspace 进入收费治理”的方向完成第一轮产品化收束：

- 登录后默认进入 personal workspace，团队 workspace 作为高级协作入口显示。
- protected API 会解析并校验当前 workspace membership，前端通过 `X-Org-ID` 传递当前 workspace。
- project、resource、resource folder、canvas、job、gateway API key 已按当前 workspace 隔离。
- 旧的未绑定 `org_id` 的个人数据只在 personal workspace 兼容展示和操作，不混入团队 workspace。
- AI usage reservation 和 usage log 已写入 `org_id`，组织用量页按 organization 聚合。
- chat、canvas、job、model gateway 这些主要 AI 消耗入口会把当前 workspace 写入 billing context。
- 非 personal organization 可通过 `OrgQuota.monthly_budget` 做月度预算控制；super admin 可通过 admin API 设置组织预算。
- Gateway API key 创建、列表、更新和删除按 workspace 隔离，项目级 key 会校验 project 属于当前 workspace。

这不是最终商业版本，但已经具备 Team Self-hosted Beta 的核心收费边界：团队数据隔离、团队用量归集、团队预算控制和 API key 治理。

短期优先做以下产品边界：

1. 明确 `personal organization` 和 `paid organization` 的差异。
2. 为 organization 增加 plan/status 字段，例如 `free`、`team`、`enterprise`、`trialing`、`past_due`。
3. 将 gateway API key 创建、组织级 credential、组织用量报表统一绑定到 org scope。
4. 明确哪些 API 在 personal mode 可用，哪些 API 需要 team plan。
5. 把 provider raw key 管理从普通成员界面隐藏，只允许 owner/admin 操作。
6. 将 usage log 聚合到 organization、project、user、model、gateway key。
7. 为 model gateway 增加组织预算和项目预算检查。
8. 为 agent 和 plugin 调用统一走 gateway，并写入 usage/audit。
9. 将桌面 App 的本地 backend 打包策略产品化，明确 `local_workspace`、`cloud_workspace`、`self_hosted_workspace` 三类 workspace。
10. 明确免费自部署核心不使用 Movscript 平台 key、不使用 Movscript 云端 worker/storage/sync，也不做远程计量。

中期推进：

1. 做自托管 Team Beta。
2. 增加 license/entitlement 检查层。
3. 增加组织计费页和成本中心。
4. 增加审计日志导出。
5. 梳理商业版部署和升级机制。

长期推进：

1. 推出 Movscript Cloud。
2. 托管 provider key、worker、storage 和 workflow marketplace。
3. 推出企业私有部署包。
4. 建立官方模板、插件和生产服务收入。

## 推荐推进顺序

第一阶段：继续保持开源定位，打磨 personal local MVP，让个人用户可以顺利完成主生产闭环。

第二阶段：把现有 organization、gateway、usage、quota、audit 能力收束成 Team Self-hosted Beta。

第三阶段：引入商业 plan/entitlement 机制，明确 personal 免费、organization 收费。

第四阶段：推出 Hosted Cloud，把部署、模型网关、任务 worker、存储、备份和升级变成付费服务。

第五阶段：面向企业补齐 SSO、审计、合规、私有化和专属支持。

## 判断标准

如果某个能力主要提升个人创作体验，应优先开源或放入免费版。

如果某个能力解决组织治理、成本控制、安全合规、多人协作、集中运维或托管可靠性，应优先作为商业能力。

如果某个能力直接形成行业壁垒，例如高质量影视生产模板、稳定 agent 执行策略、模型路由评测和托管任务基础设施，应谨慎开源，可以通过商业服务交付。
