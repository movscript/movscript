import { getAPIV1BaseURL } from '@/shared/infrastructure/config'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { localAgentClient, type AgentRuntimeTelemetryLogEntry, type AgentRuntimeTelemetryMetricSample, type AgentRuntimeTelemetrySnapshot } from '@/shared/infrastructure/localAgentClient'
import {
  AGENT_CLIENT_TELEMETRY_SCHEMA,
  createAgentTelemetryLogSample,
  createAgentTelemetryMetricSample,
  isAgentTelemetryReportableMetricName,
  type AgentTelemetryMetricSample,
} from '@movscript/protocol'
import {
  createTransientAgentTelemetrySink,
  setAgentTelemetrySink,
  type AgentPerformanceLogEntry,
  type AgentPerformanceLongTask,
  type AgentPerformanceMetricSample,
  type AgentPerformanceOperation,
} from '@/features/agent/state/agentPerformanceStore'

const REPORT_DEBOUNCE_MS = 2_000
const RUNTIME_TELEMETRY_POLL_MS = 15_000
const MAX_BATCH_ITEMS = 40
const MAX_PENDING_ITEMS = 400
const MAX_RUNTIME_DEDUP_IDS = 2_000

let reporterInstalled = false
let flushTimer: ReturnType<typeof setTimeout> | undefined
let runtimeTelemetryPollTimer: ReturnType<typeof setTimeout> | undefined
let runtimeTelemetryPolling = false

const sentRuntimeMetricIds = new Set<string>()
const sentRuntimeLogIds = new Set<string>()
const pendingOperations: AgentPerformanceOperation[] = []
const pendingLongTasks: AgentPerformanceLongTask[] = []
const pendingMetrics: QueuedTelemetryMetric[] = []
const pendingLogs: QueuedTelemetryLog[] = []

type QueuedTelemetryMetric = Pick<AgentPerformanceMetricSample, 'id' | 'name' | 'value' | 'unit' | 'labels'>
type QueuedTelemetryLog = Pick<AgentPerformanceLogEntry, 'id' | 'level' | 'details'>

export interface AgentClientTelemetrySnapshot {
  generated_at: string
  ingest: Array<{ status: string; batches: number; samples: number }>
  operations: Array<{
    kind: string
    status: string
    count: number
    slow: number
    duration_ms: DurationSummary
  }>
  phases: Array<{
    kind: string
    phase: string
    count: number
    duration_ms: DurationSummary
  }>
  metrics: Array<{
    name: string
    unit: AgentPerformanceMetricSample['unit']
    labels?: Record<string, string>
    count: number
    value: NumericSummary
  }>
  logs: Array<{
    level: AgentPerformanceLogEntry['level']
    area: string
    kind: string
    count: number
  }>
  long_tasks: {
    count: number
    duration_ms: DurationSummary
  }
  storage?: {
    count: number
    latest_bytes: number
    max_bytes: number
  }
  summary: {
    operations: number
    errors: number
    slow: number
    long_tasks: number
    batches: number
    samples: number
    rejected: number
    metrics: number
    logs: number
  }
}

export interface DurationSummary {
  avg: number
  max: number
  sum: number
}

export interface NumericSummary {
  avg: number
  max: number
  sum: number
}

export function installAgentTelemetryReporter(): void {
  if (reporterInstalled || typeof window === 'undefined') return
  reporterInstalled = true
  setAgentTelemetrySink(createTransientAgentTelemetrySink({
    operation: queueOperation,
    longTask: queueLongTask,
    metric: queueMetric,
    log: queueLog,
  }))
  useUserStore.subscribe((state) => {
    if (state.token) {
      scheduleFlush()
      scheduleRuntimeTelemetryPoll(0)
    }
  })
  if (useUserStore.getState().token) scheduleRuntimeTelemetryPoll(0)
}

export async function fetchAgentTelemetrySnapshot(signal?: AbortSignal): Promise<AgentClientTelemetrySnapshot> {
  const headers = authHeaders()
  const response = await fetch(`${getAPIV1BaseURL()}/agent/telemetry`, { headers, signal })
  if (!response.ok) throw new Error(`agent telemetry snapshot failed: ${response.status}`)
  return await response.json() as AgentClientTelemetrySnapshot
}

export async function flushAgentTelemetryForTest(): Promise<void> {
  await flushAgentTelemetry()
}

export function queueAgentTelemetryMetricForTest(metric: AgentPerformanceMetricSample): void {
  queueMetric(metric)
}

export function resetAgentTelemetryReporterForTest(): void {
  reporterInstalled = false
  if (flushTimer) clearTimeout(flushTimer)
  if (runtimeTelemetryPollTimer) clearTimeout(runtimeTelemetryPollTimer)
  flushTimer = undefined
  runtimeTelemetryPollTimer = undefined
  runtimeTelemetryPolling = false
  sentRuntimeMetricIds.clear()
  sentRuntimeLogIds.clear()
  pendingOperations.splice(0)
  pendingLongTasks.splice(0)
  pendingMetrics.splice(0)
  pendingLogs.splice(0)
}

function queueOperation(operation: AgentPerformanceOperation): void {
  enqueuePending(pendingOperations, operation)
  scheduleFlush()
}

function queueLongTask(task: AgentPerformanceLongTask): void {
  enqueuePending(pendingLongTasks, task)
  scheduleFlush()
}

function queueMetric(metric: AgentPerformanceMetricSample): void {
  if (!reportableMetric(metric)) return
  enqueuePending(pendingMetrics, metric)
  scheduleFlush()
}

function queueLog(log: AgentPerformanceLogEntry): void {
  if (!reportableLog(log)) return
  enqueuePending(pendingLogs, log)
  scheduleFlush()
}

function queueRuntimeMetrics(metrics: AgentRuntimeTelemetryMetricSample[]): void {
  for (const metric of metrics) {
    if (!reportableMetric(metric)) continue
    const id = runtimeMetricId(metric)
    if (!rememberRuntimeId(sentRuntimeMetricIds, id)) continue
    enqueuePending(pendingMetrics, {
      id,
      name: metric.name,
      unit: metric.unit,
      value: metric.value,
      labels: metric.labels,
    })
  }
  scheduleFlush()
}

function queueRuntimeLogs(logs: AgentRuntimeTelemetryLogEntry[]): void {
  for (const log of logs) {
    const kind = runtimeLogKind(log)
    if (!kind) continue
    const id = runtimeLogId(log, kind)
    if (!rememberRuntimeId(sentRuntimeLogIds, id)) continue
    enqueuePending(pendingLogs, {
      id,
      level: log.level,
      details: {
        telemetryArea: 'agent_runtime',
        telemetryKind: kind,
      },
    })
  }
  scheduleFlush()
}

function enqueuePending<T>(queue: T[], item: T): void {
  queue.push(item)
  if (queue.length > MAX_PENDING_ITEMS) {
    queue.splice(0, queue.length - MAX_PENDING_ITEMS)
  }
}

function rememberRuntimeId(ids: Set<string>, id: string): boolean {
  if (ids.has(id)) return false
  ids.add(id)
  while (ids.size > MAX_RUNTIME_DEDUP_IDS) {
    const oldest = ids.values().next().value
    if (oldest === undefined) break
    ids.delete(oldest)
  }
  return true
}

function scheduleFlush(): void {
  if (pendingOperations.length + pendingLongTasks.length + pendingMetrics.length + pendingLogs.length === 0) return
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = undefined
    void flushAgentTelemetry()
  }, REPORT_DEBOUNCE_MS)
}

function scheduleRuntimeTelemetryPoll(delayMs = RUNTIME_TELEMETRY_POLL_MS): void {
  if (runtimeTelemetryPollTimer || typeof window === 'undefined') return
  runtimeTelemetryPollTimer = setTimeout(() => {
    runtimeTelemetryPollTimer = undefined
    void pollRuntimeTelemetry()
  }, delayMs)
}

async function pollRuntimeTelemetry(): Promise<void> {
  if (runtimeTelemetryPolling) return
  if (!useUserStore.getState().token) {
    scheduleRuntimeTelemetryPoll()
    return
  }
  runtimeTelemetryPolling = true
  try {
    const snapshot = await localAgentClient.getRuntimeTelemetry()
    queueRuntimeTelemetrySnapshot(snapshot)
  } catch {
    // Local runtime telemetry is optional and must never affect Agent UX.
  } finally {
    runtimeTelemetryPolling = false
    scheduleRuntimeTelemetryPoll()
  }
}

function queueRuntimeTelemetrySnapshot(snapshot: AgentRuntimeTelemetrySnapshot): void {
  queueRuntimeMetrics(snapshot.metrics)
  queueRuntimeLogs(snapshot.logs)
}

async function flushAgentTelemetry(): Promise<void> {
  if (!useUserStore.getState().token) return

  const operations = pendingOperations.splice(0, MAX_BATCH_ITEMS)
  const longTasks = pendingLongTasks.splice(0, Math.max(0, MAX_BATCH_ITEMS - operations.length))
  const metrics = pendingMetrics.splice(0, Math.max(0, MAX_BATCH_ITEMS - operations.length - longTasks.length))
  const logs = pendingLogs.splice(0, Math.max(0, MAX_BATCH_ITEMS - operations.length - longTasks.length - metrics.length))
  if (operations.length + longTasks.length + metrics.length + logs.length === 0) return

  try {
    const response = await fetch(`${getAPIV1BaseURL()}/agent/telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify({
        schema: AGENT_CLIENT_TELEMETRY_SCHEMA,
        operations: operations.map(operationPayload),
        longTasks: longTasks.map((task) => ({ durationMs: finiteNumber(task.durationMs) })),
        metrics: metrics.map(metricPayload),
        logs: logs.map(logPayload),
      }),
      keepalive: operations.length + longTasks.length + metrics.length + logs.length <= 8,
    })
    if (!response.ok) throw new Error(`agent telemetry report failed: ${response.status}`)
  } catch {
    // Telemetry reporting must never affect the Agent UX.
  } finally {
    if (pendingOperations.length + pendingLongTasks.length + pendingMetrics.length + pendingLogs.length > 0) {
      scheduleFlush()
    }
  }
}

function operationPayload(operation: AgentPerformanceOperation) {
  return {
    kind: operation.kind,
    status: operation.status,
    durationMs: finiteNumber(operation.durationMs ?? 0),
    slow: operation.status === 'error' || operation.status === 'cancelled' || slowOperation(operation),
    phases: operation.phases
      .filter((phase) => phase.name !== 'operation_start')
      .map((phase) => ({
        name: phase.name,
        durationFromPreviousMs: finiteNumber(phase.durationFromPreviousMs),
      })),
  }
}

function metricPayload(metric: QueuedTelemetryMetric): AgentTelemetryMetricSample {
  return createAgentTelemetryMetricSample({
    name: metric.name,
    unit: metric.unit,
    value: metric.value,
    labels: metric.labels,
  })
}

function logPayload(log: QueuedTelemetryLog) {
  return createAgentTelemetryLogSample({
    level: log.level,
    area: log.details?.telemetryArea,
    kind: log.details?.telemetryKind,
  })
}

function reportableMetric(metric: Pick<AgentPerformanceMetricSample, 'name'>): boolean {
  return isAgentTelemetryReportableMetricName(metric.name)
}

function reportableLog(log: AgentPerformanceLogEntry): boolean {
  return log.details?.telemetryArea === 'agent_frontend' || log.details?.telemetryArea === 'agent_runtime'
}

function runtimeMetricId(metric: AgentRuntimeTelemetryMetricSample): string {
  return [
    'runtime_metric',
    metric.createdAt,
    metric.name,
    metric.unit,
    finiteNumber(metric.value),
    stableMetricLabels(metric.labels),
  ].join(':')
}

function runtimeLogId(log: AgentRuntimeTelemetryLogEntry, kind: string): string {
  return [
    'runtime_log',
    log.createdAt,
    log.level,
    log.operationId ?? '',
    log.spanId ?? '',
    kind,
  ].join(':')
}

function runtimeLogKind(log: AgentRuntimeTelemetryLogEntry): string | undefined {
  const kind = log.details?.kind
  if (typeof kind === 'string' && kind.trim()) return kind
  if (log.spanId) return 'span'
  if (log.operationId) return 'operation'
  return undefined
}

function stableMetricLabels(labels?: Record<string, string | number | boolean>): string {
  if (!labels) return ''
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(',')
}

function slowOperation(operation: AgentPerformanceOperation): boolean {
  const duration = operation.durationMs ?? 0
  if (operation.kind === 'send' || operation.kind === 'external_task') return duration >= 1_000
  return duration >= 600
}

function finiteNumber(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

function authHeaders(): Record<string, string> {
  const token = useUserStore.getState().token
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const currentOrgID = useUserStore.getState().currentOrgID
  if (currentOrgID) headers['X-Org-ID'] = String(currentOrgID)
  return headers
}
