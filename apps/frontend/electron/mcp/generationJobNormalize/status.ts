import { isRecord } from '../valueUtils'

export function getGenerationProgress(job: Record<string, unknown>): number | undefined {
  const candidates = [
    job.progress,
    job.progress_percent,
    job.percent,
    isRecord(job.metadata) ? job.metadata.progress : undefined,
  ]
  for (const value of candidates) {
    const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
    if (Number.isFinite(numeric)) return numeric > 1 ? Math.round(numeric) : Math.round(numeric * 100)
  }
  return undefined
}

export function getGenerationStage(job: Record<string, unknown>): string | undefined {
  const value = job.stage ?? job.provider_status ?? (isRecord(job.metadata) ? job.metadata.stage : undefined)
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function isCompletedGenerationStatus(status: string): boolean {
  return COMPLETED_GENERATION_STATUSES.has(normalizeGenerationStatus(status))
}

export function isFailedGenerationStatus(status: string): boolean {
  return FAILED_GENERATION_STATUSES.has(normalizeGenerationStatus(status))
}

export function isCancelledGenerationStatus(status: string): boolean {
  return CANCELLED_GENERATION_STATUSES.has(normalizeGenerationStatus(status))
}

export function isTerminalGenerationStatus(status: string): boolean {
  return isCompletedGenerationStatus(status) || isFailedGenerationStatus(status) || isCancelledGenerationStatus(status)
}

function normalizeGenerationStatus(status: string): string {
  return status.trim().toLowerCase()
}

const COMPLETED_GENERATION_STATUSES = new Set([
  'succeeded',
  'succeed',
  'success',
  'completed',
  'complete',
  'done',
  'finish',
  'finished',
])

const FAILED_GENERATION_STATUSES = new Set([
  'failed',
  'failure',
  'error',
])

const CANCELLED_GENERATION_STATUSES = new Set([
  'cancelled',
  'canceled',
])
