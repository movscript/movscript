# MovScript V2 Roadmap

本文档把 `movscript-v2-product-design.md` 收敛为可执行路线图。目标不是覆盖所有功能，而是明确当前阶段应该先把哪条闭环跑通，并给后续阶段留下清晰边界。

## 0. 当前判断

V2 当前最重要的目标是建立一个可验证的核心闭环：

```text
导入剧本 / brief / 分镜脚本
  -> 写入剧本节和情境候选
  -> 写入或编辑结构化分镜脚本
  -> 编译为内容单元
  -> 写入关键帧候选并建立预演时间线
  -> 用户确认、修改、补素材
  -> 进入内容生产
```

其中 AI 分析、模型调用、工具编排和候选生成归 V3 Production Runtime。V2 负责保存候选、正式事实、版本、状态机和采用边界。

当前代码已经有 V2 语义骨架，包括 `ScriptVersion`、`ScriptSection`、`Situation`、`ContentUnit`、`Keyframe`、`PreviewTimeline`、`CreativeReference`、`AssetRequirement`、`WorkItem`、`DeliveryVersion` 等模型和基础接口。

当前最大缺口不是继续扩表，而是：

- 真实产品入口仍偏旧实体管理心智。
- V2 还主要停留在管理后台 UI Preview。
- 前端缺少“剧本预演”主页面。
- 后端缺少表达产品对象读写、候选保存和采用确认的数据动作 API，现有接口更接近 CRUD 原型。

因此，近期优先级应是：

```text
先建立 V2 产品壳和剧本预演薄切片
再补候选结果写入、确认和预演时间线数据闭环
最后扩展素材、画布、生产、任务和交付
```

## 1. Roadmap 原则

### 1.1 以用户闭环排序

优先实现能让用户从剧本看到预演的能力，而不是优先实现完整制片管理能力。

### 1.2 旧实体只作为参考

旧的 `Scene`、`Storyboard`、`Shot`、`Pipeline` 可以保留为调试或管理后台入口，但不再作为 V2 主流程入口。

### 1.3 CRUD 只服务原型

V2 真实页面应调用产品数据动作 API，例如：

```text
CreateScriptPreviewDraft
UpsertScriptSectionCandidates
UpsertSituationCandidates
UpsertStoryboardRows
CompileStoryboardToContentUnits
BuildPreviewTimeline
UpsertKeyframeCandidates
ConfirmContentUnit
AcceptCandidate
```

现有 CRUD 可以继续用于内部调试和早期原型，但不应成为主产品交互的长期接口。

### 1.4 先模块化单体，后复杂架构

短期不拆微服务。V2 新能力逐步收敛到：

```text
apps/backend/internal/v2/
```

先从 `structure` 和 `script` 两个上下文开始，避免一次性迁移所有后端代码。

### 1.5 V2 / V3 并行边界

V2 和 V3 可以并行推进，但职责必须分开：

```text
V2：产品页面、核心对象、候选保存、正式事实、版本、状态机、采用/拒绝/回滚
V3：Production Runtime、AI 分析、模型调用、工具编排、计划步骤、候选生成
```

V2 后端不承载 AI workflow，不直接感知模型如何分析剧本或生成关键帧。V3 runtime 生成候选结果后，通过 V2 暴露的数据动作 API 写回：

```text
script section candidates
situation candidates
storyboard suggestions
keyframe candidates
asset requirement candidates
preview timeline proposals
```

两个窗口的协作方式：

- V2 文档维护对象、状态和写入 API 的最小契约。
- V3 文档维护 action、runtime、candidate、approval 的最小契约。
- 任一侧调整契约时，必须在对应文档中记录字段和边界，不通过口头约定隐式耦合。

## 2. Phase 1：V2 产品壳与剧本预演第一屏

### 目标

把 V2 从管理后台预览推进到真实产品主入口，让用户进入项目后看到的是 V2 创作流程，而不是旧实体列表。

### 范围

- 新建或改造主导航：
  - 项目首页
  - 剧本预演
  - 创作资料
  - 素材准备
  - 内容生产
  - 制作任务
  - 交付
  - 画布
- 弱化旧 `Scenes / Storyboards / Shots / Pipeline` 主入口。
- 建立“剧本预演”真实页面第一版。
- 页面可先接 mock/projection 数据，但交互结构必须按 V2 设计组织。

### 剧本预演页面第一版布局

```text
左侧：剧本 / brief / 分镜脚本输入与版本
中间：结构化分镜脚本 + 候选理解结果
右侧：待确认项、素材缺口、下一步动作
底部：预演时间线
```

### 最小交付物

- V2 主导航可用。
- “剧本预演”作为第一主入口。
- 用户可以创建或选择一个剧本版本。
- 用户可以看到结构化分镜脚本编辑区域。
- 用户可以看到内容单元列表或时间线占位。
- 用户可以看到待确认项和素材缺口占位。

### 完成标准

- 新用户进入项目后能明确理解下一步是“导入剧本并生成预演”。
- 旧的 `scene/storyboard/shot` 不再主导第一屏。
- 页面文案不暴露底层表名和 `WorkItem` 等工程概念。

## 3. Phase 2：剧本导入、版本与剧本节

### 目标

让用户能够从剧本、brief 或文案开始，得到可确认的剧本节。

### 范围

- 粘贴或上传剧本。
- 保存为 `ScriptVersion`。
- 保存由 V3 runtime 或人工录入产生的 `ScriptSection` 候选。
- 支持用户确认、忽略、拆分、合并剧本节。
- 保留原文定位信息，便于回看候选理解为什么这样产生。

### 后端数据动作

```text
ImportScript
CreateScriptVersion
UpsertScriptSectionCandidates
ConfirmScriptSection
IgnoreScriptSection
SplitScriptSection
MergeScriptSections
```

### 完成标准

- 一个剧本版本可以稳定生成一组剧本节。
- 用户可以修改剧本节，而不是只能接受候选输出。
- 后续情境和分镜可以引用稳定的 `ScriptSection`。

## 4. Phase 3：情境、分镜脚本与内容单元

### 目标

把剧本节转成可编辑的分镜脚本，并编译为稳定的内容单元。

### 范围

- 从剧本节提取 `Situation`。
- 保存由 V3 runtime 或人工录入产生的 `Situation` 与结构化分镜脚本候选。
- 用户可以直接从分镜脚本入口开始，不强制先补完整剧本。
- 分镜脚本行编译为 `ContentUnit`。
- 支持新增、删除、拆分、合并、重排分镜行。

### 后端数据动作

```text
UpsertSituationCandidates
UpsertStoryboardSuggestions
CreateStoryboardScript
CompileStoryboardToContentUnits
CreateContentUnit
UpdateContentUnitStoryboardFields
SplitContentUnit
MergeContentUnits
ReorderContentUnits
```

### 完成标准

- 用户读写的是“分镜脚本”。
- 系统保存和生产挂载的是稳定 `ContentUnit`。
- 关键帧、素材需求、制作任务以后都能挂到同一个内容单元上。

## 5. Phase 4：关键帧与预演时间线 MVP

### 目标

让用户第一次“看见整部片的雏形”。这是 V2 MVP 的关键节点。

### 范围

- 为内容单元生成关键帧候选或占位。
- 建立 `PreviewTimeline`。
- 时间线按内容单元顺序播放。
- 用户可以重排、替换、确认片段。
- 用户可以将某个关键帧设为当前视觉锚点。

### 后端数据动作

```text
UpsertKeyframeCandidates
AttachKeyframeToContentUnit
AcceptKeyframe
BuildPreviewTimeline
ReorderPreviewTimeline
ConfirmPreviewTimelineItem
```

### 完成标准

- 用户可以从剧本进入一个可播放的预演时间线。
- 即使视频还没有生成，也能通过关键帧和时长看到节奏。
- 用户确认关键帧不会反向污染剧本节或情境事实。

## 6. Phase 5：创作资料确认

### 目标

让用户确认系统候选中对人物、地点、产品、风格、规则等创作资料的理解。

### 范围

- 保存由 V3 runtime 或人工录入产生的 `CreativeReference` 候选。
- 支持确认、合并、忽略候选资料。
- 支持创建有作用范围的 `CreativeReferenceState`。
- 支持 `Situation` 和 `ContentUnit` 引用创作资料与状态。

### 后端数据动作

```text
UpsertCreativeReferenceCandidates
ConfirmCreativeReference
MergeCreativeReferences
CreateCreativeReferenceState
AttachCreativeReferenceUsage
```

### 完成标准

- 用户能看懂并修正候选中对角色、地点、道具、产品和风格的理解。
- 状态有明确作用范围，不变成散乱标签。
- V3 生成关键帧候选时可以读取相关创作资料和状态。

## 7. Phase 6：素材需求与素材锁定

### 目标

把素材页从文件库改成“素材缺口管理”。

### 范围

- 保存从情境、创作资料状态和内容单元推导出的 `AssetRequirement` 候选。
- 素材需求分为：
  - 缺失
  - 候选
  - 已锁定
  - 已放弃
- 支持上传素材作为候选。
- 支持 V3 runtime 或外部工具生成素材作为候选。
- 支持锁定素材需求。

### 后端数据动作

```text
CreateAssetRequirement
AddAssetCandidate
RejectAssetCandidate
LockAssetRequirement
WaiveAssetRequirement
```

### 完成标准

- 用户进入素材准备页能知道“正式生产还缺什么”。
- 素材采用关系通过需求表达，不把素材直接塞成创作资料的子对象。

## 8. Phase 7：对象画布适配

### 目标

保留画布的 port/schema 运行内核，但把入口和输出落点改成 V2 对象上下文。

### 范围

- 画布支持 `owner_type / owner_id`。
- 从以下对象打开画布：
  - `situation`
  - `content_unit`
  - `keyframe`
  - `asset_requirement`
  - `creative_reference`
  - `creative_reference_state`
- 画布输出必须落到明确产品动作：
  - 保存为关键帧
  - 保存为素材候选
  - 加入预演
  - 作为内容版本候选

### 后端数据动作

```text
OpenCanvasForObject
SaveCanvasOutputAsKeyframe
SaveCanvasOutputAsAssetCandidate
AttachCanvasOutputToPreviewTimeline
CreateContentVersionCandidate
```

### 完成标准

- 用户不是从空白全项目画布开始，而是从具体对象进入画布。
- 画布输出不只是下载文件，而能推动创作决策。

## 9. Phase 8：内容生产

### 目标

把预演里的关键画面升级为正式视频片段或可用内容版本。

### 范围

- 从 `ContentUnit` 发起图生视频、文生视频或人工制作。
- 支持上传外部制作结果。
- 管理内容版本候选。
- 支持采用、拒绝、返工。

### 后端数据动作

```text
CreateContentVersionCandidate
RegisterContentGenerationTask
UploadContentVersion
AcceptContentVersion
RejectContentVersion
RequestContentRevision
```

### 完成标准

- 内容生产页围绕“生产片段”组织，而不是围绕任务或管线。
- 任务完成不等于内容采用，采用由内容版本状态决定。

## 10. Phase 9：制作任务

### 目标

提供执行队列，支持人、V3 runtime、人机协作完成具体工作。

### 范围

- 创建 `WorkItem`。
- 支持分配、运行、阻塞、审核、返工。
- 支持任务依赖。
- 用户界面弱化 `WorkItem` 术语，展示自然状态：
  - 正在生成
  - 待处理
  - 待审核
  - 需要重做
  - 分配给我
  - Runtime 运行中

### 后端数据动作

```text
CreateWorkItem
AssignWorkItem
StartWorkItem
CompleteWorkItem
RequestWorkRevision
ApproveWorkItem
BlockWorkItem
```

### 完成标准

- 制作任务页是执行队列，不是内容事实源。
- 完成任务不会自动代表素材、关键帧、视频或交付被采用。

## 11. Phase 10：交付

### 目标

检查整片是否完整，并导出交付版本。

### 范围

- 建立 `DeliveryVersion`。
- 展示预演时间线和成片时间线。
- 检查缺失内容、未确认素材、未锁定片段。
- 支持审核记录和导出记录。

### 后端数据动作

```text
CreateDeliveryVersion
BuildDeliveryTimeline
CheckDeliveryReadiness
ApproveDeliveryVersion
ExportDeliveryVersion
```

### 完成标准

- 交付页能明确告诉用户当前版本是否可导出。
- 交付状态不反向污染剧本结构、创作资料或素材事实。

## 12. 近期执行建议

### Sprint 1：真实 V2 壳子

- 建 V2 主导航。
- 建剧本预演页面路由。
- 从管理后台 UI Preview 提取可复用原型结构。
- 旧实体入口移动到管理或调试区域。
- 剧本预演页接入现有 `ScriptVersion`、`ScriptSection`、`ContentUnit`、`PreviewTimeline` 查询。

### Sprint 2：预演薄切片

- 实现 `CreateScriptPreviewDraft` 用例。
- 实现 `CompileStoryboardToContentUnits` 用例。
- 实现 `BuildPreviewTimeline` 用例。
- 前端支持手写分镜行并生成内容单元。
- 时间线显示内容单元顺序、时长和状态。

### Sprint 3：候选结果写入与确认

- 提供剧本节候选写入和确认 API。
- 提供情境候选写入和确认 API。
- 提供分镜建议写入、采纳和拒绝 API。
- 候选来源可以是 V3 runtime、前端 mock 或人工录入；V2 不关心候选如何生成。
- 候选确认后才影响正式结构。

### Sprint 4：关键帧候选和素材缺口

- 提供关键帧候选写入和恢复 API。
- 支持采用关键帧。
- 提供素材需求候选写入和锁定 API。
- 素材准备页展示缺失、候选、已锁定。

## 13. 暂不做

第一阶段明确不做：

- 完整排期系统。
- 完整预算系统。
- 传统 pipeline DAG。
- 复杂权限矩阵。
- 全项目自由画布作为主入口。
- 大而全任务协同系统。
- 过细的人物、地点、道具专表体系。
- 为旧 `scene/storyboard/shot` 写复杂兼容层。

## 14. 当前优先级结论

当前最应该做：

```text
1. V2 主导航
2. 剧本预演真实页面
3. 手写分镜脚本 -> ContentUnit -> PreviewTimeline 的薄切片
4. 候选结果写入、确认和恢复闭环
```

不建议现在继续优先做：

```text
1. 完整 DDD 目录大迁移
2. 生产任务系统
3. 交付系统
4. 复杂画布适配
5. 旧实体兼容层
```

Roadmap 的判断标准很简单：每一步都应该缩短用户从“我有一份剧本”到“我看见整部片雏形”的距离。
