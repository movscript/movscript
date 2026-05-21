import type { JSONValue } from '../types.js'

export type RuntimeOperationKind = 'generation_job'
export type RuntimeOperationMode = 'async'
export type RuntimeOperationStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled' | 'timeout'

export interface RuntimeOperationExternalHandle {
  provider: string
  type: string
  id: string | number
}

export interface RuntimeOperation {
  id: string
  runId: string
  kind: RuntimeOperationKind
  mode: RuntimeOperationMode
  status: RuntimeOperationStatus
  request: JSONValue
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
  runId: string
  kind: RuntimeOperationKind
  request: Record<string, JSONValue>
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
