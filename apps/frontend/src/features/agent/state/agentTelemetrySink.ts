import {
  formatMs,
  operationKindLabel,
  performanceNow,
  phaseLabel,
  slowestPhase,
} from '@/features/agent/state/agentPerformanceFormatting'
import type {
  AgentPerformanceLogEntry,
  AgentPerformanceLongTask,
  AgentPerformanceMetricSample,
  AgentPerformanceOperation,
  AgentPerformanceOperationKind,
  AgentTelemetrySink,
} from '@/features/agent/state/agentPerformanceTypes'

const SLOW_OPERATION_THRESHOLDS_MS: Record<AgentPerformanceOperationKind, number> = {
  send: 1_000,
  send_preview_confirm: 600,
  approval: 600,
  rejection: 600,
  input_answer: 600,
  active_run_input: 600,
  external_task: 1_000,
  conversation_create: 800,
  conversation_open: 800,
  timeline_load: 600,
}

export function createTransientAgentTelemetrySink(onComplete: {
  operation?: (operation: AgentPerformanceOperation) => void
  metric?: (sample: AgentPerformanceMetricSample) => void
  log?: (entry: AgentPerformanceLogEntry) => void
  longTask?: (task: AgentPerformanceLongTask) => void
}): AgentTelemetrySink {
  const activeOperations = new Map<string, AgentPerformanceOperation>()
  return {
    beginOperation: (input) => {
      const id = createPerformanceId('agent_op')
      const startedMs = performanceNow()
      const operation: AgentPerformanceOperation = {
        id,
        kind: input.kind,
        status: 'running',
        startedAt: new Date().toISOString(),
        startedMs,
        updatedAt: new Date().toISOString(),
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        ...(input.requestId ? { requestId: input.requestId } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
        ...(input.meta ? { meta: input.meta } : {}),
        phases: [{
          id: createPerformanceId('agent_phase'),
          name: 'operation_start',
          label: phaseLabel('operation_start'),
          at: startedMs,
          offsetMs: 0,
          durationFromPreviousMs: 0,
        }],
      }
      activeOperations.set(id, operation)
      return id
    },

    markPhase: (operationId, name, input = {}) => {
      if (!operationId) return
      const operation = activeOperations.get(operationId)
      if (!operation || operation.status !== 'running') return
      const at = performanceNow()
      const previous = operation.phases[operation.phases.length - 1]
      const offsetMs = Math.max(0, at - operation.startedMs)
      const deltaMs = previous ? Math.max(0, at - previous.at) : offsetMs
      operation.updatedAt = new Date().toISOString()
      operation.phases.push({
        id: createPerformanceId('agent_phase'),
        name,
        label: input.label ?? phaseLabel(name),
        at,
        offsetMs,
        durationFromPreviousMs: deltaMs,
        ...(input.details ? { details: input.details } : {}),
      })
    },

    finishOperation: (operationId, status, details) => {
      if (!operationId) return
      const operation = activeOperations.get(operationId)
      if (!operation || operation.status !== 'running') return
      const endedMs = performanceNow()
      const durationMs = Math.max(0, endedMs - operation.startedMs)
      const previous = operation.phases[operation.phases.length - 1]
      operation.status = status
      operation.updatedAt = new Date().toISOString()
      operation.endedAt = new Date().toISOString()
      operation.durationMs = durationMs
      operation.phases.push({
        id: createPerformanceId('agent_phase'),
        name: `operation_${status}`,
        label: phaseLabel(`operation_${status}`),
        at: endedMs,
        offsetMs: durationMs,
        durationFromPreviousMs: previous ? Math.max(0, endedMs - previous.at) : durationMs,
        ...(details ? { details } : {}),
      })
      activeOperations.delete(operationId)
      if (durationMs >= SLOW_OPERATION_THRESHOLDS_MS[operation.kind] || status === 'error') {
        const slowest = slowestPhase(operation)
        onComplete.log?.({
          id: createPerformanceId('agent_log'),
          level: status === 'error' ? 'error' : 'warning',
          operationId: operation.id,
          message: status === 'error'
            ? `${operationKindLabel(operation.kind)}失败：${formatMs(durationMs)}`
            : `${operationKindLabel(operation.kind)}较慢：${formatMs(durationMs)}，主要耗时 ${slowest?.label ?? '未知阶段'} ${formatMs(slowest?.durationFromPreviousMs ?? 0)}`,
          createdAt: new Date().toISOString(),
          details: {
            telemetryArea: 'agent_frontend',
            telemetryKind: status === 'error' ? 'operation_error' : 'slow_operation',
            kind: operation.kind,
            durationMs,
            slowestPhase: slowest?.name,
            ...(details ?? {}),
          },
        })
      }
      onComplete.operation?.({ ...operation, phases: [...operation.phases] })
    },

    recordMetric: (sample) => onComplete.metric?.(createMetricSample(sample)),

    recordLog: (entry) => onComplete.log?.({
      ...entry,
      id: createPerformanceId('agent_log'),
      createdAt: new Date().toISOString(),
    }),

    recordLongTask: (task) => {
      const longTask: AgentPerformanceLongTask = {
        ...task,
        id: createPerformanceId('agent_longtask'),
        startedAt: new Date(Date.now() - Math.max(0, performanceNow() - task.startTime)).toISOString(),
      }
      onComplete.longTask?.(longTask)
    },
  }
}

export function createNoopAgentTelemetrySink(): AgentTelemetrySink {
  return createTransientAgentTelemetrySink({})
}

function createMetricSample(sample: Omit<AgentPerformanceMetricSample, 'id' | 'createdAt'>): AgentPerformanceMetricSample {
  return {
    ...sample,
    id: createPerformanceId('agent_metric'),
    createdAt: new Date().toISOString(),
  }
}

function createPerformanceId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}_${random}`
}
