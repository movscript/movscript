import type { RuntimeTelemetryLogEntry, RuntimeTelemetrySpan } from './runtimeTelemetry.js'

export interface RuntimeTelemetryExternalExporter {
  recordSpan: (span: RuntimeTelemetrySpan) => void
  recordLog: (log: RuntimeTelemetryLogEntry) => void
  flush: () => Promise<void>
}

interface RuntimeOtlpExporterOptions {
  endpoint: string
  serviceName?: string
  fetchImpl?: typeof fetch
  batchSize?: number
  flushIntervalMs?: number
}

const SCOPE_NAME = 'movscript-agent-runtime'
const SCOPE_VERSION = '0.1.0'
const DEFAULT_BATCH_SIZE = 32
const DEFAULT_FLUSH_INTERVAL_MS = 1_000

export class RuntimeOtlpHttpExporter implements RuntimeTelemetryExternalExporter {
  private readonly endpoint: string
  private readonly serviceName: string
  private readonly fetchImpl: typeof fetch
  private readonly batchSize: number
  private readonly flushIntervalMs: number
  private spanQueue: RuntimeTelemetrySpan[] = []
  private logQueue: RuntimeTelemetryLogEntry[] = []
  private flushTimer: ReturnType<typeof setTimeout> | undefined
  private flushing = false

  constructor(options: RuntimeOtlpExporterOptions) {
    this.endpoint = options.endpoint.replace(/\/+$/, '')
    this.serviceName = options.serviceName ?? 'movscript-agent'
    this.fetchImpl = options.fetchImpl ?? fetch
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS
  }

  recordSpan(span: RuntimeTelemetrySpan): void {
    this.spanQueue.push(span)
    this.scheduleFlush()
  }

  recordLog(log: RuntimeTelemetryLogEntry): void {
    this.logQueue.push(log)
    this.scheduleFlush()
  }

  async flush(): Promise<void> {
    if (this.flushing) return
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = undefined
    }
    const spans = this.spanQueue.splice(0, this.batchSize)
    const logs = this.logQueue.splice(0, this.batchSize)
    if (spans.length === 0 && logs.length === 0) return
    this.flushing = true
    try {
      await Promise.all([
        spans.length > 0 ? this.postJSON('/v1/traces', tracePayload(this.serviceName, spans)) : undefined,
        logs.length > 0 ? this.postJSON('/v1/logs', logPayload(this.serviceName, logs)) : undefined,
      ])
    } catch (error) {
      this.spanQueue.unshift(...spans)
      this.logQueue.unshift(...logs)
      console.warn(`[agent] otlp export failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      this.flushing = false
      if (this.spanQueue.length > 0 || this.logQueue.length > 0) this.scheduleFlush()
    }
  }

  private scheduleFlush(): void {
    if (this.spanQueue.length + this.logQueue.length >= this.batchSize) {
      void this.flush()
      return
    }
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined
      void this.flush()
    }, this.flushIntervalMs)
  }

  private async postJSON(path: string, body: unknown): Promise<void> {
    const response = await this.fetchImpl(`${this.endpoint}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`OTLP ${path} returned ${response.status}`)
  }
}

type RuntimeOtlpEnv = Partial<Record<'MOVSCRIPT_AGENT_OTLP_ENDPOINT', string | undefined>>

export function createRuntimeOtlpExporterFromEnv(env: RuntimeOtlpEnv = process.env): RuntimeTelemetryExternalExporter | undefined {
  const endpoint = env.MOVSCRIPT_AGENT_OTLP_ENDPOINT?.trim()
  if (!endpoint) return undefined
  return new RuntimeOtlpHttpExporter({ endpoint })
}

function tracePayload(serviceName: string, spans: RuntimeTelemetrySpan[]) {
  return {
    resourceSpans: [{
      resource: resource(serviceName),
      scopeSpans: [{
        scope: { name: SCOPE_NAME, version: SCOPE_VERSION },
        spans: spans.map((span) => ({
          traceId: traceId(span.runId),
          spanId: spanId(span.id),
          name: span.name,
          kind: 1,
          startTimeUnixNano: isoToUnixNano(span.startedAt),
          endTimeUnixNano: isoToUnixNano(span.endedAt ?? span.startedAt, span.durationMs),
          attributes: attributes({
            'agent.run_id': span.runId,
            'agent.thread_id': span.threadId,
            'agent.trace_event_id': span.traceEventId,
            'agent.span_kind': span.kind,
            'agent.tool_name': span.toolName,
            'agent.status': span.status,
            ...(span.labels ?? {}),
          }),
          status: otelSpanStatus(span.status),
        })),
      }],
    }],
  }
}

function logPayload(serviceName: string, logs: RuntimeTelemetryLogEntry[]) {
  return {
    resourceLogs: [{
      resource: resource(serviceName),
      scopeLogs: [{
        scope: { name: SCOPE_NAME, version: SCOPE_VERSION },
        logRecords: logs.map((log) => ({
          timeUnixNano: isoToUnixNano(log.createdAt),
          severityText: log.level.toUpperCase(),
          severityNumber: severityNumber(log.level),
          body: { stringValue: log.message },
          attributes: attributes({
            'agent.operation_id': log.operationId,
            'agent.span_id': log.spanId,
            ...(log.details ?? {}),
          }),
        })),
      }],
    }],
  }
}

function resource(serviceName: string) {
  return {
    attributes: attributes({
      'service.name': serviceName,
      'telemetry.sdk.language': 'nodejs',
      'telemetry.sdk.name': 'movscript-runtime-otlp',
      'telemetry.sdk.version': SCOPE_VERSION,
    }),
  }
}

function attributes(values: Record<string, unknown>) {
  return Object.entries(values)
    .filter((entry): entry is [string, string | number | boolean] => ['string', 'number', 'boolean'].includes(typeof entry[1]))
    .map(([key, value]) => ({
      key,
      value: attributeValue(value),
    }))
}

function attributeValue(value: string | number | boolean) {
  if (typeof value === 'number') return Number.isInteger(value) ? { intValue: value } : { doubleValue: value }
  if (typeof value === 'boolean') return { boolValue: value }
  return { stringValue: value }
}

function otelSpanStatus(status: RuntimeTelemetrySpan['status']) {
  if (status === 'failed') return { code: 2, message: status }
  if (status === 'completed') return { code: 1 }
  return { code: 0 }
}

function severityNumber(level: RuntimeTelemetryLogEntry['level']): number {
  if (level === 'error') return 17
  if (level === 'warning') return 13
  return 9
}

function isoToUnixNano(value: string, offsetMs = 0): string {
  const ms = Date.parse(value) + offsetMs
  if (!Number.isFinite(ms)) return '0'
  return `${Math.round(ms * 1_000_000)}`
}

function traceId(input: string): string {
  return stableHex(input, 32)
}

function spanId(input: string): string {
  return stableHex(input, 16)
}

function stableHex(input: string, length: number): string {
  let hash = 2166136261
  let output = ''
  while (output.length < length) {
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }
    hash ^= output.length
    output += (hash >>> 0).toString(16).padStart(8, '0')
  }
  return output.slice(0, length).replace(/^0+$/, '1'.padStart(length, '0'))
}
