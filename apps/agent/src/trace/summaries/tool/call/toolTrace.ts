import { createHash } from 'node:crypto'
import { previewToolResultContextRefs } from '../../../../context/ledger/core/contextLedger.js'
import type { ContextRef } from '../../../../context/ledger/shared/contextLedgerTypes.js'
import { buildGenerationEvent } from '../../../../generation/events/generationEvents.js'
import type { ToolSource } from '../../../../ports/tools/toolExecutionSource.js'
import type { RuntimeWork, RuntimeWorkWaitResult } from '../../../../runtime-work/core/runtimeWork.js'
import type { JSONValue, ToolCall } from '../../../../state/shared/types.js'

export function summarizeToolCallTrace(input: {
  call: ToolCall
  source?: ToolSource
  args?: Record<string, JSONValue>
  result?: JSONValue
  error?: string
  errorData?: JSONValue
  pipeline?: JSONValue
  sandboxed?: boolean
  durationMs?: number
}): Record<string, JSONValue> {
  const args = input.args ?? input.call.args ?? {}
  return omitUndefinedJSON({
    ...(input.source ? { source: input.source } : {}),
    ...(input.call.id ? { callId: input.call.id } : {}),
    toolName: input.call.name,
    ...summarizeJSONPayload('args', args, { includePayload: true }),
    ...(input.result !== undefined ? summarizeJSONPayload('result', input.result, { includePayload: true }) : {}),
    ...(input.error ? { error: input.error } : {}),
    ...(input.errorData !== undefined ? summarizeJSONPayload('errorData', input.errorData, { includePayload: true }) : {}),
    ...(input.pipeline !== undefined ? { pipeline: input.pipeline } : {}),
    ...(typeof input.sandboxed === 'boolean' ? { sandboxed: input.sandboxed } : {}),
    ...(isNonNegativeFiniteNumber(input.durationMs) ? { durationMs: input.durationMs } : {}),
    contextRefs: input.result !== undefined
      ? summarizeContextRefs(previewToolResultContextRefs(input.call, input.result))
      : undefined,
    generation: buildGenerationEvent(input.call, input.result),
  })
}

export function summarizeRuntimeWorkTrace(input: {
  toolName: string
  work: RuntimeWork
}): Record<string, JSONValue> {
  const generation = generationTraceForWork(input.toolName, input.work)
  return omitUndefinedJSON({
    runtimeWork: summarizeRuntimeWork(input.work),
    generation,
  })
}

export function summarizeRuntimeWorkWaitTrace(result: RuntimeWorkWaitResult): Record<string, JSONValue> {
  return omitUndefinedJSON({
    runtimeWorkWait: {
      status: result.status,
      done: result.done,
      message: result.message,
      completed: result.completed.map(summarizeRuntimeWork),
      failed: result.failed.map(summarizeRuntimeWork),
      cancelled: result.cancelled.map(summarizeRuntimeWork),
      pending: result.pending.map(summarizeRuntimeWork),
    },
  })
}

function summarizeRuntimeWork(work: RuntimeWork): Record<string, JSONValue> {
  return omitUndefinedJSON({
    id: work.id,
    runId: work.runId,
    threadId: work.threadId,
    kind: work.kind,
    mode: work.mode,
    status: work.status,
    externalHandle: work.externalHandle,
    ...(work.request !== undefined ? summarizeJSONPayload('request', work.request as JSONValue) : {}),
    ...(work.result !== undefined ? summarizeJSONPayload('result', work.result as JSONValue) : {}),
    ...(work.error ? { error: work.error } : {}),
    createdAt: work.createdAt,
    updatedAt: work.updatedAt,
    completedAt: work.completedAt,
  })
}

function generationTraceForWork(toolName: string, work: RuntimeWork) {
  if (work.kind !== 'generation_job' || work.result === undefined) return undefined
  const jobId = work.externalHandle?.id
  const request = work.request && typeof work.request === 'object' && !Array.isArray(work.request)
    ? work.request as Record<string, JSONValue>
    : {}
  const requestArgs = isJSONRecord(request.args) ? request.args : request
  const args = typeof jobId === 'number' ? { jobId } : requestArgs
  const backendToolName = toolName === 'core_work_start'
    ? stringField(request.tool) ?? 'generation_job_create'
    : toolName === 'core_work_cancel'
      ? 'generation_job_cancel'
      : stringField(request.observeTool) ?? stringField(request.observe_tool) ?? 'generation_job_get'
  return buildGenerationEvent({ name: backendToolName, args }, work.result as JSONValue | undefined)
}

function isJSONRecord(value: unknown): value is Record<string, JSONValue> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function summarizeContextRefs(refs: ContextRef[]): Array<Record<string, JSONValue>> | undefined {
  if (refs.length === 0) return undefined
  return refs.map((ref) => ({
    key: contextRefKey(ref),
    ref: ref as unknown as JSONValue,
  }))
}

function contextRefKey(ref: ContextRef): string {
  return `${ref.type}:${ref.id}:${ref.version ?? ref.hash ?? ''}`
}

function summarizeJSONPayload(prefix: string, value: JSONValue, options: { includePayload?: boolean } = {}): Record<string, JSONValue> {
  const json = stableStringify(value)
  return {
    ...(options.includePayload ? { [prefix]: toJSONValue(value) } : {}),
    [`${prefix}Hash`]: hashString(json),
    [`${prefix}Chars`]: json.length,
    [`${prefix}Mode`]: options.includePayload ? 'full' : 'summary',
  }
}

function omitUndefinedJSON(input: Record<string, unknown>): Record<string, JSONValue> {
  const output: Record<string, JSONValue> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue
    output[key] = toJSONValue(value)
  }
  return output
}

function toJSONValue(value: unknown): JSONValue {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (Array.isArray(value)) return value.map(toJSONValue)
  if (value && typeof value === 'object') return omitUndefinedJSON(value as Record<string, unknown>)
  return null
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableJSON(value))
}

function stableJSON(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJSON)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableJSON(item)]),
  )
}

function hashString(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
