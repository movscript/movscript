# Prompt Composer 与 Generation Intent 系统改造方案

状态：系统改造方案 + 已落地验收记录。本文档基于当前代码梳理，定义统一提示词编辑、模型过滤、引用角色、后端能力建模和 adapter 入参改造的目标方案；截至 2026-06-29，Prompt Composer 规则、前端主要入口、prompt 编译、模型过滤、后端 preflight、runner/provider contract、能力 schema V2 和 adapter debug trace 已完成端到端落地。

相关文档：

- `docs/model-routing-adapter-refactor-plan.zh-CN.md`
- `docs/resource-access-and-typed-resource-refactor-plan.zh-CN.md`

## 背景

当前生成入口已经开始做前置校验：

- Tool 页面通过 `ToolDialog` 构造 `GenerationIntent`，再调用 `/jobs/preflight`。
- 内容画布通过 `GenerationCandidateDialog` 和 inline generation panel 做本地 readiness 与后端预检。
- 工作流画布通过 `canvasGenerationNodes` 和 runtime input 值生成 `reference_assets`。
- 后端 `job.Service.PreflightGeneration` 会走模型路由、资源加载、usage estimate 等正式准备链路。

改造前体验暴露出的结构性问题：

1. Prompt 编辑和生成条件强绑定，用户每输入一个字符都可能引发检查或状态变化。
2. Tool、内容画布、工作流画布有不同的 prompt 编辑器、引用 chip、operation 选项和 readiness 展示。
3. `{{asset::id}}` 这类语义引用和 `generation_intent.reference_assets` 是两套数据；引用 chip 自身没有 `first_frame`、`last_frame`、`reference_image` 这类角色。
4. 内容画布目前根据 operation 和资源顺序推 role，例如第一张图变成首帧；这会让“普通参考图”被误用于“首帧生视频”。
5. 模型列表接口虽然支持 `operation` 和 `reference_assets` 查询，但前端曾经大多只传 `operation`，所以模型选项无法严格跟随当前 prompt 引用语义。
6. 后端 runner 曾经能解析 `@[resource:image:first_frame:42]`，但 `ImageRequest` / `VideoRequest` 没有结构化 `ReferenceAssets`，adapter 大多按媒体顺序消费资源，role 没有贯穿到 provider payload。

这说明问题不只是“生成按钮禁用”或“预检频率”。

目标应升级为：

```text
Prompt UI
  -> Semantic Prompt Document
  -> Prompt Compiler
  -> GenerationIntent
  -> Model Capability Query
  -> Backend Preflight
  -> Adapter-ready Generation Request
```

其中 `GenerationIntent` 是生成能力判断的唯一事实源，prompt 字符串只是用户可编辑文本和编译产物。

## 当前代码事实

### Prompt 编译

`packages/prompt/src/index.ts` 负责内容单元 prompt 编译：

- 支持 `{{asset::id}}`、`{{storyboard::id}}`、`{{keyframe::id}}`、`{{candidate::id}}`、`{{resource::123}}` 等语义引用。
- 支持 `role` / `media` metadata，例如 `{{asset::hero role=first_frame media=image}}`。
- 通过 backend decision context 找到已选择候选资源。
- 编译后把语义引用替换成 typed resource mention，例如 `@[resource:image:first_frame:123]`。
- `MovScriptPromptRefRole` 已扩展为真实生成引用角色，包括 `reference_image`、`first_frame`、`last_frame`、`style_reference` 等。
- `MovScriptCompiledContentUnitPrompt` 同时返回兼容字段 `resource_ids` 和事实源字段 `reference_assets`。

`packages/workspace/src/resourceMentions.ts` 支持 typed resource mention 和旧格式兼容：

```text
@[resource:123]
@[resource:image:123]
@[resource:image:first_frame:123]
@[resource:video:motion_reference:77]
```

所以最终编译产物不需要新语法，可以继续用 `@[resource:media:role:id]`。

### 前端生成入口

Tool 页面：

- `apps/desktop/src/features/tools/components/ToolDialog.tsx`
- 由附件、slot 和 prompt chip 生成 `GenerationIntent.reference_assets`。
- `ModelSelector` 查询携带当前 `operation + reference_assets`。
- `GenInputCard` 使用共享 role 菜单，资源 chip 写入 `data-role` / `data-media-type`，序列化为 `@[resource:media:role:id]`。

内容画布：

- `ContentCanvasPromptEditor` 支持 `{{...}}` 语义引用 chip。
- `ContentCanvasPromptEditor` 使用本地草稿 + 保存/重置，输入字符不再直接提交持久化 prompt。
- `ContentCanvasPromptReferences` 支持 resource/semantic chip 角色菜单，可显式设置“首帧/尾帧/普通参考/风格参考”等角色。
- `contentCanvasGenerationOptions.ts` 从 typed mention 和编译产物构造 `reference_assets`，不再把普通资源按顺序静默推成首帧/尾帧。
- 候选生成先编译 prompt，使用编译出的 `reference_assets` 构造 `GenerationIntent`。

工作流画布：

- `canvasGenerationInputPanel.tsx` 使用共享 role 菜单，prompt chip 序列化为 `@[resource:media:role:id]`。
- `canvasGenerationNodes.tsx` 对 runtime input values 保留 `role/media_type/resource_id`，并把 `reference_assets` 带入模型查询和 generation intent。
- operation 选项由共享 Prompt Composer 规则按 output kind + reference roles 过滤。

### 模型能力与路由

后端已有结构化能力雏形：

- `GenerationIntentInput`：`capability`、`operation`、`reference_assets`
- `/models` 支持 query：`capability`、`operation`、`reference_assets`
- `AIModelListFilter.ReferenceAssets`
- `AIGatewayRouteRequest.ReferenceAssets`
- `capabilityJSONSupportsIntent(...)`

能力 schema 已支持旧格式和 operation slot V2 双读。旧格式仍兼容：

```json
{
  "video_generation": {
    "operations": ["image_to_video", "first_last_frame_to_video"],
    "reference_assets": {
      "min": 1,
      "max": 4,
      "roles": ["generic", "first_frame", "last_frame"],
      "modalities": ["image"]
    }
  }
}
```

V2 格式可表达每个 operation 的 slot 约束、必选/可选、数量和 role/media 匹配：

```json
{
  "video_generation": {
    "operations": [
      {
        "id": "first_last_frame_to_video",
        "input_slots": [
          {
            "id": "first_frame",
            "required": true,
            "max": 1,
            "roles": ["first_frame"],
            "modalities": ["image"]
          },
          {
            "id": "last_frame",
            "required": true,
            "max": 1,
            "roles": ["last_frame"],
            "modalities": ["image"]
          }
        ]
      }
    ]
  }
}
```

`capabilityJSONSupportsIntent(...)` 现在优先使用 V2 operation slots；旧 schema fallback 继续工作。诊断 reason 覆盖缺少 slot、输入 role/media 不支持、数量超限等场景。

Registry YAML 和 admin 路由能力仍兼容传统字段：

- `capabilities`
- `input.accepts_image`
- `input.max_images`
- `input.max_videos`
- `params`

新写入的 `ModelCapabilitiesJSON` / `RouteCapabilitiesJSON` 可以直接声明 V2 operation slots；admin 保存、列表和路由诊断已接受 `operations` 数组、对象 map 和 `operation_slots` 三种结构。

### Adapter 与 Runner

后端 `Worker.resolveMentions` 能解析 typed mention，并把 job request context 中的 `generation_intent.reference_assets` 保留下来。

`ImageRequest` / `VideoRequest` 已包含结构化引用：

- `InputImageDataList []MediaData`
- `InputVideoData *MediaData`
- `InputAudioData *MediaData`
- `InputImages []string`
- `InputVideo string`
- `InputAudio string`
- `ReferenceAssets []ReferenceAsset`

runner 会从 job context 读取 `reference_assets`，加载资源并填充 `ReferenceAssets`，同时保留旧字段作为兼容输入。Volcengine、OpenAI、DashScope、Yunwu、Vidu、Kling 和 dry-run adapter 的 debug trace 已记录 `resource_id -> role/media_type -> provider_field` 映射；provider payload 仍按各供应商实际能力使用兼容字段。

## 设计目标

1. 所有生成入口使用统一 Prompt Composer。
2. prompt 引用 chip 自身携带语义角色，例如 `first_frame`、`last_frame`、`reference_image`。
3. 模型列表只展示匹配当前生成 intent 的模型；有图片输入时不出现文生图模型，普通参考图不能被首帧生视频误用。
4. UI 只保留两段：
   - 上方：提示词编辑器，引用以 chip 形式插入和编辑角色。
   - 下方：模型、输出类型、operation、尺寸/时长等生成参数。
5. 不展示独立状态区；只在模型区域提示“有可用模型 / 无可用模型 / 需要调整引用角色或 operation”。
6. 最终语义引用仍编译成 resource mention，例如 `@[resource:image:first_frame:123]`，并导出同源的 `reference_assets`。
7. 后端模型能力、路由能力、preflight、runner 和 adapter 全链路都使用同一份 `GenerationIntent`。

非目标：

- 不让 prompt 文本成为模型能力判断的事实源。
- 不再根据资源数量或顺序静默推断首帧、尾帧、视频参考。
- 不让各页面维护自己的 operation/role 规则。
- 不强行要求所有 provider 的实际 payload 都有原生 role 字段；当供应商 API 只能接收顺序数组时，必须在 debug trace 中保留结构化 `ReferenceAssets` 到 provider field 的映射。

## 目标数据模型

### Semantic Prompt Document

前端编辑器内部不应只保存字符串，而应维护一份语义文档：

```ts
type PromptReferenceRole =
  | 'reference_image'
  | 'reference_video'
  | 'reference_audio'
  | 'first_frame'
  | 'last_frame'
  | 'style_reference'
  | 'motion_reference'
  | 'source_video'
  | 'source_audio'
  | 'generic'

type PromptReferenceNode = {
  kind: 'asset' | 'candidate' | 'resource' | 'keyframe' | 'storyboard' | 'scene_moment' | 'expression_unit' | 'content_unit'
  id: string
  role: PromptReferenceRole
  mediaType?: 'image' | 'video' | 'audio' | 'text' | 'file'
  selectionPolicy?: 'selected_required' | 'candidate_allowed' | 'raw_resource_allowed'
  source: 'semantic_ref' | 'raw_resource' | 'attachment' | 'canvas_connection'
}

type PromptComposerDocument = {
  schema: 'movscript.prompt_composer.v1'
  text: string
  references: PromptReferenceNode[]
  negativeText?: string
  structured?: Record<string, unknown>
}
```

字符串序列化仍兼容现有 prompt：

```text
{{asset::hero role=first_frame media=image}}
{{storyboard::opening_panel role=reference_image}}
{{resource::42 role=style_reference media=image}}
```

当前已扩展 `{{...}}` 文本语法并保留 structured reference 入口。无论 role 来自 chip UI、semantic ref metadata 还是 typed mention，编译器都会输出同源的 typed mention 和 `reference_assets`。

### Compiled Prompt

`MovScriptCompiledContentUnitPrompt` 已新增：

```ts
type CompiledPromptReferenceAsset = {
  resource_id: number
  media_type: 'image' | 'video' | 'audio' | 'text' | 'file'
  role: PromptReferenceRole
  source_ref: string
}
```

编译结果：

```json
{
  "text": "让角色从室内走向门口 @[resource:image:first_frame:101]",
  "resource_ids": [101],
  "reference_assets": [
    {
      "resource_id": 101,
      "media_type": "image",
      "role": "first_frame",
      "source_ref": "{{asset::hero role=first_frame}}"
    }
  ]
}
```

规则：

- `resource_ids` 是兼容字段。
- `reference_assets` 是生成 intent 的事实源。
- `@[resource:...]` 是编译后的可读/可追踪 token，不作为唯一事实源。
- 如果 role 缺失，不允许自动推成 `first_frame` 或 `last_frame`；只能使用 `generic/reference_image`，或者提示用户选择角色。

### GenerationIntent

统一生成入口都提交：

```ts
type GenerationIntentPayload = {
  capability: 'image_generation' | 'video_generation' | 'audio_generation' | 'text_generation'
  operation: string
  reference_assets?: Array<{
    role: PromptReferenceRole
    media_type: 'image' | 'video' | 'audio' | 'text' | 'file'
    resource_id: number
  }>
}
```

operation 不再由页面自由枚举，而由 Prompt Composer 根据 output kind 和当前引用 roles 计算候选。

示例：

| 当前输入 | 可选 operation |
| --- | --- |
| 无图片、输出 image | `text_to_image` |
| 有 `reference_image`、输出 image | `image_to_image` / `reference_to_image` |
| 无图片、输出 video | `prompt_to_video` |
| 有 `reference_image`、输出 video | `image_to_video` / `reference_to_video` |
| 有 `first_frame`、输出 video | `first_frame_to_video` |
| 有 `first_frame` + `last_frame`、输出 video | `first_last_frame_to_video` |
| 有 `reference_video`、输出 video | `video_to_video` / `reference_to_video` |

反向限制也必须成立：

- 选择 `first_frame_to_video` 时，必须存在 `role=first_frame` 的 image ref。
- 选择 `first_last_frame_to_video` 时，必须同时存在 `first_frame` 和 `last_frame`。
- 普通 `reference_image/generic` 不能满足 `first_frame`。
- 有图片输入时，模型列表不能展示只支持 `text_to_image` 的模型。

## 模型能力 Schema 设计

当前 capability schema 已从 domain 级别扩展到 operation slot 级别。

```json
{
  "video_generation": {
    "operations": {
      "prompt_to_video": {
        "inputs": []
      },
      "image_to_video": {
        "inputs": [
          {
            "slot": "reference_image",
            "media_type": "image",
            "roles": ["reference_image", "generic"],
            "min": 1,
            "max": 1,
            "required": true
          }
        ]
      },
      "first_frame_to_video": {
        "inputs": [
          {
            "slot": "first_frame",
            "media_type": "image",
            "roles": ["first_frame"],
            "min": 1,
            "max": 1,
            "required": true
          }
        ]
      },
      "first_last_frame_to_video": {
        "inputs": [
          {
            "slot": "first_frame",
            "media_type": "image",
            "roles": ["first_frame"],
            "min": 1,
            "max": 1,
            "required": true
          },
          {
            "slot": "last_frame",
            "media_type": "image",
            "roles": ["last_frame"],
            "min": 1,
            "max": 1,
            "required": true
          }
        ]
      },
      "reference_to_video": {
        "inputs": [
          {
            "slot": "references",
            "media_type": ["image", "video", "audio"],
            "roles": ["reference_image", "reference_video", "reference_audio", "generic"],
            "min": 1,
            "max": 4,
            "required": true
          }
        ]
      }
    },
    "asset_transport": {
      "input_media": ["public_url", "inline_base64", "provider_asset_uri"]
    }
  }
}
```

迁移兼容：

- 后端已支持旧 schema 和新 schema 双读。
- 新 route/model capability JSON 可直接声明 `operations` 或 `operation_slots`，不要再只靠 `capabilities` 推导。
- `modelImportStructuredCapabilitiesJSON` 只作为旧模板迁移 fallback；新模板应显式声明 operation slots。

## Adapter Request 设计

`ImageRequest` / `VideoRequest` 已新增结构化引用：

```go
type ReferenceAsset struct {
	ResourceID uint
	Role      string
	MediaType string
	Data      *MediaData
	URL       string
	ProviderAssetURI string
}

type ImageRequest struct {
	...
	ReferenceAssets []ReferenceAsset
}

type VideoRequest struct {
	...
	ReferenceAssets []ReferenceAsset
}
```

Runner 职责：

1. 从 job request context 或 generation intent 读取 `reference_assets`。
2. 加载 RawResource 并绑定到对应 asset。
3. 按 route 的 asset transport 准备 URL / bytes / provider asset URI。
4. 填充 `ReferenceAssets`。
5. 为旧 adapter 同步填充 `InputImageDataList`、`InputVideoData` 等兼容字段。

Adapter 职责：

- 优先读取 `ReferenceAssets`。
- 根据 role 写 provider payload，例如 `first_frame`、`last_frame`、`reference_image`、`reference_video`。
- 不再根据输入顺序猜 role。

兼容要求：

- 旧 adapter 可以继续读 `InputImageDataList`，但 runner/provider contract 始终携带 `ReferenceAssets`。
- debug trace 记录 reference asset role、media_type、resource_id 和最终 provider field，避免供应商 payload 不支持 role 时丢语义。

## 统一 UI 方案

### 两段式布局

所有生成入口使用同一套 Prompt Composer，布局固定为两段：

```text
┌───────────────────────────────────────┐
│ Prompt Editor                          │
│ 文本 + 引用 chip                        │
│ [角色A · 首帧] [分镜1 · 普通参考]        │
└───────────────────────────────────────┘
┌───────────────────────────────────────┐
│ Output / Operation / Model / Params    │
│ 无可用模型时在模型控件内提示原因          │
└───────────────────────────────────────┘
```

不再单独展示状态面板。状态只体现在：

- 生成按钮 disabled。
- 模型选择器 placeholder / empty state。
- 引用 chip 自身的 warning badge。
- 参数区的短 inline message。

### Prompt Editor

能力：

- `@` 插入引用。
- 拖入资源或节点生成 chip。
- chip 可点击打开角色菜单。
- chip 显示媒体缩略图、标题、角色。
- chip 自身展示缺选择/缺资源/类型不匹配。

Chip 示例：

```text
[Hero · 首帧]
[Opening storyboard · 参考图]
[Resource #42 · 风格参考]
```

角色菜单根据媒体类型和输出类型过滤：

| 媒体 | 输出 image | 输出 video |
| --- | --- | --- |
| image | 普通参考、风格参考、编辑输入 | 普通参考、首帧、尾帧、风格参考 |
| video | 不可用或视频参考 | 视频参考、运动参考、源视频 |
| audio | 不可用或音频参考 | 音频参考、配音参考 |

### 模型与参数区

字段顺序：

1. 输出类型：image / video / audio / text。
2. Operation：由当前引用 roles 过滤。
3. Model：通过 `/models?capability&operation&reference_assets=...` 获取。
4. Params：来自选中模型 `supported_params` / `params_schema`。
5. Generate。

模型区域提示：

- 有模型：正常展示默认模型。
- 无模型：`当前引用组合没有可用模型`。
- 缺必需 role：`需要添加首帧图`。
- 当前 role 与 operation 不匹配：`普通参考图不能用于首帧生视频`。

### 编辑与预检节奏

输入每个字符时只做本地轻量解析：

- chip 边界
- 未闭合 token
- 重复引用
- 明显 media/role 不匹配

不做后端 preflight。

触发完整预检的时机：

- 点击生成。
- 点击保存/应用提示词。
- operation / model / 引用 role / 参数变化后，debounce 500-800ms 只刷新模型列表，不提交 job preflight。
- 用户停止输入后可选编译 preview，但必须 debounce + cancel。

保存态和生成态分离：

- 未保存 prompt 可以编辑。
- 生成时先编译当前 document，不要求每个字符都保存。
- 内容单元场景可以提供“保存并生成”，但后端仍以提交时编译产物为准。

## 前端组件分层

共享规则已经落在 `packages/core/src/generation`，共享角色菜单落在 `packages/ui/src/components/business/generation/input/reference-role-menu`。目前采用“共享合同 + 共享角色菜单 + 各 surface 保留轻量壳层”的方式落地，避免一次性重写全部编辑器。

```text
PromptComposerController
PromptComposerEditor
PromptReferenceChip
PromptReferenceRoleMenu
GenerationIntentBuilder
GenerationOperationResolver
GenerationModelSelector
GenerationParamsPanel
```

已落地的核心纯函数职责：

```ts
parsePromptComposerDocument(input): PromptComposerDocument
compilePromptComposerDocument(document, context): CompiledPrompt
buildGenerationIntent(compiledPrompt, outputKind, operation): GenerationIntentPayload
resolveGenerationOperations(outputKind, references, capabilitySchema): OperationOption[]
queryModelsForIntent(intent): Promise<PublicModel[]>
```

页面接入方式：

- Tool 页面只提供资源库、默认 output kind、默认 operation 和 source key。
- 内容画布只提供 content unit、candidate selection context 和 `loadCompiledPrompt`。
- 工作流画布只提供节点 runtime input / output ports。
- 所有页面复用同一套 operation resolver、reference role options、typed mention serializer 和模型查询 key。

完整抽出单一 `PromptComposerEditor` React 组件仍可作为后续维护优化，但不是本次验收的阻塞项；本次验收的关键是规则、序列化、role UI、模型过滤和后端校验已经统一。

## 后端改造

### 1. Capability Schema

已新增 operation-level schema 类型：

```go
type CapabilityDomainV2 struct {
	Operations map[string]OperationCapability `json:"operations"`
	AssetTransport AssetTransportCapability `json:"asset_transport"`
}

type OperationCapability struct {
	Inputs []OperationInputSlot `json:"inputs"`
}

type OperationInputSlot struct {
	Slot      string   `json:"slot"`
	MediaType any      `json:"media_type"`
	Roles     []string `json:"roles"`
	Min       int      `json:"min"`
	Max       int      `json:"max"`
	Required  bool     `json:"required"`
}
```

`capabilityJSONSupportsIntent` 已改为：

- 优先解析 V2。
- 旧 schema fallback。
- 返回结构化 reason，例如 `missing_operation_input:first_frame`、`unsupported_operation_input:reference_image:image`、`too_many_operation_inputs:first_frame`。

### 2. Model Registry

当前落地方式：

- route/model capability JSON 双读 V1/V2。
- 每个 route/model 可直接声明 operation slots。
- Admin 保存、列表、路由绑定校验和 route diagnosis 接受 V2 operation slots。

旧字段：

- `capabilities` 仍保留，用于列表和兼容。
- `input.accepts_image/max_images/max_videos` 可继续作为旧模板 fallback；新结构化判断以 operation slots 为准。

### 3. Prompt Compiler

`packages/prompt` 已扩展：

- `MovScriptPromptRefRole` 从 `'input'` 扩展为真实 role。
- parser 支持 role/media metadata，或读取 structured references。
- `resourceToken(resourceId, { mediaType, role })` 输出 typed mention。
- `MovScriptCompiledContentUnitPrompt` 返回 `reference_assets`。

### 4. Job / Candidate Preflight

`validateGenerationIntentContract` 和后端 preflight 已增强：

- 每个 `input_resource_ids` 必须能在 `reference_assets` 中找到同 resource_id。
- `reference_assets.resource_id` 必须与 input ids 一致。
- resource 实际类型必须匹配 `media_type`。
- operation/reference 组合不通过时返回 blocked，不创建 job。
- 模型路由会用同一份 `operation + reference_assets` 再做 route/model capability 校验。

`PreflightGeneration` 仍作为正式生成前的后端兜底校验点，目标响应字段为：

```json
{
  "ready": true,
  "operation": "first_frame_to_video",
  "matched_model": "...",
  "matched_route": "...",
  "reference_assets": [...]
}
```

### 5. Runner / Adapter

- job request context 持久化 `generation_intent.reference_assets`。
- `Worker.resolveMentions` 保留 role/media intent，并兼容旧 mention resource id 合并。
- `buildImageRequest` / `buildVideoRequest` 填充 `ReferenceAssets`。
- adapter debug trace 优先记录 `ReferenceAssets` 到 provider field 的绑定。
- provider payload 在供应商 API 支持 role 字段时使用结构化 role；不支持时保留兼容 payload，并通过 debug trace 保留语义映射。

## 迁移与落地状态

### Phase 1：共享 Prompt Composer 合同

状态：已完成。

- 新增共享 types 和纯函数。
- 让 Tool、内容画布、工作流画布都能构造同一份 `GenerationIntent`。
- 模型查询开始传 `reference_assets`。
- 停止根据资源顺序推首帧/尾帧。

验收：

- 有 `reference_image` 时，文生图模型不出现在可选项里。
- `first_frame_to_video` 只接受 `first_frame` role。
- 普通参考图不能通过首帧生视频 readiness。

### Phase 2：统一两段式 UI

状态：已完成可验收版。

- Tool 的 `GenInputCard`、内容画布 `ContentCanvasPromptEditor` / `ContentCanvasPromptReferences`、工作流画布 `CanvasGenerationInputPanel` 使用统一 role options、typed mention 序列化和共享 `GenerationReferenceRoleMenu`。
- 内容画布 prompt 编辑使用本地草稿 + 保存/重置，避免每个字符触发持久化提交。
- 独立状态不作为 UI 中心；可生成性主要体现在模型可用性、引用角色和生成按钮上。

验收：

- 三个入口的引用 chip 样式、角色菜单、模型空态一致。
- prompt 输入过程中不触发 job preflight。
- 生成前只有一次正式 preflight。

### Phase 3：后端能力 schema V2

状态：已完成。

- route/model capability 双读 V1/V2。
- V2 支持 `operations` 数组、`operations` 对象 map 和 `operation_slots`。
- operation slot 支持 role/media、required、min/max。
- Admin 保存、列表和路由绑定校验接受 operation slots。

验收：

- `/models` 能用 operation + reference_assets 精确过滤。
- route diagnosis 能说明为什么某模型不可用。
- 旧能力 JSON 仍可工作。
- 缺少首帧、普通参考误用于首帧、数量超限都会得到可诊断 reason。

### Phase 4：Adapter role 贯通

状态：已完成。

- `ImageRequest/VideoRequest` 增加 `ReferenceAssets`。
- runner 从 job context 填充 `ReferenceAssets`。
- Volcengine、OpenAI、DashScope、Yunwu、Vidu、Kling 和 dry-run adapter debug trace 记录 provider field 映射。
- 实际 payload 不混入 debug-only 字段。

验收：

- 首帧/尾帧不再依赖输入顺序。
- debug 能看到 `resource_id -> role -> provider field`。
- adapter 测试覆盖普通参考不能被当成首帧。

## 最终验收目标

最终验收目标是：任何可由提示词引用、operation、模型能力、资源类型和首尾帧语义提前判断的问题，都必须在生成前暴露；用户点击生成后不再遇到这类可前置的失败。覆盖入口包括 Tool 页面、预览页生成候选、内容画布候选生成、project 内容画布和工作流画布。

所有生成入口必须满足：

1. 使用统一 Prompt Composer 编辑和展示提示词引用。
2. 引用 chip 携带明确 `media_type` 和 `role`。
3. `{{asset::...}}` 等语义引用编译后生成 typed resource mention，例如 `@[resource:image:first_frame:123]`。
4. 编译产物同时导出 `reference_assets`，并以它作为 `GenerationIntent` 的事实源。
5. 模型列表查询必须带当前 `capability + operation + reference_assets`。
6. 有图片输入时不展示只支持 `text_to_image` 的模型。
7. 普通参考图不能满足 `first_frame_to_video` 或 `first_last_frame_to_video`。
8. 预览页和内容画布生成候选时，候选创建前必须先经过同一份 intent/readiness/preflight 链路。
9. 后端 preflight 使用同一份 schema 再校验一次，失败时不创建 job、不保留候选。
10. runner 和 adapter 使用结构化 reference assets，不再按资源顺序推断首帧/尾帧。
11. prompt 输入过程中不触发 job preflight；保存/应用、role/operation/model/参数变化和点击生成才触发相应的编译、模型刷新或正式 preflight。
12. 点击生成后，不再出现本可由 Prompt Composer 或 backend preflight 前置发现的模型能力、引用角色、资源类型、首尾帧缺失类错误。

## 2026-06-29 验收记录

已落地：

- `@movscript/core/generation` 提供共享 Prompt Composer 纯函数，Tool、内容画布、工作流画布都用同一套 operation/reference 规则。
- `@movscript/ui/business/generation` 提供共享 `GenerationReferenceRoleMenu`，桌面 Tool 和工作流画布已直接使用，project 内容画布复用同一套 role option/label 规则。
- `reference_assets` 已进入模型查询、前端 readiness、后端 preflight、runner request 和 provider contract。
- `ContentCanvasPromptEditor` 改为本地草稿 + 保存/重置按钮，不再每输入一个字符就向外提交 prompt。
- `ContentCanvasPromptReferences`、工作流画布和 Tool 输入都保留 typed resource mention 的 `media_type/role`。
- project 内容画布 resource/semantic chip 支持角色菜单，可把引用写成 `@[resource:image:first_frame:123]` 或 `{{asset::hero role=first_frame media=image}}`。
- prompt compiler 支持 `{{asset::... role=... media=...}}`，并输出 typed mention 和 `reference_assets`。
- 旧 `@[resource:123]`、`[[resource::123]]`、`{{resource::123}}` 仍兼容；`{{resource::123 role=first_frame media=image}}` 也会被解析成结构化引用。
- backend capability schema V2 已支持 operation slots、required/min/max、role/media 匹配和结构化诊断 reason，旧 schema 继续兼容。
- Admin route/model capability JSON 已支持 V2 operation slots 的保存、列表和路由绑定校验。
- Volcengine、OpenAI、DashScope、Yunwu、Vidu、Kling 和 dry-run adapter debug 已记录 `resource_id -> role/media_type -> provider_field`；provider payload 不写入 debug-only 字段。
- 回归覆盖包含 core generation、prompt compiler、workspace mention、desktop GenInput、canvas generation UI、project surface、Go model routing/preflight/runner/provider contract。

非阻塞后续优化：

- 可以继续抽出完整跨 surface React `PromptComposerEditor/PromptReferenceChip`，减少 UI 壳层重复；它不改变当前规则合同、typed mention、模型过滤或后端 preflight 的验收结论。
- 可以把更多 registry 模板从旧 `capabilities/input.*` 迁移成显式 V2 operation slots；旧模板 fallback 已受测试保护。

## 风险与注意事项

- 不要一次性删除旧 `@[resource:123]`，需要迁移期兼容。
- 不要把 role 只存在前端 state；保存/编译/请求/调试都要能看到。
- 不要让 operation 选项继续散落在各页面。
- 不要让 model registry 继续只靠旧 `capabilities` 推导结构化能力。
- 内容单元候选生成仍然不能自动采纳；生成成功只是创建候选，选择/采纳是另一个用户决策。
