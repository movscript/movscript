import { buildGenerationEvent } from '../../generation/generationEvents.js'
import { callMCPToolWithGenerationRepair } from '../../generation/generationRepair.js'
import type { MCPClient } from '../../mcpClient.js'
import type { JSONValue, ToolCall } from '../../state/types.js'
import { cloneJSONValue, isJSONRecord, isJSONValue, isRecord } from '../../jsonValue.js'
import type { RuntimeOperationProvider } from '../runtimeOperationProvider.js'
import type { RuntimeOperation, RuntimeOperationStartInput, RuntimeOperationStatus } from '../runtimeOperation.js'

export class GenerationJobOperationProvider implements RuntimeOperationProvider {
  readonly kind = 'generation_job' as const

  constructor(private readonly mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>) {}

  async start(input: RuntimeOperationStartInput): Promise<RuntimeOperation> {
    await this.mcpClient.initialize({ signal: input.signal })
    const raw = await callMCPToolWithGenerationRepair(this.mcpClient, 'movscript_create_generation_job', input.request, { signal: input.signal })
    const event = buildGenerationEvent({ name: 'movscript_create_generation_job', args: input.request }, raw)
    const now = new Date().toISOString()
    const jobId = event?.jobId
    const status = eventStatus(event?.status, event?.terminal)
    return {
      id: makeOperationId(),
      threadId: input.threadId,
      runId: input.runId,
      kind: this.kind,
      mode: 'async',
      status,
      request: cloneJSONValue(input.request),
      ...(input.continuationPolicy ? { continuationPolicy: input.continuationPolicy } : {}),
      ...(jobId !== undefined ? { externalHandle: { provider: 'movscript', type: 'generation_job', id: jobId } } : {}),
      result: normalizePayload(raw),
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
      ...(input.pollIntervalMs !== undefined ? { pollIntervalMs: input.pollIntervalMs } : {}),
      createdAt: now,
      updatedAt: now,
      ...(status === 'completed' || status === 'failed' || status === 'cancelled' ? { completedAt: now } : {}),
    }
  }

  async observe(operation: RuntimeOperation, options: { signal?: AbortSignal } = {}): Promise<RuntimeOperation> {
    const jobId = operation.externalHandle?.id
    if (typeof jobId !== 'number') throw new Error(`generation job operation has no numeric job id: ${operation.id}`)
    const args = { jobId }
    const raw = await this.mcpClient.callTool('movscript_get_generation_job', args, { signal: options.signal })
    const event = buildGenerationEvent({ name: 'movscript_get_generation_job', args }, raw)
    const now = new Date().toISOString()
    const status = eventStatus(event?.status, event?.terminal)
    return {
      ...operation,
      status,
      result: normalizePayload(raw),
      updatedAt: now,
      ...(status === 'completed' || status === 'failed' || status === 'cancelled' ? { completedAt: now } : {}),
    }
  }

  async cancel(operation: RuntimeOperation, options: { signal?: AbortSignal } = {}): Promise<RuntimeOperation> {
    const jobId = operation.externalHandle?.id
    if (typeof jobId !== 'number') throw new Error(`generation job operation has no numeric job id: ${operation.id}`)
    const raw = await this.mcpClient.callTool('movscript_cancel_generation_job', { jobId }, { signal: options.signal })
    const now = new Date().toISOString()
    return {
      ...operation,
      status: 'cancelled',
      result: normalizePayload(raw),
      updatedAt: now,
      completedAt: now,
    }
  }
}

function eventStatus(status: string | undefined, terminal: boolean | undefined): RuntimeOperationStatus {
  if (status === 'completed' || status === 'succeeded') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  if (terminal === true) return 'completed'
  return 'waiting'
}

function normalizePayload(value: JSONValue): JSONValue {
  const payload = unwrapToolPayload(value)
  return isJSONValue(payload) ? payload : value
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

function makeOperationId(): string {
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
