# 内容编排工作台实体与调度图设计

本文档整理 AI 视频内容编排工作台的实体边界、调度图数据来源和 UI 编辑方式。目标是让“情节”“内容单元”“Shot 调度”“设定/素材引用”各自落到清晰字段上。

## 核心边界

- `scene_moment` 负责叙事空间和情节上下文。
- `content_unit` 负责可独立生成、编辑、审核、挂载到时间线的制作颗粒。
- `content_unit(kind=shot)` 内部再有相机、角色调度、光线、动作、构图、关键帧等视觉规格。
- `creative_reference` 和 `asset_slot` 是引用/输入维度，可以挂到 `scene_moment` 或 `content_unit`，但不替代它们。

## 推荐层级

```text
segment
  -> scene_moment
       -> content_unit[]
            -> if kind=shot:
                 camera / blocking / lighting / motion / composition / keyframes / generation
```

## 实体职责

### `segment`

叙事功能段或情绪/结构段。

适合承载：

- 本段戏剧功能
- 情绪推进
- 上下游情节集合
- 结构性备注

不适合承载：

- 单个镜头的相机路线
- 单个镜头的灯光/角色路径
- 音频、字幕等制作轨道

### `scene_moment`

AI 视频工作台里，`scene_moment` 可以直接作为“情节/可生成视频片段”的入口。它是具体时空中的叙事单元。

适合承载：

- `title`
- `time_text`
- `location_text`
- `condition_text`
- `action_text`
- `mood`
- 关联人物、地点、道具、风格等设定引用
- 情节底图 `layout_json`

`layout_json` 只描述基础空间和设定引用，不描述某个 Shot 的执行调度。在 Shot 编辑器中，它应作为只读底图；如果要改地点、人物、道具的基础设定，应回到设定或情节底图编辑。

示例：

```json
{
  "space": {
    "label": "老城区窄巷",
    "width": 100,
    "height": 100
  },
  "zones": [
    { "id": "door_light", "label": "门口亮区", "x": 58, "y": 44, "w": 18, "h": 10 },
    { "id": "dark_entry", "label": "暗处入口", "x": 18, "y": 20, "w": 26, "h": 8 }
  ],
  "characters": [
    { "reference_id": 501, "label": "林夏", "x": 64, "y": 58 },
    { "reference_id": 502, "label": "陈远", "x": 42, "y": 30 }
  ],
  "props": [
    { "reference_id": 601, "label": "旧伞", "x": 66, "y": 70 }
  ]
}
```

### `content_unit`

`content_unit` 是制作时间线上的独立内容单元，不等同于 Shot。

合理的 `kind` 包括：

- `shot`：视觉镜头
- `voiceover`：旁白/配音
- `dialogue_audio`：对白音频
- `sound`：音效
- `music_beat`：音乐节拍
- `subtitle`：字幕
- `caption_card`：字幕卡/标题卡
- `transition`：转场

因此，配音拆成单独 `content_unit` 是合理的。它是独立生成、编辑、审核和时间线对齐的轨道单元。

`content_unit` 适合承载：

- `title`
- `kind`
- `description`
- `prompt`
- `duration_sec`
- `status`
- `order`
- `scene_moment_id`
- `segment_id`
- `production_id`
- 该单元自己的素材需求、关键帧、生成任务

### Shot 内部规格层

只有 `content_unit.kind === "shot"` 时，才需要 Shot 内部规格层。

这些层不是和配音、字幕并列的 `content_unit`，而是 Shot 的内部结构。

建议使用 `content_unit.visual_plan_json` 或 `content_unit.blocking_json` 承载。若已有 `blocking_json` 约定，可以先沿用，并逐步泛化为更完整的视觉计划。

示例：

```json
{
  "camera": {
    "start": { "x": 49, "y": 78 },
    "end": { "x": 66, "y": 72 },
    "target": { "x": 66, "y": 72 },
    "motion": "dolly_in",
    "shot_size": "close_up",
    "angle": "low_angle"
  },
  "blocking": {
    "character_paths": [
      {
        "reference_id": 501,
        "points": [{ "x": 64, "y": 58 }, { "x": 66, "y": 72 }],
        "cue": "林夏慢半拍低头，看向纸条"
      }
    ]
  },
  "lighting": [
    {
      "kind": "practical_light",
      "x": 58,
      "y": 44,
      "direction": 130,
      "spread": 38,
      "note": "门口光只擦到伞面，不照亮陈远"
    }
  ],
  "motion": {
    "character_action": "停步、低头、压住反应",
    "object_action": "纸条从伞骨滑落"
  },
  "composition": {
    "subject": "湿纸条",
    "foreground": "伞骨边缘",
    "background": "模糊人影",
    "avoid": ["陈远脸部过早清晰"]
  }
}
```

## 场面调度图

场面调度图不应是一张独立图，而是由三类数据叠加出来：

### 1. 情节底图层

来源：`scene_moment.layout_json`

用途：提供当前情节的空间、区域、人物初始位置、道具位置。

典型对象：

- `space`：地点底图，如“老城区窄巷”
- `zones`：门口亮区、暗处入口、禁入区域
- `characters`：林夏、陈远等人物设定引用和初始站位
- `props`：旧伞、纸条、门、桌椅等道具引用和初始位置

在 Shot 编辑时，这一层默认只读。用户可以选中查看来源，但不应在这里直接改人物设定或场景设定。

### 2. Shot 覆盖层

来源：当前选中的 `content_unit(kind=shot)`。

用途：描述这个镜头里发生的调度，而不是改写整个情节底图。

典型对象和推荐写入字段：

- 相机路径：`visual_plan_json.camera`
- 人物路径：`visual_plan_json.blocking.character_paths`
- 光线范围：`visual_plan_json.lighting`
- 物体动作：`visual_plan_json.motion.object_paths`
- 构图安全区/禁入区：`visual_plan_json.composition`
- 首尾关键帧：`visual_plan_json.keyframes`

示例：

```json
{
  "camera": {
    "path": [{ "x": 49, "y": 78 }, { "x": 58, "y": 74 }, { "x": 66, "y": 72 }],
    "target_ref": "prop:wet_note",
    "motion": "dolly_in",
    "angle": "low_angle",
    "shot_size": "close_up"
  },
  "blocking": {
    "character_paths": [
      {
        "character_ref": "person:lin_xia",
        "path": [{ "x": 64, "y": 58 }, { "x": 66, "y": 72 }],
        "cue": "慢半拍低头，看向纸条"
      }
    ]
  },
  "lighting": [
    {
      "id": "door_warm_light",
      "anchor": { "x": 58, "y": 44 },
      "area": [{ "x": 57, "y": 44 }, { "x": 76, "y": 48 }, { "x": 72, "y": 76 }, { "x": 50, "y": 70 }],
      "constraint": "只擦到伞面和纸条，不照亮陈远脸部"
    }
  ],
  "motion": {
    "object_paths": [
      {
        "prop_ref": "prop:wet_note",
        "path": [{ "x": 64, "y": 66 }, { "x": 66, "y": 72 }],
        "cue": "纸条从伞骨滑落到亮区边缘"
      }
    ]
  }
}
```

### 3. 批注层

来源：批注/审核记录。

用途：对当前 Shot 或某个底图对象提出修改意见。批注可以引用底图对象，但不直接改写底图或 Shot 覆盖层。

## 调度图编辑方式

调度图应提供明确的编辑模式：

- 选择：选中底图对象或 Shot 覆盖对象。
- 相机：绘制或拖动相机路径、目标点、镜头方向。
- 路径：给人物或道具添加运动路径。
- 灯光：绘制光源锚点、方向和影响范围。
- 动作点：标记关键动作发生的位置和时间。
- 禁入区/构图区：标记不能出现主体、不能照亮、不能越过的画面约束。

点击底图层对象时，右侧展示来源信息和“去设定中编辑”。点击 Shot 覆盖层对象时，右侧进入对象编辑器，字段直接写回当前 `content_unit.visual_plan_json`。

## 设定和素材引用

`creative_reference` 和 `asset_slot` 不应变成叙事层级。

它们是横向引用：

- 人物、地点、道具、风格可以被 `scene_moment` 引用，用于构成情节底图。
- 参考图、首帧、道具图、角色图可以被 `content_unit` 引用，用于某个具体制作单元。
- 同一个人物设定可以同时被多个 `scene_moment` 和 `content_unit` 使用。

## UI 映射

### 左侧：情节队列

对应 `scene_moment[]`。

展示：

- 标题
- 时空信息
- 关联人物/道具
- 下属内容单元数量
- 当前是否有阻塞或待确认

### 中间：内容编排区

分三层展示：

1. 情节底图：来自 `scene_moment.layout_json`
2. 内容单元轨道：来自 `scene_moment.content_units`
3. 当前 Shot 覆盖层：仅当选中 `content_unit(kind=shot)` 时显示

内容单元轨道要能同时显示视觉、音频、字幕、转场等并列单元，而不是只显示 Shot。

调度图中应区分底图层和 Shot 覆盖层：底图层用于引用人物/场景/道具，覆盖层用于编辑当前 Shot 的相机、路径、光线、动作点和构图约束。

### 右侧：选中内容单元编辑

右侧应围绕当前选中的 `content_unit`。

推荐分区：

- 基础：编辑 `content_unit` 原有字段
- 调度对象编辑：仅 `kind=shot` 可用，选中相机、人物路径、光线、动作点后编辑对应字段
- 生成准备：关键帧、素材需求、设定引用、生成上下文预检

## 结论

推荐保留“配音作为独立内容单元”的设计。

原因是配音、字幕、音效、音乐和视觉 Shot 都是制作时间线上的并列输出单元。相机、光线、动作、构图则不是并列输出单元，而是 Shot 内部的规格层。

因此最稳定的结构是：

```text
scene_moment 是情节空间
content_unit 是制作轨道单元
shot 内部层是视觉调度规格
reference / asset 是横向输入
```
