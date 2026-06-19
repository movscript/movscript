import type { AgentToolCallOrigin } from './agentToolProtocol.js'
import type { JSONValue } from './protocolJson.js'

export type AgentApprovalStatus = 'pending' | 'approved' | 'rejected'
export type AgentInputRequestStatus = 'pending' | 'answered' | 'cancelled'

export type ProviderDisplayAnchorPlacement = 'before' | 'after' | 'inside_run_group'

export interface ProviderDisplayAnchor {
  threadId: string
  runId?: string
  messageId?: string
  taskId?: string
  placement: ProviderDisplayAnchorPlacement
  reason?: string
}

export interface AgentApprovalRequest {
  id: string
  runId: string
  interactionId?: string
  displayThreadId?: string
  displayAnchor?: ProviderDisplayAnchor
  toolName: string
  args?: Record<string, JSONValue>
  origin?: AgentToolCallOrigin
  preview?: JSONValue
  reason: string
  risk?: string
  permission?: string
  status: AgentApprovalStatus
  createdAt: string
  updatedAt: string
  approvedAt?: string
  rejectedAt?: string
}

export interface ProviderSessionInputChoice {
  id: string
  label: string
  description?: string
}

export interface ProviderSessionInputRequest {
  id: string
  runId: string
  displayThreadId?: string
  displayAnchor?: ProviderDisplayAnchor
  title: string
  summary?: string
  question: string
  inputType: 'choice' | 'text' | 'confirmation'
  choices: ProviderSessionInputChoice[]
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

export type ProviderWorkKind = 'generation_job' | 'subagent_run'
export type ProviderWorkMode = 'async'
export type ProviderWorkStatus = 'pending_approval' | 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled' | 'timeout'
export type ProviderWorkContinuationMode = 'none' | 'any_completed' | 'all_completed' | 'all_settled' | 'manual_selection'

export interface ProviderWorkExternalHandle {
  provider: string
  type: string
  id: string | number
}

export interface ProviderWork {
  id: string
  sessionId?: string
  threadId: string
  runId: string
  kind: ProviderWorkKind
  mode: ProviderWorkMode
  status: ProviderWorkStatus
  request: unknown
  continuationPolicy?: {
    mode: ProviderWorkContinuationMode
    groupId?: string
  }
  externalHandle?: ProviderWorkExternalHandle
  result?: unknown
  error?: string
  timeoutMs?: number
  pollIntervalMs?: number
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface ProviderWorkStartInput {
  sessionId?: string
  threadId: string
  runId: string
  kind: ProviderWorkKind
  request: Record<string, JSONValue>
  continuationPolicy?: ProviderWork['continuationPolicy']
  timeoutMs?: number
  pollIntervalMs?: number
  signal?: AbortSignal
}

export interface ProviderWorkWaitInput {
  workIds: string[]
  mode?: 'all' | 'any'
  timeoutMs?: number
  pollIntervalMs?: number
  signal?: AbortSignal
  onWork?: (work: ProviderWork) => void
}

export interface ProviderWorkWaitResult {
  status: 'completed' | 'partial' | 'timeout' | 'failed' | 'cancelled'
  done: boolean
  mode: 'all' | 'any'
  workIds: string[]
  works: ProviderWork[]
  completed: ProviderWork[]
  pending: ProviderWork[]
  failed: ProviderWork[]
  cancelled: ProviderWork[]
  timeoutMs: number
  message: string
}

export type ProviderInteractionKind = 'approval' | 'input' | 'selection'
export type ProviderInteractionStatus = 'pending' | 'approved' | 'rejected' | 'answered' | 'cancelled'

export interface ProviderInteraction {
  id: string
  threadId: string
  runId: string
  sessionId?: string
  originThreadId?: string
  originRunId?: string
  displayThreadId?: string
  displayAnchor?: ProviderDisplayAnchor
  workId?: string
  kind: ProviderInteractionKind
  status: ProviderInteractionStatus
  payload: unknown
  result?: unknown
  createdAt: string
  updatedAt: string
  resolvedAt?: string
}

export type ProviderContinuationStatus = 'waiting' | 'ready' | 'consumed' | 'cancelled'

export interface ProviderContinuation {
  id: string
  threadId: string
  runId: string
  status: ProviderContinuationStatus
  trigger:
    | { type: 'work_completed'; workIds: string[]; mode: 'any' | 'all' }
    | { type: 'interaction_resolved'; interactionIds: string[]; mode: 'any' | 'all' }
    | { type: 'manual' }
  nextInput?: {
    workResults?: string[]
    interactionResults?: string[]
    message?: string
  }
  createdAt: string
  updatedAt: string
  consumedAt?: string
  cancelledAt?: string
}

export type ProviderWakeEventKind = 'work.started' | 'work.observed' | 'run.settled' | 'thread.opened'
export type ProviderWakeEventStatus = 'queued' | 'processing' | 'consumed' | 'cancelled'

export interface ProviderWakeEvent {
  id: string
  threadId: string
  runId?: string
  workId?: string
  kind: ProviderWakeEventKind
  status: ProviderWakeEventStatus
  payload: unknown
  dedupeKey: string
  createdAt: string
  updatedAt: string
  consumedAt?: string
}
