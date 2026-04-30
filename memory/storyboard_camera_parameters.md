# 分镜创作相机参数设计方案

本文目标是把分镜里的“镜头语言”进一步参数化，补齐摄影机相关参数，尤其是焦距、光圈/T-stop、对焦距离、景深等。它不是供应商 API 参数清单，而是创作层参数方案：先帮助导演、分镜师、摄影指导表达画面意图，再在生成视频/图片时映射成 prompt、模型参数或后期元数据。

## 1. 调研结论

真实摄影工作不会只用“广角/长焦”或“浅景深”这类单词做决策。摄影师通常会同时考虑：

1. 焦距决定视角和放大率。Nikon 对焦距的说明是：焦距越长，视角越窄、放大率越高；焦距越短，视角越宽、放大率越低。
2. 光圈影响曝光和景深。Canon 的景深说明把景深归因于焦距、光圈、对焦位置、拍摄距离、主体与背景距离等共同条件；光圈越大，也就是 f 值越小，景深越浅。
3. 对焦距离是现场执行参数，不只是审美标签。ARRI LDS 会记录焦距、对焦距离、光圈/iris 等镜头数据，并可在现场显示景深，帮助摄影助理判断主体是否在景深范围内。
4. 专业电影镜头更常用 T-stop 表示实际透光量，摄影镜头和消费级参数更常用 f-stop。分镜创作层可以用统一字段 `aperture` 承接，内部保留 `aperture_unit: f_stop|t_stop`。
5. 摄影机/镜头元数据有生产价值。ARRI 和 RED 的文档都说明镜头信息会进入 clip metadata；ARRI 明确包含 lens model、focus、iris、zoom，RED 也支持镜头 aperture、focus 和 lens metadata。

参考来源：

- ARRI Metadata: https://www.arri.com/en/learn-help/learn-help-camera-system/pre-postproduction/metadata
- ARRI Lens Data System FAQ: https://www.arri.com/en/learn-help/learn-help-camera-system/frequently-asked-questions/lens-data-system-faq
- RED Lens Settings and Metadata: https://docs.red.com/955-0154_v7.0/REDRAVENOperationGuide/en-us/Content/5_Advanced_Menus/1_Settings/Setup/Lens.htm
- Canon Depth of Field: https://www.usa.canon.com/pro/rf-lens-world/features/depth-of-field
- Nikon Understanding Focal Length: https://www.nikonusa.com/learn-and-explore/c/tips-and-techniques/understanding-focal-length
- Nikon Maximum Aperture: https://www.nikonusa.com/en/learn-and-explore/a/tips-and-techniques/understanding-maximum-aperture.html

## 2. 对 MovScript 的设计判断

当前代码里，`Storyboard` 已有镜头创作字段：

- `shot_size`
- `angle`
- `movement`
- `focal_length`
- `pacing`
- `lighting`
- `duration`
- `intent`

其中 `focal_length` 目前是 `wide|standard|telephoto` 三档标签。这适合快速创作，但不够表达摄影执行。建议不要直接把所有专业参数堆进创建表单，而是拆成两层：

1. 创作层字段：给普通创作者用，强调意图、选择和可读性。
2. 专业层字段：给摄影指导、提示词生成、模型调用和 VFX/后期元数据使用，允许精确数值。

字段归属建议：

- `Storyboard` 保存镜头语言默认值，因为现有模型注释已经说明 camera creative planning parameters 属于 Storyboard。
- `Shot` 可以在后续增加覆盖字段，只保存单个镜头与分镜默认值不同的参数。比如同一分镜里第 2 个 shot 需要从 35mm 切到 85mm，才在 shot 层覆盖。
- 生成任务的 `extra_params` 保存模型调用快照，不作为创作主数据源。

## 3. 推荐参数分组

### 3.1 基础创作参数

这些参数应该出现在普通分镜编辑表单里。

| 字段 | 类型 | 示例 | 说明 |
| --- | --- | --- | --- |
| `shot_size` | enum | `close_up` | 景别，保留现有字段 |
| `angle` | enum | `low_angle` | 机位角度，保留现有字段 |
| `movement` | enum | `push` | 摄影机运动，保留现有字段 |
| `lens_category` | enum | `wide` | 镜头类别，替代/兼容现有 `focal_length` 三档 |
| `depth_of_field` | enum | `shallow` | 景深意图：浅、中、深 |
| `focus_behavior` | enum | `locked` | 对焦行为：锁定、跟焦、拉焦、失焦入焦 |
| `subject_distance` | enum | `near` | 摄影机到主体距离的粗粒度描述 |
| `aperture_style` | enum | `wide_open` | 光圈意图：大光圈、正常、收小 |

推荐枚举：

```ts
type LensCategory = 'ultra_wide' | 'wide' | 'standard' | 'portrait' | 'telephoto' | 'macro'
type DepthOfField = 'very_shallow' | 'shallow' | 'medium' | 'deep'
type FocusBehavior = 'locked' | 'tracking' | 'rack_focus' | 'soft_to_sharp' | 'sharp_to_soft'
type SubjectDistance = 'very_close' | 'near' | 'medium' | 'far'
type ApertureStyle = 'wide_open' | 'normal' | 'stopped_down'
```

### 3.2 专业相机参数

这些参数默认折叠在“高级摄影参数”里，或仅在专业模式显示。

| 字段 | 类型 | 示例 | 说明 |
| --- | --- | --- | --- |
| `focal_length_mm` | number | `35` | 精确焦距，单位 mm |
| `focal_length_range_mm` | object | `{ "min": 24, "max": 70 }` | 变焦镜头或允许范围 |
| `aperture` | number | `2.8` | 光圈数值 |
| `aperture_unit` | enum | `t_stop` | `f_stop` 或 `t_stop` |
| `focus_distance_m` | number | `1.8` | 对焦距离，单位米 |
| `focus_target` | string | `女主眼睛` | 对焦目标 |
| `rack_focus_target` | string | `男主手里的戒指` | 拉焦目标 |
| `sensor_format` | enum | `super_35` | 传感器/画幅，用于理解焦距视角 |
| `lens_profile` | string | `clean modern prime` | 镜头质感，不强行做枚举 |
| `camera_height` | enum | `eye_level` | 机位高度，可与 angle 分开 |
| `camera_distance_m` | number | `2.5` | 实际机位距离 |
| `shutter_angle` | number | `180` | 运动模糊意图，视频高级参数 |
| `iso` | number | `800` | 曝光元数据，可选 |
| `nd_filter` | string | `ND 0.9` | 现场曝光控制，可选 |

注意：焦距的视觉效果依赖 sensor format。同样 35mm，在全画幅、Super 35、Micro Four Thirds 上视角不同。因此 `focal_length_mm` 如果用于精确生成或 VFX，最好同时记录 `sensor_format`。

## 4. 焦距推荐档位

为避免用户只看到抽象的“广角/长焦”，UI 可以保留标签，但在 tooltip 或高级字段里给出常用等效焦距。

| `lens_category` | 全画幅等效焦距 | 常见用途 | 画面倾向 |
| --- | --- | --- | --- |
| `ultra_wide` | 14-20mm | 狭小空间、压迫感、大环境 | 夸张透视，边缘变形更明显 |
| `wide` | 24-35mm | 环境叙事、跟拍、多人关系 | 空间感强，主体与环境同时存在 |
| `standard` | 40-55mm | 日常对话、自然观察 | 接近人眼主观感，透视中性 |
| `portrait` | 70-100mm | 人物特写、情绪隔离 | 背景压缩，主体更突出 |
| `telephoto` | 120mm+ | 偷窥感、远距离观察、强压缩 | 空间被压扁，运动显得更慢 |
| `macro` | 50-100mm macro | 物件细节、眼泪、戒指、纹理 | 极浅景深，细节占据叙事 |

## 5. 光圈和景深推荐

光圈不要只作为曝光参数看待。对 AI 创作更重要的是它带来的景深、主体隔离和对焦难度。

| `aperture_style` | 常见数值 | 对应景深 | 创作效果 |
| --- | --- | --- | --- |
| `wide_open` | f/1.2-f/2.8 或 T1.5-T2.8 | 很浅/浅 | 背景虚化，情绪孤立，注意力强制落到主体 |
| `normal` | f/4-f/5.6 或 T4-T5.6 | 中等 | 叙事清楚，人物与环境都有信息 |
| `stopped_down` | f/8-f/16 或 T8-T16 | 深 | 群戏、动作调度、空间关系清晰 |

与景深相关的联动规则：

- `very_shallow` 通常需要较大光圈、较长焦距、较近主体距离。
- `deep` 通常需要较小光圈、较短焦距、较远主体距离。
- 移动主体 + `very_shallow` 会增加对焦风险，应提示创作者确认。
- `rack_focus` 必须有 `focus_target` 和 `rack_focus_target`。

## 6. 推荐数据结构

短期可以先新增字段，不必一次性复杂化数据库。中期建议把专业摄影参数收进一个 JSON 字段，避免频繁迁移。

```ts
interface StoryboardCameraProfile {
  lens_category?: LensCategory
  depth_of_field?: DepthOfField
  focus_behavior?: FocusBehavior
  subject_distance?: SubjectDistance
  aperture_style?: ApertureStyle

  focal_length_mm?: number
  focal_length_range_mm?: { min?: number; max?: number }
  aperture?: number
  aperture_unit?: 'f_stop' | 't_stop'
  focus_distance_m?: number
  focus_target?: string
  rack_focus_target?: string
  sensor_format?: 'full_frame' | 'super_35' | 'micro_four_thirds' | 'unknown'
  lens_profile?: string
  camera_height?: 'ground' | 'low' | 'waist' | 'eye_level' | 'high' | 'overhead'
  camera_distance_m?: number
  shutter_angle?: number
  iso?: number
  nd_filter?: string
}
```

数据库落地有两种方案：

1. 保守方案：继续保留现有 `focal_length`，新增 `camera_profile_json` 到 `storyboards`。前端表单写入 JSON，旧字段用于列表和兼容。
2. 强类型方案：给常用字段建列，如 `lens_category`、`depth_of_field`、`focus_behavior`、`aperture_style`，专业数值放 `camera_profile_json`。

建议先用保守方案。原因是摄影参数会继续演化，JSON 能减少早期迁移成本。

## 7. UI 展示建议

普通模式：

- 景别
- 角度
- 运动
- 焦距类别
- 景深
- 对焦方式
- 光圈意图
- 灯光
- 时长

专业模式：

- 精确焦距 mm
- 光圈数值 + f/T 单位
- 对焦距离 m
- 对焦目标
- 拉焦目标
- 传感器格式
- 镜头质感
- 快门角度
- ISO/ND

交互规则：

- 选择 `portrait` 或 `telephoto` 时，默认建议 `depth_of_field=shallow`，但不强制。
- 选择 `wide_open` 时，默认建议 `depth_of_field=shallow`。
- 选择 `stopped_down` 时，默认建议 `depth_of_field=deep`。
- 选择 `rack_focus` 后显示两个输入：起始焦点和结束焦点。
- 用户只填 `lens_category=wide` 时，prompt 生成可以写“wide-angle lens”；用户填 `focal_length_mm=24` 时，prompt 生成使用“24mm lens”。

## 8. Prompt 映射建议

创作参数应该生成稳定、可读的 prompt 片段，而不是把字段名直接塞进提示词。

示例输入：

```json
{
  "shot_size": "close_up",
  "lens_category": "portrait",
  "focal_length_mm": 85,
  "aperture": 2.0,
  "aperture_unit": "t_stop",
  "depth_of_field": "very_shallow",
  "focus_behavior": "rack_focus",
  "focus_target": "女主眼睛",
  "rack_focus_target": "男主手里的戒指"
}
```

中文 prompt 片段：

```text
人物特写，85mm 人像焦段，T2.0 大光圈，极浅景深。焦点从女主眼睛缓慢拉到男主手里的戒指，背景柔和虚化。
```

英文 prompt 片段：

```text
close-up shot, 85mm portrait lens, T2.0 wide aperture, very shallow depth of field, slow rack focus from the woman's eyes to the ring in the man's hand, soft blurred background.
```

## 9. 参数校验建议

基础校验：

- `focal_length_mm`: 允许 `4-1200`，普通 UI 推荐 `10-300`。
- `aperture`: 允许 `0.7-64`，普通 UI 推荐 `1.2-22`。
- `focus_distance_m`: 必须大于 `0`。
- `shutter_angle`: 允许 `1-360`，默认 `180`。
- `iso`: 必须为正数，可选常见值 `100/200/400/800/1600/3200`。

跨字段校验：

- `rack_focus` 要求 `focus_target` 和 `rack_focus_target` 至少填写一个明确文本。
- `depth_of_field=very_shallow` 且 `movement in (handheld, follow, dolly)` 时提示“对焦难度较高”。
- `aperture_style=wide_open` 但 `aperture>=8` 时提示不一致。
- `aperture_style=stopped_down` 但 `aperture<=2.8` 时提示不一致。
- `lens_category=ultra_wide` 但 `focal_length_mm>35` 时提示类别与数值不一致。
- `lens_category=telephoto` 但 `focal_length_mm<85` 时提示类别与数值不一致。

## 10. 实施路线

Phase 1：文档和 prompt 层

- 保留现有数据库。
- 在分镜生成 prompt 时引入 `lens_category`、`depth_of_field`、`aperture_style`、`focus_behavior` 的词表。
- 兼容旧 `focal_length=wide|standard|telephoto`。

Phase 2：Storyboard 增加 `camera_profile_json`

- 后端 `Storyboard` 增加 `CameraProfileJSON string json:"camera_profile_json"`。
- DTO patch allowlist 增加 `camera_profile_json`。
- 前端 `Storyboard` 类型增加 `camera_profile_json?: string`。
- 分镜详情页增加基础摄影参数 UI，专业字段折叠。

Phase 3：Shot 覆盖和生成快照

- Shot 层增加可选 `camera_profile_json`，只保存覆盖项。
- 生成任务创建时合并：`storyboard.camera_profile_json + shot.camera_profile_json + model params`。
- 将合并后的有效参数保存到 `GenJob.ExtraParams` 或 `effective_param_snapshot`。

Phase 4：模型能力映射

- 对支持精细相机控制的模型，把 `camera_fixed`、运动、焦距、光圈、景深、对焦行为分别映射。
- 对不支持精细参数的模型，仅写入 prompt。
- 保持创作层字段不绑定单一 provider。

## 11. MVP 推荐字段

如果只做第一版，建议先上这些：

```ts
interface StoryboardCameraMVP {
  lens_category?: 'ultra_wide' | 'wide' | 'standard' | 'portrait' | 'telephoto' | 'macro'
  focal_length_mm?: number
  aperture?: number
  aperture_unit?: 'f_stop' | 't_stop'
  depth_of_field?: 'very_shallow' | 'shallow' | 'medium' | 'deep'
  focus_behavior?: 'locked' | 'tracking' | 'rack_focus' | 'soft_to_sharp' | 'sharp_to_soft'
  focus_target?: string
  rack_focus_target?: string
}
```

这组字段能覆盖最关键的摄影表达：用什么焦段、开多大光圈、景深多浅、焦点在哪里、焦点是否变化。它比单独新增“光圈”和“焦距”更稳定，因为摄影师实际工作时也是把这几个变量一起考虑。
