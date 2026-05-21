import type { JSONValue } from '../types.js'

export type AgentIOOperationKind = 'generation_job' | 'mcp_tool' | 'backend_http' | 'subagent_run' | 'file_apply'
export type AgentIOOperationMode = 'sync' | 'async'
export type AgentIOOperationStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled' | 'timeout'

export interface AgentIOExternalHandle {
  provider: string
  type: string
  id: string | number
}

export interface AgentIOOperation {
  id: string
  runId: string
  kind: AgentIOOperationKind
  mode: AgentIOOperationMode
  status: AgentIOOperationStatus
  request: JSONValue
  externalHandle?: AgentIOExternalHandle
  result?: JSONValue
  error?: string
  timeoutMs?: number
  pollIntervalMs?: number
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface AgentIOStartInput {
  runId: string
  kind: AgentIOOperationKind
  request: Record<string, JSONValue>
  timeoutMs?: number
  pollIntervalMs?: number
  signal?: AbortSignal
}

export interface AgentIOWaitInput {
  operationIds: string[]
  mode?: 'all' | 'any'
  timeoutMs?: number
  pollIntervalMs?: number
  signal?: AbortSignal
  onOperation?: (operation: AgentIOOperation) => void
}

export interface AgentIOWaitResult {
  status: 'completed' | 'partial' | 'timeout' | 'failed' | 'cancelled'
  done: boolean
  mode: 'all' | 'any'
  operationIds: string[]
  operations: AgentIOOperation[]
  completed: AgentIOOperation[]
  pending: AgentIOOperation[]
  failed: AgentIOOperation[]
  cancelled: AgentIOOperation[]
  timeoutMs: number
  message: string
}

export function isTerminalAgentIOStatus(status: AgentIOOperationStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'timeout'
}

