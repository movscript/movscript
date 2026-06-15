import type { AgentTelemetryMetricUnit } from '@movscript/core/agent/protocol'

export type AgentPerformanceOperationKind =
  | 'send'
  | 'send_preview_confirm'
  | 'approval'
  | 'rejection'
  | 'input_answer'
  | 'active_run_input'
  | 'external_task'
  | 'conversation_create'
  | 'conversation_open'
  | 'timeline_load'
export type AgentPerformanceOperationStatus = 'running' | 'success' | 'error' | 'cancelled'
export type AgentPerformanceLogLevel = 'info' | 'warning' | 'error'

export interface AgentPerformancePhase {
  id: string
  name: string
  label: string
  at: number
  offsetMs: number
  durationFromPreviousMs: number
  details?: Record<string, unknown>
}

export interface AgentPerformanceOperation {
  id: string
  kind: AgentPerformanceOperationKind
  status: AgentPerformanceOperationStatus
  startedAt: string
  startedMs: number
  updatedAt: string
  endedAt?: string
  durationMs?: number
  conversationId?: string
  runId?: string
  requestId?: string
  meta?: Record<string, unknown>
  phases: AgentPerformancePhase[]
}

export interface AgentPerformanceMetricSample {
  id: string
  name: string
  value: number
  unit: AgentTelemetryMetricUnit
  createdAt: string
  labels?: Record<string, string | number | boolean>
}

export interface AgentPerformanceLogEntry {
  id: string
  level: AgentPerformanceLogLevel
  message: string
  createdAt: string
  operationId?: string
  details?: Record<string, unknown>
}

export interface AgentPerformanceLongTask {
  id: string
  startedAt: string
  startTime: number
  durationMs: number
  name?: string
}

export interface AgentTelemetrySink {
  beginOperation: (input: {
    kind: AgentPerformanceOperationKind
    conversationId?: string
    requestId?: string
    runId?: string
    meta?: Record<string, unknown>
  }) => string
  markPhase: (operationId: string | undefined, name: string, input?: { label?: string; details?: Record<string, unknown> }) => void
  finishOperation: (operationId: string | undefined, status: Exclude<AgentPerformanceOperationStatus, 'running'>, details?: Record<string, unknown>) => void
  recordMetric: (sample: Omit<AgentPerformanceMetricSample, 'id' | 'createdAt'>) => void
  recordLog: (entry: Omit<AgentPerformanceLogEntry, 'id' | 'createdAt'>) => void
  recordLongTask: (task: Omit<AgentPerformanceLongTask, 'id' | 'startedAt'>) => void
}
