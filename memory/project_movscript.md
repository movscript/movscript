---
name: movscript project context
description: 技术栈、架构、已实现功能（身份体系、AI 模块、管理页面双模布局、创作页面工作区）
type: project
---

## 技术栈

**Frontend**: Electron + React 18 + React Router v6 + Zustand + TanStack React Query v5 + Radix UI + Tailwind CSS + Lucide Icons  
**Backend**: Go + Gin + GORM  
**AI**: 多 provider（OpenAI, Anthropic, Kling video 等）  
**API Base**: `http://localhost:8765/api/v1`

## 实体层次

Project → Scripts / Settings / Assets → Episodes → (Scenes ← many:many) → Storyboards → Shots

## 关键实体关系（截至 2026-04-23，更新于 2026-04-23）

- **Project** 新增 `total_episodes int`（目标集数，用于进度展示）
- **Script** 类型：main | episode | scene；`status: draft | final`（已有字段，前端可编辑）
- **Setting** (新实体)：人物/场景/道具设定，属于 Project，可选关联 Script
  - type: character | scene | prop
  - routes: `GET/POST /projects/:id/settings`, `PUT/DELETE /settings/:id`
- **Asset** 新增 `setting_id` 字段，可绑定到 Setting
- **Episode** 新增 `target_storyboards int`、`target_scenes int`（该集目标分镜/分场数）
- **Storyboard** `scene_id` 和 `episode_id` 均为可选（nullable），`project_id` 必填
  - 创建：`POST /projects/:id/storyboards`（分场/分集均可选）
  - 列表：`GET /projects/:id/storyboards?scene_id=&episode_id=&status=`（三个过滤均可选）
  - 也保留旧的 `POST /scenes/:id/storyboards` 路由
- **Shot** `storyboard_id` 为可选（nullable），`project_id` 必填
  - 新增 `final_description`、`final_prompt`（终稿独立存储）、`is_approved bool`（独立于 status 的终稿通过标记）
  - 创建：`POST /projects/:id/shots`（不需要分镜）或 `POST /storyboards/:id/shots`
  - 更新/删除：`PUT/DELETE /shots/:id`（扁平路由）

## 已实现功能（截至 2026-04-23）

### 内容生产管线（Pipeline DAG）（2026-04-23）
- 新数据模型：`PipelineNode` / `PipelineEdge`（`backend/internal/model/pipeline.go`）
- `PipelineNode` 状态：`draft → under_review → final | rejected`；rejected 可 reopen 并级联回退下游
- 模板系统（`handler/pipeline_template.go`）：`full_production` / `from_script` / `from_storyboard` / `custom`
- 创建项目时通过 `pipeline_template` 字段自动生成对应节点和边
- Project 新增 `pipeline_template` 字段
- **后端端点**（`router.go`）：
  - `GET /projects/:id/pipeline` — 获取完整 pipeline（nodes + edges）
  - `POST /projects/:id/pipeline/nodes` — 新建节点
  - `PUT /pipeline/nodes/:nodeId` — 更新节点（名称/位置/负责人/截止日期）
  - `DELETE /pipeline/nodes/:nodeId` — 删除节点（同时删关联边）
  - `POST /projects/:id/pipeline/edges` — 新建边
  - `DELETE /pipeline/edges/:edgeId` — 删除边
  - `POST /pipeline/nodes/:nodeId/submit|approve|reject|reopen` — 状态转换
- **前端**（`pages/pipeline/`）：
  - 全屏 ReactFlow DAG 编辑器（`/pipeline` 路由），支持拖拽重排、连接/断开边
  - 右侧节点详情面板：可编辑名称/描述/负责人/截止日期，状态操作按钮（提交/批准/拒绝/重新开放）
  - 甘特图 Tab：基于 due_date 的时间轴可视化
  - 项目创建两步流：选模板（4张卡片）→ 填名称描述
  - 侧边栏新增"管线"入口（Network 图标，`/pipeline`）

## 已实现功能（截至 2026-04-22）

### 身份体系
- 用户注册/登录（custom X-User-ID header 中间件）
- 项目成员角色（owner / director / writer / generator / viewer）

### 管理页面（6 个实体页面）
每个页面均已重构为**双模式布局**：
- 无选中项时：全宽卡片网格（card grid）
- 有选中项时：左侧紧凑文字列表（w-72）+ 右侧详情面板
- 新建用弹窗（Radix Dialog，组件位于 `components/shared/CreateDialog.tsx`）

页面路由：
- `/scripts` — ScriptsPage（**双 Tab：剧本/设定**）
  - 剧本 Tab：类型 tab 过滤（主剧本/分集剧本/分场剧本），列表/卡片显示
  - 设定 Tab：人物/场景/道具设定的完整 CRUD
- `/assets` — AssetsPage（多视角图上传，角色/场景/道具可绑定 Setting）
- `/episodes` — EpisodesPage（**项目级列表**，可选按剧本过滤）
- `/scenes` — ScenesPage（时段 tab 过滤）
- `/storyboards` — StoryboardsPage（**项目级列表**，分场/分集关联均可选，可事后修改）
- `/shots` — ShotsPage（**项目级列表**，分镜关联可选，独立镜头支持）

### 创作页面（/creation）
重构为三段布局：
1. **顶部**: 实体类型标签页（剧本/素材/分集/分场/分镜/镜头 + 数量徽章）
2. **中间**: 当前类型的横向 item strip（pill 选择）+ 新建按钮
3. **底部**: 实体专属创作工作区

### Canvas 编辑器 & 列表页
- `/canvases` — CanvasListPage：无 stage 分类，仅名称，点"新建画布"弹 CreateDialog（只填名称）
- `/canvases/:id` — CanvasEditorPage：ReactFlow 节点画布，支持 AI 工具链

### 工具页（参考生图 / 参考生视频）重构（2026-04-22）
- 组件：`pages/tools/ToolDialog.tsx`（其他工具仍用 `ToolPage.tsx`）
- 布局：全页对话框风格
  - **顶部 Header**：返回按钮 + 工具名称 + provider/model 下拉 + 清空历史按钮
  - **中间主体**：
    - 左（flex-1）：生成历史 feed（`GenerationCard`），每条含：提示词、附件 chip、输出图/视频、下载按钮、复用/删除操作
    - 右（w-52）：资源库面板，可点击将资源添加到输入
  - **底部输入区**：
    - 附件 chips 行（显示已选文件，可 × 删除）
    - 提示词 textarea + @ mention 下拉（按 @ 触发，onMouseDown 插入避免 blur）
    - 操作行：上传按钮 + @ 引用按钮 + 生成按钮（⌘+Enter 快捷键）
- 历史：存于 `localStorage` key `tool_history_${nodeType}`，最多 50 条，会话中断时 pending/running 标为 failed
- @ mention：在 textarea 输入 @ 后触发 filter，选中资源自动插入 `@filename ` 并加入附件列表

### AI 计费与模型管理体系（2026-04-22）

**数据层**
- `AIModel` 新增价格字段：`InputPricePer1M`, `OutputPricePer1M`, `FixedCostPerCall`（credits）
- 新表 `UserQuota`（user_id, balance）
- 新表 `UsageLog`（user_id, ai_model_id, operation_type, input/output tokens, cost）

**服务层**：`backend/internal/ai/service.go`
- `AIService.CallText/CallImage/CallVideo(ctx, userID, modelDBID, req)` 统一入口
- 按 AIModel.ID（数据库主键）路由，自动写 UsageLog，扣 UserQuota
- `GetModelsByCapability(cap)` 返回 `PublicModel`（不含 provider 信息）

**后端接口**
- `GET /models?capability=image|video|text` → PublicModel[]（用户侧，无 provider 信息）
- `GET /user/quota` → 余额 + 本月消耗统计
- `GET /user/usage-logs` → 用户自己的用量日志
- `GET /admin/users` → 用户列表 + 余额
- `PUT /admin/users/:id/quota` → 设置用户余额
- `GET /admin/usage-logs` → 全量用量日志（分页）

**前端**
- 新组件 `components/shared/ModelSelector.tsx`：用户只看 display_name，不感知 provider
- `ToolDialog.tsx`：头部改为单个 ModelSelector（按 capability 过滤），传 `modelDbId` 给 canvas node
- 新页面 `pages/admin/AdminPage.tsx`（`/admin`，super_admin 专属，三 Tab：模型管理/用户管理/用量日志）
- `UserProfilePage.tsx`：删除 AI Config Tab，新增用量 Tab（余额展示 + 用量明细）
- Sidebar：super_admin 显示"管理"区块 → 管理后台入口

### AI Agent 面板（全局右侧）
- 组件：`components/layout/AIAgentPanel.tsx`
- 布局：右侧折叠面板（折叠时 w-9，展开时 w-72），在 `App.tsx` 的 `<main>` 内作为 flex item
- 后端：`POST /api/v1/agent/chat`，通过 `Registry.GetAny()` 调用任意可用文本 provider
- 功能：多轮对话，Enter 发送，Shift+Enter 换行，清空按钮

### 侧边栏进度面板
- 组件：`components/layout/Sidebar.tsx`（`ProjectProgress` 子组件）
- 显示：剧本/分集/分场（数量）+ 分镜/镜头（已通过/总数 + 进度条）
- 数据：`GET /projects/:id/progress`，60 秒自动刷新

### 协作页面（/collaboration）重构（2026-04-22）
拆分为两个 Tab：
1. **任务 Tab**：
   - 新建任务表单（支持直接分配负责人）
   - 全部/我的任务 切换
   - 状态筛选器
   - TaskCard 展示优先级/状态/分配人
   - 分配给自己且未完成的任务显示「去完成」按钮（蓝色圆角）
   - 点击「去完成」→ WorkingCard 弹窗（顶部任务信息 + 工作记录文本框 + 「标记完成」绿色按钮）
2. **管理 Tab**：
   - 团队成员管理（添加/移除）

已删除：协作页面的"项目进度"区块（进度信息移至侧边栏）

### 后端关键端点
- `GET /projects/:id/episodes` — 项目级分集列表 ✓
- `GET /projects/:id/storyboards` — 项目级分镜列表（支持 ?scene_id= ?episode_id= ?status= 过滤）✓
- `POST /projects/:id/storyboards` — 创建分镜（分场/分集均可选）✓
- `GET /projects/:id/shots` — 项目级镜头列表 ✓
- `POST /projects/:id/shots` — 创建独立镜头（不绑定分镜）✓
- `PUT/DELETE /shots/:id` — 镜头更新/删除（扁平路由）✓
- `GET /projects/:id/scenes` — 项目级场景列表 ✓
- `GET /projects/:id/settings` — 项目设定列表 ✓
- `POST /projects/:id/settings` — 创建设定 ✓
- `PUT/DELETE /settings/:id` — 设定更新/删除 ✓
- `GET /projects/:id/progress` — 项目进度统计（含 total_episodes 目标集数、shots.is_approved 终稿通过数）✓
- `POST /api/v1/agent/chat` — AI agent 对话接口（handler: `handler/agent.go`）✓

## Why / How to apply
重构动机：原先各实体页面缺少视觉浏览模式，Episode/Storyboard/Shot 需强制选择父级才能看列表。
现在各页面直接展示项目全量数据，父级筛选改为可选下拉框。
协作页面进度拆入侧边栏，协作页面专注任务管理与成员管理。
Setting 实体替代了 Script 类型中的 setting/character/background 类型，成为独立的设定管理体系。
