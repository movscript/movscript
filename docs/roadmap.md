# Roadmap

This roadmap tracks larger product and architecture work that is not yet complete. It is intentionally scoped to durable directions rather than short bug lists.

## Canvas and Entity Workflow

The near-term direction is to make workflow canvases operate on production entities directly. Media resources remain important, but the core workflow target is the set of project entities: scripts, settings, assets, episodes, scenes, storyboards, shots, and final videos.

### Current Baseline

- Canvas tasks can record port-level `input_values` and `output_values`.
- Workflow canvases and individual nodes can be run through the backend.
- Backend entity workflow schemas expose field metadata, port ids, value types, control hints, binding roles, and i18n keys.
- Entity canvas nodes prefer backend schema ports and labels, with local hardcoded ports only as fallback.

### P0: Stabilize Entity-Centric Workflows

- Extract entity read/write behavior from `canvas_exec.go` into a dedicated backend workflow service.
  - Target shape: `ReadPorts(ctx, kind, id)` and `WritePorts(ctx, kind, id, values, meta)`.
  - Canvas execution should call this service instead of knowing table fields for every entity kind.

- Make backend schema the source of truth for entity write behavior.
  - Use schema mappings for field writes, resource binding role, binding slot, primary flag, and multiplicity.
  - Keep old switch statements only as temporary compatibility code.

- Add backend port validation.
  - Validate required inputs.
  - Validate value type compatibility.
  - Enforce `maxCount`.
  - Reject writes to fields that are not marked writable.
  - Reject reads from fields that are not marked readable.

- Add entity write audit logs.
  - Record canvas id, run id, node id, port id, entity kind/id, user id, old value, new value, and resource binding ids.
  - Use this for debugging, rollback, review, and production traceability.

### P1: Complete the Port Value Runtime

- Implement native structured value propagation.
  - `text`, `json`, `number`, and `boolean` should flow as `CanvasPortValue` data.
  - Create `RawResource` records only when a media file, attachment, or persisted resource is needed.

- Unify full-canvas and single-node execution.
  - Replace duplicated workflow loop behavior with one `executeNode` path.
  - Full workflow execution should become topological scheduling over the same node executor.

- Add a single-node runtime input form.
  - When a node has unconnected required inputs, render a form from input port/schema metadata.
  - Submit those values to `POST /canvases/:id/nodes/:nodeId/run`.

- Add a task input/output inspector.
  - Show each task's input ports, output ports, resources, inline values, errors, and timestamps.
  - Use `input_values` and `output_values` as the primary data source.

- Backfill or lazily upgrade old task output data.
  - Old tasks with only `resource_id` should still render as a `result`/`value` output.
  - Consider a migration or lazy writeback when a task is fetched.

### P1: Schema-Driven Product UI

- Reuse entity workflow schema in entity detail pages.
  - Details pages should use the same field ids and i18n keys as workflow nodes.
  - Schema can drive labels, controls, grouping, readonly state, and validation.

- Expand schema layout expressiveness.
  - Support resource galleries.
  - Support related entity lists.
  - Support readonly computed fields.
  - Support nested storyboard/shot views where needed.

- Keep frontend rendering semantic, not pixel-driven.
  - Backend should describe fields, controls, validation, and grouping.
  - Frontend should keep ownership of actual React components, spacing, and design-system behavior.

### P2: Plugin and Extensibility Runtime

- Bring plugin canvas nodes into the backend workflow model.
  - Define whether plugins run in a backend runtime, a trusted local runtime, or a callback boundary.
  - Make plugin inputs and outputs compatible with `CanvasPortValue`.

- Version entity schemas.
  - Add `schemaVersion`.
  - Support port aliases and deprecated fields.
  - Ensure old canvases and old task histories continue to load after schema changes.

- Remove local entity port fallbacks once backend schema is mature.
  - `ENTITY_PORTS` in the frontend should shrink to a minimal emergency fallback or disappear.

## API Documentation

- Document workflow schema routes in `docs/api.md`.
- Document canvas task port values and execution semantics.
- Document entity write audit APIs after the audit model lands.

## Agent Runtime and Platform Operations

The near-term Agent direction is to keep one text-model path and make the platform operation loop reliable before introducing separate planner, multimodal, summarizer, or role-specific models. The Agent should first become a dependable local collaborator that can read MovScript context, create safe drafts, request approval for risky work, and explain its actions in debug tooling.

### Current Baseline

- The right-side Agent panel has been simplified to a single MovScript Agent experience.
- User-facing custom Agent configuration is removed from the main flow; the Agent Debug page remains.
- The local `movscript-agent` owns threads, runs, plans, approvals, memories, skills, tool metadata, and runtime policy.
- Built-in Agent skills and tool metadata live in `apps/agent/catalog/skills` and `apps/agent/catalog/tools`.
- First-stage skills and smoke scenarios are documented in `docs/agent/platform-skills-tools.md` and `docs/agent/smoke-tests.md`.
- Current safe tools can read context, search/read project entities, create/list local drafts, and navigate the UI.

### P0: Prove the End-to-End Agent Loop

- Run the smoke scenarios against a real local project with backend, Electron frontend, and `movscript-agent` all running.
  - Current project progress summary.
  - Scene/storyboard/shot gap review.
  - Shot draft creation with confirmation-before-formal-write language.
  - Existing draft listing.

- Tighten planner behavior from observed runs.
  - Improve entity type and title/ID recognition.
  - Improve Chinese intent detection for progress, review, creation, and lookup requests.
  - Make tool ordering explicit: context first, search/read second, draft third.
  - Add regression tests for failed or ambiguous planner cases.

- Keep Debug as the source of truth for diagnosis.
  - Confirm selected skills, available tools, prompt preview, plan, tool calls, blocked reasons, and approvals are inspectable.
  - Ensure every smoke failure can be explained from Debug output without guessing.

### P0: Productize Drafts

- Move drafts out of transient MCP server memory.
  - Prefer a backend-backed draft model if drafts should be shared across sessions/users.
  - Use a file-backed local draft store only if drafts are intentionally local runtime state.

- Define draft shape and lifecycle.
  - Draft kind: script, setting, storyboard, shot, prompt, note, pipeline.
  - Source reference: entity type/id, pipeline node id, run id, user id.
  - Status: draft, accepted, rejected, applied, superseded.
  - Audit metadata: created by Agent run, updated at, applied by user.

- Add draft UI.
  - List drafts in the Agent panel or project workspace.
  - Show draft content, source entity, originating run, and intended apply target.
  - Let users accept, reject, or keep for later.

### P0: Implement `apply_draft` Approval Chain

- Add a formal `movscript.apply_draft` tool implementation.
  - It must be registered as `write` risk.
  - It must require approval by default.
  - It must never run without explicit user approval.

- Make draft application target-specific.
  - Applying a script draft should map to script fields.
  - Applying a storyboard draft should map to storyboard fields.
  - Applying a shot draft should map to shot fields.
  - Applying a note draft may create review/comment metadata rather than overwrite content.

- Add before/after review.
  - Show exact target, current value, proposed value, and risk.
  - Record audit log entries for applied changes.
  - Keep rejected draft state and rejection reason.

### P1: Expand Tool Coverage

- Add project workflow and pipeline tools.
  - `movscript.read_pipeline`
  - `movscript.search_pipeline_nodes`
  - `movscript.create_pipeline_draft`
  - `movscript.open_pipeline_node`

- Add resource and attachment understanding tools.
  - Read resource metadata and bindings.
  - Bind drafts to resources or entities.
  - Surface resource usage across scripts, storyboards, shots, and generation jobs.

- Add generation tools only behind strong approval.
  - `movscript.create_generation_job`
  - Include model, cost/credit impact, input resources, prompt, aspect ratio, and target entity.
  - Require explicit approval before cost-bearing execution.

### P1: Strengthen Context Packs

- Expand `movscript.get_context_pack`.
  - Include current workspace mode, active entity, active pipeline node, selected resources, recent edits, and visible page scope.
  - Include compact project progress summaries where cheap to compute.
  - Include active draft/run references when the user is reviewing Agent output.

- Improve entity summaries.
  - Keep summaries small enough for prompt use.
  - Include fields needed for production decisions: status, approval state, linked resources, parent/child relationships, and updated timestamps.
  - Avoid exposing raw file bytes or private storage URLs.

### P1: Improve Planner and Model Planner Reliability

- Keep deterministic rule planner as the safety fallback.
  - Add tests for project progress, storyboard review, shot draft creation, draft listing, and ambiguous references.
  - Add explicit no-tool paths for general knowledge or non-project chat.

- Harden model planner usage.
  - Use a strict JSON shape and reject unavailable tools.
  - Record fallback warnings when model planning fails.
  - Keep policy enforcement independent of model output.

- Do not introduce model roles until the single-model loop is stable.
  - Future roles may include planner, multimodal, summarizer, and final response models.
  - They should be added only after tool flow, drafts, approvals, and debug traces are reliable.

### P1: Complete Approval and Permission UX

- Formalize risk behavior.
  - `read`: automatic.
  - `draft`: automatic.
  - `ui`: automatic or light notice.
  - `write`: approval required.
  - `generate`: approval required with cost/model details.
  - `destructive`: second confirmation.

- Improve approval UI.
  - Show exact tool, target, arguments, risk, and expected side effect.
  - Support approving/rejecting individual tool calls.
  - Preserve approval/rejection history on the run.

### P1: Agent Debug Enhancements

- Add a single-run timeline.
  - Planning step.
  - Tool calls.
  - Approval pauses.
  - Final assistant response.
  - Memory writes.

- Add better tool diagnostics.
  - Show tool input/output.
  - Show policy decision: available, blocked, approval required, missing project, missing permission, denied, MCP unavailable.
  - Show prompt size or approximate token length.

- Add one-click smoke scenario execution.
  - Let maintainers run the documented smoke prompts from the Debug page.
  - Save run ids and results for comparison.

### P2: Multimodal Attachment Understanding

- Convert attachments into usable context before agent planning.
  - Image captions.
  - Video keyframe summaries.
  - Audio transcription.
  - Text/subtitle parsing.

- Store understanding results as resource context.
  - Link understanding output to resource ids.
  - Make it clear when the Agent only has metadata versus actual media understanding.

### P2: Memory System Refinement

- Define memory write policy.
  - User preferences.
  - Project facts.
  - Creative decisions.
  - Draft records.
  - Risks and recurring review notes.

- Avoid long-lived bad memory.
  - Do not store uncertain inferences as facts.
  - Prefer project-scoped memories for project decisions.
  - Add deletion and review flows for incorrect memories.

### P2: Platform Agent Profiles

- Introduce platform-managed profiles only after the default loop is stable.
  - Default coordinator.
  - Writer.
  - Storyboard/shot planner.
  - Producer/reviewer.

- Keep profiles administrator/platform-owned.
  - Do not reintroduce user-facing custom Agent configuration until the runtime contract is stable.
  - Profiles should mainly vary skills, tool grants, permission defaults, and response style.
