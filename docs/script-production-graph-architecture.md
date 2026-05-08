# Creative Source and Production Graph Architecture

本文记录 MovScript 的创作来源结构化与制作编排边界。它不是一次性实现清单，而是后续扩展 agent、后端语义实体、前端编排工作区和画布生产能力时的共同词汇。

## Core Positioning

MovScript 不是单纯的剧本编辑器，也不是单纯的 prompt 工具。MovScript 的核心是把剧本、brief、参考图、素材、已有片段或 prompt 种子等创作来源，转化为可执行的影像生产图谱。

```text
Creative Source Graph
  描述创作从哪里来，包括剧本、brief、大纲、参考图、产品资料、采访、已有素材和 prompt 种子。

Story Intent Graph
  描述作品想表达什么，包括叙事结构、信息传递、情绪变化、受众和连续性约束。

Production Graph
  描述故事如何被拍摄、生成和交付

Asset Graph
  描述用什么角色、场景、道具、风格和媒体资产生成

Continuity Graph
  描述前后状态、知识、道具、服装、关系和画面一致性约束
```

## Layer Boundary

创作来源层、故事意图层和编排层必须分开建模。剧本是强输入，但不是唯一入口。

```text
Creative Source Layer
  -> Creative Source Graph
  -> Brief
  -> Script
  -> Outline
  -> Treatment
  -> Reference Board
  -> Product Spec
  -> Interview / Transcript
  -> Existing Footage
  -> Prompt Seed

Story Intent Layer
  -> Story Intent Graph
  -> Character Bible
  -> World Bible
  -> Story Arc
  -> Continuity Graph

Orchestration Layer
  -> Production Graph
  -> Shot Plan
  -> Asset Binding
  -> Generation Task
  -> Edit Assembly
```

创作来源层负责回答“原始输入是什么”。故事意图层负责理解“作品要表达什么”。编排层负责决定“它怎么被拍或生成出来”。编排层可以补充导演判断，但不应该重新成为剧本文本数据库或 brief 数据库。

## Creative Source Layer

创作来源层从多种输入中提取稳定的创作事实。完整剧本只是其中一种来源。

```text
Project
  -> Creative Source
    -> Source Version
      -> Segment
        -> Scene Moment
          -> Beat
            -> Action
            -> Dialogue
            -> Intent
```

可支持的入口包括：

- `script`：完整剧本、分场剧本、对白稿。
- `brief`：品牌 brief、创意简报、广告需求。
- `outline`：故事大纲、事件线、提纲。
- `treatment`：导演阐述、视觉阐述、制作阐述。
- `shot_list`：已有镜头清单或拍摄计划。
- `reference_board`：情绪板、风格图、角色参考、场景参考。
- `product_spec`：产品资料、功能卖点、使用场景。
- `interview_transcript`：采访文本、纪录片素材转写。
- `footage`：已有视频、素材包、粗剪片段。
- `prompt_seed`：一个概念 prompt、风格 prompt 或实验方向。

现有实体中：

- `script` / `script_version` 是原始文本与版本来源。
- `segment` 是第一层结构切分，保留文本来源、顺序、摘要和确认状态。
- `scene_moment` 是 AI 生成最需要的情境单元，描述时间、地点、人物、动作、情绪和条件。
- `creative_reference` 是项目级设定本体，包括人物、地点、道具、品牌、风格和规则。
- `creative_reference_state` 是某个范围内的局部状态，例如服装、情绪、伤痕、持有道具。
- `creative_relationship` 和 `creative_reference_usage` 连接人物关系、设定资料引用和连续性。

创作来源层和故事意图层的输出不是镜头表，而是结构化创作事实：

- 结构化来源
- 人物和关系知识
- 场景、地点、道具和世界规则
- 叙事节拍
- 情绪变化
- 观众获得的信息
- 连续性约束

## Production Layer

编排层把 Story Intent Graph 转化为可执行的生产对象。

```text
Production Plan
  -> Sequence
    -> Scene Plan
      -> Shot
        -> Prompt
        -> Asset Binding
        -> Generation Task
        -> Review Decision
```

现有实体中：

- `storyboard_script` / `storyboard_version` / `storyboard_line` 表达分镜脚本和版本。
- `content_unit` 是镜头、画面、语音、字幕等生产目标。
- `asset_slot` 是生产缺口，不是文件本身。
- `asset_slot_candidate` 是某个素材槽下的候选资源。
- `keyframe`、`preview_timeline` 和 `preview_timeline_item` 连接预演与时间线。
- `raw_resource` 和 `resource_binding` 承载真实文件与业务对象的绑定。

编排层对象必须引用创作来源和故事意图对象，而不是复制一份故事事实。

```text
Shot / ContentUnit
  -> references CreativeSource
  -> references Segment when available
  -> references SceneMoment when available
  -> references Beat when available
  -> references CreativeReference
  -> references AssetSlot
  -> references ContinuityConstraint
```

这样每个生产对象都能回答：

- 来自哪类创作来源？
- 服务哪个情节、节拍、卖点、视觉目标或传播目标？
- 传达什么剧情信息？
- 使用哪些角色、场景、道具和风格？
- 有哪些连续性约束？

## Intent Model

`intent` 是创作来源层、故事意图层和编排层之间最重要的连接。

```text
Source Intent
  这个来源要求什么，限制什么，哪些事实不能被改写。

Story Intent
  这一段内容想表达什么，人物关系如何变化，观众应该知道什么；没有剧情时，则表达卖点、情绪、概念或传播目标。

Directing Intent
  这个镜头为什么这样拍，景别、运动、构图服务什么情绪或信息。

Generation Intent
  生成任务应该优先保留什么画面、表演、节奏、风格和连续性。
```

示例：

```json
{
  "story_intent": "林夏发现周野撒谎，信任关系破裂。",
  "directing_intent": "用手机特写和林夏反应镜头，把信息揭示变成情绪转折。",
  "generation_intent": "便利店雨夜，低饱和，慢推镜头，表情克制但紧张。"
}
```

AI 输出不应该只从“文本描述”生成画面，而应该按 intent 生成能服务剧情功能的画面。

## Product Workspaces

推荐的产品模块边界：

```text
Creative Source Import
  导入剧本、brief、大纲、参考图、产品资料、采访、已有素材或 prompt 种子，识别格式并保留版本来源。

Story Intelligence
  提取片段、情节、卖点、人物、地点、道具、关系、节拍、受众、格式约束和连续性。

Story Workspace
  用户校正结构化来源、故事意图、人物设定、世界规则和连续性。

Orchestration Workspace
  生成和编辑编排段、情景、设定引用、连续性约束和素材诉求。它负责回答“发生什么、为什么必须发生、需要什么素材准备”，不负责定稿内容单元、运镜表、关键帧或 prompt。

Production Workspace
  基于已确认的情景生成和编辑内容单元、镜头顺序、台词定稿、场面调度、关键帧、prompt 和生成顺序。

Asset Workspace
  管理角色图、场景图、道具图、风格参考、素材槽和候选资源。编排阶段只提出素材诉求和优先级；具体候选、锁定资源和真实文件绑定在资源/制作流程中完成。

Generation Queue
  把内容单元和素材槽转成具体 AI 生成任务。

Edit Assembly
  把生成结果组织成粗剪、字幕、音频、预演时间线和交付版本。
```

## Feedback Loop

系统不应该是单向链路。

```text
Creative Source Graph
  <-> Story Intent Graph
  <-> Production Graph
  <-> Asset Graph
  <-> Generation Results
  <-> Edit Feedback
```

例如某个视频片段生成失败，系统应该能反向定位：

- 失败的是哪个 `content_unit` 或 `generation_task`。
- 它来自哪个创作来源，以及哪个 `scene_moment`、`segment`、卖点或视觉目标。
- 原始 story intent 是什么。
- 哪些角色、场景、道具和状态必须保持。
- 可以替换导演方案，但不能破坏来源事实、剧情信息、产品卖点或传播目标。

## Implementation Principles

- 创作来源层和故事意图层保留故事事实、来源事实和创作约束，编排层引用这些事实。
- `script` 不是必填入口；系统必须支持 `brief-first`、`asset-first`、`reference-first`、`footage-first` 和 `prompt-first`。
- `creative_reference` 保持项目级复用，避免跨制作重复创建同一角色、地点或道具。
- 已确认实体默认不可被 agent 覆盖；agent 只能补充或提出需要确认的更新。
- 草稿实体可以被同 scope 的新草稿 supersede。
- 生产写回应集中在资源、素材候选、绑定和审核决策，不直接改写上游故事事实。
- 后续 schema、API 和 UI 命名优先沿用 `segment`、`scene_moment`、`content_unit`、`asset_slot`、`creative_reference`。
