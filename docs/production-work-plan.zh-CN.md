# Production Work Plan

## 背景

MovScript 的生产流程不应该只服务 agent 自动化。

同一个项目状态里，既有需要 agent 处理的工作，也有需要人工编辑、人工审美判断、人工确认的工作。比如：

- 剧情结构、镜头语言、分镜、关键帧、连续性资产可以由人编辑，也可以由 agent 辅助补全。
- 候选图、候选视频可以由 agent 生成，也可以由人上传、外部导入或重新拍摄。
- `selection` 通常是产品状态决策，可能由用户选择，也可能在明确 workflow 下由 agent 代选。
- `interpreter` 不应该替人或 agent 做决策，它应该解释当前项目状态，并指出哪里缺结构、哪里缺候选、哪里缺选择、哪里已经过期。

因此，下一层核心能力不是单纯的 `agent task plan`，而是人和 agent 共用的 `production work plan`。

```text
source / decision state
  -> interpreter
  -> production work plan
  -> human editor or agent executor
  -> source / decision state
  -> interpreter
```

这份计划应该成为 UI、agent、CLI、MCP 工具共同读取的生产待办图。

## 目标

`production_work_plan` 的目标是把解释器看到的项目状态转成可执行、可展示、可分派的生产事项。

它要回答：

- 当前项目是否有源文件错误。
- 当前 production / scene_moment / shot 是否缺必要结构。
- 哪些 content unit 因缺上游 selection 被阻塞。
- 哪些 content unit 已经 ready，可以生成候选。
- 哪些 selected candidate 已经 stale，需要 review。
- 哪些事项适合人工处理，哪些事项适合 agent 处理，哪些二者都可以。
- UI 应该打开什么编辑入口，agent 应该调用什么工具。

它不应该回答：

- 最终采用哪个候选。
- 是否必须重新生成。
- 是否接受 stale。
- 具体创作审美是否达标。

这些仍然是 human、agent workflow 或显式策略的决策。

## 核心原则

### 1. Work item 是共享生产事项，不是 agent 私有任务

`production_work_item` 代表项目里一个待处理的生产缺口。它可以被人工处理，也可以被 agent 处理。

不要为 UI 和 agent 维护两套待办状态。UI 看到的阻塞、agent 看到的阻塞、CLI 打印的阻塞应该来自同一个解释器输出。

### 2. Interpreter 是共同裁判

人工编辑和 agent 编辑都必须写回统一源模型：

- 结构、提示词、影视规划写回 source files。
- 候选和选择写回 decision state。

写回后必须重新 inspect / interpret，再由 interpreter 产出新的状态。

agent 不应维护隐藏的“已解决”状态。UI 也不应维护和 source/decision 脱节的“已完成”状态。

### 3. 结构编辑是一等动作

agent 的工作不只是生成候选。它也应该能补结构：

- 补 `setting / setting_state / asset`。
- 补 `production / segment / scene_moment / shot`。
- 补 `storyboard / keyframe`。
- 补 `audio_cue / expression_unit`。
- 创建或修正 `content_unit`。
- 修改 `edit_prompt` 和引用。

人工编辑也使用同一批结构入口。work plan 应该能告诉 UI：这个事项对应哪个实体、应该打开哪个编辑器、缺什么字段。

### 4. 生成和选择分离

生成只产生 candidate。选择 candidate 才改变生产决策。

`production_work_plan` 可以建议：

- 生成更多候选。
- 打开候选选择器。
- 让 agent 视觉检查候选。
- 请求用户确认。
- 接受 stale。

但不能把“生成成功”等同于“已经采用”。

### 5. Affected 不等于 regenerate

解释器可以说某个 content unit 受影响或 stale，但这不等于必须重新生成。

work item 应该把可选处理动作列出来：

- keep
- relink
- re-prompt
- generate candidates
- select candidate
- accept stale
- deprecate
- re-shoot

实际采取哪个动作由 human、agent workflow 或项目策略决定。

## 当前代码落点

现有代码已经有几块可以直接承接这个设计：

- `packages/language/src/domain/schemas.ts` 定义影视生产源实体。
- `packages/interpreter/src/artifacts/contentProduction.ts` 派生 content unit artifact bundle。
- `packages/interpreter/src/artifacts/contentProductionAdapters.ts` 定义 content unit 类型到主引用、输出类型、运行面板的规则。
- `packages/interpreter/src/artifacts/relationGraph.ts` 派生源实体之间的引用关系。
- `packages/interpreter/src/artifacts/impactReport.ts` 已有 affected content unit 的概念，但依赖传播还没有完全接上。
- `packages/interpreter/src/node/regeneration.ts` 已有 regeneration plan 入口，但当前还没有真实填充 affected targets、prompt bundles 和 preview timelines。
- `packages/workspace/src/repository/decisionStore.ts` 已经把 backend decision overlay 到 workspace documents。
- `packages/prompt/src/index.ts` 已经能把 selected upstream resource 编译进 backend prompt。

下一步不需要另起炉灶。应该在 interpreter 层把这些 artifact 收敛成一份更完整的 work plan。

## 数据模型建议

### `production_work_plan.v1`

```ts
interface ProductionWorkPlan {
  schema: 'movscript.production_work_plan.v1'
  created_at: string
  project?: EntityRef
  scope?: {
    production_id?: string | number
    segment_id?: string | number
    scene_moment_id?: string | number
    shot_id?: string | number
    content_unit_id?: string | number
  }
  source_status: {
    ready_to_interpret: boolean
    has_pending_edits: boolean
    issue_count: number
  }
  interpret_status: {
    status: 'missing' | 'current' | 'stale'
    interpretation_id?: string
    interpreted_at?: string
  }
  items: ProductionWorkItem[]
  summary: {
    open: number
    blocking: number
    human_recommended: number
    agent_recommended: number
    ready_to_generate: number
    stale_selections: number
  }
}
```

### `ProductionWorkItem`

```ts
interface ProductionWorkItem {
  id: string
  kind:
    | 'fix_source'
    | 'edit_structure'
    | 'create_content_unit'
    | 'generate_candidates'
    | 'select_candidate'
    | 'review_stale_selection'
    | 'review_affected_output'
  status: 'open' | 'blocked' | 'ready' | 'informational'
  severity: 'blocking' | 'warning' | 'suggestion'
  priority: number
  reason: string
  target: EntityRef
  upstream?: EntityRef[]
  downstream?: EntityRef[]
  blockers?: WorkItemBlocker[]
  allowed_actors: ProductionActor[]
  recommended_actor: ProductionActor
  actions: ProductionWorkAction[]
  evidence?: Record<string, unknown>
}
```

```ts
type ProductionActor = 'human' | 'agent' | 'workflow'
```

### `ProductionWorkAction`

```ts
type ProductionWorkAction =
  | {
      type: 'open_editor'
      entityKind: string
      entityId?: string | number
      path?: string
      missingFields?: string[]
    }
  | {
      type: 'upsert_entity'
      entityKind: string
      suggestedPatch?: Record<string, unknown>
    }
  | {
      type: 'derive_content_unit_artifact'
      contentUnitId: string | number
    }
  | {
      type: 'generate_candidates'
      contentUnitId: string | number
      capability: 'image' | 'video' | 'audio' | 'text'
      suggestedCandidateCount?: number
    }
  | {
      type: 'open_candidate_picker'
      contentUnitId: string | number
    }
  | {
      type: 'agent_review_candidates'
      contentUnitId: string | number
    }
  | {
      type: 'accept_stale'
      contentUnitId: string | number
    }
```

这个结构的重点不是一次性定死所有 action，而是让 UI 和 agent 都能从 action 中知道下一步应该去哪里。

## Work Item 分类

### `fix_source`

源文件或 schema 存在错误，必须先修。

来源：

- `validateEditableFiles`
- `validateSourceDomainGraph`
- schema validation
- path/id mismatch
- prompt ref 不可解析

推荐 actor：

- JSON/schema/path 错误通常推荐 `human` 或 `agent`，取决于修复是否机械。
- 创作语义不清通常推荐 `human`。

### `edit_structure`

影视生产结构不完整，当前还不适合进入稳定生成。

例子：

- scene moment 没有 shot。
- shot 没有 camera / timing / blocking。
- 需要连续性但没有 setting/state/asset。
- 要做视频但没有 keyframe 或 storyboard anchor。
- reference-shot imitation 没有抽帧分析和 storyboard panels。

推荐 actor：

- 机械补齐或根据剧本材料拆分：`agent`。
- 镜头创作、审美和叙事节奏选择：`human` 或 `human + agent`。

### `create_content_unit`

已有结构可以生产，但缺 content unit 承接候选和选择。

例子：

- 有 asset slot，但没有 `asset_ref` content unit。
- 有 keyframe，但没有 `keyframe_ref` content unit。
- 有 shot，但没有 `shot_ref` content unit。

推荐 actor：

- 通常推荐 `agent`，因为这是结构化、可规则化的补齐。

### `generate_candidates`

content unit 的 runtime panel 已 ready，可以生成候选。

来源：

- `runtimePanel.status === 'ready'`
- `dependencyReport.blockers` 为空
- 当前没有 selected candidate，或用户要求更多候选，或 stale review 决定重新生成

推荐 actor：

- 通常推荐 `agent` 或 `workflow`。

### `select_candidate`

已有候选，但还没有稳定 selection。

来源：

- decision context 有 candidates。
- selection 为空。
- 下游 content unit 依赖这个 content unit。

推荐 actor：

- 默认推荐 `human`，因为这是产品状态决策。
- 如果 workflow 明确允许 agent 自选，可以推荐 `agent`，但 action 应保留审计理由。

### `review_stale_selection`

已有 selection，但 `selectionValidity.stale === true`。

来源：

- `edit_prompt_changed`
- `model_intent_changed`
- `refs_changed`
- `runtime_inputs_changed`
- `candidate_missing`
- `candidate_prompt_missing`
- `prompt_dependency_missing`

推荐 actor：

- 默认推荐 `human`。
- agent 可以先解释 stale 原因、查看候选、生成替代候选，但不应默认覆盖 selection。

### `review_affected_output`

上游结构或引用变化影响下游输出，但不一定 stale。

来源：

- relation graph 影响传播。
- impact report affected content units。
- preview timeline 变化。

推荐 actor：

- 默认 `human` 或 `workflow`，因为这是审查事项，不一定需要操作。

## Readiness 分类

UI 和 agent 都应该使用同一套 readiness 词汇。

### `缺规划`

故事、场面、镜头或连续性结构不足。

处理方向：

- 编辑 production / scene_moment / shot。
- 补 expression unit / audio cue。
- 补 setting / asset。

### `可补图`

叙事和镜头方向明确，但视觉锚点不足。

处理方向：

- 补 keyframe。
- 补 storyboard panels。
- 补 asset reference。
- 创建对应 image content unit。

### `缺选择`

候选或上游 content unit 已存在，但还没有稳定 selection。

处理方向：

- 打开候选选择器。
- 让 agent 读图/读视频辅助选择。
- 生成更多候选。

### `可生成`

content unit 运行输入稳定，阻塞为空，可以生成候选。

处理方向：

- 生成 candidates。
- 写入 content candidate。
- 等用户或 workflow 选择。

## UI 使用方式

Frontend 不应该只把 work plan 当成 agent 面板信息。它应该直接驱动人工编辑入口。

建议 UI 能力：

- 项目概览页显示 open / blocking work items。
- production tree 节点显示 readiness badge。
- scene moment / shot 页面显示本节点相关 work items。
- content unit 面板显示 dependency blockers、selection validity、candidate actions。
- 点击 `open_editor` action 打开对应 source editor 或结构化表单。
- 点击 `open_candidate_picker` action 打开候选选择器。
- 点击 `generate_candidates` action 可以交给 agent 或 workflow。
- stale selection 应提供 keep / accept stale / generate replacement / choose another candidate。

UI 不需要理解所有底层推理，只需要消费 work item 的 `target/actions/evidence`。

## Agent 使用方式

Agent 应读取同一份 work plan，然后执行它有能力处理的 open item。

推荐循环：

```text
domain_overview
-> domain_read_production_work_plan
-> pick highest priority item
-> if edit_structure: call domain_upsert_* / update_* tools
-> if generate_candidates: derive artifact, call generation, create content candidate
-> if select_candidate: ask human unless explicit auto-select policy exists
-> inspect / review
-> interpret
-> repeat
```

agent 的边界：

- 可以主动补机械结构。
- 可以根据用户目标补合理的 production/shot/storyboard/keyframe 草案。
- 可以生成候选。
- 可以读图读视频并给选择建议。
- 不应默认替用户确认最终 selection。
- 不应把自己的临时计划当成项目状态。

## Interpreter 实现建议

第一阶段不新增 source 实体，也不把 work plan 写入 `.interpret/current`。

`production_work_plan` 应该是 interpreter 根据当前 source / decision state 即时派生的内存结果：

```text
review / interpret / MCP read
  -> derive production_work_plan in memory
  -> return to UI / CLI / agent
```

这样可以避免 work item 与 `.interpret/current` 的稳定解释结果混在一起，导致 source / decision 变化后 UI 或 agent 读到过期的待办状态。对外通过 MCP 暴露：

```text
domain_read_production_work_plan
```

或者先增强现有：

```text
domain_regeneration_plan
```

但从语义上看，`regeneration_plan` 太窄。它偏向“已有生成结果过期后如何处理”。`production_work_plan` 更适合覆盖结构编辑、候选生成、候选选择和 stale review。

### Phase 1

- 从 `review.issues` 生成 `fix_source`。
- 从 content unit artifact blockers 生成 `create_content_unit / select_candidate / review_stale_selection`。
- 从 runtime panel ready 状态生成 `generate_candidates`。
- 从 selection validity 生成 stale review。
- 输出 summary 和 priority。

### Phase 2

- 接上 relation graph 到 impact report。
- 非 content unit 变化可以传播到引用它的 content units。
- preview timeline 变化可以生成 `review_affected_output`。

### Phase 3

- 增加 readiness 规则。
- 对 scene_moment / shot 生成 `缺规划 / 可补图 / 缺选择 / 可生成`。
- UI 使用同一套 readiness badge。

### Phase 4

- 收敛 `packages/interpreter` 和 `packages/prompt` 的 ref 解析、selection blocker 和 prompt comparison 逻辑。
- 避免 interpreter 认为 ready，但 backend prompt 编译失败。

## MCP 工具建议

新增或调整工具：

```text
domain_read_production_work_plan
domain_query_work_items
domain_resolve_work_item
```

第一阶段可以只做 read/query，不做 resolve。

`resolve_work_item` 不应直接修改状态，而应分发到已有 domain tools：

- `domain_upsert_*`
- `domain_update_content_unit_prompt`
- `domain_create_content_candidate`
- `domain_select_content_unit_candidate`
- `domain_interpret`

也就是说，work item 是导航和调度，不是另一个写入通道。

## 与现有 Regeneration Plan 的关系

`regeneration_plan` 可以保留，但应降级为 production work plan 的一个视角：

```text
production_work_plan
  -> stale selection items
  -> affected output review items
  -> generate replacement candidate items
```

如果继续保留 `domain_regeneration_plan`，它可以从 `production_work_plan.items` 中筛选：

- `review_stale_selection`
- `review_affected_output`
- `generate_candidates` where reason is stale/replacement

这样不会出现两套判断。

## 非目标

第一阶段不需要做：

- 持久化 work item 状态。
- 多人协作分派系统。
- 完整任务看板。
- 自动排期。
- 自动最终选择。

work plan 可以先是纯 derived artifact。只要 source/decision 改变，interpreter 就重新计算它。

后续如果需要人工派工，再考虑把 work item snapshot 或 assignment 变成独立 collaboration state。

## 结论

MovScript 的下一步核心不是让 agent 更像一个隐藏执行器，而是让项目本身能解释自己的生产缺口。

`production_work_plan` 应该成为人和 agent 共同工作的中间层：

```text
interpreter 负责解释
work plan 负责列出可执行事项
human / agent 负责处理
source / decision 负责记录结果
```

这样 agent 可以自动推进，人工也可以随时接管编辑；两者不会抢状态，也不会走两条互相看不见的流程。
