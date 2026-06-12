# Content Unit Prompt and Regeneration Refactor

## 背景

当前 `movscript/packages` 中，内容单元和重新生成判断主要由以下链路完成：

- `packages/language/src/domain/schemas.ts` 定义 `contentUnitEntitySchema`。
- `packages/workspace/src/repository/contentUnits.ts` 写入 `content_unit.json`，并保留多组顶层引用字段。
- `packages/interpreter/src/artifacts/contentProductionAdapters.ts` 根据 `content_unit_type` 展开实体上下文，拼接 `runtimePanel.prompt`。
- `packages/interpreter/src/artifacts/contentProduction.ts` 根据 `collectHashInputs()` 生成 `inputVersion.hash`。
- `packages/workspace/src/service.ts` 创建候选时复制当前 `runtime_panel.prompt` 到 `candidate.prompt_snapshot`。
- 选择候选时把候选的 `input_version.hash` 写到 `selection.accepted_input_hash`。
- 解释器通过 `accepted_input_hash !== current_input_hash` 判断 selection stale。

这个模型的问题是：内容单元引用的实体内容会被动态展开到 prompt 和 hash 中，因此实体本身的字段变化会隐式影响内容单元和下游重新生成判断。

新的目标是把判断标准收敛为：

```text
当前 content_unit 的规范化提示词
  vs
候选生成时复制的 prompt_snapshot
```

实体记录的普通变化不直接影响重新生成。只有当内容单元自身的提示词变了，或提示词引用的上游内容单元 selection 变了，才会导致候选过期。

## 核心决策

### 1. 不新增并列实体

不引入新的 `PromptBundle` 源实体，也不把提示词实体从 content unit 中拆出去。

`contentUnitEntitySchema` 就是源事实：

```text
content_units/{contentUnitId}/content_unit.json
```

它表示这个内容单元当前最新版本的提示词说明。

候选只是生成时的结果记录。候选必须复制当时的规范化提示词，但候选不是提示词的源。

### 2. 引用进入 `edit_prompt`

删除 content unit 顶层的多组业务引用字段：

```ts
scene_moment_ref
shot_id
shot_ref
storyboard_ref
keyframe_ref
keyframe_refs
audio_cue_ref
audio_cue_refs
expression_unit_refs
asset_ref
```

引用统一写入 `edit_prompt`，由标准语法解析。

### 3. 一种 `content_unit_type` 对应一种主引用规则

第一阶段固定五种 content unit。

每个 `content_unit_type` 只声明一种主 ref 规则。主 ref 表达“这个内容单元归属于哪个源实体”，不是把该实体内容动态展开进提示词。

示例：

| `content_unit_type` | 默认 `output_kind` | 主引用规则 | 含义 |
| --- | --- | --- |
| `asset_ref` | `image` | 必须且只能引用 1 个 `asset` | 这个内容单元生成某个 asset 的当前提示词版本 |
| `keyframe_ref` | `image` | 必须且只能引用 1 个 `keyframe` | 这个内容单元生成某个关键帧的当前提示词版本 |
| `storyboard_ref` | `image` | 必须且只能引用 1 个 `storyboard` | 这个内容单元生成某个分镜图的当前提示词版本 |
| `scence_moment_ref` | `video` | 必须且只能引用 1 个 `scene_moment` | 这个内容单元直接生成某个情节的当前提示词版本 |
| `shot_ref` | `video` | 必须且只能引用 1 个 `shot` | 这个内容单元生成某个镜头的当前提示词版本 |

如果未来确实需要多种引用，不应继续往同一个 content unit 顶层加字段，而应新增明确类型，例如：

```text
storyboard_with_refs
```

并在该类型的规则里显式声明允许的引用形态。

## Content Unit Schema

目标形态：

```json
{
  "schema": "movscript.content_unit.v1",
  "kind": "content_unit",
  "id": "cu_wet_hair_ref",
  "title": "Wet hair visual reference",
  "content_unit_type": "asset_ref",
  "output_kind": "image",
  "edit_prompt": {
    "text": "Create the wet hair continuity reference from {{asset:wet_hair}}.",
    "negative_text": "cartoon, glamour lighting",
    "structured": {
      "style": "cold rainy realism"
    }
  },
  "model_intent": {
    "capability": "image",
    "aspect_ratio": "1:1"
  }
}
```

`contentUnitEntitySchema` 保留：

- `content_unit_type`
- `output_kind`
- `edit_prompt`
- `model_intent`
- `title`
- `description`
- `order`
- 通用 metadata 字段

`contentUnitEntitySchema` 删除：

- `scene_moment_ref`
- `shot_id`
- `shot_ref`
- `storyboard_ref`
- `keyframe_ref`
- `keyframe_refs`
- `audio_cue_ref`
- `audio_cue_refs`
- `expression_unit_refs`
- `asset_ref`

## `edit_prompt` 引用语法

### 基础语法

推荐语法：

```text
{{type:id}}
```

示例：

```text
{{asset:wet_hair}}
{{keyframe:scene_anchor}}
{{storyboard:main}}
{{shot:phone}}
{{content_unit:cu_wet_hair_ref}}
```

`type` 是固定枚举，第一阶段支持：

```ts
type ContentUnitPromptRefKind =
  | 'asset'
  | 'keyframe'
  | 'storyboard'
  | 'shot'
  | 'content_unit'
```

`id` 是稳定业务 id，先不要求路径。路径解析由 index 层完成。

### 解析结果

解析器输出稳定结构：

```ts
interface ContentUnitPromptRef {
  kind: 'asset' | 'keyframe' | 'storyboard' | 'shot' | 'content_unit'
  id: string
  raw: string
  source: {
    field: 'edit_prompt.text' | 'edit_prompt.negative_text' | 'edit_prompt.notes' | string
    start?: number
    end?: number
  }
}
```

### 解析范围

第一阶段只解析：

- `edit_prompt.text`
- `edit_prompt.negative_text`
- `edit_prompt.notes`

`edit_prompt.structured` 可以保留，但不要先设计复杂递归语法。需要结构化引用时，再新增明确字段，例如：

```json
{
  "structured": {
    "refs": ["{{asset:wet_hair}}"]
  }
}
```

## 规范化提示词

解释器应从 content unit 构造一个稳定的规范化提示词对象。这个对象可以作为 derived artifact，也可以内嵌在 `runtime_panel` 中，但它不是新的源实体。

建议结构：

```ts
interface NormalizedContentUnitPrompt {
  schema: 'movscript.content_unit_prompt.v1'
  content_unit_ref: string
  content_unit_id?: string | number
  content_unit_type: string
  output_kind: string
  edit_prompt: {
    text?: string
    negative_text?: string
    notes?: string
    structured?: Record<string, unknown>
  }
  model_intent?: Record<string, unknown>
  refs: Array<{
    kind: string
    id: string
    raw: string
    resolved?: {
      entityKind: string
      id?: string | number
      path?: string
    }
  }>
  runtime_request: {
    capability: string
    inputs: Array<{
      role: string
      kind: 'image' | 'video' | 'audio' | 'text' | 'metadata'
      ref?: string
      source_content_unit_ref?: string
      candidate_id?: string | number
      resource_id?: string | number
      required: boolean
    }>
    params?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }
  blockers?: Array<{
    code:
      | 'ref_not_found'
      | 'upstream_content_unit_not_found'
      | 'upstream_selection_missing'
      | 'upstream_selection_stale'
      | 'upstream_resource_missing'
      | 'prompt_dependency_cycle'
    ref?: string
    message: string
  }>
}
```

这里的 `refs` 只记录引用解析和解析状态。它不展开被引用实体的完整 record。

如果 `blockers` 非空，`runtime_panel.status` 必须为 `blocked`，生成工具不应继续创建 provider job。

## 上游选择传播

重新生成判断只允许两类变化影响 stale：

1. 当前 content unit 的规范化提示词变了。
2. 当前提示词引用的上游 content unit selection 变了。

典型例子：

```text
shot_ref content unit
  edit_prompt.text includes {{asset:wet_hair}}

asset_ref content unit for asset:wet_hair selection changes:
  resource_asset_1 -> resource_asset_2

shot_ref current normalized prompt changes:
  runtime_request.inputs[0].resource_id changes

selected video candidate prompt_snapshot no longer matches current normalized prompt
  -> stale = true
```

相反：

```text
asset wet_hair prompt_hint changes
```

不直接影响下游 content unit。只有当归属于 `asset:wet_hair` 的 `asset_ref` 内容单元 `edit_prompt` 改变，或它选择了新的 candidate/resource，才影响引用它的下游内容单元。

## Interpreter 职责

`interpreter` 的职责不是生成内容，而是解释 source workspace。

在新模型中，它需要完成三件事：

1. 解释文件之间的含义关系。
2. 解释 content unit 的 `edit_prompt`，把提示词语法解析成规范化提示词。
3. 解释提示词依赖缺失问题。

依赖缺失是生成任务能否推进的硬约束。

例如某个内容单元的 prompt 写了：

```text
Use upstream visual reference {{asset:wet_hair}}.
```

解释器需要判断：

- `asset:wet_hair` 是否能解析到源 asset。
- 是否存在一个 `asset_ref` content unit 归属于该 asset。
- 该 `asset_ref` content unit 是否已经有 selected candidate。
- selection 是否提供可用 `resource_id`。
- selection 本身是否 stale。

如果上游 asset 没有已选择的候选，当前内容单元的规范化 prompt 无法完整推导，生成任务必须是 blocked，而不是继续生成。

这个判断不依赖 hash。它来自 prompt 引用解析和上游 selection 状态。

## Backend Prompt 编译层

新增 `@movscript/prompt` 包作为独立的提示词编译层，和 `interpreter` 保持边界清晰。

`interpreter` 负责解释内容单元语义、依赖关系和可生成性；`@movscript/prompt` 负责把一个内容单元的 `edit_prompt` 编译成后端可以直接理解的提示词。

编译入口应支持：

```ts
buildContentUnitBackendPromptById({
  index,
  contentUnitId,
  decisionProvider,
})
```

其中 `decisionProvider` 必须读取后端 decision context。`selection.json` 不是 source of truth，不能作为新编译链路的数据来源。

编译规则：

- 主 ref 保留为业务语义，例如 `shot_ref` 中的 `{{shot:phone}}` 不会被替换。
- 上游 input ref 必须先解析到对应 content unit，再读取该 content unit 的后端 selection。
- 如果后端 selection 能提供 `resource_id`，则把原始 ref 替换成 `[[resource::resource_id]]`。
- 如果无法安全得到 `resource_id`，返回 `ok: false` 和稳定 blocker，不生成“看似可用”的后端 prompt。

示例：

```text
Generate {{shot:phone}} using {{asset:wet_hair}}.
```

当 `asset:wet_hair` 对应的 `asset_ref` 内容单元在后端 decision context 中有：

```json
{
  "selection": {
    "candidate_id": "candidate_a",
    "resource_id": 123
  }
}
```

编译结果应为：

```text
Generate {{shot:phone}} using [[resource::123]].
```

如果该后端 decision context 不存在，或存在但没有 selection/resource，则编译结果必须包含 blocker，例如：

```json
{
  "ok": false,
  "blockers": [
    {
      "code": "decision_context_missing",
      "ref": "{{asset:wet_hair}}",
      "content_unit_ref": "content_units/cu_wet_hair_ref"
    }
  ]
}
```

上层调用面：

- `@movscript/prompt` 暴露纯编译 API。
- `@movscript/engine` 暴露 `buildContentUnitBackendPrompt(contentUnitId)`。
- MCP/domain 暴露 `domain_build_content_unit_backend_prompt`，用于按项目和内容单元 ID 直接构造后端提示词。

## Adapter 规则

`contentProductionAdapters.ts` 应从“读取顶层 ref 字段并展开实体上下文”改成“按 type 校验 edit_prompt refs 并构造 runtime_request”。

通用规则：

- adapter 只读取 `content_unit_type`、`output_kind`、`edit_prompt`、`model_intent`。
- adapter 通过 `parseContentUnitEditPromptRefs()` 获取 refs。
- adapter 校验当前 type 的主 ref 数量和类型。
- adapter 解析 prompt 中的上游媒体 ref，并把已选择的 resource 放入 `runtime_request.inputs`。
- adapter 不把被引用实体 record 动态展开进 prompt。
- adapter 必须报告缺失依赖；有缺失依赖时 `runtimePanel.status = 'blocked'`。

### Adapter 合同

Adapter 应该只做解释，不做生成，也不直接写 workspace 文件。

建议统一成以下接口语义：

```ts
interface ContentUnitAdapter {
  type: 'asset_ref' | 'keyframe_ref' | 'storyboard_ref' | 'shot_ref' | string
  version: string
  outputKind: 'image' | 'video' | 'audio' | 'text' | 'metadata'

  validate(context: AdapterContext): ContentUnitIssue[]
  derivePrompt(context: AdapterContext): NormalizedContentUnitPrompt
  collectDependencies(
    context: AdapterContext,
    prompt: NormalizedContentUnitPrompt,
  ): ContentUnitDependencyReport
  deriveRuntimePanel(
    context: AdapterContext,
    derivation: {
      prompt: NormalizedContentUnitPrompt
      dependencies: ContentUnitDependencyReport
    },
  ): ContentUnitRuntimePanel
}
```

职责边界：

| 方法 | 负责 | 不负责 |
| --- | --- | --- |
| `validate()` | schema 级和 Adapter 级静态错误，例如主 ref 缺失、主 ref 多个、output_kind 不匹配 | 判断候选是否 stale |
| `derivePrompt()` | 生成当前规范化提示词，解析 refs，解释可用上游 selection | 创建 candidate |
| `collectDependencies()` | 输出诊断用依赖报告和 blockers | 生成 hash |
| `deriveRuntimePanel()` | 给前端和生成任务使用的运行视图 | 改写 prompt |

`derivePrompt()` 是新模型的核心。后续 stale 判断只比较它的输出和候选的 `prompt_snapshot`。

### Adapter 映射表

第一阶段只支持五种专用 Adapter：

| `content_unit_type` | Adapter | 主 ref kind | 默认输出 | 允许作为上游输入时的 resource kind |
| --- | --- | --- | --- | --- |
| `asset_ref` | `assetRefAdapter` | `asset` | `image` | `image` |
| `keyframe_ref` | `keyframeRefAdapter` | `keyframe` | `image` | `image` |
| `storyboard_ref` | `storyboardRefAdapter` | `storyboard` | `image` | `image` |
| `scence_moment_ref` | `sceneMomentRefAdapter` | `scene_moment` | `video` | `video` |
| `shot_ref` | `shotRefAdapter` | `shot` | `video` | `video` |

注意：这里的“允许作为上游输入”不是说当前 Adapter 必须消费自己，而是说其他内容单元引用该实体时，应该找到归属于该实体的对应 content unit，并使用它已选择候选的 `resource_id`。

例如 `shot_ref` prompt 写了 `{{storyboard:main}}`，解释器应该找到 `storyboard_ref + storyboard:main` 对应的 content unit，再读取它的 selection/resource，作为当前 shot 生成的 image input。

### 主 ref 和上游 input ref

同一种语法可以承担两类含义：

1. **主 ref**：由当前 `content_unit_type` 规定，表示本内容单元归属于哪个实体。
2. **上游 input ref**：表示生成当前内容时需要消费某个已经选择的资源。

示例：

```text
Create a rainy close-up for {{shot:phone}}.
Use the selected wet hair reference {{asset:wet_hair}}.
```

在 `shot_ref` 内容单元中：

- `{{shot:phone}}` 是主 ref。
- `{{asset:wet_hair}}` 是上游 input ref，需要解析到 `asset_ref + selection.resource_id`。

如果上游 input ref 没有 selected candidate，则当前内容单元不能生成。

### Ref 角色判定

角色判定必须由当前 content unit 的类型决定，而不是由 ref 的 kind 自己决定。

规则：

1. 先根据 `content_unit_type` 得到 `primaryRefKind`。
2. 解析 `edit_prompt` 得到所有 refs。
3. `ref.kind === primaryRefKind` 的 refs 是主 ref 候选。
4. 主 ref 必须恰好 1 个；0 个是 missing，多个是 ambiguous。
5. 其他 refs 默认都是上游 input ref。
6. 上游 input ref 必须解析到“同 kind 主 ref 的内容单元 + 当前 selection + resource_id”。

示例：

| 当前 type | Prompt ref | 角色 |
| --- | --- | --- |
| `asset_ref` | `{{asset:wet_hair}}` | 主 ref |
| `shot_ref` | `{{shot:phone}}` | 主 ref |
| `shot_ref` | `{{asset:wet_hair}}` | 上游 input ref |
| `shot_ref` | `{{storyboard:main}}` | 上游 input ref |
| `storyboard_ref` | `{{keyframe:scene_anchor}}` | 上游 input ref |

如果一个 `shot_ref` prompt 里出现两个 `{{shot:*}}`，不应解释为两个输入 shot，而应报主 ref ambiguous。需要多 shot 输入时，应新增明确语法或新增新的 content unit type，而不是复用第一阶段规则。

### 上游 content unit 查找规则

上游 input ref 不能直接消费源实体。它必须先映射到对应的 content unit。

查找规则：

| Prompt ref | 期望上游 content unit type | 匹配条件 |
| --- | --- | --- |
| `{{asset:id}}` | `asset_ref` | 上游 content unit 的主 ref 是同一个 `asset:id` |
| `{{keyframe:id}}` | `keyframe_ref` | 上游 content unit 的主 ref 是同一个 `keyframe:id` |
| `{{storyboard:id}}` | `storyboard_ref` | 上游 content unit 的主 ref 是同一个 `storyboard:id` |
| `{{shot:id}}` | `shot_ref` | 上游 content unit 的主 ref 是同一个 `shot:id` |

不能用源实体自己的候选、lock 或旧 inline candidate 直接替代 content unit selection。新的再生成语义以 content unit 为边界，只有 content unit 的已选候选才代表“这个引用当前可用于生成”。

### 缺失依赖和 Blocked 状态

只要存在硬依赖缺失，`runtime_panel.status` 必须是 `blocked`，生成任务不能推进。

建议 blockers 使用稳定 code：

| Code | 触发条件 | 是否阻塞生成 |
| --- | --- | --- |
| `primary_ref_missing` | 当前 type 需要的主 ref 不存在 | 是 |
| `primary_ref_ambiguous` | 当前 type 的主 ref 出现多个 | 是 |
| `ref_not_found` | prompt ref 无法解析到源实体 | 是 |
| `upstream_content_unit_not_found` | 上游 input ref 有源实体，但没有对应 content unit | 是 |
| `upstream_selection_missing` | 上游 content unit 在 decision context 中没有 selection | 是 |
| `upstream_candidate_missing` | 上游 selection 指向的候选不存在 | 是 |
| `upstream_selection_stale` | 上游 content unit selection 已过期 | 是 |
| `upstream_resource_missing` | selection 没有可用 `resource_id` | 是 |
| `prompt_dependency_cycle` | prompt refs 形成循环依赖 | 是 |

`validate()` 和 `derivePrompt()` 可以都报告 blocker，但最终写入 `runtime_panel.review.blockers` 和 `generation_prompt.blockers` 的结果应该去重。

上游 selection stale 的判断应复用同一套 `selectionValidityFor()` 逻辑。也就是说，下游 Adapter 不能只检查上游 decision context 是否存在 selection，还需要检查该 selection 指向的候选 `prompt_snapshot` 是否仍匹配上游 content unit 的当前规范化提示词。若上游已经 stale，下游也必须 blocked，因为它消费的 resource 不再代表上游的当前提示词版本。

为了避免循环依赖，解释器应维护本轮 prompt ref 解析栈。遇到 `asset_ref -> shot_ref -> asset_ref` 这类环时，应报告 `prompt_dependency_cycle` blocker，而不是递归到栈溢出。

### Runtime Request 构造规则

`runtime_request` 是给生成执行层使用的请求描述，不是 stale 判断的额外数据源。它必须完全由当前规范化提示词推导出来。

基础结构：

```ts
interface ContentUnitRuntimeRequest {
  capability: 'image' | 'video' | 'audio' | 'text' | 'metadata' | string
  inputs: Array<{
    role: 'asset_ref' | 'keyframe_ref' | 'storyboard_ref' | 'shot_ref' | string
    kind: 'image' | 'video' | 'audio' | 'text' | 'metadata'
    ref: string
    source_content_unit_ref: string
    candidate_id: string | number
    resource_id: string | number
    required: true
  }>
  params?: Record<string, unknown>
  metadata?: Record<string, unknown>
}
```

构造规则：

- `capability` 优先来自 `model_intent.capability`。
- 如果没有 `model_intent.capability`，则由 `output_kind` 推断。
- `inputs` 只包含已经解析到 selected candidate 和 `resource_id` 的上游 input refs。
- 缺失的 input refs 不应以空 input 写入，而应写入 `blockers`。
- 主 ref 不进入 `inputs`。
- `params` 来自 `model_intent.params`。
- 视频时长、比例等 provider 参数应放在 `model_intent` 或 `params`，不要从 shot/storyboard/keyframe record 动态派生。

### `asset_ref`

规则：

- `output_kind` 必须为 `image`。
- `edit_prompt` 中必须且只能出现 1 个 `{{asset:id}}`。
- adapter 可以校验 asset 是否存在，但不能把 asset record 动态展开到 prompt 文本。
- 对 `asset_ref` 自身而言，这个 `{{asset:id}}` 是主 ref，不要求该 asset 已有 selection。

生成输入：

- `edit_prompt`
- `model_intent`
- refs metadata

### `keyframe_ref`

规则：

- `output_kind` 必须为 `image`。
- `edit_prompt` 中必须且只能出现 1 个 `{{keyframe:id}}`。
- adapter 可以校验 keyframe 是否存在，但不能把 keyframe record 动态展开到 prompt 文本。
- 如果 prompt 额外引用了上游 media ref，例如 `{{asset:wet_hair}}`，则必须解析到已选择的上游 content unit resource，否则 blocked。

如果用户希望 keyframe 的视觉描述进入提示词，应在创建或更新 content unit 时把该描述复制到 `edit_prompt.text`。

### `storyboard_ref`

规则：

- `output_kind` 必须为 `image`。
- `edit_prompt` 中必须且只能出现 1 个 `{{storyboard:id}}`。
- adapter 可以校验 storyboard 是否存在，但不能把 storyboard record 动态展开到 prompt 文本。
- 如果 prompt 额外引用了上游 media ref，例如 `{{asset:wet_hair}}` 或 `{{keyframe:scene_anchor}}`，则必须解析到已选择的上游 content unit resource，否则 blocked。

### `shot_ref`

规则：

- `output_kind` 必须为 `video`。
- `edit_prompt` 中必须且只能出现 1 个 `{{shot:id}}`。
- adapter 可以校验 shot 是否存在，但不能把 shot record 动态展开到 prompt 文本。
- `shot_ref` 通常会消费上游分镜图、关键帧或 asset reference，例如 `{{storyboard:main}}`、`{{keyframe:scene_anchor}}`、`{{asset:wet_hair}}`。
- 这些上游 input refs 必须解析到已选择的上游 content unit resource，否则 blocked。

示例：

```json
{
  "schema": "movscript.content_unit.v1",
  "kind": "content_unit",
  "id": "cu_phone_shot",
  "title": "Phone close-up shot",
  "content_unit_type": "shot_ref",
  "output_kind": "video",
  "edit_prompt": {
    "text": "Generate the shot {{shot:phone}} using storyboard {{storyboard:main}} and visual reference {{asset:wet_hair}}.",
    "negative_text": "cartoon, jump cut"
  },
  "model_intent": {
    "capability": "video",
    "duration_sec": 4
  }
}
```

如果 `storyboard:main` 或 `asset:wet_hair` 对应的内容单元没有 selected candidate，`cu_phone_shot` 的 runtime request 必须 blocked。

## 候选记录

`content_candidate.json` 继续作为候选结果记录。

创建候选时必须复制完整规范化提示词：

```json
{
  "schema": "movscript.content_candidate.v1",
  "id": "candidate_video_1",
  "content_unit_ref": "content_units/cu_phone_shot",
  "source": "ai_generate",
  "status": "succeeded",
  "producer": {
    "kind": "runtime"
  },
  "outputs": [
    {
      "kind": "video",
      "resource_id": "resource_video_1",
      "duration_sec": 4
    }
  ],
  "prompt_snapshot": {
    "schema": "movscript.content_unit_prompt.v1",
    "content_unit_ref": "content_units/cu_phone_shot",
    "content_unit_type": "shot_ref",
    "output_kind": "video",
    "edit_prompt": {
      "text": "Create a slow push-in for {{shot:phone}} from selected storyboard {{storyboard:main}}.",
      "negative_text": "cartoon"
    },
    "model_intent": {
      "capability": "video",
      "duration_sec": 4
    },
    "refs": [
      {
        "kind": "shot",
        "id": "phone",
        "raw": "{{shot:phone}}"
      },
      {
        "kind": "storyboard",
        "id": "main",
        "raw": "{{storyboard:main}}"
      }
    ],
    "runtime_request": {
      "capability": "video",
      "inputs": [
        {
          "role": "storyboard_ref",
          "kind": "image",
          "source_content_unit_ref": "content_units/cu_storyboard_main_ref",
          "candidate_id": "candidate_storyboard_1",
          "resource_id": "resource_storyboard_1",
          "required": true
        }
      ],
      "metadata": {
        "duration_sec": 4
      }
    }
  },
  "created_at": "2026-06-07T00:03:00.000Z"
}
```

候选记录不再写入 `input_version`。

候选是否过期只由 `prompt_snapshot` 与当前规范化提示词比较得到。

## Selection Validity

后端 decision context 负责表达当前选择：

```json
{
  "schema": "movscript.decision_context.v1",
  "target_kind": "content_unit",
  "target_ref": "content_units/cu_phone_shot",
  "candidates": [],
  "selection": {
    "candidate_id": "candidate_video_1",
    "resource_id": "resource_video_1",
    "stale_policy": "strict",
    "reason": "selected",
    "selected_at": "2026-06-07T00:03:00.000Z"
  }
}
```

解释器计算 selection validity：

```ts
const stale = !deepEqual(
  canonicalPrompt(currentNormalizedPrompt),
  canonicalPrompt(selectedCandidate.prompt_snapshot),
)
```

输出建议升级为：

```ts
interface ContentUnitSelectionValidity {
  schema: 'movscript.content_unit_selection_validity.v2'
  content_unit_ref: string
  selected: boolean
  candidate_id?: string | number
  resource_id?: string | number
  stale: boolean
  stale_policy: 'strict' | 'accept_stale'
  reason?: string
  stale_reasons?: Array<
    | 'edit_prompt_changed'
    | 'model_intent_changed'
    | 'refs_changed'
    | 'runtime_inputs_changed'
    | 'candidate_missing'
    | 'candidate_prompt_missing'
    | 'prompt_dependency_missing'
  >
}
```

不再保留以下字段：

- `current_input_hash`
- `accepted_input_hash`

如果读取到旧项目中的这些字段，只能作为 migration input 使用，不能继续写入新的 derived artifact 或 selection。

### Canonical Prompt 比较规则

比较规则必须是字段级白名单，而不是简单比较整个 JSON。原因是 derived artifact 里可能有解释时间、adapter version 或诊断展示字段，这些字段不应该导致候选过期。

必须参与 stale 判断的字段：

| 字段 | 原因 |
| --- | --- |
| `content_unit_type` | 决定 Adapter 规则 |
| `output_kind` | 决定生成结果类型 |
| `edit_prompt.text` | 用户提示词主体 |
| `edit_prompt.negative_text` | 负向提示词 |
| `edit_prompt.notes` | 可进入生成说明的编辑备注 |
| `edit_prompt.structured` | 结构化提示词参数 |
| `model_intent` | 生成能力、参数和模型意图 |
| `refs[].kind/id/raw/role` | prompt 引用本身 |
| `refs[].resolved.entityKind/id/path` | 引用解析目标 |
| `refs[].selection.content_unit_ref/candidate_id/resource_id` | 上游选择状态 |
| `runtime_request.capability/inputs/params/metadata` | 最终生成请求 |
| `blockers[].code/ref` | 当前 prompt 是否可推导 |

不参与 stale 判断的字段：

| 字段 | 原因 |
| --- | --- |
| `schema` | 版本兼容字段，比较函数可以内部处理 |
| `adapter_version` | Adapter 实现升级不应自动让所有候选过期，除非输出字段真的变化 |
| `created_at` | 解释时间 |
| blocker `message` | 展示文本变化不应导致 stale |
| relation graph / impact report 字段 | 诊断产物，不是生成输入 |

建议实现：

```ts
function canonicalContentUnitPrompt(prompt: NormalizedContentUnitPrompt): unknown {
  return {
    content_unit_type: prompt.content_unit_type,
    output_kind: prompt.output_kind,
    edit_prompt: canonicalJson(prompt.edit_prompt),
    model_intent: canonicalJson(prompt.model_intent),
    refs: prompt.refs.map((ref) => ({
      kind: ref.kind,
      id: String(ref.id),
      raw: ref.raw,
      role: ref.role,
      resolved: ref.resolved && {
        entityKind: ref.resolved.entityKind,
        id: String(ref.resolved.id),
        path: ref.resolved.path,
      },
      selection: ref.selection && {
        content_unit_ref: ref.selection.content_unit_ref,
        candidate_id: String(ref.selection.candidate_id),
        resource_id: String(ref.selection.resource_id),
      },
    })),
    runtime_request: canonicalJson(prompt.runtime_request),
    blockers: (prompt.blockers ?? []).map((blocker) => ({
      code: blocker.code,
      ref: blocker.ref,
    })),
  }
}
```

`canonicalJson()` 需要稳定排序 object keys。数组顺序按 prompt 出现顺序保留，因为 prompt 顺序可能表达用户意图。

### Stale Reason 推断

`stale_reasons` 不需要追求最小 diff，但需要能指导前端和重新生成队列。

建议 reason：

| Reason | 触发条件 |
| --- | --- |
| `edit_prompt_changed` | `edit_prompt` canonical 值不同 |
| `model_intent_changed` | `model_intent` canonical 值不同 |
| `refs_changed` | refs 的 kind/id/raw/role/resolved 不同 |
| `runtime_inputs_changed` | 上游 selection 变化导致 `runtime_request.inputs` 不同 |
| `candidate_prompt_missing` | 旧候选没有 `prompt_snapshot` |
| `prompt_dependency_missing` | 当前 prompt 有 blocker，候选生成时没有，或 blocker 集合变化 |

注意：源实体 record 的普通字段变化不能直接生成 stale reason。比如 asset 的 `description`、keyframe 的 `visual_intent`、storyboard 的 `caption` 变化，都不会让下游 stale，除非这些变化先被用户写入对应 content unit 的 `edit_prompt`，或导致对应 content unit selection 发生变化。

## Package 改造点

### `@movscript/language`

文件：

- `packages/language/src/domain/schemas.ts`

改造：

- 更新 `contentUnitEntitySchema`。
- 删除 content unit 顶层 ref 字段。
- 明确 `edit_prompt` schema。
- 更新 `promptSummary` 和 examples。

### `@movscript/workspace`

文件：

- `packages/workspace/src/repository/contentUnits.ts`
- `packages/workspace/src/repository/contentUnitPrompt.ts`
- `packages/workspace/src/repository/contentCandidates.ts`
- `packages/workspace/src/service.ts`
- `packages/workspace/src/domain/models.ts`

改造：

- `upsertMovScriptContentUnit()` 不再写入 legacy 顶层 ref 字段。
- `updateMovScriptContentUnitEditPrompt()` 保持只更新 `edit_prompt`，但接受新的结构。
- `createContentCandidate()` 从 derived artifact 读取规范化提示词，并写入候选 `prompt_snapshot`。
- `selectContentUnitCandidate()` 不再读取或写入 `accepted_input_hash`。
- domain model instructions 改为“content unit 通过 edit_prompt 引用语法声明 ref”。

### `@movscript/interpreter`

文件：

- `packages/interpreter/src/artifacts/contentProductionTypes.ts`
- `packages/interpreter/src/artifacts/contentProductionHelpers.ts`
- `packages/interpreter/src/artifacts/contentProductionAdapters.ts`
- `packages/interpreter/src/artifacts/contentProduction.ts`
- `packages/interpreter/src/sourceValidation/index.ts`
- `packages/interpreter/src/artifacts/relationGraph.ts`
- `packages/interpreter/src/artifacts/impactReport.ts`
- `packages/interpreter/src/node/debugArtifacts.ts`

改造：

- 新增 `parseContentUnitEditPromptRefs()`。
- adapter 从解析结果读取 ref，不再读取 content unit 顶层 ref 字段。
- 删除 `collectHashInputs()` 作为 stale 判断核心。
- 构造 `NormalizedContentUnitPrompt`。
- `selectionValidityFor()` 改为比较当前 normalized prompt 和候选 `prompt_snapshot`。
- `dependency_report` 可以继续保留，但语义改为 diagnostic/report，不再作为 hash 输入报告。
- `dependency_report` 必须报告 prompt ref 的缺失依赖，例如上游 asset/storyboard/keyframe/shot 没有可用 selection。
- relation graph 可以继续展示引用关系，但引用来源改为 `edit_prompt` refs。
- impact report 不再把普通实体变化解释为 content unit stale 来源。
- `debugArtifacts` 写出 normalized prompt artifact。

### `@movscript/decision`

当前 decision 包只处理普通候选选择记录。可以新增纯函数，降低 interpreter/workspace 互相耦合：

```ts
parseContentUnitPromptRefs(text: string): ContentUnitPromptRef[]
canonicalContentUnitPrompt(prompt: unknown): unknown
compareContentUnitPromptSnapshot(current: unknown, snapshot: unknown): ContentUnitPromptComparison
```

如果不想让 decision 包承担 prompt 语法，也可以放在 interpreter 内部。关键是比较逻辑必须是纯函数，并有独立测试。

### `@movscript/engine` 和 MCP tools

文件：

- `packages/engine/src/index.ts`
- `packages/core/src/mcp/tools/domain/definitions.ts`
- `packages/core/src/mcp/node/tools/domain/actions.ts`

改造：

- `createContentUnit()` / `updateContentUnit()` 不再接受 `assetRef`、`storyboardId`、`shotId` 等旧字段作为 content unit 顶层字段。
- 如果保留高级便捷参数，应把它们转换为 `edit_prompt` 引用语法，而不是写入顶层 ref。
- MCP tool 描述要明确：content unit refs 写在 `edit_prompt` 中。
- `domain_create_content_candidate` 描述改为复制 normalized content unit prompt snapshot。
- `domain_select_content_unit_candidate` schema 和描述移除 `accepted_input_hash`。

## 迁移顺序

### Phase 1: 引入解析能力，不删除旧字段

- 新增 `parseContentUnitEditPromptRefs()`。
- adapter 优先读 `edit_prompt` refs。
- 如果没有 refs，临时 fallback 到旧顶层 ref 字段。
- 写出 normalized prompt artifact。
- 候选开始写新的 `prompt_snapshot`。
- selection 写入停止包含 `accepted_input_hash`。

### Phase 2: stale 判断切换

- `selectionValidityFor()` 改为 prompt snapshot comparison。
- derived artifact 停止写入 `current_input_hash`。
- 更新 regeneration plan 统计来源。
- 修改测试：实体字段变化不再导致 stale，content unit prompt 变化才 stale。
- 修改测试：上游 prompt ref 没有 selected candidate 时 runtime request blocked。

### Phase 3: schema 和 writer 收敛

- `contentUnitEntitySchema` 删除旧顶层 ref 字段。
- `upsertMovScriptContentUnit()` 停止写旧字段。
- engine/MCP 入口停止暴露旧字段，或只做转换。
- source validation 对旧字段给 warning 或 migration issue。

### Phase 4: 清理 hash 设计

- 删除 `collectHashInputs()`、`ContentUnitHashInput`、`hash_rule`、`input_version`、`current_input_hash`、`accepted_input_hash` 的写入路径。
- 旧项目读取时只做迁移转换，不再把 hash 字段带入新产物。
- 更新 demo 数据和集成测试。

## 测试策略

需要覆盖以下行为：

1. `edit_prompt` 能解析 `{{asset:wet_hair}}`、`{{keyframe:scene_anchor}}`、`{{storyboard:main}}`。
2. `asset_ref` 中没有 asset ref 时 blocked。
3. `asset_ref` 中有两个 asset ref 时 validation error。
4. 修改 asset 实体字段不会让引用它的 content unit selection stale。
5. 修改 content unit `edit_prompt.text` 会让已选候选 stale。
6. 修改 content unit `model_intent` 会让已选候选 stale。
7. 创建候选会复制 normalized prompt 到 `prompt_snapshot`。
8. 选择候选不写入 `accepted_input_hash`。
9. 上游 content unit selection 的 `resource_id` 变化会让引用它的下游 content unit stale。
10. relation graph 仍能从 `edit_prompt` refs 生成可视化引用关系。
11. prompt 写了 `{{asset:id}}` 作为上游 input，但对应 asset_ref 内容单元没有 selected candidate 时，当前内容单元 blocked。
12. prompt 写了 `{{storyboard:id}}` 作为上游 input，但对应 storyboard_ref 内容单元没有 selected candidate 时，当前内容单元 blocked。

## 兼容性规则

旧数据示例：

```json
{
  "content_unit_type": "asset_ref",
  "asset_ref": "wet_hair",
  "edit_prompt": {
    "text": "Create the visual reference."
  }
}
```

迁移后：

```json
{
  "content_unit_type": "asset_ref",
  "edit_prompt": {
    "text": "Create the visual reference from {{asset:wet_hair}}."
  }
}
```

迁移工具可以做机械转换：

| 旧字段 | 新文本追加 |
| --- | --- |
| `asset_ref: "x"` | `{{asset:x}}` |
| `keyframe_ref: "x"` | `{{keyframe:x}}` |
| `storyboard_ref: ".../storyboards/main"` | `{{storyboard:main}}` |

数组字段如 `keyframe_refs` 不建议自动保留为同一 type 下的多个 ref，除非对应 `content_unit_type` 明确允许多引用。否则迁移工具应输出 warning，让用户选择新的 content unit 类型。

## 最终语义

重构完成后，重新生成判断可以简化为：

```text
content_unit.json
  -> parse edit_prompt refs
  -> normalize prompt
  -> create candidate copies normalized prompt
  -> selected candidate prompt_snapshot compared with current normalized prompt
  -> stale or fresh
```

不会再出现“实体记录普通变化导致下游自动过期”的隐式传播。

内容单元成为稳定、可编辑、可复制、可比较的提示词实体。
