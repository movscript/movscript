# Agent Frontend Boundaries

This feature keeps provider-session facts, timeline projection, and UI render surfaces on separate paths.

## Unified Agent Chat Contract

The unified Agent Chat is one UI over provider-specific protocols. Its domain layer must be the superset that the UI renders; provider protocols are adapted only at infrastructure boundaries.

- Neutral item domain lives under `src/features/agent/domain/agentChat*.ts`. It owns thread items, notification events, pending server requests, display view models, and response intents. It must not import Codex, MovScript-owned agent internals, Claude, or UI component types.
- UI renderers live under `src/features/agent/components/agent-chat-*` plus `AgentChatDataSourceShell`. They render only neutral domain values and helper view models. They must not branch on provider protocol types.
- App-server thread-turn-item mapping is reached through `src/shared/infrastructure/app-server/appServerThreadTurnItemAdapter.ts`. Provider-specific compatibility aliases must not be reintroduced; Codex, Mova, and future app-server providers share this neutral adapter unless their wire protocol genuinely differs.
- Mova reuses the app-server protocol through provider configuration. The neutral UI should reach it through the provider factory, not a separate provider session chat adapter.
- Claude mapping is not implemented in the current unified shell. Until a Claude adapter exists, the UI boundary tests must keep Claude protocol names out of the neutral shell and domain.

Server-initiated requests are first-class chat state, not side effects hidden in a tool row. If a provider asks for approval, user input, elicitation, or a dynamic tool result, the adapter must emit an `AgentChatServerRequest` with enough scoped IDs to resolve it. If the protocol event lacks executable IDs, the adapter must recover them from authoritative pending state or expose the item as non-actionable instead of fabricating an approval path.

Media inputs are neutral resources. Images can remain native image inputs; video, audio, and generic resources travel through mention/resource references with MIME, name, URL, and resource ID metadata preserved where the provider supports it.

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
