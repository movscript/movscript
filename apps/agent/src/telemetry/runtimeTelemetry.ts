export type RuntimeTelemetryOperationKind = 'http_request' | 'run_create' | 'tool_run_create' | 'interaction_approve' | 'interaction_reject' | 'run_stream'
export type RuntimeTelemetryOperationStatus = 'running' | 'success' | 'error'
export type RuntimeTelemetryMetricUnit = 'ms' | 'bytes' | 'count'
export type RuntimeTelemetryLogLevel = 'info' | 'warning' | 'error'

export interface RuntimeTelemetryPhase {
  name: string
  label: string
  at: string
  offsetMs: number
  deltaMs: number
  details?: Record<string, unknown>
}

export interface RuntimeTelemetryOperation {
  id: string
  kind: RuntimeTelemetryOperationKind
  status: RuntimeTelemetryOperationStatus
  startedAt: string
  startedMs: number
  updatedAt: string
  endedAt?: string
  durationMs?: number
  runId?: string
  threadId?: string
  requestPath?: string
  method?: string
  meta?: Record<string, unknown>
  phases: RuntimeTelemetryPhase[]
}

export interface RuntimeTelemetryMetricSample {
  name: string
  value: number
  unit: RuntimeTelemetryMetricUnit
  createdAt: string
  labels?: Record<string, string | number | boolean>
}

export interface RuntimeTelemetryLogEntry {
  level: RuntimeTelemetryLogLevel
  message: string
  createdAt: string
  operationId?: string
  details?: Record<string, unknown>
}

export interface RuntimeTelemetrySnapshot {
  operations: RuntimeTelemetryOperation[]
  metrics: RuntimeTelemetryMetricSample[]
  logs: RuntimeTelemetryLogEntry[]
  summary: {
    operationCount: number
    runningOperationCount: number
    slowOperationCount: number
    errorOperationCount: number
  }
}

const MAX_OPERATIONS = 200
const MAX_METRICS = 1200
const MAX_LOGS = 300
const SLOW_THRESHOLDS_MS: Record<RuntimeTelemetryOperationKind, number> = {
  http_request: 1_000,
  run_create: 800,
  tool_run_create: 800,
  interaction_approve: 600,
  interaction_reject: 600,
  run_stream: 1_000,
}

export class RuntimeTelemetryRegistry {
  private operations: RuntimeTelemetryOperation[] = []
  private metrics: RuntimeTelemetryMetricSample[] = []
  private logs: RuntimeTelemetryLogEntry[] = []

  beginOperation(input: {
    kind: RuntimeTelemetryOperationKind
    runId?: string
    threadId?: string
    requestPath?: string
    method?: string
    meta?: Record<string, unknown>
  }): string {
    const startedMs = performanceNow()
    const id = telemetryId('runtime_op')
    this.operations.unshift({
      id,
      kind: input.kind,
      status: 'running',
      startedAt: new Date().toISOString(),
      startedMs,
      updatedAt: new Date().toISOString(),
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.threadId ? { threadId: input.threadId } : {}),
      ...(input.requestPath ? { requestPath: input.requestPath } : {}),
      ...(input.method ? { method: input.method } : {}),
      ...(input.meta ? { meta: input.meta } : {}),
      phases: [{
        name: 'operation_start',
        label: phaseLabel('operation_start'),
        at: new Date().toISOString(),
        offsetMs: 0,
        deltaMs: 0,
      }],
    })
    this.operations = this.operations.slice(0, MAX_OPERATIONS)
    return id
  }

  markPhase(operationId: string | undefined, name: string, details?: Record<string, unknown>): void {
    if (!operationId) return
    const operation = this.operations.find((item) => item.id === operationId)
    if (!operation || operation.status !== 'running') return
    const atMs = performanceNow()
    const previous = operation.phases[operation.phases.length - 1]
    const offsetMs = Math.max(0, atMs - operation.startedMs)
    const deltaMs = previous ? Math.max(0, offsetMs - previous.offsetMs) : offsetMs
    operation.updatedAt = new Date().toISOString()
    operation.phases.push({
      name,
      label: phaseLabel(name),
      at: new Date().toISOString(),
      offsetMs,
      deltaMs,
      ...(details ? { details } : {}),
    })
    this.recordMetric({
      name: 'movscript_agent_operation_phase_offset_ms',
      value: offsetMs,
      unit: 'ms',
      labels: { kind: operation.kind, phase: name },
    })
    this.recordMetric({
      name: 'movscript_agent_operation_phase_delta_ms',
      value: deltaMs,
      unit: 'ms',
      labels: { kind: operation.kind, phase: name },
    })
  }

  finishOperation(operationId: string | undefined, status: Exclude<RuntimeTelemetryOperationStatus, 'running'>, details?: Record<string, unknown>): void {
    if (!operationId) return
    const operation = this.operations.find((item) => item.id === operationId)
    if (!operation || operation.status !== 'running') return
    const endedMs = performanceNow()
    const durationMs = Math.max(0, endedMs - operation.startedMs)
    const previous = operation.phases[operation.phases.length - 1]
    operation.status = status
    operation.updatedAt = new Date().toISOString()
    operation.endedAt = new Date().toISOString()
    operation.durationMs = durationMs
    operation.phases.push({
      name: `operation_${status}`,
      label: phaseLabel(`operation_${status}`),
      at: new Date().toISOString(),
      offsetMs: durationMs,
      deltaMs: previous ? Math.max(0, durationMs - previous.offsetMs) : durationMs,
      ...(details ? { details } : {}),
    })
    this.recordMetric({
      name: 'movscript_agent_operation_duration_ms',
      value: durationMs,
      unit: 'ms',
      labels: { kind: operation.kind, status },
    })
    const threshold = SLOW_THRESHOLDS_MS[operation.kind]
    if (durationMs >= threshold || status === 'error') {
      const slowest = slowestPhase(operation)
      this.recordLog({
        level: status === 'error' ? 'error' : 'warning',
        operationId: operation.id,
        message: status === 'error'
          ? `${operationLabel(operation.kind)} failed in ${formatMs(durationMs)}`
          : `${operationLabel(operation.kind)} slow: ${formatMs(durationMs)}, slowest phase ${slowest?.label ?? 'unknown'} ${formatMs(slowest?.deltaMs ?? 0)}`,
        details: {
          kind: operation.kind,
          durationMs,
          slowestPhase: slowest?.name,
          ...(details ?? {}),
        },
      })
    }
  }

  recordMetric(sample: Omit<RuntimeTelemetryMetricSample, 'createdAt'>): void {
    this.metrics.unshift({
      ...sample,
      createdAt: new Date().toISOString(),
    })
    this.metrics = this.metrics.slice(0, MAX_METRICS)
  }

  recordLog(entry: Omit<RuntimeTelemetryLogEntry, 'createdAt'>): void {
    this.logs.unshift({
      ...entry,
      createdAt: new Date().toISOString(),
    })
    this.logs = this.logs.slice(0, MAX_LOGS)
  }

  snapshot(): RuntimeTelemetrySnapshot {
    return {
      operations: this.operations.map(copyOperation),
      metrics: [...this.metrics],
      logs: [...this.logs],
      summary: {
        operationCount: this.operations.length,
        runningOperationCount: this.operations.filter((operation) => operation.status === 'running').length,
        slowOperationCount: this.operations.filter((operation) => isSlowOperation(operation)).length,
        errorOperationCount: this.operations.filter((operation) => operation.status === 'error').length,
      },
    }
  }

  prometheusText(): string {
    const lines = [
      '# HELP movscript_agent_operation_duration_ms Agent operation duration in milliseconds.',
      '# TYPE movscript_agent_operation_duration_ms summary',
    ]
    const durationSamples = this.metrics.filter((sample) => sample.name === 'movscript_agent_operation_duration_ms')
    const grouped = groupSamples(durationSamples, (sample) => stableLabels(sample.labels))
    for (const [labelKey, samples] of grouped) {
      const labels = labelKey ? `{${labelKey}}` : ''
      const values = samples.map((sample) => sample.value).sort((a, b) => a - b)
      const count = values.length
      const sum = values.reduce((current, value) => current + value, 0)
      lines.push(`movscript_agent_operation_duration_ms_count${labels} ${count}`)
      lines.push(`movscript_agent_operation_duration_ms_sum${labels} ${roundMetric(sum)}`)
      lines.push(`movscript_agent_operation_duration_ms{quantile="0.95"${labelKey ? `,${labelKey}` : ''}} ${roundMetric(percentile(values, 0.95))}`)
      lines.push(`movscript_agent_operation_duration_ms{quantile="0.99"${labelKey ? `,${labelKey}` : ''}} ${roundMetric(percentile(values, 0.99))}`)
    }

    lines.push('# HELP movscript_agent_operation_active Active agent operations.')
    lines.push('# TYPE movscript_agent_operation_active gauge')
    const activeByKind = new Map<RuntimeTelemetryOperationKind, number>()
    for (const operation of this.operations) {
      if (operation.status !== 'running') continue
      activeByKind.set(operation.kind, (activeByKind.get(operation.kind) ?? 0) + 1)
    }
    for (const [kind, count] of activeByKind) {
      lines.push(`movscript_agent_operation_active{kind="${escapeLabel(kind)}"} ${count}`)
    }
    lines.push(`movscript_agent_operation_active ${this.operations.filter((operation) => operation.status === 'running').length}`)

    lines.push('# HELP movscript_agent_slow_operation_total Slow agent operations retained in local telemetry.')
    lines.push('# TYPE movscript_agent_slow_operation_total gauge')
    lines.push(`movscript_agent_slow_operation_total ${this.operations.filter((operation) => isSlowOperation(operation)).length}`)

    lines.push('# HELP movscript_agent_error_operation_total Failed agent operations retained in local telemetry.')
    lines.push('# TYPE movscript_agent_error_operation_total gauge')
    lines.push(`movscript_agent_error_operation_total ${this.operations.filter((operation) => operation.status === 'error').length}`)

    return `${lines.join('\n')}\n`
  }

  clear(): void {
    this.operations = []
    this.metrics = []
    this.logs = []
  }
}

function copyOperation(operation: RuntimeTelemetryOperation): RuntimeTelemetryOperation {
  return {
    ...operation,
    phases: operation.phases.map((phase) => ({ ...phase })),
    ...(operation.meta ? { meta: { ...operation.meta } } : {}),
  }
}

function slowestPhase(operation: RuntimeTelemetryOperation): RuntimeTelemetryPhase | undefined {
  return operation.phases
    .filter((phase) => phase.name !== 'operation_start')
    .sort((a, b) => b.deltaMs - a.deltaMs)[0]
}

function isSlowOperation(operation: RuntimeTelemetryOperation): boolean {
  if (operation.status === 'running' || typeof operation.durationMs !== 'number') return false
  return operation.durationMs >= SLOW_THRESHOLDS_MS[operation.kind]
}

function phaseLabel(name: string): string {
  const labels: Record<string, string> = {
    operation_start: 'Operation start',
    operation_success: 'Operation success',
    operation_error: 'Operation error',
    request_received: 'Request received',
    body_read: 'Request body read',
    message_created: 'User message created',
    run_created: 'Run created',
    response_written: 'Response written',
    stream_subscribed: 'Stream subscribed',
    stream_closed: 'Stream closed',
    interaction_resolved: 'Interaction resolved',
  }
  return labels[name] ?? name.replace(/_/g, ' ')
}

function operationLabel(kind: RuntimeTelemetryOperationKind): string {
  return kind.replace(/_/g, ' ')
}

function groupSamples<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const groupKey = key(item)
    const list = map.get(groupKey) ?? []
    list.push(item)
    map.set(groupKey, list)
  }
  return map
}

function stableLabels(labels?: Record<string, string | number | boolean>): string {
  if (!labels) return ''
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}="${escapeLabel(String(value))}"`)
    .join(',')
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1))
  return values[index] ?? 0
}

function roundMetric(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3).replace(/\.?0+$/, '') : '0'
}

function formatMs(value: number): string {
  if (value < 1_000) return `${Math.round(value)}ms`
  return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}s`
}

function performanceNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now()
  return Date.now()
}

function telemetryId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
