# Agent Frontend Boundaries

This feature keeps runtime facts, timeline projection, and UI render surfaces on separate paths.

## Message Display Contract

- Chat timeline renders only timeline items with `purpose: "transcript"` and `surface: "message_stream"` for one runtime thread. `purpose: "transcript"` means conversation text, not prompt eligibility; only `contentPromptEligibility: "include"` can enter model history. The chat view calls `useAgentTimeline` with `requireThread: true`; it must not fall back to session-level message aggregation.
- Thread binding is resolved through `resolveAgentChatRuntimeBindingIds`. Persisted local bindings win, then conversation runtime fields, then the timeline stays empty until a thread is known.
- Runtime status, plan revisions, and diagnostics stay in raw timeline state for their owning surfaces. They must carry explicit timeline semantics: `origin`, `purpose`, `surface`, and `contentPromptEligibility`; plan revisions come from `thread.planRevisions`, not assistant message anchors.
- Live run activity belongs in `AgentConversationPresentation` blocks scoped to the active run. It is inserted after the run's user messages and before assistant output.
- Historical run activity attached to a final assistant answer is rendered as a collapsed process summary, not as a replay of every thinking/tool round.
- Pinned generation status reads generation activity from current-thread messages and live activity events. It is a top status surface, not a chat bubble source.
- Runtime input answers and approval echoes are filtered only from projected transcript evidence. Non-transcript anchors must not hide user messages.
- Prompt history is a server-side boundary. Frontend display metadata must not be treated as prompt-safe history unless the protocol explicitly marks it prompt-eligible. Timeline cursors are opaque pagination tokens; UI ordering uses explicit item fields: `createdAt`, `sortRank`, then `id`.

When adding a new agent surface, choose exactly one owner first and add the protocol value only with a producer and a renderer. The current surfaces are `message_stream`, `status_strip`, and `debug_panel`. Components must not infer display behavior from raw `role`, `kind`, or message metadata when `AgentTimelineItem` semantics are available.
