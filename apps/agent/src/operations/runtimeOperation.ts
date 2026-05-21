import type { JSONValue } from '../types.js'

export type RuntimeOperationKind = 'generation_job'
export type RuntimeOperationMode = 'async'
export type RuntimeOperationStatus = 'pending_approval' | 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled' | 'timeout'
export type RuntimeOperationContinuationMode = 'none' | 'any_completed' | 'all_completed' | 'all_settled' | 'manual_selection'

export interface RuntimeOperationExternalHandle {
  provider: string
  type: string
  id: string | number
}

export interface RuntimeOperation {
  id: string
  threadId: string
  runId: string
  kind: RuntimeOperationKind
  mode: RuntimeOperationMode
  status: RuntimeOperationStatus
  request: JSONValue
  continuationPolicy?: {
    mode: RuntimeOperationContinuationMode
    groupId?: string
  }
  externalHandle?: RuntimeOperationExternalHandle
  result?: JSONValue
  error?: string
  timeoutMs?: number
  pollIntervalMs?: number
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface RuntimeOperationStartInput {
  threadId: string
  runId: string
  kind: RuntimeOperationKind
  request: Record<string, JSONValue>
  continuationPolicy?: RuntimeOperation['continuationPolicy']
  timeoutMs?: number
  pollIntervalMs?: number
  signal?: AbortSignal
}

export interface RuntimeOperationWaitInput {
  operationIds: string[]
  mode?: 'all' | 'any'
  timeoutMs?: number
  pollIntervalMs?: number
  signal?: AbortSignal
  onOperation?: (operation: RuntimeOperation) => void
}

export interface RuntimeOperationWaitResult {
  status: 'completed' | 'partial' | 'timeout' | 'failed' | 'cancelled'
  done: boolean
  mode: 'all' | 'any'
  operationIds: string[]
  operations: RuntimeOperation[]
  completed: RuntimeOperation[]
  pending: RuntimeOperation[]
  failed: RuntimeOperation[]
  cancelled: RuntimeOperation[]
  timeoutMs: number
  message: string
}

export function isTerminalRuntimeOperationStatus(status: RuntimeOperationStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'timeout'
}
