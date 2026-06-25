import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { listenToWindowEvent } from '@/shared/infrastructure/windowEvents'
import { performanceNow } from '@/features/agent/state/agentPerformanceFormatting'
import type { AgentPerformanceMetricSample } from '@/features/agent/state/agentPerformanceTypes'

export interface InstrumentedAgentStateStorage {
  getItem: (name: string) => string | null
  setItem: (name: string, value: string) => void
  removeItem: (name: string) => void
  flush?: () => void
}

export interface InstrumentedAgentStateStorageOptions {
  writeDelayMs?: number
}

type AgentStateStorageBackend = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

type PendingStorageWrite =
  | { kind: 'set'; value: string; payloadBytes: number }
  | { kind: 'remove' }

type AgentPerformanceMetricRecorder = (sample: Omit<AgentPerformanceMetricSample, 'id' | 'createdAt'>) => void

export function createInstrumentedAgentStateStorageWithMetrics(
  component: string,
  storage: AgentStateStorageBackend | null | undefined,
  options: InstrumentedAgentStateStorageOptions,
  recordMetric: AgentPerformanceMetricRecorder,
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
            recordMetric,
            run: () => {
              resolvedStorage?.setItem(name, write.value)
            },
          })
        } else {
          measureAgentStorageOperation({
            component,
            kind: storageKindFromKey(name),
            stage: 'remove',
            recordMetric,
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
        recordMetric,
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
          recordMetric,
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
          recordMetric,
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
  recordMetric: AgentPerformanceMetricRecorder
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
      recordMetric: input.recordMetric,
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
      recordMetric: input.recordMetric,
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
  recordMetric: AgentPerformanceMetricRecorder
}): void {
  const labels = {
    component: input.component,
    kind: input.kind,
    stage: input.stage,
    status: input.status,
  }
  input.recordMetric({
    name: 'frontend_storage_operation_duration_ms',
    value: input.durationMs,
    unit: 'ms',
    labels,
  })
  if (typeof input.bytes === 'number' && Number.isFinite(input.bytes) && input.bytes >= 0) {
    input.recordMetric({
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

function utf8ByteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).byteLength
  return value.length
}
