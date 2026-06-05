import type {
  AgentRuntimeInputDeliveryStatus,
  AgentTimelineOrigin,
  AgentTimelinePurpose,
  AgentTimelineStatus,
  AgentTimelineSurface,
} from '@movscript/protocol'

export type AgentRuntimeChatTimelinePhase = 'pending' | 'streaming' | 'waiting' | 'resolved' | 'failed' | 'cancelled'
export type AgentRuntimeChatTranscriptRole = 'user' | 'assistant' | null

export const AGENT_RUNTIME_CHAT_TIMELINE_ORIGIN_COVERAGE: Record<AgentTimelineOrigin, {
  transcriptRole: AgentRuntimeChatTranscriptRole
  transcriptEligible: boolean
  note: string
}> = {
  system_runtime: {
    transcriptRole: null,
    transcriptEligible: false,
    note: 'System runtime timeline entries feed status/debug surfaces, not chat messages.',
  },
  user: {
    transcriptRole: 'user',
    transcriptEligible: true,
    note: 'User timeline transcript entries can become chat user messages.',
  },
  agent: {
    transcriptRole: 'assistant',
    transcriptEligible: true,
    note: 'Agent timeline transcript entries can become chat assistant messages.',
  },
}

export const AGENT_RUNTIME_CHAT_TIMELINE_PURPOSE_COVERAGE: Record<AgentTimelinePurpose, {
  messageStreamEligible: boolean
  note: string
}> = {
  transcript: {
    messageStreamEligible: true,
    note: 'Transcript timeline entries are eligible for chat projection when origin and surface also match.',
  },
  status: {
    messageStreamEligible: false,
    note: 'Status timeline entries belong to status surfaces.',
  },
  diagnostic: {
    messageStreamEligible: false,
    note: 'Diagnostic timeline entries belong to debug/activity surfaces.',
  },
}

export const AGENT_RUNTIME_CHAT_TIMELINE_SURFACE_COVERAGE: Record<AgentTimelineSurface, {
  messageStreamEligible: boolean
  note: string
}> = {
  message_stream: {
    messageStreamEligible: true,
    note: 'Message-stream timeline entries are eligible for chat projection when origin and purpose also match.',
  },
  status_strip: {
    messageStreamEligible: false,
    note: 'Status-strip timeline entries are not chat transcript messages.',
  },
  debug_panel: {
    messageStreamEligible: false,
    note: 'Debug-panel timeline entries are not chat transcript messages.',
  },
}

export const AGENT_RUNTIME_CHAT_TIMELINE_STATUS_COVERAGE: Record<AgentTimelineStatus, {
  phase: AgentRuntimeChatTimelinePhase
  userInputDeliveryStatus: AgentRuntimeInputDeliveryStatus
  transcriptStatusMeta: false
  note: string
}> = {
  pending: {
    phase: 'pending',
    userInputDeliveryStatus: 'pending',
    transcriptStatusMeta: false,
    note: 'Pending timeline status drives runtime state; projected chat messages keep status out of message meta.',
  },
  streaming: {
    phase: 'streaming',
    userInputDeliveryStatus: 'accepted',
    transcriptStatusMeta: false,
    note: 'Streaming timeline status is represented by transient streaming assistant state, not message meta.',
  },
  completed: {
    phase: 'resolved',
    userInputDeliveryStatus: 'accepted',
    transcriptStatusMeta: false,
    note: 'Completed timeline status is not copied into chat message meta.',
  },
  completed_with_warnings: {
    phase: 'resolved',
    userInputDeliveryStatus: 'accepted',
    transcriptStatusMeta: false,
    note: 'Completed-with-warnings timeline status remains timeline metadata.',
  },
  failed: {
    phase: 'failed',
    userInputDeliveryStatus: 'failed',
    transcriptStatusMeta: false,
    note: 'Failed timeline status is projected to runtime input delivery for user items when applicable.',
  },
  cancelled: {
    phase: 'cancelled',
    userInputDeliveryStatus: 'accepted',
    transcriptStatusMeta: false,
    note: 'Cancelled timeline status remains timeline metadata.',
  },
  requires_action: {
    phase: 'waiting',
    userInputDeliveryStatus: 'accepted',
    transcriptStatusMeta: false,
    note: 'Requires-action timeline status remains runtime state while server request cards own user action.',
  },
}

export const AGENT_RUNTIME_CHAT_INPUT_DELIVERY_STATUS_COVERAGE: Record<AgentRuntimeInputDeliveryStatus, {
  waitingForDeliveryQueue: boolean
  displayStatus: AgentRuntimeInputDeliveryStatus
  badgeTone: 'neutral' | 'danger'
  note: string
}> = {
  pending: {
    waitingForDeliveryQueue: true,
    displayStatus: 'pending',
    badgeTone: 'neutral',
    note: 'Pending runtime inputs remain queued until accepted or assigned a runtime message id.',
  },
  accepted: {
    waitingForDeliveryQueue: false,
    displayStatus: 'accepted',
    badgeTone: 'neutral',
    note: 'Accepted runtime inputs are visible in the running conversation.',
  },
  consumed: {
    waitingForDeliveryQueue: false,
    displayStatus: 'consumed',
    badgeTone: 'neutral',
    note: 'Consumed runtime inputs have been read by the model/runtime.',
  },
  failed: {
    waitingForDeliveryQueue: false,
    displayStatus: 'failed',
    badgeTone: 'danger',
    note: 'Failed runtime inputs are diagnostic and should display the error when present.',
  },
}
