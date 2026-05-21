import type { AgentIOManager } from '../io/agentIOManager.js'
import type { AgentIOOperation, AgentIOOperationKind } from '../io/agentIOOperation.js'
import type { AgentRun, AgentTraceEvent, JSONValue } from '../state/types.js'
import { buildGenerationEvent } from '../generation/generationEvents.js'

export interface RuntimeIOOperationsBridge {
  startIO: (run: AgentRun, input?: Record<string, JSONValue>, options?: { signal?: AbortSignal }) => Promise<JSONValue>
  getIO: (run: AgentRun, input?: Record<string, JSONValue>) => JSONValue
  listIO: (run: AgentRun, input?: Record<string, JSONValue>) => JSONValue
  waitIO: (run: AgentRun, input?: Record<string, JSONValue>, options?: { signal?: AbortSignal }) => Promise<JSONValue>
  cancelIO: (run: AgentRun, input?: Record<string, JSONValue>, options?: { signal?: AbortSignal }) => Promise<JSONValue>
}

export function createRuntimeIOOperationsBridge(input: {
  ioManager: AgentIOManager
  recordTrace?: (run: AgentRun, trace: {
    kind: AgentTraceEvent['kind']
    title: string
    summary?: string
    status: AgentTraceEvent['status']
    toolName?: string
    data?: unknown
  }) => void
}): RuntimeIOOperationsBridge {
  return {
    startIO: async (run, request = {}, options = {}) => {
      const operation = await input.ioManager.start({
        runId: run.id,
        kind: normalizeKind(request.kind),
        request: normalizeRequest(request.request),
        timeoutMs: numberField(request.timeoutMs ?? request.timeout_ms),
        pollIntervalMs: numberField(request.pollIntervalMs ?? request.poll_interval_ms),
        signal: options.signal,
      })
      recordIOTrace(input.recordTrace, run, 'agent_io_start', operation)
      return { status: 'started', operation } as unknown as JSONValue
    },
    getIO: (_run, request = {}) => {
      const operationId = requiredString(request.operationId ?? request.operation_id, 'agent_io_get requires operationId')
      return { status: 'read', operation: input.ioManager.get(operationId) } as unknown as JSONValue
    },
    listIO: (run, request = {}) => ({
      status: 'listed',
      operations: input.ioManager.list({
        runId: request.runId === 'all' ? undefined : typeof request.runId === 'string' ? request.runId : run.id,
        status: normalizeStatus(request.status),
      }),
    }) as unknown as JSONValue,
    waitIO: async (run, request = {}, options = {}) => {
      const operationIds = normalizeOperationIds(request.operationIds ?? request.operation_ids ?? request.operationId ?? request.operation_id)
      const result = await input.ioManager.wait({
        operationIds,
        mode: request.mode === 'any' ? 'any' : 'all',
        timeoutMs: numberField(request.timeoutMs ?? request.timeout_ms),
        pollIntervalMs: numberField(request.pollIntervalMs ?? request.poll_interval_ms),
        signal: options.signal,
        onOperation: (operation) => recordIOTrace(input.recordTrace, run, 'agent_io_wait', operation),
      })
      input.recordTrace?.(run, {
        kind: 'tool_call',
        title: `Runtime operation wait ${result.status}`,
        summary: result.message,
        status: result.status === 'failed' ? 'failed' : result.done ? 'completed' : 'info',
        toolName: 'agent_io_wait',
        data: { ioWait: result },
      })
      return result as unknown as JSONValue
    },
    cancelIO: async (run, request = {}, options = {}) => {
      const operationId = requiredString(request.operationId ?? request.operation_id, 'agent_io_cancel requires operationId')
      const operation = await input.ioManager.cancel(operationId, { signal: options.signal })
      recordIOTrace(input.recordTrace, run, 'agent_io_cancel', operation)
      return { status: 'cancelled', operation } as unknown as JSONValue
    },
  }
}

function recordIOTrace(
  recordTrace: Parameters<typeof createRuntimeIOOperationsBridge>[0]['recordTrace'],
  run: AgentRun,
  toolName: string,
  operation: AgentIOOperation,
): void {
  const generation = generationTraceForIO(toolName, operation)
  recordTrace?.(run, {
    kind: 'tool_call',
    title: `Runtime operation ${operation.status}: ${operation.kind}`,
    summary: operation.externalHandle
      ? `${operation.externalHandle.type} ${String(operation.externalHandle.id)} is ${operation.status}.`
      : `Operation ${operation.id} is ${operation.status}.`,
    status: operation.status === 'failed' ? 'failed' : operation.status === 'completed' ? 'completed' : 'info',
    toolName,
    data: { ioOperation: operation, ...(generation ? { generation } : {}) },
  })
}

function generationTraceForIO(toolName: string, operation: AgentIOOperation) {
  if (operation.kind !== 'generation_job' || operation.result === undefined) return undefined
  const jobId = operation.externalHandle?.id
  const request = operation.request && typeof operation.request === 'object' && !Array.isArray(operation.request)
    ? operation.request as Record<string, JSONValue>
    : {}
  const args = typeof jobId === 'number' ? { jobId } : request
  const backendToolName = toolName === 'agent_io_start'
    ? 'movscript_create_generation_job'
    : toolName === 'agent_io_cancel'
      ? 'movscript_cancel_generation_job'
      : 'movscript_get_generation_job'
  return buildGenerationEvent({ name: backendToolName, args }, operation.result)
}

function normalizeKind(value: unknown): AgentIOOperationKind {
  if (value === 'generation_job') return value
  if (value === 'subagent_run') throw new Error('agent_io_start does not create subagent runtime operations; use movscript_spawn_subagent')
  if (value === 'mcp_tool' || value === 'backend_http' || value === 'file_apply') throw new Error(`agent_io_start currently supports only kind "generation_job", not ${String(value)}`)
  throw new Error('agent_io_start requires kind')
}

function normalizeRequest(value: unknown): Record<string, JSONValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('agent_io_start requires request object')
  const output: Record<string, JSONValue> = {}
  for (const [key, item] of Object.entries(value)) {
    if (isJSONValue(item)) output[key] = item
  }
  return output
}

function normalizeOperationIds(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [value]
  const ids = raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
  if (ids.length === 0) throw new Error('agent_io_wait requires operationIds')
  return Array.from(new Set(ids))
}

function normalizeStatus(value: unknown): AgentIOOperation['status'] | undefined {
  return value === 'queued'
    || value === 'running'
    || value === 'waiting'
    || value === 'completed'
    || value === 'failed'
    || value === 'cancelled'
    || value === 'timeout'
    ? value
    : undefined
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
