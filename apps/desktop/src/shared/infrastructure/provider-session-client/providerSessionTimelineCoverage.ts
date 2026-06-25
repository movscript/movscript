import type {
  ProviderSessionInputDeliveryStatus,
  AgentTimelineOrigin,
  AgentTimelinePurpose,
  AgentTimelineStatus,
  AgentTimelineSurface,
} from '@movscript/agent-protocol'

export type ProviderSessionTimelinePhase = 'pending' | 'streaming' | 'waiting' | 'resolved' | 'failed' | 'cancelled'
export type ProviderSessionTranscriptRole = 'user' | 'assistant' | null

export const PROVIDER_SESSION_TIMELINE_ORIGIN_COVERAGE: Record<AgentTimelineOrigin, {
  transcriptRole: ProviderSessionTranscriptRole
  transcriptEligible: boolean
  note: string
}> = {
  provider_session: {
    transcriptRole: null,
    transcriptEligible: false,
    note: 'System provider-session timeline entries feed status/debug surfaces, not chat messages.',
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

export const PROVIDER_SESSION_TIMELINE_PURPOSE_COVERAGE: Record<AgentTimelinePurpose, {
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

export const PROVIDER_SESSION_TIMELINE_SURFACE_COVERAGE: Record<AgentTimelineSurface, {
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

export const PROVIDER_SESSION_TIMELINE_STATUS_COVERAGE: Record<AgentTimelineStatus, {
  phase: ProviderSessionTimelinePhase
  userInputDeliveryStatus: ProviderSessionInputDeliveryStatus
  transcriptStatusMeta: false
  note: string
}> = {
  pending: {
    phase: 'pending',
    userInputDeliveryStatus: 'pending',
    transcriptStatusMeta: false,
    note: 'Pending timeline status drives provider-session state; projected chat messages keep status out of message meta.',
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
    note: 'Failed timeline status is projected to active run input delivery for user items when applicable.',
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
    note: 'Requires-action timeline status remains provider-session state while server request cards own user action.',
  },
}

export const PROVIDER_SESSION_INPUT_DELIVERY_STATUS_COVERAGE: Record<ProviderSessionInputDeliveryStatus, {
  waitingForDeliveryQueue: boolean
  displayStatus: ProviderSessionInputDeliveryStatus
  badgeTone: 'neutral' | 'danger'
  note: string
}> = {
  pending: {
    waitingForDeliveryQueue: true,
    displayStatus: 'pending',
    badgeTone: 'neutral',
    note: 'Pending active-run inputs remain queued until accepted or assigned a provider-session message id.',
  },
  accepted: {
    waitingForDeliveryQueue: false,
    displayStatus: 'accepted',
    badgeTone: 'neutral',
    note: 'Accepted active-run inputs are visible in the running conversation.',
  },
  consumed: {
    waitingForDeliveryQueue: false,
    displayStatus: 'consumed',
    badgeTone: 'neutral',
    note: 'Consumed active-run inputs have been read by the model/provider session.',
  },
  failed: {
    waitingForDeliveryQueue: false,
    displayStatus: 'failed',
    badgeTone: 'danger',
    note: 'Failed active-run inputs are diagnostic and should display the error when present.',
  },
}

export const AGENT_PROVIDER_SESSION_TIMELINE_ORIGIN_COVERAGE = PROVIDER_SESSION_TIMELINE_ORIGIN_COVERAGE
export const AGENT_PROVIDER_SESSION_TIMELINE_PURPOSE_COVERAGE = PROVIDER_SESSION_TIMELINE_PURPOSE_COVERAGE
export const AGENT_PROVIDER_SESSION_TIMELINE_SURFACE_COVERAGE = PROVIDER_SESSION_TIMELINE_SURFACE_COVERAGE
export const AGENT_PROVIDER_SESSION_TIMELINE_STATUS_COVERAGE = PROVIDER_SESSION_TIMELINE_STATUS_COVERAGE
export const AGENT_PROVIDER_SESSION_INPUT_DELIVERY_STATUS_COVERAGE = PROVIDER_SESSION_INPUT_DELIVERY_STATUS_COVERAGE
