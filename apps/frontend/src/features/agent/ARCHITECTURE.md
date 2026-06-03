# Agent Frontend Boundaries

This feature keeps runtime state, transcript messages, and display-only metadata on separate paths.

## Message Display Contract

- Chat timeline renders only visible transcript messages for one runtime thread. The chat view calls `useAgentMessageFeed` with `requireThread: true`; it must not fall back to session-level message aggregation.
- Thread binding is resolved through `resolveAgentChatRuntimeBindingIds`. Persisted local bindings win, then conversation runtime fields, then the feed stays empty until a thread is known.
- UI-only assistant anchors can stay in raw feed state for pinned status, plan revisions, diagnostics, and runtime status, but timeline builders must filter them through `agentMessageBoundaries`.
- Live run activity belongs in `AgentConversationPresentation` blocks scoped to the active run. It is inserted after the run's user messages and before assistant output.
- Historical run activity attached to a final assistant answer is rendered as a collapsed process summary, not as a replay of every thinking/tool round.
- Pinned generation status reads generation activity from current-thread messages and live activity events. It is a top status surface, not a chat bubble source.
- Runtime input answers and approval echoes are filtered only from visible transcript evidence. UI-only anchors must not hide user messages.
- Prompt history is a server-side boundary. Frontend display metadata must not be treated as prompt-safe history unless the protocol explicitly marks it visible and prompt-eligible.

When adding a new agent message surface, choose exactly one owner first: timeline transcript, live run activity, pinned status, diagnostics, or prompt context. Do not make components interpret raw message metadata directly unless the rule already lives in a domain helper.
