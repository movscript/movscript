# MovScript 后端职责与边界审视

本文记录当前对 `movscript` 系统职责的阶段性判断，供后续继续讨论产品定位、后端拆分、管理台信息架构和前端心智模型时使用。

范围限定：

- `apps/backend`：当前系统后端。
- `apps/admin`：当前系统管理层。
- `apps/frontend`：当前用户前端与 Electron 桌面端。
- 不包含 `商业外部 AI 网关`。

## 核心判断

当前 backend 已经不是单纯的 API provider、AI 聚合器或对象存储服务。它实际承担的是 MovScript 的平台控制面：

> MovScript Platform Backend：统一管理 AI 能力、媒体资产、项目工作区、创作知识、工作流执行、插件生态、组织权限和运营审计的平台后端。

因此目前的混乱不在于“后端功能多”本身，而在于这些职责没有在产品语言、配置入口和 UI 层级中被清晰拆开。用户、管理员、开发者会同时看到 API key、provider、model、storage、resource、agent runtime、workspace、gateway 等概念，但这些概念属于不同层。

## 当前三端定位

### 已收敛的边界：Admin 渲染归 Electron，Backend 只保留 Admin API

本轮重构后的边界应明确为：

- `apps/backend` 不再负责 Admin SPA 的静态托管。
- `apps/backend` 继续提供 `/api/v1/admin/*` 管理 API、权限校验、审计、配置和平台控制面能力。
- `apps/admin` 是可独立构建的 Admin 前端应用。
- `apps/frontend` 的 Electron 主进程负责在本地/桌面形态下加载和打开 Admin 窗口。
- 打包时，Admin 构建产物作为 Electron `extraResources/admin` 随桌面端分发，而不是被塞进 backend binary 目录。

这个决策解决了“本地一体态重启谁”的问题：如果只是 Admin 前端改版，重新打包/重启 Electron 即可；backend 不应该因为 Admin 静态资源变更而重启。backend 的生命周期只跟 API、数据、运行时依赖和服务配置相关。

本地模式下：

- Electron 启动本地 backend。
- Electron 通过本地 Admin 窗口渲染管理台。
- Admin 前端通过 `apiBaseURL` 指向本地 backend，例如 `http://localhost:8766`。
- backend 只接受 API 请求，不知道也不关心 Admin 前端文件在哪里。

团队/云服务模式下：

- Electron 仍然可以加载本地随包分发的 Admin 前端。
- Admin 前端通过 `apiBaseURL` 指向团队 backend。
- 团队 backend 继续只暴露管理 API 和平台控制面能力。
- 如果未来需要 Web Admin 部署，应由独立前端静态站点/CDN/网关托管，而不是重新放回 backend。

因此，`AdminStaticDir`、`MOVSCRIPT_ADMIN_DIR` 和 backend `/admin` 静态路由都不应该再出现。`/admin` 在前端侧只表示 Admin 应用内路由或历史 Web 部署 basename，不再是 backend 的页面托管职责。

### Admin

`apps/admin` 是系统管理层。

它应该面向管理员，负责：

- AI provider 凭证。
- 模型配置。
- 模型网关 key。
- 用户、组织、项目管理。
- 资源存储维护。
- 镜头向量索引维护。
- 用量、审计、debug、health。
- 云文件配置和外部资源源配置。

Admin 不应该被普通创作者理解为日常工作区。

### Backend

`apps/backend` 是可信控制面和业务运行时。

它负责持久化敏感凭证、权限、资产、项目、任务、审计、运行状态，并对外提供 API、OpenAI-compatible gateway 和业务服务。

当前 backend 不只是一个 AI gateway，而是多个业务域的聚合平台。

### Frontend

`apps/frontend` 是用户工作台 + Electron 壳 + agent runtime 编排层。

它目前同时像：

- Web client：连接 backend API。
- Desktop app：启动本地 backend、管理本地文件和终端。
- Agent runtime manager：配置 Mova/Codex app-server。
- Workspace client：操作项目、资源、画布、镜头库。

问题在于 frontend 里也出现 provider、model、baseURL、API key、agent settings 等入口，容易和 admin 的 AI provider 管理混淆。

建议未来明确：

- 普通用户只选择模型和工作流偏好。
- API key、baseURL、provider credential 默认由 admin/backend 管。
- 直接配置 provider runtime 应放入专家模式或开发者模式。

## Backend 当前职责盘点

### 1. 身份与组织控制面

相关能力：

- 用户账号。
- 登录 session。
- 注册、登录、验证码。
- 个人组织。
- 团队组织。
- 组织成员、角色。
- 用户组。
- 邀请码和邀请链接。
- 系统角色。

代表模型：

- `User`
- `AuthSession`
- `AuthChallenge`
- `Organization`
- `OrganizationMember`
- `UserGroup`
- `OrgInvitation`

这部分使 backend 成为多租户身份系统。

### 2. AI Provider 与 Model Gateway

相关能力：

- 上游 provider 凭证。
- adapter 类型。
- 模型配置。
- 模型能力、价格、并发、优先级。
- 模型路由。
- OpenAI-compatible `/v1` gateway。
- Gateway API key。
- 模型调用日志。
- 用量记录与 reservation。

代表模型：

- `AICredential`
- `AIModelConfig`
- `GatewayAPIKey`
- `UsageLog`
- `UsageReservation`
- `LLMCallLog`

这部分使 backend 成为 AI 控制面和模型网关。

重要区分：

- Admin 的 provider 指上游 AI provider。
- Frontend 的 provider 常指 agent provider runtime，例如 Mova/Codex app-server。
- 这两个概念需要在产品命名里分开。

### 3. Blob Store 与 Resource Asset Library

相关能力：

- MinIO/filesystem 对象存储适配。
- 文件上传。
- Range file serving。
- Blob hash 去重。
- Resource 元数据。
- 文件夹。
- 个人/组织资源范围。
- 资源共享。
- 资源引用保护。
- 派生资源关系。
- 图片验证。
- 视频浏览器兼容转换。

代表模型：

- `RawResource`
- `ResourceBlob`
- `ResourceDerivative`
- `ResourceFolder`
- `ResourceFolderPermission`

重要区分：

- MinIO/filesystem 是 Blob Store，只回答“文件放在哪里”。
- Resource 是 Asset Library，只回答“这个文件在产品中是什么资产、谁拥有、能否使用和删除”。

MinIO 不应该在普通用户心智里出现。普通用户看到的是素材库或资源库。

### 4. Shot Knowledge Base

相关能力：

- 从视频资源创建镜头参考。
- Shot reference group。
- 单个 shot reference。
- 手动拆镜头。
- 镜头语义字段。
- 检索文本。
- 向量文档。
- 向量索引统计、搜索、重建。

代表模型：

- `ShotReferenceGroup`
- `ShotReference`
- `ShotVectorDocument`

Shot Library 不是存储系统，而是建立在 Resource 之上的创作知识库。

它保存的是：

- intent
- pattern
- shot function
- visual preference
- emotional effect
- execution details
- visual analysis
- scene semantics
- narrative function
- reusable pattern
- retrieval text

因此它应该被产品语言称为镜头知识库或镜头参考库，而不是存储配置。

### 5. Project 与 Workspace/Git 后端

相关能力：

- 项目。
- 项目成员。
- 项目角色。
- 项目工作区元数据。
- Git repository binding。
- Gitea 后端。
- local git HTTP 后端。
- `/projects/:id/git/*` Git proxy。

代表模型：

- `Project`
- `ProjectMember`
- `ProjectRepository`

这部分使 backend 承担 workspace backend，而不仅是业务数据库。

### 6. 创作决策存储

相关能力：

- Project 级 decision context。
- 候选结果。
- selection。
- target kind/ref。

代表模型：

- `DecisionContext`

这部分保存创作流程中的“候选与选择”，是生成式工作流的重要状态。

### 7. Canvas 与 Workflow Runtime

相关能力：

- Canvas。
- React Flow nodes/edges。
- workflow canvas。
- canvas run。
- canvas task。
- canvas output。
- workflow template。
- canvas runtime text。
- 节点模型诊断。

代表模型：

- `Canvas`
- `CanvasNode`
- `CanvasEdge`
- `CanvasRun`
- `CanvasTask`
- `CanvasOutput`

这部分已经接近轻量工作流引擎。

### 8. 异步 Job 系统

相关能力：

- 图片/视频/生成任务。
- provider task 状态。
- retry。
- lease/lock。
- heartbeat。
- input/output resource。
- usage reservation。
- debug state。

代表模型：

- `Job`

这部分是生成任务编排层，不应混同于普通 API 调用。

### 9. 插件、Registry、Workflow Market、Hub

相关能力：

- 插件安装。
- 插件启用/禁用。
- 插件工具索引。
- 插件 secret。
- card/canvas node/workflow contributions。
- workflow template marketplace。
- registry proxy。
- hub package 发布和下载。

代表模型：

- `Plugin`
- `PluginTool`
- `PluginSecret`
- `HubPackage`

这部分使 backend 承担扩展生态和市场分发能力。

### 10. 外部资源与云文件中转

相关能力：

- Pexels/Pixabay 外部媒体搜索源。
- 加密保存外部资源 provider 配置。
- 云文件配置，例如 S3/OSS/TOS 类型。
- 生成调用时把内部资源转成外部模型可访问的 URL/file。

代表模型：

- `ExternalResourceSource`
- `CloudFileConfig`

这部分服务于素材发现和模型调用，不是核心对象存储。

### 11. 运营、审计、可观测性

相关能力：

- Audit log。
- Usage log。
- LLM call log。
- agent telemetry。
- HTTP metrics。
- vector metrics。
- debug health。
- 管理台 overview。

代表模型：

- `AuditLog`
- `UsageLog`
- `UsageReservation`
- `LLMCallLog`

这部分使 backend 具备运营后台属性。

## 当前心智混乱来源

### 1. Provider 一词被多处复用

至少有三类 provider：

- AI provider：OpenAI、Claude、Gemini、Kling、Volcen 等上游。
- Agent provider runtime：Mova/Codex app-server。
- Storage/provider dependency：MinIO、filesystem、Gitea、Redis、商业外部 AI 网关 等部署依赖。

建议命名分开：

- AI provider / 模型供应商
- Agent runtime / Agent 执行环境
- Infrastructure provider / 基础设施后端

### 2. API key 概念混杂

至少有几种 key：

- 上游 AI provider key。
- backend model gateway key。
- frontend/app-server runtime key。
- cloud file key。
- external resource provider key。
- auth session token。

建议普通用户只看到“账号已连接”“模型可用”。管理员才看 key。

### 3. Storage 与 Resource 混在一起

MinIO 是对象存储，Resource 是业务资产，Shot Library 是创作知识库。

建议产品层命名：

- 存储后端：管理员部署配置。
- 素材库/资源库：用户资产管理。
- 镜头库/镜头知识库：创作参考和检索。

### 4. Frontend 不纯粹

frontend 同时是：

- browser app
- desktop shell
- local backend launcher
- agent runtime manager
- workspace client

如果没有模式区分，用户会误以为所有配置都必须理解。

建议三种运行模式：

- 云端/团队模式：frontend 只连 backend，模型由管理员配置。
- 本地一体模式：desktop 自动启动本地 backend 和 agent runtime，隐藏端口与 baseURL。
- 专家模式：允许直接配置 app-server、API key、baseURL。

## 建议的信息架构分层

后续可以把 admin 和文档按以下层级重排：

1. 系统管理
   - 用户
   - 组织
   - 权限
   - 邀请
   - 安全

2. AI 管理
   - 模型供应商
   - 模型配置
   - 模型网关
   - 用量与价格
   - 调用日志

3. 资产管理
   - 素材库
   - 文件夹
   - 存储后端
   - 云文件中转
   - 外部素材源

4. 创作知识
   - 镜头库
   - 镜头语义
   - 向量索引
   - 检索维护

5. 项目工作区
   - 项目
   - 成员
   - Git workspace
   - decision context

6. 执行系统
   - jobs
   - canvas run
   - workflow runtime
   - provider task

7. 扩展生态
   - plugins
   - workflow market
   - hub
   - registry

8. 运营观测
   - audit logs
   - usage logs
   - LLM call logs
   - metrics
   - health/debug

## 拆分建议

短期不建议直接微服务化。更稳妥的顺序：

1. 先做概念分层和产品语言重命名。
2. 再做 admin 导航与配置入口重排。
3. 然后收敛 frontend 的 API/provider 配置，只保留普通用户需要的模型选择和 runtime 状态。
4. 最后再根据边界考虑物理拆分。

推荐优先拆清楚的逻辑边界：

- AI Control Plane
- Model Gateway
- Asset Library
- Shot Knowledge Base
- Workspace/Project Service
- Workflow Runtime
- Extension/Marketplace
- Ops/Audit

可能适合后续物理拆分的服务：

- Job worker / generation worker
- Vector indexing service
- Media processing service
- Plugin/registry/hub service
- Observability/audit pipeline

不一定需要物理拆分的部分：

- 身份和组织，在当前阶段可以继续留在主 backend。
- Resource metadata，可以继续留在主 backend。
- Admin API，可以继续作为主 backend 的控制面 API。

## 后续讨论问题

下次可以继续围绕这些问题展开：

1. MovScript 的最小可用产品形态是什么？
   - 个人本地创作工具？
   - 团队协作平台？
   - AI 资产管理平台？
   - Agent 创作操作系统？

2. 普通用户第一次打开 frontend 时，应该看到什么？
   - 项目？
   - 素材库？
   - Agent？
   - 工作流画布？

3. Admin 里哪些页面只属于部署管理员？

4. frontend 是否应该默认不暴露 API key/baseURL？

5. 本地一体模式是否应该把 backend、resource storage、agent runtime 全部自动托管？

6. backend 的长期边界是“平台控制面”，还是要逐步拆成多个服务？

7. Shot Library 是独立产品能力，还是 Resource Library 的高级视图？

8. Workflow/Canvas 是核心创作入口，还是高级自动化能力？

## 暂定结论

当前系统已经具备平台雏形，但用户心智还停留在多个底层概念并列暴露的状态。

下一阶段最重要的不是继续增加配置，而是把职责命名、入口层级和用户模式理顺：

- 用户看到创作对象：项目、素材、镜头、模型、Agent、工作流。
- 管理员看到系统能力：AI、存储、权限、用量、审计、运行状态。
- 开发者看到基础设施：MinIO、Gitea、Redis、gateway、provider runtime、plugin registry。

只有这三层分清楚，后续讨论“后端要不要拆服务”才有明确依据。
