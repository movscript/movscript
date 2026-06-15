import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { listenToWindowEvent } from '@/shared/infrastructure/windowEvents'
import { performanceNow } from '@/features/agent/state/agentPerformanceFormatting'
import { createNoopAgentTelemetrySink } from '@/features/agent/state/agentTelemetrySink'
import type {
  AgentPerformanceLogEntry,
  AgentPerformanceMetricSample,
  AgentPerformanceOperationStatus,
  AgentTelemetrySink,
} from '@/features/agent/state/agentPerformanceTypes'

export {
  formatBytes,
  formatMs,
  operationKindLabel,
  performanceNow,
  phaseLabel,
  slowestPhase,
  summarizeAgentPerformanceMetrics,
} from '@/features/agent/state/agentPerformanceFormatting'
export { createTransientAgentTelemetrySink } from '@/features/agent/state/agentTelemetrySink'
export type {
  AgentPerformanceLogEntry,
  AgentPerformanceLogLevel,
  AgentPerformanceLongTask,
  AgentPerformanceMetricSample,
  AgentPerformanceOperation,
  AgentPerformanceOperationKind,
  AgentPerformanceOperationStatus,
  AgentPerformancePhase,
  AgentTelemetrySink,
} from '@/features/agent/state/agentPerformanceTypes'

let observerInstalled = false
let webVitalsInstalled = false
let frontendErrorObserversInstalled = false
let agentTelemetrySink: AgentTelemetrySink = createNoopAgentTelemetrySink()

export function setAgentTelemetrySink(sink: AgentTelemetrySink): void {
  agentTelemetrySink = sink
}

export function resetAgentTelemetrySink(): void {
  agentTelemetrySink = createNoopAgentTelemetrySink()
}

export function beginAgentPerformanceOperation(input: Parameters<AgentTelemetrySink['beginOperation']>[0]): string {
  return agentTelemetrySink.beginOperation(input)
}

export function markAgentPerformancePhase(operationId: string | undefined, name: string, input?: { label?: string; details?: Record<string, unknown> }): void {
  agentTelemetrySink.markPhase(operationId, name, input)
}

export function finishAgentPerformanceOperation(operationId: string | undefined, status: Exclude<AgentPerformanceOperationStatus, 'running'>, details?: Record<string, unknown>): void {
  agentTelemetrySink.finishOperation(operationId, status, details)
}

export function recordAgentPerformanceMetric(sample: Omit<AgentPerformanceMetricSample, 'id' | 'createdAt'>): void {
  agentTelemetrySink.recordMetric(sample)
}

export function recordAgentPerformanceLog(entry: Omit<AgentPerformanceLogEntry, 'id' | 'createdAt'>): void {
  agentTelemetrySink.recordLog(entry)
}

export interface InstrumentedAgentStateStorage {
  getItem: (name: string) => string | null
  setItem: (name: string, value: string) => void
  removeItem: (name: string) => void
  flush?: () => void
}

interface InstrumentedAgentStateStorageOptions {
  writeDelayMs?: number
}

type AgentStateStorageBackend = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

type PendingStorageWrite =
  | { kind: 'set'; value: string; payloadBytes: number }
  | { kind: 'remove' }

export function createInstrumentedAgentStateStorage(
  component: string,
  storage?: AgentStateStorageBackend | null,
  options: InstrumentedAgentStateStorageOptions = {},
): InstrumentedAgentStateStorage {
  const resolvedStorage = storage ?? browserAgentStateStorage()
  const writeDelayMs = Math.max(0, options.writeDelayMs ?? 250)
  const pendingWrites = new Map<string, PendingStorageWrite>()
  const cachedValues = new Map<string, string | null>()
  let flushTimer: ReturnType<typeof setTimeout> | undefined

  const flush = (): void => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = undefined
    }
    if (pendingWrites.size === 0) return
    const writes = [...pendingWrites.entries()]
    pendingWrites.clear()
    for (const [name, write] of writes) {
      try {
        if (write.kind === 'set') {
          measureAgentStorageOperation({
            component,
            kind: storageKindFromKey(name),
            stage: 'set',
            payloadBytes: write.payloadBytes,
            run: () => {
              resolvedStorage?.setItem(name, write.value)
            },
          })
        } else {
          measureAgentStorageOperation({
            component,
            kind: storageKindFromKey(name),
            stage: 'remove',
            run: () => {
              resolvedStorage?.removeItem(name)
            },
          })
        }
      } catch {
        pendingWrites.set(name, write)
      }
    }
  }

  const scheduleFlush = (): void => {
    if (flushTimer) return
    flushTimer = setTimeout(flush, writeDelayMs)
  }

  installStorageFlushGuards(flush)

  return {
    getItem: (name) => {
      const pending = pendingWrites.get(name)
      if (pending?.kind === 'set') return pending.value
      if (pending?.kind === 'remove') return null
      const value = measureAgentStorageOperation({
        component,
        kind: storageKindFromKey(name),
        stage: 'get',
        run: () => resolvedStorage?.getItem(name) ?? null,
        bytes: (item) => typeof item === 'string' ? utf8ByteLength(item) : undefined,
      })
      cachedValues.set(name, value)
      return value
    },
    setItem: (name, value) => {
      const pending = pendingWrites.get(name)
      if ((pending?.kind === 'set' && pending.value === value) || (!pending && cachedValues.get(name) === value)) {
        recordFrontendStorageMetrics({
          component,
          kind: storageKindFromKey(name),
          stage: 'set_skip',
          status: 'success',
          durationMs: 0,
          bytes: utf8ByteLength(value),
        })
        return
      }
      pendingWrites.set(name, { kind: 'set', value, payloadBytes: utf8ByteLength(value) })
      cachedValues.set(name, value)
      scheduleFlush()
    },
    removeItem: (name) => {
      const pending = pendingWrites.get(name)
      if (pending?.kind === 'remove' || (!pending && cachedValues.get(name) === null)) {
        recordFrontendStorageMetrics({
          component,
          kind: storageKindFromKey(name),
          stage: 'remove_skip',
          status: 'success',
          durationMs: 0,
        })
        return
      }
      pendingWrites.set(name, { kind: 'remove' })
      cachedValues.set(name, null)
      scheduleFlush()
    },
    flush,
  }
}

function browserAgentStateStorage(): AgentStateStorageBackend | null {
  if (typeof window === 'undefined') return null
  return {
    getItem: (name) => readBrowserStorageItem('local', name),
    setItem: (name, value) => writeBrowserStorageItem('local', name, value),
    removeItem: (name) => removeBrowserStorageItem('local', name),
  }
}

function installStorageFlushGuards(flush: () => void): void {
  listenToWindowEvent('pagehide', flush)
  listenToWindowEvent('beforeunload', flush)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
  }
}

function measureAgentStorageOperation<T>(input: {
  component: string
  kind: string
  stage: 'get' | 'set' | 'remove'
  payloadBytes?: number
  bytes?: (value: T) => number | undefined
  run: () => T
}): T {
  const startedAt = performanceNow()
  try {
    const result = input.run()
    recordFrontendStorageMetrics({
      component: input.component,
      kind: input.kind,
      stage: input.stage,
      status: 'success',
      durationMs: Math.max(0, performanceNow() - startedAt),
      bytes: input.payloadBytes ?? input.bytes?.(result),
    })
    return result
  } catch (error) {
    recordFrontendStorageMetrics({
      component: input.component,
      kind: input.kind,
      stage: input.stage,
      status: 'error',
      durationMs: Math.max(0, performanceNow() - startedAt),
      bytes: input.payloadBytes,
    })
    throw error
  }
}

function recordFrontendStorageMetrics(input: {
  component: string
  kind: string
  stage: string
  status: string
  durationMs: number
  bytes?: number
}): void {
  const labels = {
    component: input.component,
    kind: input.kind,
    stage: input.stage,
    status: input.status,
  }
  recordAgentPerformanceMetric({
    name: 'frontend_storage_operation_duration_ms',
    value: input.durationMs,
    unit: 'ms',
    labels,
  })
  if (typeof input.bytes === 'number' && Number.isFinite(input.bytes) && input.bytes >= 0) {
    recordAgentPerformanceMetric({
      name: 'frontend_storage_payload_bytes',
      value: input.bytes,
      unit: 'bytes',
      labels,
    })
  }
}

function storageKindFromKey(name: string): string {
  if (name === 'agent-store-v4') return 'agent_store'
  if (name === 'agent-workspaces-v1') return 'agent_workspace_store'
  if (name === 'agent-session-store-v2') return 'agent_session_store'
  if (name.startsWith('agent-')) return 'agent'
  return 'unknown'
}

export function installAgentPerformanceObservers(): void {
  if (typeof window === 'undefined' || observerInstalled) return
  observerInstalled = true
  installWebVitalsObservers()
  installFrontendErrorObservers()
  const PerformanceObserverCtor = window.PerformanceObserver
  if (!PerformanceObserverCtor) return
  try {
    const observer = new PerformanceObserverCtor((list) => {
      for (const entry of list.getEntries()) {
        agentTelemetrySink.recordLongTask({
          startTime: entry.startTime,
          durationMs: entry.duration,
          name: entry.name,
        })
      }
    })
    observer.observe({ entryTypes: ['longtask'] })
  } catch {
    recordAgentPerformanceLog({
      level: 'info',
      message: '当前运行环境不支持 Long Task 观测。',
      details: { telemetryArea: 'agent_frontend', telemetryKind: 'longtask_unsupported' },
    })
  }
}

export function recordAgentNetworkRequestMetric(input: {
  method: string
  routeGroup: string
  statusClass: string
  durationMs: number
  transport?: string
}): void {
  recordAgentPerformanceMetric({
    name: 'frontend_agent_network_request_duration_ms',
    value: input.durationMs,
    unit: 'ms',
    labels: {
      method: normalizeMetricLabel(input.method, 'GET'),
      route_group: normalizeRouteGroup(input.routeGroup),
      status_class: normalizeMetricLabel(input.statusClass, 'unknown'),
      transport: normalizeMetricLabel(input.transport ?? 'http', 'http'),
    },
  })
}

function installWebVitalsObservers(): void {
  if (webVitalsInstalled || typeof window === 'undefined') return
  webVitalsInstalled = true

  observePerformanceEntries('paint', (entry) => {
    if (entry.name === 'first-contentful-paint') recordWebVital('fcp', entry.startTime, 'ms')
  })
  observePerformanceEntries('largest-contentful-paint', (entry) => recordWebVital('lcp', entry.startTime, 'ms'))
  observePerformanceEntries('navigation', (entry) => {
    const nav = entry as PerformanceNavigationTiming
    if (Number.isFinite(nav.responseStart)) recordWebVital('ttfb', nav.responseStart, 'ms')
  })
  observePerformanceEntries('layout-shift', (entry) => {
    const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean }
    if (!shift.hadRecentInput && typeof shift.value === 'number') recordWebVital('cls', shift.value, 'score')
  })
  observePerformanceEntries('event', (entry) => {
    const eventEntry = entry as PerformanceEntry & { interactionId?: number; duration?: number }
    if ((eventEntry.interactionId ?? 0) > 0 && typeof eventEntry.duration === 'number') recordWebVital('inp', eventEntry.duration, 'ms')
  })
}

function observePerformanceEntries(type: string, handle: (entry: PerformanceEntry) => void): void {
  const PerformanceObserverCtor = window.PerformanceObserver
  if (!PerformanceObserverCtor) return
  try {
    const observer = new PerformanceObserverCtor((list) => {
      for (const entry of list.getEntries()) handle(entry)
    })
    observer.observe({ type, buffered: true })
  } catch {
    // Unsupported observer types are expected across browsers.
  }
}

function recordWebVital(name: 'fcp' | 'lcp' | 'ttfb' | 'cls' | 'inp', value: number, unit: AgentPerformanceMetricSample['unit']): void {
  if (!Number.isFinite(value) || value < 0) return
  recordAgentPerformanceMetric({
    name: `frontend_web_vital_${name}_${unit === 'score' ? 'score' : 'ms'}`,
    value,
    unit,
    labels: { vital: name },
  })
}

function installFrontendErrorObservers(): void {
  if (frontendErrorObserversInstalled) return
  frontendErrorObserversInstalled = true
  listenToWindowEvent('error', () => {
    recordAgentPerformanceMetric({
      name: 'frontend_ui_errors_total',
      value: 1,
      unit: 'count',
      labels: { area: 'agent_frontend', kind: 'window_error', level: 'error' },
    })
    recordAgentPerformanceLog({
      level: 'error',
      message: '前端运行错误。',
      details: { telemetryArea: 'agent_frontend', telemetryKind: 'window_error' },
    })
  })
  listenToWindowEvent('unhandledrejection', () => {
    recordAgentPerformanceMetric({
      name: 'frontend_ui_errors_total',
      value: 1,
      unit: 'count',
      labels: { area: 'agent_frontend', kind: 'unhandled_rejection', level: 'error' },
    })
    recordAgentPerformanceLog({
      level: 'error',
      message: '前端 Promise 未处理异常。',
      details: { telemetryArea: 'agent_frontend', telemetryKind: 'unhandled_rejection' },
    })
  })
}

function normalizeMetricLabel(value: string, fallback: string): string {
  const normalized = value.trim().toLowerCase()
  return normalized || fallback
}

function normalizeRouteGroup(path: string): string {
  return path
    .replace(/\/threads\/[^/?#]+/g, '/threads/:id')
    .replace(/\/runs\/[^/?#]+/g, '/runs/:id')
    .replace(/\/sessions\/[^/?#]+/g, '/sessions/:id')
    .replace(/\/interactions\/[^/?#]+/g, '/interactions/:id')
    .replace(/\/plans\/[^/?#]+/g, '/plans/:id')
}

function utf8ByteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).byteLength
  return value.length
}
