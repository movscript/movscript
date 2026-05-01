# MovScript V3 Progress Log

本文档用于跨会话推进 V3 Production Runtime。每次推进前先读本文件和 `docs/movscript-v3-plan.md`；每次推进结束前更新本文件。

## 启动口令

用户只需要说：

```text
继续推进 MovScript V3 重构
```

执行者应自动：

1. 阅读 `docs/movscript-v3-progress.md`。
2. 阅读 `docs/movscript-v3-plan.md`。
3. 查看 `git status --short`，识别已有改动，不能回滚用户或其他会话的改动。
4. 按“下一步任务”推进一个小而完整的切片。
5. 结束前更新本文档的进度、决策、下一步任务和验证结果。

## 当前阶段

当前处于：

```text
Phase 1：V3 运行时边界与跨窗口协作契约
```

当前核心目标：

```text
让 V3 可以在独立窗口中持续推进 Production Runtime、Action、Candidate 和 Approval 能力。
V3 不直接推进 V2 页面或后端数据模型，只通过文档化契约与 V2 对接。
```

当前不应优先做：

- 直接改 V2 剧本预演页面主流程。
- 让 runtime 直接写数据库核心表。
- 把后端改成云端 Agent Server。
- 继续扩大全局聊天入口。
- 一次性迁移所有 agent / runtime 代码。
- 绕过 V2 数据动作 API 操作底层 CRUD。

## 已完成

### 2026-05-01 ExtractSituations deterministic executor

- `ProductionRuntime` 的 deterministic executor 已支持：

```text
ExtractSituations
```

- `ExtractSituations` 只生成 runtime-local `situation` candidate，不调用 V2 fallback，不写 V2 后端数据模型或数据库核心表。
- 输入上下文优先级：

```text
inputContext.script_sections / scriptSections
inputContext.storyboard_rows / storyboardRows
inputContext.source_text / sourceText
```

- `script_sections` / `storyboard_rows` 会归一化为 `situation` candidates，payload 包含：

```text
client_id
order
title
summary
location optional
time_of_day optional
characters optional
source_ref
confirm_question
```

- `source_text` 兜底复用当前 deterministic section split 逻辑，按文本片段生成 `situation` candidates，并保留 source range。
- 有候选产出时 run 状态为 `waiting_approval`，candidate 状态保持 `candidate`。
- 无有效输入时 run 状态为 `failed`，不写 candidate。
- `situation` 的 apply preview 已通过既有映射返回：

```text
UpsertSituationCandidates
```

- apply preview 仍只返回 `blocked` / `not_applicable`，不调用 V2 apply，不写正式事实。
- 新增测试覆盖：
  - script sections 生成 situation candidates。
  - storyboard rows 和 source text 兜底生成 situation candidates。
  - 无有效输入失败且 candidates 为空。
  - situation apply preview 返回 `UpsertSituationCandidates`，但仍需要 accept / V2 data action gate。

### 2026-05-01 GenerateKeyframeCandidates V2 fallback 边界

- 扩展 `ProductionV2FallbackClient`，新增：

```text
writeGenerateKeyframeCandidates(action, run)
```

- `DisabledProductionV2FallbackClient` 对 keyframe fallback 继续返回：

```text
V2 fallback disabled
```

- `ScriptPreviewV2FallbackClient` 新增 `GenerateKeyframeCandidates` 临时 fallback：

```text
POST /projects/:id/script-preview/generate-preview
```

- fallback 请求体保持当前 V2 薄切片形状：

```text
draft_id
storyboard_rows
```

- `storyboard_rows` 来源优先级：

```text
inputContext.storyboard_rows / storyboardRows
inputContext.content_units / contentUnits 归一化
runtime keyframe candidates 快照兜底归一化
```

- `ProductionRuntime.applyV2Fallback` 现在支持：

```text
AnalyzeScriptToSections -> script-preview/analyze
GenerateKeyframeCandidates -> script-preview/generate-preview
```

- fallback 仍默认关闭，只有显式配置 `MOVSCRIPT_PRODUCTION_V2_FALLBACK_ENABLED=true` 和 base URL 才会执行。
- fallback 成功只在 `ProductionRun.warnings` 记录已通过薄切片写入；不会把 candidate 标为 `accepted`，不会执行 V2 apply。
- fallback 失败只在 `ProductionRun.warnings` 记录错误；runtime-local keyframe candidate 仍保留 `candidate` 状态。
- lifecycle 和 apply-preview 不会再次触发 V2 fallback。
- 新增测试覆盖：
  - `GenerateKeyframeCandidates` fallback 默认关闭。
  - keyframe fallback 成功时 candidate 仍为 `candidate`，run 记录 `script-preview/generate-preview` warning。
  - keyframe fallback 失败时保留 runtime candidate，run 记录 warning。
  - keyframe lifecycle / apply-preview 不重复调用 fallback。

### 2026-05-01 Production Approval / Apply Preview 最小契约

- 新增 runtime-local approval / apply preview 类型：

```text
ProductionApproval
ProductionApplyPreview
ProductionApprovalStatus
ProductionApplyPreviewStatus
ProductionApprovalRequiredAction
```

- `ProductionApproval` 最小表达：

```text
candidateId
approvalPolicy
requiredAction
status
reason
```

- `ProductionRuntime` 新增 `previewCandidateApply(candidateId)`，只读取 runtime-local candidate 并返回 apply preview，不调用 V2 fallback，不写 V2 canonical objects。
- 新增 `/production/candidates/:id/apply-preview`：

```text
POST /production/candidates/:id/apply-preview
```

- apply preview 会返回：

```text
status
canApply
approval
v2DataOperation
targetObject
requiredContext
warnings
```

- `accepted` candidate 的 apply preview 仍返回 `blocked` / `canApply: false`，并提示真正应用必须等待专用 V2 data action。
- `candidate` 状态返回 `not_applicable`，要求先 `accept_candidate`。
- `rejected` / `revised` / `superseded` 返回 `not_applicable`，不能进入可应用状态。
- 当前只登记未来 V2 data operation 名称，不调用接口：

```text
script_section -> UpsertScriptSectionCandidates
situation -> UpsertSituationCandidates
storyboard_script -> UpsertStoryboardSuggestions
keyframe -> UpsertKeyframeCandidates
asset_requirement -> UpsertAssetRequirementCandidates
preview_timeline -> BuildPreviewTimeline / SavePreviewProposal
```

- 新增测试覆盖：
  - accepted candidate 的 apply preview 返回 blocked，且不调用 V2 fallback。
  - rejected / revised / superseded candidate 的 apply preview 返回不可应用。
  - candidate 状态必须先 accept 后才能进入 apply gate。

### 2026-05-01 Production Candidate lifecycle 最小 API

- 在 `ProductionCandidate` 上补齐 runtime-local lifecycle 审计字段：

```text
updatedAt
statusChangedAt
statusReason
revisedFromCandidateId
revisedByCandidateId
supersedesCandidateId
supersededByCandidateId
lifecycle[]
```

- `ProductionStore` 新增 `updateCandidate`，更新候选时同步关联 `ProductionRun.candidates` 快照，避免 run 和 candidate 列表状态分裂。
- `ProductionRuntime` 新增候选状态流转方法：

```text
rejectCandidate
acceptCandidate
reviseCandidate
supersedeCandidate
```

- 新增 `/production/candidates/:id/*` 最小 lifecycle HTTP API：

```text
POST /production/candidates/:id/accept
POST /production/candidates/:id/reject
POST /production/candidates/:id/revise
POST /production/candidates/:id/supersede
```

- `accept` 只把 runtime-local candidate 标为 `accepted`，并记录 `explicit_accept_required; runtime status only, no V2 apply performed`，不调用 V2 apply，不写正式事实。
- `revise` 会创建新的 runtime candidate，旧 candidate 标为 `revised`，并通过 `revisedByCandidateId` / `revisedFromCandidateId` 建立关系。
- `supersede` 支持记录 `supersededByCandidateId`，但仍只改 runtime-local candidate 状态。
- lifecycle 操作不会调用 `ScriptPreviewV2FallbackClient`，也不会写 V2 canonical objects。
- 新增测试覆盖：
  - reject candidate 后通过 `FileProductionStore` 持久化恢复状态。
  - revise candidate 生成新 candidate，旧 candidate 标为 `revised`，并同步 `ProductionRun.candidates`。
  - lifecycle 更新不调用 V2 fallback。

### 2026-05-01 ProductionRun/Candidate 持久化与 V2 fallback 边界

- 新增 `FileProductionStore`，让 `/production/*` 产生的 run/candidate 可以跨 runtime 重启保留。
- 默认持久化路径：

```text
.movscript-production-runtime/production-state.json
```

- 新增 `MOVSCRIPT_PRODUCTION_STATE_PATH` 支持覆盖 production state 文件位置。
- `apps/production-runtime/src/server.ts` 已改为使用 `FileProductionStore`，并在 `/health` 中暴露：

```text
productionStatePath
productionV2FallbackEnabled
```

- 新增 `ScriptPreviewV2FallbackClient`，为 `AnalyzeScriptToSections` 保留 runtime-side V2 fallback 写入边界。
- V2 fallback 只允许调用当前薄切片接口：

```text
POST /projects/:id/script-preview/analyze
```

- fallback 默认关闭，只有显式配置时才启用：

```text
MOVSCRIPT_PRODUCTION_V2_FALLBACK_ENABLED=true
MOVSCRIPT_PRODUCTION_V2_FALLBACK_BASE_URL=http://localhost:8765
```

- 如果未配置专用 base URL，会复用：

```text
MOVSCRIPT_BACKEND_API_BASE_URL
MOVSCRIPT_API_BASE_URL
```

- fallback 失败时不会丢弃 runtime candidate，也不会把候选标为 accepted；只在 `ProductionRun.warnings` 记录失败边界。
- `ProductionRuntime.createAction` 已改为 async，以便未来真实 executor / fallback / tool 调用统一异步边界。
- 新增测试覆盖：
  - `FileProductionStore` 持久化 run/candidate。
  - fallback 默认关闭时不做外部写入。
  - fallback 失败时保留 runtime candidate 并记录 warning。
  - fallback 成功记录 warning 且 candidate 仍保持 `candidate` 状态。

### 2026-05-01 production-runtime action 概念层

- 在 `apps/production-runtime/src/production/` 新增 V3 production 概念层，第一版保持在 runtime app 内部，尚未抽到共享 package。
- 新增类型和 DTO：

```text
ProductionAction
ProductionRun
ProductionRunStep
ProductionCandidate
ProductionApprovalPolicy
```

- 新增 `ProductionRuntime` 和 `InMemoryProductionStore`，跑通：

```text
ProductionAction -> deterministic executor -> ProductionRun -> ProductionCandidate
```

- 已实现 deterministic executor：

```text
AnalyzeScriptToSections
GenerateKeyframeCandidates
```

- `AnalyzeScriptToSections` 从 `inputContext.source_text` / `sourceText` 拆出 `script_section` candidates。
- `GenerateKeyframeCandidates` 从 `inputContext.storyboard_rows` / `content_units` 生成 `keyframe` candidates。
- 其他已登记 action 暂时只返回无 deterministic executor 的 warning，不写候选。
- 在 `apps/production-runtime/src/server.ts` 新增 V3 路由：

```text
POST /production/actions
GET  /production/runs
GET  /production/runs/:id
GET  /production/candidates
GET  /production/candidates/:id
```

- 这些 `/production/*` 路由只操作 runtime 内存态，不写 V2 后端数据模型，不调用数据库 CRUD。
- 新增 `apps/production-runtime/src/production/runtime.test.ts` 覆盖 action 到 candidate 的最小链路。

### 2026-05-01 ProductionAction 最小契约

- 新增 `docs/movscript-v3-action-contract.md`，把第一批 V3 `ProductionAction` 从 plan 中拆成独立契约文档。
- 明确第一批 action：

```text
AnalyzeScriptToSections
ExtractSituations
GenerateStoryboardScript
GenerateKeyframeCandidates
PrepareAssetRequirements
BuildPreviewTimelineProposal
```

- 每个 action 已记录：

```text
input context
runtime steps
candidate output
approval policy
V2 data operation target
failure / retry boundary
```

- 在 `docs/movscript-v3-plan.md` 的 V2 数据动作 API 段落中登记契约文档入口和维护规则。
- 对齐当前代码中的 V2 剧本预演薄切片接口：

```text
GET  /projects/:id/script-preview/draft
POST /projects/:id/script-preview/draft
POST /projects/:id/script-preview/analyze
POST /projects/:id/script-preview/generate-preview
```

- 明确这些现有接口只能作为 V3 mock/deterministic executor 的临时落点，长期仍应对齐 `Upsert*Candidates`、`BuildPreviewTimeline` 和 `Accept/RejectCandidate` 等数据动作。

### 2026-05-01 初始记录

- 明确 V3 与 V2 并行推进：

```text
V2：产品页面、核心对象、候选保存、正式事实、版本、状态机、采用/拒绝/回滚
V3：Production Runtime、AI 分析、模型调用、工具编排、计划步骤、候选生成
```

- 明确 V3 不是“聊天助手”，而是内化到产品对象中的 agentic production system。
- 明确 V3 runtime 应优先位于客户端侧：

```text
Electron Main / Local Sidecar Runtime
```

- 明确后端定位为：

```text
API Gateway + Canonical State + Resource/Task Registry + Audit
```

- 明确 V3 runtime 调用 V2 时，应调用数据动作 API 写回候选，而不是期待 V2 后端执行 AI 分析：

```text
V3 AnalyzeScriptToSections -> V2 UpsertScriptSectionCandidates
V3 ExtractSituations -> V2 UpsertSituationCandidates
V3 GenerateStoryboardScript -> V2 UpsertStoryboardSuggestions
V3 GenerateKeyframeCandidates -> V2 UpsertKeyframeCandidates
V3 PrepareAssetRequirements -> V2 UpsertAssetRequirementCandidates
V3 BuildPreviewTimelineProposal -> V2 BuildPreviewTimeline / SavePreviewProposal
```

- 新增本文档，使 V3 也可以通过一句启动口令在新对话中继续推进。

## 当前代码状态摘要

截至 2026-05-01 初始记录时，工作区已有未提交改动。后续会话必须先查看最新 `git status --short`。

已观察到的 V3 相关文档：

- `docs/movscript-v3-plan.md`
- `docs/movscript-v3-progress.md`
- `docs/movscript-v3-action-contract.md`
- `docs/movscript-v2-roadmap.md`
- `docs/movscript-v2-progress.md`

已观察到的 V3 相关方向：

- `apps/production-runtime` 是 Production Runtime 本体，不是共享 package。
- `packages/production-contracts` 当前尚未存在，后续适合承载 action / run / candidate / approval 类型。
- `packages/domain` 适合沉淀剧本、情境、内容单元、关键帧、时间线、素材、任务、交付等核心对象定义和状态机。
- 前端应逐步从全局聊天入口转向 `ActionRail`、`RunTimeline`、`CandidateReview`、`ApplyPreview`、`ProductionHistory`。
- 当前 `apps/production-runtime` 已存在，但内部仍保留较多 `agent/chat/thread` 命名；下一步应在其内部新增 `src/production/` 概念层，而不是继续扩展旧聊天模型。
- 当前 V2 剧本预演薄切片已有 `script-preview` draft/analyze/generate-preview 接口，可作为 V3 mock executor 临时对接点。
- `apps/production-runtime/src/production/` 已建立第一版内部概念层，当前类型和 store 仍位于 runtime app 内，后续稳定后再抽 `packages/production-contracts`。
- 当前 `/production/*` HTTP API 已存在，server 默认使用 `FileProductionStore` 持久化 run/candidate；单元测试仍可使用 `InMemoryProductionStore`。
- 当前 V2 fallback client 支持 `AnalyzeScriptToSections -> POST /projects/:id/script-preview/analyze` 和 `GenerateKeyframeCandidates -> POST /projects/:id/script-preview/generate-preview`，默认关闭。
- 当前 runtime-local candidate lifecycle API 已存在，可标记 `accepted` / `rejected` / `revised` / `superseded`，但不会应用到 V2 正式事实。
- 当前 runtime-local apply preview API 已存在，可说明候选未来对应的 V2 data action、当前是否 blocked、以及缺少哪些上下文；它仍不会调用 V2 或写正式事实。
- 当前 deterministic executor 支持 `AnalyzeScriptToSections`、`ExtractSituations` 和 `GenerateKeyframeCandidates`；其余第一批 action 仍只登记契约，尚未生成候选。

本次新增/修改：

- `apps/production-runtime/src/production/deterministicExecutor.ts`
- `apps/production-runtime/src/production/runtime.test.ts`
- `docs/movscript-v3-progress.md`

## 当前产品决策

### 决策 1：V3 只负责智能编排和候选生成

V3 runtime 负责目标解析、计划生成、步骤执行、模型调用、工具调用和候选结果生成。V3 不直接拥有正式事实，也不绕过 V2 数据动作 API 写数据库。

### 决策 2：AI 输出默认是候选

AI 生成内容必须先进入候选态：

```text
candidate -> accepted
candidate -> rejected
candidate -> revised -> accepted
```

候选被用户确认前，不能污染核心事实。

### 决策 3：后端可信，不负责聪明

后端负责权限、审计、版本、资源索引、任务记录、候选存储、采用和回滚。后端不负责具体 AI workflow、提示词编排或多步骤 agent planning。

### 决策 4：V2 / V3 通过文档化契约协作

V2 窗口维护对象、状态和数据动作 API；V3 窗口维护 ProductionAction、ProductionRun、ProductionCandidate、Approval 和 runtime 编排。任一侧改契约，必须更新对应文档。

### 决策 5：聊天只作为 escape hatch

自由对话可以保留为兜底入口，但主产品形态应是动作、候选、确认和历史，而不是全局聊天助手。

### 决策 6：ProductionAction 契约独立成文档

第一批 action 契约维护在 `docs/movscript-v3-action-contract.md`。`docs/movscript-v3-plan.md` 保持方向和路线图，不继续承载过细字段清单。

### 决策 7：薄切片接口只作为临时 fallback

当前 `/script-preview/analyze` 和 `/script-preview/generate-preview` 可以服务 V3 mock/deterministic executor，但不能替代长期的候选 upsert/apply 数据动作。

### 决策 8：V3 runtime API 从 `/production/*` 开始

第一版 V3 Production Runtime HTTP API 使用 `/production/actions`、`/production/runs` 和 `/production/candidates`，避免继续扩大旧 `/chat`、`/threads`、`/runs` 产品模型。

### 决策 9：production store 默认文件持久化，测试保留内存态

`apps/production-runtime/src/server.ts` 默认使用 `FileProductionStore`，避免 `/production/*` 产生的 run/candidate 在 runtime 重启后丢失。`InMemoryProductionStore` 保留给单元测试和短生命周期内嵌调用。

### 决策 10：V2 fallback 是显式 opt-in

`ScriptPreviewV2FallbackClient` 默认关闭。只有显式配置 `MOVSCRIPT_PRODUCTION_V2_FALLBACK_ENABLED=true` 时才允许 runtime 调用 V2 薄切片接口；fallback 失败只能记录 warning，不能改变候选状态或写正式事实。

### 决策 11：candidate lifecycle 先保持 runtime-local

`/production/candidates/:id/accept|reject|revise|supersede` 只维护 runtime candidate 的审查状态和最小审计字段。`accepted` 不是 V2 canonical object 的采用结果，真正 apply 仍必须等待 V2 数据动作 API 和显式审批契约。

### 决策 12：apply preview 只做门禁预览

`/production/candidates/:id/apply-preview` 只表达当前候选能否进入 apply gate、未来应调用哪个 V2 data action、以及缺少哪些上下文。它不调用 V2 fallback，不调用 V2 apply，不写正式事实；因此当前返回只能是 `blocked` 或 `not_applicable`，不能返回已应用成功。

### 决策 13：V2 fallback 只服务临时薄切片写回

`AnalyzeScriptToSections` 和 `GenerateKeyframeCandidates` 的 V2 fallback 都只是 V3 runtime 到当前 V2 剧本预演薄切片的临时写回边界。fallback 成功不代表 canonical apply，失败不丢弃 runtime candidate；长期仍要替换为明确的 `Upsert*Candidates` 数据动作。

### 决策 14：ExtractSituations 暂不增加 V2 fallback

当前 V2 还没有专用 `UpsertSituationCandidates` 薄切片接口，因此 `ExtractSituations` 只在 runtime-local run/candidate store 中产出 `situation` candidates。后续应等 V2 数据动作 API 稳定后再接入写回，不复用现有 `script-preview/analyze` 作为隐式情境写入。

## 下一步任务

### Next 8：补齐 GenerateStoryboardScript deterministic executor

目标：

```text
在 production-runtime 内为 GenerateStoryboardScript 建立最小 deterministic executor，让剧本节 / 情境上下文可以生成 runtime-local storyboard_script candidates，但不调用 V2、不写正式事实。
```

建议交付标准：

- 不改 V2 后端数据模型，不直接写数据库核心表。
- 不新增 V2 fallback；只生成 runtime-local candidate。
- `GenerateStoryboardScript` 可从以下输入读取上下文：

```text
inputContext.script_sections / scriptSections
inputContext.situations / situations
inputContext.storyboard_rows / storyboardRows optional
inputContext.duration_target / durationTarget optional
```

- 生成 `storyboard_script` candidates，payload 至少包含：

```text
client_id
order
title
body
duration_seconds
status
adoption_intent
source_section_id optional
situation_id optional
source_ref
confirm_question
```

- 输出状态仍为 `candidate`，run 状态为 `waiting_approval`。
- 无有效输入时应 failed，且不写 candidate。
- apply preview 应能映射 `storyboard_script -> UpsertStoryboardSuggestions`。
- 补充测试覆盖：
  - script sections + situations 生成 storyboard_script candidates。
  - 仅 script sections 时可生成 storyboard_script candidates。
  - existing storyboard rows 可作为 source_ref / 去重上下文，但不被直接覆盖。
  - 无有效输入失败且 candidates 为空。
  - storyboard_script apply preview 返回 `UpsertStoryboardSuggestions`，但仍 blocked / not_applicable。

## 每次会话结束必须更新

推进者结束前应更新以下字段：

```text
## 已完成
## 当前代码状态摘要
## 当前产品决策
## 下一步任务
## 验证记录
## 遗留问题
```

如果代码有改动，必须写清：

- 改了哪些文件。
- 为什么这么改。
- 是否运行测试。
- 测试结果。
- 没有运行测试的原因。

## 验证记录

### 2026-05-01 ExtractSituations deterministic executor

- 本次新增/修改代码：
  - `apps/production-runtime/src/production/deterministicExecutor.ts`
  - `apps/production-runtime/src/production/runtime.test.ts`
- 本次更新文档：
  - `docs/movscript-v3-progress.md`
- 已运行验证：

```text
pnpm --dir apps/production-runtime typecheck
pnpm --dir apps/production-runtime test
```

- 结果：

```text
typecheck passed
test passed: 64 tests
```

- 未运行前端或后端测试；本切片未改前端和后端代码，也未改 V2 数据模型。

### 2026-05-01 GenerateKeyframeCandidates V2 fallback 边界

- 本次新增/修改代码：
  - `apps/production-runtime/src/production/v2FallbackClient.ts`
  - `apps/production-runtime/src/production/runtime.ts`
  - `apps/production-runtime/src/production/runtime.test.ts`
- 本次更新文档：
  - `docs/movscript-v3-progress.md`
- 已运行验证：

```text
pnpm --dir apps/production-runtime typecheck
pnpm --dir apps/production-runtime test
```

- 结果：

```text
typecheck passed
test passed: 60 tests
```

- 未运行前端或后端测试；本切片未改前端和后端代码，也未改 V2 数据模型。

### 2026-05-01 Production Approval / Apply Preview 最小契约

- 本次新增/修改代码：
  - `apps/production-runtime/src/production/types.ts`
  - `apps/production-runtime/src/production/runtime.ts`
  - `apps/production-runtime/src/production/index.ts`
  - `apps/production-runtime/src/production/runtime.test.ts`
  - `apps/production-runtime/src/server.ts`
- 本次更新文档：
  - `docs/movscript-v3-progress.md`
- 已运行验证：

```text
pnpm --dir apps/production-runtime typecheck
pnpm --dir apps/production-runtime test
```

- 结果：

```text
typecheck passed
test passed: 57 tests
```

- 未运行前端或后端测试；本切片未改前端和后端代码，也未改 V2 数据模型。

### 2026-05-01 Production Candidate lifecycle 最小 API

- 本次新增/修改代码：
  - `apps/production-runtime/src/production/types.ts`
  - `apps/production-runtime/src/production/store.ts`
  - `apps/production-runtime/src/production/runtime.ts`
  - `apps/production-runtime/src/production/index.ts`
  - `apps/production-runtime/src/production/runtime.test.ts`
  - `apps/production-runtime/src/server.ts`
- 本次更新文档：
  - `docs/movscript-v3-progress.md`
- 已运行验证：

```text
pnpm --dir apps/production-runtime typecheck
pnpm --dir apps/production-runtime test
```

- 结果：

```text
typecheck passed
test passed: 54 tests
```

- 未运行前端或后端测试；本切片未改前端和后端代码，也未改 V2 数据模型。

### 2026-05-01 ProductionRun/Candidate 持久化与 V2 fallback 边界

- 本次新增/修改代码：
  - `apps/production-runtime/src/production/store.ts`
  - `apps/production-runtime/src/production/runtime.ts`
  - `apps/production-runtime/src/production/index.ts`
  - `apps/production-runtime/src/production/v2FallbackClient.ts`
  - `apps/production-runtime/src/production/runtime.test.ts`
  - `apps/production-runtime/src/server.ts`
- 本次更新文档：
  - `docs/movscript-v3-progress.md`
- 已运行验证：

```text
pnpm --dir apps/production-runtime typecheck
pnpm --dir apps/production-runtime test
```

- 结果：

```text
typecheck passed
test passed: 51 tests
```

- 未运行前端或后端测试；本切片未改前端和后端代码。

### 2026-05-01 production-runtime action 概念层

- 本次新增/修改代码：
  - `apps/production-runtime/src/production/types.ts`
  - `apps/production-runtime/src/production/store.ts`
  - `apps/production-runtime/src/production/deterministicExecutor.ts`
  - `apps/production-runtime/src/production/runtime.ts`
  - `apps/production-runtime/src/production/index.ts`
  - `apps/production-runtime/src/production/runtime.test.ts`
  - `apps/production-runtime/src/server.ts`
- 本次更新文档：
  - `docs/movscript-v3-progress.md`
- 已运行验证：

```text
pnpm --dir apps/production-runtime typecheck
pnpm --dir apps/production-runtime test
```

- 结果：

```text
typecheck passed
test passed: 48 tests
```

- 未运行前端或后端测试；本切片未改前端和后端代码。

### 2026-05-01 ProductionAction 最小契约

- 本次只新增/修改文档：
  - `docs/movscript-v3-action-contract.md`
  - `docs/movscript-v3-plan.md`
  - `docs/movscript-v3-progress.md`
- 已通过读取现有代码确认当前 V2 剧本预演接口位于：
  - `apps/backend/internal/handler/script_preview.go`
  - `apps/backend/internal/v2/scriptpreview/service.go`
  - `apps/frontend/src/api/scriptPreview.ts`
- 未运行前端、后端或 runtime 测试；本切片未改可执行代码。

### 2026-05-01 初始记录

- 本次只新增/修改文档。
- 未运行前端或后端测试。

## 遗留问题

- `packages/production-contracts` 尚未存在；应等 `apps/production-runtime/src/production/` 的类型稳定一轮后再抽包。
- `apps/production-runtime` 当前已新增 `src/production/`，但旧 `agent/chat/thread` 命名仍大量存在，需要逐步迁移入口、环境变量和前端调用命名。
- V2 的候选写入 API 仍在演进，V3 第一批 action 应先通过文档契约对接，不直接依赖未稳定实现。
- `/production/*` 当前已有 create/list/get、candidate accept/reject/revise/supersede 和 apply-preview；仍没有 run cancellation 或真正的 approval/apply API。
- `FileProductionStore` 当前是 runtime-local JSON 文件持久化，不是后端可信状态，也没有并发写入锁。
- `accepted` candidate 目前只表示 runtime-local 审查状态，不代表已经应用到 V2 canonical objects；apply preview 也只会返回 blocked / not_applicable。
- deterministic executor 目前只覆盖 `AnalyzeScriptToSections`、`ExtractSituations` 和 `GenerateKeyframeCandidates`，尚未覆盖 `GenerateStoryboardScript`、`PrepareAssetRequirements`、`BuildPreviewTimelineProposal`。
- `AnalyzeScriptToSections` 当前只基于段落/句子做简单拆分，没有调用模型；V2 `script-preview/analyze` fallback 已有边界但默认关闭。
- `ExtractSituations` 当前只从已有 section / storyboard row / source text 做 deterministic 归一化，不调用模型，也不写回 V2 situation candidate API。
- `GenerateKeyframeCandidates` 当前只基于 storyboard rows / content units 做简单 keyframe candidate，不调用图像或视频生成服务；V2 `script-preview/generate-preview` fallback 已有边界但默认关闭。

## 单句推进模板

用户可以在新会话发送：

```text
继续推进 MovScript V3 重构。请先读 docs/movscript-v3-progress.md 和 docs/movscript-v3-plan.md，按 progress 里的下一步任务推进，结束前更新 progress。
```
