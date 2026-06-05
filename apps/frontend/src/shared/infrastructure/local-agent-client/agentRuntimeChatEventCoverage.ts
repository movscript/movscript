import type { AgentRuntimeEventKind } from '@movscript/protocol'

export type AgentRuntimeChatEventHandling =
  | 'thread-state'
  | 'thread-item'
  | 'thread-item-delta'
  | 'pending-state'
  | 'server-request-source'
  | 'capability-event'
  | 'metadata-invalidation'
  | 'intentional-ignore'

export const AGENT_RUNTIME_CHAT_EVENT_COVERAGE: Record<AgentRuntimeEventKind, {
  handling: readonly AgentRuntimeChatEventHandling[]
  invalidationOwner?: 'runtime-session-cache' | 'runtime-activity' | 'runtime-scheduler' | 'plan-task-graph' | 'runtime-stream-lifecycle'
  eventOwner?: 'recent-capability-events'
  note: string
}> = {
  'session.upserted': {
    handling: ['metadata-invalidation'],
    invalidationOwner: 'runtime-session-cache',
    note: 'Session metadata can affect thread-runtime resolution but is not a transcript item.',
  },
  'thread.upserted': {
    handling: ['thread-state'],
    note: 'Thread updates affect title/status/list state; full thread reads provide canonical turn history.',
  },
  'message.upserted': {
    handling: ['thread-item'],
    note: 'Projects a runtime message into a neutral userMessage or agentMessage item.',
  },
  'run.upserted': {
    handling: ['thread-state', 'server-request-source'],
    note: 'Upserts the neutral turn, exposes resolvable pending approvals/input requests, and keeps unresolved approvals visible as neutral notices.',
  },
  'step.upserted': {
    handling: ['thread-item', 'server-request-source'],
    note: 'Projects a runtime step into the neutral mcpToolCall/dynamicToolCall/reasoning item surface and can synthesize or recover pending MCP approvals before the interaction event arrives.',
  },
  'trace.upserted': {
    handling: ['capability-event'],
    eventOwner: 'recent-capability-events',
    note: 'Trace events feed live activity/debug surfaces, not the normalized chat transcript.',
  },
  'interaction.upserted': {
    handling: ['server-request-source', 'pending-state'],
    note: 'Independently streamed pending interactions are converted into neutral server requests; resolved interactions clear matching pending cards.',
  },
  'work.upserted': {
    handling: ['metadata-invalidation'],
    invalidationOwner: 'runtime-activity',
    note: 'Work scheduling state belongs to runtime/activity views and does not map to a chat item.',
  },
  'continuation.upserted': {
    handling: ['metadata-invalidation'],
    invalidationOwner: 'runtime-scheduler',
    note: 'Continuation state can trigger refreshes but is not displayed as transcript content.',
  },
  'wake_event.upserted': {
    handling: ['metadata-invalidation'],
    invalidationOwner: 'runtime-scheduler',
    note: 'Wake-event scheduling state can trigger refreshes but is not displayed as transcript content.',
  },
  'plan.upserted': {
    handling: ['thread-item', 'metadata-invalidation'],
    invalidationOwner: 'plan-task-graph',
    note: 'Projects the latest runtime plan into the neutral chat plan item while plan/task graph views keep owning rich plan metadata.',
  },
  'plan_revision.upserted': {
    handling: ['thread-item', 'metadata-invalidation'],
    invalidationOwner: 'plan-task-graph',
    note: 'Projects the revision snapshot into the neutral chat plan item while plan/task graph views keep owning revision history.',
  },
  'runtime_status.upserted': {
    handling: ['capability-event'],
    eventOwner: 'recent-capability-events',
    note: 'Runtime status drives status-light UI and is not a transcript item.',
  },
  'task_graph.upserted': {
    handling: ['metadata-invalidation'],
    invalidationOwner: 'plan-task-graph',
    note: 'Task graph snapshots are owned by plan/task graph views and not projected into chat items.',
  },
  'assistant.progress': {
    handling: ['thread-item-delta'],
    note: 'Streams assistant text into a neutral agentMessage delta until the final message arrives.',
  },
  'scope.done': {
    handling: ['metadata-invalidation'],
    invalidationOwner: 'runtime-stream-lifecycle',
    note: 'Scope completion is a refresh boundary; terminal run/thread events carry user-visible state.',
  },
}
