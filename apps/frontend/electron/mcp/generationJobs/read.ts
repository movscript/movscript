import { backendGet, backendPost } from '../backendClient'
import { getMCPContextSnapshot } from '../context/store'
import {
  generationJobMessage,
  isTerminalGenerationStatus,
  normalizeGenerationJob,
  stringValue,
} from '../generation'
import { isRecord } from '../valueUtils'
import {
  clampNumber,
  getOptionalNumeric,
  getOptionalString,
  getRequiredNumber,
} from './utils'

export async function getGenerationJob(args: Record<string, unknown>): Promise<unknown> {
  const jobId = getRequiredNumber(args, 'jobId')
  const rawJob = await backendGet(`/jobs/${jobId}`)
  const normalized = normalizeGenerationJob(rawJob)
  const status = stringValue(normalized.status) ?? 'unknown'
  return {
    ...normalized,
    jobId,
    terminal: isTerminalGenerationStatus(status),
    message: generationJobMessage(jobId, normalized),
  }
}

export async function listGenerationJobs(args: Record<string, unknown>): Promise<unknown> {
  const projectId = getOptionalNumeric(args, 'projectId') ?? getMCPContextSnapshot().project?.id
  const limit = clampNumber(Math.floor(getOptionalNumeric(args, 'limit') ?? 20), 1, 100)
  const query = new URLSearchParams({ limit: String(limit) })
  if (projectId) query.set('project_id', String(projectId))
  const status = getOptionalString(args, 'status')
  if (status) query.set('status', status)
  const jobType = getOptionalString(args, 'job_type') ?? getOptionalString(args, 'jobType')
  if (jobType) {
    query.set('exact_type', '1')
    query.set('type', jobType)
  }

  const raw = await backendGet(`/jobs?${query.toString()}`)
  const jobs = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.items)
      ? raw.items
      : []
  const normalizedJobs = jobs.map((job) => normalizeGenerationJob(job))
  return {
    projectId,
    count: normalizedJobs.length,
    jobs: normalizedJobs,
    active: normalizedJobs.filter((item) => !isTerminalGenerationStatus(stringValue(item.status) ?? 'unknown')).length,
  }
}

export async function cancelGenerationJob(args: Record<string, unknown>): Promise<unknown> {
  const jobId = getRequiredNumber(args, 'jobId')
  const rawJob = await backendPost(`/jobs/${jobId}/cancel`, {})
  const normalized = normalizeGenerationJob(rawJob)
  const status = stringValue(normalized.status) ?? 'unknown'
  return {
    ...normalized,
    jobId,
    terminal: isTerminalGenerationStatus(status),
    message: `生成任务 Job #${jobId} 已请求取消，当前状态：${status}。`,
  }
}
