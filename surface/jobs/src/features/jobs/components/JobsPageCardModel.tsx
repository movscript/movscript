import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
} from 'lucide-react'
import type { TFunction } from 'i18next'
import type { Job } from '@movscript/shared'
import { jobStatusRecipe } from '../presentation/jobsSemanticUi'
import {
  JobStatusBadge,
  JobSpinIcon,
} from '../../../shared/ui/JobDisplayUi'

export type JobStateTraceEntry = {
  state: string
  status: 'running' | 'succeeded' | 'failed'
  message?: string
  error?: string
  started_at: string
  finished_at?: string
  duration_ms?: number
}

export function formatJobTime(iso: string, locale: string, t: TFunction): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return t('pages.jobs.time.justNow')
  if (diff < 3_600_000) return t('pages.jobs.time.minutesAgo', { count: Math.floor(diff / 60_000) })
  if (diff < 86_400_000) return t('pages.jobs.time.hoursAgo', { count: Math.floor(diff / 3_600_000) })
  return new Date(iso).toLocaleDateString(locale)
}

export function getJobTitle(job: Job): string {
  return job.title?.trim() || job.prompt?.trim() || '未命名任务'
}

export function JobStatusPill({ status, t }: { status: Job['status']; t: TFunction }) {
  const badge = jobStatusBadgeProps(status, t)
  return (
    <JobStatusBadge {...jobStatusRecipe(status)} icon={badge.icon}>
      {badge.label}
    </JobStatusBadge>
  )
}

export function parseJobStateTrace(value?: string): JobStateTraceEntry[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is JobStateTraceEntry =>
      !!item
      && typeof item === 'object'
      && typeof (item as Record<string, unknown>).state === 'string'
      && typeof (item as Record<string, unknown>).status === 'string'
      && typeof (item as Record<string, unknown>).started_at === 'string',
    )
  } catch {
    return []
  }
}

function jobStatusBadgeProps(status: Job['status'], t: TFunction) {
  switch (status) {
    case 'pending':
      return { label: t('pages.jobs.status.pending'), icon: <Clock size={10} /> }
    case 'running':
      return { label: t('pages.jobs.status.running'), icon: <JobSpinIcon><Loader2 size={10} /></JobSpinIcon> }
    case 'succeeded':
      return { label: t('pages.jobs.status.succeeded'), icon: <CheckCircle2 size={10} /> }
    case 'failed':
      return { label: t('pages.jobs.status.failed'), icon: <AlertCircle size={10} /> }
    case 'cancelled':
      return { label: t('pages.jobs.status.cancelled'), icon: <XCircle size={10} /> }
    default:
      return { label: status || '未知' }
  }
}
