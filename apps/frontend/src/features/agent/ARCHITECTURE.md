# Agent Frontend Boundaries

This feature keeps provider/runtime facts, timeline projection, and UI render surfaces on separate paths.

## Agent Management Surface

User-facing Agent management is expressed through `AgentProfile`, not raw provider/runtime records. A profile answers who the current assistant is, whether it is enabled, how it is reached at a product level, and where the user can adjust visible settings. Provider kind, runtime API, SDK package, and home/config projection remain infrastructure details.

- `src/features/agent/application/agentProfileModel.ts` is the product projection from provider settings to Agent profiles.
- `AgentConsolePage` is a status overview: current Agent, model summary, capability health, conversations, and attention items. It must not expose provider/catalog/route as Console tabs, runtime selectors, process lifecycle controls, or raw SDK package controls.
- `AgentsPage` chooses the current Agent. It may render a local connection configuration panel only for profiles that need user confirmation of connection source; SDK/on-demand profiles should remain simple user-facing choices.
- `ModelProvidersPage` is a read-only governance view. Admin owns provider, catalog, route, credentials, and route bindings.
- Connection diagnostics may show raw transport facts, but diagnostics should not be the default Agent management path.

## Unified Agent Chat Contract

The unified Agent Chat is one UI over provider-specific protocols. Its domain layer must be the superset that the UI renders; provider protocols are adapted only at infrastructure boundaries.

- Provider-session status helpers, run/task graph data contracts, and re-exported provider contracts live behind `@movscript/core/agent/protocol`, which is a thin re-export entry only. Focused core definitions are split underneath it: attachment/client-input contracts in `agentAttachmentProtocol.ts`, conversation/status projection contracts in `agentConversationProtocol.ts`, telemetry in `agentTelemetry.ts`, generation job/audit contracts in `agentGenerationProtocol.ts`, plan contracts in `agentPlanProtocol.ts`, protocol version in `agentProtocolVersion.ts`, prompt/context/debug preview contracts in `agentPromptDebugProtocol.ts`, run contracts in `agentRunProtocol.ts`, status helpers in `agentStatusProtocol.ts`, task graph contracts in `agentTaskGraphProtocol.ts`, thread/session/message contracts in `agentThreadProtocol.ts`, timeline item/stream/activity contracts in `agentTimelineProtocol.ts`, tool-call contracts in `agentToolProtocol.ts`, trace event/query contracts in `agentTraceProtocol.ts`, media provider contracts in `mediaArtifacts.ts`, provider catalog/tool/skill/capability contracts in `providerCatalog.ts`, approval/input/work/continuation contracts in `providerInteractionProtocol.ts`, model API/config/test contracts in `providerModelProtocol.ts`, provider-session snapshot/event contracts in `providerSessionProtocol.ts`, and shared JSON types in `protocolJson.ts`. Frontend code must import the public contract from `@movscript/core/agent/protocol`; do not keep a frontend compatibility alias.
- Neutral chat protocol and runtime live under `packages/core/src/agent/chat`. Frontend code must import migrated service-level chat modules directly from `@movscript/core/agent/chat`; do not keep frontend compatibility aliases for thread items, notification events, pending server requests, server-request action/form models, runtime state, or response intents. Core owns that service logic and must not import React, UI component types, browser APIs, app-server clients, Codex, MovScript-owned agent internals, or Claude.
- UI renderers live under `src/features/agent/components/agent-chat-*` plus `AgentChatDataSourceShell`. They render only neutral domain values and helper view models. Provider-neutral chat view-model helpers, copy, labels, collapse thresholds, and inspect-section grouping live in `packages/core/src/agent/chat`; frontend keeps component composition, orchestration, and product-specific display classifiers. Renderers must not branch on provider protocol types.
- Agent runtimes are adapted through `src/shared/infrastructure/sdk-runtime` and selected by provider runtime config. The built-in Agents are Codex through `codex-sdk`, Mova through `mova-sdk`, and Claude Code through `claude-sdk`.
- Mova's SDK is Codex-compatible at the interface boundary. Until the package is published, the runtime package must be supplied by local path or environment, for example `MOVSCRIPT_MOVA_SDK_PACKAGE`; default provider config must not point at a non-existent package.
- Normal Agent chat must reach providers through `createAgentChatDataSourceForProvider` and SDK runtime contracts. It must not start app-server processes, depend on provider-session app-server clients, or expose app-server lifecycle as the management path.

Server-initiated requests are first-class chat state, not side effects hidden in a tool row. If a provider asks for approval, user input, elicitation, or a dynamic tool result, the adapter must emit an `AgentChatServerRequest` with enough scoped IDs to resolve it. If the protocol event lacks executable IDs, the adapter must recover them from authoritative pending state or expose the item as non-actionable instead of fabricating an approval path.

`agentChatRuntime` owns the unified chat's runtime state machine in core. Components dispatch provider-neutral events and user intents into the runtime, then render the runtime view selectors. Frontend components keep orchestration concerns: loading a data source, subscribing to notifications, reading canonical threads, routing local events, and syncing browser storage.

Timeline pagination and stream-event merge rules are service-level state logic. `packages/core/src/agent/timelineState.ts` owns item sorting, dedupe, page replacement/merge, reset handling, and stale-event rejection. Frontend timeline hooks fetch pages, subscribe to streams, record performance, and map timeline items into UI messages.

Run profile presets are split by boundary. Permission policy, reviewer routing, permission profile IDs, and fallback sandbox choices live in `packages/core/src/agent/runProfilePreset.ts`; frontend decorates those profiles with labels and descriptions for controls.

Media inputs are neutral resources. Images can remain native image inputs; video, audio, and generic resources travel through mention/resource references with MIME, name, URL, and resource ID metadata preserved where the provider supports it.

## Attachment Source Contract

Attachment reachability is a core protocol fact, not a UI heuristic. `AgentAttachment.source` records where bytes can be resolved from: inline data, a frontend-local `File`, a backend resource ID, a local filesystem path, a model-reachable remote URL, or a display-only URL.

- Frontend upload/paste flows may create object URLs or localhost resource URLs for preview, but those URLs are display-only unless core classifies them as model-reachable.
- Provider-session sends must build attachment refs through `prepareProviderSessionAttachmentRefs` or `providerSessionAttachmentRef`. These helpers resolve local files and backend resources to `data:image/...` only when bytes are available; unresolved local/private URLs stay metadata-only and emit warnings.
- Agent runtime adapters for user input and dynamic tool output must use the same model-reachability rule. Only `data:image/...` and public HTTP(S) URLs become native image inputs; localhost, private-network, blob, file, and relative URLs become mentions/resources/text references.
- History restore keeps local resource images as resource mentions, preserving preview URL metadata for display without reclassifying it as prompt-ready model input.
- New attachment entry points must carry `source` across protocol boundaries instead of deriving behavior from `url` alone.

Agent backend model catalog and default-provider rules are service-level logic. Capability queries, public model IDs, model deduplication, default backend model selection, backend provider refs, and generated provider config fragments live in `packages/core/src/agent`. Frontend wrappers only inject the browser API client, read local settings, and save workspace/provider config.

Sensitive data detection and redaction are service-level safety rules. Secret detection, URL credential stripping, and trace/debug payload redaction live in `packages/core/src/agent/sensitiveData.ts`; frontend surfaces must import these helpers from `@movscript/core/agent` instead of keeping legacy trace helper aliases.

Agent settings snapshot schema, parsing, export normalization, and reference validation are service-level portability rules. They live in `packages/core/src/agent/settingsSnapshot.ts`; frontend keeps file import/export UI and impact preview copy, and must import snapshot helpers from `@movscript/core/agent` instead of keeping compatibility re-exports.

Do not remove old timeline components only because the unified chat exists. They can be deleted only after their routes and owners no longer reference them. New unified-chat work should instead tighten adapter coverage and move render logic into neutral view helpers.

## Message Display Contract

- Chat timeline renders only timeline items with `purpose: "transcript"` and `surface: "message_stream"` for one provider-session thread. `purpose: "transcript"` means conversation text, not prompt eligibility; only `contentPromptEligibility: "include"` can enter model history. The chat view calls `useAgentTimeline` with `requireThread: true`; it must not fall back to session-level message aggregation.
- Thread binding is resolved through `resolveAgentChatProviderSessionBindingIds`. Persisted local bindings win, then conversation provider-session fields, then the timeline stays empty until a thread is known.
- Timeline status, plan revisions, and diagnostics stay in raw timeline state for their owning surfaces. They must carry explicit timeline semantics: `origin`, `purpose`, `surface`, and `contentPromptEligibility`; plan revisions come from `thread.planRevisions`, not assistant message anchors.
- Live run activity belongs in `AgentConversationLiveBlocks` blocks scoped to the active run. It is inserted after the run's user messages and before assistant output.
- Historical run activity attached to a final assistant answer is rendered as a collapsed process summary, not as a replay of every thinking/tool round.
- Pinned generation status reads generation activity from current-thread messages and live activity events. It is a top status surface, not a chat bubble source.
- Active run input answers and approval echoes are filtered only from projected transcript evidence. Non-transcript anchors must not hide user messages.
- Prompt history is a server-side boundary. Frontend display metadata must not be treated as prompt-safe history unless the protocol explicitly marks it prompt-eligible. Timeline cursors are opaque pagination tokens; UI ordering uses explicit item fields: `createdAt`, `sortRank`, then `id`.

When adding a new agent surface, choose exactly one owner first and add the protocol value only with a producer and a renderer. The current surfaces are `message_stream`, `status_strip`, and `debug_panel`. Components must not infer display behavior from raw `role`, `kind`, or message metadata when `AgentTimelineItem` semantics are available.

## Internal Tool Call Display

MovScript-owned tools should not fall back to provider-native tool cards once the UI can recognize them. The tool catalog is owned by core MCP registration (`packages/core/src/mcp/node/server/toolRegistry.ts`), while chat rendering stays in the neutral frontend domain.

- Core is the authoritative list of tool names, schemas, and descriptions. Browser UI must not import the Node-only MCP registry directly; use Agent runtime capability data or a serialized catalog snapshot when a full catalog is needed.
- Runtime adapters should preserve protocol facts. A wire `mcpToolCall` remains a neutral `mcpToolCall` with `raw`, `arguments`, `result`, and `error` intact.
- Internal tool UI recognition lives in the frontend domain as a classifier from neutral tool-call items to a display view model. Renderers ask the classifier first and fall back to the generic tool card for unknown or third-party tools.
- Prefer explicit adapters for high-value tools, backed by prefix/family fallback rules for broad groups such as `domain_*`, `system_*`, `movscript_*`, `workspace_*`, and `generation_*`.
- Each adapter should expose concise business status, key arguments, result summaries, and an inspect section with raw protocol payload for debugging.
