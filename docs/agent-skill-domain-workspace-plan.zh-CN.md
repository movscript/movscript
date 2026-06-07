# MovScript Agent Skill 与领域工作区整理方案

本文用于对齐 MovScript plugin 给 agent 暴露的 skill、MCP server 名称、工具名前缀，以及领域工作区编辑流程。目标不是描述最终产品功能，而是给接下来的实现提供一个可执行的整理方向。

## 背景

core 已经加入领域工作区概念。agent 不再需要通过旧的 projection / semantic apply 语义间接提交业务变更，而是可以直接编辑项目 Git workspace 中的领域 source 文件，然后通过 review / build 让系统检查并生成当前有效状态。

当前 plugin skill 仍有几个历史痕迹：

- MCP server 名叫 `movscript_workspace`，导致 Codex 侧工具全名变成 `mcp__movscript_workspace__...`。这个名字把整个 MovScript plugin 误收窄成 workspace 工具。
- 工具名里混用了 `generation_*`、`movscript_resource_*`、`movscript_workspace_*`。agent 不容易从前缀判断这是系统能力、资源能力，还是领域模型编辑能力。
- 现有 `workspace` skill 只说明了 review / build，但没有系统说明领域模型之间的依赖关系，也没有强调“完成用户需求后必须 build，让用户看到本次改动”。
- `generation` skill 还承担了一部分领域候选挂载、workspace edit 的说明，职责偏宽。

## 目标

整理后的 agent contract 应满足这些判断：

- plugin / MCP server 的顶层名字叫 `movscript`，不叫 `movscript_workspace`。
- 工具名前缀表达职责边界。领域工作区能力与系统级能力要能从名字上区分。
- 新增 `domain` skill，专门告诉 agent 如何编辑 MovScript 领域模型、实体依赖关系是什么、如何 review、如何 build。
- `domain` 不只包含对象含义，也包含对象的文件存储结构和可用 API。agent 需要知道“这个对象是什么”“它存在哪里”“应该通过什么 API 或文件编辑方式修改”。
- 领域工具不应只有 `domain_get_model`、`domain_review`、`domain_build`。这些是通用入口和收尾工具，还需要补充面向对象的查询、读取、写入、候选、提示词和 production planning API。
- agent 有两种合法处理方式：优先使用结构化 domain API；当 API 尚未覆盖或用户要求精确文件修改时，再直接编辑 `domain_get_model` 返回的 source 文件。
- 每次 agent 完成会改变项目业务状态的用户需求后，都要执行 build。build 成功后，用户才能在 UI 中看到本次有效改动。
- review 是检查，不是提交；build 是把 source 编译成 `.build/current` 和索引，让 UI / 用户看到当前有效状态。

## Domain 的范围

`domain` 应同时描述三件事：

```text
Domain Object
  1. 对象含义：它在影视制作语义中代表什么，和其他对象是什么关系。
  2. 存储方式：它在项目 Git workspace 中保存在哪些目录和 JSON / Markdown 文件里。
  3. API 表面：agent 可以通过哪些结构化工具查询、创建、更新、删除或编译它。
```

这三者都属于 domain contract。不能只写对象含义，也不能只写文件路径。否则 agent 会知道“SceneMoment 是场景时刻”，但不知道它应该改 `scene_moment.json`、调用 timing API，还是只读 `.build/current`。

core 当前已经按这个方向拆层：

- `packages/core/src/workspace/domain/schemaTypes.ts`：定义 `SemanticEntityKind` 和 `WorkspaceKind`。
- `packages/core/src/workspace/domain/schemas.ts`：定义对象含义、schema id、字段、prompt summary 和示例。
- `packages/core/src/workspace/domain/models.ts`：定义 `WorkspaceKind -> SemanticEntityKind` 映射、可编辑路径、上下文路径和编辑指令。
- `packages/core/src/workspace/repository/*`：定义结构化读写函数，例如 upsert setting / asset / content unit、更新 storyboard timing / shot plans、候选写入和锁定。
- `packages/core/src/workspace/service.ts`：把 repository 组合成更稳定的领域 API 服务。
- `packages/core/src/workspace/node/build.ts` 和 `packages/core/src/workspace/node/service.ts`：提供 review / build 和 Node 文件系统实现。

因此 skill 应把 `domain` 解释成“领域对象 + 文件布局 + API 工作流”的整体，而不是单纯的 workspace review/build 说明。

## 命名方案

### MCP server 名称

将 plugin 的 MCP server key 从：

```json
"movscript_workspace"
```

改为：

```json
"movscript"
```

这样 Codex 侧工具授权和调用名会从：

```text
mcp__movscript_workspace__movscript_workspace_build
```

变成：

```text
mcp__movscript__domain_build
```

这更符合用户理解：agent 使用的是 MovScript 能力，不是一个叫 workspace 的子系统。

兼容策略建议分两步：

1. 在一个版本内同时保留旧 server key 或旧工具别名，只在 skill 中使用新名字。
2. 确认 provider 缓存、插件安装、工具授权都完成迁移后，再移除旧别名。

### 工具名前缀

工具名建议按两类前缀组织：

```text
domain_*    领域模型和项目业务 source 的编辑、检查、构建
system_*    系统级能力：生成、资源库、媒体读取、外部检索、当前焦点等
```

`domain_*` 表达“会理解或改变 MovScript 项目领域模型”。例如：

```text
domain_get_model
domain_query_entities
domain_query_settings
domain_query_assets
domain_query_production_context
domain_compile_content_generation_prompt
domain_read_preview_timeline
domain_read_content_generation_prompt
domain_upsert_project_standards
domain_upsert_setting
domain_upsert_asset
domain_upsert_script
domain_read_script_source
domain_snapshot_script_version
domain_upsert_content_unit
domain_update_content_unit_prompt
domain_update_scene_moment_timing
domain_update_storyboard_shot_plans
domain_append_candidate
domain_select_candidate
domain_update_candidate
domain_unlock_candidate
domain_delete_entity
domain_review
domain_build
```

`system_*` 表达“MovScript 系统提供的运行态能力或外部能力”，不直接等同业务领域 source。例如：

```text
system_focus_get
system_project_create

system_model_list
system_generate_image
system_generate_image_job_get
system_generate_video
system_generate_video_job_get

system_resource_library_query
system_resource_image_read
system_resource_video_extract_frames
system_resource_image_annotate
system_resource_upload

system_shot_library_query
system_external_resource_source_list
system_external_resource_search
```

这里的关键点是：`resource` 不是领域模型本体。RawResource、外部素材、媒体读取、图片标注、上传都属于系统级素材与运行态能力，所以放在 `system_resource_*` 下。领域实体里的 `asset.json`、`keyframe.json`、`content_unit.json` 可以引用 `resource_id`，但不拥有资源二进制，也不保存生成 job 的运行态细节。

### 当前工具到目标工具的映射

| 当前工具 | 目标工具 | 说明 |
| --- | --- | --- |
| `movscript_workspace_get_model` | `domain_get_model` | 返回领域实体的 workspace 模型、可编辑路径、上下文路径、schema 和编辑说明 |
| `movscript_workspace_review` | `domain_review` | 检查 source 与 `.build/current` 的差异、schema 问题和领域引用问题 |
| `movscript_workspace_build` | `domain_build` | 编译 source，写入 `.build/current`、`.build/indexes`、`.build/manifests` |
| service `queryEntities` | `domain_query_entities` | 从领域索引中按 entity kind / id / path 查询对象 |
| service `querySettings` | `domain_query_settings` | 查询角色、地点、道具、世界规则等 setting |
| service `queryAssets` | `domain_query_assets` | 查询 setting-owned / setting-state-owned asset slots |
| service `queryProductionContext` | `domain_query_production_context` | 查询 production 上下文，例如 segment、scene moment、storyboard、content unit 关系 |
| service `compileContentGenerationPrompt` | `domain_compile_content_generation_prompt` | 为 content unit 编译生成提示词上下文和引用资源 |
| service `readPreviewTimeline` | `domain_read_preview_timeline` | 读取 build 后的 production 预览时间线，只读 |
| service `readContentGenerationPrompt` | `domain_read_content_generation_prompt` | 读取 build 后的 content unit generation prompt，只读 |
| service `upsertProjectStandards` | `domain_upsert_project_standards` | 创建或更新项目级创作标准 |
| service `upsertSetting` | `domain_upsert_setting` | 创建或更新 setting |
| service `upsertAsset` | `domain_upsert_asset` | 创建或更新 setting / setting state 下的 asset slot |
| service `upsertScript` | `domain_upsert_script` | 创建或更新 script source |
| service `readScriptSource` | `domain_read_script_source` | 读取 script 文本 |
| service `snapshotScriptVersionFromMarkdown` | `domain_snapshot_script_version` | 从 Markdown 剧本生成 script version / script block snapshot |
| service `upsertContentUnit` | `domain_upsert_content_unit` | 创建或更新 content unit 和附属 keyframes |
| service `updateContentUnitEditablePrompt` | `domain_update_content_unit_prompt` | 更新 content unit 的 editable prompt |
| service `updateSceneMomentStoryboardTiming` | `domain_update_scene_moment_timing` | 更新 scene moment 的 storyboard_timing、audio、transition |
| service `updateStoryboardShotPlans` | `domain_update_storyboard_shot_plans` | 更新 storyboard 的 shot_plans |
| service `appendCandidate` | `domain_append_candidate` | 给 asset / keyframe / content unit 追加 inline candidate |
| service `selectCandidate` | `domain_select_candidate` | 锁定候选并写入 lock |
| service `updateCandidate` | `domain_update_candidate` | 更新候选状态、说明或 metadata |
| service `unlockCandidate` | `domain_unlock_candidate` | 解除候选锁定 |
| service `deleteEntity` | `domain_delete_entity` | 删除领域 source entity |
| `movscript_focus_get` | `system_focus_get` | 当前 UI / 项目 / production / entity 焦点 |
| `movscript_project_create` | `system_project_create` | 系统级创建项目写操作 |
| `generation_model_list` | `system_model_list` | 生成模型发现 |
| `generation_image_generate` | `system_generate_image` | 图片生成 |
| `generation_image_job_get` | `system_generate_image_job_get` | 图片生成 job 轮询 |
| `generation_video_generate` | `system_generate_video` | 视频生成 |
| `generation_video_job_get` | `system_generate_video_job_get` | 视频生成 job 轮询 |
| `movscript_resource_library_query` | `system_resource_library_query` | RawResource 查询 |
| `movscript_resource_image_read` | `system_resource_image_read` | 图片 RawResource 像素读取 |
| `movscript_resource_video_extract_frames` | `system_resource_video_extract_frames` | 视频 RawResource 抽帧 |
| `movscript_resource_image_annotate` | `system_resource_image_annotate` | 创建 agent 视觉指导图 |
| `movscript_resource_upload` | `system_resource_upload` | 上传 agent 产物为 RawResource |
| `movscript_shot_library_query` | `system_shot_library_query` | shot reference 检索 |
| `movscript_external_resource_source_list` | `system_external_resource_source_list` | 外部素材源列表 |
| `movscript_external_resource_search` | `system_external_resource_search` | 外部素材检索 |

## Skill 结构

建议整理为以下 skills：

```text
plugins/movscript/skills/
  project/SKILL.md
  domain/SKILL.md
  generation/SKILL.md
```

可以删除或废弃现有 `workspace/SKILL.md`，将它的核心内容迁移到 `domain/SKILL.md`。`workspace` 这个词仍可在正文中描述文件系统工作区，但 skill 名称应使用业务含义更明确的 `domain`。

### `project` skill

职责：

- 获取当前 MovScript 焦点。
- 创建项目。
- 告诉 agent 项目上下文来自本地 Git workspace 和 `.build/` 当前状态。

工具授权建议：

```yaml
toolGrants:
  - mcp__movscript__system_focus_get
  - mcp__movscript__system_project_create
  - mcp__movscript__domain_get_model
```

### `domain` skill

职责：

- 领域模型编辑入口。
- 解释 WorkspaceKind、SemanticEntityKind、文件路径、依赖关系和 API。
- 规定 edit / review / build 的顺序。
- 规定 API 优先、文件编辑兜底的决策方式。
- 强制领域变更完成后 build。

工具授权建议：

```yaml
toolGrants:
  - mcp__movscript__system_focus_get
  - mcp__movscript__domain_get_model
  - mcp__movscript__domain_query_entities
  - mcp__movscript__domain_query_settings
  - mcp__movscript__domain_query_assets
  - mcp__movscript__domain_query_production_context
  - mcp__movscript__domain_compile_content_generation_prompt
  - mcp__movscript__domain_read_preview_timeline
  - mcp__movscript__domain_read_content_generation_prompt
  - mcp__movscript__domain_upsert_project_standards
  - mcp__movscript__domain_upsert_setting
  - mcp__movscript__domain_upsert_asset
  - mcp__movscript__domain_upsert_script
  - mcp__movscript__domain_read_script_source
  - mcp__movscript__domain_snapshot_script_version
  - mcp__movscript__domain_upsert_content_unit
  - mcp__movscript__domain_update_content_unit_prompt
  - mcp__movscript__domain_update_scene_moment_timing
  - mcp__movscript__domain_update_storyboard_shot_plans
  - mcp__movscript__domain_append_candidate
  - mcp__movscript__domain_select_candidate
  - mcp__movscript__domain_update_candidate
  - mcp__movscript__domain_unlock_candidate
  - mcp__movscript__domain_delete_entity
  - mcp__movscript__domain_review
  - mcp__movscript__domain_build
```

`domain` skill 应触发的用户请求包括：

- 编辑项目设定、角色、地点、道具、项目标准。
- 编辑剧本、脚本 block、production、segment、scene moment、storyboard。
- 编辑 content unit、keyframe、asset 候选或锁定状态。
- 要求 agent “改一下项目”“补齐分镜”“整理制作结构”“把生成结果挂到资产 / keyframe / content unit 上”。
- 任何需要让 UI 看到业务状态变化的请求。

### `generation` skill

职责：

- 模型发现、图片 / 视频生成、job 轮询。
- 查询或读取 RawResource。
- 查询 shot reference 和外部素材。
- 在生成产物需要写回领域实体时，明确切换到 `domain` 工作流。

工具授权建议：

```yaml
toolGrants:
  - mcp__movscript__system_focus_get
  - mcp__movscript__system_model_list
  - mcp__movscript__system_generate_image
  - mcp__movscript__system_generate_image_job_get
  - mcp__movscript__system_generate_video
  - mcp__movscript__system_generate_video_job_get
  - mcp__movscript__system_resource_library_query
  - mcp__movscript__system_resource_image_read
  - mcp__movscript__system_resource_video_extract_frames
  - mcp__movscript__system_resource_image_annotate
  - mcp__movscript__system_resource_upload
  - mcp__movscript__system_shot_library_query
  - mcp__movscript__system_external_resource_source_list
  - mcp__movscript__system_external_resource_search
  - mcp__movscript__domain_get_model
  - mcp__movscript__domain_review
  - mcp__movscript__domain_build
```

## `domain` Skill 应写入的核心内容

`domain/SKILL.md` 应保持短，但必须包含以下规则。

### 基本模型

MovScript project workspace 是项目 Git repository。domain 包含对象语义、存储结构和 API。agent 处理领域对象时必须同时考虑这三层：

```text
SemanticEntityKind  定义对象是什么，例如 setting、scene_moment、content_unit。
WorkspaceKind       定义对象处在哪个业务目录上下文，例如 scene_moment_workspace。
Domain API          定义对象应该如何被结构化查询、写入、检查和构建。
```

业务 source 文件直接位于项目根下的领域目录中，例如：

```text
project.json
project_standards.json
settings/
scripts/
content_units/
productions/
.build/
```

agent 可以编辑 source 文件，但不能直接编辑 `.build/`。`.build/current`、`.build/indexes`、`.build/manifests` 是 build 产物。

`WorkspaceKind` 表达当前业务上下文和目录边界；`SemanticEntityKind` 表达具体 JSON 文件的领域实体类型。agent 不应发明新路径，应先调用 `domain_get_model` 获取可编辑路径、上下文路径、schema id 和编辑指令。

### 对象说明格式

`domain` skill 或其引用文档应按统一格式描述每个对象：

```text
对象含义
  这个实体在制作语义中代表什么，和父子 / 引用对象是什么关系。

存储方式
  canonical source path、可编辑 JSON / Markdown 文件、是否有子目录、哪些字段保存顺序或引用。

API
  优先使用哪些 domain_* 工具读取或修改；API 不覆盖时如何通过 domain_get_model 直接编辑文件。
```

例如：

```text
scene_moment
  对象含义：segment 内的场景时刻，描述何时、何地、行动、情绪和 storyboard timing。
  存储方式：productions/{productionId}/segments/{segmentId}/scene_moments/{sceneMomentId}/scene_moment.json。
  API：查询用 domain_query_production_context 或 domain_query_entities；更新 timing 用 domain_update_scene_moment_timing；其他字段 API 未覆盖时用 domain_get_model 后直接编辑 scene_moment.json。
```

### 领域依赖关系

skill 中应提供一段简洁关系图：

```text
project
  project_standards
  setting
    setting_state
      asset
    asset
  script
    script_version
      script_block
  content_unit
    keyframe
  production
    segment
      scene_moment
        keyframe
        storyboard
          writing_expression
```

核心约束：

- `project_standards` 是项目级创作标准，影响 production、storyboard、content unit 和生成上下文。
- `setting` 描述角色、地点、道具、世界规则等事实。
- `setting_state` 描述 setting 的条件状态，例如湿发、受损道具、雨夜地点。
- `asset` 只属于 setting 或 setting_state，用 `resource_id` 引用系统 RawResource。
- `script`、`script_version`、`script_block` 提供文本事实源和可引用文本片段。
- `production` 是可制作单元根，可以是一集、短片或视频版本。
- `segment` 是 production 内的节奏段，表达情绪 / 戏剧功能和顺序。
- `scene_moment` 是 segment 内的场景时刻，表达何时、何地、谁在做什么、情绪和 storyboard timing。
- `storyboard` 是 scene moment 下的导演规划，包含 setting refs、shot plans、coverage、continuity、panels 等。
- `writing_expression` 是 storyboard 下的台词、旁白、字幕、caption 或文字表达。
- `content_unit` 是项目级稳定生产单位，通过 `source_context` 引用 scene moment / storyboard，但不是 storyboard 的子实体。
- `keyframe` 是视觉锚点，可属于 scene moment 或 content unit，二者使用同一 schema。
- `preview_timeline` 是 build 产物，不是 source，不由 agent 直接编辑。

### 存储结构

domain 包括文件存储结构。agent 需要把路径当作领域 contract，而不是实现细节。当前主要 source layout：

```text
project.json
project_standards.json
settings/{settingId}/setting.json
settings/{settingId}/states/{settingStateId}/setting_state.json
settings/{settingId}/assets/{assetId}/asset.json
settings/{settingId}/states/{settingStateId}/assets/{assetId}/asset.json
scripts/{scriptId}/script.json
scripts/{scriptId}/script.md
scripts/{scriptId}/versions/{scriptVersionId}/script_version.json
scripts/{scriptId}/versions/{scriptVersionId}/blocks/{scriptBlockId}/script_block.json
productions/{productionId}/production.json
productions/{productionId}/segments/{segmentId}/segment.json
productions/{productionId}/segments/{segmentId}/scene_moments/{sceneMomentId}/scene_moment.json
productions/{productionId}/segments/{segmentId}/scene_moments/{sceneMomentId}/keyframes/{keyframeId}/keyframe.json
productions/{productionId}/segments/{segmentId}/scene_moments/{sceneMomentId}/storyboards/{storyboardId}/storyboard.json
productions/{productionId}/segments/{segmentId}/scene_moments/{sceneMomentId}/storyboards/{storyboardId}/writing_expressions/{writingExpressionId}/writing_expression.json
content_units/{contentUnitId}/content_unit.json
content_units/{contentUnitId}/keyframes/{keyframeId}/keyframe.json
```

build artifacts are not source:

```text
.build/current/**
.build/indexes/**
.build/manifests/**
```

关键规则：

- 目录 id 是稳定定位，不承载标题、排序或叙事语义。
- 顺序写在 JSON 字段里，例如 `segment.order`、`scene_moment.order`、`storyboard_timing.items[].order`、`shot_plans[].order`。
- 引用使用稳定 id、source path 或 `resource_id`，不要写二进制或运行态 job 状态。
- `.build/current` 是 UI 读取的当前有效状态，agent 不直接编辑。

### Domain API

`domain_get_model`、`domain_review`、`domain_build` 是通用 API，但不是全部 API。面向 agent 的 domain API 应至少分为这些组：

```text
Discovery / Read
  domain_get_model
  domain_query_entities
  domain_query_settings
  domain_query_assets
  domain_query_production_context
  domain_read_script_source
  domain_read_preview_timeline
  domain_read_content_generation_prompt

Write / Upsert
  domain_upsert_project_standards
  domain_upsert_setting
  domain_upsert_asset
  domain_upsert_script
  domain_snapshot_script_version
  domain_upsert_content_unit
  domain_update_content_unit_prompt
  domain_update_scene_moment_timing
  domain_update_storyboard_shot_plans
  domain_delete_entity

Candidates / Locks
  domain_append_candidate
  domain_select_candidate
  domain_update_candidate
  domain_unlock_candidate

Compile / Validate
  domain_compile_content_generation_prompt
  domain_review
  domain_build
```

API 设计原则：

- API 是结构化领域操作，应该负责路径归一化、schema/kind 设置、常见字段规范化和局部更新。
- API 写入 source 文件，不绕过 review / build。
- API 成功不代表用户已看到最终状态；仍需要 `domain_review` 和 `domain_build`。
- 直接文件编辑是 API 的补充，不是废弃路径。复杂批量重排、新 schema 试验、API 未覆盖字段、用户明确要求改文件时，agent 可以直接编辑 source。

### API 与文件编辑的选择

agent 处理领域任务时有两条路径。

优先路径：结构化 API。

```text
system_focus_get -> domain query/read -> domain write API -> domain_review -> domain_build
```

适用场景：

- 创建或更新 setting、asset、script、content unit。
- 更新 content unit editable prompt。
- 更新 scene moment storyboard timing。
- 更新 storyboard shot plans。
- 给 asset / keyframe / content unit 写入候选、选择候选或解除锁定。
- 读取 build 后的 preview timeline 或 generation prompt。

兜底路径：直接编辑文件。

```text
system_focus_get -> domain_get_model -> read context paths -> edit source files -> domain_review -> domain_build
```

适用场景：

- 目标字段没有对应 API。
- 需要跨多个对象做结构性编辑，单个 API 会过于绕。
- 用户明确要求编辑某个文件。
- agent 需要创建尚未被 API 封装的新对象层级。

直接编辑文件时仍然必须遵守 domain model：先用 `domain_get_model` 确认目标 entity kind、路径、schema 和指令；不要发明 `.build/` 修改；不要把系统资源二进制或 job runtime 写进业务 JSON。

### 编辑工作流

每次领域编辑遵循：

```text
focus/context -> domain API or domain_get_model + file edits -> domain_review -> fix issues -> domain_build
```

具体要求：

1. 如果请求依赖当前项目、production 或选中实体，先调用 `system_focus_get`。
2. 先判断是否已有合适的 domain API。若有，优先调用 API。
3. 如果没有合适 API，针对要编辑的实体调用 `domain_get_model`，读取返回的 `editablePaths`、`contextPaths`、`schemaIds` 和 `instructions`，然后直接编辑 source 文件。
4. 只写 source 文件，不直接改 `.build/`。
5. 编辑或 API 写入后调用 `domain_review`。review 只检查差异和问题，不让 UI 进入新状态。
6. 如果 review 报 schema、路径、引用、领域关系问题，先修复 source，再重新 review。
7. review ready 后调用 `domain_build`。build 成功后，本次 source 变更才成为 `.build/current` 中的有效状态，用户才能看到。
8. 如果用户请求只读分析，不产生业务变更，可以不 build；但最终回复应说明没有写入变更。

### 完成条件

agent 不能把“文件已编辑”当作完成。对领域变更而言，完成条件是：

- source 文件已按领域模型修改；
- `domain_review` 无阻塞问题；
- `domain_build` 成功；
- 最终回复中说明 build 已完成，必要时概述 changed entities。

如果 build 失败，agent 应继续修复能修复的问题。只有在缺少用户决策、缺少外部资源或工具不可用时，才把失败原因反馈给用户。

## 与生成工作流的关系

生成本身是系统能力：

```text
system_model_list
system_generate_image
system_generate_video
system_*_job_get
```

生成输入中的 `input_resource_ids` / `reference_resource_ids` 只能使用 MovScript RawResource ID。RawResource 来自：

- `system_resource_library_query`
- `system_resource_upload`
- 生成 job 返回的 `output_resource_id` / `output_resource_ids`

当生成结果需要进入项目业务状态时，必须转入领域工作流。例如：

```text
生成图片 -> 获得 output_resource_id -> 编辑 asset/keyframe/content_unit 的 candidates 或 lock -> domain_review -> domain_build
```

不应把生成 job 状态、外部素材 URL、图片二进制直接写入领域 JSON。领域 JSON 只保存稳定引用，例如 `resource_id`、candidate id、状态、说明和锁定关系。

## 实施步骤

建议按以下顺序落地：

1. 改 MCP server key：`plugins/movscript/.mcp.json` 中 `movscript_workspace` 改为 `movscript`。
2. 改 core MCP tool definitions 和 router，增加新工具名：
   - `domain_get_model`
   - `domain_query_*`
   - `domain_read_*`
   - `domain_upsert_*`
   - `domain_update_*`
   - `domain_*_candidate`
   - `domain_review`
   - `domain_build`
   - `system_*`
3. 保留旧工具名作为短期兼容别名。router 中旧名转发到新 action，避免旧 session 或旧 provider 缓存立即失效。
4. 新增 `plugins/movscript/skills/domain/SKILL.md`。
5. 更新 `project/SKILL.md` 和 `generation/SKILL.md` 的 toolGrants、工具名和工作流说明。
6. 废弃或删除 `workspace/SKILL.md`。如果担心外部 provider 已缓存 skill 名，可以先保留一个极短的兼容 skill，正文指向 `domain` skill 的规则。
7. 更新 `plugins/movscript/README.md` 和 `.codex-plugin/plugin.json` 的 interface 文案，去掉旧 projection / workspace apply 语义。
8. 更新测试，至少覆盖：
   - tools/list 暴露新工具名；
   - 旧工具名兼容转发；
   - plugin skill 列表包含 `domain`；
   - `domain_review -> domain_build` 的描述与实际工具一致。

## 推荐的 `domain/SKILL.md` 骨架

```markdown
---
name: domain
description: Edit MovScript domain objects through structured APIs or source files, understand object meaning, storage layout, dependencies, review changes, and build so users can see the current effective project state.
toolGrants:
  - mcp__movscript__system_focus_get
  - mcp__movscript__domain_get_model
  - mcp__movscript__domain_query_entities
  - mcp__movscript__domain_query_settings
  - mcp__movscript__domain_query_assets
  - mcp__movscript__domain_query_production_context
  - mcp__movscript__domain_upsert_project_standards
  - mcp__movscript__domain_upsert_setting
  - mcp__movscript__domain_upsert_asset
  - mcp__movscript__domain_upsert_script
  - mcp__movscript__domain_upsert_content_unit
  - mcp__movscript__domain_update_content_unit_prompt
  - mcp__movscript__domain_update_scene_moment_timing
  - mcp__movscript__domain_update_storyboard_shot_plans
  - mcp__movscript__domain_append_candidate
  - mcp__movscript__domain_select_candidate
  - mcp__movscript__domain_update_candidate
  - mcp__movscript__domain_unlock_candidate
  - mcp__movscript__domain_read_preview_timeline
  - mcp__movscript__domain_compile_content_generation_prompt
  - mcp__movscript__domain_review
  - mcp__movscript__domain_build
---

# Domain Workspace

Use this skill when a user asks to inspect or edit MovScript project domain entities.

MovScript domain includes object meaning, storage layout, and APIs. MovScript project workspace is the project Git repository. Source files include `project.json`, `project_standards.json`, `settings/**`, `scripts/**`, `content_units/**`, and `productions/**`. Do not edit `.build/**` directly.

## Workflow

1. Call `system_focus_get` when the request depends on the selected project, production, or entity.
2. Prefer structured `domain_*` APIs for supported operations.
3. If no API covers the edit, call `domain_get_model` for the target entity kind before editing files.
4. Read returned editable paths, context paths, schema ids, and instructions.
5. Edit only source files that belong to the returned domain model.
6. Run `domain_review` after API writes or file edits.
7. Fix review issues and re-run review until ready.
8. Run `domain_build` after review is ready. Build success makes the edit state visible to the user through `.build/current` and indexes.

## Entity Dependencies

project -> project_standards
project -> setting -> setting_state -> asset
project -> script -> script_version -> script_block
project -> production -> segment -> scene_moment -> storyboard -> writing_expression
project -> production -> segment -> scene_moment -> keyframe
project -> content_unit -> keyframe

Content units are project-level production units and may reference scene moments or storyboards through source_context. Storyboards do not own content units. Assets are setting-owned resource slots and may reference system RawResource IDs.

## API Or Files

Use API for common operations: upsert settings/assets/scripts/content units, update timing or shot plans, and manage candidates/locks. Use direct file edits only when API does not cover the requested field or structure. Both paths must end with review and build when they change source.

## Rules

- Review is a check only; it does not make changes effective.
- Build validates source files and writes `.build/current`, `.build/indexes`, and `.build/manifests`.
- After completing any user request that changes domain source files, run `domain_build`.
- Do not store resource binaries, external provider URLs, or generation job runtime state in domain JSON.
- Use stable ids and `resource_id` references for generated or uploaded media.
```

## 风险与注意点

- Codex 的 toolGrants 使用的是 MCP server key 生成的完整工具名。server key 从 `movscript_workspace` 改为 `movscript` 后，所有 skill frontmatter 都要同步。
- provider 可能缓存 plugin 和 skill。安装脚本需要确保 cachebuster / reinstall 流程能刷新 `.mcp.json` 和 skill metadata。
- 如果旧工具名不保留兼容，正在运行的 session 或用户已有安装会立即失效。
- `system_project_create` 虽然是系统工具，但它是 durable write，应在 skill 中继续强调只能在用户明确要求或确认项目名后调用。
- `domain_build` 的语义必须保持纯编译：写 `.build/`，不自动修改 source。自动修复 source 应是 agent 显式编辑或未来单独工具。

## 结论

这次整理的核心不是把 `workspace` 改个名字，而是把 agent 的认知边界重新划清：

- `movscript` 是 plugin / MCP server 的顶层能力名。
- `system_*` 是系统运行态、生成、资源和外部检索能力。
- `domain_*` 是项目领域模型编辑、检查和构建能力。
- `domain` skill 是 agent 编辑 MovScript 项目的主入口。
- 领域变更必须以 `domain_build` 成功作为完成条件，这样用户才能看到本次改动。
