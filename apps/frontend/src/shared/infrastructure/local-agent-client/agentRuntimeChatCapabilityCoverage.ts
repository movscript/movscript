import type {
  AgentRuntimeStatusLightState,
  AgentRuntimeStatusMessage,
  AgentTraceEventKind,
  AgentTraceStatus,
} from '@movscript/protocol'

export type AgentRuntimeChatNoticeLevel = 'info' | 'warning' | 'error'

export const AGENT_RUNTIME_CHAT_TRACE_KIND_COVERAGE: Record<AgentTraceEventKind, {
  streamMethod: 'runtime/trace/updated'
  eventOwner: 'recent-capability-events'
  transcriptItem: false
  note: string
}> = {
  run: {
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    transcriptItem: false,
    note: 'Run trace events describe runtime execution and stay in capability/activity surfaces.',
  },
  thread: {
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    transcriptItem: false,
    note: 'Thread trace events describe runtime thread activity outside the transcript.',
  },
  message: {
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    transcriptItem: false,
    note: 'Message trace events are diagnostics for message handling, not message content.',
  },
  context: {
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    transcriptItem: false,
    note: 'Context trace events describe prompt/context assembly diagnostics.',
  },
  memory: {
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    transcriptItem: false,
    note: 'Memory trace events describe memory lookup or storage diagnostics.',
  },
  manifest: {
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    transcriptItem: false,
    note: 'Manifest trace events describe agent manifest resolution.',
  },
  skill: {
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    transcriptItem: false,
    note: 'Skill trace events describe skill discovery and activation diagnostics.',
  },
  tool_catalog: {
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    transcriptItem: false,
    note: 'Tool-catalog trace events describe available tool discovery.',
  },
  prompt: {
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    transcriptItem: false,
    note: 'Prompt trace events describe prompt assembly diagnostics.',
  },
  permission: {
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    transcriptItem: false,
    note: 'Permission trace events describe policy decisions outside the transcript.',
  },
  reasoning: {
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    transcriptItem: false,
    note: 'Reasoning trace events are runtime diagnostics, distinct from neutral reasoning transcript items.',
  },
  tool_call: {
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    transcriptItem: false,
    note: 'Tool-call trace events describe runtime tool execution diagnostics.',
  },
  model_call: {
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    transcriptItem: false,
    note: 'Model-call trace events describe model request/response diagnostics.',
  },
  approval: {
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    transcriptItem: false,
    note: 'Approval trace events describe approval flow diagnostics; server request cards own user action.',
  },
  input: {
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    transcriptItem: false,
    note: 'Input trace events describe user-input handling diagnostics.',
  },
  assistant: {
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    transcriptItem: false,
    note: 'Assistant trace events describe assistant generation diagnostics.',
  },
  task: {
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    transcriptItem: false,
    note: 'Task trace events describe worker task activity.',
  },
  taskGraph: {
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    transcriptItem: false,
    note: 'Task-graph trace events describe plan graph activity.',
  },
  error: {
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    transcriptItem: false,
    note: 'Error trace events are diagnostic capability entries.',
  },
}

export const AGENT_RUNTIME_CHAT_TRACE_STATUS_COVERAGE: Record<AgentTraceStatus, {
  noticeLevel: AgentRuntimeChatNoticeLevel
  streamMethod: 'runtime/trace/updated'
  eventOwner: 'recent-capability-events'
  note: string
}> = {
  started: {
    noticeLevel: 'info',
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    note: 'Started trace events are live activity diagnostics.',
  },
  completed: {
    noticeLevel: 'info',
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    note: 'Completed trace events are successful activity diagnostics.',
  },
  blocked: {
    noticeLevel: 'warning',
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    note: 'Blocked trace events indicate runtime activity waiting on an external condition.',
  },
  failed: {
    noticeLevel: 'warning',
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    note: 'Failed trace events are diagnostic activity entries without becoming transcript items.',
  },
  info: {
    noticeLevel: 'info',
    streamMethod: 'runtime/trace/updated',
    eventOwner: 'recent-capability-events',
    note: 'Informational trace events stay informational.',
  },
}

export const AGENT_RUNTIME_CHAT_RUNTIME_STATUS_KIND_COVERAGE: Record<AgentRuntimeStatusMessage['kind'], {
  defaultNoticeLevel: AgentRuntimeChatNoticeLevel
  streamMethod: 'runtime/status/updated'
  eventOwner: 'recent-capability-events'
  titleSource: 'title' | 'label'
  detailSource: 'detail-work' | 'detail-state'
  note: string
}> = {
  async_work_handoff: {
    defaultNoticeLevel: 'info',
    streamMethod: 'runtime/status/updated',
    eventOwner: 'recent-capability-events',
    titleSource: 'title',
    detailSource: 'detail-work',
    note: 'Async work handoffs surface background work metadata in recent capability events.',
  },
  status_light: {
    defaultNoticeLevel: 'info',
    streamMethod: 'runtime/status/updated',
    eventOwner: 'recent-capability-events',
    titleSource: 'label',
    detailSource: 'detail-state',
    note: 'Status-light messages update live runtime state outside the transcript.',
  },
}

export const AGENT_RUNTIME_CHAT_STATUS_LIGHT_STATE_COVERAGE: Record<AgentRuntimeStatusLightState, {
  noticeLevel: AgentRuntimeChatNoticeLevel
  streamMethod: 'runtime/status/updated'
  eventOwner: 'recent-capability-events'
  note: string
}> = {
  stopped: {
    noticeLevel: 'info',
    streamMethod: 'runtime/status/updated',
    eventOwner: 'recent-capability-events',
    note: 'Stopped status-light messages are non-active runtime state.',
  },
  waiting: {
    noticeLevel: 'warning',
    streamMethod: 'runtime/status/updated',
    eventOwner: 'recent-capability-events',
    note: 'Waiting status-light messages are surfaced as warning-level capability events.',
  },
  active: {
    noticeLevel: 'info',
    streamMethod: 'runtime/status/updated',
    eventOwner: 'recent-capability-events',
    note: 'Active status-light messages are informational runtime activity.',
  },
}
