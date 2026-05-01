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

本次新增/修改：

- `docs/movscript-v3-progress.md`
- `docs/movscript-v3-plan.md`
- `docs/movscript-v3-action-contract.md`

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

## 下一步任务

### Next 2：在 production-runtime 建立 action 概念层

目标：

```text
在 apps/production-runtime 中新增 V3 action 概念层，用 deterministic/mock executor 跑通 ProductionAction -> ProductionRun -> ProductionCandidate 的最小链路。
```

建议交付标准：

- 不改 V2 后端数据模型，不直接写数据库核心表。
- 优先新增或整理：

```text
apps/production-runtime/src/production/
```

- 第一版可以只实现：

```text
action type definitions
run / step / candidate DTO
deterministic executor for AnalyzeScriptToSections
optional deterministic executor for GenerateKeyframeCandidates
```

- 如果暴露 HTTP API，应使用 `/production/*` 新路径，避免继续扩大 `/chat` 或 `/threads` 产品模型。
- 可以暂时复用现有 runtime store / planner / policy 代码，但面向 V3 的导出命名应使用 `ProductionAction`、`ProductionRun`、`ProductionCandidate`。

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
- `apps/production-runtime` 当前代码形态已确认存在，但仍保留较多 legacy `agent/chat/thread` 命名，需要逐步新增 V3 production 概念层并迁移。
- V2 的候选写入 API 仍在演进，V3 第一批 action 应先通过文档契约对接，不直接依赖未稳定实现。
- 需要决定第一版 `/production/*` runtime API 的最小路由形态，例如 `POST /production/actions`、`GET /production/runs/:id`、`GET /production/candidates/:id`。

## 单句推进模板

用户可以在新会话发送：

```text
继续推进 MovScript V3 重构。请先读 docs/movscript-v3-progress.md 和 docs/movscript-v3-plan.md，按 progress 里的下一步任务推进，结束前更新 progress。
```
