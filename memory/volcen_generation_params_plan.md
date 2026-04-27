# 火山引擎生图/生视频参数架构方案

本文基于 `volcen.md` 中的 Ark 图片生成 API 和视频生成任务 API，目标是让工具里的生图、生视频参数可配置、可渲染、可校验、可稳定映射到 provider 请求。

## 1. 设计目标

1. 用户体验：默认只展示创作必需参数，高级参数折叠；不同模型只显示该模型真正支持的参数。
2. 开发体验：参数能力由模型规格声明驱动，前端表单、后端校验、adapter 请求构造共用同一份 schema。
3. 安全性：前端校验只做即时反馈，后端入队前必须做强校验；worker 调 provider 前再基于 normalized params 构造请求。
4. 可扩展性：支持模型差异、参数依赖、互斥参数、媒体输入数量/角色校验，避免把供应商细节散落在 UI 和 worker 中。

## 2. 当前代码现状

已有基础能力：

- `backend/internal/ai/catalog.go` 有 `ModelDef.SupportedParams []ParamDef`，前端会按模型渲染参数。
- `frontend/src/pages/tools/ToolDialog.tsx` 会把 `aspect_ratio`、`duration` 提到 `GenJob` 顶层，其余写入 `extra_params`。
- `backend/internal/genjob/worker.go` 会读取 `extra_params` 并透传 `size`、`quality`、`style`、`resolution_name`、`preset` 等少量字段。
- `backend/internal/ai/adapter_volcen.go` 已用 Ark SDK 调 `images/generations` 和 `content_generation/tasks`，但目前只映射了 `size`、`aspect_ratio`、`duration`。

主要缺口：

- `ParamDef` 太轻，缺少 provider 字段映射、模型适用范围、条件显示、跨字段校验、媒体输入约束。
- 火山图片的 `seed`、`guidance_scale`、`watermark`、`sequential_image_generation`、`output_format`、`tools` 等未统一纳入。
- 火山视频的 `resolution`、`ratio`、`frames`、`seed`、`camera_fixed`、`watermark`、`generate_audio`、`return_last_frame`、`service_tier` 等未统一纳入。
- 当前媒体输入只按数量粗校验，Seedance 的 `first_frame`、`last_frame`、`reference_image`、`reference_video` 角色还没有结构化表达。

## 3. 参数体系分层

建议把参数系统拆成四层：

1. `ModelGenerationSpec`
   模型能力声明。描述支持哪些 job type、输入媒体数量、可用参数、默认值、互斥/依赖规则。

2. `ParamDef`
   UI 和校验共用的字段定义。前端根据它渲染控件，后端根据它校验类型、范围、枚举、条件。

3. `NormalizedGenerationParams`
   后端入队前把用户输入规范化后的 JSON。只保存已知字段和通过校验的值，避免 worker 再解析脏数据。

4. Adapter translator
   每个 provider 负责把 normalized params 映射到 SDK 请求结构。例如 Volcen 的 `aspect_ratio` 应映射到视频 API 的 `ratio`，图片 API 的 `web_search=true` 应映射到 `tools:[{type:"web_search"}]`。

## 4. ParamDef 建议结构

现有 `ParamDef` 可以扩展为兼容结构：

```ts
type ParamType = 'string' | 'integer' | 'float' | 'boolean' | 'select'

interface ParamDef {
  key: string
  providerKey?: string
  label: string
  type: ParamType
  default?: string | number | boolean
  options?: string[]
  min?: number
  max?: number
  step?: number
  required?: boolean
  group?: 'basic' | 'advanced' | 'output' | 'media' | 'system'
  advanced?: boolean
  appliesTo?: string[]       // image | image_edit | video | video_i2v | video_v2v
  visibleWhen?: ParamRule[]
  enabledWhen?: ParamRule[]
  conflictsWith?: string[]
  validation?: {
    integerOnly?: boolean
    pattern?: string
    allowValues?: Array<string | number | boolean>
    custom?: string          // backend custom validator id
  }
}
```

不建议把复杂对象直接交给用户填 JSON。比如 `tools` 用 UI 字段 `web_search: boolean` 表示，再由 adapter 翻译。

## 5. 生图参数方案

### 5.1 推荐暴露给用户

基础参数：

| UI key | Volcen key | 类型 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `size` | `size` | select/string | 模型默认 | 支持 `1024x1024`、`2048x2048`、`2K`、`3K`、`4K` 或自定义 WxH，按模型限制校验 |
| `watermark` | `watermark` | boolean | true | 是否添加 AI 生成水印 |
| `output_format` | `output_format` | select | jpeg | 仅 Seedream 5.0 lite 支持 `png/jpeg` |

高级参数：

| UI key | Volcen key | 类型 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `seed` | `seed` | integer | -1 | Seedream 3.0 支持，范围 `[-1, 2147483647]` |
| `guidance_scale` | `guidance_scale` | float | 2.5 | Seedream 3.0 支持，范围 `[1,10]` |
| `sequential_image_generation` | `sequential_image_generation` | select | disabled | Seedream 5.0 lite/4.5/4.0 支持，`auto/disabled` |
| `max_images` | `sequential_image_generation_options.max_images` | integer | 15 | 仅当组图为 `auto` 时启用，范围 `[1,15]` |
| `web_search` | `tools` | boolean | false | 仅 Seedream 5.0 lite 支持，映射为 `tools:[{type:"web_search"}]` |
| `optimize_prompt_mode` | `optimize_prompt_options.mode` | select | standard | Seedream 5.0 lite/4.5/4.0 支持，`standard/fast`，其中 5.0 lite/4.5 当前不支持 fast |

系统参数：

- `response_format` 固定为 `url`，不要让普通用户选择。生成 URL 只有 24 小时有效，后端应继续转存到本地资源或云存储。
- `stream` 暂不作为通用用户参数。只有做组图实时进度时再在任务系统里实现 SSE 事件消费。

### 5.2 Seedream 模型差异

| 模型 | 图片输入 | size | 特有参数 |
| --- | --- | --- | --- |
| Seedream 3.0 t2i | 不支持 | `512x512` 到 `2048x2048`，推荐预设 | `seed`、`guidance_scale` |
| Seedream 4.0 | 1-14 张参考图 | `1K/2K/4K` 或 WxH；像素 `[921600,16777216]`，比例 `[1/16,16]` | 组图、优化提示词 |
| Seedream 4.5 | 1-14 张参考图 | `2K/4K` 或 WxH；像素 `[3686400,16777216]`，比例 `[1/16,16]` | 组图、优化提示词 |
| Seedream 5.0 lite | 1-14 张参考图 | `2K/3K/4K` 或 WxH；像素下限 `3686400`，比例 `[1/16,16]` | `output_format`、`web_search`、组图 |

图片输入校验：

- 单图大小不超过 10 MB。
- 单图总像素不超过 `36,000,000`。
- 宽高长度都要大于 14 px。
- 参考图格式：jpeg/png；Seedream 5.0 lite/4.5/4.0 还支持 webp/bmp/tiff/gif。
- 参考图数量 + 组图最大输出数量 <= 15。

## 6. 生视频参数方案

### 6.1 推荐暴露给用户

基础参数：

| UI key | Volcen key | 类型 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `resolution` | `resolution` | select | 720p/1080p | `480p/720p/1080p`，按模型限制过滤 |
| `ratio` | `ratio` | select | 模型默认 | `16:9/4:3/1:1/3:4/9:16/21:9/adaptive` |
| `duration` | `duration` | integer/select | 5 | 1.0: `[2,12]`；1.5: `[4,12]` 或 `-1`；2.0: `[4,15]` 或 `-1` |
| `generate_audio` | `generate_audio` | boolean | true | 仅 Seedance 2.0/2.0 fast/1.5 pro 支持 |
| `watermark` | `watermark` | boolean | false | 是否生成水印 |

高级参数：

| UI key | Volcen key | 类型 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `seed` | `seed` | integer | -1 | 范围 `[-1, 4294967295]` |
| `frames` | `frames` | integer | 空 | 与 `duration` 互斥，1.5/2.0 暂不支持；满足 `25 + 4n`，范围 `[29,289]` |
| `camera_fixed` | `camera_fixed` | boolean | false | 参考图场景不支持，2.0/2.0 fast 暂不支持 |
| `return_last_frame` | `return_last_frame` | boolean | false | 用于连续视频生成，Draft 模式不支持 |
| `service_tier` | `service_tier` | select | default | `default/flex`；2.0/2.0 fast 不支持离线推理 |
| `draft` | `draft` | boolean | false | 仅 1.5 pro 支持，开启后只能 480p，且不支持返回尾帧和离线推理 |
| `web_search` | `tools` | boolean | false | 仅 2.0/2.0 fast 支持 |
| `execution_expires_after` | `execution_expires_after` | integer | 172800 | 范围 `[3600,259200]`，建议作为系统高级参数 |

系统参数：

- `safety_identifier` 应由后端基于用户 ID 哈希生成，不给用户填。
- `callback_url` 由系统决定。当前 genjob 轮询架构下可暂不使用。

### 6.2 Seedance 模型差异

| 模型 | 能力 | 输入限制 | duration | resolution/ratio |
| --- | --- | --- | --- | --- |
| 1.0 lite t2v | 文生视频 | 无图片/视频输入 | `[2,12]` | 默认 720p，文生默认 16:9 |
| 1.0 lite i2v | 图生视频/首尾帧/参考图 | 参考图 1-4 张；首帧 1 张；首尾帧 2 张 | `[2,12]` | 默认 720p；参考图场景不支持 1080p，参考图默认 16:9 |
| 1.0 pro fast | 文生/首帧图生 | 1 张首帧 | `[2,12]` | 默认 1080p |
| 1.5 pro | 文生/首帧/首尾帧 | 首帧 1 张；首尾帧 2 张 | `[4,12]` 或 `-1` | 默认 720p；支持 adaptive；支持有声、draft |
| 2.0 / 2.0 fast | 文生/图生/多模态参考/视频参考 | 图片 0-9、视频 0-3、音频 0-3；当前系统可先限制为图片 1、视频 1 | `[4,15]` 或 `-1` | 默认 720p；支持 adaptive；2.0 fast 不支持 1080p |

媒体输入校验：

- 图片：jpeg/png/webp/bmp/tiff/gif；1.5 pro 额外支持 heic/heif；单张小于 30 MB；宽高比 `(0.4,2.5)`；宽高长度 `(300,6000)`。
- 视频：mp4/mov；单个 `[2,15]` 秒，最多 3 个，总时长不超过 15 秒；单个小于 50 MB；FPS `[24,60]`。
- 图生视频首尾帧需要给两张图打角色：`first_frame`、`last_frame`。
- 参考图视频需要角色：`reference_image`、`reference_video`。
- 首帧、首尾帧、多模态参考是互斥场景，不能混用。

## 7. 后端校验策略

新增 `ai.ValidateGenerationParams(def, jobType, mediaMeta, rawParams)`：

1. 类型校验：select 必须在 options 内，integer 不接受小数，boolean 不接受字符串歧义值。
2. 模型适用校验：参数必须在当前模型、当前 job type 支持范围内。
3. 取值范围校验：min/max/step/pattern/custom validator。
4. 互斥校验：`duration` 与 `frames` 互斥；`draft=true` 与 `return_last_frame=true` 互斥；`draft=true` 要求 `resolution=480p`。
5. 条件校验：`max_images` 只在 `sequential_image_generation=auto` 时有效；`web_search` 只在支持 tools 的模型有效。
6. 媒体校验：输入数量、类型、大小、尺寸、时长、角色组合。
7. 归一化：只把通过校验的字段写回 `GenJob.ExtraParams`，同时把 `duration`、`ratio/aspect_ratio` 继续兼容顶层字段。

## 8. Adapter 映射策略

### 图片

`ImageRequest` 建议扩展：

- `Seed int64`
- `GuidanceScale float64`
- `Watermark *bool`
- `OutputFormat string`
- `SequentialImageGeneration string`
- `SequentialMaxImages int`
- `WebSearch bool`
- `OptimizePromptMode string`

Volcen adapter 映射：

- `InputImageDataList` -> `GenerateImagesRequest.Image`，多图用 `[]string`。
- `watermark` -> `GenerateImagesRequest.Watermark`
- `web_search` -> `Tools: []*ContentGenerationTool{{Type: ToolTypeWebSearch}}`
- `max_images` -> `SequentialImageGenerationOptions.MaxImages`

### 视频

`VideoRequest` 建议扩展：

- `Resolution string`，逐步替代现有 `ResolutionName`
- `Ratio string`，逐步替代 `AspectRatio`
- `Frames int`
- `Seed int64`
- `CameraFixed *bool`
- `Watermark *bool`
- `GenerateAudio *bool`
- `ReturnLastFrame *bool`
- `ServiceTier string`
- `ExecutionExpiresAfter int`
- `WebSearch bool`
- `MediaRoles []MediaRole`

Volcen adapter 映射：

- `ratio` -> `CreateContentGenerationTaskRequest.Ratio`
- `resolution` -> `Resolution`
- `duration` -> `Duration`
- `frames` -> `Frames`
- `seed` -> `Seed`
- `camera_fixed` -> `CameraFixed`
- `watermark` -> `Watermark`
- `generate_audio` -> `GenerateAudio`
- `return_last_frame` -> `ReturnLastFrame`
- `service_tier` -> `ServiceTier`
- `web_search` -> `Tools`

## 9. 前端体验建议

1. 参数分组：
   - 基础：尺寸/比例、时长、分辨率、是否有声。
   - 高级：seed、帧数、镜头固定、水印、联网搜索、服务等级。
   - 系统不展示：response_format、callback_url、safety_identifier。

2. 即时反馈：
   - 选择模型后动态刷新参数。
   - 不支持的参数直接隐藏，不要置灰一大片。
   - 自定义尺寸输入时显示像素范围、比例范围错误。

3. 媒体槽位：
   - 视频生成工具应从单一附件列表升级为 slot：首帧、尾帧、参考图、参考视频。
   - 默认模式先提供「文生视频 / 首帧图生视频 / 首尾帧图生视频 / 参考图视频」切换。

4. 默认值：
   - 面向普通用户：默认 720p、5s、无水印、关闭 seed、关闭联网搜索。
   - 面向质量优先场景：可提供预设模板，而不是让用户理解所有供应商字段。

## 10. 分阶段落地

### Phase 1: 参数 schema 和强校验

- 扩展 `ParamDef`，保持旧字段兼容。
- 在 handler 入队前校验 `extra_params`。
- 给 Volcen Seedream/Seedance catalog 补齐基础参数。
- worker 使用 normalized params 构造 `ImageRequest` / `VideoRequest`。

### Phase 2: Volcen adapter 补全映射

- 图片补 `seed/guidance_scale/watermark/output_format/sequential/web_search/optimize_prompt_mode`。
- 视频补 `resolution/frames/seed/camera_fixed/watermark/generate_audio/return_last_frame/service_tier/web_search`。
- debug body 中记录 normalized params，方便排查。

### Phase 3: 媒体角色和多输入

- 扩展 `InputSlotDef` 或新增 `MediaRoleDef`。
- Seedance 支持首尾帧、参考图、参考视频的角色映射。
- 后端读取媒体元信息，做尺寸/时长/大小校验。

### Phase 4: 流式与组图增强

- 图片组图启用 streaming 后，把 partial succeeded/failed 写入 job events。
- 前端展示每张图的进度和部分失败。
- 最终产物按多资源输出，不再只取第一张 URL。

## 11. 建议的 MVP 参数集

生图先做：

- `size`
- `watermark`
- `seed`
- `guidance_scale`
- `sequential_image_generation`
- `max_images`
- `output_format`
- `web_search`

生视频先做：

- `resolution`
- `ratio`
- `duration`
- `seed`
- `generate_audio`
- `watermark`
- `camera_fixed`
- `return_last_frame`
- `service_tier`

这套 MVP 覆盖用户最常用的创作控制，同时不会一开始就把 callback、safety、draft、frames、多音频等复杂能力暴露给普通用户。
