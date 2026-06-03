import type { MCPClient } from '../../adapters/mcp/client/mcpClient.js'
import { callMCPToolWithGenerationRepair } from '../../generation/repair/generationRepair.js'
import type { JSONValue } from '../../state/shared/types.js'
import { cloneJSONValue, isJSONRecord, isJSONValue, isRecord } from '../../shared/json/jsonValue.js'
import type { RuntimeWorkProvider } from '../core/runtimeWorkProvider.js'
import { type RuntimeWork, type RuntimeWorkStartInput, type RuntimeWorkStatus } from '../core/runtimeWork.js'

export class GenerationJobWorkProvider implements RuntimeWorkProvider {
  readonly kind = 'generation_job' as const

  constructor(private readonly mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>) { }

  async start(input: RuntimeWorkStartInput): Promise<RuntimeWork> {
    await this.mcpClient.initialize({ signal: input.signal })
    const request = normalizeStartRequest(input.request)
    const raw = await callMCPToolWithGenerationRepair(this.mcpClient, request.tool, request.args, { signal: input.signal })
    const payload = normalizePayload(raw)
    const now = new Date().toISOString()
    const jobId = jobIdFromPayload(payload)
    const status = eventStatus(statusFromPayload(payload), terminalFromPayload(payload))
    if (status === 'waiting' && jobId === undefined) throw new Error('generation_job start result must include a valid jobId')
    if (status === 'waiting' && !request.observeTool && !monitorFromPayload(payload)?.tool) {
      throw new Error('generation_job start result must include an observe tool')
    }
    return {
      id: makeWorkId(),
      sessionId: input.sessionId,
      threadId: input.threadId,
      runId: input.runId,
      kind: this.kind,
      mode: 'async',
      status,
      request: cloneJSONValue(requestJSON(request)),
      ...(input.continuationPolicy ? { continuationPolicy: input.continuationPolicy } : {}),
      ...(jobId !== undefined ? { externalHandle: { provider: 'movscript', type: 'generation_job', id: jobId } } : {}),
      result: payload,
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
      ...(input.pollIntervalMs !== undefined ? { pollIntervalMs: input.pollIntervalMs } : {}),
      createdAt: now,
      updatedAt: now,
      ...(status === 'completed' || status === 'failed' || status === 'cancelled' ? { completedAt: now } : {}),
    }
  }

  async observe(work: RuntimeWork, options: { signal?: AbortSignal } = {}): Promise<RuntimeWork> {
    const jobId = idField(work.externalHandle?.id) ?? (isJSONValue(work.result) ? jobIdFromPayload(work.result) : undefined)
    if (jobId === undefined) throw new Error(`generation job work has no numeric job id: ${work.id}`)
    const request = normalizeStartRequest(work.request)
    const observeTool = observeToolForWork(work, request)
    const args = { jobId }
    const raw = await this.mcpClient.callTool(observeTool, args, { signal: options.signal })
    const payload = normalizePayload(raw)
    const now = new Date().toISOString()
    const status = eventStatus(statusFromPayload(payload), terminalFromPayload(payload))
    return {
      ...work,
      status,
      externalHandle: { provider: 'movscript', type: 'generation_job', id: jobId },
      result: payload,
      updatedAt: now,
      ...(status === 'completed' || status === 'failed' || status === 'cancelled' ? { completedAt: now } : {}),
    }
  }
}

interface GenerationStartRequest {
  tool: string
  args: Record<string, JSONValue>
  observeTool?: string
}

function requestJSON(request: GenerationStartRequest): Record<string, JSONValue> {
  return {
    tool: request.tool,
    args: request.args,
    ...(request.observeTool ? { observeTool: request.observeTool } : {}),
  }
}

function normalizeStartRequest(value: unknown): GenerationStartRequest {
  if (!isRecord(value)) throw new Error('generation_job request must be an object')
  const tool = typeof value.tool === 'string' ? value.tool.trim() : ''
  if (!tool) throw new Error('generation_job request.tool is required')
  const rawArgs = isJSONRecord(value.args) ? value.args : {}
  const observeTool = typeof value.observeTool === 'string' && value.observeTool.trim()
    ? value.observeTool.trim()
    : typeof value.observe_tool === 'string' && value.observe_tool.trim()
      ? value.observe_tool.trim()
      : undefined
  return {
    tool,
    args: cloneJSONValue(rawArgs),
    ...(observeTool ? { observeTool } : {}),
  }
}

function observeToolForWork(work: RuntimeWork, request: GenerationStartRequest): string {
  if (request.observeTool) return request.observeTool
  const payload = isJSONValue(work.result) ? normalizePayload(work.result) : undefined
  const monitor = monitorFromPayload(payload)
  if (monitor?.tool) return monitor.tool
  throw new Error(`generation job work has no observe tool: ${work.id}`)
}

function eventStatus(status: string | undefined, terminal: boolean | undefined): RuntimeWorkStatus {
  if (status && isCompletedStatus(status)) return 'completed'
  if (status && isFailedStatus(status)) return 'failed'
  if (status && isCancelledStatus(status)) return 'cancelled'
  if (terminal === true) return 'completed'
  return 'waiting'
}

function isCompletedStatus(status: string): boolean {
  return COMPLETED_STATUSES.has(normalizeStatus(status))
}

function isFailedStatus(status: string): boolean {
  return FAILED_STATUSES.has(normalizeStatus(status))
}

function isCancelledStatus(status: string): boolean {
  return CANCELLED_STATUSES.has(normalizeStatus(status))
}

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase()
}

const COMPLETED_STATUSES = new Set([
  'succeeded',
  'succeed',
  'success',
  'completed',
  'complete',
  'done',
  'finish',
  'finished',
])

const FAILED_STATUSES = new Set([
  'failed',
  'failure',
  'error',
])

const CANCELLED_STATUSES = new Set([
  'cancelled',
  'canceled',
])

function normalizePayload(value: JSONValue): JSONValue {
  const payload = unwrapToolPayload(value)
  return isJSONValue(payload) ? payload : value
}

function statusFromPayload(value: JSONValue | undefined): string | undefined {
  for (const payload of payloadRecords(value)) {
    if (typeof payload.status === 'string' && payload.status.trim()) return payload.status.trim()
    if (isRecord(payload.job) && typeof payload.job.status === 'string' && payload.job.status.trim()) return payload.job.status.trim()
  }
  return undefined
}

function terminalFromPayload(value: JSONValue | undefined): boolean | undefined {
  for (const payload of payloadRecords(value)) {
    if (typeof payload.terminal === 'boolean') return payload.terminal
  }
  return undefined
}

function jobIdFromPayload(value: JSONValue | undefined): number | undefined {
  for (const payload of payloadRecords(value)) {
    const jobId = idField(payload.jobId)
      ?? idField(payload.job_id)
      ?? idField(isRecord(payload.job) ? payload.job.id : undefined)
      ?? idField(isRecord(payload.job) ? payload.job.ID : undefined)
    if (jobId !== undefined) return jobId
  }
  return undefined
}

function monitorFromPayload(value: JSONValue | undefined): { tool?: string } | undefined {
  for (const payload of payloadRecords(value)) {
    if (!isRecord(payload.monitor)) continue
    const tool = typeof payload.monitor.tool === 'string' && payload.monitor.tool.trim() ? payload.monitor.tool.trim() : undefined
    if (tool) return { tool }
  }
  return undefined
}

function payloadRecords(value: JSONValue | undefined): Record<string, unknown>[] {
  if (!isRecord(value)) return []
  return isRecord(value.data) ? [value, value.data] : [value]
}

function idField(value: unknown): number | undefined {
  const numberValue = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined
}

function unwrapToolPayload(result: JSONValue | undefined): JSONValue | undefined {
  if (!isRecord(result)) return result
  const hasData = Object.hasOwn(result, 'data')
  if (isJSONValue(result.data)) return result.data
  if (Array.isArray(result.content)) {
    const text = result.content
      .map((item) => isRecord(item) && typeof item.text === 'string' ? item.text : undefined)
      .find((item): item is string => typeof item === 'string' && item.trim().length > 0)
    if (text) {
      try {
        const parsed = JSON.parse(text) as unknown
        return isJSONValue(parsed) || isJSONRecord(parsed) ? parsed as JSONValue : hasData ? undefined : result
      } catch {
        return hasData ? undefined : result
      }
    }
  }
  return hasData ? undefined : result
}

function makeWorkId(): string {
  return `work_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
