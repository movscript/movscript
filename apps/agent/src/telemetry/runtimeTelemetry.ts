import { renderRuntimeTelemetryWithPromClient } from './runtimePrometheusExporter.js'
import type { RuntimeTelemetryExternalExporter } from './runtimeOtlpExporter.js'

export type RuntimeTelemetryOperationKind = 'http_request' | 'run_create' | 'tool_run_create' | 'interaction_approve' | 'interaction_reject' | 'run_stream'
export type RuntimeTelemetryOperationStatus = 'running' | 'success' | 'error'
export type RuntimeTelemetryMetricUnit = 'ms' | 'bytes' | 'count'
export type RuntimeTelemetryLogLevel = 'info' | 'warning' | 'error'
export type RuntimeTelemetrySpanStatus = 'started' | 'completed' | 'blocked' | 'failed' | 'info'

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
  spanId?: string
  details?: Record<string, unknown>
}

export interface RuntimeTelemetrySpan {
  id: string
  traceEventId?: string
  runId: string
  threadId?: string
  kind: string
  name: string
  status: RuntimeTelemetrySpanStatus
  startedAt: string
  endedAt?: string
  durationMs?: number
  toolName?: string
  labels?: Record<string, string | number | boolean>
}

export interface RuntimeTelemetrySnapshot {
  schema: 'movscript.agent.runtime-telemetry.v1'
  generatedAt: string
  service: {
    name: 'movscript-agent'
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
  operations: RuntimeTelemetryOperation[]
  spans: RuntimeTelemetrySpan[]
  metrics: RuntimeTelemetryMetricSample[]
  logs: RuntimeTelemetryLogEntry[]
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

const MAX_OPERATIONS = 200
const MAX_SPANS = 600
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
const SLOW_SPAN_THRESHOLDS_MS: Record<string, number> = {
  context: 1_000,
  memory: 1_000,
  manifest: 1_000,
  prompt: 1_000,
  model_call: 3_000,
  tool_call: 2_000,
  approval: 600,
  input: 600,
  task: 1_000,
  taskGraph: 1_000,
}

export class RuntimeTelemetryRegistry {
  private operations: RuntimeTelemetryOperation[] = []
  private spans: RuntimeTelemetrySpan[] = []
  private metrics: RuntimeTelemetryMetricSample[] = []
  private logs: RuntimeTelemetryLogEntry[] = []
  private externalExporter: RuntimeTelemetryExternalExporter | undefined

  constructor(options: { externalExporter?: RuntimeTelemetryExternalExporter } = {}) {
    this.externalExporter = options.externalExporter
  }

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

  recordSpan(input: {
    traceEventId?: string
    runId: string
    threadId?: string
    kind: string
    name: string
    status: RuntimeTelemetrySpanStatus
    startedAt?: string
    endedAt?: string
    durationMs?: number
    toolName?: string
    labels?: Record<string, string | number | boolean>
  }): void {
    const span: RuntimeTelemetrySpan = {
      id: telemetryId('runtime_span'),
      ...(input.traceEventId ? { traceEventId: input.traceEventId } : {}),
      runId: input.runId,
      ...(input.threadId ? { threadId: input.threadId } : {}),
      kind: input.kind,
      name: input.name,
      status: input.status,
      startedAt: input.startedAt ?? new Date().toISOString(),
      ...(input.endedAt ? { endedAt: input.endedAt } : {}),
      ...(typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) ? { durationMs: input.durationMs } : {}),
      ...(input.toolName ? { toolName: input.toolName } : {}),
      ...(input.labels ? { labels: input.labels } : {}),
    }
    this.spans.unshift(span)
    this.spans = this.spans.slice(0, MAX_SPANS)
    this.externalExporter?.recordSpan(span)

    const labels = {
      kind: input.kind,
      status: input.status,
      ...(input.toolName ? { tool_name: input.toolName } : {}),
      ...(input.labels ?? {}),
    }
    this.recordMetric({
      name: 'movscript_agent_trace_event_total',
      value: 1,
      unit: 'count',
      labels,
    })
    if (typeof span.durationMs === 'number') {
      this.recordMetric({
        name: 'movscript_agent_trace_span_duration_ms',
        value: span.durationMs,
        unit: 'ms',
        labels,
      })
    }
    if (isErrorSpan(span) || isSlowSpan(span)) {
      this.recordLog({
        level: isErrorSpan(span) ? 'error' : 'warning',
        spanId: span.id,
        message: isErrorSpan(span)
          ? `Trace ${span.kind} failed: ${span.name}`
          : `Trace ${span.kind} slow: ${span.name} ${formatMs(span.durationMs ?? 0)}`,
        details: {
          runId: span.runId,
          threadId: span.threadId,
          traceEventId: span.traceEventId,
          kind: span.kind,
          toolName: span.toolName,
          durationMs: span.durationMs,
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
    const log = {
      ...entry,
      createdAt: new Date().toISOString(),
    }
    this.logs.unshift(log)
    this.logs = this.logs.slice(0, MAX_LOGS)
    this.externalExporter?.recordLog(log)
  }

  snapshot(): RuntimeTelemetrySnapshot {
    return {
      schema: 'movscript.agent.runtime-telemetry.v1',
      generatedAt: new Date().toISOString(),
      service: {
        name: 'movscript-agent',
        storage: 'memory',
        metricsEndpoint: '/metrics',
        snapshotEndpoint: '/runtime/telemetry',
      },
      retention: {
        operations: MAX_OPERATIONS,
        spans: MAX_SPANS,
        metrics: MAX_METRICS,
        logs: MAX_LOGS,
      },
      operations: this.operations.map(copyOperation),
      spans: this.spans.map(copySpan),
      metrics: [...this.metrics],
      logs: [...this.logs],
      summary: {
        operationCount: this.operations.length,
        runningOperationCount: this.operations.filter((operation) => operation.status === 'running').length,
        slowOperationCount: this.operations.filter((operation) => isSlowOperation(operation)).length,
        errorOperationCount: this.operations.filter((operation) => operation.status === 'error').length,
        spanCount: this.spans.length,
        slowSpanCount: this.spans.filter((span) => isSlowSpan(span)).length,
        errorSpanCount: this.spans.filter((span) => isErrorSpan(span)).length,
      },
    }
  }

  prometheusText(): string {
    const lines = [
      '# HELP movscript_agent_telemetry_info Agent telemetry metadata.',
      '# TYPE movscript_agent_telemetry_info gauge',
      'movscript_agent_telemetry_info{service="movscript-agent",storage="memory",metrics_endpoint="/metrics",snapshot_endpoint="/runtime/telemetry"} 1',
      '# HELP movscript_agent_telemetry_retention_limit Agent telemetry in-memory retention limit.',
      '# TYPE movscript_agent_telemetry_retention_limit gauge',
      `movscript_agent_telemetry_retention_limit{kind="operations"} ${MAX_OPERATIONS}`,
      `movscript_agent_telemetry_retention_limit{kind="spans"} ${MAX_SPANS}`,
      `movscript_agent_telemetry_retention_limit{kind="metrics"} ${MAX_METRICS}`,
      `movscript_agent_telemetry_retention_limit{kind="logs"} ${MAX_LOGS}`,
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

    lines.push('# HELP movscript_agent_trace_span_duration_ms Agent trace span duration in milliseconds.')
    lines.push('# TYPE movscript_agent_trace_span_duration_ms summary')
    const spanDurationSamples = this.metrics.filter((sample) => sample.name === 'movscript_agent_trace_span_duration_ms')
    const spanDurationGroups = groupSamples(spanDurationSamples, (sample) => stableLabels(sample.labels))
    for (const [labelKey, samples] of spanDurationGroups) {
      const labels = labelKey ? `{${labelKey}}` : ''
      const values = samples.map((sample) => sample.value).sort((a, b) => a - b)
      const count = values.length
      const sum = values.reduce((current, value) => current + value, 0)
      lines.push(`movscript_agent_trace_span_duration_ms_count${labels} ${count}`)
      lines.push(`movscript_agent_trace_span_duration_ms_sum${labels} ${roundMetric(sum)}`)
      lines.push(`movscript_agent_trace_span_duration_ms{quantile="0.95"${labelKey ? `,${labelKey}` : ''}} ${roundMetric(percentile(values, 0.95))}`)
      lines.push(`movscript_agent_trace_span_duration_ms{quantile="0.99"${labelKey ? `,${labelKey}` : ''}} ${roundMetric(percentile(values, 0.99))}`)
    }

    lines.push('# HELP movscript_agent_trace_event_total Agent trace events retained in local telemetry.')
    lines.push('# TYPE movscript_agent_trace_event_total gauge')
    const traceEventSamples = this.metrics.filter((sample) => sample.name === 'movscript_agent_trace_event_total')
    const traceEventGroups = groupSamples(traceEventSamples, (sample) => stableLabels(sample.labels))
    for (const [labelKey, samples] of traceEventGroups) {
      const labels = labelKey ? `{${labelKey}}` : ''
      const count = samples.reduce((current, sample) => current + sample.value, 0)
      lines.push(`movscript_agent_trace_event_total${labels} ${roundMetric(count)}`)
    }

    lines.push('# HELP movscript_agent_slow_trace_span_total Slow agent trace spans retained in local telemetry.')
    lines.push('# TYPE movscript_agent_slow_trace_span_total gauge')
    lines.push(`movscript_agent_slow_trace_span_total ${this.spans.filter((span) => isSlowSpan(span)).length}`)

    lines.push('# HELP movscript_agent_error_trace_span_total Failed agent trace spans retained in local telemetry.')
    lines.push('# TYPE movscript_agent_error_trace_span_total gauge')
    lines.push(`movscript_agent_error_trace_span_total ${this.spans.filter((span) => isErrorSpan(span)).length}`)

    return `${lines.join('\n')}\n`
  }

  async prometheusTextAsync(): Promise<string> {
    return await renderRuntimeTelemetryWithPromClient(this.snapshot())
  }

  async flushExternalTelemetry(): Promise<void> {
    await this.externalExporter?.flush()
  }

  clear(): void {
    this.operations = []
    this.spans = []
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

function copySpan(span: RuntimeTelemetrySpan): RuntimeTelemetrySpan {
  return {
    ...span,
    ...(span.labels ? { labels: { ...span.labels } } : {}),
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

function isSlowSpan(span: RuntimeTelemetrySpan): boolean {
  if (typeof span.durationMs !== 'number') return false
  return span.durationMs >= (SLOW_SPAN_THRESHOLDS_MS[span.kind] ?? 1_000)
}

function isErrorSpan(span: RuntimeTelemetrySpan): boolean {
  return span.status === 'failed' || span.kind === 'error'
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
