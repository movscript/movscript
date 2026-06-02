# Agent Runtime Refactor Plan

## Conclusion

MovScript agent does not need to copy Claude Code's command runtime wholesale. The right refactor is to keep the current service/runtime graph shape, then make the hidden runtime contracts explicit:

- tool contract: execution semantics, permission decision, validation, result shaping
- context contract: transcript as source of truth, model context as a budgeted projection
- skill contract: discover, activate, explain why active, explain why omitted
- console contract: show ownership and runtime effect separately instead of mixing config file grants, catalog discovery, and current availability

Every refactor phase should start by rereading the matching Claude Code implementation and documenting the specific behavior being copied, adapted, or rejected.

## Claude Code References To Recheck

- `claude-code-rev/src/Tool.ts`
  - `isConcurrencySafe`, `isReadOnly`, `isDestructive`, `interruptBehavior`, `maxResultSizeChars`, `validateInput`, `checkPermissions`
- `claude-code-rev/src/services/tools/toolExecution.ts`
  - schema validation, permission decision, pre/post hooks, execution telemetry, result shaping
- `claude-code-rev/src/services/tools/toolOrchestration.ts`
  - partition concurrent-safe tools from serial tools
- `claude-code-rev/src/query.ts`
  - result budget, history snip, context collapse, autocompact before model calls
- `claude-code-rev/src/tools/ToolSearchTool/prompt.ts`
  - deferred tool discovery and activation
- `claude-code-rev/src/utils/toolResultStorage.ts`
  - large result persistence with preview/ref projection

Treat these paths as review targets, not import targets; `claude-code-rev` is source-map restored reference code, not a dependency.

## Refactor Working Rule

For each phase:

1. Re-open the matching Claude Code files and write down the concrete behavior being copied, adapted, or rejected.
2. Map that behavior to one MovScript-owned boundary, for example `ToolExecutionPipeline`, `ContextManager`, runtime catalog explanation, or frontend Runtime view.
3. Land the smallest backend contract first, then expose it through trace/debug UI, then simplify the settings/run console.
4. Add a regression test that proves the new boundary exists, so later work cannot slide back into scattered policy/context logic.

## Phase 1: Tool Execution Contract

Status: baseline landed.

Create one runtime-level tool contract that both catalog tools and registered runtime tools pass through.

- Add explicit execution metadata:
  - `readOnly`
  - `destructive`
  - `concurrencySafe`
  - `interruptBehavior`
  - `maxResultSizeChars`
  - `resultRefStrategy`
- Return this metadata from `/capabilities`, `/inspect`, and catalog detail views.
- Make execution concurrency use `execution.concurrencySafe` before risk fallback.
- Update the frontend tool console to show runtime execution traits next to policy traits.

## Phase 2: Tool Execution Pipeline

Status: pipeline skeleton, shared gate decision, shared pause request materialization, pipeline-owned pause preflight, and recovery replay guard landed.

Target shape:

```text
ToolCall
  -> resolve RegisteredTool
  -> schema validation
  -> input validation
  -> permission decision
  -> approval/input gate
  -> execute runtime handler or external gateway
  -> result shaping
  -> trace + context projection
```

This should replace the current scattered policy/executor/result handling without changing `runAgentGraph` as the outer loop.

Current implementation:

- `toolExecutionPipeline.ts` resolves the registered tool, normalizes `args`/`arguments`, validates basic JSON schema input, applies sandbox interception, dispatches runtime handlers before the external gateway, and records pipeline stages.
- `toolExecutionPipeline.ts` now has a `policy_gate` stage. `agentGraphToolTurn.ts` passes manifest, resolved capabilities, approved tool names, approval mode, project, and run role into the executor so execution has a defensive policy check instead of trusting the graph policy node blindly.
- `toolExecutionGate.ts` now owns the shared runtime gate decision: user input required, policy allow/deny, approval-required blocked calls, warnings, and normalized allowed calls. `agentGraphPolicyTurn.ts` and `toolExecutionPipeline.ts` both consume this object, so the user-facing pause path and the defensive execution check no longer derive policy reasons separately.
- `toolExecutionGate.ts` also materializes pending approval and pending input request DTOs. `agentGraphPolicyTurn.ts` still decides when to pause and trace, but it no longer owns the shape of approval/input requests.
- `toolExecutionPipeline.ts` now exposes `preflightToolExecutionPipeline`, a batch-level preflight that evaluates the shared gate and materializes pending approval/input actions before the graph decides whether to return `requires_action`. `agentGraphPolicyTurn.ts` now asks this pipeline preflight for pause/allow/deny results instead of directly materializing pause requests.
- Skill activation repair also moved into pipeline preflight. When a blocked tool can be repaired by loading a required skill, the pipeline returns a `repair` result with the allowed repair call; the policy turn only emits the trace and feeds the repair call back into the graph loop.
- Pipeline preflight now exposes a graph-facing `policy` projection (`allowedCalls`, blocked calls, approval-required calls, warnings, and policy result). `agentGraphPolicyTurn.ts` no longer reaches into the raw gate object; it only traces and adapts the pipeline projection back to the graph loop.
- `agentGraphToolTurn.ts` now treats pipeline validation errors as failed tool calls and includes pipeline metadata in traces.
- Tool input schema validation now covers the common catalog JSON Schema constraints used by current tools: `enum`, `const`, `additionalProperties:false`, nested object properties, array `items`/`minItems`/`maxItems`, numeric `minimum`/`maximum`, string length limits, and `anyOf`/`oneOf`/`allOf` composition. Invalid tool args fail in the pipeline before runtime handlers or MCP fallback.
- `toolResultContext.ts` accepts tool-level `maxResultSizeChars` so execution metadata can influence model context projection.
- `/capabilities` tool entries now include a backend-owned `runtime` explanation for registration, grant mode, approval requirement, availability, execution traits, and reason.
- `toolReplayGuard.ts` now prevents recovery resume from re-executing side-effectful tools when the same run already has a completed pre-resume step with the same tool name and input hash. The graph reuses the prior result, emits `tool.call.replay_guard_reused`, records context projection, and keeps rollback evidence without repeating the write/generate/destructive action.

Remaining work:

- Add a dedicated reread/debug API for persisted large result refs if model-facing retrieval beyond trace/debug evidence becomes necessary.

## Phase 3: Result Context And Long Context

Status: stable result refs, tool-result store boundary, projection replay, production file persistence, deletion cleanup, restart recovery verification, trace/debug projection baseline, deterministic prompt budget ledger, prompt-too-long history-collapse retry, routine prompt projection ledgers, and reactive tool-loop/attachment compaction landed.

Adopt Claude Code's principle:

```text
transcript = durable facts
model context = temporary projection
```

Required work:

- Persist large tool results behind stable refs.
- Put only summaries/previews into prompt context.
- Record context drop reasons in the context ledger.
- Add prompt-too-long recovery and deterministic context collapse.
- Expose context projection decisions in debug UI.

Current implementation:

- Oversized tool-result prompt projections now include a stable `tool_result:<call-or-tool>:<sha256>` `resultRef`. The prompt only receives a summary/preview plus lookup metadata, while the runtime return value retains the full ref object for trace/debug indexing.
- Tool-result summaries now stay valid JSON under budget pressure. If the normal summary still exceeds the configured budget, the projection degrades to a smaller structured `omitted_tool_result_summary` payload instead of slicing a JSON string.
- `AgentToolResultStore` now owns the full-result storage boundary for reduced tool results. `agentGraphToolTurn.ts` persists dropped tool results by stable `resultRef`, and `RuntimeTraceReadBridge` exposes `getRunToolResult` / `findRunToolResults` so debug/reread flows no longer have to rely only on trace event payloads.
- `agentGraphToolTurn.ts` now checks the tool result store before recomputing prompt projection. If a matching dropped `resultRef` already exists for the run, it reuses the stored `modelProjection`, preserving the model-visible replacement across retry/resume even if the active context budget changes.
- `FileAgentToolResultStore` provides a file-backed implementation for restoring full tool result records. Production startup now wires it through `resolveAgentToolResultPath(statePath)`, while the router keeps an injectable store so embedded tests and non-persistent runtimes do not write files implicitly.
- `AgentRuntimeRouter.deleteThread` and `deleteAllThreads` now use the deleted run ids returned by the thread bridge to clean up persisted tool-result records, keeping full-result storage aligned with thread/run lifecycle deletion.
- `runtimeRouter.test.ts` now covers process-restart replay end to end: an in-progress run and file-backed tool result projection are restored by a new router, `reconcileRuntimeThreads` pauses it, `resumeInterruptedRun` restarts execution, and the next model turn receives the restored `modelProjection` exactly.
- `context.item_dropped` trace events now carry `resultHash`, `refKey`, and `resultRef` for reduced tool results, so the debug ledger can index dropped-result evidence rather than treating the drop as an opaque context mutation.
- The run debug ledger now exposes dropped tool-result refs through evidence lookup links, making reread/debug workflows point at stable result evidence ids even before a dedicated persisted result store exists.
- Prompt composition now produces a deterministic prompt budget ledger. `contextBudgeter` records the initial system-prompt size, final system-prompt size, ordered budget decisions, part ids, stages (`low_priority`, `secondary`, `examples`), reasons, priorities, and before/after char counts. The same ledger is carried through `promptStats`, `ContextBundle.promptBudget`, prompt trace details, and the run debug ledger.
- Provider prompt-too-long/context-length errors now get one graph-level recovery pass before asking the user to retry manually. The first detected 413/context-length failure emits `context.prompt_too_long_detected`; the graph then collapses current thread-history prompt messages into a short advisory summary, preserves the durable transcript and current tool loop, rebuilds the model context, emits `context.prompt_too_long_recovery`, and retries once. If that retry still fails, the existing model recovery input request path handles it.
- Routine prompt history compaction now carries its own projection ledger: input count, retained count, compacted count, filtered runtime-failure count, summary chars, and decisions for history window compaction, runtime-failure filtering, and retained thread summaries. Prompt traces and the Runtime Context panel expose this so normal history snip uses the same "what entered / what dropped / why" contract.
- Current tool-loop messages and user attachments now emit prompt projection summaries as well. The Runtime Context panel shows tool-loop message/char counts plus attachment counts, inline image counts, metadata-only counts, and projection reasons, so the remaining non-system prompt inputs are visible even before deeper reactive trimming is needed.
- Model turn composition now has a reactive second-stage projection after routine history compaction. If the final model request still exceeds the context window, current tool-loop messages are replaced by a short system summary, and if needed inline image data_url payloads are removed while text attachment metadata remains. The prompt trace records before/after request estimates and decisions for both stages.
- Agent run debug views now include `contextMutations`, preserving context key mutation counts, latest mutation reason, refs, and affected keys without copying full context bodies into the UI.
- Agent run debug views now include `runtimeSummary.context`, so the run page can show prompt event id, context mutation count, and latest mutation reason as a per-run projection summary.
- The run page timeline can show a compact context mutation chain, and the new Runtime tab shows context projection status next to tools and skills.

Claude Code recheck:

- `claude-code-rev/src/utils/toolResultStorage.ts` persists oversized tool results under a session-scoped `tool-results` directory, gives the model a preview message, and tracks replacement decisions by `tool_use_id`.
- Its aggregate message-budget path freezes prior decisions in `ContentReplacementState`, reapplies the exact same replacement string on later turns, and reconstructs that state from transcript records on resume. The important principle is prompt-prefix stability: once the model has seen a result full-size or replaced, future turns should not arbitrarily change that choice.
- `claude-code-rev/src/query.ts` applies `applyToolResultBudget` before snip/microcompact/autocompact/context-collapse. It also keeps context collapse as a read-time projection over durable history, with summaries stored separately from the raw transcript.
- `claude-code-rev/src/services/tools/toolExecution.ts` runs per-tool result processing after tool execution and before emitting the `tool_result` block, so storage/truncation is part of the tool execution contract rather than a UI concern.

Adaptation decision:

- MovScript should keep transcript/run trace as the durable source of truth and treat model prompt content as a projection. The current `resultRef` + `AgentToolResultStore` work implements projection, storage, same-run projection replay, production file persistence, deletion cleanup, and restart recovery replay. The prompt budget ledger now implements the same principle for system prompt collapse decisions: the prompt can be reduced, while trace/debug keeps an auditable record of what was omitted and why.
- MovScript should not expose filesystem paths to the model as Claude Code does. The ref should stay product/runtime scoped: `tool_result:<call-or-tool>:<sha256>`, with lookup through debug evidence or a future read API.

Remaining work:

- Add a model-facing reread path for persisted large result refs if future UX requires the agent itself to retrieve full reduced results, rather than relying on debug evidence and stored projection replay.

## Phase 4: Skill Discovery And Activation

Status: catalog-level runtime explanation baseline landed; per-run prompt/context projection baseline landed; skill-triggered tool grants now flow through the normal tool policy pipeline; dependency/conflict/trigger omission projection landed.

Current pack/config-file/skill layering is useful, but the UI must distinguish:

- installed skill
- enabled by config file
- loaded in current run
- suggested by trigger
- omitted by conflict/dependency/budget

The runtime should expose an explanation object so the frontend does not infer this from scattered fields.

Current implementation:

- `/inspect` skill catalog entries now include `runtime`, an `AgentSkillRuntimeExplanation` owned by the agent backend.
- The explanation currently covers config file role, config-file-enabled state, load mode, default activation, context behavior, dependencies, conflicts, linked tool grants, and a human-readable reason.
- The settings UI's Skill management map now uses this backend explanation for Runtime counts and row metadata instead of recomputing runtime behavior from catalog fields.
- Prompt composition now emits `skillContextProjection` per active skill, including activation reason, context behavior, prompt part id, prompt inclusion state, rendered chars, and budget omission reason/stage when the skill is dropped.
- The run debug Runtime tab now renders that projection so a specific run can answer whether a skill entered the prompt or was omitted by the budget ledger.
- Active skill `toolRefs` now resolve as `grantSource: "skill"` in the same `resolveToolCatalog`/policy path used by manifest grants. Manifest grants still win, including explicit deny, and the resolution records `grantingSkillIds` for explainability.
- Runtime layer resolution now emits `skillOmissions` for non-active candidates, including explicit unloads, missing/inactive dependencies, active conflicts, matched-but-over-limit triggers, non-matching triggers, and manual skills that were available but not loaded. The skill trace and run Runtime tab render these omissions as backend-owned reasons instead of requiring the frontend to infer them.
- Prompt debug details now correlate each prompt event with the latest skill state event and context ledger mutations that existed at that prompt boundary. The run trace UI renders this as a per-prompt Runtime alignment panel, so users can see the loaded/triggered/omitted skill state and context mutation count for that exact model turn instead of only the latest run-wide projection.

Claude Code recheck:

- `claude-code-rev/src/tools/SkillTool/SkillTool.ts` treats skill execution as a tool-driven forked agent with isolated context and usage telemetry.
- `claude-code-rev/src/tools/ToolSearchTool/prompt.ts` separates discovery from availability: deferred tools are named first, full schemas are fetched later.
- `claude-code-rev/src/skills/bundledSkills.ts` keeps bundled skill metadata, allowed tools, context mode, and lazy reference-file extraction in one runtime-owned command object.

Adaptation decision:

- MovScript should not copy Claude Code's `SkillTool` directly, because MovScript already has config files, packs, policies, and active skill state as first-class domain concepts.
- MovScript should copy the boundary: the backend explains why a skill is installed, selected, loadable, active, omitted, or tool-linked; the frontend renders those explanations and does not reverse-engineer runtime behavior.

Remaining work:

- Add model-facing reread/replay affordances only if users need the agent itself to fetch historical per-prompt runtime evidence, beyond the current debug UI and bundle correlation.

## Phase 5: Console Restructure

Status: management-map slices, explicit Catalog / Policy / Runtime view switches, URL-addressable management routes, and per-run Runtime view landed; full page/component separation is still optional.

The Agent settings/debug console should become three separate views:

- Catalog: what exists and where it came from
- Policy: what the active config file grants or denies
- Runtime: what is available now and why

For tools, the row should show:

- source and registration
- config file grant
- approval policy
- runtime availability
- read/write/destructive traits
- concurrency and interrupt behavior
- result context strategy

For skills, the row should show:

- source and trust
- load mode
- current activation state
- dependency/conflict state
- related tool grants
- prompt/context inclusion state

Current implementation:

- Tool rows now prefer `tool.runtime` for grant mode, approval reason, execution traits, and runtime reason.
- Tool management map policy counts now show both config file grants and what the runtime actually sees as allowed/denied/not granted.
- Skill rows and the Skill management map use backend `skill.runtime` for activation, context behavior, config file role, and linked tool grants.
- The settings UI now has explicit `agent-settings-skill-catalog-section`, `agent-settings-skill-policy-section`, `agent-settings-skill-runtime-section`, `agent-settings-tool-catalog-section`, `agent-settings-tool-policy-section`, and `agent-settings-tool-runtime-section` anchors. This separates install/source/governance, config file policy editing, and runtime availability/effect inside the existing settings page.
- The settings UI now puts both Skill and Tool management behind explicit Catalog / Policy / Runtime view switches. Runtime is the default view, and jumps from action items switch Skills/Tools to Policy so users land on the editable policy surface when fixing issues.
- The settings UI now puts the same three layers into clickable management overview cards, ordered Runtime / Policy / Catalog. The current layer is highlighted and each card switches directly to its section, so users can distinguish live runtime state from editable config file policy and install/source catalog data without scanning unrelated controls.
- The settings UI now exposes direct management routes for the layered views: `/agent/settings/skills/runtime`, `/agent/settings/skills/policy`, `/agent/settings/skills/catalog`, `/agent/settings/tools/runtime`, `/agent/settings/tools/policy`, and `/agent/settings/tools/catalog`. URL navigation selects the matching layer and scrolls to the relevant Skills or Tools panel; in-page layer switches keep the URL in sync.
- The settings Configuration Map now includes explicit Skills / Tools management shortcuts for Runtime, Policy, and Catalog. Users can jump directly to the right ownership layer without first opening a mixed management panel.
- Management routes now render as focused views: `/agent/settings/skills/*` hides unrelated model/config-file/tool/snapshot settings and shows only the Skills management panel plus essential runtime/action/readiness sidebars; `/agent/settings/tools/*` does the same for Tools. The full mixed settings page remains available at `/agent/settings`.
- The settings Runtime layer now includes read-only Skill and Tool lists, separate from the Policy editing lists. Skill rows show backend-owned runtime activation/context/config-file-role/tool-link metadata; Tool rows show availability, config file grant, approval reason, execution traits, interrupt behavior, and result context strategy without exposing edit controls. This makes "what can run now and why" visible without mixing it with "what should the config file grant."
- The run page now has a dedicated Runtime tab backed by `runtimeSummary`, with separate panels for per-run skill state, prompt/tool state, and context projection state. This makes the actual run behavior visible without asking users to infer it from static settings.
- The debug workbench now links directly to the Runtime tab and includes context mutation count as a first-class debug metric.
- The Runtime tab now distinguishes pending approvals from policy-derived approval requirements and strategy denials, so users can see whether a tool is waiting on them or blocked by policy.

Remaining work:

- Decide whether the URL-addressable management routes should become physically separate page components after more UI feedback, or whether the current single settings component with routed layer state is enough.
- Extend the per-run Runtime view with any missing budget-specific omission reasons if future runtime pipeline decisions produce evidence beyond the current dependency/conflict/trigger/tool approval state.

## Phase 6: Verification Gates

Each phase should include:

- focused unit tests for the new contract
- protocol typecheck
- agent typecheck
- frontend typecheck
- one UI contract test for visible console behavior
