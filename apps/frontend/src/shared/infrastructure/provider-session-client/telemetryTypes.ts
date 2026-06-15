import type { AgentTelemetryMetricUnit } from '@/shared/infrastructure/provider-session-client/coreTypes'

export interface ProviderSessionTelemetryMetricSample {
  name: string
  value: number
  unit: AgentTelemetryMetricUnit
  createdAt: string
  labels?: Record<string, string | number | boolean>
}

export interface ProviderSessionTelemetryLogEntry {
  level: 'info' | 'warning' | 'error'
  message: string
  createdAt: string
  operationId?: string
  spanId?: string
  details?: Record<string, unknown>
}

export interface ProviderSessionTelemetrySpan {
  id: string
  traceEventId?: string
  runId: string
  threadId?: string
  kind: string
  name: string
  status: 'started' | 'completed' | 'blocked' | 'failed' | 'info'
  startedAt: string
  endedAt?: string
  durationMs?: number
  toolName?: string
  labels?: Record<string, string | number | boolean>
}

export interface ProviderSessionTelemetryOperation {
  id: string
  kind: string
  status: 'running' | 'success' | 'error'
  startedAt: string
  updatedAt: string
  endedAt?: string
  durationMs?: number
  runId?: string
  threadId?: string
  requestPath?: string
  method?: string
  phases: Array<{ name: string; label: string; at: string; offsetMs: number; deltaMs: number; details?: Record<string, unknown> }>
}

export interface ProviderSessionTelemetrySnapshot {
  schema: 'movscript.agent.runtime-telemetry.v1'
  generatedAt: string
  service: {
    name: 'mova'
    storage: 'memory'
    metricsEndpoint: '/metrics'
    snapshotEndpoint: '/runtime/telemetry'
  }
  retention: {
    operations: number
    spans: number
    metrics: number
    logs: number
  }
  operations: ProviderSessionTelemetryOperation[]
  spans: ProviderSessionTelemetrySpan[]
  metrics: ProviderSessionTelemetryMetricSample[]
  logs: ProviderSessionTelemetryLogEntry[]
  summary: {
    operationCount: number
    runningOperationCount: number
    slowOperationCount: number
    errorOperationCount: number
    spanCount: number
    slowSpanCount: number
    errorSpanCount: number
  }
}
