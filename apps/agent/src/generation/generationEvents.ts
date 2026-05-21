import { cloneJSONValue, isJSONRecord, isJSONValue, isRecord } from '../jsonValue.js'
import { isValidAgentEntityId, isValidAgentProjectId } from '../context/runtimeContext.js'
import type { JSONValue, ToolCall } from '../state/types.js'

export type GenerationEventStage = 'created' | 'observed' | 'completed' | 'failed' | 'cancelled' | 'timeout'

export interface GenerationEvent {
  kind: 'generation_job'
  stage: GenerationEventStage
  toolName: string
  jobId?: number
  jobType?: string
  providerName?: string
  modelDisplay?: string
  modelIdentifier?: string
  modelConfigId?: number
  status: string
  terminal: boolean
  progress?: number
  outputResourceId?: number
  outputResourceIds?: number[]
  media?: JSONValue
  message: string
}

export interface GenerationMonitorRequest {
  toolName: 'movscript_get_generation_job'
  args: Record<string, JSONValue>
  timeoutMs: number
  pollIntervalMs: number
  heartbeatMs: number
}

export function buildGenerationEvent(call: ToolCall, result: JSONValue | undefined): GenerationEvent | undefined {
  const normalized = normalizeGenerationCall(call, result)
  if (!normalized || !isGenerationTool(normalized.call.name)) return undefined
  const payload = unwrapToolPayload(normalized.result)
  if (!isRecord(payload)) return undefined
  const status = stringField(payload.status) ?? statusFromJob(payload.job) ?? 'unknown'
  const jobIds = idListField(payload.jobIds) ?? idListField(payload.job_ids)
  const jobId = idField(payload.jobId) ?? idField(payload.job_id) ?? idField(payload.job, 'ID') ?? idField(payload.job, 'id') ?? jobIds?.[0]
  const terminal = payload.terminal === true || isTerminalStatus(status)
  const outputResourceIds = outputResourceIdsFromPayload(payload)
  const outputResourceId = idField(payload.output_resource_id) ?? idField(payload.outputResourceId) ?? outputResourceIds[0]
  const progress = numberField(payload.progress)
  const jobType = stringField(payload.jobType) ?? stringField(payload.job_type) ?? stringField(payload.job, 'job_type')
  const providerName = stringField(payload.providerName) ?? stringField(payload.provider_name) ?? stringField(payload.job, 'provider_name')
  const modelDisplay = stringField(payload.modelDisplay) ?? stringField(payload.model_display) ?? stringField(payload.job, 'model_display')
  const modelIdentifier = stringField(payload.modelIdentifier) ?? stringField(payload.model_identifier) ?? stringField(payload.job, 'model_identifier')
  const modelConfigId = idField(payload.modelConfigId) ?? idField(payload.model_config_id) ?? idField(payload.job, 'model_config_id')
  return {
    kind: 'generation_job',
    stage: inferStage(normalized.call.name, status, terminal),
    toolName: normalized.call.name,
    ...(jobId !== undefined ? { jobId } : {}),
    ...(jobType ? { jobType } : {}),
    ...(providerName ? { providerName } : {}),
    ...(modelDisplay ? { modelDisplay } : {}),
    ...(modelIdentifier ? { modelIdentifier } : {}),
    ...(modelConfigId !== undefined ? { modelConfigId } : {}),
    status,
    terminal,
    ...(progress !== undefined ? { progress } : {}),
    ...(outputResourceId !== undefined ? { outputResourceId } : {}),
    ...(outputResourceIds.length > 0 ? { outputResourceIds } : {}),
    ...(isJSONValue(payload.media) ? { media: cloneJSONValue(payload.media) } : {}),
    message: stringField(payload.message) ?? defaultMessage(normalized.call.name, jobId, status, progress, outputResourceIds.length > 0 ? outputResourceIds : outputResourceId !== undefined ? [outputResourceId] : []),
  }
}

export function buildGenerationTimeoutEvent(initial: GenerationEvent): GenerationEvent {
  return {
    ...initial,
    stage: 'timeout',
    status: 'timeout',
    terminal: false,
    message: initial.jobId !== undefined
      ? `生成任务 Job #${initial.jobId} 仍在后台运行，已达到本次监控等待时间。`
      : '生成任务仍在后台运行，已达到本次监控等待时间。',
  }
}

export function extractGenerationMonitorRequest(call: ToolCall, result: JSONValue | undefined, event: GenerationEvent): GenerationMonitorRequest | undefined {
  const normalized = normalizeGenerationCall(call, result)
  if (!normalized || normalized.call.name !== 'movscript_create_generation_job' || event.terminal) return undefined
  const payload = unwrapToolPayload(normalized.result)
  const monitor = isRecord(payload) && isRecord(payload.monitor) ? payload.monitor : undefined
  if (!monitor) return undefined
  const monitorArgs = isRecord(monitor?.args) ? monitor.args : undefined
  const monitorTool = 'movscript_get_generation_job'
  const jobId = event.jobId ?? idField(monitorArgs?.jobId) ?? idField(monitorArgs?.job_id)
  const jobIds = idListField(monitorArgs?.jobIds) ?? idListField(monitorArgs?.job_ids) ?? (jobId !== undefined ? [jobId] : [])
  if (jobId === undefined && jobIds.length === 0) return undefined
  const args: Record<string, JSONValue> = {
    ...(isJSONRecord(monitorArgs) ? cloneJSONValue(monitorArgs) : {}),
    ...(jobId !== undefined ? { jobId } : jobIds[0] !== undefined ? { jobId: jobIds[0] } : {}),
    ...(isValidAgentProjectId(normalized.call.args?.projectId) ? { projectId: normalized.call.args.projectId } : {}),
  }
  return {
    toolName: monitorTool,
    args,
    timeoutMs: clampNumber(numberField(monitor?.timeout_ms) ?? numberField(monitor?.timeoutMs) ?? numberField(monitorArgs?.timeout_ms) ?? numberField(monitorArgs?.timeoutMs) ?? defaultMonitorTimeoutMs(event), 0, 30 * 60_000),
    pollIntervalMs: clampNumber(numberField(monitor?.poll_interval_ms) ?? numberField(monitor?.pollIntervalMs) ?? numberField(monitorArgs?.poll_interval_ms) ?? numberField(monitorArgs?.pollIntervalMs) ?? defaultPollIntervalMs(event), 250, 30_000),
    heartbeatMs: clampNumber(numberField(monitor?.heartbeat_ms) ?? numberField(monitor?.heartbeatMs) ?? numberField(monitorArgs?.heartbeat_ms) ?? numberField(monitorArgs?.heartbeatMs) ?? defaultMonitorHeartbeatMs(event), 0, 5 * 60_000),
  }
}

function normalizeGenerationCall(call: ToolCall, result: JSONValue | undefined): { call: ToolCall; result: JSONValue | undefined } | undefined {
  if (isGenerationTool(call.name)) return { call, result }
  if (call.name !== 'runtime_operation_start') return undefined
  const resultRecord = isRecord(result) ? result : undefined
  const operation = isRecord(resultRecord?.operation) ? resultRecord.operation : undefined
  const operationResult = isJSONValue(operation?.result) ? operation.result : undefined
  const request = isJSONRecord(operation?.request)
    ? cloneJSONValue(operation.request)
    : isJSONRecord(call.args?.request)
      ? cloneJSONValue(call.args.request)
      : {}
  return {
    call: { name: 'movscript_create_generation_job', args: request },
    result: operationResult,
  }
}

function unwrapToolPayload(result: JSONValue | undefined): JSONValue | undefined {
  if (!isRecord(result)) return result
  const hasData = Object.hasOwn(result, 'data')
  if (isJSONValue(result.data)) return result.data
  if (isRecord(result.data)) return result.data
  if (Array.isArray(result.content)) {
    const text = result.content
      .map((item) => isRecord(item) && typeof item.text === 'string' ? item.text : undefined)
      .find((item): item is string => typeof item === 'string' && item.trim().length > 0)
    if (text) {
      try {
        const parsed = JSON.parse(text) as unknown
        return isJSONValue(parsed) ? parsed : hasData ? undefined : result
      } catch {
        return hasData ? undefined : result
      }
    }
  }
  if (hasData) return undefined
  return result
}

function inferStage(toolName: string, status: string, terminal: boolean): GenerationEventStage {
  if (status === 'completed') return 'completed'
  if (status === 'timeout') return 'timeout'
  if (status === 'succeeded') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  if (toolName === 'movscript_create_generation_job' && !terminal) return 'created'
  return 'observed'
}

function defaultMonitorTimeoutMs(event: GenerationEvent): number {
  return event.jobType?.startsWith('video') ? 10 * 60_000 : 3 * 60_000
}

function defaultPollIntervalMs(event: GenerationEvent): number {
  return event.jobType?.startsWith('video') ? 5_000 : 2_500
}

function defaultMonitorHeartbeatMs(event: GenerationEvent): number {
  return event.jobType?.startsWith('video') ? 30_000 : 15_000
}

function defaultMessage(toolName: string, jobId: number | undefined, status: string, progress: number | undefined, outputResourceIds: number[]): string {
  const jobLabel = jobId !== undefined ? `Job #${jobId}` : '生成任务'
  if (status === 'completed') return `${jobLabel} 生成完成${outputResourceIds.length > 0 ? `，输出资源 ${outputResourceIds.map((id) => `#${id}`).join('、')}` : ''}。`
  if (status === 'timeout') return `${jobLabel} 仍在后台运行，已达到本次监控等待时间。`
  if (status === 'succeeded') return `${jobLabel} 生成完成${outputResourceIds.length > 0 ? `，输出资源 ${outputResourceIds.map((id) => `#${id}`).join('、')}` : ''}。`
  if (status === 'failed') return `${jobLabel} 生成失败。`
  if (status === 'cancelled') return `${jobLabel} 已取消。`
  if (toolName === 'movscript_create_generation_job') return `${jobLabel} 已创建，当前状态：${status}。`
  return `${jobLabel} 仍在运行，当前状态：${status}${progress !== undefined ? `，进度 ${progress}%` : ''}。`
}

function isGenerationTool(toolName: string): boolean {
  return toolName === 'movscript_create_generation_job'
    || toolName === 'movscript_get_generation_job'
    || toolName === 'movscript_cancel_generation_job'
}

function isTerminalStatus(status: string): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled'
}

function statusFromJob(value: unknown): string | undefined {
  return stringField(value, 'status')
}

function stringField(value: unknown, key?: string): string | undefined {
  const raw = key && isRecord(value) ? value[key] : value
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
}

function numberField(value: unknown, key?: string): number | undefined {
  const raw = key && isRecord(value) ? value[key] : value
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
}

function idField(value: unknown, key?: string): number | undefined {
  const raw = key && isRecord(value) ? value[key] : value
  return isValidAgentEntityId(raw) ? raw : undefined
}

function idListField(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined
  const ids = value.filter(isValidAgentEntityId)
  return ids.length > 0 ? ids : undefined
}

function outputResourceIdsFromPayload(payload: Record<string, unknown>): number[] {
  const ids = new Set<number>()
  for (const value of [
    ...(Array.isArray(payload.output_resource_ids) ? payload.output_resource_ids : []),
    ...(Array.isArray(payload.outputResourceIds) ? payload.outputResourceIds : []),
    idField(payload.output_resource_id),
    idField(payload.outputResourceId),
  ]) {
    const id = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
    if (Number.isInteger(id) && id > 0) ids.add(id)
  }
  return [...ids]
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
