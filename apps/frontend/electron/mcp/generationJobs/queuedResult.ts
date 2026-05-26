import {
  getJobId,
  normalizeGenerationJob,
} from '../generation'
import { numericTimeout } from './resultUtils'

export function buildQueuedGenerationJobResult(input: {
  args: Record<string, unknown>
  jobs: unknown[]
  jobType: string
  outputCount: number
  projectId?: number
  paramValidation: unknown
}): Record<string, unknown> {
  const job = input.jobs[0]
  const initialJobId = getJobId(job)
  const jobIds = input.jobs.map(getJobId).filter((id): id is number => id !== undefined)
  const normalizedJobs = input.jobs.map((item) => normalizeGenerationJob(item))
  const normalized = normalizedJobs[0] ?? {}
  const monitorTimeoutMs = numericTimeout(input.args, 'timeout_ms') ?? (input.jobType.startsWith('video') ? 600_000 : 180_000)
  const monitorHeartbeatMs = input.jobType.startsWith('video') ? 30_000 : 15_000
  return {
    status: 'queued',
    job: normalized.job,
    ...(normalizedJobs.length > 1 ? { jobs: normalizedJobs.map((item) => item.job) } : {}),
    jobId: initialJobId,
    ...(jobIds.length > 1 ? { jobIds } : {}),
    ...(input.outputCount > 1 ? { requested_output_count: input.outputCount, single_output_jobs: true } : {}),
    monitor: {
      tool: 'generation_job_wait',
      args: jobIds.length > 0 ? { jobIds, ...(jobIds.length > 1 ? { mode: 'any' } : {}), timeout_ms: monitorTimeoutMs, heartbeat_ms: monitorHeartbeatMs, ...(input.projectId ? { projectId: input.projectId } : {}) } : undefined,
      message: jobIds.length > 1
        ? 'Generation is asynchronous. Wait with mode:any, attach completed output resources immediately, then continue waiting for pending jobs.'
        : 'Generation is asynchronous. Wait for this job to reach a terminal status before claiming completion.',
    },
    param_validation: input.paramValidation,
    message: jobIds.length > 1
      ? `已创建 ${jobIds.length} 个独立单输出生成任务（${jobIds.map((id) => `Job #${id}`).join('、')}）。`
      : `生成任务已创建${initialJobId ? `（Job #${initialJobId}）` : ''}。`,
  }
}
