# 剪辑台吸收 OpenMontage 剪辑动作方案

> 参考版本：OpenMontage `80e51fd`，仓库 <https://github.com/calesthio/OpenMontage>。
> 这份文档只讨论“剪辑动作如何从影视/素材计划走到剪辑产物”，不重新设计 MovScript 的 Production 源模型。

## 结论

OpenMontage 的核心不是一个可拖拽剪辑器，而是一套可审查的 workflow artifact：

```text
scene_plan
  -> asset_manifest
  -> edit_decisions
  -> video_compose
  -> render_report / final_review
```

其中 `edit_decisions` 是剪辑动作计划，不是最终视频产物。最终产物是 `video_compose` 依据 `edit_decisions + asset_manifest` 调用 Remotion、HyperFrames 或 FFmpeg 后生成的视频文件，并写入 `render_report`。

MovScript 应该吸收的是这套“剪辑动作合约”，而不是照搬 OpenMontage 的 source model：

| OpenMontage | MovScript 落点 |
| --- | --- |
| `scene_plan.scenes[]` | `Production / Segment / SceneMoment / ExpressionUnit` 的影视意图 |
| `scene_plan.scenes[].required_assets[]` | `ContentUnit` |
| `asset_manifest.assets[]` | `RawResource + ContentUnit Candidate / Selection` |
| `edit_decisions` | 剪辑台 `TimelineAssembly` handoff + `MediaEditingProject` |
| `render_report` | `MediaPipeline RenderTask` result + output `RawResource` |

剪辑台应该成为“影视意图和真实剪辑之间的编排层”：左侧放 `SceneMoment / ExpressionUnit / ContentUnit / Selected Resource`，中间和底部表达多轨剪辑意图，右侧编辑 OpenMontage-style 的动作参数，最终导出为 `MediaEditingProject` 并交给 Media Pipeline 渲染。

## OpenMontage 如何从剪辑动作到剪辑产物

OpenMontage 的 `edit_decisions.schema.json` 定义了一套比较小但完整的 EDL：

| 动作域 | 关键字段 | 含义 |
| --- | --- | --- |
| visual cuts | `cuts[].source/in_seconds/out_seconds/speed/layer/transform/transition_*` | 主视觉剪辑、入出点、速度、层级、转场和画面变换 |
| overlays | `overlays[].asset_id/start_seconds/end_seconds/position/opacity/animation` | 叠加层、贴图、文字卡、callout |
| narration | `audio.narration.segments[]` | 旁白音频素材何时进入 |
| music | `audio.music` / legacy `music` | 背景音乐、音量、fade、ducking |
| sfx | `audio.sfx[]` | 音效点位 |
| subtitles | `subtitles` | 字幕开关、样式、位置、字数限制、字幕资源 |
| transitions | `transitions[]` | 全局转场补充 |
| runtime lock | `renderer_family/render_runtime/composition_mode` | 锁定创意语法、渲染运行时、组合模式 |

它的执行方式有三个关键步骤。

第一，`video_compose.render` 先用 `asset_manifest.assets[]` 把 `cuts[].source` 从 asset id 解析成真实文件路径。也就是说，剪辑动作只引用资产 ID；文件路径和素材 provenance 由 asset manifest 负责。

第二，按 `edit_decisions.render_runtime` 做运行时路由：

| runtime | 处理方式 |
| --- | --- |
| `remotion` | 走 React/Remotion 组合，适合图文、数据、字幕、动画、视频混合 |
| `hyperframes` | 走 HTML/CSS/GSAP 组合，适合 motion graphics、网站转视频、角色/动效 |
| `ffmpeg` | 只做明确锁定的简单视频裁切、重编码、拼接、字幕烧录 |

如果锁的是 HyperFrames，失败时不能偷偷换 Remotion 或 FFmpeg；如果锁的是 Remotion，失败时也不能自动降级到 FFmpeg。这一点是 OpenMontage 的 governance 重点。

第三，渲染后必须做 self-review：`ffprobe` 检查容器、时长、分辨率、音频流；抽帧检查黑帧；音量检查静音/爆音；检查 runtime 是否被偷偷替换；检查字幕是否存在。通过后才形成可交付的 `render_report` / `final_review`。

所以 OpenMontage 不是“只有合并”。它有明确的剪辑意图规划，合并只是 FFmpeg runtime 下的一个执行分支。

## MovScript 的剪辑原理

MovScript 可以把剪辑拆成四层，避免 `SceneMoment` 同时承担太多职责：

```text
影视语义层
  Production / Segment / SceneMoment / ExpressionUnit

素材任务层
  ContentUnit -> Candidate -> Selection -> RawResource

剪辑意图层
  TimelineAssembly / OpenMontage-style edit actions

真实剪辑层
  MediaEditingProject -> MediaTimelineRecipe -> MediaPipeline render
```

`SceneMoment / ExpressionUnit` 不直接等于最终 clip。它们进入剪辑台后有两种角色：

| 角色 | 说明 |
| --- | --- |
| 意图容器 | 表示这一段故事、镜头目的、表演/视觉/听觉需求 |
| 放置约束 | 约束哪些 ContentUnit 或素材应该覆盖这段时间、哪些音频/字幕/特效要贯穿它 |

`ContentUnit` 才是“要生成或导入的素材任务”。`Selection / RawResource` 才是可放到 timeline 的稳定媒体依赖。

因此剪辑台拖拽逻辑应该分两类：

| 拖入对象 | 结果 |
| --- | --- |
| `SceneMoment` | 创建一个 timeline intent group / marker，可以自动展开该 scene 下的 ExpressionUnit 和 ContentUnit 占位 |
| `ExpressionUnit` | 创建一个更细的意图片段，例如 shot、voice、subtitle、sfx、overlay 需求 |
| `ContentUnit` | 如果已有 selected resource，创建真实 clip；如果没有 selection，创建 blocked placeholder clip |
| `Candidate / RawResource` | 创建真实 media clip，但 provenance 必须记录候选/资源来源 |

## 剪辑台 UI 应该如何表现

推荐剪辑台维持“左中右 + 下方时间线”的产品形态，但左侧不只是资源库，而是“影视意图和素材池”。

```text
┌──────────────────────────────────────────────────────────────┐
│ compact header: production / target / validation / render     │
├───────────────┬─────────────────────────────┬────────────────┤
│ left source   │ preview / assembly canvas    │ inspector      │
│ pool          │                             │                │
│               │                             │                │
├───────────────┴─────────────────────────────┴────────────────┤
│ multilayer intent timeline                                    │
└──────────────────────────────────────────────────────────────┘
```

左侧建议分四个 tab：

| Tab | 内容 | 主要动作 |
| --- | --- | --- |
| Story | `Production / Segment / SceneMoment` 树 | 拖入 scene，创建意图 group；查看覆盖情况 |
| Expression | 当前 scene 下的 `ExpressionUnit` | 拖入 shot/voice/subtitle/sfx/overlay 需求 |
| Content | `ContentUnit` 与 selection 状态 | 生成、选择、拖入真实 clip 或 placeholder |
| Resources | `RawResource / Candidate` | 预览素材，拖入 timeline，替换 clip source |

底部时间线不是完整专业 NLE 的替代品，而是“影视意图时间线”。第一版需要这些轨道就够：

| 轨道 | 放什么 | 对应 OpenMontage |
| --- | --- | --- |
| `video_main` | 主视觉 clip | `cuts[]` with `layer=primary` |
| `video_overlay` | 叠加视觉、贴纸、标题卡 | `overlays[]` 或 `cuts[].layer=overlay` |
| `voice` | 旁白/对白 | `audio.narration.segments[]` |
| `music` | 背景音乐 | `audio.music` |
| `sfx` | 音效点 | `audio.sfx[]` |
| `subtitle` | 字幕片段或字幕资源 | `subtitles` |
| `marker` | scene/expression 意图区间 | MovScript provenance，不一定渲染 |

右侧 inspector 直接编辑 OpenMontage 动作参数：

| Clip 类型 | Inspector 字段 |
| --- | --- |
| visual | source in/out、timeline start、duration、speed、fit/crop/scale/position、transition in/out、reason |
| overlay | position、size、opacity、animation、start/end |
| voice | start/end、volume、对应 script section |
| music | volume、fade in/out、ducking |
| sfx | start、volume |
| subtitle | text/source、style、position、max words |
| marker/group | SceneMoment / ExpressionUnit binding、coverage、missing content units |

每个 clip 应该显示三类状态：

| 状态 | UI 表达 |
| --- | --- |
| source binding | `scene`, `expression`, `content unit` chips |
| media readiness | selected / needs selection / missing candidate |
| edit validity | gap、overlap、missing source、runtime mismatch、subtitle missing |

## 建议的数据结构

不要把第一版做成新的 canonical domain source。剪辑台可以先维护一个 handoff state，然后投影成 `edit_decisions` 和 `MediaEditingProject`。

最小结构：

```ts
type EditDeskAssembly = {
  schema: 'movscript.timeline_assembly.intent_workbench.v1'
  id: string
  projectId: string
  targetRef: string
  productionId?: string
  sourceNamespace: SourceNamespace
  tracks: AssemblyTrack[]
  clips: AssemblyClip[]
  editProfile: {
    rendererFamily: string
    renderRuntime: 'remotion' | 'hyperframes' | 'ffmpeg'
    compositionMode: 'templated' | 'atelier' | 'timeline_assembly'
    subtitles: SubtitleProfile
    audio: AudioProfile
  }
}

type SourceNamespaceNode = {
  id: string
  kind: 'production' | 'segment' | 'scene_moment' | 'expression_unit' | 'content_unit'
  title: string
  parentId?: string
  path?: string
}

type AssemblyClip = {
  id: string
  trackId: string
  kind: 'visual' | 'voice' | 'music' | 'sfx' | 'subtitle' | 'effect' | 'marker'
  startMs: number
  durationMs: number
  sourceInMs?: number
  source: {
    contentUnitId?: string
    candidateId?: string
    resourceId?: number
    status: 'selected' | 'needs_selection' | 'missing_candidate'
  }
  binding: {
    sceneMomentId?: string
    expressionUnitId?: string
    targetRef?: string
  }
  edit: {
    layer?: 'primary' | 'overlay' | 'background'
    speed?: number
    transform?: unknown
    transitionIn?: string
    transitionOut?: string
    overlay?: unknown
    reason?: string
  }
}
```

导出时生成三份东西：

```text
EditDeskAssembly
  -> OpenMontage-style asset_manifest
  -> OpenMontage-style edit_decisions
  -> editing_project_create_from_edit_decisions request
```

`TimelineAssembly` 在这里不是新的 production source；它是剪辑台的工作台状态和 handoff。真正进入渲染执行的是 `MediaEditingProject`。

## 从剪辑动作写入 MediaEditingProject

动作词表可以直接映射到 `MediaEditingProject`：

| OpenMontage action | MediaEditingProject 表达 |
| --- | --- |
| `cut` | video/image track clip，带 `timelineStartMs/sourceStartMs/durationMs/speed/fit/transition` |
| `overlay` | effect/text/image track clip，允许 overlap |
| `narration_segment` | audio track clip |
| `music_bed` | audio track clip，metadata 记录 fade/ducking |
| `sfx_hit` | audio track clip |
| `subtitle_segment` | subtitle/text track clip |
| `global_transition` | clip transition 或 timeline metadata |
| `runtime_lock` | project/source metadata，不允许 render 时隐式替换 |
| `timeline_coverage_check` | validation diagnostics，不是 clip |

剪辑台保存时应该走命令式写入：

```text
drag / trim / move / split / delete
  -> update EditDeskAssembly
  -> derive edit_action_plan
  -> derive MediaEditingProject preview
  -> validate timeline
  -> save handoff or create/update editing project
```

渲染时：

```text
MediaEditingProject
  -> editing_timeline_validate
  -> editing_task_render_create
  -> RenderTask result
  -> import output as RawResource
  -> optional create/adopt ContentUnit candidate for final film
```

## 下一步落地工作

1. 左侧 source pool 增加 `Story / Expression / Content / Resources` tab。
2. 在 `Story` tab 里展示 `Production -> Segment -> SceneMoment`，支持拖入 scene 创建 marker/group。
3. 在 `Expression` tab 里展示当前 SceneMoment 的 `ExpressionUnit`，支持拖入 shot/voice/subtitle/sfx/overlay 意图占位。
4. `Content` tab 展示每个 `ContentUnit` 的 candidate/selection 状态，拖入时根据 selected resource 创建真实 clip，否则创建 blocked placeholder。
5. timeline clip 统一显示 `SceneMoment / ExpressionUnit / ContentUnit / Resource` chips。
6. inspector 增加 OpenMontage 动作字段：cut、overlay、audio、subtitle、transition、runtime lock。
7. 保存时生成 `asset_manifest`、`edit_decisions`、`edit_action_plan`、`MediaEditingProject preview` 四段 handoff。
8. validation 增加 coverage：每个 required ContentUnit 是否被 timeline 覆盖；每个 SceneMoment 是否至少有 visual/voice/subtitle 的预期覆盖。
9. render 前强校验 `renderRuntime`，失败时暴露 blocker，不能隐式换 Remotion/HyperFrames/FFmpeg。
10. render 完成后将 output import 成 RawResource；只有用户明确要求时，才写成 final film 的 ContentUnit candidate/selection。

## 参考文件

OpenMontage：

- `schemas/artifacts/edit_decisions.schema.json`: <https://github.com/calesthio/OpenMontage/blob/80e51fd/schemas/artifacts/edit_decisions.schema.json>
- `schemas/artifacts/scene_plan.schema.json`: <https://github.com/calesthio/OpenMontage/blob/80e51fd/schemas/artifacts/scene_plan.schema.json>
- `schemas/artifacts/asset_manifest.schema.json`: <https://github.com/calesthio/OpenMontage/blob/80e51fd/schemas/artifacts/asset_manifest.schema.json>
- `schemas/artifacts/render_report.schema.json`: <https://github.com/calesthio/OpenMontage/blob/80e51fd/schemas/artifacts/render_report.schema.json>
- `tools/video/video_compose.py`: <https://github.com/calesthio/OpenMontage/blob/80e51fd/tools/video/video_compose.py>
- `skills/pipelines/explainer/edit-director.md`: <https://github.com/calesthio/OpenMontage/blob/80e51fd/skills/pipelines/explainer/edit-director.md>
- `skills/pipelines/explainer/compose-director.md`: <https://github.com/calesthio/OpenMontage/blob/80e51fd/skills/pipelines/explainer/compose-director.md>

MovScript：

- `packages/editing/src/media-project.ts`
- `surface/project/src/components/edit-desk/ProjectEditDeskSurface.tsx`
- `surface/editing/src/features/domain/types.ts`
