import { backendGet } from '../backendClient'
import {
  generationJobMessage,
  isTerminalGenerationStatus,
  normalizeGenerationJob,
  stringValue,
} from '../generation'
import { isRecord } from '../valueUtils'
import { buildWaitGenerationJobsResult } from './results'
import {
  clampNumber,
  getOptionalNumeric,
  getOptionalString,
  sleep,
  uniquePositiveNumberArray,
} from './utils'

export async function waitGenerationJobs(args: Record<string, unknown>): Promise<unknown> {
  const jobIds = normalizeWaitGenerationJobIds(args)
  if (jobIds.length === 0) throw new Error('jobIds is required')
  const mode = getOptionalString(args, 'mode') === 'any' ? 'any' : 'all'
  const timeoutMs = clampNumber(getOptionalNumeric(args, 'timeout_ms') ?? getOptionalNumeric(args, 'timeoutMs') ?? 180_000, 0, 30 * 60_000)
  const pollIntervalMs = clampNumber(getOptionalNumeric(args, 'poll_interval_ms') ?? getOptionalNumeric(args, 'pollIntervalMs') ?? 2500, 500, 15_000)
  const heartbeatMs = clampNumber(getOptionalNumeric(args, 'heartbeat_ms') ?? getOptionalNumeric(args, 'heartbeatMs') ?? 15_000, 0, 5 * 60_000)
  const deadline = Date.now() + timeoutMs
  let latest = await readGenerationJobs(jobIds)

  while (!waitGenerationJobsDone(latest, mode) && Date.now() < deadline) {
    await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())))
    latest = await readGenerationJobs(jobIds)
  }

  const timedOut = !waitGenerationJobsDone(latest, mode)
  return buildWaitGenerationJobsResult({
    jobIds,
    jobs: latest,
    mode,
    timedOut,
    timeoutMs,
    heartbeatMs,
    done: !timedOut && waitGenerationJobsDone(latest, mode),
  })
}

async function readGenerationJobs(jobIds: number[]): Promise<Record<string, unknown>[]> {
  return Promise.all(jobIds.map(async (jobId) => {
    const normalized = normalizeGenerationJob(await backendGet(`/jobs/${jobId}`))
    return {
      ...normalized,
      jobId,
      terminal: isTerminalGenerationStatus(stringValue(normalized.status) ?? 'unknown'),
      message: generationJobMessage(jobId, normalized),
    }
  }))
}

function waitGenerationJobsDone(jobs: Record<string, unknown>[], mode: 'all' | 'any'): boolean {
  if (jobs.length === 0) return false
  const terminal = (job: Record<string, unknown>) => job.terminal === true
  return mode === 'any' ? jobs.some(terminal) : jobs.every(terminal)
}

function normalizeWaitGenerationJobIds(args: Record<string, unknown>): number[] {
  const rawIds = Array.isArray(args.jobIds)
    ? args.jobIds
    : Array.isArray(args.job_ids)
      ? args.job_ids
      : args.jobId !== undefined
        ? [args.jobId]
        : args.job_id !== undefined
          ? [args.job_id]
          : []
  return uniquePositiveNumberArray(rawIds)
}

export async function waitForGenerationJob(jobId: number, timeoutMs: number, pollIntervalMs: number): Promise<unknown> {
  const deadline = Date.now() + timeoutMs
  let latest: unknown
  while (Date.now() <= deadline) {
    latest = await backendGet(`/jobs/${jobId}`)
    const status = isRecord(latest) && typeof latest.status === 'string' ? latest.status : ''
    if (isTerminalGenerationStatus(status)) return latest
    await sleep(pollIntervalMs)
  }
  throw new Error(`generation job ${jobId} did not finish within ${timeoutMs}ms`)
}
