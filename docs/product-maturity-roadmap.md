# Movscript Product Maturity Roadmap

本文档描述 Movscript 从当前技术预览阶段走向成熟产品需要完成的产品、工程、生态与运营里程碑。

## 当前阶段判断

Movscript 当前处于 **pre-alpha / 技术预览版 / 作者工作台雏形** 阶段。

已经具备的基础：

- 桌面端：Electron + React 前端已经形成主要工作台界面。
- 本地后端：Go backend 已经承载项目、资源、AI provider、模型配置、任务和权限雏形。
- AI 能力：已经有多 provider adapter、模型配置、feature routing、用量记录和 OpenAI-compatible model gateway。
- 生产对象：项目、剧本、素材、分集、场景、分镜、镜头、画布、生成任务等核心实体已经存在。
- 本地 Agent：production-runtime、MCP-shaped 工具、planner、draft、memory、debug surface 已经搭起实验框架。
- 插件基础：plugin SDK、CLI、插件 manifest、示例插件已经具备早期形态。

主要缺口：

- 首个稳定用户闭环还不够清晰。
- 普通用户从安装、配置模型到完成一次有效生产流程的路径还不够顺。
- local-first 与团队自托管 backend 的产品边界需要明确。
- 权限、组织、审计、部署、安全和升级能力还没有达到团队采用要求。
- Agent、插件、画布等高级能力仍偏开发者调试状态，需要产品化。

## 产品定位

Movscript 应定位为：

> 一个 local-first 的 AI 影视/短剧生产工作台。个人可以纯本地使用，团队可以自托管 backend 进行协作、模型管理、资源共享和生产任务调度。

不要把产品直接改成纯 SaaS。推荐长期保留三种形态：

- **个人本地版**：单人、低门槛、本地数据、本地模型配置。
- **团队自托管版**：多人、组织/用户组、共享资源、统一模型网关、任务队列、权限和审计。
- **托管云版本**：未来商业化选项，不应成为早期唯一产品形态。

## 核心产品原则

1. **先完成一个强闭环，再扩平台能力**
   - 优先打磨“剧本到生产预览”的主路径。
   - 插件、Agent、画布都应该服务这个闭环，而不是各自独立增长。

2. **前端负责体验，backend 负责关键能力**
   - 前端负责配置、选择、预览、审批和交互。
   - backend 负责 AI key、模型路由、资源、任务、权限、审计和用量。
   - production-runtime 可保留本地直连模型能力，但默认应优先走 Movscript model gateway。

3. **local-first，但不拒绝团队服务化**
   - 单人用户应该能本地跑通。
   - 团队用户应该能自部署一个 backend，让多人连入同一生产系统。

4. **AI 结果必须可审阅、可回滚、可追踪**
   - AI 生成内容不应直接覆盖正式生产数据。
   - 默认进入 draft/candidate/review 流程。
   - 关键写操作需要审计和可追踪来源。

5. **成熟产品要减少概念暴露**
   - 普通用户不应先理解 provider、adapter、runtime、MCP、manifest 才能开始工作。
   - 高级概念可以存在，但默认路径必须简单。

## 成熟产品目标

一个成熟的 Movscript 应至少满足：

- 用户能在 15 分钟内完成安装、登录、模型配置和第一个项目创建。
- 用户能从一个剧本生成结构化生产预览，包括场景/内容单元/分镜建议/关键帧候选。
- 用户能审阅、接受、拒绝或修改 AI 候选结果。
- 用户能把确认后的结果沉淀为项目实体、资源绑定和后续画布工作流。
- 团队能自托管 backend，管理用户组、项目、资源、模型、额度和审计。
- 插件和 Agent 能围绕明确权限模型运行，不破坏项目数据安全。
- 产品可升级、可备份、可诊断，并能稳定处理失败任务。

## 里程碑总览

| 里程碑 | 阶段名称 | 目标 |
| --- | --- | --- |
| M0 | 产品收束 | 明确主闭环、术语、信息架构和技术边界 |
| M1 | 单人 MVP | 个人本地用户能跑通“剧本到生产预览” |
| M2 | 自托管团队 Beta | 团队能部署 backend，多人协作同一个项目 |
| M3 | 生产工作流 Beta | 画布、任务、资源、AI 生成形成可复用生产流程 |
| M4 | 插件与 Agent 平台化 | 插件/Agent 成为可控、可审计、可扩展的能力层 |
| M5 | 成熟产品 | 安装、升级、权限、安全、质量、生态达到长期使用标准 |

## M0：产品收束

目标：从“能力很多的系统雏形”收束为“用户能理解的产品”。

关键任务：

- 确认首个主闭环：`剧本输入 -> AI 结构化分析 -> 生产预览 -> 人工确认 -> 项目实体/资源/画布`。
- 梳理产品术语，统一以下概念：
  - project
  - script
  - segment
  - scene moment
  - storyboard line
  - content unit
  - keyframe candidate
  - asset slot
  - canvas workflow
  - draft / candidate / approved entity
- 明确两种运行模式：
  - local personal mode
  - self-hosted team mode
- 明确 AI 调用边界：
  - 前端不直接成为主业务 AI provider client。
  - backend 是主业务 AI gateway。
  - production-runtime 默认可通过 backend model gateway 调模型。
- 整理导航和首屏信息架构，让用户能从项目进入主要生产流程。
- 为主闭环列出必须保留的页面，暂时弱化或隐藏非核心实验入口。

完成标准：

- README 能用一段话讲清楚 Movscript 是什么。
- 新用户能理解第一个要做的事情是什么。
- 主闭环的页面、数据实体和 API 边界被文档化。
- Debug/实验入口不干扰普通用户主流程。

## M1：单人 MVP

目标：个人用户在本地完成一次有价值的生产流程。

核心用户故事：

> 作为一个短剧创作者，我可以创建项目，输入剧本，让 AI 分析出生产结构，生成分镜/关键帧候选，并人工确认一版可继续制作的生产预览。

关键任务：

- 降低启动门槛：
  - 一键检查依赖。
  - 明确本地 backend、PostgreSQL、MinIO、frontend、runtime 的启动状态。
  - 首次启动引导用户配置加密 key、模型 provider 和第一个模型。
- 打磨项目创建流程：
  - 项目创建后进入明确的 production preview 工作区。
  - 支持粘贴剧本或导入文本。
- 打磨 AI 分析流程：
  - 剧本分析任务状态清晰。
  - 输出 segment、scene moment、content unit、asset gap 等结构。
  - 失败时提供可理解的重试入口。
- 打磨候选结果审阅：
  - 用户能接受、拒绝、修改 storyboard suggestion、keyframe candidate、asset gap。
  - 接受后写入正式项目实体或绑定关系。
- 打磨资源体验：
  - 上传资源。
  - 资源预览。
  - 资源绑定到项目实体。
- 保留基本模型管理：
  - 添加 provider credential。
  - 添加模型配置。
  - 测试模型连通性。
  - 为核心 feature 选择默认模型。

完成标准：

- 干净环境下能按文档启动。
- 用户能用一个测试剧本跑完主闭环。
- AI 生成失败、资源缺失、模型未配置都有明确提示。
- 后端测试和前端 typecheck 可稳定通过。

## M2：自托管团队 Beta

目标：让 Movscript backend 成为可自部署的团队服务。

核心用户故事：

> 作为一个小团队负责人，我可以部署一个 Movscript backend，创建用户组，配置统一模型和资源库，让团队成员共同处理项目。

关键任务：

- 引入组织/工作区模型：
  - organization / workspace
  - user group
  - membership
  - role
- 建立基础权限：
  - instance owner
  - organization admin
  - project admin
  - member
  - viewer
- 明确资源归属：
  - 个人资源
  - 组织资源
  - 项目资源
  - 文件夹权限
- 强化项目协作：
  - 项目成员管理。
  - 成员角色。
  - 项目级读写权限。
  - 关键操作审计。
- 强化模型治理：
  - 组织级 provider credential。
  - 组织级 feature routing。
  - 用户/组额度。
  - usage log 按组织、项目、用户、模型聚合。
- 完善自托管部署：
  - Docker Compose 生产配置。
  - 环境变量文档。
  - 数据备份/恢复说明。
  - 版本升级和 migration 策略。
- 安全基线：
  - backend 默认绑定和 CORS 策略明确。
  - model gateway key 支持 scope、项目限制、模型限制、预算限制。
  - 敏感日志脱敏。

完成标准：

- 一个团队能自部署并创建多个用户。
- 管理员能统一配置模型，成员无需接触 provider key。
- 项目、资源、AI 调用都有基本权限隔离。
- usage 和 audit 能回答“谁在什么时候用哪个模型做了什么”。

## M3：生产工作流 Beta

目标：让 Movscript 从“生成工具”变成“可持续生产工作台”。

关键任务：

- 画布工作流产品化：
  - AI 节点、工具节点、审批节点、插件节点形成稳定交互。
  - 节点运行状态、输入输出、错误、重试清晰可见。
  - 画布运行结果能回写项目草稿或候选结果。
- 任务系统成熟：
  - 异步任务队列稳定。
  - 任务取消、重试、恢复、超时处理。
  - 图像/视频长任务轮询可靠。
  - 任务失败有 provider debug 信息，但默认脱敏。
- 资源生产链成熟：
  - 原始资源、生成资源、资源版本、资源绑定关系清晰。
  - 支持关键帧、参考图、视频片段、音频等生产资产。
  - 支持资源替换和引用追踪。
- 工作流模板：
  - 内置“剧本到分镜”模板。
  - 内置“分镜到关键帧”模板。
  - 内置“关键帧到视频镜头”模板。
  - 支持团队保存和复用 workflow。
- 生产状态看板：
  - 项目进度。
  - 缺失资产。
  - 待审阅候选。
  - 正在运行的 AI 任务。
  - 成本和用量概览。

完成标准：

- 用户能通过可复用 workflow 完成多次生成，而不是每次手工配置。
- 项目有清晰的生产状态。
- 生成内容、资源、任务、实体之间有可追踪关系。

## M4：插件与 Agent 平台化

目标：让插件和 Agent 成为可控扩展能力，而不是开发者实验入口。

关键任务：

- 插件权限模型成熟：
  - manifest 权限标准化。
  - 插件只能访问被授权的 API。
  - 插件执行结果可审计。
  - 高风险能力需要用户或管理员授权。
- 插件体验产品化：
  - 插件安装。
  - 插件启用/禁用。
  - 插件配置。
  - 插件错误展示。
  - 第一方插件示例覆盖真实生产场景。
- Agent runtime 产品化：
  - Agent 默认通过 backend model gateway 获取模型能力。
  - Agent 写操作默认进入 draft/approval。
  - Agent 工具权限可视化。
  - Agent 记忆、草稿、计划、工具调用对用户可理解。
- Debug surface 分层：
  - 普通用户看到简化执行过程。
  - 高级用户和开发者看到 prompt、tool call、raw JSON。
- Agent 能服务主闭环：
  - 解释项目状态。
  - 查找资源和实体。
  - 生成草稿。
  - 提出 production plan。
  - 协助审阅候选结果。

完成标准：

- 插件和 Agent 不再只是 debug 功能。
- 用户能信任 Agent 不会绕过权限直接破坏项目数据。
- 开发者能按文档编写一个可安装、可授权、可调试的插件。

## M5：成熟产品

目标：达到开源产品可长期使用、团队可稳定采用、生态可扩展的状态。

关键任务：

- 安装和发布：
  - 桌面安装包。
  - 后端 Docker image。
  - versioned migration。
  - release notes。
  - 自动更新或明确升级流程。
- 可靠性：
  - 后端集成测试。
  - 前端关键流程 E2E 测试。
  - provider adapter mock 测试。
  - 任务恢复测试。
  - 数据迁移测试。
- 安全：
  - 密钥加密和轮换。
  - 最小权限 model gateway key。
  - 审计日志不可轻易篡改。
  - 插件 sandbox 策略。
  - 自托管安全指南。
- 可观测性：
  - backend health。
  - worker health。
  - storage health。
  - model provider health。
  - job queue metrics。
  - debug export。
- 数据治理：
  - 项目导入/导出。
  - 资源备份/恢复。
  - 删除和归档策略。
  - 跨版本兼容策略。
- 社区和生态：
  - 贡献指南完善。
  - 插件开发文档。
  - workflow 模板规范。
  - 示例项目。
  - demo 数据。

完成标准：

- 新用户可以通过安装包或 Docker Compose 跑起来。
- 团队可以把 Movscript 用在真实项目里，而不是只做演示。
- 开发者可以贡献 provider、插件、workflow、前端页面或 backend 能力。
- 项目能持续发布，升级不会频繁破坏已有数据。

## 横向工作流

以下工作流贯穿所有里程碑。

### 产品体验

- 每个主要页面都要回答：
  - 用户现在在哪个项目？
  - 当前生产阶段是什么？
  - 下一步最自然的操作是什么？
  - 哪些内容来自 AI，哪些已经被人工确认？
- 减少默认暴露的技术概念。
- 保留高级调试入口，但不要让它成为主流程前提。

### 数据模型

- Formal entity 与 draft/candidate 分离。
- AI 输出必须记录来源：
  - feature key
  - model config
  - prompt/input
  - source resources
  - job id
  - accepted/rejected status
- 项目实体要支持版本和回滚策略，至少在关键 AI 写入链路中保留历史。

### AI 与模型网关

- backend 继续作为主业务 AI gateway。
- provider adapter 不应在前端重复实现。
- runtime 可直连模型，但推荐默认走 backend gateway。
- model gateway 要成为 runtime、插件和外部工具的统一模型入口。
- 所有 AI 调用都要逐步具备：
  - 参数校验
  - 预算控制
  - usage logging
  - debug trace
  - 脱敏
  - retry/timeout 策略

### 权限与组织

- 先做简单、可解释的权限。
- 不要过早做复杂 ACL，但要从数据模型上避免以后推倒重来。
- 推荐顺序：
  1. instance owner
  2. workspace / organization
  3. membership
  4. project role
  5. resource folder permission
  6. model/feature/admin 权限

### 工程质量

- 所有主闭环 API 需要后端测试。
- 所有核心前端状态转换需要类型稳定。
- 生成任务、model gateway、权限、资源访问需要重点测试。
- 每个里程碑完成时，应至少运行：
  - backend tests
  - TypeScript typecheck
  - main build path

### 文档

成熟产品至少需要：

- Getting Started
- Local Personal Mode
- Self-hosted Team Mode
- AI Provider Setup
- Model Gateway
- Production Preview Workflow
- Canvas Workflow
- Plugin Development
- Agent Runtime
- Security
- Backup and Restore
- Upgrade Guide

## 推荐优先级

短期优先级：

1. 收束主闭环。
2. 打磨本地单人 MVP。
3. 让模型配置和运行状态对普通用户更顺。
4. 将 production-runtime 默认模型路径向 backend model gateway 靠拢。
5. 明确 organization/user group 的最小数据模型。

中期优先级：

1. 自托管团队 backend。
2. 权限、审计、额度。
3. 资源和任务系统稳定化。
4. 画布 workflow 模板。
5. 插件权限和安装体验。

长期优先级：

1. Agent 产品化。
2. 插件生态。
3. 托管云。
4. 企业安全和运维能力。
5. 社区模板和示例项目。

## 下一步建议

立即可以拆成三组任务：

1. **产品收束任务**
   - 写一份主闭环 PRD。
   - 重整导航和首屏入口。
   - 明确普通用户和高级调试用户的界面分层。

2. **MVP 稳定任务**
   - 让一个剧本样例能稳定跑完 production preview。
   - 修复模型未配置、任务失败、资源缺失时的提示。
   - 补齐主闭环测试。

3. **团队化预研任务**
   - 设计 organization、user group、membership、role 数据模型。
   - 梳理现有 User、ProjectMember、ResourceFolderPermission、GatewayAPIKey 如何迁移。
   - 确认 self-hosted backend 的最小部署形态。
