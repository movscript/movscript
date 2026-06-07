# MovScript 层级 Workspace 与领域实体设计讨论稿

本文沉淀当前关于 MovScript workspace 设计的讨论。它不是最终实现说明，而是用于对齐几个核心问题：

- `WorkspaceKind` 应该表达什么。
- `SemanticEntityKind` 应该表达什么。
- 项目、制作、节奏段、场景时刻、内容单元、关键帧、预览时间线之间是什么关系。
- agent 修改文件以后，系统应该如何解释这些改动对影视编辑器的意义。
- 当前仍然不确定、需要继续讨论的点。

## 核心判断

`WorkspaceKind` 不应只是横向枚举几个编辑面，也不应直接等同实体类型。更合理的定义是：`WorkspaceKind` 是项目文件系统中的层级上下文，表示 agent 或 UI 当前站在哪一层业务目录里工作。

`SemanticEntityKind` 则表示某个 workspace 目录下具体 JSON 或文档文件的领域写法，也就是文件内容 schema。它描述的是“这个文件是什么实体”，而不是“当前在哪个工作区”。core 内部使用 snake_case canonical entity kind，前端可以保留 camelCase/plural collection key 作为适配层。

因此二者的职责应该拆开：

```text
WorkspaceKind
  管目录层级、上下文边界、权限、默认可见范围、可编辑路径、字段读取位置。

SemanticEntityKind
  管具体文件内容类型、schema、字段、校验、索引实体类型。
```

当前已收敛的原则：

- 不再保留 `edit/` 作为 source 顶层目录；项目根目录下的 `settings/`、`scripts/`、`productions/` 等就是可编辑 source。
- `WorkspaceModel` 使用递归结构，只描述本层 `WorkspaceKind` 和子 workspace；`SemanticEntityKind` 由 `WorkspaceKind` 固定映射派生。
- 只要某类实体在文件系统中形成“目录 + 主 JSON + 子目录”的层级，它就应该有对应的 `WorkspaceKind`。workspace 的核心作用是决定数据从哪里读、当前上下文在哪里，而不是额外发明一套业务类型。
- 字段不是自由漂浮的。某个 production、某个节奏段、某个场景时刻、某个分镜规划或某个内容单元的字段，都必须由对应 workspace 的主 JSON 提供读取依据，不能因为 agent 想补一个字段就写到任意文件里。
- 不同 workspace 可以拥有同一种子 workspace kind，例如 `keyframe_workspace` 可以出现在不同父级下；这代表相同数据类型在不同上下文中的实例，不代表同一事务。
- `preview_timeline` 是 build 产物，只读，不作为 source workspace。交付相关功能暂不纳入当前设计。
- 用户或 agent 调整节奏、gap、caption、audio 和顺序时，只能修改 source 数据；build 自动重新编译预览时间线。
- build 只报告、编译、产出 `.build/`，不自动修改 source。自动修复必须是显式操作。
- 领域本体先放在 `packages/core/src/workspace/domain/`。

## 项目与 Workspace 层级

项目本身应是根 workspace：

```text
project_workspace
```

它代表一个完整影视项目的本地工作空间，通常对应一个项目根目录或 Git repository。项目下再按业务层级组织 workspace：

```text
project_workspace
  project_standards_workspace
  setting_workspace
    setting_state_workspace
      asset_workspace
    asset_workspace
  script_workspace
    script_version_workspace
      script_block_workspace
  content_unit_workspace
    keyframe_workspace
  production_workspace
    segment_workspace
      scene_moment_workspace
        storyboard_workspace
          writing_expression_workspace
```

这棵树表达的是可编辑业务上下文，而不是所有派生结果。每个 workspace 都有严格父子关系。`asset_workspace` 存在，但它只能作为 `setting_workspace` 或 `setting_state_workspace` 的子 workspace；asset 必然属于某个 setting 或 setting state。`preview_timeline` 不作为可编辑 workspace，它应由 build 根据 source 文件编译生成。交付相关功能暂不纳入当前设计。

举一个具体例子：

```text
project_workspace: 反转短剧《雨夜来电》
  project_standards_workspace: 竖屏 9:16、冷色雨夜、快节奏悬疑
  setting_workspace: 女主、出租屋、手机、雨夜街道，以及它们各自的状态与资产
    asset_workspace: 女主基础形象参考
    setting_state_workspace: 雨夜惊恐状态
      asset_workspace: 红外套湿发参考
  script_workspace: 第 1 集剧本文本和 script blocks
    script_version_workspace: 第 1 集剧本 v1
      script_block_workspace: 开场段落
  content_unit_workspace: 稳定生产单位池
    keyframe_workspace: 手机蓝光照亮女主惊恐表情的指导画面
  production_workspace: 第 1 集制作
    segment_workspace: 开场压迫感升级
      scene_moment_workspace: 女主在出租屋听到陌生来电
        storyboard_workspace: 这一场景时刻的分镜规划
```

对应到文件路径可以是：

```text
productions/production_p8f3/production.json
productions/production_p8f3/segments/segment_a19d/segment.json
productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k/scene_moment.json
productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k/storyboards/storyboard_main/storyboard.json
content_units/content_unit_k41m/content_unit.json
content_units/content_unit_k41m/keyframes/keyframe_c83x/keyframe.json
settings/setting_sd8345/setting.json
settings/setting_sd8345/assets/asset_dftt345/asset.json
settings/setting_sd8345/states/setting_state_se4352/setting_state.json
settings/setting_sd8345/states/setting_state_se4352/assets/asset_2343x/asset.json
.build/current/productions/production_p8f3/preview_timeline.json
```

在这个例子里，`WorkspaceKind` 说明 agent 正在编辑哪一层上下文；`SemanticEntityKind` 说明某个 JSON 文件是什么实体。例如 `content_unit_k41m/content_unit.json` 的实体类型是 `content_unit`，而它所在的业务上下文是 `content_unit_workspace`。

目录名只做稳定 id 定位，不承载标题、节奏、剧情或顺序语义。比如 `segment_a19d` 只是一个稳定目录 id；“开场压迫感升级”和排序 `order` 应该写在 `segment_a19d/segment.json` 里，而不是写进目录名。

`settings/setting_sd8345/assets/asset_dftt345/asset.json` 表示这个 asset 属于 `setting_sd8345`。`settings/setting_sd8345/states/setting_state_se4352/assets/asset_2343x/asset.json` 表示这个 asset 属于该 setting 的某个状态。production 下的 scene moment 和 storyboard 只引用这些 setting asset，不直接拥有 asset。

`.build/current/productions/production_p8f3/preview_timeline.json` 是 build 产物，表示影视编辑器可读取的预览时间线索引。它不是 source 文件，agent 和 UI 不直接编辑它。


## 核心领域关系

### Project

Project 是影视项目整体。它包含项目元数据、剧本、设定、制作结构、资产需求和构建产物。交付相关功能暂不纳入当前设计。

Project 不只是数据库中的一行，也不是单纯目录名。它是所有创作文件、运行态引用和构建结果的业务边界。

### Production

Production 是某个可制作单元的制作根。它可以对应一集、一个短片、一个广告片段或一个完整视频版本。

Production 下组织叙事结构、情绪节奏、内容单元、预览时间线和后续生成所需的视觉锚点。

### Segment

Segment 中文建议称为“节奏段”。它是制作内的节奏、情绪推进或戏剧功能阶段，不是剧本文本段，也不是镜头，也不是一个原始视频片段。

它回答的是：

```text
这一段在整体制作里承担什么情绪、节奏或戏剧功能？
```

典型 kind 可以包括：

```text
emotional_function
rhythm_shift
dramatic_function
setup
escalation
release
reversal
transition
```

Segment 是 production 内的一级编排结构。

### SceneMoment

SceneMoment 中文建议称为“场景时刻”，是 导演理解的核心上下文。

它回答的是：

```text
什么时候？
在哪里？
什么条件下？
谁或什么在做什么？
这一刻的情绪是什么？
```

SceneMoment 应挂在 Segment 下。它不是 setting，不直接创建角色、地点或道具。SceneMoment 只表达场景时刻本身；具体使用哪些 setting/setting state、文字表达和分镜调度，放到 storyboard 里。

`storyboard_timing` 不再作为独立文件或独立 `SemanticEntityKind`。它应作为 `scene_moment.json` 的字段存在，用来按顺序排布当前 scene moment 内采用的 storyboards。

也就是说，时间编排的事实源在 `scene_moment_workspace`，排布对象是 `storyboard_id`。SceneMoment 不直接排布 shot plan，也不直接排布 content unit。v1 先表达 storyboard 顺序，并允许在 `storyboard_timing` 的 scene moment 层标注 audio 和 transition。

例如 `scene_moment.json` 可以包含：

```json
{
  "schema": "movscript.scene_moment.v1",
  "kind": "scene_moment",
  "id": "scene_moment_r72k",
  "title": "女主在出租屋听到陌生来电",
  "active_storyboard_id": "storyboard_main",
  "storyboard_timing": {
    "items": [
      {
        "storyboard_id": "storyboard_main",
        "order": 1
      }
    ],
    "audio": {
      "note": "雨声压低，手机震动声突出"
    },
    "transition": {
      "out": "hold_then_cut"
    }
  }
}
```

### Storyboard

Storyboard 中文可以称为“分镜规划”。它进入 production 主链路，但不作为 content unit 的父 workspace，也不引用 content unit。更合理的关系是：`storyboard_workspace` 挂在 `scene_moment_workspace` 下，project-level `content_unit_workspace` 挂在项目根下；引用方向只能从 content unit 指向 scene moment / storyboard。

```text
production -> segment -> scene_moment
  -> storyboard

project -> content_unit -> keyframe
```

这样调整后，SceneMoment 仍然回答“这个场景时刻发生了什么”，Storyboard 回答“这个场景时刻如何规划镜头和调度”，ContentUnit 回答“某个稳定生产单位是什么、生产过程如何、当前产物是什么”。

Storyboard 不是 content unit 的容器，也不是 keyframe 的辅助备注。它是导演规划层，只表达镜头、景别、调度、灯光、人物摆位、表情、参考图等规划信息。Storyboard 不感知 ContentUnit 的存在；ContentUnit 属于另一套制作思维。

- 分镜意图：这个 scene moment 拆成哪些视觉、声音、字幕或转场单元。
- shot plan：分镜规划项自身的镜头类型、景别、机位、焦段、运动、构图、调度、灯光、人物摆位和表演。
- coverage plan：哪些动作、反应、环境、道具、插入镜头必须覆盖。
- visual continuity：视线、方向、轴线、空间连续性和情绪递进。
- setting refs：这个 storyboard 使用哪些 setting/setting state。
- writing expressions：旁白、台词、字幕、caption 等文字表达。
- storyboard panels：可选的分镜草图、参考图或面板描述。

`shot_plans[]` 和 `writing_expressions/` 是 storyboard 下两个独立集合。镜头调度和对话/文字表达并不天然共享同一个顺序；它们可以各自有顺序或目标引用。需要预览时，由 build 根据 storyboard、scene moment 和额外节奏约束派生 preview timeline。

`storyboard.json` 不直接承载最终时间线，也不记录生产状态。时间布局仍由 `scene_moment.json` 的 `storyboard_timing` 字段统一管理；生产状态、生成任务、候选结果和锁定结果属于 content unit/keyframe 等生产实体。这样 storyboard 可以作为规划方案被修改、替换或多版本并存，而 content unit 的生产记录保持稳定。

例如 `storyboard.json` 可以包含：

```json
{
  "schema": "movscript.storyboard.v1",
  "kind": "storyboard",
  "id": "storyboard_main",
  "title": "雨夜来电分镜规划",
  "shot_plans": [
    {
      "id": "shot_plan_1",
      "order": 1,
      "shot_size": "close_up",
      "camera": {
        "camera_height": "eye_level",
        "angle": "slightly_low",
        "lens": "50mm",
        "focus_strategy": "rack_focus_phone_to_face",
        "movement": {
          "type": "slow_push_in",
          "speed": "slow"
        }
      },
      "blocking": {
        "space": "出租屋床边到窗边的狭窄空间",
        "camera_path": "从手机特写缓慢推到女主脸部",
        "composition": "手机在前景，女主脸在后景虚焦后逐渐清晰"
      },
      "lighting": {
        "motivation": "手机屏幕和窗外雨夜蓝光",
        "contrast": "high",
        "color_temperature": "cool"
      },
      "performance": [
        {
          "setting_ref": "setting_sd8345",
          "position": "bedside_right",
          "action": "右手握住震动的手机，身体微微后退",
          "expression": "惊恐但克制",
          "gaze": "phone_screen"
        }
      ],
      "reference_image_refs": ["resource_blocking_diagram_01"]
    }
  ]
}
```

### ContentUnit

ContentUnit 是可制作的内容单元。传统镜头只是其中一种。

它回答的是：

```text
为了表现某个 scene moment，需要哪些可以被制作、预览或生成的最小单元？
```

典型 kind 可以包括：

```text
shot
voiceover
dialogue_audio
sound
music_beat
subtitle
caption_card
transition
```

ContentUnit 应提升到 Project 下，而不是挂在 SceneMoment 或 Storyboard 下。它是项目级、独立、稳定的生产单位，需要稳定记录可编辑提示词、生产上下文引用、生产过程、生成状态、候选结果、锁定结果、资源引用和关键帧。SceneMoment 和 Storyboard 是规划思维；ContentUnit 是制作思维。规划侧不感知 ContentUnit，制作侧可以通过 `source_context` 引用规划侧。

这里的生产上下文引用，指的是 content unit 引用它服务的 `scene_moment` 和 `storyboard`。它不是父子所有权，也不需要重复写 production/segment；production/segment 可以由 build 通过 scene moment 路径反推。ContentUnit 不引用 storyboard 内部的 `shot_plans[]`。

ContentUnit 下面应该支持不同种类的子结构。对于 `kind: "shot"` 的内容单元，它可以拥有 keyframes、production records、generation records、candidates/lock 等生产相关字段；镜头参数、景别、调度、灯光、人物摆位等导演规划字段应放在 storyboard 的有序 `shot_plans[]` 中。ContentUnit 通过 `source_context` 指向它参考的 storyboard。

`candidates` 表示这个 production unit 已经生产出的多个可选结果，例如多次生成的视频、音频、图片或字幕方案。`lock` 表示当前被选中的结果。也就是说，content unit 不是“规划项”，而是“结果选择池 + 当前选择”。

ContentUnit 里应该有可编辑提示词。这里的 prompt 是 source prompt，表示用户或 agent 对这个生产单位的生成意图、重点、补充说明和禁止项。它不是最终发给某个模型的完整 prompt。

最终 `generation_prompt` 更像 build 编译出来的结果。build 根据 project standards、setting assets、scene moment、storyboard shot plan、content unit 的 editable prompt、keyframe 和目标生成模型配置，生成面向具体模型的 prompt、negative prompt、reference bundle 和参数包。

因此 source model 应分层：

- `storyboard.json`：导演/摄影/美术能理解的镜头设计与调度规划。
- `content_unit.json`：稳定生产单位的类型、可编辑提示词、source context 引用、状态、生产记录、资源候选和锁定结果。
- `keyframe.json`：该生产单位或场景时刻的视觉锚点。

一个 shot 类型 content unit 的结构可以是：

```text
content_unit_k41m/
  content_unit.json
  keyframes/
    keyframe_c83x/
      keyframe.json
```

其中 `content_unit.json` 可以包含：

```json
{
  "schema": "movscript.content_unit.v1",
  "kind": "content_unit",
  "id": "content_unit_k41m",
  "unit_kind": "shot",
  "title": "女主盯着震动的手机",
  "source_context": {
    "scene_moment_ref": "productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k",
    "storyboard_ref": "productions/production_p8f3/segments/segment_a19d/scene_moments/scene_moment_r72k/storyboards/storyboard_main"
  },
  "editable_prompt": {
    "prompt": "女主盯着震动的手机，手机冷光照亮脸部，表情惊恐但克制，雨夜出租屋氛围压迫",
    "negative_prompt": "卡通感，手部畸形，手机文字不可读，过度夸张表情",
    "notes": "保持女主红外套湿发状态，手机应在前景形成压迫感"
  },
  "production_status": "in_progress",
  "generation_constraints": {
    "aspect_ratio": "9:16",
    "duration_sec": 4.5
  },
  "candidates": [
    {
      "id": "candidate_a",
      "resource_id": "remote_video_resource_123",
      "status": "draft",
      "created_from": {
        "storyboard_id": "storyboard_main"
      }
    }
  ],
  "lock": {
    "candidate_id": "candidate_a",
    "reason": "selected_for_preview"
  }
}
```

如果 content unit 是 `voiceover`、`subtitle`、`sound`、`music_beat` 或 `transition`，它可以有不同的子结构，而不必强行拥有 shot workspace。

### Keyframe

Keyframe 是 SceneMoment 或 ContentUnit 的视觉锚点。它不是普通素材，也不是最终资源本身。

它回答的是：

```text
这个场景时刻或内容单元的指导性画面是什么？
后续镜头生成、资产候选、预览时间线应该参考哪一个视觉状态？
```

Keyframe 可以引用生成出的 resource，也可以引用 canvas，但它本身仍是业务实体。生成任务、临时运行状态和二进制资源不应直接进入 keyframe 文件，只能通过稳定资源引用进入。

scene-level keyframe 和 content-unit-level keyframe 使用同一套 keyframe schema。不同父级只表示它服务的上下文不同，不表示它是不同种类的实体。

Keyframe 可以挂在：

- `scene_moment_workspace` 下，作为整个场景时刻的视觉锚点。
- `content_unit_workspace` 下，作为某个内容单元的视觉锚点。

Keyframe 也需要 `candidates` 和 `lock` 字段，类似 asset。`candidates` 记录可选资源或画面方案；`lock` 表示当前被确认使用的 candidate/resource。asset candidate 可以引用 keyframe，但不应把 keyframe 简化成 asset。

### PreviewTimeline

PreviewTimeline 是制作结构的预览编排层。它不是可编辑 source，也不是内容树本身，而是 build 根据 production 文件夹结构、content unit timing、keyframe 和必要的节奏约束编译出来的只读 read model。

PreviewTimelineItem 可以代表：

```text
segment
scene_moment
content_unit
```

并且可以使用：

```text
keyframe
resource
```

因此 preview timeline 的主要职责是：

- 表达可播放顺序。
- 暴露 gap、note、caption、audio、image、video 等预览项。
- 为影视编辑器提供当前 production 的时间线视图。
- 在 agent 修改内容结构后，提示时间线需要如何重排或重算。

preview timeline 永远不直接编辑。影视编辑器里的时间线调整应落回 source 文件，例如 `scene_moment.json` 的 `storyboard_timing` 字段、`content_unit.json` 的时长/转场字段，或其他明确的节奏约束数据；build 再把这些 source intent 编译成 `.build/current/.../preview_timeline.json`。

### Asset

Asset 是 setting 或 setting state 的附属实体。MovScript 里应有 `asset_workspace`，但它必须挂在某个 `setting_workspace` 或 `setting_state` 下，不应成为 project-level 横切 workspace。

这里的 asset 本质上是一个资产槽位声明：它描述某个 setting 或 setting state 需要、锁定或引用什么稳定资源。asset 可以挂 remote `resource_id`，因此同一个远端 resource 可以被多个 asset 复用；但每个 asset source 文件本身只能属于一个 setting 或 setting state。

asset candidate 不再拆成独立文件或独立 workspace。候选、锁定和最终引用都放在 `asset.json` 内部：

```json
{
  "schema": "movscript.asset.v1",
  "kind": "asset",
  "id": "asset_dftt345",
  "title": "女主基础形象参考",
  "slot": "character_base_portrait",
  "candidates": [
    {
      "id": "candidate_a",
      "resource_id": "remote_resource_123",
      "source": "generated",
      "status": "accepted"
    },
    {
      "id": "candidate_b",
      "resource_id": "remote_resource_456",
      "source": "uploaded",
      "status": "rejected"
    }
  ],
  "lock": {
    "candidate_id": "candidate_a",
    "resource_id": "remote_resource_123",
    "reason": "confirmed_by_user"
  }
}
```

build 应生成 project-level asset index，汇总所有 `setting_workspace` 和 `setting_state_workspace` 下的 assets。production、scene moment、storyboard、content unit、shot 和 keyframe 只引用这个索引中的 setting asset，不直接拥有 asset source。

例如：

- 女主形象参考属于“女主” setting。
- 出租屋平面图属于“出租屋” setting。
- 手机特写候选图属于“手机” setting。
- 世界观、风格参考、道具、地点的资产也都应先落到对应 setting 下。

Production、SceneMoment、ContentUnit、Keyframe 不直接拥有 asset workspace。它们通过显式 setting、setting state 或 setting asset reference 使用 asset。这样可以避免同一个角色、地点或道具在不同 production 层级里重复产生互相冲突的资产事实源。

## 建议的目录模型

下面是一种更贴近层级 workspace 的目录模型。目录名只做稳定 id 定位，不承载业务语义或数组顺序；排序写在 JSON 的 `order` 字段里，由 build 映射。

```text
project.json
workspace.json

settings/
  setting_sd8345/
    setting.json
    states/
      setting_state_se4352/
        setting_state.json
        assets/
          asset_2343x/
            asset.json
    assets/
      asset_dftt345/
        asset.json

scripts/
  script_main/
    script.json
    script.md
    versions/
      script_version_v1/
        script_version.json
        blocks/
          script_block_1.json

content_units/
  content_unit_k41m/
    content_unit.json
    keyframes/
      keyframe_c83x/
        keyframe.json

productions/
  production_p8f3/
    production.json
    segments/
      segment_a19d/
        segment.json
        scene_moments/
          scene_moment_r72k/
            scene_moment.json
            storyboards/
              storyboard_main/
                storyboard.json
                writing_expressions/
                  writing_expression_1/
                    writing_expression.json
            keyframes/
              keyframe_scene_anchor/
                keyframe.json
```

这个模型的优势：

- 目录层级和业务层级一致。
- agent 进入某个 workspace 后，上下文边界清晰。
- `segment_workspace`、`scene_moment_workspace`、`content_unit_workspace` 不再只是抽象概念，而是能对应实际目录。
- 文件路径能自然表达父子关系，减少 JSON 内重复写 parent id 的压力；顺序不由文件路径表达，而由 JSON 数据表达。

仍需注意：路径表达父子关系不代表 JSON 里完全不需要引用字段。为了 build、索引、迁移和跨文件移动，核心关系仍应能被解析成显式 domain graph。

稳定 id 目录的含义：

- `production_p8f3` 是一个稳定 production id，不表达顺序。
- `segment_a19d` 是该 production 下的一个稳定 segment id，不表达顺序。
- `scene_moment_r72k` 是该 segment 下的一个稳定 scene moment id，不表达顺序。
- `storyboard_main` 是该 scene moment 下的一个稳定 storyboard id，不表达顺序。
- `content_unit_k41m` 是 project 下的一个稳定 content unit id，不表达顺序；它通过 `source_context` 指向 scene moment 和 storyboard。
- `keyframe_c83x` 是该 content unit 或 scene moment 下的一个稳定 keyframe id。
- `asset_dftt345` 是该 setting 下的一个稳定 asset id。

collection 目录使用复数，例如 `settings/`、`states/`、`assets/`；具体实体目录使用单数实体类型加稳定 id，例如 `setting_sd8345/`、`setting_state_se4352/`、`asset_dftt345/`；实体内容文件使用固定单数实体名，例如 `setting.json`、`setting_state.json`、`asset.json`。

标题、摘要、节奏、场景描述、视觉设计、状态、排序 `order` 等 source 业务语义全部写在 JSON 文件里。文件系统顺序无意义，重新排序时修改 JSON 数据并重新 build，不重命名目录。面向具体生成模型的 `generation_prompt` 是 build 派生结果，不作为 source 语义直接维护。

preview timeline 不在 source 目录模型里出现。它由 build 写入 `.build/current/productions/{productionId}/preview_timeline.json`，作为 production 文件夹结构的 index 和影视编辑器读取模型。


## WorkspaceKind 设计建议

`WorkspaceKind` 应扩展成层级概念：

```ts
export type WorkspaceKind =
  | 'project_workspace'
  | 'project_standards_workspace'
  | 'setting_workspace'
  | 'setting_state_workspace'
  | 'asset_workspace'
  | 'script_workspace'
  | 'script_version_workspace'
  | 'script_block_workspace'
  | 'production_workspace'
  | 'segment_workspace'
  | 'scene_moment_workspace'
  | 'storyboard_workspace'
  | 'writing_expression_workspace'
  | 'content_unit_workspace'
  | 'keyframe_workspace'
```

`WorkspaceModel` 应是递归结构。它只描述两件事：

1. 本层级的 `WorkspaceKind`。
2. 下属的 `WorkspaceModel`。

`WorkspaceKind` 和 `SemanticEntityKind` 应强绑定，但不要在每个 `WorkspaceModel` 节点里手写两份。`WorkspaceKind` 是主键，`SemanticEntityKind` 由 `WorkspaceKind` 固定映射派生。

不在 `WorkspaceModel` 里放 `entityKind`、`owns`、`references`、`derives`、`allowedChildWorkspaceKinds` 这类横向字段。父子关系直接由递归树表达，实体类型、引用关系和派生关系交给固定映射与 build 阶段的 relation graph。

```ts
interface WorkspaceModel<K extends WorkspaceKind = WorkspaceKind> {
  kind: K
  children: WorkspaceModel[]
}

type WorkspaceEntityKindMap = {
  project_workspace: 'project'
  project_standards_workspace: 'project_standards'
  setting_workspace: 'setting'
  setting_state_workspace: 'setting_state'
  asset_workspace: 'asset'
  script_workspace: 'script'
  script_version_workspace: 'script_version'
  script_block_workspace: 'script_block'
  production_workspace: 'production'
  segment_workspace: 'segment'
  scene_moment_workspace: 'scene_moment'
  storyboard_workspace: 'storyboard'
  writing_expression_workspace: 'writing_expression'
  content_unit_workspace: 'content_unit'
  keyframe_workspace: 'keyframe'
}

const WORKSPACE_ENTITY_KIND: WorkspaceEntityKindMap = {
  project_workspace: 'project',
  project_standards_workspace: 'project_standards',
  setting_workspace: 'setting',
  setting_state_workspace: 'setting_state',
  asset_workspace: 'asset',
  script_workspace: 'script',
  script_version_workspace: 'script_version',
  script_block_workspace: 'script_block',
  production_workspace: 'production',
  segment_workspace: 'segment',
  scene_moment_workspace: 'scene_moment',
  storyboard_workspace: 'storyboard',
  writing_expression_workspace: 'writing_expression',
  content_unit_workspace: 'content_unit',
  keyframe_workspace: 'keyframe',
}

function entityKindForWorkspaceKind<K extends WorkspaceKind>(kind: K): WorkspaceEntityKindMap[K] {
  return WORKSPACE_ENTITY_KIND[kind]
}
```

例如：

```ts
const projectWorkspaceModel: WorkspaceModel = {
  kind: 'project_workspace',
  children: [
    {
      kind: 'setting_workspace',
      children: [
        {
          kind: 'setting_state_workspace',
          children: [
            {
              kind: 'asset_workspace',
              children: [],
            },
          ],
        },
        {
          kind: 'asset_workspace',
          children: [],
        },
      ],
    },
    {
      kind: 'script_workspace',
      children: [
        {
          kind: 'script_version_workspace',
          children: [
            {
              kind: 'script_block_workspace',
              children: [],
            },
          ],
        },
      ],
    },
    {
      kind: 'content_unit_workspace',
      children: [
        {
          kind: 'keyframe_workspace',
          children: [],
        },
      ],
    },
    {
      kind: 'production_workspace',
      children: [
        {
          kind: 'segment_workspace',
          children: [
            {
              kind: 'scene_moment_workspace',
              children: [
                {
                  kind: 'storyboard_workspace',
                  children: [
                    {
                      kind: 'writing_expression_workspace',
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
```

这样实现递归时，系统只需要从 root workspace 开始向下走，就能得到当前路径和可进入的子 workspace；需要当前层级实体类型时，通过 `entityKindForWorkspaceKind(model.kind)` 派生。跨层引用、setting asset 使用、preview timeline 派生，都不进入 workspace model，而由 build 解释 source tree 后生成。

## SemanticEntityKind 设计建议

`SemanticEntityKind` 应改成 canonical domain entity type，而不是前端 collection key。

建议使用单数 snake_case：

```ts
export type SemanticEntityKind =
  | 'project'
  | 'project_standards'
  | 'setting'
  | 'setting_state'
  | 'asset'
  | 'script'
  | 'script_version'
  | 'script_block'
  | 'production'
  | 'segment'
  | 'scene_moment'
  | 'storyboard'
  | 'writing_expression'
  | 'content_unit'
  | 'keyframe'
```

前端现在的 `scriptVersions`、`sceneMoments`、`contentUnits` 这类名字更适合叫 `SemanticEntityCollectionKey`，用于 UI 路由、列表和 label，不应该成为 core 领域实体的名字。

## Entity Schema 草案

本节先写 v1 草案，用来逐个核对每个 entity 的字段含义。这里不是最终代码实现，但字段名应尽量接近未来 core schema。

通用字段建议：

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `schema` | 是 | schema 标识，例如 `movscript.production.v1`。 |
| `kind` | 是 | `SemanticEntityKind`。 |
| `id` | 是 | 稳定实体 id，通常和目录 id 一致。 |
| `title` | 否 | 给用户看的标题，不参与路径和顺序语义。 |
| `description` | 否 | 人类可读说明。 |
| `order` | 否 | 同父级下的显示或叙事顺序。目录名不表达顺序。 |
| `tags` | 否 | 轻量分类。 |
| `notes` | 否 | 人类/agent 备注。 |

### project

路径：`project.json`

含义：项目根实体。定义一个影视项目的业务边界。

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `schema` | 是 | `movscript.project.v1`。 |
| `kind` | 是 | 固定为 `project`。 |
| `id` | 是 | project id。 |
| `title` | 是 | 项目名。 |
| `description` | 否 | 项目说明。 |
| `format` | 否 | 项目目标格式，例如短剧、广告、短片。 |
| `default_language` | 否 | 默认语言。 |
| `active_production_id` | 否 | 当前主要 production。 |

### project_standards

路径：`project_standards/project_standards.json` 或 `project_standards.json`

含义：项目级创作标准。供 build、agent 和生成模型编译 prompt 时参考。

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `schema` | 是 | `movscript.project_standards.v1`。 |
| `kind` | 是 | 固定为 `project_standards`。 |
| `id` | 是 | standards id。 |
| `visual_style` | 否 | 视觉风格约束。 |
| `tone` | 否 | 叙事语气、情绪基调。 |
| `aspect_ratio` | 否 | 默认画幅，例如 `9:16`。 |
| `duration_policy` | 否 | 默认时长、节奏和片段长度策略。 |
| `generation_policy` | 否 | 生成模型、提示词、负面词、参考图使用策略。 |

### setting

路径：`settings/{setting_id}/setting.json`

含义：角色、地点、道具、世界观、风格等设定事实源。

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `schema` | 是 | `movscript.setting.v1`。 |
| `kind` | 是 | 固定为 `setting`。 |
| `id` | 是 | setting id。 |
| `setting_kind` | 是 | `character`、`location`、`prop`、`world`、`style` 等。 |
| `title` | 是 | 设定名。 |
| `profile` | 否 | 设定主体描述。 |
| `traits` | 否 | 稳定特征，例如外貌、空间结构、材质、性格。 |
| `default_state_id` | 否 | 默认 setting state。 |

### setting_state

路径：`settings/{setting_id}/states/{setting_state_id}/setting_state.json`

含义：某个 setting 在特定情境下的状态，例如角色湿发、地点雨夜、道具损坏。

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `schema` | 是 | `movscript.setting_state.v1`。 |
| `kind` | 是 | 固定为 `setting_state`。 |
| `id` | 是 | setting state id。 |
| `title` | 是 | 状态名。 |
| `state_of` | 是 | 所属 setting id。 |
| `state_profile` | 否 | 状态描述。 |
| `overrides` | 否 | 相对 setting 默认特征的覆盖。 |

### asset

路径：`settings/{setting_id}/assets/{asset_id}/asset.json` 或 `settings/{setting_id}/states/{setting_state_id}/assets/{asset_id}/asset.json`

含义：setting 或 setting state 的资产槽位。它不是二进制文件本身，而是对资源候选和锁定结果的管理。

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `schema` | 是 | `movscript.asset.v1`。 |
| `kind` | 是 | 固定为 `asset`。 |
| `id` | 是 | asset id。 |
| `slot` | 是 | 资产槽位，例如 `character_base_portrait`。 |
| `title` | 否 | 资产名称。 |
| `candidates` | 否 | 候选资源数组。 |
| `lock` | 否 | 当前选中的 candidate/resource。 |

`candidates[]` 字段：

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `id` | 是 | candidate id。 |
| `resource_id` | 是 | remote 或本地稳定 resource id。 |
| `source` | 否 | `generated`、`uploaded`、`imported` 等。 |
| `status` | 否 | `draft`、`accepted`、`rejected` 等。 |

### script

路径：`scripts/{script_id}/script.json`，剧本文本可另存为 `script.md`。

含义：剧本文本的根实体。

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `schema` | 是 | `movscript.script.v1`。 |
| `kind` | 是 | 固定为 `script`。 |
| `id` | 是 | script id。 |
| `title` | 是 | 剧本名。 |
| `source_ref` | 否 | 剧本文本文件路径，例如 `script.md`。 |
| `active_version_id` | 否 | 当前版本。 |

### script_version

路径：`scripts/{script_id}/versions/{script_version_id}/script_version.json`

含义：剧本版本。

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `schema` | 是 | `movscript.script_version.v1`。 |
| `kind` | 是 | 固定为 `script_version`。 |
| `id` | 是 | script version id。 |
| `version_label` | 否 | 版本名。 |
| `summary` | 否 | 本版本摘要。 |
| `source_text_ref` | 否 | 对应剧本文本。 |

### script_block

路径：`scripts/{script_id}/versions/{script_version_id}/blocks/{script_block_id}/script_block.json`

含义：剧本块。用于被 scene moment、storyboard 或 content unit 引用。

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `schema` | 是 | `movscript.script_block.v1`。 |
| `kind` | 是 | 固定为 `script_block`。 |
| `id` | 是 | script block id。 |
| `order` | 否 | 在 script version 内的顺序。 |
| `text` | 是 | 剧本文本片段。 |
| `block_kind` | 否 | 台词、动作、旁白、说明等。 |

### production

路径：`productions/{production_id}/production.json`

含义：某个可制作单元的制作根，例如一集、一个短片或一个版本。

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `schema` | 是 | `movscript.production.v1`。 |
| `kind` | 是 | 固定为 `production`。 |
| `id` | 是 | production id。 |
| `title` | 是 | production 标题。 |
| `script_refs` | 否 | 引用的 script/script version。 |

### segment

路径：`productions/{production_id}/segments/{segment_id}/segment.json`

含义：节奏段。production 内的节奏、情绪推进或戏剧功能阶段。

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `schema` | 是 | `movscript.segment.v1`。 |
| `kind` | 是 | 固定为 `segment`。 |
| `id` | 是 | segment id。 |
| `title` | 是 | 节奏段标题。 |
| `order` | 是 | production 内顺序。 |
| `segment_kind` | 否 | `setup`、`escalation`、`release` 等。 |
| `dramatic_function` | 否 | 戏剧功能说明。 |
| `rhythm` | 否 | 节奏说明。 |

### scene_moment

路径：`productions/{production_id}/segments/{segment_id}/scene_moments/{scene_moment_id}/scene_moment.json`

含义：场景时刻。AI 生成和导演理解的核心上下文。

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `schema` | 是 | `movscript.scene_moment.v1`。 |
| `kind` | 是 | 固定为 `scene_moment`。 |
| `id` | 是 | scene moment id。 |
| `title` | 是 | 场景时刻标题。 |
| `order` | 是 | segment 内顺序。 |
| `when` | 否 | 时间条件。 |
| `where` | 否 | 地点/空间说明。 |
| `action` | 否 | 发生了什么。 |
| `emotion` | 否 | 情绪状态。 |
| `storyboard_timing` | 否 | 排布 storyboard 的时间结构。 |

`storyboard_timing.items[]` 字段：

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `storyboard_id` | 是 | 被排布的 storyboard id。 |
| `order` | 是 | 在当前 scene moment 内的 storyboard 顺序。 |

`storyboard_timing` 的 scene moment 层字段：

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `audio` | 否 | 当前 scene moment 预览层面的声音、音乐、音效或音频提示。 |
| `transition` | 否 | 当前 scene moment 进入或离开相邻 scene moment / storyboard group 的转场方式。 |

### storyboard

路径：`productions/{production_id}/segments/{segment_id}/scene_moments/{scene_moment_id}/storyboards/{storyboard_id}/storyboard.json`

含义：分镜规划。负责镜头、景别、调度、灯光、人物摆位等规划。它不感知 content unit。

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `schema` | 是 | `movscript.storyboard.v1`。 |
| `kind` | 是 | 固定为 `storyboard`。 |
| `id` | 是 | storyboard id。 |
| `title` | 否 | 分镜规划标题。 |
| `setting_refs` | 否 | 引用 setting/setting state，说明本 storyboard 使用哪些设定。 |
| `shot_plans` | 否 | 分镜规划项数组。 |
| `coverage_plan` | 否 | 覆盖哪些动作、反应、环境、道具。 |
| `continuity` | 否 | 轴线、视线、空间和情绪连续性。 |

`shot_plans[]` 字段：

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `id` | 是 | storyboard 内的 plan id。 |
| `order` | 是 | storyboard 内的镜头调度顺序。 |
| `shot_size` | 否 | 景别。 |
| `camera` | 否 | 机位、焦段、运动、焦点等。 |
| `blocking` | 否 | 调度、构图、空间关系。 |
| `lighting` | 否 | 灯光规划。 |
| `performance` | 否 | 人物动作、表情、视线。 |
| `reference_image_refs` | 否 | 调度图或参考图。 |

### writing_expression

路径：`productions/{production_id}/segments/{segment_id}/scene_moments/{scene_moment_id}/storyboards/{storyboard_id}/writing_expressions/{writing_expression_id}/writing_expression.json`

含义：某个 storyboard 的文字表达方案，例如旁白、台词变体、字幕文案或情绪表达。

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `schema` | 是 | `movscript.writing_expression.v1`。 |
| `kind` | 是 | 固定为 `writing_expression`。 |
| `id` | 是 | writing expression id。 |
| `expression_kind` | 否 | `dialogue`、`voiceover`、`caption` 等。 |
| `text` | 是 | 文本内容。 |
| `target_ref` | 否 | 作用目标，例如 storyboard 或 shot plan。 |

### content_unit

路径：`content_units/{content_unit_id}/content_unit.json`

含义：项目级稳定生产单位。它保存可编辑提示词、source context、候选结果和当前选择。

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `schema` | 是 | `movscript.content_unit.v1`。 |
| `kind` | 是 | 固定为 `content_unit`。 |
| `id` | 是 | content unit id。 |
| `unit_kind` | 是 | `shot`、`voiceover`、`sound`、`subtitle` 等。 |
| `title` | 是 | 生产单位标题。 |
| `source_context` | 是 | 引用 scene moment 和 storyboard。 |
| `editable_prompt` | 否 | 用户/agent 可编辑的 source prompt。 |
| `generation_constraints` | 否 | 画幅、时长、模型约束等。 |
| `production_status` | 否 | `planned`、`in_progress`、`ready` 等。 |
| `candidates` | 否 | 生产出的候选结果。 |
| `lock` | 否 | 当前选中的候选结果。 |

`source_context` 字段：

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `scene_moment_ref` | 是 | content unit 服务的 scene moment。 |
| `storyboard_ref` | 是 | content unit 服务的 storyboard。 |

`editable_prompt` 字段：

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `prompt` | 否 | 用户/agent 可编辑的正向提示词。 |
| `negative_prompt` | 否 | 用户/agent 可编辑的负向提示词。 |
| `notes` | 否 | 对 prompt 的人工说明。 |

### keyframe

路径：`content_units/{content_unit_id}/keyframes/{keyframe_id}/keyframe.json` 或 scene moment 下的 `keyframes/{keyframe_id}/keyframe.json`

含义：视觉锚点。服务于 scene moment 或 content unit。

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `schema` | 是 | `movscript.keyframe.v1`。 |
| `kind` | 是 | 固定为 `keyframe`。 |
| `id` | 是 | keyframe id。 |
| `title` | 否 | 关键帧标题。 |
| `purpose` | 否 | 用途，例如 scene anchor、content unit guide。 |
| `visual_description` | 否 | 画面描述。 |
| `resource_ref` | 否 | 当前资源引用。 |
| `candidates` | 否 | 候选画面资源。 |
| `lock` | 否 | 当前确认使用的 candidate/resource。 |

## Source Schema 与 Runtime Model

文件 schema 决定 source 如何稳定存储；runtime model 决定系统如何在内存里理解、索引、校验和服务 UI/API。二者不应该混成同一个类型。

建议分三层：

```text
SourceEntity
  从 JSON/Markdown 文件直接读取的实体，字段接近文件 schema。

DomainGraph
  build 解析后的内存领域图，包含路径、父子关系、反向引用、索引、校验错误和派生关系。

EditorReadModel
  给影视编辑器、agent、review panel 使用的读模型，例如 production tree、storyboard timing、content unit status。
```

### SourceEntity

SourceEntity 是事实源。它应该尽量稳定、可审计、可 diff，并且和文件路径保持一致。

例如：

```ts
type ContentUnitSource = {
  schema: 'movscript.content_unit.v1'
  kind: 'content_unit'
  id: string
  unit_kind: 'shot' | 'voiceover' | 'sound' 
  title: string
  source_context: {
    scene_moment_ref: string
    storyboard_ref: string
  }
  editable_prompt?: {
    prompt?: string
    negative_prompt?: string
    notes?: string
  }
  generation_constraints?: Record<string, unknown>
  production_status?: 'planned' | 'in_progress' | 'ready' | string
  candidates?: CandidateSource[]
  lock?: CandidateLockSource
}
```

### DomainGraph

DomainGraph 是 build 之后的内存结构。它不只保存 source 字段，还保存解析结果。

例如 content unit 在内存里可以被解析成：

```ts
type ContentUnitNode = {
  kind: 'content_unit'
  id: string
  sourcePath: string
  source: ContentUnitSource
  sourceContext: {
    sceneMomentId: string
    sceneMomentPath: string
    storyboardId: string
    storyboardPath: string
    productionId: string
    segmentId: string
  }
  selectedCandidate?: CandidateSource
  candidateCount: number
  stale: boolean
  validation: {
    errors: string[]
    warnings: string[]
  }
}
```

这里的 `productionId` 和 `segmentId` 不来自 `content_unit.json`，而是 build 通过 `scene_moment_ref` 路径反推。

### EditorReadModel

EditorReadModel 是面向 UI 和 agent 的读取视图，不要求和 source 文件一一对应。

可以包括：

- production tree：production、segment、scene moment、storyboard 的规划树。
- storyboard timing view：某个 scene moment 的 storyboard 排布。
- content production view：某个 content unit 的 prompt、候选、锁定结果、生成状态。
- asset index view：所有 setting/setting_state 下的 asset 汇总。
- stale view：哪些 content unit/keyframe 可能因为 storyboard 或 setting 变化而过期。

这能避免 UI 或 agent 直接遍历文件系统来理解项目。

## Workspace Write Policy

当前先不拆 `*.edit.json` / `*.api.json`，也不把 source 文件强制分成 agent 可写和 API-only 两类。所有 source JSON 仍然作为统一事实源存在，agent 可以直接修改 source 文件。

这里的关键不是“禁止 agent 修改”，而是让 agent 修改后必须能被 review/build 解释、校验和纠错：

```text
agent edits source files
  -> review changed files
  -> build validates schema/topology/references
  -> impact report explains editor meaning
  -> user/API can repair or accept
```

### Agent Direct Edit

agent 可以直接编辑 source 文件，包括创作规划字段和生产状态字段。

| 范围 | 说明 |
| --- | --- |
| `project.json` | 项目元数据。 |
| `project_standards.json` | 项目创作标准。 |
| `setting.json` / `setting_state.json` | 设定事实和状态描述。 |
| `script.md` / `script_version.json` / `script_block.json` | 剧本内容和结构。 |
| `production.json` / `segment.json` / `scene_moment.json` | production 规划结构、节奏、场景时刻和 `storyboard_timing`。 |
| `storyboard.json` | 分镜规划、镜头调度、景别、灯光、人物摆位。 |
| `content_unit.json` | 可编辑 prompt、source context、候选、lock、生产状态。 |
| `asset.json` / `keyframe.json` | 候选、lock、资源引用。 |

### Recommended API Workflow

虽然 agent 可以直接改文件，但内容生产、候选写入和选择结果仍建议通过领域 API 完成，因为这些操作模式固定、容易封装校验，也能减少低级错误。

建议的领域 API：

```ts
updateContentUnitEditablePrompt(contentUnitId, editablePrompt)
startContentProduction(contentUnitId)
appendContentUnitCandidate(contentUnitId, candidate)
selectContentUnitCandidate(contentUnitId, candidateId)
unlockContentUnitCandidate(contentUnitId)

appendAssetCandidate(assetId, candidate)
selectAssetCandidate(assetId, candidateId)

appendKeyframeCandidate(keyframeId, candidate)
selectKeyframeCandidate(keyframeId, candidateId)
```

这些 API 是推荐工作流，不是文件权限边界。agent 直接改 JSON 后，review/build 仍必须能发现 schema 错误、引用错误、候选/lock 不一致和 stale 状态。

### Readonly Build Artifacts

以下内容只由 build 或 export 流程写入：

```text
.build/current/*
.build/indexes/*
.build/manifests/*
.build/reviews/*
preview_timeline.json
editor-state.json
domain-index.json
asset-index.json
relation-graph.json
impact-report.json
```

agent 和 UI 只能读取这些产物，不能把它们当 source 修改。

## Content Production Domain Service

内容生产不是普通文件编辑。它涉及 prompt 构造、上下文解析、外部生成 API、候选写入、结果选择和 stale 判断，因此应该做成领域服务。

建议服务名：

```ts
ContentProductionService
```

核心职责：

| 方法 | 含义 |
| --- | --- |
| `prepareContext(contentUnitId)` | 解析 content unit 的 source context，加载 scene moment、storyboard、setting、asset、keyframe。 |
| `compilePrompt(contentUnitId)` | 根据可编辑 prompt、storyboard、setting、keyframe 和模型配置生成最终模型 prompt。 |
| `startGeneration(contentUnitId)` | 调用外部生成 API，创建生成任务。 |
| `attachCandidate(contentUnitId, result)` | 把生成结果写入 `content_unit.candidates`。 |
| `selectCandidate(contentUnitId, candidateId)` | 更新 `content_unit.lock`，选择当前结果。 |
| `markStaleByPlanningChange(entityRef)` | storyboard、scene moment、setting 变化后，标记受影响 content units。 |

### Prompt 分层

prompt 应分三层：

```text
editable_prompt
  用户/agent 在 content_unit.json 里维护的 source prompt。

production_context
  服务从 scene moment、storyboard、setting、setting assets、keyframe 解析出的上下文。

compiled_generation_prompt
  面向具体生成模型的最终 prompt，由服务生成，不直接写进 source。
```

示例：

```text
editable_prompt.prompt
  女主盯着震动的手机，手机冷光照亮脸部，表情惊恐但克制。

production_context
  scene moment: 女主在出租屋听到陌生来电
  storyboard: close up, slow push in, phone foreground
  setting asset: 女主基础形象、雨夜湿发状态
  keyframe: 手机蓝光照亮女主惊恐表情

compiled_generation_prompt
  model-specific prompt + negative prompt + reference bundle + generation params
```

### 生产结果写入

生成结果不应该直接覆盖 source prompt，也不应该直接改 storyboard。

正确写入路径是：

```text
content_units/{contentUnitId}/content_unit.json
  candidates[]
  lock

content_units/{contentUnitId}/keyframes/{keyframeId}/keyframe.json
  candidates[]
  lock
```

这样 production 结果和 planning source 分离，review/build 也能解释：

- 哪个 source context 被用于生产。
- 哪个 editable prompt 被用于生产。
- 生成出了哪些候选。
- 当前选择了哪个候选。
- storyboard 或 setting 改动后哪些结果可能 stale。

## Build 与 Review 语义

当前最大的问题不是“agent 能不能改文件”，而是：

```text
agent 改完文件以后，影视编辑器如何知道这些变化意味着什么？
```

因此 build 不应只是 schema 校验成功。更合理的 build 语义是：

```text
source files
  -> parse
  -> validate schema
  -> resolve workspace hierarchy
  -> resolve entity graph
  -> validate topology
  -> derive editor state
  -> derive preview timeline state
  -> write build artifacts
```

build 只做解释、校验、报告和编译，不修改 source。任何自动补齐、重排、修复都应作为显式 `repair` / `apply suggestion` 操作，由用户或 agent 明确触发。

build 成功表示：

- 文件能被解析。
- 每个文件符合对应 `SemanticEntityKind` 的 schema。
- 路径层级和 JSON 内关系一致。
- Production 结构满足拓扑约束。
- 引用能解析到有效实体，或被明确标记为外部/运行态引用。
- 影视编辑器可以从 build 产物恢复当前有效项目状态。

build 成功不表示：

- 视频已经生成完成。
- 外部资源一定存在于本地缓存。
- generation job 已经成功。
- 所有艺术判断已经被人确认。

## Build 产物建议

建议 build 产物至少包含：

```text
.build/current/domain-tree.json
.build/current/editor-state.json
.build/current/productions/production_p8f3/preview_timeline.json
.build/indexes/domain-index.json
.build/indexes/asset-index.json
.build/indexes/relation-graph.json
.build/manifests/build_{buildId}.json
.build/reviews/impact-report_{buildId}.json
```

其中：

- `domain-tree.json` 表示项目、production、segment、scene moment、storyboard、content unit、keyframe 的有效层级树。
- `editor-state.json` 表示影视编辑器需要直接消费的当前状态，例如 production tree、timeline、setting assets、stale markers。
- `asset-index.json` 表示 project-level setting asset 索引，汇总所有 setting 和 setting state 下的 assets。
- `preview_timeline.json` 表示某个 production 的只读预览时间线 index，由 build 从 source 文件编译生成。
- `domain-index.json` 表示按 entity kind 索引的所有实体。
- `relation-graph.json` 表示实体之间的 owns、contains、references、uses、derives、represents 关系。
- `build manifest` 记录输入文件 hash、schema 版本、validator 版本、build 时间、警告、错误。
- `impact report` 解释这次变更对影视编辑器的意义。

## Impact Report 示例

如果 agent 修改了一个 `content_unit.json` 的候选或锁定结果，review/build 不应该只说文件变了，而应该输出类似：

```json
{
  "changedEntities": [
    {
      "entityKind": "content_unit",
      "id": "content_unit_k41m",
      "path": "content_units/content_unit_k41m/content_unit.json",
      "belongsTo": {
        "production": "production_p8f3",
        "segment": "segment_a19d",
        "scene_moment": "scene_moment_r72k",
        "storyboard": "storyboard_main"
      },
      "fieldChanges": [
        { "field": "lock.candidate_id", "before": "candidate_a", "after": "candidate_b" }
      ],
      "editorImpacts": [
        "preview timeline item for content_unit_k41m should refresh its selected resource",
        "content_unit_k41m now selects candidate_b for storyboard_main",
        "settings/setting_sd8345/assets/asset_dftt345 remains satisfied"
      ]
    }
  ]
}
```

这才是“agent 修改文件后，影视编辑器知道发生了什么”的关键。

## 关键拓扑约束

build validator 至少应检查：

- `project_workspace` 是唯一根。
- `production_workspace` 必须属于 project。
- `segment_workspace` 必须属于 production。
- `scene_moment_workspace` 必须属于 segment。
- `storyboard_workspace` 必须属于 scene moment。
- `content_unit_workspace` 必须属于 project，不能属于 production、segment、scene moment 或 storyboard。
- content unit 必须通过 `source_context` 指向它服务的 scene moment 和 storyboard。这里的生产上下文就是 reference scene moment / storyboard，不是 content unit 的父级归属。
- `keyframe_workspace` 可以属于 content unit 或 scene moment；同一种 workspace kind 在不同父级下表示相同数据类型的不同上下文实例，不表示同一事务。
- `keyframe` 必须属于 content unit 或 scene moment。
- scene-level keyframe、content-unit-level keyframe 使用完全相同 schema。
- `keyframe` 可以包含 `candidates` 和 `lock` 字段。
- `preview_timeline` 必须由 build 生成，不能作为 source 文件出现。
- preview timeline 内部 item 是 build artifact 的结构项，不是 `SemanticEntityKind`，也不是 workspace。
- preview timeline item 可以代表 segment、scene moment、storyboard 或 content unit。
- preview timeline item 可以使用 keyframe、setting asset 或稳定 resource。
- `asset` 必须属于 setting 或 setting state。
- `asset_workspace` 必须属于 setting workspace 或 setting state workspace，不能直接挂在 project 或 production 下。
- 一个 asset source 文件只能属于一个 setting 或 setting state；多个 asset 可以复用同一个 remote `resource_id`。
- `asset.candidates` 只能作为 `asset.json` 内部数组存在，不再拆成独立 candidate 文件。
- build 必须生成 project-level asset index，汇总所有 setting/setting_state 下的 assets。
- `content_unit.candidates` 只能作为 `content_unit.json` 内部数组存在；`content_unit.lock` 表示当前选中的生产结果。
- `keyframe.candidates` 只能作为 `keyframe.json` 内部数组存在，不再拆成独立 candidate 文件。
- runtime 状态不能进入业务文件，只能通过稳定 id 引用。

## 当前已收敛与仍需讨论的点

当前已经收敛的部分：去掉 `edit/`；preview timeline 只编译不编辑；Segment 中文使用“节奏段”；SceneMoment 中文使用“场景时刻”；script workspace 和 production workspace 并列；目录名使用稳定 id，排序写入 JSON；core 使用 snake_case，前端保留 collection key 适配层；build 只报告和编译，不修改 source；领域本体先放在 `packages/core/src/workspace/domain/`。

此外，本轮又收敛了以下规则：

- `storyboard_timing` 放入 `scene_moment.json` 字段，不再作为独立文件或独立 `SemanticEntityKind`。
- `setting_state_workspace`、`script_version_workspace`、`script_block_workspace` 都应该存在。只要出现文件层级结构，就应该有 workspace 负责读取位置。
- storyboard 进入 production 主链路，位于 `scene_moment_workspace` 下；content unit 是 project-level 稳定生产单位，只能由 content unit 通过 `source_context` 反向引用 storyboard。
- asset candidate 只是 `asset.json` 内部数组，不再单独拆文件。
- build 生成 project-level asset index，汇总所有 setting/setting_state 下的 assets。
- scene-level keyframe、content-unit-level keyframe 使用完全相同 schema。
- keyframe 需要 `candidates` 和 `lock` 字段，类似 asset。



## 建议的下一步

1. 在 core 中新增 canonical `SemanticEntityKind` 或 `MovScriptDomainEntityType`，使用 snake_case 单数实体名。
2. 把当前前端 plural camelCase 类型改名为 `SemanticEntityCollectionKey`，保留映射层。
3. 把 `WorkspaceKind` 扩展为层级 workspace kind，加入 parent/child/path pattern。
4. 把 `WorkspaceModel` 改成递归结构：本层 `WorkspaceKind` + 子层 `WorkspaceModel[]`；`SemanticEntityKind` 由 `WorkspaceKind` 固定映射派生。
5. 为 production 拓扑增加 build validator。
6. 为 build 增加 impact report，至少覆盖 content unit、keyframe、preview timeline 的变化解释。
