# Roadmap

This roadmap tracks larger product and architecture work that is not yet complete. It is intentionally scoped to durable directions rather than short bug lists.

## Canvas and Entity Workflow

The near-term direction is to make workflow canvases operate on production entities directly. Media resources remain important, but the core workflow target is the set of project entities: scripts, settings, assets, episodes, scenes, storyboards, shots, and final videos.

### Current Baseline

- Canvas tasks can record port-level `input_values` and `output_values`.
- Workflow canvases and individual nodes can be run through the backend.
- Backend entity semantic schemas expose field metadata, value types, control hints, binding roles, i18n keys, storage mappings, validation, and IO capabilities.
- Workflow entity schemas are projections from the semantic schema layer, so workflow ports do not become the source of truth for product entities.
- Entity canvas nodes use backend schema ports and labels.
- Entity canvas reads and writes are routed through `workflow.EntityIOService` (`ReadPorts` / `WritePorts`) instead of being implemented directly in canvas execution.
- Direct entity field reads and writes use backend schema storage mappings. Computed or cross-table ports are kept as explicit workflow-service overrides.
- Entity project lookup and stored field updates use workflow-service table/schema mappings, keeping per-entity model switches out of canvas execution.
- Backend write validation rejects unknown ports, readonly ports, incompatible value types, missing inline/resource values, and resource counts beyond schema limits.
- Entity writes create `CanvasEntityWriteAudit` records with canvas/run/node/port/entity/user context, old/new values, and resource binding ids.
- Full-canvas and single-node runs reject unconnected required inputs, with backend test coverage.
- Entity read-port validation is available for future caller-selected output-port APIs.
- Entity write audit records can be read through an API filtered by canvas id, run id, entity kind/id, and user.
- Canvas task APIs lazily normalize legacy `resource_id`-only outputs into `output_values` with semantic `result`/`value` handles.
- The canvas editor includes a task input/output inspector for the selected node and selected run.
- The canvas editor prompts for unconnected required single-node runtime inputs, submits typed `CanvasPortValue` data, and shows the resulting node task in the inspector.
- Entity workflow schemas include `schemaVersion`, alias/deprecated metadata, readonly state, validation hints, and layout hints.
- Backend workflow execution supports `CanvasExecutableSpec.executor = "plugin_http"` for enabled trusted HTTP plugin tools.
- Inline `text`, `json`, `number`, and `boolean` values propagate as `CanvasPortValue` data; `RawResource` records are reserved for persisted media/resource artifacts.
- Full-canvas runs use a topological execution plan and execute nodes through the same `executeCanvasNode` path used by single-node runs.
- The frontend no longer maintains per-entity local port maps or generic entity port fallbacks; entity nodes require backend schema ports.
- A shared `EntitySemanticForm` can render editable detail fields and resource binding controls from entity semantic schemas, with per-field renderers and form slots for hybrid composition.
- Asset, scene, storyboard, shot, setting, episode, final-video, and script detail surfaces use the semantic-schema-driven form for core editable fields while preserving domain-specific editors around it.

### P1: Semantic-Schema-Driven Product UI

- Finish polishing semantic-schema-driven entity detail pages.
  - Details pages and workflow nodes should share semantic field ids, i18n keys, binding roles, readonly state, and validation.
  - Detail UI should consume a UI/detail projection of the semantic schema, not the workflow-port projection.
  - Workflow schema remains a runtime port projection and must not become the source of truth for entities.
  - Keep richer domain-specific editors composed as field renderers or slots instead of forking duplicate field definitions.

- Expand schema layout expressiveness.
  - Support resource galleries.
  - Support related entity lists.
  - Support readonly computed fields.
  - Support nested storyboard/shot views where needed.

- Keep frontend rendering semantic, not pixel-driven.
  - Backend should describe fields, controls, validation, and grouping.
  - Frontend should keep ownership of actual React components, spacing, and design-system behavior.

### P2: Plugin and Extensibility Runtime

- Version entity semantic schemas and their projections.
  - Support port aliases and deprecated fields.

## API Documentation

- Keep canvas task port values and execution semantics current as the runtime evolves.

## Agent Runtime and Platform Operations

The near-term Agent direction is to keep one text-model path and make the platform operation loop reliable before introducing separate planner, multimodal, summarizer, or role-specific models. The Agent should first become a dependable local collaborator that can read MovScript context, create safe drafts, request approval for risky work, and explain its actions in debug tooling.

### Current Baseline

- The right-side Agent panel has been simplified to a single MovScript Agent experience.
- User-facing custom Agent configuration is removed from the main flow; the Agent Debug page remains.
- The local `movscript-agent` owns threads, runs, plans, approvals, memories, skills, tool metadata, and runtime policy.
- Built-in Agent skills and tool metadata live in `apps/agent/catalog/skills` and `apps/agent/catalog/tools`.
- First-stage skills and smoke scenarios are documented in `docs/agent/platform-skills-tools.md` and `docs/agent/smoke-tests.md`.
- Current safe tools can read context, search/read project entities, create/list local drafts, and navigate the UI.
- The frontend local-runtime path now sends structured `clientInput` instead of owning prompt/context assembly; `movscript-agent` builds the runtime envelope.

### P0: Keep Frontend as Display Layer

- Treat `movscript-agent` or a future Agent Gateway as the only owner of agent core logic.
  - Frontend may send user text, attachment/resource references, route, active project, selection, and lightweight UI labels.
  - Frontend must not build system prompts, skills prompts, tool prompts, planner inputs, or final model synthesis prompts.
  - Frontend must not convert user-facing agent settings into executable manifest/tool grants.

- Stabilize the Agent Provider Contract.
  - `POST /threads`
  - `POST /threads/:id/messages` with `clientInput`
  - `POST /runs`
  - `GET /runs/:id`
  - `POST /runs/:id/approve`
  - `POST /runs/:id/reject`
  - `GET /capabilities`
  - `POST /runs/preview`

- Move remaining provider-specific UI state behind runtime data.
  - Thread list should prefer runtime thread summaries.
  - Debug should render runtime envelope/trace, not frontend-built payloads.
  - Agent profile selection should be resolved by runtime or backend, then exposed as a manifest/profile id.

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
