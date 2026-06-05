import type {
  AgentConversationLifecycle,
  AgentRunExecutionMode,
  AgentRunRole,
  AgentRuntimeScopeType,
  AgentTaskGraphStatus,
  AgentTaskStatus,
  AgentThreadRole,
  RuntimeDisplayAnchorPlacement,
  RuntimeContinuationStatus,
  RuntimeWakeEventKind,
  RuntimeWakeEventStatus,
  RuntimeWorkContinuationMode,
  RuntimeWorkKind,
  RuntimeWorkMode,
  RuntimeWorkStatus,
} from '@movscript/protocol'

export type AgentRuntimeChatMetadataOwner =
  | 'runtime-session-cache'
  | 'thread-metadata'
  | 'turn-metadata'
  | 'plan-task-graph'
  | 'runtime-activity'
  | 'runtime-scheduler'
  | 'server-request-anchor'
  | 'runtime-stream-lifecycle'

export type AgentRuntimeChatMetadataPhase = 'pending' | 'active' | 'waiting' | 'resolved' | 'failed' | 'cancelled'

export const AGENT_RUNTIME_CHAT_CONVERSATION_LIFECYCLE_COVERAGE: Record<AgentConversationLifecycle, {
  phase: 'pending' | 'active' | 'cancelled'
  owner: 'runtime-session-cache' | 'thread-metadata'
  transcriptItem: false
  note: string
}> = {
  provisional: {
    phase: 'pending',
    owner: 'runtime-session-cache',
    transcriptItem: false,
    note: 'Provisional conversations are metadata while runtime thread/session resolution is still settling.',
  },
  active: {
    phase: 'active',
    owner: 'thread-metadata',
    transcriptItem: false,
    note: 'Active conversations are represented as thread/session metadata, not transcript content.',
  },
  abandoned: {
    phase: 'cancelled',
    owner: 'runtime-session-cache',
    transcriptItem: false,
    note: 'Abandoned conversations are lifecycle metadata and should not become chat items.',
  },
}

export const AGENT_RUNTIME_CHAT_THREAD_ROLE_COVERAGE: Record<AgentThreadRole, {
  owner: 'thread-metadata' | 'plan-task-graph'
  transcriptItem: false
  note: string
}> = {
  root: {
    owner: 'thread-metadata',
    transcriptItem: false,
    note: 'Root threads are primary conversation metadata.',
  },
  planner: {
    owner: 'plan-task-graph',
    transcriptItem: false,
    note: 'Planner threads belong to plan/task graph orchestration metadata.',
  },
  worker: {
    owner: 'plan-task-graph',
    transcriptItem: false,
    note: 'Worker threads belong to plan/task graph orchestration metadata.',
  },
}

export const AGENT_RUNTIME_CHAT_RUN_ROLE_COVERAGE: Record<AgentRunRole, {
  owner: 'turn-metadata' | 'plan-task-graph'
  transcriptItem: false
  note: string
}> = {
  planner: {
    owner: 'plan-task-graph',
    transcriptItem: false,
    note: 'Planner runs drive plan/task metadata and can still project normal turn items.',
  },
  worker: {
    owner: 'plan-task-graph',
    transcriptItem: false,
    note: 'Worker runs drive task execution metadata and can still project normal turn items.',
  },
}

export const AGENT_RUNTIME_CHAT_RUN_EXECUTION_MODE_COVERAGE: Record<AgentRunExecutionMode, {
  owner: 'turn-metadata'
  transcriptItem: false
  note: string
}> = {
  standard: {
    owner: 'turn-metadata',
    transcriptItem: false,
    note: 'Standard execution mode is run metadata.',
  },
  compact: {
    owner: 'turn-metadata',
    transcriptItem: false,
    note: 'Compact execution mode is run metadata and should not change transcript item shape.',
  },
  deep: {
    owner: 'turn-metadata',
    transcriptItem: false,
    note: 'Deep execution mode is run metadata and should not change transcript item shape.',
  },
}

export const AGENT_RUNTIME_CHAT_TASK_GRAPH_STATUS_COVERAGE: Record<AgentTaskGraphStatus, {
  phase: AgentRuntimeChatMetadataPhase
  owner: 'plan-task-graph'
  invalidationEvent: 'task_graph.upserted'
  transcriptItem: false
  note: string
}> = {
  pending: {
    phase: 'pending',
    owner: 'plan-task-graph',
    invalidationEvent: 'task_graph.upserted',
    transcriptItem: false,
    note: 'Pending task graphs are plan metadata, not transcript items.',
  },
  running: {
    phase: 'active',
    owner: 'plan-task-graph',
    invalidationEvent: 'task_graph.upserted',
    transcriptItem: false,
    note: 'Running task graphs drive plan/task surfaces.',
  },
  blocked: {
    phase: 'waiting',
    owner: 'plan-task-graph',
    invalidationEvent: 'task_graph.upserted',
    transcriptItem: false,
    note: 'Blocked task graphs remain plan metadata with waiting state.',
  },
  needs_review: {
    phase: 'waiting',
    owner: 'plan-task-graph',
    invalidationEvent: 'task_graph.upserted',
    transcriptItem: false,
    note: 'Needs-review task graphs are waiting on review outside the transcript.',
  },
  done: {
    phase: 'resolved',
    owner: 'plan-task-graph',
    invalidationEvent: 'task_graph.upserted',
    transcriptItem: false,
    note: 'Done task graphs settle the plan/task surface.',
  },
  failed: {
    phase: 'failed',
    owner: 'plan-task-graph',
    invalidationEvent: 'task_graph.upserted',
    transcriptItem: false,
    note: 'Failed task graphs are diagnostic plan metadata.',
  },
  cancelled: {
    phase: 'cancelled',
    owner: 'plan-task-graph',
    invalidationEvent: 'task_graph.upserted',
    transcriptItem: false,
    note: 'Cancelled task graphs settle as cancelled plan metadata.',
  },
}

export const AGENT_RUNTIME_CHAT_TASK_STATUS_COVERAGE: Record<AgentTaskStatus, {
  phase: AgentRuntimeChatMetadataPhase
  owner: 'plan-task-graph'
  invalidationEvent: 'task_graph.upserted'
  transcriptItem: false
  note: string
}> = {
  pending: {
    phase: 'pending',
    owner: 'plan-task-graph',
    invalidationEvent: 'task_graph.upserted',
    transcriptItem: false,
    note: 'Pending tasks are rendered by plan/task surfaces.',
  },
  running: {
    phase: 'active',
    owner: 'plan-task-graph',
    invalidationEvent: 'task_graph.upserted',
    transcriptItem: false,
    note: 'Running tasks drive worker/task overview state.',
  },
  blocked: {
    phase: 'waiting',
    owner: 'plan-task-graph',
    invalidationEvent: 'task_graph.upserted',
    transcriptItem: false,
    note: 'Blocked tasks stay in plan/task metadata with a waiting phase.',
  },
  needs_review: {
    phase: 'waiting',
    owner: 'plan-task-graph',
    invalidationEvent: 'task_graph.upserted',
    transcriptItem: false,
    note: 'Needs-review tasks are review metadata, not transcript messages.',
  },
  done: {
    phase: 'resolved',
    owner: 'plan-task-graph',
    invalidationEvent: 'task_graph.upserted',
    transcriptItem: false,
    note: 'Done tasks are resolved plan metadata.',
  },
  failed: {
    phase: 'failed',
    owner: 'plan-task-graph',
    invalidationEvent: 'task_graph.upserted',
    transcriptItem: false,
    note: 'Failed tasks are diagnostic plan metadata.',
  },
  cancelled: {
    phase: 'cancelled',
    owner: 'plan-task-graph',
    invalidationEvent: 'task_graph.upserted',
    transcriptItem: false,
    note: 'Cancelled tasks remain cancelled plan metadata.',
  },
}

export const AGENT_RUNTIME_CHAT_WORK_STATUS_COVERAGE: Record<RuntimeWorkStatus, {
  phase: AgentRuntimeChatMetadataPhase
  owner: 'runtime-activity'
  invalidationEvent: 'work.upserted'
  transcriptItem: false
  note: string
}> = {
  pending_approval: {
    phase: 'waiting',
    owner: 'runtime-activity',
    invalidationEvent: 'work.upserted',
    transcriptItem: false,
    note: 'Work waiting for approval is displayed by activity/request surfaces rather than transcript history.',
  },
  queued: {
    phase: 'pending',
    owner: 'runtime-activity',
    invalidationEvent: 'work.upserted',
    transcriptItem: false,
    note: 'Queued work belongs to runtime activity state.',
  },
  running: {
    phase: 'active',
    owner: 'runtime-activity',
    invalidationEvent: 'work.upserted',
    transcriptItem: false,
    note: 'Running work belongs to runtime activity state.',
  },
  waiting: {
    phase: 'waiting',
    owner: 'runtime-activity',
    invalidationEvent: 'work.upserted',
    transcriptItem: false,
    note: 'Waiting work is runtime activity metadata.',
  },
  completed: {
    phase: 'resolved',
    owner: 'runtime-activity',
    invalidationEvent: 'work.upserted',
    transcriptItem: false,
    note: 'Completed work resolves runtime activity state.',
  },
  failed: {
    phase: 'failed',
    owner: 'runtime-activity',
    invalidationEvent: 'work.upserted',
    transcriptItem: false,
    note: 'Failed work is diagnostic runtime activity metadata.',
  },
  cancelled: {
    phase: 'cancelled',
    owner: 'runtime-activity',
    invalidationEvent: 'work.upserted',
    transcriptItem: false,
    note: 'Cancelled work settles runtime activity state.',
  },
  timeout: {
    phase: 'failed',
    owner: 'runtime-activity',
    invalidationEvent: 'work.upserted',
    transcriptItem: false,
    note: 'Timed-out work is treated as failed runtime activity metadata.',
  },
}

export const AGENT_RUNTIME_CHAT_WORK_KIND_COVERAGE: Record<RuntimeWorkKind, {
  owner: 'runtime-activity'
  invalidationEvent: 'work.upserted'
  transcriptItem: false
  note: string
}> = {
  generation_job: {
    owner: 'runtime-activity',
    invalidationEvent: 'work.upserted',
    transcriptItem: false,
    note: 'Generation jobs are runtime activity metadata; generated resources surface through dedicated generation/resource UI.',
  },
  subagent_run: {
    owner: 'runtime-activity',
    invalidationEvent: 'work.upserted',
    transcriptItem: false,
    note: 'Subagent runs are runtime activity metadata and may be summarized by plan/task surfaces.',
  },
}

export const AGENT_RUNTIME_CHAT_WORK_MODE_COVERAGE: Record<RuntimeWorkMode, {
  owner: 'runtime-activity'
  invalidationEvent: 'work.upserted'
  transcriptItem: false
  note: string
}> = {
  async: {
    owner: 'runtime-activity',
    invalidationEvent: 'work.upserted',
    transcriptItem: false,
    note: 'Async work is tracked by runtime activity state outside the transcript.',
  },
}

export const AGENT_RUNTIME_CHAT_WORK_CONTINUATION_MODE_COVERAGE: Record<RuntimeWorkContinuationMode, {
  owner: 'runtime-scheduler'
  invalidationEvent: 'work.upserted'
  transcriptItem: false
  note: string
}> = {
  none: {
    owner: 'runtime-scheduler',
    invalidationEvent: 'work.upserted',
    transcriptItem: false,
    note: 'No continuation means the work does not schedule a follow-up run.',
  },
  any_completed: {
    owner: 'runtime-scheduler',
    invalidationEvent: 'work.upserted',
    transcriptItem: false,
    note: 'Any-completed continuation mode belongs to scheduler metadata.',
  },
  all_completed: {
    owner: 'runtime-scheduler',
    invalidationEvent: 'work.upserted',
    transcriptItem: false,
    note: 'All-completed continuation mode belongs to scheduler metadata.',
  },
  all_settled: {
    owner: 'runtime-scheduler',
    invalidationEvent: 'work.upserted',
    transcriptItem: false,
    note: 'All-settled continuation mode belongs to scheduler metadata.',
  },
  manual_selection: {
    owner: 'runtime-scheduler',
    invalidationEvent: 'work.upserted',
    transcriptItem: false,
    note: 'Manual-selection continuation mode waits for scheduler/user selection state outside the transcript.',
  },
}

export const AGENT_RUNTIME_CHAT_CONTINUATION_STATUS_COVERAGE: Record<RuntimeContinuationStatus, {
  phase: AgentRuntimeChatMetadataPhase
  owner: 'runtime-scheduler'
  invalidationEvent: 'continuation.upserted'
  transcriptItem: false
  note: string
}> = {
  waiting: {
    phase: 'waiting',
    owner: 'runtime-scheduler',
    invalidationEvent: 'continuation.upserted',
    transcriptItem: false,
    note: 'Waiting continuations belong to scheduler state.',
  },
  ready: {
    phase: 'active',
    owner: 'runtime-scheduler',
    invalidationEvent: 'continuation.upserted',
    transcriptItem: false,
    note: 'Ready continuations are scheduler state ready to resume work.',
  },
  consumed: {
    phase: 'resolved',
    owner: 'runtime-scheduler',
    invalidationEvent: 'continuation.upserted',
    transcriptItem: false,
    note: 'Consumed continuations are resolved scheduler state.',
  },
  cancelled: {
    phase: 'cancelled',
    owner: 'runtime-scheduler',
    invalidationEvent: 'continuation.upserted',
    transcriptItem: false,
    note: 'Cancelled continuations settle scheduler state.',
  },
}

export const AGENT_RUNTIME_CHAT_DISPLAY_ANCHOR_PLACEMENT_COVERAGE: Record<RuntimeDisplayAnchorPlacement, {
  owner: 'server-request-anchor'
  transcriptItem: false
  note: string
}> = {
  before: {
    owner: 'server-request-anchor',
    transcriptItem: false,
    note: 'Before anchors control where pending requests attach relative to runtime content.',
  },
  after: {
    owner: 'server-request-anchor',
    transcriptItem: false,
    note: 'After anchors control where pending requests attach relative to runtime content.',
  },
  inside_run_group: {
    owner: 'server-request-anchor',
    transcriptItem: false,
    note: 'Inside-run-group anchors keep pending requests scoped to a run group rather than creating transcript content.',
  },
}

export const AGENT_RUNTIME_CHAT_SCOPE_TYPE_COVERAGE: Record<AgentRuntimeScopeType, {
  owner: 'runtime-stream-lifecycle'
  transcriptItem: false
  note: string
}> = {
  thread: {
    owner: 'runtime-stream-lifecycle',
    transcriptItem: false,
    note: 'Thread scopes bind runtime events to one thread stream.',
  },
  session: {
    owner: 'runtime-stream-lifecycle',
    transcriptItem: false,
    note: 'Session scopes bind runtime events to session-level refreshes.',
  },
  run: {
    owner: 'runtime-stream-lifecycle',
    transcriptItem: false,
    note: 'Run scopes bind runtime events to one execution.',
  },
  plan: {
    owner: 'runtime-stream-lifecycle',
    transcriptItem: false,
    note: 'Plan scopes bind runtime events to plan/task graph refreshes.',
  },
}

export const AGENT_RUNTIME_CHAT_WAKE_EVENT_KIND_COVERAGE: Record<RuntimeWakeEventKind, {
  owner: 'runtime-scheduler'
  invalidationEvent: 'wake_event.upserted'
  transcriptItem: false
  note: string
}> = {
  'work.started': {
    owner: 'runtime-scheduler',
    invalidationEvent: 'wake_event.upserted',
    transcriptItem: false,
    note: 'Work-started wake events are scheduler triggers.',
  },
  'work.observed': {
    owner: 'runtime-scheduler',
    invalidationEvent: 'wake_event.upserted',
    transcriptItem: false,
    note: 'Work-observed wake events are scheduler triggers.',
  },
  'run.settled': {
    owner: 'runtime-scheduler',
    invalidationEvent: 'wake_event.upserted',
    transcriptItem: false,
    note: 'Run-settled wake events are scheduler triggers.',
  },
  'thread.opened': {
    owner: 'runtime-scheduler',
    invalidationEvent: 'wake_event.upserted',
    transcriptItem: false,
    note: 'Thread-opened wake events are scheduler triggers.',
  },
}

export const AGENT_RUNTIME_CHAT_WAKE_EVENT_STATUS_COVERAGE: Record<RuntimeWakeEventStatus, {
  phase: AgentRuntimeChatMetadataPhase
  owner: 'runtime-scheduler'
  invalidationEvent: 'wake_event.upserted'
  transcriptItem: false
  note: string
}> = {
  queued: {
    phase: 'pending',
    owner: 'runtime-scheduler',
    invalidationEvent: 'wake_event.upserted',
    transcriptItem: false,
    note: 'Queued wake events are pending scheduler state.',
  },
  processing: {
    phase: 'active',
    owner: 'runtime-scheduler',
    invalidationEvent: 'wake_event.upserted',
    transcriptItem: false,
    note: 'Processing wake events are active scheduler state.',
  },
  consumed: {
    phase: 'resolved',
    owner: 'runtime-scheduler',
    invalidationEvent: 'wake_event.upserted',
    transcriptItem: false,
    note: 'Consumed wake events are resolved scheduler state.',
  },
  cancelled: {
    phase: 'cancelled',
    owner: 'runtime-scheduler',
    invalidationEvent: 'wake_event.upserted',
    transcriptItem: false,
    note: 'Cancelled wake events settle scheduler state.',
  },
}
