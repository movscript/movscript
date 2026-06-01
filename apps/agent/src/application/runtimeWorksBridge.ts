import type { RuntimeWorkManager } from '../runtimeWork/runtimeWorkManager.js'
import type { RuntimeWork, RuntimeWorkKind } from '../runtimeWork/runtimeWork.js'
import type { AgentRun, AgentTraceEvent, JSONValue } from '../state/types.js'
import type { RuntimeWakeCoordinator } from './runtimeWakeCoordinator.js'
import { summarizeRuntimeWorkTrace, summarizeRuntimeWorkWaitTrace } from '../domains/trace/toolTrace.js'

export interface RuntimeWorksBridge {
  startWork: (run: AgentRun, input?: Record<string, JSONValue>, options?: { signal?: AbortSignal }) => Promise<JSONValue>
  getWork: (run: AgentRun, input?: Record<string, JSONValue>) => JSONValue
  listWork: (run: AgentRun, input?: Record<string, JSONValue>) => JSONValue
  waitWork: (run: AgentRun, input?: Record<string, JSONValue>, options?: { signal?: AbortSignal }) => Promise<JSONValue>
  cancelWork: (run: AgentRun, input?: Record<string, JSONValue>, options?: { signal?: AbortSignal }) => Promise<JSONValue>
}

export function createRuntimeWorksBridge(input: {
  workManager: RuntimeWorkManager
  wake?: Pick<RuntimeWakeCoordinator, 'workStarted' | 'workObserved'>
  recordTrace?: (run: AgentRun, trace: {
    kind: AgentTraceEvent['kind']
    title: string
    summary?: string
    status: AgentTraceEvent['status']
    toolName?: string
    data?: unknown
  }) => void
}): RuntimeWorksBridge {
  return {
    startWork: async (run, request = {}, options = {}) => {
      const work = await input.workManager.start({
        sessionId: run.sessionId,
        threadId: run.threadId,
        runId: run.id,
        kind: normalizeKind(request.kind),
        request: normalizeRequest(request.request),
        continuationPolicy: normalizeContinuationPolicy(request.continuationPolicy ?? request.continuation_policy),
        timeoutMs: numberField(request.timeoutMs ?? request.timeout_ms),
        pollIntervalMs: numberField(request.pollIntervalMs ?? request.poll_interval_ms),
        signal: options.signal,
      })
      input.wake?.workStarted(work)
      recordWorkTrace(input.recordTrace, run, 'core_work_start', work)
      return { status: 'started', work } as unknown as JSONValue
    },
    getWork: (_run, request = {}) => {
      const workId = requiredString(request.workId ?? request.work_id, 'core_work_get requires workId')
      return { status: 'read', work: input.workManager.get(workId) } as unknown as JSONValue
    },
    listWork: (run, request = {}) => ({
      status: 'listed',
      works: input.workManager.list({
        runId: request.runId === 'all' ? undefined : typeof request.runId === 'string' ? request.runId : run.id,
        status: normalizeStatus(request.status),
      }),
    }) as unknown as JSONValue,
    waitWork: async (run, request = {}, options = {}) => {
      const workIds = normalizeWorkIds(request.workIds ?? request.work_ids ?? request.workId ?? request.work_id)
      const result = await input.workManager.wait({
        workIds,
        mode: request.mode === 'any' ? 'any' : 'all',
        timeoutMs: numberField(request.timeoutMs ?? request.timeout_ms),
        pollIntervalMs: numberField(request.pollIntervalMs ?? request.poll_interval_ms),
        signal: options.signal,
        onWork: (work) => {
          input.wake?.workObserved(work)
          recordWorkTrace(input.recordTrace, run, 'core_work_wait', work)
        },
      })
      input.recordTrace?.(run, {
        kind: 'tool_call',
        title: `Runtime work wait ${result.status}`,
        summary: result.message,
        status: result.status === 'failed' ? 'failed' : result.done ? 'completed' : 'info',
        toolName: 'core_work_wait',
        data: summarizeRuntimeWorkWaitTrace(result),
      })
      return result as unknown as JSONValue
    },
    cancelWork: async (run, request = {}, options = {}) => {
      const workId = requiredString(request.workId ?? request.work_id, 'core_work_cancel requires workId')
      const work = await input.workManager.cancel(workId, { signal: options.signal })
      input.wake?.workObserved(work)
      recordWorkTrace(input.recordTrace, run, 'core_work_cancel', work)
      return { status: 'cancelled', work } as unknown as JSONValue
    },
  }
}

function recordWorkTrace(
  recordTrace: Parameters<typeof createRuntimeWorksBridge>[0]['recordTrace'],
  run: AgentRun,
  toolName: string,
  work: RuntimeWork,
): void {
  recordTrace?.(run, {
    kind: 'tool_call',
    title: `Runtime work ${work.status}: ${work.kind}`,
    summary: work.externalHandle
      ? `${work.externalHandle.type} ${String(work.externalHandle.id)} is ${work.status}.`
      : `Work ${work.id} is ${work.status}.`,
    status: work.status === 'failed' ? 'failed' : work.status === 'completed' ? 'completed' : 'info',
    toolName,
    data: summarizeRuntimeWorkTrace({ toolName, work }),
  })
}

function normalizeKind(value: unknown): RuntimeWorkKind {
  if (value === 'generation_job' || value === 'subagent_run') return value
  if (typeof value === 'string' && value.trim()) throw new Error(`core_work_start does not support kind: ${value}`)
  throw new Error('core_work_start requires kind')
}

function normalizeRequest(value: unknown): Record<string, JSONValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('core_work_start requires request object')
  const output: Record<string, JSONValue> = {}
  for (const [key, item] of Object.entries(value)) {
    if (isJSONValue(item)) output[key] = item
  }
  return output
}

function normalizeWorkIds(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [value]
  const ids = raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
  if (ids.length === 0) throw new Error('core_work_wait requires workIds')
  return Array.from(new Set(ids))
}

function normalizeStatus(value: unknown): RuntimeWork['status'] | undefined {
  return value === 'pending_approval'
    || value === 'queued'
    || value === 'running'
    || value === 'waiting'
    || value === 'completed'
    || value === 'failed'
    || value === 'cancelled'
    || value === 'timeout'
    ? value
    : undefined
}

function normalizeContinuationPolicy(value: unknown): RuntimeWork['continuationPolicy'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const mode = record.mode
  if (
    mode !== 'none'
    && mode !== 'any_completed'
    && mode !== 'all_completed'
    && mode !== 'all_settled'
    && mode !== 'manual_selection'
  ) return undefined
  const groupId = typeof record.groupId === 'string' && record.groupId.trim()
    ? record.groupId.trim()
    : typeof record.group_id === 'string' && record.group_id.trim()
      ? record.group_id.trim()
      : undefined
  return {
    mode,
    ...(groupId ? { groupId } : {}),
  }
}

function requiredString(value: unknown, message: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  throw new Error(message)
}

function numberField(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(number) ? number : undefined
}

function isJSONValue(value: unknown): value is JSONValue {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.every(isJSONValue)
  if (typeof value !== 'object') return false
  return Object.values(value).every(isJSONValue)
}
