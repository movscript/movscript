import type { JSONValue } from '../types.js'

export type RuntimeWorkKind = 'generation_job' | 'subagent_run'
export type RuntimeWorkMode = 'async'
export type RuntimeWorkStatus = 'pending_approval' | 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled' | 'timeout'
export type RuntimeWorkContinuationMode = 'none' | 'any_completed' | 'all_completed' | 'all_settled' | 'manual_selection'

export interface RuntimeWorkExternalHandle {
  provider: string
  type: string
  id: string | number
}

export interface RuntimeWork {
  id: string
  sessionId?: string
  threadId: string
  runId: string
  kind: RuntimeWorkKind
  mode: RuntimeWorkMode
  status: RuntimeWorkStatus
  request: JSONValue
  continuationPolicy?: {
    mode: RuntimeWorkContinuationMode
    groupId?: string
  }
  externalHandle?: RuntimeWorkExternalHandle
  result?: JSONValue
  error?: string
  timeoutMs?: number
  pollIntervalMs?: number
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface RuntimeWorkStartInput {
  sessionId?: string
  threadId: string
  runId: string
  kind: RuntimeWorkKind
  request: Record<string, JSONValue>
  continuationPolicy?: RuntimeWork['continuationPolicy']
  timeoutMs?: number
  pollIntervalMs?: number
  signal?: AbortSignal
}

export interface RuntimeWorkWaitInput {
  workIds: string[]
  mode?: 'all' | 'any'
  timeoutMs?: number
  pollIntervalMs?: number
  signal?: AbortSignal
  onWork?: (work: RuntimeWork) => void
}

export interface RuntimeWorkWaitResult {
  status: 'completed' | 'partial' | 'timeout' | 'failed' | 'cancelled'
  done: boolean
  mode: 'all' | 'any'
  workIds: string[]
  works: RuntimeWork[]
  completed: RuntimeWork[]
  pending: RuntimeWork[]
  failed: RuntimeWork[]
  cancelled: RuntimeWork[]
  timeoutMs: number
  message: string
}

export function isTerminalRuntimeWorkStatus(status: RuntimeWorkStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'timeout'
}
