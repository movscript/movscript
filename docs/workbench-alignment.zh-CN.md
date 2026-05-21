# 工作台对齐梳理

本文档梳理当前 Movscript 项目级工作台的功能边界、代码现状和后续对齐方向。目标不是把所有页面改成同一套视觉，而是统一“工作台应该如何进入、读取、筛选、审阅、写入和跳转”，减少每个页面各自实现一套架构。

## 当前范围

现阶段需要优先对齐 5 个核心工作台：

| 工作台 | 当前主入口 | 当前主要实现 | 主要负责 |
| --- | --- | --- | --- |
| 项目规范工作台 | `/project/standards` | `apps/frontend/src/pages/project/standards/ProjectStandardsPage.tsx`、`apps/frontend/src/lib/projectStandardsModel.ts` | 项目级制作规范、固定 8 项规范、扩展 prompt 规则、`project_standards_proposal` 审阅与应用 |
| 前期准备工作台 | `/project/pre-production` | `apps/frontend/src/pages/pre-production/PreProductionPage.tsx`、`apps/frontend/src/components/workbench/SettingPreparationWorkbench.tsx`、`apps/frontend/src/components/workbench/PreProductionAssetBoard.tsx`、`apps/frontend/src/components/workbench/PreProductionAssetDetail.tsx`、`apps/frontend/src/components/workbench/PreProductionResourceLibraryDialog.tsx` | 设定资料、素材需求、候选素材、`setting_proposal` / `asset_proposal` 审阅 |
| 创作编排工作台 | `/project/production/orchestration` | `apps/frontend/src/pages/project/production/ProductionOrchestrationPage.tsx` | production 级创作蓝图、segments、scene moments、设定/素材引用、`production_proposal` 审阅 |
| 内容编排工作台 | `/project/content-units/workbench` | `apps/frontend/src/components/workbench/ContentWorkbenchPage.tsx` | scene moment 到 content unit、关键帧、生成上下文、`content_unit_proposal` 审阅 |
| 交付工作台 | `/project/delivery/workbench` | `apps/frontend/src/pages/project/delivery/DeliveryWorkbenchPage.tsx` | delivery version、成片时间线、交付资源、检查门禁、导出记录 |

辅助入口包括 `apps/frontend/src/pages/workbench/WorkbenchPage.tsx` 中的旧式聚合页，以及 `LEGACY_ROUTES` 里的 `/workbench/...`、`/delivery-workbench`、`/project-workspace` 等兼容路径。

## 当前推进记录

已完成：

- 新增 `projectWorkbenchDefinitions`，把五个工作台的 id、route、legacyRoutes、标题 key、stage、owns/reads、proposalKinds、reviewQuery 收敛到 `apps/frontend/src/pages/project/projectSurfaces.tsx`。
- Sidebar、Header、项目总览快捷入口和 legacy redirect 已开始读取同一份工作台定义。
- `buildDraftReviewPath` 已优先从工作台定义解析 proposal draft 的审阅路径。
- 已抽出 `ProjectWorkbenchHeader` 和 `ProjectWorkbenchShell`，五个核心工作台都已接入统一页面壳。
- 已抽出 `buildProjectWorkbenchReviewParams` / `mergeProjectWorkbenchReviewSearchParams`，项目规范和创作编排已开始复用同一套审阅 query 契约。
- 已新增 `resolveProjectWorkbenchDraftReviewSearchParams`，统一从 Agent artifacts 中选择最新 proposal draft 并合并审阅 query。
- 已新增 `ProposalReviewShell`，项目规范、前期准备、创作编排、内容编排的 proposal review 已开始复用统一审阅区外壳。
- 已抽出 `ProjectStandardsProposalReviewPanel`，项目规范页面开始按“页面状态 / 审阅组件”拆分。
- 已新增 `projectStandardsModel`，项目规范的固定 8 项定义、扩展规范解析、提示词预览、proposal draft diff 解析、style reference resource 解析和工作台数据加载从 `ProjectStandardsPage.tsx` 移出。
- 已抽出 `ProductionUpstreamProposalReviewSummary`，创作编排页面的上游 setting/asset 草稿摘要开始独立复用。
- 已抽出 `ProductionProposalReviewEmptyState`，创作编排 review 空状态开始从页面中拆出。
- 已抽出 `ProductionProposalReviewHeader` 和 `ProductionProposalApplyGatePanel`，production proposal 主审阅面板的状态摘要和写入门禁开始组件化。
- 已抽出 `ProductionProposalApplyPreviewPanel`，production proposal 的写入预览展示开始从页面中拆出。
- 已抽出 `ProductionProposalSemanticDiffPanel` / `ProductionProposalContextPanel`，production proposal 的语义差异审阅和上下文引用队列开始从页面中拆出。
- 已抽出 `ProductionProposalBackendPreviewPanel`，production proposal 的后端预检摘要和预检错误展示开始组件化。
- 已新增 `productionProposalReviewModel`，production proposal 的草稿解析、审阅节点收集、语义 diff 数据、本地预览结果、写入预览和门禁计算开始从页面状态中分离。
- 已抽出 `ProductionProposalReviewResultPanel`，production proposal 的已写入结果态和本地/后端预检结果态不再内联在页面主文件中。
- 已抽出 `ProductionProposalReviewControls`，production proposal 的写入影响卡片和审阅底部操作条开始复用统一控制组件。
- 已将 `buildProposalReviewSegments` / `buildMergedProductionProposal` 迁入 `productionProposalReviewModel`，production proposal 的删除补齐和按决策合并写入逻辑从页面组件中移出。
- 已新增 `useProductionProposalReviewController`，production proposal 的审阅状态机、后端预检、写入项目和预检错误解析从页面主文件中移出。
- 已抽出 `ProductionProposalReviewPanel`，production proposal 的完整审阅界面从 `ProductionOrchestrationPage` 移出，页面主文件只保留审阅入口装配。
- 已将 `buildCurrentProductionProposalSnapshot` 迁入 `productionProposalReviewModel`，当前制作实体到 proposal snapshot 的水合逻辑从页面组件中移出，并补充模型层行为测试。
- 已新增 `productionOrchestrationDraftSeed`，production proposal 的 draft seed metadata 构建从页面主文件中移出，并补充 sourceVersions / script brief 行为测试。
- 已新增 `productionOrchestrationOverview`，制作当前状态概览计算从页面主文件中移出，并移除未使用的 primary action icon 字段。
- 已新增 `productionScriptBlocks` 和 `ProductionScriptBinding`，创作编排的剧本文本/行号计算、制作剧本绑定栏、剧本来源摘要、情节剧本块绑定弹窗从页面主文件中移出。
- 已新增 `ProductionOrchestrationStructure`，创作编排的顶部制作概览、结构布局、左侧编排段导航、当前编排段摘要、情节编辑标题从页面主文件中移出。
- 已新增 `productionWritingExpressions` 和 `ProductionSceneWriting`，创作编排的表达条目模型、情节设定绑定、情节基础编辑、表达条目编辑器从页面主文件中移出。
- 已新增 `productionAnalysisText`，production proposal 启动前的分析文本拼装、剧本分集截取、上下文序列化从页面主文件中移出。
- 已新增 `productionOrchestrationEntityModel`，创作编排的 CRUD 默认值和 orchestration lookup 构建从 `ProductionOrchestrationPage.tsx` 移出。
- 已新增 `productionOrchestrationData`，创作编排的数据加载实体清单、工作台数据类型和 loader 从 `ProductionOrchestrationPage.tsx` 移出。
- 已新增 `productionOrchestrationMutationController`，创作编排的剧本绑定、情节剧本块绑定/创建、情节保存、情节设定绑定、表达条目保存/新增的 mutation 生命周期、刷新和 toast 编排从 `ProductionOrchestrationPage.tsx` 移出。
- 已新增 `productionProposalAgentLaunch`，production proposal 的 draft 创建/复用、Agent 面板 payload、上游 setting/asset artifact 回填和 review query 合并从页面主文件中移出。
- 已扩展 `projectWorkbenchDraftReview`，新增 `mergeProjectWorkbenchArtifactReviewSearchParams`，统一从 Agent artifacts / fallback draftId 合并工作台 review query 与相关草稿参数。
- 前期准备工作台的 setting/asset proposal 完成回填已接入共享 review helper，不再在页面里直接挑选 artifact 和手写 `settingDraftId` / `assetProposalDraftId`。
- 已新增 `preProductionAgentLaunch`，前期准备的素材候选提案 draft shell 创建、素材提案 Agent payload、真实媒体候选生成 Agent payload、前期准备梳理 Agent payload 和完成后 review query 构造从页面主文件中移出。
- 内容编排工作台选择 `content_unit_proposal` 审阅草稿时已接入共享 review helper，不再手写 `view=review` / `draftId` 合并逻辑。
- 已新增 `contentWorkbenchAgentLaunch`，内容编排的制作项 AI 建议和视觉计划 AI 草案 payload / prompt / route hints 从 `ContentWorkbenchPage.tsx` 移出。
- 已新增 `contentWorkbenchCanvasLaunch`，内容编排的内容单元生成画布查询、复用、创建 payload 和 `/canvases/:id` 路由从 `ContentWorkbenchPage.tsx` 移出。
- 已新增 `contentWorkbenchModel`，内容编排的数据加载、场景生成行模型、生成上下文门禁/摘要和 AI 候选关键帧过滤从 `ContentWorkbenchPage.tsx` 移出。
- 已新增 `contentWorkbenchWriteModel`，内容编排的草案采纳 patch、制作项排序 patch、时间线写入计划和候选上传 payload 从 `ContentWorkbenchPage.tsx` 移出。
- 已新增 `contentWorkbenchUploadController`，内容编排候选上传 input 状态、资源上传、候选写入、候选缓存刷新和 toast 编排从 `ContentWorkbenchPage.tsx` 移出。
- 已新增 `contentWorkbenchMutationController`，内容编排草案退回/标记、草案字段采纳、制作项排序、时间轴移动的 mutation 生命周期、刷新和 toast 编排从 `ContentWorkbenchPage.tsx` 移出。
- 已抽出 `ContentWorkbenchUnitTrack`，内容编排的制作项时间轴、类型筛选、拖拽排序/移动、镜头明细和右侧制作项 inspector 从 `ContentWorkbenchPage.tsx` 移出。
- 已抽出 `ContentWorkbenchDialogs`，内容编排的新建制作项、编辑制作项、新建素材需求和新建关键帧弹窗从 `ContentWorkbenchPage.tsx` 移出。
- 已新增 `projectStandardsAgentLaunch`，项目规范的 proposal draft seed、Agent 面板 payload、page tool 注册和 review query 合并从 `ProjectStandardsPage.tsx` 移出。
- 已新增 `preProductionCanvasLaunch`，前期准备的素材需求画布创建 payload、打开 mutation 和 `/canvases/:id` 路由从 `PreProductionPage.tsx` 移出。
- 已新增 `preProductionAssetRows`，前期准备的素材需求行模型、候选 patch payload、设定资料聚类、素材类型/状态归一和候选参考资源提取从 `PreProductionPage.tsx` 移出。
- 已新增 `preProductionAssetCandidateWrite`，前期准备的素材需求创建 payload、资源库候选 payload、上传候选 payload、AI 生成候选 payload、资源库分页和资源库弹窗状态迁移从 `PreProductionPage.tsx` 移出。
- 已新增 `preProductionAssetCandidateController`，前期准备的素材候选选定/拒绝、资源库加入、上传候选、候选缓存刷新和对应 toast 编排从 `PreProductionPage.tsx` 移出。
- 已新增 `preProductionAssetProposalController`，前期准备的素材候选提案 draft 创建、Agent 启动、完成状态处理和 review query 回填从 `PreProductionPage.tsx` 移出。
- 已新增 `preProductionMediaCandidateController`，前期准备的真实媒体候选生成 Agent 启动、完成结果解析、候选写入、资源刷新和 toast 编排从 `PreProductionPage.tsx` 移出。
- 已新增 `preProductionAuditController`，前期准备梳理 Agent 的启动、完成状态处理、review query 回填、草稿 refetch 和 toast 编排从 `PreProductionPage.tsx` 移出。
- 已新增 `usePreProductionUploadInput`，前期准备上传 input ref、上传中状态、触发和重置逻辑从 `PreProductionPage.tsx` 移出。
- 已抽出 `PreProductionReviewWorkspace`，前期准备的 setting/asset proposal 审阅工作区、审阅边界说明和规模摘要从 `PreProductionPage.tsx` 移出。
- 已抽出 `PreProductionAssetBoard`，前期准备的设定列表、素材网格、素材缩略图、素材状态徽章和素材板空态从 `PreProductionPage.tsx` 移出。
- 已抽出 `PreProductionAssetDetail`，前期准备的素材预览、素材状态摘要、候选列表、生成/上传/资源库入口和候选锁定/拒绝展示从 `PreProductionPage.tsx` 移出。
- 已抽出 `PreProductionResourceLibraryDialog`，前期准备的资源库选择弹窗和资源库列表展示从 `PreProductionPage.tsx` 移出，页面只保留资源库 query/state/mutation 接线。
- 已新增 `preProductionRefreshController`，前期准备的手动刷新和 proposal apply 后刷新统一覆盖设定资料、素材需求、素材候选和当前打开的 setting/asset proposal draft。
- 已新增 `deliveryWorkbenchModel`，交付工作台的版本筛选、时间线排序、ready/gate 计算、来源时间线映射、资源 fallback 和状态文案从 `DeliveryWorkbenchPage.tsx` 移出。
- 已新增 `deliveryWorkbenchMutationController`，交付工作台的创建交付版、带入制作时间线、增删改片段和导出记录创建 mutation 生命周期从 `DeliveryWorkbenchPage.tsx` 移出。
- 已抽出 `DeliveryTimelineTrack`，交付工作台的成片时间线视图、缩放、播放头、lane/table 展示和拖拽调整时长逻辑从 `DeliveryWorkbenchPage.tsx` 移出。
- 已抽出 `DeliveryWorkbenchPanels`，交付工作台的片段编辑器、导出记录面板和空时间线带入入口从 `DeliveryWorkbenchPage.tsx` 移出。
- 五个核心工作台页面已不再直接调用 `openAgentPanelDraft` / `buildCommandFirstClientInput` / `registerAgentPanelPageTool`，Agent 启动协议统一下沉到工作台专用 launch helper。
- 五个核心工作台页面已不再直接拼 `/canvases` 创建/跳转协议，画布打开和创建协议统一下沉到 canvas launch helper。
- `ProductionOrchestrationPage.tsx` 已降至约 985 行，创作编排页面主文件现在主要承担 query 装配、页面状态装配、proposal 启动入口和业务组件挂载。
- `ContentWorkbenchPage.tsx` 已降至约 977 行，内容编排页面主文件不再承担生成行模型、生成上下文摘要、核心写入 payload、候选上传、主要 mutation 副作用编排、制作项时间轴/inspector 交互和主要弹窗展示。
- `ProjectStandardsPage.tsx` 已降至约 760 行，项目规范 Agent 启动协议、固定规范模型、扩展规范模型、提示词预览、proposal diff 解析和工作台数据加载不再内联在页面主文件中。
- `PreProductionPage.tsx` 当前约 817 行，前期准备页面主文件不再承担素材行/候选/聚类、核心候选写入 payload、画布打开协议、资源库弹窗状态迁移、候选 mutation 副作用编排、上传 input 状态、前期准备 Agent 完成编排、proposal 审阅工作区、素材主板展示、素材详情候选列表、资源库弹窗展示和刷新边界细节。
- `DeliveryWorkbenchPage.tsx` 已降至约 785 行，交付页面主文件不再承担交付 ready/gate/source 模型、主要写入 mutation 副作用编排、成片时间线轨道交互、片段编辑器和导出面板。
- 已增加契约测试覆盖工作台定义、导航入口、draft review path、统一 Header/Shell 使用。

待推进：

- 创作编排剩余工作转入 production proposal 启动回调和页面状态体量审计。
- 内容编排剩余工作转入 review 状态、AI 启动入口和页面状态体量审计。
- 前期准备剩余工作转入是否继续抽页面状态 controller 的评估。
- 交付工作台剩余工作转入资源库查询 controller 和资源采用面板体量审计。
- 拆分仍然过大的工作台页面文件，按数据加载、页面状态、业务编辑器、审阅组件分层。
- 梳理指标、筛选、队列、详情、上下游依赖区的统一数据模型。

## 现状问题

1. 路由语义不完全一致

   新路由集中在 `/project/...`，但旧路由仍保留 `/workbench/...`、`/creative-workbench`、`/script-split-workbench` 等名称。`WorkbenchPage` 只聚合部分工作台，交付和项目规范又是独立页面。

2. 页面壳和布局组件不统一

   目前至少存在三套页面结构：

   - `SpecializedWorkbenchHeader`、`MetricStrip`、`SpecializedQueue`、`WorkbenchPanel`：主要用于设定准备和内容编排。
   - `ContentWorkspaceLayout`、`ContentFilterBar`：主要用于内容实体类页面和交付工作台。
   - 页面内自定义 header / sticky tab / card layout：项目规范、创作编排、前期准备仍有大量本地实现。

3. 草稿审阅入口不统一

   草稿类型已经有比较清晰的领域模型，集中在 `apps/frontend/src/lib/draftDomainModel.ts`：

   - `project_standards_proposal`
   - `setting_proposal`
   - `asset_proposal`
   - `production_proposal`
   - `content_unit_proposal`
   - `script_split_proposal`

   但页面层的 query 参数、审阅视图打开方式、AI 任务回调、draftId 选择逻辑仍分散在各个页面。

4. 数据加载和刷新约定分散

   每个工作台自己定义 query key、load function、失效刷新范围。内容编排已经有 `invalidateAssetCandidateConsumers` 这类跨页面刷新辅助，但其他工作台的刷新边界还没有统一约定。

5. 命名边界容易混淆

   `production` 在不同上下文里有时表示“制作执行”，有时表示“内容编排”或 “production proposal”。`projectSurfaces` 里 `plan` 是创作编排，但 `workbenchSurfaces` 里没有创作编排项；内容编排对应 `production` category。这会影响导航、Agent labels、query key 和后续维护。

## 建议统一的工作台契约

每个工作台都应该显式声明以下字段，避免页面自己散落硬编码：

```ts
interface ProjectWorkbenchDefinition {
  id: string
  title: string
  shortTitle: string
  route: string
  legacyRoutes: string[]
  stage: 'standards' | 'pre_production' | 'creative_plan' | 'content_orchestration' | 'delivery'
  owns: string[]
  reads: string[]
  proposalKinds: string[]
  primarySelection?: {
    queryParam: string
    entityType: string
  }
  reviewQuery: {
    viewParam?: string
    draftIdParam: string
  }
}
```

建议先把定义放到前端，例如新增或扩展 `apps/frontend/src/pages/project/projectSurfaces.tsx`，让导航、header、Agent hints、draft review path 都从同一份定义读取。

## 统一页面结构

建议所有工作台逐步收敛到同一个结构，而不是同一份复杂组件：

1. Header

   显示项目、当前工作台、当前选择对象、刷新状态和主动作。可以从 `SpecializedWorkbenchHeader` 抽出更通用的 `ProjectWorkbenchHeader`。

2. Overview

   显示 3 到 4 个关键指标，包括数量、阻塞、待审阅、可交付状态。`MetricStrip` 可以保留，但指标模型要统一。

3. Filter / Scope

   统一使用搜索、状态筛选、production / segment / reference / version 等 scope 选择。可以复用 `ContentFilterBar`，但不要只放在 content pages 下。

4. Queue / List

   左侧或主列表显示待处理对象。统一字段：`id`、`title`、`scope`、`status`、`priority`、`progress`、`need`。

5. Detail / Editor

   编辑当前对象，展示上下文、证据、缺口和可写字段。每个工作台保留自己的业务编辑器。

6. Review

   所有 proposal draft 都走统一审阅入口：读取 draft、展示 diff / impact、应用、退回、标记完成。项目级 `setting_proposal` / `asset_proposal` 已有 `ProjectLayerProposalReviewPanel`，可以作为复用起点。

## 功能边界建议

| 工作台 | 只应该写 | 可以引用 | 不应该写 |
| --- | --- | --- | --- |
| 项目规范 | `Project.aspect_ratio`、`Project.visual_style`、`Project.project_style` | project | creative reference、asset slot、production、content unit、生成任务 |
| 前期准备 | creative reference、asset slot、asset slot candidate | project、script、production、scene moment、content unit、resource | production 结构、content unit 结构、delivery version |
| 创作编排 | production、segment、scene moment、creative/asset usage、production-local requirement | project standards、creative reference、asset slot、script | project 级设定和素材需求本体、最终媒体生成结果 |
| 内容编排 | content unit、keyframe、preview timeline item、生成上下文入口 | production、segment、scene moment、creative reference、asset slot、resource、job | project standards、project 级设定、交付版本 |
| 交付 | delivery version、delivery timeline item、export record | production、preview timeline、content unit、resource | 剧本结构、设定资料、内容单元结构 |

这与 Agent catalog 里 proposal-first 的边界基本一致：上游缺失时向上游 proposal 交接，不在当前工作台临时补造。

## 建议分阶段重构

### 第一阶段：只收敛配置和命名

- 在 `projectSurfaces.tsx` 增加统一的 `projectWorkbenchDefinitions`。
- 明确 `creative_plan` 和 `content_orchestration` 的命名，不再用 `production` 同时表达多个页面概念。
- 让 sidebar、overview 快捷入口、draft review path 尽量引用统一定义。
- 保留 legacy route redirect，不继续扩散旧入口。

### 第二阶段：抽工作台壳

- 从 `SpecializedWorkbenchHeader` 和 `ContentWorkspaceLayout` 抽出通用 `ProjectWorkbenchShell`。
- 保留业务页面自己的编辑器，只统一 header、overview、filter、list/detail/review 区域的挂载方式。
- 把 `WorkbenchPanel` 移到更通用的位置，例如 `components/workbench/shared` 或 `components/project-workbench`。

### 第三阶段：统一 draft review

- 用 `DRAFT_DOMAIN_MODELS` 作为单一来源，统一 review route、draftId query param 和 apply boundary。
- 把 `registerAgentPanelPageTool` 回调里的“打开审阅视图、设置 draftId、刷新 query”抽成公共 helper。
- 把 `ProjectLayerProposalReviewPanel` 扩展为 project / production / content 三类 proposal 都可复用的 review shell。

### 第四阶段：整理页面体量

当前几个页面文件过大，后续应按“数据模型、页面状态、业务组件、审阅组件”拆分：

- `ProjectStandardsPage.tsx`：约 760 行。
- `PreProductionPage.tsx`：约 817 行。
- `ProductionOrchestrationPage.tsx`：约 985 行，后续可继续拆 proposal 启动回调和页面状态。
- `ContentWorkbenchPage.tsx`：约 977 行，已有模型/controller/时间轴、inspector 与弹窗拆分，可继续把 review 状态和 AI 启动入口边界下沉。
- `DeliveryWorkbenchPage.tsx`：约 785 行，已完成 shell/filter/list/detail 对齐、模型/mutation 抽取、成片时间线轨道、片段编辑器和导出面板拆分，可继续拆资源库查询与资源采用面板。

## 第一批可执行任务

1. 新增 `projectWorkbenchDefinitions`，覆盖五个工作台的 route、proposalKinds、owns/reads、reviewQuery。
2. 改 `buildDraftReviewPath` 使用定义表，减少手写 route 分支。
3. 把 `WorkbenchCategory` 从 UI tab 概念里拆出来，新增明确的 `ProjectWorkbenchId`。
4. 抽 `ProjectWorkbenchHeader`，先让项目规范、设定准备、内容编排、交付复用同一个 header API。
5. 抽 `openWorkbenchDraftReview` helper，统一 AI 任务完成后的 draftId query 更新和相关 query invalidate。

这五步完成后，页面视觉可以仍保持现状，但代码架构会先对齐：路由、边界、审阅和刷新不再各写一套。
