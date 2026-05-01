# MovScript V3 ProductionAction Contract

本文档定义 V3 第一批 `ProductionAction` 的最小契约。它服务于 V3 Production Runtime 实现，不替代 V2 的对象模型和数据动作 API。

维护规则：

- V3 新增或改名 action 时，先更新本文档。
- V2 新增、改名或收敛数据动作时，同步更新 `V2 data operation target`。
- Runtime 可以先用 deterministic/mock executor 产出候选；真实模型调用不是本契约的前置条件。
- Runtime 不直接写数据库核心表，只调用 V2 数据动作保存候选或提交用户确认后的 apply 请求。

## 1. Common Contract

### 1.1 ProductionAction Envelope

```text
ProductionAction
  action_id: client generated id
  action_type: one of the action names in this document
  project_id
  source_object
    object_type
    object_id
    version_id
  input_context
  requested_by
  created_at
```

`input_context` 由页面提供 context pack，不由 runtime 零散查询底层表拼接。剧本预演页的最小 context pack：

```text
script_version
source_text
script_sections
situations
storyboard_rows
content_units
keyframes
preview_timeline
asset_requirements
pending_candidates
user_selection
available_actions
```

### 1.2 ProductionRun / Step

```text
ProductionRun
  run_id
  action_id
  action_type
  status: queued | running | waiting_approval | succeeded | failed | cancelled
  started_at
  finished_at
  steps
  candidates
  warnings
  error
```

```text
ProductionStep
  step_id
  run_id
  step_type: read_context | analyze | generate | validate | write_candidate | request_approval
  status
  started_at
  finished_at
  input_summary
  output_summary
  error
```

### 1.3 ProductionCandidate

```text
ProductionCandidate
  candidate_id
  candidate_type
  project_id
  source_action_id
  source_run_id
  target_object
  status: candidate | accepted | rejected | revised | superseded
  payload
  confidence
  evidence
  created_at
```

候选只能进入候选态。写入正式事实必须通过 V2 的 accept/apply 数据动作。

### 1.4 Approval Policy

最小审批策略：

```text
no_approval
  只允许写 runtime debug 状态，不允许改变 V2 对象或候选

candidate_write
  允许写入候选，不允许自动应用为正式事实

explicit_accept_required
  需要用户在 CandidateReview / ApplyPreview 中确认后才能应用

cost_or_external_effect_required
  触发付费生成、外部工具或覆盖素材前必须确认
```

本批 action 默认使用 `candidate_write` 写候选，并在 apply 时使用 `explicit_accept_required`。

## 2. Action Inventory

第一批 action：

```text
AnalyzeScriptToSections
ExtractSituations
GenerateStoryboardScript
GenerateKeyframeCandidates
PrepareAssetRequirements
BuildPreviewTimelineProposal
```

当前代码中已经存在剧本预演薄切片 HTTP 边界：

```text
GET  /projects/:id/script-preview/draft
POST /projects/:id/script-preview/draft
POST /projects/:id/script-preview/analyze
POST /projects/:id/script-preview/generate-preview
```

这些接口可作为 V3 mock executor 的临时落点。长期目标仍是收敛为更明确的 V2 数据动作，例如 `UpsertScriptSectionCandidates`、`UpsertKeyframeCandidates` 和 `BuildPreviewTimeline`。

## 3. Action Contracts

### 3.1 AnalyzeScriptToSections

目标：把剧本文本、brief 或现有分镜行拆成可审查的剧本节候选。

Input context:

```text
project_id
script_version
source_text
storyboard_rows optional
user_selection optional
```

Runtime steps:

```text
1. read_context: 读取当前 script_version、source_text 和用户选择范围
2. analyze: 按语义段落、场景变化、动作转折拆分 sections
3. validate: 检查 order、source_range、summary 和 confirm_question 是否完整
4. write_candidate: 写入 ScriptSectionCandidate
5. request_approval: 标记待用户确认的问题
```

Candidate output:

```text
candidate_type: script_section
payload:
  client_id
  order
  title
  summary
  source_range
  confidence
  confirm_question
```

Approval policy:

```text
candidate_write
explicit_accept_required before becoming ScriptSection
```

V2 data operation target:

```text
Target: UpsertScriptSectionCandidates
Current thin-slice fallback: POST /projects/:id/script-preview/analyze
Related current response field: sections
```

Failure / retry boundary:

```text
Retry is safe while action_id/run_id stays stable.
Partial candidates may be superseded by a later run for the same script_version and source_range.
Invalid source_text or empty storyboard_rows fails before candidate write.
```

### 3.2 ExtractSituations

目标：从剧本节或分镜行中提取情境候选，服务后续分镜、素材和关键帧生成。

Input context:

```text
project_id
script_version
script_sections
storyboard_rows optional
existing_situations optional
```

Runtime steps:

```text
1. read_context: 读取已确认和候选剧本节
2. analyze: 提取地点、时间、人物关系、情绪状态、动作目标和限制条件
3. validate: 合并明显重复情境，保留 section references
4. write_candidate: 写入 SituationCandidate
5. request_approval: 标记高影响情境字段
```

Candidate output:

```text
candidate_type: situation
payload:
  client_id
  source_section_ids
  title
  location
  time_of_day
  characters
  mood
  action_context
  constraints
  confidence
```

Approval policy:

```text
candidate_write
explicit_accept_required before becoming Situation
```

V2 data operation target:

```text
Target: UpsertSituationCandidates
Current thin-slice fallback: no dedicated endpoint yet; keep runtime output in run/candidate store until V2 endpoint exists
```

Failure / retry boundary:

```text
Retry is safe for the same script_section ids.
If referenced sections changed, runtime must create a new run instead of mutating old candidates in place.
```

### 3.3 GenerateStoryboardScript

目标：基于剧本节和情境生成结构化分镜脚本候选。

Input context:

```text
project_id
script_version
script_sections
situations
storyboard_rows optional
style_reference optional
duration_target optional
```

Runtime steps:

```text
1. read_context: 读取 section/situation 和已有 storyboard_rows
2. generate: 为每个 section 生成或补齐分镜行
3. validate: 检查 order、duration_seconds、source_section_id 和 adoption_intent
4. write_candidate: 写入 StoryboardSuggestion
5. request_approval: 等待用户采用、改写或拒绝
```

Candidate output:

```text
candidate_type: storyboard_suggestion
payload:
  client_id
  source_section_id
  situation_id optional
  order
  title
  body
  duration_seconds
  status
  adoption_intent
```

Approval policy:

```text
candidate_write
explicit_accept_required before appending or replacing storyboard rows
```

V2 data operation target:

```text
Target: UpsertStoryboardSuggestions
Current thin-slice fallback: POST /projects/:id/script-preview/analyze
Related current response field: storyboard_suggestions
```

Failure / retry boundary:

```text
Retry may replace candidates for the same source_section_id only when they are still in candidate status.
Accepted storyboard rows are not overwritten; new output must become revised/superseding candidates.
```

### 3.4 GenerateKeyframeCandidates

目标：为已确认或待预演的分镜/内容单元生成关键帧候选。

Input context:

```text
project_id
script_version
storyboard_rows or content_units
situations optional
creative_references optional
asset_requirements optional
selected_rows optional
```

Runtime steps:

```text
1. read_context: 读取可预演 storyboard_rows/content_units
2. generate: 生成 keyframe prompt、visual_anchor 和可选生成任务请求
3. validate: 检查每个候选是否可追溯到 storyboard/content_unit
4. write_candidate: 写入 KeyframeCandidate
5. request_approval: 对外部生成任务或采用视觉锚点请求确认
```

Candidate output:

```text
candidate_type: keyframe
payload:
  client_id
  storyboard_row_client_id optional
  content_unit_id optional
  prompt
  visual_anchor
  reference_asset_ids
  generation_task_id optional
  status
```

Approval policy:

```text
candidate_write for prompt/placeholder candidates
cost_or_external_effect_required before paid image/video generation
explicit_accept_required before attaching to ContentUnit
```

V2 data operation target:

```text
Target: UpsertKeyframeCandidates
Current thin-slice fallback: POST /projects/:id/script-preview/generate-preview
Related current response field: keyframe_candidates
```

Failure / retry boundary:

```text
Prompt-only retry is safe.
External generation retry must be idempotent by generation_task_id or explicitly create a new candidate.
Failed generation tasks must not remove existing accepted keyframes.
```

### 3.5 PrepareAssetRequirements

目标：根据分镜、内容单元、关键帧和预演缺口生成素材需求候选。

Input context:

```text
project_id
storyboard_rows or content_units
keyframe_candidates
preview_timeline optional
existing_asset_requirements optional
resource_bindings optional
```

Runtime steps:

```text
1. read_context: 读取内容单元、关键帧候选和当前资源绑定
2. analyze: 识别缺失角色、场景、道具、参考图、音频或视频素材
3. validate: 去重并设置 priority/status
4. write_candidate: 写入 AssetRequirementCandidate
5. request_approval: 等待用户确认是否进入素材准备
```

Candidate output:

```text
candidate_type: asset_requirement
payload:
  client_id
  storyboard_row_client_id optional
  content_unit_id optional
  name
  description
  asset_type
  priority
  status
  evidence
```

Approval policy:

```text
candidate_write
explicit_accept_required before creating production AssetRequirement or WorkItem
```

V2 data operation target:

```text
Target: UpsertAssetRequirementCandidates
Current thin-slice fallback: POST /projects/:id/script-preview/generate-preview
Related current response field: asset_gaps
```

Failure / retry boundary:

```text
Retry is safe when candidates are matched by content_unit/storyboard row plus asset_type/name.
Accepted asset requirements cannot be deleted by retry; runtime may suggest superseding requirements.
```

### 3.6 BuildPreviewTimelineProposal

目标：基于分镜/内容单元和关键帧候选生成预演时间线提案。

Input context:

```text
project_id
script_version
storyboard_rows or content_units
keyframe_candidates
existing_preview_timeline optional
duration_target optional
```

Runtime steps:

```text
1. read_context: 读取当前 storyboard/content units、keyframe candidates 和已有 timeline
2. generate: 计算顺序、起止时间、时长和 label
3. validate: 检查时间线连续性、引用完整性和总时长
4. write_candidate: 写入 PreviewTimelineProposal
5. request_approval: 等待用户应用为正式 timeline 或保存为 draft proposal
```

Candidate output:

```text
candidate_type: preview_timeline_proposal
payload:
  client_id
  items:
    client_id
    storyboard_row_client_id optional
    content_unit_id optional
    keyframe_candidate_client_id optional
    order
    start_seconds
    duration_seconds
    end_seconds
    label
    status
```

Approval policy:

```text
candidate_write
explicit_accept_required before replacing or appending to PreviewTimeline
```

V2 data operation target:

```text
Target: BuildPreviewTimeline / SavePreviewProposal
Current thin-slice fallback: POST /projects/:id/script-preview/generate-preview
Related current response field: preview_timeline
```

Failure / retry boundary:

```text
Retry is safe before proposal acceptance.
If existing_preview_timeline changed after run start, apply must fail with stale context and request regeneration.
```

## 4. Runtime Implementation Notes

第一版 `apps/production-runtime` 可以按以下顺序落地，不阻塞 V2：

```text
1. 新增 src/production/actionTypes.ts，先承载本文档中的 action names 和 DTO 草稿
2. 新增 deterministic executor，把 context pack 转成本文档 candidate payload
3. 新增 run/step/candidate 内存或文件 store，复用现有 runtime store 能力
4. 新增 V2 script-preview client，只调用已有 /script-preview/* 薄切片接口
5. 等 V2 candidate upsert/apply API 稳定后，将 fallback endpoint 替换为正式数据动作
```

`packages/production-contracts` 尚未存在。创建前先把本文档作为源契约，避免过早把不稳定字段发布为共享 package API。
