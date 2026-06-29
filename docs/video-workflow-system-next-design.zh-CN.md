# MovScript 视频工作流下一步系统设计

## 目标

这份文档用于确定 MovScript 下一阶段的视频制作和剪辑系统边界。

核心结论：

MovScript 应该形成一条静态编译链路，而不是把影视制作、素材生成、剪辑意图、真实剪辑和渲染后端混在同一个模型里。

```text
Production / SceneMoment / ExpressionUnit
  -> ContentUnit / Candidate / Selection / RawResource
  -> TimelineAssembly
  -> CompileManifest
  -> BackendExecutionProject
  -> MediaPipeline
  -> Render Result / RawResource / Candidate
```

其中：

- `Production / SceneMoment / ExpressionUnit` 是影视语义层。
- `ContentUnit / Candidate / Selection / RawResource` 是素材生成和选择层。
- `TimelineAssembly` 是剪辑意图编排层。
- `CompileManifest` 是可重复编译合同。
- `BackendExecutionProject` 是某个 backend 的可执行项目，例如 `MediaEditingProject`、Remotion composition、HyperFrames composition 或外部 NLE 工程。
- `MediaPipeline` 是编译和渲染后端宿主。

## 可重复编译原则

剪辑应该是可重复的。

这里的意思不是所有剪辑器都必须输出完全相同的像素，而是：

1. 给定同一个 `TimelineAssembly`、同一组 selected resources、同一个 backend、同一份 backend 版本和 render settings，系统应该能重复得到同一个可解释结果。
2. 换用不同 backend 时，输出应符合同一份剪辑意图合同，并生成 conformance report，说明哪些动作被完整支持、哪些被降级、哪些无法执行。
3. 如果 `runtime_lock` 指定了 backend，系统不能静默换用另一个 backend。
4. 如果 backend 不支持某个 action，必须返回 blocker，而不是偷偷改写剪辑意图。

因此，`TimelineAssembly` 应该被看作 canonical edit intent IR。它不是某个剪辑器的草稿，也不是只服务 FFmpeg 的临时结构。

`MediaEditingProject -> MediaPipeline` 只是其中一种执行方式，更准确地说是 track-based execution path。Remotion 和 HyperFrames 应该作为同级 backend execution path 加入，而不是被塞进 `MediaEditingProject` 之后。

推荐链路：

```text
TimelineAssembly
  -> CompileManifest
      -> MediaEditingProject            # track-based / FFmpeg / local NLE-lite
      -> RemotionCompositionProject      # React/frame-based composition
      -> HyperFramesCompositionProject   # HTML/GSAP/timed composition
      -> ExternalNleProject              # XML/EDL/OTIO/FCPXML 等外部剪辑器
  -> MediaPipeline
  -> Render Result
```

这也意味着，真正需要稳定的是 `TimelineAssembly + CompileManifest`，而不是把某一个剪辑器的数据结构提升成全系统唯一模型。

## 背景判断

OpenMontage 的优点不在于它有一个复杂剪辑器，而在于它把视频制作过程拆成了清晰的 workflow artifacts：

| OpenMontage artifact | MovScript 对应定位 |
| --- | --- |
| `required_assets[]` | `ContentUnit` |
| `asset_manifest.assets[]` | `ContentUnit Candidate / Selection / RawResource` |
| `edit_decisions` | `TimelineAssembly` handoff + `MediaEditingProject` seed |
| `render_report` | `MediaPipeline` result |

这个思想值得吸收，但不应该把 OpenMontage artifact 原样塞进 `production.json`。

MovScript 已经有更丰富的领域建模，所以更适合做成：

```text
MovScript domain source
  -> OpenMontage-style workflow view
  -> edit handoff
  -> backend execution project
  -> render result
```

也就是说，OpenMontage-style artifacts 应该作为派生视图、agent 协作格式和编译交接合同，而不是新的第一性 source schema。

## 系统分层

### 1. 影视语义层

这一层由 `Production / SceneMoment / ExpressionUnit` 承担。

它回答的是：

- 这个片子要表达什么？
- 有哪些段落、镜头、表达单元？
- 每个表达单元需要什么视觉、听觉、文字或特效？
- 哪些内容需要生成，哪些内容可以复用已有资源？

这一层不应该直接承载真实剪辑 timeline。

原因是，真实剪辑会包含大量操作性状态：

- clip 的精确起止
- trim in / trim out
- split
- track order
- volume envelope
- subtitle burn-in
- render format
- HLS / MP4 输出状态

这些状态属于剪辑工作区，而不是影视语义本身。

### 2. 素材生成和选择层

这一层由 `ContentUnit / Candidate / Selection / RawResource` 承担。

它回答的是：

- 一个表达需求对应哪个生成任务？
- 生成了哪些候选结果？
- 哪个候选结果被选择为稳定依赖？
- 下游剪辑应该引用哪个 RawResource？

重要规则：

- `ContentUnit` 是生成任务或素材需求，不是生产层级节点。
- `Candidate` 是候选，不是稳定依赖。
- `Selection` 才是稳定依赖。
- `RawResource` 是真实媒体资源体。
- 剪辑 handoff 默认只应该读取 selected candidate。
- 草稿模式可以读取未选择 candidate，但必须带上 `draft: true` 或 blocker/provenance。

### 3. TimelineAssembly: 剪辑意图编排层

`TimelineAssembly` 是下一步系统设计的核心。

它不是传统剪辑器 timeline，也不是最终渲染 timeline，而是影视语义和真实剪辑之间的中间计划。

它回答的是：

- 哪些 `SceneMoment / ExpressionUnit / ContentUnit` 要进入最终片子？
- 它们在时间上的大致顺序和并行关系是什么？
- 视觉、语音、音乐、音效、字幕、特效如何协同？
- 哪些素材已经覆盖，哪些还缺失？
- 需要哪些剪辑动作？
- 这些动作可以交给哪个 render runtime 执行？

`TimelineAssembly` 应该输出四类信息：

```text
TimelineAssembly
  -> coverage_map
  -> decision_log
  -> edit_action_plan
  -> compile_manifest
  -> backend_execution_project
```

#### coverage_map

用于回答：

- required content 是否已经有 clip 使用？
- clip 是否已经绑定 selected resource？
- 是否存在未覆盖的 `ContentUnit`？
- 是否存在无语义来源的 clip？

#### decision_log

用于记录编排阶段的 blocker、warning 和重要选择。

它不是为了写长篇日志，而是为了让 agent、人和编译器知道：

- 为什么某个素材暂时作为占位？
- 为什么某个 content unit 没进入 timeline？
- 为什么这个 runtime 不能执行当前动作？
- 哪些地方需要用户决策？

#### edit_action_plan

用于吸收 OpenMontage 的 `edit_decisions` 思想。

第一版动作词表可以包括：

| action | 含义 |
| --- | --- |
| `cut` | 主视觉 clip 的放置、裁切、速度和转场 |
| `overlay` | 叠加视觉、贴片、动画、局部强调 |
| `narration_segment` | 旁白/人声片段 |
| `music_bed` | 背景音乐 |
| `sfx_hit` | 音效点 |
| `subtitle_segment` | 字幕片段 |
| `subtitle_style` | 字幕全局样式 |
| `global_transition` | 全局或段落级转场 |
| `runtime_lock` | 指定渲染运行时，不允许静默降级 |
| `timeline_coverage_check` | 覆盖和可编译性检查 |

#### compile_manifest / backend_execution_project

这是进入具体执行后端的桥。

`TimelineAssembly` 本身不应该成为最终剪辑状态。它应该可以生成 `CompileManifest`，再由 backend adapter 生成某种 `BackendExecutionProject`。

第一阶段最重要的 backend execution project 是 `MediaEditingProject`，因为系统已有 `surface/editing` 可以打开和精剪它。后续可以加入 Remotion 和 HyperFrames。

### 4. BackendExecutionProject: 后端执行项目

`BackendExecutionProject` 是 `TimelineAssembly` 编译后的后端专用项目。

它不是新的统一 source，而是某个 backend 能执行的项目形态。

第一版建议支持以下类型：

| backend project | 适合场景 | 说明 |
| --- | --- | --- |
| `MediaEditingProject` | 常规轨道剪辑、拖拽精剪、FFmpeg 渲染 | 对应系统已有 `surface/editing` |
| `RemotionCompositionProject` | React/frame-based 动画、精确 frame timeline、复杂布局和数据驱动画面 | 适合作为可编程视频 backend |
| `HyperFramesCompositionProject` | HTML/GSAP 动画、字幕、音频响应、动效包装、网页式视觉结构 | 适合作为 motion composition backend |
| `ExternalNleProject` | DaVinci/Premiere/FCP 等外部工具交接 | 可通过 EDL/XML/OTIO/FCPXML 等格式逐步支持 |

### 5. MediaEditingProject: 真实剪辑层

系统已有的 `surface/editing` 应该被定位为真实剪辑器，也就是下游 `MediaEditingProject` 工作区。

它负责：

- 资产库
- 预览播放器
- clip inspector
- 多轨 timeline
- 拖拽素材
- trim start / trim end
- split
- move clip
- snap
- linked selection
- ripple editing
- track lock / mute
- 本地素材导入
- 保存剪辑项目
- 创建 HLS preview 或 MP4 render task

它不应该深度理解 `Production / SceneMoment / ExpressionUnit` 的所有语义。

它只需要保留轻量 provenance：

```json
{
  "movscript": {
    "production_id": "prod_x",
    "scene_moment_id": "scene_x",
    "expression_unit_id": "expr_x",
    "content_unit_id": "cu_x",
    "candidate_id": "cand_x",
    "resource_id": "resource_123",
    "timeline_assembly_clip_id": "assembly_clip_x"
  }
}
```

这样真实剪辑器可以知道 clip 从哪里来，但不会反向污染 domain source。

### 6. MediaPipeline: 编译和渲染后端宿主

`MediaPipeline` 应该从“FFmpeg 任务执行器”升级为“编译后端宿主”。

它接收的是 `TimelineAssembly + CompileManifest` 或某个 `BackendExecutionProject`，然后选择 backend 执行。

```text
TimelineAssembly
  -> CompileManifest
  -> MediaPipeline compile
      -> ffmpeg
      -> remotion
      -> hyperframes
      -> external_nle
```

第一版可以只有 FFmpeg 真正可用，但语义上要为多 backend 留好位置。

关键规则：

- backend 必须显式选择或由能力矩阵匹配。
- 如果用户或 handoff 指定 `runtime_lock`，不允许静默切换 backend。
- backend 不支持某个 action 时，应返回 blocker。
- render result 不自动变成 domain selection。
- render result 需要显式导入 RawResource。
- 是否创建 candidate、是否 adopt/select，是后续明确决策。
- 同一个 backend 的输出应尽量可重现。
- 不同 backend 之间要求语义等价和 conformance report，不要求像素级一致。

## 后端选择建议

不同 backend 不应该互相伪装。

| backend | 应该负责 | 不适合负责 |
| --- | --- | --- |
| FFmpeg / `MediaEditingProject` | 线性剪辑、拼接、裁切、基础叠加、音频混音、字幕 burn-in、HLS/MP4 | 复杂 React/HTML 布局、精细动效编排 |
| Remotion | React 组件化视频、frame-accurate 动画、动态图表、可参数化 composition | 需要用户在 NLE 中手动精剪的流程 |
| HyperFrames | HTML/GSAP motion composition、字幕动效、title card、overlay、音频响应视觉 | 传统 NLE 风格手工 timeline 精剪 |
| External NLE | 专业人工精剪、调色、复杂后期交接 | 全自动可重复渲染闭环 |

因此：

- `MediaEditingProject` 是一种剪辑方式，不是唯一剪辑方式。
- Remotion 和 HyperFrames 应该作为 MediaPipeline backend adapter。
- Project Edit Desk 只依赖 `TimelineAssembly` 和 `CompileManifest`，不依赖具体 backend。
- 具体 backend 能否执行，由 capability matrix 和 compile validation 决定。

## 两个剪辑入口的定位

系统里会存在两个看起来都像“剪辑台”的入口，但它们定位不同。

| 入口 | 产品名建议 | 定位 | 使用者问题 |
| --- | --- | --- | --- |
| Project Edit Desk | 意图编排台 | 上游制作和剪辑意图编排 | 这个片子应该怎么组装？ |
| Editing Workspace | 真实剪辑器 | 下游精剪和导出 | 这个 timeline 具体怎么剪？ |

### Project Edit Desk 不应该做什么

- 不应该重复实现完整 NLE。
- 不应该直接替代 `surface/editing`。
- 不应该把所有 trim/split/render 状态写回 `Production`。
- 不应该把 `TimelineAssembly` 设计成新的巨大 source entity。

### Project Edit Desk 应该做什么

- 展示 `SceneMoment / ExpressionUnit / ContentUnit / Resource`。
- 支持把语义单元放入意图 timeline。
- 生成 OpenMontage-style `asset_manifest` 和 `edit_decisions`。
- 展示 coverage 和 blockers。
- 生成 `CompileManifest` 和 backend project preview。
- 提供“创建/打开 backend project”入口；第一阶段默认是打开 `MediaEditingProject`。

### Editing Workspace 应该做什么

- 打开一个具体 `MediaEditingProject`。
- 在真实轨道上编辑 clip。
- 支持素材拖拽、裁剪、分割、移动、预览。
- 支持保存、HLS preview、MP4 render。
- 显示 clip provenance。
- 输出 render/export/import 结果。

## 推荐工作流

### 1. 生成素材

```text
Production
  -> SceneMoment
  -> ExpressionUnit
  -> ContentUnit
  -> Candidate
  -> Selection
  -> RawResource
```

如果某些内容还没有 selected resource，`TimelineAssembly` 可以允许草稿占位，但必须显示 blocker。

### 2. 编排剪辑意图

```text
Selected Resources
  -> Project Edit Desk
  -> TimelineAssembly
  -> OpenMontage-style edit_decisions
```

这一阶段的目标不是精剪，而是确定：

- 哪些内容进入片子
- 大致顺序
- 多轨关系
- 音画配合
- 字幕和特效需求
- render runtime 要求

### 3. 创建后端执行项目

```text
TimelineAssembly
  -> CompileManifest
  -> BackendExecutionProject
```

如果选择 track-based path，`BackendExecutionProject` 就是 `MediaEditingProject`，需要保存：

- source/provenance
- asset registry
- tracks
- clips
- clip metadata
- runtime preference
- validation diagnostics

如果选择 Remotion 或 HyperFrames path，则需要保存：

- composition source
- props / manifest
- referenced assets
- backend version
- render settings
- conformance report

### 4. 精剪和预览

```text
MediaEditingProject
  -> Editing Workspace
  -> trim / split / move / preview
```

这一阶段可以脱离 domain source 独立迭代。

精剪不应该自动改写 `SceneMoment / ExpressionUnit`。

### 5. 渲染和回流

```text
BackendExecutionProject
  -> MediaPipeline render
  -> output file / HLS
  -> RawResource
  -> optional ContentUnit Candidate
  -> optional Selection
```

渲染成功只表示产物存在。

是否把产物作为候选、是否采纳为稳定选择，需要显式动作。

## 数据结构建议

第一版不要新建大型 canonical source schema，可以先把 `TimelineAssembly` 作为 Project Edit Desk 的 handoff state。

建议结构：

```ts
type TimelineAssembly = {
  schema: 'movscript.timeline_assembly.v1'
  id: string
  projectId: string
  target: {
    kind: 'production' | 'scene_moment' | 'expression_unit' | 'freeform'
    ref: string
  }
  sourceNamespace: TimelineAssemblySourceNamespace
  tracks: TimelineAssemblyTrack[]
  clips: TimelineAssemblyClip[]
  editProfile: TimelineAssemblyEditProfile
  runtime: TimelineAssemblyRuntimePolicy
  coverageMap: TimelineAssemblyCoverageMap
  decisionLog: TimelineAssemblyDecisionLogEntry[]
}
```

### TimelineAssemblyClip

```ts
type TimelineAssemblyClip = {
  id: string
  kind: 'visual' | 'voice' | 'music' | 'sfx' | 'subtitle' | 'effect'
  trackId: string
  startMs: number
  durationMs: number
  source: {
    contentUnitId?: string
    candidateId?: string
    resourceId?: string
    status: 'selected' | 'draft' | 'missing'
  }
  intentRef: {
    productionId?: string
    sceneMomentId?: string
    expressionUnitId?: string
    contentUnitId?: string
    targetRef?: string
  }
  edit: {
    layer?: 'primary' | 'overlay' | 'background'
    speed?: number
    transform?: {
      scale?: number
      position?: string
      crop?: { x: number; y: number; width: number; height: number }
      animation?: string
    }
    transitionIn?: string
    transitionOut?: string
    transitionDurationMs?: number
    volume?: number
    reason?: string
  }
}
```

### Runtime Policy

```ts
type TimelineAssemblyRuntimePolicy = {
  preferredBackend?: 'ffmpeg' | 'remotion' | 'hyperframes' | 'external_nle'
  lockedBackend?: 'ffmpeg' | 'remotion' | 'hyperframes' | 'external_nle'
  fallbackPolicy: 'fail' | 'allow_explicit_user_choice'
  requiredCapabilities: string[]
}
```

`lockedBackend` 存在时，不能静默 fallback。

### CompileManifest

`CompileManifest` 用于保证可重复编译。

```ts
type CompileManifest = {
  schema: 'movscript.compile_manifest.v1'
  id: string
  timelineAssemblyId: string
  inputHash: string
  selectedResources: Array<{
    contentUnitId?: string
    candidateId?: string
    resourceId: string
    resourceHash?: string
  }>
  backend: {
    target: 'ffmpeg' | 'remotion' | 'hyperframes' | 'external_nle'
    locked: boolean
    version?: string
    adapterVersion?: string
  }
  renderSettings: {
    width: number
    height: number
    fps: number
    durationMs?: number
    format?: 'mp4' | 'webm' | 'hls' | 'mov'
    codec?: string
  }
  actionSet: string[]
  capabilityCheck: {
    status: 'ok' | 'blocked' | 'degraded'
    unsupportedActions: string[]
    warnings: string[]
  }
}
```

`inputHash` 应覆盖：

- `TimelineAssembly`
- selected resources
- edit profile
- runtime policy
- render settings
- backend adapter version

这样系统才能判断同一个编译是否可重复、是否需要重新编译、是否只是换 backend。

## UI 设计方向

### Project Edit Desk

布局建议：

```text
┌─────────────────────────────────────────────────────────────┐
│ Project / Production compact header                         │
├───────────────┬───────────────────────────────┬─────────────┤
│ Source Library│ Assembly Preview / Intent Map │ Inspector   │
│               │                               │             │
│ SceneMoment   │ selected semantic block        │ clip edit   │
│ ExpressionUnit│ coverage / blockers            │ action      │
│ ContentUnit   │                               │ runtime     │
│ Resources     │                               │ handoff     │
├───────────────┴───────────────────────────────┴─────────────┤
│ TimelineAssembly intent timeline                             │
│ video / overlay / voice / music / sfx / subtitle / marker     │
└─────────────────────────────────────────────────────────────┘
```

左侧不是普通素材库，而是 production-aware source library：

- `SceneMoment`
- `ExpressionUnit`
- `ContentUnit`
- selected `RawResource`
- draft candidates
- blockers

底部 timeline 是意图 timeline，不是精剪 timeline。

它可以支持拖拽和排序，但第一版不需要完整实现所有真实剪辑工具。

### Editing Workspace

布局继续保持已有剪辑器方向：

```text
┌─────────────┬───────────────────────────┬─────────────┐
│ AssetLibrary│ Preview                   │ Inspector   │
├─────────────┴───────────────────────────┴─────────────┤
│ Real editing timeline                                  │
└────────────────────────────────────────────────────────┘
```

需要补充：

- clip provenance chips
- 从 Project Edit Desk 进入的 project source 标识
- 返回 Project Edit Desk 的入口
- 产物导入 Resource Library 的入口

## 服务和 API 设计

### 1. TimelineAssembly service

建议先不独立成大型服务，可以先放在 Project Surface / Editing package 的转换模块中。

需要提供：

```text
buildTimelineAssemblyFromWorkflowView()
buildOpenMontageAssetManifest()
buildOpenMontageEditDecisions()
validateTimelineAssembly()
createCompileManifest()
compileTimelineAssemblyToBackendProject()
```

### 2. Editing Service

继续负责：

- `MediaEditingProject` create/get/save
- timeline tracks/clips mutation
- timeline validation
- render task request creation

不要让 Editing Service 回写 Production 语义 source。

Editing Service 是 `MediaEditingProject` 这一种 backend execution path 的服务，不是所有 backend 的唯一入口。

### 3. MediaPipeline

新增 backend registry / capability check：

```text
editing_runtime_capabilities_get
  -> availableBackends[]
  -> backendCapabilities[]
  -> unsupportedActions[]
```

渲染前必须执行：

```text
TimelineAssembly / BackendExecutionProject
  -> resolve CompileManifest
  -> resolve backend
  -> check capabilities
  -> validate backend project
  -> compile
  -> render
```

## 第一阶段落地计划

### Phase 1: 定位收敛

- 确认 Project Edit Desk 是意图编排台。
- 确认 `surface/editing` 是真实剪辑器。
- 文案和入口上避免两个地方都叫同一种“剪辑台”。
- Project Overview 的制作条目上保留进入 Project Edit Desk 的按钮。
- Project Edit Desk 内增加“打开真实剪辑”动作。

### Phase 2: Handoff 稳定

- 稳定 `TimelineAssembly -> edit_decisions`。
- 稳定 `TimelineAssembly -> CompileManifest`。
- 稳定 `CompileManifest -> MediaEditingProject`。
- coverage / decision log / blocker 成为 UI 一等信息。
- 未 selected 的资源必须显示 blocker。
- runtime lock 显示在 handoff 中。

### Phase 2.5: 可重复编译

- 为 `TimelineAssembly` 增加 input hash。
- 为 `CompileManifest` 增加 backend、adapter version、render settings。
- 明确同 backend 重复编译的可重现标准。
- 明确跨 backend 的 conformance report。
- backend 不支持 action 时返回 blocker。

### Phase 3: Editing Workspace 接入 provenance

- `MediaEditingProject` clip metadata 保存 MovScript provenance。
- Editing Workspace 的 inspector 展示 provenance。
- 支持从 `MediaEditingProject` 返回 Project Edit Desk。
- 支持从 Project Edit Desk 打开已有 editing project。

### Phase 4: MediaPipeline 编译后端化

- 明确 FFmpeg backend 当前能力。
- 增加 Remotion backend adapter 设计。
- 增加 HyperFrames backend adapter 设计。
- 增加 backend capability matrix。
- runtime lock 失败时返回 blocker。
- 不允许静默 fallback。

### Phase 5: Render result 回流

- render output 可以导入 Resource Library。
- 可以显式创建 ContentUnit candidate。
- 可以显式 adopt/select。
- HLS preview 和 domain candidate 分开处理。

## 暂不做的事情

第一阶段不要做：

- 不把 `TimelineAssembly` 立即变成新的 canonical source entity。
- 不删除现有 `Production / Segment / SceneMoment / ExpressionUnit` 建模。
- 不把真实剪辑 timeline 写进 `production.json`。
- 不在 Project Edit Desk 重做完整 NLE。
- 不把 render success 自动等同于 candidate selection。
- 不把 Remotion / HyperFrames 当作默认 fallback。

## 判断标准

下一阶段设计是否正确，可以用以下标准判断：

1. 用户能从 Production 进入一个清晰的意图编排台。
2. 用户能看到哪些 SceneMoment / ExpressionUnit / ContentUnit 已经进入片子。
3. 用户能看到哪些素材缺失或未选择。
4. 系统能生成 OpenMontage-style `asset_manifest` 和 `edit_decisions`。
5. 系统能从 handoff 创建 `CompileManifest`。
6. 用户能进入真实剪辑器精剪。
7. 系统能从 `CompileManifest` 创建 `MediaEditingProject`、Remotion composition 或 HyperFrames composition。
8. MediaPipeline 能基于明确 backend 渲染。
9. 同一 backend 在锁定输入和设置下可以重复编译。
10. 跨 backend 输出有 conformance report。
11. backend 不支持时给出 blocker，而不是偷偷换实现。
12. 渲染产物能显式导入 Resource Library。
13. 是否写入 candidate / selection 保持显式决策。

## 一句话总结

MovScript 下一步应该把 Project Edit Desk 做成 OpenMontage-style 的剪辑意图编排和可重复编译交接层，把已有 Editing Workspace 保留为 `MediaEditingProject` 这一种真实剪辑器，把 Remotion 和 HyperFrames 作为同级 backend adapter 纳入 MediaPipeline。
