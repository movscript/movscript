import { jobKeys } from '../application/jobQueryKeys'
import type { JobsQueryResult } from '../components/JobsPageParts'
import {
  subscribeSurfaceGenerationJobStatus,
  type SurfaceGenerationJobStatusEvent,
} from '@movscript/shared'
import type { Job, PaginatedResponse } from '@movscript/shared'

type JobStatus = Job['status']

export interface GenerationJobStatusEvent {
  jobId: number
  status?: JobStatus | string
  job?: Job
  projectId?: number
  jobType?: string
  providerTaskId?: string
  message?: string
  updatedAt: string
  source: string
}

export interface GenerationJobStatusQueryClient {
  setQueriesData: <TData>(
    filters: { queryKey: readonly unknown[] },
    updater: (current: TData | undefined) => TData | undefined,
  ) => unknown
  invalidateQueries: (options: { queryKey: readonly unknown[] }) => unknown
}

export function publishGenerationJobStatus(input: Omit<GenerationJobStatusEvent, 'updatedAt' | 'source'> & {
  updatedAt?: string
  source?: string
}): boolean {
  const event = {
    ...input,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    source: input.source ?? 'generation-job',
  }
  for (const subscriber of Array.from(localGenerationJobStatusSubscribers)) subscriber(event)
  return true
}

export function subscribeGenerationJobStatus(handler: (event: GenerationJobStatusEvent) => void): () => void {
  localGenerationJobStatusSubscribers.add(handler)
  const unsubscribeSurface = subscribeSurfaceGenerationJobStatus((event) => {
    const generationEvent = generationJobStatusEventFromSurface(event)
    if (generationEvent) handler(generationEvent)
  })
  return () => {
    localGenerationJobStatusSubscribers.delete(handler)
    unsubscribeSurface()
  }
}

export function applyGenerationJobStatusEventToCache(
  queryClient: GenerationJobStatusQueryClient,
  event: GenerationJobStatusEvent,
): void {
  queryClient.setQueriesData<JobsStatusCacheResult>({ queryKey: jobKeys.all }, (current) => {
    if (!current) return current
    return updateJobsQueryResult(current, event)
  })
  void queryClient.invalidateQueries({ queryKey: jobKeys.all })
}

export function installGenerationJobStatusStream(queryClient: GenerationJobStatusQueryClient): () => void {
  return subscribeGenerationJobStatus((event) => {
    applyGenerationJobStatusEventToCache(queryClient, event)
  })
}

type JobsStatusCacheResult = JobsQueryResult | PaginatedResponse<Job>

const localGenerationJobStatusSubscribers = new Set<(event: GenerationJobStatusEvent) => void>()

function updateJobsQueryResult(current: JobsStatusCacheResult, event: GenerationJobStatusEvent): JobsStatusCacheResult {
  if (hasJobList(current, 'jobs')) {
    return updateJobListResult(current, 'jobs', event)
  }
  if (hasJobList(current, 'items')) {
    return updateJobListResult(current, 'items', event)
  }
  return current
}

function updateJobListResult<T extends JobsStatusCacheResult, TKey extends 'jobs' | 'items'>(
  current: T & Record<TKey, Job[]>,
  key: TKey,
  event: GenerationJobStatusEvent,
): T {
  const jobs = current[key]
  const index = jobs.findIndex((job) => job.ID === event.jobId)
  if (index < 0) return current
  const existing = jobs[index]
  if (!existing) return current
  const nextJob = mergeJobStatus(existing, event)
  return {
    ...current,
    [key]: jobs.map((job) => job.ID === event.jobId ? nextJob : job),
  }
}

function hasJobList<TKey extends 'jobs' | 'items'>(
  value: JobsStatusCacheResult,
  key: TKey,
): value is JobsStatusCacheResult & Record<TKey, Job[]> {
  return Array.isArray((value as Partial<Record<TKey, unknown>>)[key])
}

function mergeJobStatus(job: Job, event: GenerationJobStatusEvent): Job {
  const snapshot = event.job
  return {
    ...job,
    ...(snapshot ?? {}),
    ID: event.jobId,
    status: (snapshot?.status ?? event.status ?? job.status) as JobStatus,
    ...(event.jobType ? { job_type: event.jobType } : {}),
    ...(event.providerTaskId ? { provider_task_id: event.providerTaskId } : {}),
    ...(event.message && !snapshot?.error_msg ? { error_msg: event.message } : {}),
    UpdatedAt: snapshot?.UpdatedAt ?? event.updatedAt,
  }
}

function generationJobStatusEventFromSurface(event: SurfaceGenerationJobStatusEvent): GenerationJobStatusEvent | undefined {
  if (typeof event.jobId !== 'number' || !Number.isFinite(event.jobId)) return undefined
  return {
    ...event,
    jobId: event.jobId,
    status: event.status,
    job: isJob(event.job) ? event.job : undefined,
    projectId: event.projectId,
    jobType: event.jobType,
    providerTaskId: event.providerTaskId,
    message: event.message,
    updatedAt: event.updatedAt ?? new Date().toISOString(),
    source: event.source ?? 'surface-generation-job',
  }
}

function isJob(value: unknown): value is Job {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as Partial<Job>).ID === 'number'
    && typeof (value as Partial<Job>).job_type === 'string'
    && typeof (value as Partial<Job>).status === 'string'
}
