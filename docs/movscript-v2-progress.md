# MovScript V2 Progress Log

本文档用于跨会话推进 V2 重构。每次推进前先读本文件和 `docs/movscript-v2-roadmap.md`；每次推进结束前更新本文件。

## 启动口令

用户只需要说：

```text
继续推进 MovScript V2 重构
```

执行者应自动：

1. 阅读 `docs/movscript-v2-progress.md`。
2. 阅读 `docs/movscript-v2-roadmap.md`。
3. 查看 `git status --short`，识别已有改动，不能回滚用户或其他会话的改动。
4. 按“下一步任务”推进一个小而完整的切片。
5. 结束前更新本文档的进度、决策、下一步任务和验证结果。

## 当前阶段

当前处于：

```text
Phase 1：V2 产品壳与剧本预演第一屏
```

当前核心目标：

```text
把 V2 从管理后台 UI Preview 推进到真实产品主入口。
先建立 V2 主导航和剧本预演页面骨架。
```

当前不应优先做：

- 完整 DDD 目录大迁移。
- 完整任务系统。
- 完整交付系统。
- 复杂画布适配。
- 旧 `scene/storyboard/shot` 兼容层。
- 继续无边界扩表。

## 已完成

### 2026-05-01

- 分析了 `docs/movscript-v2-product-design.md`。
- 明确 V2 的第一优先级是“剧本预演”主闭环，不是制片管理或旧实体管理。
- 新增 `docs/movscript-v2-roadmap.md`。
- Roadmap 明确近期顺序：

```text
1. V2 主导航
2. 剧本预演真实页面
3. 手写分镜脚本 -> ContentUnit -> PreviewTimeline 薄切片
4. 候选结果写入、确认和恢复闭环
```

- 新增本文档，作为跨会话推进记录。

### 2026-05-01 本次推进

- 确认真实前端入口主要在 `apps/frontend/src/App.tsx`、`apps/frontend/src/components/layout/Sidebar.tsx` 和 `/creation` 工作台。
- 新增真实产品路由 `/script-preview`，受 `ProjectGuard` 保护。
- 新增 `apps/frontend/src/pages/script-preview/ScriptPreviewPage.tsx`，作为“剧本预演”第一屏骨架。
- 调整侧边栏项目内导航为 V2 主流程：

```text
项目首页
剧本预演
创作资料
素材准备
内容生产
制作任务
交付
画布
```

- 将旧 `scripts/settings/assets/episodes/scenes/storyboards/shots/final-videos` 入口保留到折叠的“旧版管理”分组，避免旧 `scene/storyboard/shot` 主导第一屏。
- 补充 Header 与中英文 i18n 文案。
- 本次没有接后端 V2 CRUD 或用例 API；剧本预演页面先使用本地 mock/projection UI 骨架。

### 2026-05-01 本次推进 2

- 按 Next 1 推进“手写分镜到内容单元薄切片”。
- 将 `apps/frontend/src/pages/script-preview/ScriptPreviewPage.tsx` 中的分镜数据从常量改为页面内状态。
- 支持用户在“结构化分镜脚本”中新增、编辑、删除、上移、下移分镜片段。
- 每条分镜片段现在可编辑：

```text
标题
内容
时长
状态
```

- 从同一份分镜状态派生：

```text
片段概览
右侧素材缺口占位
底部预演时间线
总预估时长
```

- 仍未接 AI、持久化或后端用例 API；本次只打通前端手动路径。

### 2026-05-01 本次推进 3

- 按 Next 1 推进“剧本版本与保存边界”。
- 将 `ScriptPreviewPage` 的剧本输入改为受控状态，并纳入同一份草稿快照。
- 新增页面内版本草稿列表，支持：

```text
查看当前版本
创建新版本
切换版本
保存当前版本
```

- 新增保存状态 UI：

```text
未保存
保存中
已保存
保存失败
```

- 编辑剧本输入、增删改排分镜片段后会进入“未保存”状态。
- “解析结构”“生成预演”在存在未保存改动或保存中时禁用，明确保存是进入候选生成/写入前的边界。
- 版本切换和创建新版本会检查未保存改动；未保存时提示用户先保存，不直接丢弃本地改动。
- 页面内部整理了 `ScriptPreviewDraftPayload`，用于描述未来 `CreateScriptPreviewDraft` / `UpdateStoryboardScriptRows` / `BuildPreviewTimeline` 可接收的最小 DTO。
- 本次仍未接真实后端；保存是前端页面内模拟，目的是先固化交互边界和 DTO 形状。

### 2026-05-01 本次推进 4

- 按 Next 1 推进“候选理解和关键帧候选入口”。
- 为 `ScriptPreviewPage` 新增页面内用例状态：

```text
idle
running
succeeded
failed
```

- “解析结构”现在是可执行的页面内模拟 mutation：
  - 仅在当前草稿已保存时可执行。
  - 有 loading、成功、失败反馈。
  - 从剧本输入或现有分镜生成剧本节理解结果。
  - 输出“可采纳分镜建议”，不会直接覆盖用户已编辑分镜。
- 新增“AI 理解结果”区域，展示候选理解：

```text
剧本节 / 可信度
确认问题
可采纳分镜建议
```

- 用户可以单条采纳或全部追加 AI 分镜建议；采纳后进入“未保存”状态。
- “待确认项”会在解析成功后改用 AI 理解结果中的确认问题。
- “生成预演”现在是可执行的页面内模拟 mutation：
  - 仅在当前草稿已保存时可执行。
  - 有 loading、成功、失败反馈。
  - 为有效分镜片段生成关键帧候选或待补素材占位。
  - 结果显示在底部预演时间线中。
- 编辑剧本或分镜后会清理已生成的预演候选，并提示保存后重新生成，避免旧结果跨版本或跨内容残留。
- 新建版本、切换版本会清理 AI 理解结果和预演结果。
- 本次仍未接真实 AI 或后端用例 API；目标是先把前端入口、状态机和“候选结果需确认后写入”的产品边界跑通。

### 2026-05-01 本次推进 5

- 按 Next 1 推进“最小后端用例 API 契约”。
- 新增 `apps/backend/internal/v2/scriptpreview` 作为剧本预演产品用例包，先提供确定性 projection/mock 响应，不串联底层 V2 CRUD。
- 新增 `ScriptPreviewHandler`，把 HTTP 绑定和项目存在性校验与用例逻辑分开。
- 新增项目级产品动作路由：

```text
POST /api/v1/projects/:id/script-preview/draft
POST /api/v1/projects/:id/script-preview/analyze
POST /api/v1/projects/:id/script-preview/generate-preview
```

- 当前 DTO 覆盖：

```text
source_text
script_version
storyboard_rows
preview_timeline
sections
confirm_questions
storyboard_suggestions
keyframe_candidates
asset_gaps
```

- `draft` 保存响应会返回稳定的 `draft_id`、`storyboard_revision_id`、`preview_timeline_id`、`saved_at` 和下一步动作。
- `analyze` 当前会从剧本文本或分镜行生成确定性的候选理解、确认问题和可采纳分镜建议。
- `generate-preview` 当前会从分镜行生成确定性的关键帧候选、预演时间线和素材缺口。
- 本次仍未做真实持久化或真实 AI 调用；目标是先固定产品动作 API 边界。后续真实 AI 分析和生成归 V3 Production Runtime，V2 后端只负责保存候选和状态。

### 2026-05-01 本次推进 6

- 按 Next 1 推进“前端接入剧本预演 API adapter”。
- 新增 `apps/frontend/src/api/scriptPreview.ts`，封装剧本预演产品动作 API：

```text
saveScriptPreviewDraft
analyzeScriptPreview
generateScriptPreview
```

- `ScriptPreviewPage` 不再用页面内 mock 生成保存、解析和预演结果，三个 mutation 默认调用：

```text
POST /api/v1/projects/:id/script-preview/draft
POST /api/v1/projects/:id/script-preview/analyze
POST /api/v1/projects/:id/script-preview/generate-preview
```

- 前端 `ScriptPreviewDraftPayload` 改为复用 adapter 契约类型，移除页面内 `project_id` 字段，项目 ID 只保留在路由 path 中。
- 保存成功后使用后端返回的：

```text
draft_id
saved_at
draft.source_text
draft.storyboard_rows
```

更新当前版本、草稿快照和保存状态。
- 解析结构现在把后端 `sections` 和 `storyboard_suggestions` 映射到现有“AI 理解结果 / 可采纳分镜建议”UI。
- 生成预演现在把后端 `keyframe_candidates`、`preview_timeline`、`asset_gaps` 映射到底部时间线和右侧素材缺口。
- 失败状态统一沿用当前页面 UI，并通过 `translateApiError` 展示后端错误。
- 仍保持“候选输出进入可确认建议区，不自动覆盖用户分镜”的产品边界。

### 2026-05-01 本次推进 7

- 按 Next 1 推进“后端草稿持久化最小切片”。
- 新增 `model.ScriptPreviewDraft` 作为剧本预演产品级草稿快照表。
- 草稿快照只保存产品动作需要恢复的最小内容：

```text
project_id
draft_id
title
source_type
source_text
storyboard_revision_id
preview_timeline_id
snapshot_json
duration_sec
saved_at
```

- 新增 migration `000019_script_preview_draft_snapshots`，并把 `ScriptPreviewDraft` 纳入当前 schema model 列表。
- 新增 `scriptpreview.DraftStore` 和 GORM store，把持久化细节收在 `internal/v2/scriptpreview` 用例包内。
- `SaveDraft` 在配置 store 时会把规范化后的 `source_text`、`script_version`、`storyboard_rows`、`preview_timeline` 保存为 JSON 快照。
- 新增读取当前项目最近草稿的产品 API：

```text
GET /api/v1/projects/:id/script-preview/draft
```

- 读取响应返回 `found` 和保存响应同形的 `draft`，方便前端后续复用保存成功后的映射逻辑。
- `ScriptPreviewHandler` 仍只负责项目存在性校验、HTTP 绑定和错误映射；保存和读取逻辑仍在 `scriptpreview.Service`。
- 补充 service 测试，覆盖保存后读取同一份草稿，以及无草稿时返回 `found=false`。
- 本次仍未接真实 AI；`analyze` 与 `generate-preview` 仍是确定性 projection/mock。根据新的并行边界，它们后续不应演进为后端 AI workflow，而应演进为 V3 写入候选结果的 V2 数据动作。

### 2026-05-01 本次推进 8

- 按 Next 1 推进“前端初始化读取最近草稿”。
- `apps/frontend/src/api/scriptPreview.ts` 新增 `getLatestScriptPreviewDraft`，封装：

```text
GET /api/v1/projects/:id/script-preview/draft
```

- `ScriptPreviewPage` 进入页面并拿到当前项目后会读取最近保存草稿。
- 当后端返回 `found=true` 时，页面复用保存成功响应映射逻辑恢复：

```text
source_text
script_version.title
storyboard_rows
preview_timeline
saved_at
```

- 恢复后页面保持“已保存”状态，`savedSnapshot` 同步更新，解析结构和生成预演继续受保存边界保护。
- 当后端返回 `found=false` 时，继续保留当前示例草稿，不阻塞用户开始编辑。
- 新增读取中、读取成功、读取失败的轻量状态反馈；读取失败不破坏手动编辑路径。
- 新增 `hasLocalEditsRef` 防护：如果用户在读取返回前已经开始编辑，远端草稿不会覆盖本地未保存内容。
- 恢复草稿时会把保存快照里的 `preview_timeline` 映射到底部时间线；关键帧候选和素材缺口仍需重新生成。
- 根据用户决策，V2 与 V3 将并行推进：V2 聚焦数据、状态和候选保存；V3 聚焦 AI 分析、模型调用、工具编排和 Production Runtime。两个窗口通过文档中的契约对接，互不直接改对方职责。

## 当前代码状态摘要

截至 2026-05-01 本次推进 8 结束时，工作区已有未提交改动。后续会话必须先查看最新 `git status --short`。

已观察到的 V2 相关草稿：

- `apps/backend/internal/model/v2_structure.go`
- `apps/backend/internal/model/v2_creative.go`
- `apps/backend/internal/model/v2_production.go`
- `apps/backend/internal/handler/v2_semantics.go`
- `apps/backend/internal/handler/script_preview.go`
- `apps/backend/internal/v2/scriptpreview/service.go`
- `apps/backend/internal/db/migrations.go`
- `apps/backend/internal/router/router.go`
- `docs/movscript-v2-product-design.md`
- `docs/movscript-v2-roadmap.md`

已观察到的风险：

- 后端已有 V2 CRUD 骨架，但产品主流程不能长期直接依赖 CRUD 拼装。
- 前端真实工作台仍偏旧实体心智：

```text
script / setting / asset / episode / scene / storyboard / shot / final_video
```

- V2 页面目前主要在管理后台 UI Preview，不是正式用户入口。
- 工作区中存在较多未提交修改和删除文件，推进时必须避免误回滚。

本次新增/修改的前端文件：

- `apps/frontend/src/App.tsx`
- `apps/frontend/src/components/layout/Header.tsx`
- `apps/frontend/src/components/layout/Sidebar.tsx`
- `apps/frontend/src/pages/script-preview/ScriptPreviewPage.tsx`
- `apps/frontend/src/i18n/locales/zh-CN.json`
- `apps/frontend/src/i18n/locales/en-US.json`

本次推进 2 仅继续修改：

- `apps/frontend/src/pages/script-preview/ScriptPreviewPage.tsx`

本次推进 3 仅继续修改：

- `apps/frontend/src/pages/script-preview/ScriptPreviewPage.tsx`

本次推进 4 仅继续修改：

- `apps/frontend/src/pages/script-preview/ScriptPreviewPage.tsx`

本次推进 5 新增/修改：

- `apps/backend/internal/v2/scriptpreview/service.go`
- `apps/backend/internal/v2/scriptpreview/service_test.go`
- `apps/backend/internal/handler/script_preview.go`
- `apps/backend/internal/router/router.go`

本次推进 6 新增/修改：

- `apps/frontend/src/api/scriptPreview.ts`
- `apps/frontend/src/pages/script-preview/ScriptPreviewPage.tsx`

本次推进 7 新增/修改：

- `apps/backend/internal/model/script_preview_draft.go`
- `apps/backend/internal/v2/scriptpreview/store.go`
- `apps/backend/internal/v2/scriptpreview/service.go`
- `apps/backend/internal/v2/scriptpreview/service_test.go`
- `apps/backend/internal/handler/script_preview.go`
- `apps/backend/internal/router/router.go`
- `apps/backend/internal/db/migrations.go`

本次推进 8 仅继续修改：

- `apps/frontend/src/api/scriptPreview.ts`
- `apps/frontend/src/pages/script-preview/ScriptPreviewPage.tsx`

本次修改的文档：

- `docs/movscript-v2-progress.md`

本次未触碰已有删除文件，也未修改 `apps/backend/internal/handler/v2_semantics.go` 的 CRUD 行为。

## 当前产品决策

### 决策 1：剧本预演是 V2 第一主入口

用户进入项目后，第一主线应该是：

```text
导入剧本 / brief / 分镜脚本 -> 生成预演 -> 人工确认 -> 补素材 -> 内容生产
```

### 决策 2：旧实体不再主导 V2 信息架构

旧的 `Scene`、`Storyboard`、`Shot` 可以保留为实现参考、管理后台或调试入口，但不应作为 V2 一级导航和主流程。

### 决策 3：第一阶段先做产品壳，不做大而全后端重构

可以先用现有模型和接口支撑页面骨架。用例 API 可以逐步补，不要一开始进行全量 DDD 迁移。

### 决策 4：用户读写“分镜脚本”，系统生产“ContentUnit”

前端文案应尽量使用：

```text
分镜
片段
预演
素材缺口
下一步
```

避免在主界面暴露：

```text
ContentUnit
WorkItem
Pipeline
数据库 ID
```

### 决策 5：V2 主导航先落在 Sidebar 项目分组

短期把项目内 V2 主流程放在 `Sidebar` 的项目分组中，`/creation` 暂时作为“项目首页”。旧实体列表不删除，只降级到“旧版管理”。

### 决策 6：剧本预演第一屏先使用本地 UI 骨架

在后端用例 API 明确前，不让真实页面长期绑定 V2 CRUD。当前先交付可点击入口、信息架构和页面布局，下一步再做手写分镜到时间线的前端状态薄切片。

### 决策 7：手写分镜薄切片仍不持久化

手写分镜薄切片先采用页面内状态，验证用户手动编辑路径和 UI 派生关系。本次已补保存边界、版本切换和失败反馈，但仍只做页面内模拟，避免先把真实页面绑死到临时 CRUD。

### 决策 8：保存边界先按用例 DTO 固化，不直接接 V2 CRUD

剧本预演主页面未来应面向用例 API，而不是把 `ScriptVersion`、`ContentUnit`、`PreviewTimeline` 表单化暴露给用户。当前前端保存草稿使用页面内模拟，但内部 DTO 已按以下边界组织：

```text
source_text
script_version
storyboard_rows
preview_timeline
```

保存成功后，后续候选生成、候选写入和预演更新才能执行；保存失败或未保存时，解析结构和生成预演入口应保持不可执行或要求用户先处理草稿状态。

### 决策 9：候选输出先进入可确认建议区，不自动覆盖用户分镜

“解析结构”可以生成剧本节理解、确认问题和分镜建议，但这些输出必须先展示为候选。只有用户显式采纳后，才追加到结构化分镜脚本；采纳动作会让草稿重新进入“未保存”状态。

“生成预演”可以先展示关键帧候选或占位视觉锚点，但不要求完整视频生成。只要能让用户看到每个片段的候选视觉方向和时间线状态，就可以支撑下一步的候选写入和确认闭环。

### 决策 10：剧本预演产品 API 与 V2 CRUD 分开

`/script-preview` 面向产品动作：

```text
保存草稿
解析结构
生成预演
```

`/v2/*` 继续保留为语义骨架和调试 CRUD。真实剧本预演页面不应通过前端串联 `ScriptVersion`、`ContentUnit`、`Keyframe`、`PreviewTimeline` CRUD 来拼产品流程。

### 决策 11：前端通过 adapter 接产品动作 API

剧本预演页面不直接散落 `fetch` 或串联 V2 CRUD。前端先通过 `apps/frontend/src/api/scriptPreview.ts` 调用产品动作 API，页面只负责组装用例 DTO、展示状态和把响应映射为用户能理解的“分镜 / 预演 / 素材缺口”。

### 决策 12：草稿恢复先用产品级快照表

`ScriptVersion` 当前仍依赖旧 `ScriptID`，直接把剧本预演第一屏绑定到它会过早暴露底层语义模型和旧脚本关系。因此本阶段新增极薄的 `ScriptPreviewDraft` 快照表，保存 `/script-preview` 产品动作的当前草稿状态。

该表是可替换落点，不是最终 DDD 边界；后续可以在 `scriptpreview.Service` 内部逐步把快照拆写到 `ScriptVersion`、`ContentUnit`、`PreviewTimeline` 等稳定语义对象，前端仍只面对产品动作 API。

### 决策 13：初始化恢复不能覆盖本地未保存编辑

剧本预演页面进入时会异步读取最近草稿，但用户可能在请求返回前已经开始输入。当前约定是：一旦本地发生编辑，读取返回只更新读取状态提示，不覆盖页面内容。后续如果要支持“载入远端草稿 / 保留本地草稿”的显式冲突选择，应作为单独交互设计，不在初始化阶段静默替换。

### 决策 14：AI 编排归 V3，V2 后端只保存候选和事实状态

V2 和 V3 可以同时推进，但职责不混用：

```text
V2：产品页面、核心对象、候选保存、正式事实、版本、状态机、采用/拒绝/回滚
V3：Production Runtime、AI 分析、模型调用、工具编排、计划步骤、候选生成
```

V2 后端不再以“接真实 AI workflow”为目标，也不负责模型如何分析剧本、提取情境、生成分镜或生成关键帧。V3 runtime 生成候选结果后，通过 V2 的数据动作 API 写回候选；V2 只负责保存、展示、确认、拒绝、恢复和审计。

两个并行窗口通过文档对接：V2 文档维护对象和写入 API 契约，V3 文档维护 action/runtime/candidate 契约。任一侧调整契约时，必须同步更新对应文档。

## 下一步任务

### Done：V2 主导航与剧本预演页面骨架

完成情况：

- 能从真实产品入口进入 `/script-preview`。
- “剧本预演”显示为项目内第一主流程入口之一。
- 旧 `scene/storyboard/shot` 入口不再主导侧边栏主项目分组。
- 旧页面仍保留在“旧版管理”，可继续访问。
- 剧本预演页面已有左中右和底部时间线骨架。

### Done：手写分镜到内容单元薄切片

完成情况：

- 用户能新增、编辑、删除、上移、下移分镜行。
- 每条分镜行支持标题、内容、时长、状态。
- 系统能展示对应片段顺序、起止时间、时长和状态。
- 片段概览、素材缺口占位、底部预演时间线会随分镜状态实时更新。
- 文案继续使用“分镜 / 片段 / 预演 / 素材缺口”，未在主界面暴露 `ContentUnit`。

### Done：剧本版本与保存边界

完成情况：

- 用户能看到当前剧本预演草稿版本和最近保存时间。
- 用户能创建新版本、切换已有版本、保存当前版本。
- 编辑剧本输入或分镜片段会进入“未保存”状态。
- 保存动作表现“保存中 / 已保存 / 保存失败”。
- 保存失败和版本切换阻塞都有明确 UI 反馈。
- “解析结构”“生成预演”会在未保存或保存中时禁用，保存成为后续 AI 用例的明确前置边界。
- 页面状态已整理为 `ScriptPreviewDraftPayload`，能映射到后端稳定模型。
- 仍未调用真实后端；本次只完成前端交互边界与 DTO 草案。

建议用例名：

```text
CreateScriptPreviewDraft
UpdateStoryboardScriptRows
BuildPreviewTimeline
```

最小 DTO 草案：

```json
{
  "project_id": 1,
  "source_text": "剧本、brief 或手写分镜脚本原文",
  "script_version": {
    "draft_id": "draft-1",
    "title": "预演草稿 1",
    "source_type": "brief | script | storyboard_script"
  },
  "storyboard_rows": [
    {
      "client_id": "01",
      "order": 1,
      "title": "冷开场钩子",
      "body": "这一段分镜内容",
      "duration_seconds": 8,
      "status": "待确认"
    }
  ],
  "preview_timeline": [
    {
      "client_id": "01",
      "order": 1,
      "start_seconds": 0,
      "end_seconds": 8,
      "duration_seconds": 8
    }
  ]
}
```

建议响应草案：

```json
{
  "draft_id": "server-draft-id",
  "script_version_id": 123,
  "storyboard_revision_id": 456,
  "preview_timeline_id": 789,
  "saved_at": "2026-05-01T10:00:00+08:00",
  "status": "draft"
}
```

### Done：候选理解和关键帧候选入口

完成情况：

- “解析结构”已有页面内模拟 mutation，并受保存边界保护。
- “生成预演”已有页面内模拟 mutation，并受保存边界保护。
- 两个入口都有 loading、成功、失败反馈。
- 候选理解结果先进入可确认区域，不自动覆盖用户现有分镜。
- 用户采纳分镜建议后，分镜脚本会更新并进入未保存状态。
- 底部预演时间线可以显示关键帧候选或待补素材占位。
- 编辑分镜或剧本后会清理旧预演候选，防止旧结果继续误导用户。

建议用例名：

```text
UpsertScriptSectionCandidates
UpsertStoryboardSuggestions
UpsertKeyframeCandidates
```

### Done：最小后端数据动作 API 契约

完成情况：

- 已新增 `internal/v2/scriptpreview` 用例包和 `ScriptPreviewHandler`。
- 已新增 `/projects/:id/script-preview/draft`、`/analyze`、`/generate-preview` 三个产品动作 API。
- 请求/响应 DTO 已覆盖当前前端 `ScriptPreviewDraftPayload`、候选理解结果、可采纳分镜建议、关键帧候选、预演时间线和素材缺口。
- 当前 service 返回稳定 projection/mock 响应；后续真实 AI 分析和生成由 V3 Production Runtime 承担，V2 API 应演进为候选写入、读取、确认和拒绝的数据动作。
- 未把剧本预演页面或 API 改成串联底层 V2 CRUD。

当前路由：

```text
POST /api/v1/projects/:id/script-preview/draft
POST /api/v1/projects/:id/script-preview/analyze
POST /api/v1/projects/:id/script-preview/generate-preview
```

### Done：前端接入剧本预演 API adapter

完成情况：

- 新增 `apps/frontend/src/api/scriptPreview.ts`，封装 `saveScriptPreviewDraft`、`analyzeScriptPreview`、`generateScriptPreview`。
- `ScriptPreviewPage` 的保存、解析结构、生成预演已默认调用 `/script-preview` 产品动作 API。
- 保存成功会使用后端返回的 `saved_at`、`draft_id` 和规范化草稿内容更新页面状态。
- 解析结构和生成预演的结果来自 API 响应，失败时沿用现有错误状态 UI。
- 仍保持“候选输出进入可确认建议区，不自动覆盖分镜”的产品边界。

### Done：后端草稿持久化最小切片

完成情况：

- 已明确最小持久化落点为 `ScriptPreviewDraft` 产品级快照表，不直接把页面绑定到底层 V2 CRUD。
- 保存草稿时会持久化当前 `source_text`、`script_version`、`storyboard_rows`、`preview_timeline` 快照。
- 已新增读取当前项目最近草稿的产品 API：

```text
GET /api/v1/projects/:id/script-preview/draft
```

- `scriptpreview.Service` 继续作为用例入口；GORM 细节被 `DraftStore` 隔离，handler 只负责 HTTP 绑定和项目校验。
- 已补 service 测试，验证保存后可读取同一份草稿。
- 暂未补 handler 集成测试，因为当前后端测试依赖中没有 sqlite/sqlmock 等轻量 DB 测试设施；全量 Go 测试已覆盖编译和 service 行为。

### Done：前端初始化读取最近草稿

完成情况：

- `apps/frontend/src/api/scriptPreview.ts` 已新增读取最近草稿 adapter。
- `ScriptPreviewPage` 初始化时会读取当前项目最近草稿。
- 当 `found=true` 时，会用后端草稿恢复：

```text
source_text
script_version
storyboard_rows
preview_timeline
saved_at
```

- 当 `found=false` 时，会继续使用当前示例草稿，不阻塞编辑。
- 读取中、读取失败有轻量状态反馈；失败不破坏手动编辑路径。
- 页面恢复草稿后保持“已保存”状态，解析结构和生成预演继续受保存边界保护。
- 已避免初始化读取覆盖用户已经开始输入的未保存内容。
- 暂时只恢复最近草稿，不做多版本草稿列表。

### Next 1：预演候选结果写回草稿快照

目标：

```text
让关键帧候选、预演时间线和素材缺口具备最小持久化边界。候选来源可以是 V3 runtime、前端 mock 或人工录入；V2 只负责写入、读取和恢复。
```

建议交付标准：

- 后端提供“写入预演候选结果”的数据动作，能把关键帧候选、素材缺口和时间线 proposal 写回当前草稿快照，或新增一个极薄的 preview result snapshot 字段/DTO。
- 前端恢复最近草稿时能恢复关键帧候选、素材缺口和生成后的时间线状态。
- 仍保持“候选结果需要确认，用户确认前不污染分镜脚本”的产品边界。
- 不急着接真实 AI，不引入完整 `Keyframe` / `AssetRequirement` CRUD 串联。

建议实现点：

1. 优先复用 `scriptpreview.Service` 和 `DraftStore`，不要让 handler 直接操作 GORM。
2. 如果扩展响应 DTO，前端 adapter 类型要与后端字段同名，避免页面内二次猜测。
3. 避免把接口命名成后端负责 AI 生成；命名应偏向 `upsertPreviewCandidates` / `savePreviewProposal` 这类数据动作。
4. 先覆盖最近草稿恢复，不做历史版本列表。

## 每次会话结束必须更新

推进者结束前应更新以下字段：

```text
## 已完成
## 当前代码状态摘要
## 当前产品决策
## 下一步任务
## 验证记录
## 遗留问题
```

如果代码有改动，必须写清：

- 改了哪些文件。
- 为什么这么改。
- 是否运行测试。
- 测试结果。
- 没有运行测试的原因。

## 验证记录

### 2026-05-01

- 初始记录：尚未进行代码实现，只新增路线图与跨会话推进记录。

### 2026-05-01 本次推进

- 运行 `pnpm --dir apps/frontend typecheck`。
- 结果：通过。
- 未运行后端测试，因为本次没有修改后端代码。

### 2026-05-01 本次推进 2

- 运行 `pnpm --dir apps/frontend typecheck`。
- 首次发现 `新增片段` 的状态字面量被推断为普通 `string`，已收窄为 `StoryboardStatus`。
- 再次运行 `pnpm --dir apps/frontend typecheck`。
- 结果：通过。
- 未运行后端测试，因为本次没有修改后端代码。

### 2026-05-01 本次推进 3

- 运行 `pnpm --dir apps/frontend typecheck`。
- 结果：通过。
- 未运行后端测试，因为本次没有修改后端代码。

### 2026-05-01 本次推进 4

- 运行 `pnpm --dir apps/frontend typecheck`。
- 首次发现新增的 `UseCaseMessage` 组件未定义，已补齐组件实现。
- 再次运行 `pnpm --dir apps/frontend typecheck`。
- 结果：通过。
- 未运行后端测试，因为本次没有修改后端代码。

### 2026-05-01 本次推进 5

- 运行 `go test ./internal/v2/scriptpreview ./internal/handler ./internal/router`。
- 结果：通过。
- 运行 `go test ./...`。
- 结果：通过。
- 未运行前端 typecheck，因为本次没有修改前端代码。

### 2026-05-01 本次推进 6

- 运行 `pnpm --filter movscript-frontend typecheck`。
- 结果：通过。
- 为让生成预演后的时间线优先使用后端 `preview_timeline`，补充映射后再次运行 `pnpm --filter movscript-frontend typecheck`。
- 结果：通过。
- 未运行后端测试，因为本次没有修改后端代码。

### 2026-05-01 本次推进 7

- 首次运行 `go test ./internal/v2/scriptpreview ./internal/handler ./internal/router`。
- 结果：失败，原因是沙箱不允许写入 `/Users/zhaoqian/Library/Caches/go-build`，不是代码编译错误。
- 申请权限后再次运行 `go test ./internal/v2/scriptpreview ./internal/handler ./internal/router`。
- 结果：通过。
- 运行 `go test ./...`。
- 结果：通过。
- 未运行前端 typecheck，因为本次没有修改前端代码。

### 2026-05-01 本次推进 8

- 运行 `pnpm --filter movscript-frontend typecheck`。
- 结果：通过。
- 未运行后端测试，因为本次没有修改后端代码。

## 遗留问题

- 已临时确认真实产品入口落在应用 shell 的 `Sidebar` 项目分组，`/creation` 保留为“项目首页”。
- 已把旧 `scene/storyboard/shot` 入口降级到折叠的“旧版管理”；后续仍可根据产品反馈调整分组命名。
- 需要决定 V2 页面先接现有 CRUD，还是先补最小用例 API。
- 已决定剧本预演主页面暂不直接接现有 V2 CRUD；下一步如接后端，应先补最小产品用例 API。
- 已补最小 `/script-preview` 后端产品用例 API 契约；`draft` 保存与最近草稿读取已有真实快照持久化。
- 剧本预演页面已通过 API adapter 调用新的 `/script-preview` 路由，刷新后会从后端恢复最近草稿。
- 当前只恢复最近草稿，不恢复多版本草稿列表。
- 生成预演后的关键帧候选和素材缺口仍是前端瞬时结果；刷新后目前只能恢复保存快照中的基础时间线。
- “解析结构”“生成预演”后端 API 仍是确定性 projection/mock 响应；后续应改造为候选写入/读取数据动作，由 V3 runtime 负责真实 AI 分析和生成。
- 下一步应让 `generate-preview` 结果具备最小持久化和恢复边界。

## 单句推进模板

用户可以在新会话发送：

```text
继续推进 MovScript V2 重构。请先读 docs/movscript-v2-progress.md 和 docs/movscript-v2-roadmap.md，按 progress 里的下一步任务推进，结束前更新 progress。
```
