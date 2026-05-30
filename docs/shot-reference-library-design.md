# Shot Reference Library Design

## 目标

镜头库不是一个普通素材库，也不是单纯的电影片段收藏夹。它的核心目标是帮助用户和 Agent 把“想要的感觉”快速转化为“可观看、可理解、可应用的镜头方案”。

系统应同时满足三类需求：

1. 用户能直观看到参考镜头，快速判断“是不是我要的感觉”。
2. 用户能理解参考镜头为什么有效，并把它迁移到自己的场景。
3. Agent 能用结构化语义检索、解释、推荐、改写和保持项目视觉一致性。

因此，一条镜头参考不应该只是 `Intent / Pattern / ShotFunction / VisualPreference` 的标签集合，而应该是：

```text
ShotReference = 可观看示例 + 语义标注 + 镜头拆解 + 可复用原则 + 应用入口
```

## 用户体验原则

前台体验应以感知和决策为中心，后台再承载结构化语义。

用户不应该一开始面对复杂表单：

```text
Intent:
Pattern:
ShotFunction:
VisualPreference:
SceneContext:
ExecutionDetails:
```

更合适的体验是：

```text
自然语言表达意图 -> 浏览视频参考 -> 理解镜头拆解 -> 应用到当前场景 -> 沉淀个人风格
```

核心交互不只是“搜索”，而是“转化”：

```text
表达意图 -> 获取参考 -> 理解方法 -> 应用到场景 -> 沉淀个人/项目视觉语言
```

每条镜头参考至少应支持这些动作：

- 看类似参考
- 查看为什么有效
- 应用到当前场景
- 生成我的版本
- 收藏为个人偏好
- 加入项目视觉语言

## 典型使用场景

### 从感觉找参考

用户输入：

```text
我想要一种角色发现真相前，气氛慢慢变紧的镜头。
```

系统返回若干可视化方案：

- 慢推近 + 面部压迫
- 前景遮挡 + 延迟揭示
- 空镜细节 + 反应镜头
- 主观视角靠近线索

每个结果展示：

- 视频缩略图或短预览
- 关键帧
- 一句话说明
- 情绪和功能标签
- 适用/不适用场景
- 应用到当前场景的入口

### 从剧本场景出发

用户选中一场戏：

```text
女主在空办公室里发现桌上的旧照片。
```

Agent 推荐不同镜头方向：

```text
方向 A：悬疑
Intent: create_suspicion
Pattern: foreground_obstruction_reveal
ShotFunction: delayed_reveal

方向 B：孤独
Intent: isolate_character
Pattern: negative_space_pressure
ShotFunction: emotional_pause

方向 C：记忆感
Intent: evoke_memory
Pattern: insert_detail_then_reaction
ShotFunction: realization
```

用户看到的应是视频/关键帧卡片，而不是字段表。用户选择一个方向后，系统生成适配当前剧本的镜头方案。

### 上传参考视频

用户上传电影片段、广告片、短视频或自己的素材后，系统应尝试：

1. 切分镜头片段。
2. 抽取关键帧。
3. 生成自然语言描述。
4. 生成结构化标注。
5. 询问用户喜欢的具体点。

示例确认问题：

```text
你喜欢它的哪一点？
- 构图
- 光线
- 情绪
- 运动
- 角色关系
```

同一个镜头形式可能服务于不同偏好，用户反馈必须被保留。例如用户可能喜欢“压迫感”，而不是系统初判的“悬疑感”。

### 项目视觉一致性

当用户在一个项目中使用镜头参考时，Agent 需要能判断冲突：

```text
当前项目视觉偏好是静态、冷感、观察式。
这个快速手持推进参考虽然能增强紧张感，但会破坏前面建立的克制风格。

更一致的替代方案：
使用锁定机位 + 角色主动靠近镜头。
```

这要求系统记录偏好的作用域、强度和冲突关系。

## 信息架构

建议把 `ShotReference` 作为核心对象，其余概念作为索引维度或关联对象。

```text
ShotReference
- id
- title
- summary
- source
- mediaExamples[]
- sceneContext
- intent[]
- emotionalEffect[]
- shotFunction[]
- pattern[]
- visualPreference[]
- executionDetails
- worksWhen[]
- avoidWhen[]
- breakdown
- reusablePrinciple
- retrievalText
- userNotes
- agentNotes
- tags[]
```

### ShotReference

`ShotReference` 是一条可被浏览、解释、检索、推荐和应用的镜头参考。

建议字段：

```text
id
title
summary
status
source
mediaExamples[]
sceneContext
intent[]
emotionalEffect[]
shotFunction[]
pattern[]
visualPreference[]
executionDetails
worksWhen[]
avoidWhen[]
breakdown
reusablePrinciple
retrievalText
createdBy
createdAt
updatedAt
```

字段说明：

- `title`：面向用户的短标题，例如“遮挡式延迟揭示”。
- `summary`：一句话说明这个镜头的感受和用途。
- `status`：`draft / reviewed / archived`。
- `source`：来源信息，可以是用户上传、公开视频、生成预览、内部参考。
- `mediaExamples`：一个镜头参考可以挂多个视频、关键帧或生成预览。
- `retrievalText`：为 embedding 和 Agent 检索准备的自然语言摘要。

### MediaReference

视频示例应作为一等对象，而不是简单的 `videoUrl`。

```text
MediaReference
- id
- type
- sourceType
- sourceTitle
- sourceUrl
- localAssetUrl
- thumbnailUrl
- startTime
- endTime
- duration
- rightsStatus
- attribution
- previewMode
- visualQuality
```

字段说明：

- `type`：`video_clip / image / keyframe_sequence / animatic / generated_preview`。
- `sourceType`：`film / commercial / music_video / user_upload / generated / internal`。
- `startTime` / `endTime`：精确定位参考片段。
- `rightsStatus`：用于区分用户上传、公开链接、内部仅参考、可展示资产等。
- `previewMode`：`playable_clip / external_link / keyframes_only / unavailable`。

一条 `ShotReference` 关联媒体时，应保留媒体在该参考里的角色：

```text
MediaExampleLink
- mediaRefId
- role
- matchStrength
- note
```

`role` 建议：

```text
canonical
variation
contrast
anti_example
user_uploaded
generated_preview
```

### ExampleBreakdown

只给视频不够，系统还需要解释“为什么有效”。

```text
ExampleBreakdown
- mediaRefId
- observedIntent[]
- observedFunction[]
- observedPattern[]
- observedVisualPreference[]
- timeline[]
- keyFrames[]
- whyItWorks
- reusablePrinciple
- machineDescription
```

时间线示例：

```text
timeline:
- time: 00:00
  event: subject partially hidden behind foreground frame
- time: 00:03
  event: camera slowly pushes in
- time: 00:06
  event: subject turns, face becomes visible
- time: 00:09
  event: cut to reaction
```

关键帧示例：

```text
keyFrames:
- time: 00:00
  imageUrl: /frames/ex_001_000.jpg
  label: obstructed setup
- time: 00:06
  imageUrl: /frames/ex_001_006.jpg
  label: reveal moment
```

`machineDescription` 用于 Agent 检索和生成：

```text
A medium-long shot through a doorway. The subject is partially obscured by the doorframe.
The camera slowly pushes in before the subject turns toward camera. The shot creates
a hidden-observer feeling and delays emotional access.
```

## 语义维度

### Intent

`Intent` 表示“为什么要使用这个镜头”，偏创作目标。

```text
Intent
- id
- name
- category
- target
- audienceEffect
- intensity
- narrativeMoment
- description
```

建议分类：

```text
Narrative Intent
- reveal_information
- hide_information
- foreshadow
- show_power_shift
- establish_relationship
- isolate_character
- mark_turning_point

Emotional Intent
- create_tension
- create_intimacy
- create_alienation
- create_awe
- create_dread
- create_relief
- create_confusion

Perceptual Intent
- guide_attention
- disorient_viewer
- slow_viewer_down
- create_subjective_view
- create_surveillance_feeling

Thematic Intent
- express_control
- express_decay
- express_freedom
- express_entrapment
- express_memory
```

### ShotFunction

`ShotFunction` 表示镜头在序列中的结构作用，偏剪辑、叙事和信息流。

```text
ShotFunction
- id
- name
- category
- sequencePosition
- relationToPrevious
- relationToNext
- informationState
- pacingEffect
- description
```

建议分类：

```text
Spatial Function
- establishing
- reorienting
- geography_clarification
- entrance
- exit

Narrative Function
- reveal
- setup
- payoff
- misdirection
- escalation
- reversal

Character Function
- reaction
- decision
- hesitation
- realization
- concealment

Continuity Function
- match_cut_bridge
- eyeline_match
- insert_detail
- transition
- coverage
- cutaway

Rhythm Function
- pause
- acceleration
- compression
- release
- interruption
```

`Intent` 和 `ShotFunction` 的边界：

```text
Intent = 创作目标，为什么要这个镜头
ShotFunction = 结构作用，它在镜头序列中承担什么任务
```

### Pattern

`Pattern` 是可复用的镜头方法，是镜头库最重要的可迁移知识。

```text
Pattern
- id
- name
- category
- problem
- solution
- structure
- requiredElements[]
- variables[]
- variations[]
- compatibleIntents[]
- compatibleFunctions[]
- avoidWhen[]
- failureModes[]
- exampleRefs[]
```

建议分类：

```text
Camera Movement Pattern
- slow_push_in
- lateral_tracking
- orbit_around_subject
- handheld_follow
- static_observation

Composition Pattern
- centered_isolation
- foreground_obstruction
- frame_within_frame
- negative_space_pressure
- symmetrical_control

Blocking Pattern
- character_enters_empty_frame
- character_trapped_between_objects
- power_distance_between_characters
- subject_turns_away_from_camera

Reveal Pattern
- delayed_subject_reveal
- rack_focus_reveal
- occlusion_reveal
- mirror_reveal
- sound_before_image

Editing Pattern
- reaction_before_cause
- insert_then_wide
- jump_cut_disorientation
- match_cut_transformation
```

Pattern 示例：

```text
Pattern:
- name: Foreground Obstruction Reveal
- problem: Need to reveal a subject while preserving tension or distance.
- solution: Place an object between camera and subject, then reveal partially or gradually.
- structure:
  1. Viewer sees obstructed frame.
  2. Subject is partially hidden.
  3. Camera or subject movement changes visibility.
  4. Full information is delayed.
- variables:
  - obstruction_type
  - reveal_speed
  - subject_visibility
  - camera_distance
- compatibleIntents:
  - create_suspicion
  - create_surveillance_feeling
  - hide_information
- avoidWhen:
  - scene requires emotional directness
  - important action must be fully readable
- failureModes:
  - obstruction feels decorative
  - audience cannot identify subject
```

### VisualPreference

`VisualPreference` 表示风格倾向或视觉约束。它必须有作用域，否则无法支持个人风格和项目一致性。

```text
VisualPreference
- id
- scope
- category
- value
- strength
- reason
- negativePreference[]
- compatibleWith[]
- conflictWith[]
```

`scope` 建议：

```text
user
project
sequence
scene
shot
```

`strength` 建议：

```text
weak
medium
strong
required
```

分类建议：

```text
Optical
- wide_lens
- normal_lens
- long_lens
- shallow_depth
- deep_focus
- lens_distortion
- compression

Camera Movement
- static
- handheld
- slow_dolly
- smooth_tracking
- unstable_motion
- locked_off

Composition
- centered
- off_center
- negative_space
- symmetrical
- layered_depth
- close_framing

Lighting
- low_key
- high_key
- natural_light
- motivated_light
- silhouette
- hard_shadow
- soft_light

Color
- muted
- high_contrast
- warm
- cold
- monochrome
- complementary_palette

Texture
- clean_digital
- grainy
- documentary
- glossy
- degraded
- dreamlike

Realism
- naturalistic
- stylized
- theatrical
- surreal
```

### SceneContext

场景语境决定同一个镜头方法的意义。

```text
SceneContext
- genre
- sceneType
- locationType
- timeOfDay
- characterCount
- relationshipState
- conflictLevel
- storyBeat
- productionScale
```

示例：

```text
SceneContext:
- genre: thriller
- sceneType: confrontation
- locationType: narrow_interior
- characterCount: 2
- relationshipState: distrust
- conflictLevel: high
```

### EmotionalEffect

用户常常从情绪出发，而不是从镜头术语出发。

```text
EmotionalEffect
- name
- valence
- arousal
- dominance
- intensity
- viewerPosition
```

示例：

```text
EmotionalEffect:
- name: claustrophobia
- valence: negative
- arousal: high
- dominance: low
- viewerPosition: trapped_with_character
```

### ExecutionDetails

`ExecutionDetails` 把抽象镜头语言落到可执行拍摄方案。

```text
ExecutionDetails
- shotSize
- angle
- lens
- cameraHeight
- cameraMovement
- subjectMovement
- blocking
- focusBehavior
- duration
- transitionIn
- transitionOut
```

示例：

```text
ExecutionDetails:
- shotSize: medium_close_up
- angle: slightly_low
- lens: long_lens
- cameraMovement: slow_push_in
- focusBehavior: shallow_focus_on_subject
- duration: 8s
```

## 前端页面层级

### 浏览层

目标：让用户快速感知。

主要元素：

- 视频卡片
- 缩略图
- 3 秒 hover 预览
- 情绪标签
- 适用场景
- 收藏和应用入口

卡片示例：

```text
[视频缩略图 / 3 秒预览]
标题：被监视感的遮挡式揭示
一句话：通过前景遮挡和慢推，让观众像在暗处观察角色。
标签：Suspicion / Delayed Reveal / Foreground Obstruction / Slow Push-in
```

### 拆解层

目标：让用户理解为什么有效。

主要元素：

- 视频播放器
- 3 到 5 个关键帧
- 时间线拆解
- Intent / Function / Pattern / VisualPreference 摘要
- 为什么有效
- 可复用原则
- 类似镜头
- 反例

### 应用层

目标：把参考转成用户自己的镜头。

主要动作：

- 应用到当前场景
- 生成类似镜头
- 调整情绪方向
- 改成更克制 / 更悬疑 / 更温柔
- 加入项目视觉语言
- 收藏到个人镜头库

应用输出示例：

```text
Shot 1: 空办公室远景，女主进入画面，空间显得过大。
Shot 2: 桌上照片特写，先不露出完整内容。
Shot 3: 女主慢慢靠近，镜头从门框后观察她。
Shot 4: 她拿起照片，切反应近景。
```

## Agent 能力

Agent 不应只读取视频文件，而应优先使用结构化标注和 `machineDescription`。

需要支持的能力：

1. 自然语言意图检索参考镜头。
2. 从剧本场景推荐镜头方向。
3. 解释某个参考为什么适合当前场景。
4. 把参考迁移成用户自己的镜头方案。
5. 判断参考是否与用户/项目视觉偏好冲突。
6. 从上传视频中生成初步标注和拆解。
7. 根据用户反馈更新个人偏好。

推荐 Prompt 输入结构：

```text
CurrentScene
- scene summary
- characters
- conflict
- emotional target
- production constraints

ProjectVisualLanguage
- visualPreference[]
- negativePreference[]
- examples[]

CandidateShotReference
- summary
- intent[]
- emotionalEffect[]
- shotFunction[]
- pattern[]
- visualPreference[]
- executionDetails
- breakdown
- reusablePrinciple
```

Agent 输出应尽量包含：

```text
- recommended references
- why each reference fits
- conflicts with current project style
- adapted shot proposal
- alternatives if the user wants another emotional direction
```

## MVP 范围

第一版应聚焦“可观看 + 可理解 + 可应用”，不要过早做完整的自动视频理解系统。

建议 MVP：

- `ShotReference` 基础 CRUD
- 视频/图片参考上传或外链
- 缩略图和关键帧
- 手动或半自动标注 `Intent / Pattern / ShotFunction / VisualPreference`
- `breakdownText`
- `worksWhen / avoidWhen`
- 自然语言检索用的 `retrievalText`
- 从当前场景应用参考，生成镜头建议
- 收藏到个人镜头库

可以延后：

- 自动镜头切分
- 自动视频理解
- 批量关键帧抽取
- 版权状态自动判断
- 复杂反例系统
- 完整项目级视觉冲突检测
- 生成式 animatic

## 后续 Goal 拆分建议

### Goal 1：领域模型和数据契约

产出：

- 定义 `ShotReference`、`MediaReference`、`ExampleBreakdown` 等核心类型。
- 定义 `Intent / Pattern / ShotFunction / VisualPreference` 的基础枚举或字典。
- 明确前后端 DTO。
- 写入最小单元测试或 schema 校验。

### 标准镜头库 API

镜头库前端不应该假设数据一定来自当前登录服务。它应消费一组可配置的 `ShotLibrarySource`，每个来源只要实现同一套 REST API，就可以被前端并发读取、筛选、上传或以只读方式接入。

Source 配置：

```json
{
  "defaultSourceId": "default",
  "sources": [
    {
      "id": "default",
      "name": "Movscript",
      "baseURL": "http://localhost:8765",
      "enabled": true,
      "readOnly": false
    },
    {
      "id": "team-library",
      "name": "Team Shot Library",
      "baseURL": "https://shots.example.com",
      "enabled": true,
      "readOnly": true,
      "authToken": "optional-bearer-token"
    }
  ]
}
```

`baseURL` 是服务 origin，不包含 `/api/v1`。前端会请求：

- `GET /api/v1/shot-references?page=1&page_size=100&q=...`
- `POST /api/v1/shot-references/upload`
- `DELETE /api/v1/shot-references/:id`
- `GET /api/v1/resources/:id/file` 用于预览资源文件

最小响应契约：

```json
{
  "total": 1,
  "items": [
    {
      "ID": 1,
      "resource_id": 10,
      "resource": {
        "ID": 10,
        "type": "video",
        "name": "slow_push_reveal.mp4",
        "url": "/api/v1/resources/10/file",
        "size": 4096,
        "mime_type": "video/mp4"
      },
      "title": "slow push reveal",
      "summary": "A searchable shot reference summary.",
      "analysis_status": "ready",
      "intent": ["reveal_information"],
      "pattern": ["slow_push_in"],
      "shot_function": ["tension_buildup"],
      "visual_preference": ["restrained_pacing"],
      "emotional_effect": ["suspense"],
      "execution_details": {
        "duration_sec": 9.2,
        "resolution": "1920x1080",
        "aspect_ratio": "16:9"
      },
      "retrieval_text": "slow push reveal tension",
      "CreatedAt": "2026-05-30T00:00:00Z",
      "UpdatedAt": "2026-05-30T00:00:00Z"
    }
  ],
  "page": 1,
  "page_size": 100
}
```

如果 `resource.url` 是相对路径，前端会按该 source 的 `baseURL` 解析；如果是绝对 URL 或 `direct_url`，则直接使用。只读 source 不展示删除和上传能力。

### Goal 2：镜头库浏览体验

产出：

- 镜头卡片列表。
- 缩略图、标题、摘要、标签。
- 搜索和基础筛选。
- 空状态和加载状态。

### Goal 3：镜头详情与拆解

产出：

- 视频/关键帧展示。
- 时间线拆解。
- 为什么有效。
- 适用/不适用场景。
- 类似参考和反例占位。

### Goal 4：应用到当前场景

产出：

- 从剧本场景打开推荐入口。
- 选择一个镜头参考后生成当前场景的镜头方案。
- 支持用户调整情绪方向。

### Goal 5：用户收藏和偏好学习

产出：

- 收藏镜头参考。
- 用户标注“我喜欢它的哪一点”。
- 生成用户级 `VisualPreference`。

### Goal 6：媒体上传和半自动标注

产出：

- 用户上传视频或图片。
- 生成缩略图和关键帧。
- 生成初步 `summary / retrievalText / machineDescription`。
- 用户确认或修正标注。

### Goal 7：项目视觉语言一致性

产出：

- 项目级视觉偏好。
- 镜头参考与项目偏好的冲突提示。
- 替代推荐。

## 关键设计判断

1. `Intent / Pattern / ShotFunction / VisualPreference` 应作为语义维度，而不是用户必须手动操作的主界面。
2. 视频示例是核心体验，不是附属字段。
3. 每条参考必须有可复用原则，否则它只是素材，不是知识。
4. 偏好必须有作用域：用户、项目、序列、场景、镜头。
5. Agent 应优先依赖结构化标注和自然语言拆解，而不是直接依赖视频本身。
6. MVP 应先跑通“看见参考 -> 理解参考 -> 应用参考”的闭环，再扩展自动分析能力。
