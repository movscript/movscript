import type {
  AgentRunStatus,
  AgentStepStatus,
} from './agentStatusProtocol.js'
import type { AgentAttachment } from './agentAttachmentProtocol.js'
import type { ProviderSessionStatusMessage } from './agentConversationProtocol.js'
import type { AgentPlanRevision } from './agentPlanProtocol.js'
import type { AgentContextDiagnostic } from './agentPromptDebugProtocol.js'
import type { AgentTraceStatus } from './agentTraceProtocol.js'
import type {
  AgentApprovalStatus,
  AgentInputRequestStatus,
  ProviderDisplayAnchor,
} from './providerInteractionProtocol.js'

export type AgentTimelineOrigin = 'provider_session' | 'user' | 'agent'
export type AgentTimelinePurpose = 'transcript' | 'status' | 'diagnostic'
export type AgentTimelineSurface =
  | 'message_stream'
  | 'status_strip'
  | 'debug_panel'
export type AgentTimelineContentPromptEligibility = 'include' | 'exclude'
export type AgentTimelineStatus = 'pending' | 'streaming' | 'completed' | 'completed_with_warnings' | 'failed' | 'cancelled' | 'requires_action'

export function agentTimelineStatusFromRunStatus(status: AgentRunStatus): AgentTimelineStatus {
  if (status === 'queued') return 'pending'
  if (status === 'in_progress') return 'streaming'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'requires_action') return 'requires_action'
  if (status === 'completed_with_warnings') return 'completed_with_warnings'
  return 'completed'
}

export interface AgentTimelineProviderSessionRefs {
  providerSessionTreeId?: string
  /** @deprecated Prefer providerSessionTreeId for related-thread provider-session trees. */
  sessionId?: string // deprecated providerSessionTreeId compatibility mirror
  threadId: string
  messageId?: string
  runId?: string
  traceId?: string
}

export interface AgentTimelineMeta {
  runtimeStatus?: ProviderSessionStatusMessage
  contextDiagnostic?: AgentContextDiagnostic
  planRevision?: AgentPlanRevision
}

export interface AgentTimelineItem {
  id: string
  providerSessionTreeId?: string
  /** @deprecated Prefer providerSessionTreeId for related-thread provider-session trees. */
  sessionId?: string // deprecated providerSessionTreeId compatibility mirror
  threadId: string
  /** Provider-session/user/agent source. This is not a UI surface decision by itself. */
  origin: AgentTimelineOrigin
  /** Conversation purpose. `transcript` means message-stream text, not prompt inclusion. */
  purpose: AgentTimelinePurpose
  /** UI surface that owns this item. */
  surface: AgentTimelineSurface
  /** Model prompt eligibility is independent from transcript rendering. */
  contentPromptEligibility: AgentTimelineContentPromptEligibility
  /** Stable semantic order for equal timestamps. Clients sort by createdAt, sortRank, then id. */
  sortRank: number
  content?: string
  attachments?: AgentAttachment[]
  meta?: AgentTimelineMeta
  activity?: AgentTimelineActivity
  status?: AgentTimelineStatus
  createdAt: string
  updatedAt: string
  revision: number
  /** Opaque pagination token. Clients must not parse it for display ordering. */
  cursor: string
  providerSessionRefs: AgentTimelineProviderSessionRefs
}

export interface AgentTimelinePage {
  items: AgentTimelineItem[]
  nextBefore?: string
  hasMoreBefore: boolean
  snapshotRevision: number
}

export type AgentTimelineItemStreamEventType = 'timeline.item.created' | 'timeline.item.updated'
export type AgentTimelineStreamEventType = AgentTimelineItemStreamEventType | 'timeline.reset_required'

export interface AgentTimelineItemStreamEvent {
  type: AgentTimelineItemStreamEventType
  revision: number
  item: AgentTimelineItem
}

export interface AgentTimelineResetStreamEvent {
  type: 'timeline.reset_required'
  revision: number
  reason?: string
}

export type AgentTimelineStreamEvent = AgentTimelineItemStreamEvent | AgentTimelineResetStreamEvent

export interface AgentTimelineActivity {
  runId: string
  threadId: string
  status: AgentRunStatus
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  failedAt?: string
  error?: string
  warnings?: string[]
  approvals?: AgentTimelineActivityApproval[]
  inputs?: AgentTimelineActivityInputRequest[]
  steps: AgentTimelineActivityStep[]
  events: AgentTimelineActivityEvent[]
}

export interface AgentTimelineActivityApproval {
  id: string
  runId?: string
  interactionId?: string
  displayThreadId?: string
  displayAnchor?: ProviderDisplayAnchor
  toolName: string
  reason: string
  risk?: string
  permission?: string
  status: AgentApprovalStatus
  createdAt: string
  updatedAt: string
  approvedAt?: string
  rejectedAt?: string
}

export interface AgentTimelineActivityInputRequest {
  id: string
  runId?: string
  displayThreadId?: string
  displayAnchor?: ProviderDisplayAnchor
  title: string
  summary?: string
  question: string
  inputType: string
  choices: Array<{ id: string; label: string; description?: string }>
  allowCustomAnswer: boolean
  status: AgentInputRequestStatus
  createdAt: string
  updatedAt: string
  answeredAt?: string
  answer?: {
    choiceIds?: string[]
    text?: string
  }
}

export interface AgentTimelineActivityStep {
  id: string
  type: 'tool_call' | 'message'
  status: AgentStepStatus
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  roundSource?: 'setup' | 'runtime_rule' | 'model' | 'approval' | 'final'
  title?: string
  toolName?: string
  error?: string
  sandboxed?: boolean
  durationMs?: number
  createdAt: string
  completedAt?: string
}

export interface AgentTimelineActivityEvent {
  id: string
  runId?: string
  threadId?: string
  kind: string
  title: string
  summary?: string
  status: AgentTraceStatus
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  roundSource?: 'setup' | 'runtime_rule' | 'model' | 'approval' | 'final'
  toolName?: string
  stepId?: string
  data?: Record<string, unknown>
  durationMs?: number
  createdAt: string
  completedAt?: string
}
