import { cloneJSONValue, isJSONRecord, isJSONValue, isRecord } from '../jsonValue.js'
import type { MCPClient } from '../mcpClient.js'
import { buildGenerationEvent, type GenerationEvent } from '../generation/generationEvents.js'
import { isValidAgentEntityId, isValidAgentProjectId } from '../context/runtimeContext.js'
import type { JSONValue, ToolCall } from '../state/types.js'

export interface RuntimeGenerationJobsWaitResult {
  status: 'completed' | 'partial' | 'timeout' | 'failed' | 'cancelled'
  done: boolean
  mode: 'all' | 'any'
  jobIds: number[]
  jobs: Record<string, JSONValue>[]
  completed: Record<string, JSONValue>[]
  pending: Record<string, JSONValue>[]
  failed: Record<string, JSONValue>[]
  cancelled: Record<string, JSONValue>[]
  output_resource_ids?: number[]
  timeout_ms: number
  heartbeat_ms: number
  terminal: boolean
  message: string
}

export async function waitRuntimeGenerationJobs(input: {
  mcpClient: Pick<MCPClient, 'initialize' | 'callTool'>
  request?: Record<string, JSONValue>
  currentTimeMs?: () => number
  sleep?: (ms: number) => Promise<void>
  signal?: AbortSignal
  onGenerationEvent?: (event: GenerationEvent) => void
}): Promise<RuntimeGenerationJobsWaitResult> {
  const request = input.request ?? {}
  const jobIds = normalizeWaitGenerationJobIds(request)
  if (jobIds.length === 0) throw new Error('jobIds is required')

  const mode = request.mode === 'any' ? 'any' : 'all'
  const timeoutMs = clampNumber(numberField(request.timeout_ms) ?? numberField(request.timeoutMs) ?? 180_000, 0, 30 * 60_000)
  const pollIntervalMs = clampNumber(numberField(request.poll_interval_ms) ?? numberField(request.pollIntervalMs) ?? 2_500, 500, 15_000)
  const heartbeatMs = clampNumber(numberField(request.heartbeat_ms) ?? numberField(request.heartbeatMs) ?? 15_000, 0, 5 * 60_000)
  const nowMs = input.currentTimeMs ?? (() => Date.now())
  const sleep = input.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms))))
  const deadline = nowMs() + timeoutMs
  const projectId = isValidAgentProjectId(request.projectId) ? request.projectId : undefined

  await input.mcpClient.initialize({ signal: input.signal })
  let latest = await readRuntimeGenerationJobs({
    mcpClient: input.mcpClient,
    jobIds,
    ...(projectId !== undefined ? { projectId } : {}),
    signal: input.signal,
  })
  emitRuntimeGenerationEvents(input.onGenerationEvent, latest)
  let lastHeartbeatAt = nowMs()
  let lastEventKey = generationJobsEventKey(latest)

  while (!waitGenerationJobsDone(latest, mode) && nowMs() < deadline) {
    await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - nowMs())))
    latest = await readRuntimeGenerationJobs({
      mcpClient: input.mcpClient,
      jobIds,
      ...(projectId !== undefined ? { projectId } : {}),
      signal: input.signal,
    })
    const nextEventKey = generationJobsEventKey(latest)
    const current = nowMs()
    if (heartbeatMs > 0 && nextEventKey === lastEventKey && current - lastHeartbeatAt >= heartbeatMs) {
      emitRuntimeGenerationEvents(input.onGenerationEvent, latest)
      lastHeartbeatAt = current
    } else if (nextEventKey !== lastEventKey) {
      emitRuntimeGenerationEvents(input.onGenerationEvent, latest)
      lastEventKey = nextEventKey
      lastHeartbeatAt = current
    }
  }

  return buildWaitGenerationJobsResult({
    jobIds,
    jobs: latest,
    mode,
    timedOut: !waitGenerationJobsDone(latest, mode),
    timeoutMs,
    heartbeatMs,
  })
}

async function readRuntimeGenerationJobs(input: {
  mcpClient: Pick<MCPClient, 'callTool'>
  jobIds: number[]
  projectId?: number
  signal?: AbortSignal
}): Promise<Record<string, JSONValue>[]> {
  return Promise.all(input.jobIds.map(async (jobId) => {
    const args: Record<string, JSONValue> = {
      jobId,
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    }
    const call: ToolCall = { name: 'movscript_get_generation_job', args }
    const raw = await input.mcpClient.callTool('movscript_get_generation_job', args, { signal: input.signal })
    const payload = unwrapToolPayload(raw)
    const event = buildGenerationEvent(call, raw)
    const job = normalizeGenerationJobPayload(payload, jobId, event)
    return job
  }))
}

function buildWaitGenerationJobsResult(input: {
  jobIds: number[]
  jobs: Record<string, JSONValue>[]
  mode: 'all' | 'any'
  timedOut: boolean
  timeoutMs: number
  heartbeatMs: number
}): RuntimeGenerationJobsWaitResult {
  const completed = input.jobs.filter((job) => isCompletedStatus(stringField(job.status)))
  const failed = input.jobs.filter((job) => stringField(job.status) === 'failed')
  const cancelled = input.jobs.filter((job) => stringField(job.status) === 'cancelled')
  const pending = input.jobs.filter((job) => job.terminal !== true)
  const outputResourceIds = uniquePositiveNumberArray(input.jobs.flatMap((job) => (
    Array.isArray(job.output_resource_ids) ? job.output_resource_ids : [job.output_resource_id]
  )))
  const done = !input.timedOut && waitGenerationJobsDone(input.jobs, input.mode)
  const status = input.timedOut
    ? 'timeout'
    : pending.length > 0
      ? 'partial'
      : failed.length > 0
        ? 'failed'
        : cancelled.length > 0 && completed.length === 0
          ? 'cancelled'
          : 'completed'
  return {
    status,
    done,
    mode: input.mode,
    jobIds: input.jobIds,
    jobs: input.jobs,
    completed,
    pending,
    failed,
    cancelled,
    ...(outputResourceIds.length > 0 ? { output_resource_ids: outputResourceIds } : {}),
    timeout_ms: input.timeoutMs,
    heartbeat_ms: input.heartbeatMs,
    terminal: done,
    message: waitGenerationJobsMessage({ status, completed, pending, failed, cancelled, outputResourceIds }),
  }
}

function normalizeGenerationJobPayload(payload: JSONValue | undefined, fallbackJobId: number, event: GenerationEvent | undefined): Record<string, JSONValue> {
  const source = isJSONRecord(payload) ? cloneJSONValue(payload) : {}
  const status = stringField(source.status) ?? stringField(source.job, 'status') ?? event?.status ?? 'unknown'
  const outputResourceIds = outputResourceIdsFromPayload(source)
  return {
    ...source,
    jobId: idField(source.jobId) ?? idField(source.job_id) ?? idField(source.job, 'ID') ?? idField(source.job, 'id') ?? event?.jobId ?? fallbackJobId,
    status,
    terminal: event?.terminal ?? isTerminalGenerationStatus(status),
    ...(event?.progress !== undefined && source.progress === undefined ? { progress: event.progress } : {}),
    ...(event?.message ? { message: event.message } : {}),
    ...(outputResourceIds.length > 0 ? { output_resource_ids: outputResourceIds } : {}),
  }
}

function normalizeWaitGenerationJobIds(request: Record<string, JSONValue>): number[] {
  const raw = Array.isArray(request.jobIds) && request.jobIds.length > 0
    ? request.jobIds
    : Array.isArray(request.job_ids) && request.job_ids.length > 0
      ? request.job_ids
      : [request.jobId ?? request.job_id]
  return uniquePositiveNumberArray(raw)
}

function waitGenerationJobsDone(jobs: Record<string, JSONValue>[], mode: 'all' | 'any'): boolean {
  if (jobs.length === 0) return false
  const terminal = (job: Record<string, JSONValue>) => job.terminal === true
  return mode === 'any' ? jobs.some(terminal) : jobs.every(terminal)
}

function waitGenerationJobsMessage(input: {
  status: string
  completed: Record<string, JSONValue>[]
  pending: Record<string, JSONValue>[]
  failed: Record<string, JSONValue>[]
  cancelled: Record<string, JSONValue>[]
  outputResourceIds: number[]
}): string {
  if (input.status === 'timeout') return `等待生成任务超时，仍有 ${input.pending.length} 个任务在后台运行。`
  if (input.status === 'failed') return `生成任务等待完成，其中 ${input.failed.length} 个失败。`
  if (input.status === 'cancelled') return `生成任务等待完成，其中 ${input.cancelled.length} 个已取消。`
  if (input.outputResourceIds.length > 0) return `生成任务完成，输出资源 ${input.outputResourceIds.map((id) => `#${id}`).join('、')}。`
  return `生成任务等待完成，成功 ${input.completed.length} 个。`
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
        return isJSONValue(parsed) ? parsed : hasData ? undefined : result
      } catch {
        return hasData ? undefined : result
      }
    }
  }
  return hasData ? undefined : result
}

function generationJobsEventKey(jobs: Record<string, JSONValue>[]): string {
  return jobs.map((job) => [
    job.jobId,
    job.status,
    job.terminal,
    job.progress ?? '',
    Array.isArray(job.output_resource_ids) ? job.output_resource_ids.join(',') : job.output_resource_id ?? '',
  ].join(':')).join('|')
}

function emitRuntimeGenerationEvents(callback: ((event: GenerationEvent) => void) | undefined, jobs: Record<string, JSONValue>[]): void {
  if (!callback) return
  for (const job of jobs) emitRuntimeGenerationEvent(callback, job)
}

function emitRuntimeGenerationEvent(callback: ((event: GenerationEvent) => void) | undefined, job: Record<string, JSONValue>): void {
  if (!callback) return
  const event = buildGenerationEvent({ name: 'movscript_get_generation_job', args: { jobId: job.jobId ?? 0 } }, job)
  if (event) callback(event)
}

function isTerminalGenerationStatus(status: string): boolean {
  return isCompletedStatus(status) || status === 'failed' || status === 'cancelled'
}

function isCompletedStatus(status: string | undefined): boolean {
  return status === 'succeeded' || status === 'completed'
}

function outputResourceIdsFromPayload(payload: Record<string, JSONValue>): number[] {
  const ids = new Set<number>()
  for (const value of [
    ...(Array.isArray(payload.output_resource_ids) ? payload.output_resource_ids : []),
    ...(Array.isArray(payload.outputResourceIds) ? payload.outputResourceIds : []),
    payload.output_resource_id,
    payload.outputResourceId,
  ]) {
    if (isValidAgentEntityId(value)) ids.add(value)
  }
  return [...ids]
}

function uniquePositiveNumberArray(values: unknown[]): number[] {
  const ids = new Set<number>()
  for (const value of values) {
    if (isValidAgentEntityId(value)) ids.add(value)
  }
  return [...ids]
}

function numberField(value: unknown): number | undefined {
  const raw = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(raw) ? raw : undefined
}

function stringField(value: unknown, key?: string): string | undefined {
  const raw = key && isRecord(value) ? value[key] : value
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
}

function idField(value: unknown, key?: string): number | undefined {
  const raw = key && isRecord(value) ? value[key] : value
  return isValidAgentEntityId(raw) ? raw : undefined
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
