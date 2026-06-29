import type { TFunction } from 'i18next'
import type { Job } from '@movscript/shared'

export type JobGenerationIntentSummary = {
  capability?: string
  operation?: string
}

export function jobGenerationIntent(job: Job): JobGenerationIntentSummary {
  if (!job.request_context) return {}
  try {
    const parsed = JSON.parse(job.request_context) as unknown
    const record = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
    const intent = record.intent && typeof record.intent === 'object' && !Array.isArray(record.intent)
      ? record.intent as Record<string, unknown>
      : undefined
    return {
      capability: typeof intent?.capability === 'string' ? intent.capability : undefined,
      operation: typeof intent?.operation === 'string' ? intent.operation : undefined,
    }
  } catch {
    return {}
  }
}

export function jobGenerationCategory(job: Job): string {
  const intent = jobGenerationIntent(job)
  if (intent.capability && intent.operation) return `${intent.capability}:${intent.operation}`
  return legacyJobCategory(job)
}

export function legacyJobCategory(job: Job): string {
  if (job.job_type === 'canvas') return 'canvas'
  return job.job_type
}

export function filterJobs(jobs: Job[], category: string): Job[] {
  if (category === 'all') return jobs
  if (category === 'canvas') return jobs.filter((job) => job.job_type === 'canvas')
  return jobs.filter((job) => jobGenerationCategory(job) === category)
}

export function jobGenerationDisplay(job: Job, t: TFunction): string {
  const intent = jobGenerationIntent(job)
  if (intent.capability && intent.operation) {
    return t(`pages.jobs.operations.${intent.operation}`, { defaultValue: intent.operation })
  }
  return t(`pages.jobs.categories.${job.job_type}`, { defaultValue: job.job_type })
}

export function jobIsVideoGeneration(job: Job): boolean {
  const intent = jobGenerationIntent(job)
  if (intent.capability) return intent.capability === 'video_generation'
  return job.job_type.startsWith('video')
}
