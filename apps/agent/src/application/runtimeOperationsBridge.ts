import type { RuntimeOperationManager } from '../operations/runtimeOperationManager.js'
import type { RuntimeOperation, RuntimeOperationKind } from '../operations/runtimeOperation.js'
import type { AgentRun, AgentTraceEvent, JSONValue } from '../state/types.js'
import { buildGenerationEvent } from '../generation/generationEvents.js'
import type { RuntimeScheduler } from './runtimeScheduler.js'

export interface RuntimeOperationsBridge {
  startOperation: (run: AgentRun, input?: Record<string, JSONValue>, options?: { signal?: AbortSignal }) => Promise<JSONValue>
  getOperation: (run: AgentRun, input?: Record<string, JSONValue>) => JSONValue
  listOperation: (run: AgentRun, input?: Record<string, JSONValue>) => JSONValue
  waitOperation: (run: AgentRun, input?: Record<string, JSONValue>, options?: { signal?: AbortSignal }) => Promise<JSONValue>
  cancelOperation: (run: AgentRun, input?: Record<string, JSONValue>, options?: { signal?: AbortSignal }) => Promise<JSONValue>
}

export function createRuntimeOperationsBridge(input: {
  operationManager: RuntimeOperationManager
  scheduler?: Pick<RuntimeScheduler, 'dispatch'>
  recordTrace?: (run: AgentRun, trace: {
    kind: AgentTraceEvent['kind']
    title: string
    summary?: string
    status: AgentTraceEvent['status']
    toolName?: string
    data?: unknown
  }) => void
}): RuntimeOperationsBridge {
  return {
    startOperation: async (run, request = {}, options = {}) => {
      const operation = await input.operationManager.start({
        threadId: run.threadId,
        runId: run.id,
        kind: normalizeKind(request.kind),
        request: normalizeRequest(request.request),
        continuationPolicy: normalizeContinuationPolicy(request.continuationPolicy ?? request.continuation_policy),
        timeoutMs: numberField(request.timeoutMs ?? request.timeout_ms),
        pollIntervalMs: numberField(request.pollIntervalMs ?? request.poll_interval_ms),
        signal: options.signal,
      })
      input.scheduler?.dispatch({ type: 'operation.started', operation })
      monitorOperationContinuation(input, run, operation, options.signal)
      recordOperationTrace(input.recordTrace, run, 'runtime_operation_start', operation)
      return { status: 'started', operation } as unknown as JSONValue
    },
    getOperation: (_run, request = {}) => {
      const operationId = requiredString(request.operationId ?? request.operation_id, 'runtime_operation_get requires operationId')
      return { status: 'read', operation: input.operationManager.get(operationId) } as unknown as JSONValue
    },
    listOperation: (run, request = {}) => ({
      status: 'listed',
      operations: input.operationManager.list({
        runId: request.runId === 'all' ? undefined : typeof request.runId === 'string' ? request.runId : run.id,
        status: normalizeStatus(request.status),
      }),
    }) as unknown as JSONValue,
    waitOperation: async (run, request = {}, options = {}) => {
      const operationIds = normalizeOperationIds(request.operationIds ?? request.operation_ids ?? request.operationId ?? request.operation_id)
      const result = await input.operationManager.wait({
        operationIds,
        mode: request.mode === 'any' ? 'any' : 'all',
        timeoutMs: numberField(request.timeoutMs ?? request.timeout_ms),
        pollIntervalMs: numberField(request.pollIntervalMs ?? request.poll_interval_ms),
        signal: options.signal,
        onOperation: (operation) => {
          input.scheduler?.dispatch({ type: 'operation.observed', operation })
          recordOperationTrace(input.recordTrace, run, 'runtime_operation_wait', operation)
        },
      })
      input.recordTrace?.(run, {
        kind: 'tool_call',
        title: `Runtime operation wait ${result.status}`,
        summary: result.message,
        status: result.status === 'failed' ? 'failed' : result.done ? 'completed' : 'info',
        toolName: 'runtime_operation_wait',
        data: { runtimeOperationWait: result },
      })
      return result as unknown as JSONValue
    },
    cancelOperation: async (run, request = {}, options = {}) => {
      const operationId = requiredString(request.operationId ?? request.operation_id, 'runtime_operation_cancel requires operationId')
      const operation = await input.operationManager.cancel(operationId, { signal: options.signal })
      input.scheduler?.dispatch({ type: 'operation.observed', operation })
      recordOperationTrace(input.recordTrace, run, 'runtime_operation_cancel', operation)
      return { status: 'cancelled', operation } as unknown as JSONValue
    },
  }
}

function monitorOperationContinuation(
  input: Parameters<typeof createRuntimeOperationsBridge>[0],
  run: AgentRun,
  operation: RuntimeOperation,
  signal?: AbortSignal,
): void {
  if (!input.scheduler || !operation.continuationPolicy || operation.continuationPolicy.mode === 'none') return
  void input.operationManager.wait({
    operationIds: [operation.id],
    mode: 'all',
    timeoutMs: operation.timeoutMs ?? 30 * 60_000,
    pollIntervalMs: operation.pollIntervalMs ?? 2_500,
    signal,
    onOperation: (observed) => {
      input.scheduler?.dispatch({ type: 'operation.observed', operation: observed })
      recordOperationTrace(input.recordTrace, run, 'runtime_operation_wait', observed)
    },
  }).catch((error) => {
    input.recordTrace?.(run, {
      kind: 'tool_call',
      title: `Runtime operation monitor failed: ${operation.kind}`,
      summary: error instanceof Error ? error.message : String(error),
      status: 'failed',
      toolName: 'runtime_operation_wait',
      data: { runtimeOperationId: operation.id },
    })
  })
}

function recordOperationTrace(
  recordTrace: Parameters<typeof createRuntimeOperationsBridge>[0]['recordTrace'],
  run: AgentRun,
  toolName: string,
  operation: RuntimeOperation,
): void {
  const generation = generationTraceForOperation(toolName, operation)
  recordTrace?.(run, {
    kind: 'tool_call',
    title: `Runtime operation ${operation.status}: ${operation.kind}`,
    summary: operation.externalHandle
      ? `${operation.externalHandle.type} ${String(operation.externalHandle.id)} is ${operation.status}.`
      : `Operation ${operation.id} is ${operation.status}.`,
    status: operation.status === 'failed' ? 'failed' : operation.status === 'completed' ? 'completed' : 'info',
    toolName,
    data: { runtimeOperation: operation, ...(generation ? { generation } : {}) },
  })
}

function generationTraceForOperation(toolName: string, operation: RuntimeOperation) {
  if (operation.kind !== 'generation_job' || operation.result === undefined) return undefined
  const jobId = operation.externalHandle?.id
  const request = operation.request && typeof operation.request === 'object' && !Array.isArray(operation.request)
    ? operation.request as Record<string, JSONValue>
    : {}
  const args = typeof jobId === 'number' ? { jobId } : request
  const backendToolName = toolName === 'runtime_operation_start'
    ? 'movscript_create_generation_job'
    : toolName === 'runtime_operation_cancel'
      ? 'movscript_cancel_generation_job'
      : 'movscript_get_generation_job'
  return buildGenerationEvent({ name: backendToolName, args }, operation.result)
}

function normalizeKind(value: unknown): RuntimeOperationKind {
  if (value === 'generation_job') return value
  if (value === 'subagent') throw new Error('runtime_operation_start does not create subagent runtime operations; use movscript_spawn_subagent')
  if (typeof value === 'string' && value.trim()) throw new Error(`runtime_operation_start currently supports only kind "generation_job", not ${value}`)
  throw new Error('runtime_operation_start requires kind')
}

function normalizeRequest(value: unknown): Record<string, JSONValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('runtime_operation_start requires request object')
  const output: Record<string, JSONValue> = {}
  for (const [key, item] of Object.entries(value)) {
    if (isJSONValue(item)) output[key] = item
  }
  return output
}

function normalizeOperationIds(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [value]
  const ids = raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
  if (ids.length === 0) throw new Error('runtime_operation_wait requires operationIds')
  return Array.from(new Set(ids))
}

function normalizeStatus(value: unknown): RuntimeOperation['status'] | undefined {
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

function normalizeContinuationPolicy(value: unknown): RuntimeOperation['continuationPolicy'] | undefined {
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
