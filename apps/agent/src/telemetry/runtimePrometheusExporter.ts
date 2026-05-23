import { Gauge, Registry, Summary } from 'prom-client'
import type {
  RuntimeTelemetryMetricSample,
  RuntimeTelemetryOperation,
  RuntimeTelemetrySnapshot,
} from './runtimeTelemetry.js'

type PrometheusLabels = Record<string, string | number>

export async function renderRuntimeTelemetryWithPromClient(snapshot: RuntimeTelemetrySnapshot): Promise<string> {
  const registry = new Registry()
  renderTelemetryMetadata(registry, snapshot)
  renderOperationMetrics(registry, snapshot)
  renderTraceMetrics(registry, snapshot)
  return await registry.metrics()
}

function renderTelemetryMetadata(registry: Registry, snapshot: RuntimeTelemetrySnapshot): void {
  const info = new Gauge({
    name: 'movscript_agent_telemetry_info',
    help: 'Agent telemetry metadata.',
    labelNames: ['service', 'storage', 'metrics_endpoint', 'snapshot_endpoint'],
    registers: [registry],
  })
  info.set({
    service: snapshot.service.name,
    storage: snapshot.service.storage,
    metrics_endpoint: snapshot.service.metricsEndpoint,
    snapshot_endpoint: snapshot.service.snapshotEndpoint,
  }, 1)

  const retention = new Gauge({
    name: 'movscript_agent_telemetry_retention_limit',
    help: 'Agent telemetry in-memory retention limit.',
    labelNames: ['kind'],
    registers: [registry],
  })
  retention.set({ kind: 'operations' }, snapshot.retention.operations)
  retention.set({ kind: 'spans' }, snapshot.retention.spans)
  retention.set({ kind: 'metrics' }, snapshot.retention.metrics)
  retention.set({ kind: 'logs' }, snapshot.retention.logs)
}

function renderOperationMetrics(registry: Registry, snapshot: RuntimeTelemetrySnapshot): void {
  const operationDuration = new Summary({
    name: 'movscript_agent_operation_duration_ms',
    help: 'Agent operation duration in milliseconds.',
    labelNames: ['kind', 'status'],
    registers: [registry],
    percentiles: [0.95, 0.99],
  })
  for (const sample of snapshot.metrics.filter((item) => item.name === 'movscript_agent_operation_duration_ms')) {
    operationDuration.observe(labelValues(['kind', 'status'], sample.labels), sample.value)
  }

  const active = new Gauge({
    name: 'movscript_agent_operation_active',
    help: 'Active agent operations.',
    labelNames: ['kind'],
    registers: [registry],
  })
  for (const [kind, count] of activeOperationsByKind(snapshot.operations)) {
    active.set({ kind }, count)
  }

  const slow = new Gauge({
    name: 'movscript_agent_slow_operation_total',
    help: 'Slow agent operations retained in local telemetry.',
    registers: [registry],
  })
  slow.set({}, snapshot.summary.slowOperationCount)

  const errors = new Gauge({
    name: 'movscript_agent_error_operation_total',
    help: 'Failed agent operations retained in local telemetry.',
    registers: [registry],
  })
  errors.set({}, snapshot.summary.errorOperationCount)
}

function renderTraceMetrics(registry: Registry, snapshot: RuntimeTelemetrySnapshot): void {
  const traceDurationSamples = snapshot.metrics.filter((item) => item.name === 'movscript_agent_trace_span_duration_ms')
  const traceLabelNames = metricLabelNames(traceDurationSamples)
  const traceDuration = new Summary({
    name: 'movscript_agent_trace_span_duration_ms',
    help: 'Agent trace span duration in milliseconds.',
    labelNames: traceLabelNames,
    registers: [registry],
    percentiles: [0.95, 0.99],
  })
  for (const sample of traceDurationSamples) {
    traceDuration.observe(labelValues(traceLabelNames, sample.labels), sample.value)
  }

  const traceEventSamples = snapshot.metrics.filter((item) => item.name === 'movscript_agent_trace_event_total')
  const traceEventLabelNames = metricLabelNames(traceEventSamples)
  const traceEvents = new Gauge({
    name: 'movscript_agent_trace_event_total',
    help: 'Agent trace events retained in local telemetry.',
    labelNames: traceEventLabelNames,
    registers: [registry],
  })
  for (const [key, samples] of groupSamples(traceEventSamples, (sample) => stableLabelKey(sample.labels))) {
    traceEvents.set(labelValues(traceEventLabelNames, samples[0]?.labels), samples.reduce((sum, sample) => sum + sample.value, 0))
    void key
  }

  const slow = new Gauge({
    name: 'movscript_agent_slow_trace_span_total',
    help: 'Slow agent trace spans retained in local telemetry.',
    registers: [registry],
  })
  slow.set({}, snapshot.summary.slowSpanCount)

  const errors = new Gauge({
    name: 'movscript_agent_error_trace_span_total',
    help: 'Failed agent trace spans retained in local telemetry.',
    registers: [registry],
  })
  errors.set({}, snapshot.summary.errorSpanCount)
}

function activeOperationsByKind(operations: RuntimeTelemetryOperation[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const operation of operations) {
    if (operation.status !== 'running') continue
    map.set(operation.kind, (map.get(operation.kind) ?? 0) + 1)
  }
  return map
}

function metricLabelNames(samples: RuntimeTelemetryMetricSample[]): string[] {
  const names = new Set<string>()
  for (const sample of samples) {
    for (const key of Object.keys(sample.labels ?? {})) names.add(key)
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b))
}

function labelValues(labelNames: string[], labels?: RuntimeTelemetryMetricSample['labels']): PrometheusLabels {
  const values: PrometheusLabels = {}
  for (const name of labelNames) {
    const value = labels?.[name]
    values[name] = value === undefined ? '' : String(value)
  }
  return values
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

function stableLabelKey(labels?: RuntimeTelemetryMetricSample['labels']): string {
  if (!labels) return ''
  return Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${String(value)}`)
    .join('|')
}
