import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Video,
  XCircle,
} from 'lucide-react'

import type { Job, RawResource } from '@/types'
import { MediaViewer } from '@/shared/ui/MediaViewer'
import { JobContextSummary, PromptText } from '@/shared/ui/GenResultCard'
import { jobStatusRecipe } from '@/features/jobs/presentation/jobsSemanticUi'
import {
  JobDetailCodeBlock,
  JobDetailKeyValue,
  JobActionRow,
  JobCardShell,
  JobCardState,
  JobCodeHistory,
  JobContextBar,
  JobDetailActions,
  JobDetailBlock,
  JobDetailKeyValueGrid,
  JobDetailMeta,
  JobDetailPanel,
  JobDetailPrompt,
  JobDetailSummary,
  JobGridCaption,
  JobGridDescription,
  JobGridMediaArea,
  JobGridMediaPreview,
  JobGridTitle,
  JobListHeader,
  JobListMediaArea,
  JobListMediaPreview,
  JobOverlayAction,
  JobStatusBadge,
  JobTimestamp,
  JobTitleBlock,
  JobTraceEntry,
  JobTypeIcon,
  JobSpinIcon,
} from '@/shared/ui/JobDisplayUi'
import { JobsActionButton } from '@/features/jobs/components/JobsPageUi'

type JobStateTraceEntry = {
  state: string
  status: 'running' | 'succeeded' | 'failed'
  message?: string
  error?: string
  started_at: string
  finished_at?: string
  duration_ms?: number
}

function formatTime(iso: string, locale: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return t('pages.jobs.time.justNow')
  if (diff < 3_600_000) return t('pages.jobs.time.minutesAgo', { count: Math.floor(diff / 60_000) })
  if (diff < 86_400_000) return t('pages.jobs.time.hoursAgo', { count: Math.floor(diff / 3_600_000) })
  return new Date(iso).toLocaleDateString(locale)
}

function getJobTitle(job: Job): string {
  return job.title?.trim() || job.prompt?.trim() || '未命名任务'
}

function jobStatusBadgeProps(status: Job['status'], t: ReturnType<typeof useTranslation>['t']) {
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

function JobStatusPill({ status, t }: { status: Job['status']; t: ReturnType<typeof useTranslation>['t'] }) {
  const badge = jobStatusBadgeProps(status, t)
  return (
    <JobStatusBadge {...jobStatusRecipe(status)} icon={badge.icon}>
      {badge.label}
    </JobStatusBadge>
  )
}

function parseJobStateTrace(value?: string): JobStateTraceEntry[] {
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

export function JobDetailCard({ job, onClose }: { job: Job; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const stateTrace = parseJobStateTrace(job.state_trace)

  return (
    <JobDetailPanel
      icon={Eye}
      title={getJobTitle(job)}
      action={(
        <JobDetailActions>
          <JobStatusPill status={job.status} t={t} />
          <JobsActionButton type="button" variant="ghost" size="xs" onClick={onClose}>
            {t('common.close')}
          </JobsActionButton>
        </JobDetailActions>
      )}
    >
      <JobDetailSummary>
        {job.title && job.prompt ? (
          <JobDetailPrompt>{job.prompt}</JobDetailPrompt>
        ) : null}
        <JobDetailMeta>
          {job.job_type} · #{job.ID} · {job.provider_name ?? job.model_display ?? t('pages.jobs.generating')}
        </JobDetailMeta>
      </JobDetailSummary>

      <JobDetailKeyValueGrid>
        <JobDetailKeyValue label={t('pages.jobs.status.running')} value={job.provider_task_status ?? job.status} />
        <JobDetailKeyValue label={t('pages.jobs.status.succeeded')} value={job.finished_at ? formatTime(job.finished_at, i18n.language, t) : '—'} />
        <JobDetailKeyValue label={t('pages.jobs.time.justNow')} value={job.started_at ? formatTime(job.started_at, i18n.language, t) : '—'} />
        <JobDetailKeyValue label={t('pages.jobs.cancelTask')} value={job.provider_task_id ?? '—'} />
      </JobDetailKeyValueGrid>

      {stateTrace.length > 0 && (
        <JobDetailBlock title="状态轨迹">
          {stateTrace.map((entry, index) => (
            <JobTraceEntry
              key={`${entry.state}-${entry.started_at}-${index}`}
              title={entry.state}
              status={entry.status}
              message={entry.message ?? entry.error ?? '—'}
              meta={(
                <>
                  {formatTime(entry.started_at, i18n.language, t)}
                  {entry.finished_at ? ` → ${formatTime(entry.finished_at, i18n.language, t)}` : ''}
                  {typeof entry.duration_ms === 'number' ? ` · ${entry.duration_ms}ms` : ''}
                </>
              )}
            />
          ))}
        </JobDetailBlock>
      )}

      {job.provider_task_history && (
        <JobDetailBlock title="Provider 历史">
          <JobCodeHistory>
            <JobDetailCodeBlock>{job.provider_task_history}</JobDetailCodeBlock>
          </JobCodeHistory>
        </JobDetailBlock>
      )}
    </JobDetailPanel>
  )
}

export function JobListCard({
  job,
  onCancel,
  onRetry,
  onSelect,
  cancelling,
  retrying,
  selected,
}: {
  job: Job
  onCancel: (id: number) => void
  onRetry: (id: number) => void
  onSelect: (id: number) => void
  cancelling: boolean
  retrying: boolean
  selected: boolean
}) {
  const { t, i18n } = useTranslation()
  const isActive = job.status === 'pending' || job.status === 'running'
  const canRetry = job.status === 'failed' || job.status === 'cancelled'
  const out = job.output_resource as RawResource | undefined
  const canCancel = isActive && job.job_type.startsWith('video')

  return (
    <JobCardShell
      role="button"
      tabIndex={0}
      onClick={() => onSelect(job.ID)}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(job.ID)
        }
      }}
      selected={selected}
    >
      <JobListHeader>
        <JobTypeIcon>
          {job.job_type.startsWith('video') ? <Video size={14} /> : <ImageIcon size={14} />}
        </JobTypeIcon>
        <JobTitleBlock
          title={getJobTitle(job)}
          description={job.prompt ? <PromptText text={job.prompt} /> : undefined}
        />
        <JobActionRow>
          <JobStatusPill status={job.status} t={t} />
          <JobsActionButton
            type="button"
            variant="ghost"
            size="xs"
            onClick={(event) => {
              event.stopPropagation()
              onSelect(job.ID)
            }}
          >
            <Eye size={10} /> {t('common.details')}
          </JobsActionButton>
          {canCancel && (
            <JobsActionButton
              type="button"
              variant="solid"
              tone="danger"
              size="xs"
              onClick={(event) => {
                event.stopPropagation()
                onCancel(job.ID)
              }}
              disabled={cancelling}
              title={t('pages.jobs.cancelTask')}
            >
              <XCircle size={10} /> {t('common.cancel')}
            </JobsActionButton>
          )}
          {canRetry && (
            <JobsActionButton
              type="button"
              variant="outline"
              size="xs"
              onClick={(event) => {
                event.stopPropagation()
                onRetry(job.ID)
              }}
              loading={retrying}
              title={t('common.retry')}
            >
              <RefreshCw size={10} /> {t('common.retry')}
            </JobsActionButton>
          )}
          <JobTimestamp>{formatTime(job.CreatedAt, i18n.language, t)}</JobTimestamp>
        </JobActionRow>
      </JobListHeader>

      <JobContextBar>
        <JobContextSummary job={job} />
      </JobContextBar>

      <JobListMediaArea>
        {isActive && (
          <JobCardState
            icon={<JobSpinIcon><Loader2 size={18} /></JobSpinIcon>}
            text={job.status === 'pending' ? t('pages.jobs.waitingWorker') : t('pages.jobs.aiGenerating')}
          />
        )}
        {!isActive && job.status === 'failed' && (
          <JobCardState tone="danger" icon={<AlertCircle size={14} />} text={job.error_msg || t('pages.jobs.generationFailed')} />
        )}
        {!isActive && job.status === 'cancelled' && (
          <JobCardState icon={<XCircle size={14} />} text={job.error_msg || t('pages.jobs.taskCancelled')} />
        )}
        {!isActive && job.status === 'succeeded' && out && (
          <JobListMediaPreview>
            <MediaViewer resource={out} fit="contain" lightbox />
          </JobListMediaPreview>
        )}
      </JobListMediaArea>
    </JobCardShell>
  )
}

export function JobGridThumb({
  job,
  onCancel,
  onRetry,
  onSelect,
  cancelling,
  retrying,
  selected,
}: {
  job: Job
  onCancel: (id: number) => void
  onRetry: (id: number) => void
  onSelect: (id: number) => void
  cancelling: boolean
  retrying: boolean
  selected: boolean
}) {
  const { t, i18n } = useTranslation()
  const isActive = job.status === 'pending' || job.status === 'running'
  const canRetry = job.status === 'failed' || job.status === 'cancelled'
  const out = job.output_resource as RawResource | undefined
  const canCancel = isActive && job.job_type.startsWith('video')

  return (
    <JobCardShell
      role="button"
      tabIndex={0}
      onClick={() => onSelect(job.ID)}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(job.ID)
        }
      }}
      selected={selected}
      layout="grid"
    >
      <JobGridMediaArea>
        {isActive && (
          <JobCardState
            layout="stack"
            icon={<JobSpinIcon><Loader2 size={18} /></JobSpinIcon>}
            text={job.status === 'pending' ? t('pages.jobs.status.pending') : t('pages.jobs.status.running')}
          />
        )}
        <JobOverlayAction position="left">
          <JobsActionButton
            type="button"
            variant="soft"
            size="xs"
            onClick={(event) => {
              event.stopPropagation()
              onSelect(job.ID)
            }}
          >
            <Eye size={12} /> {t('common.details')}
          </JobsActionButton>
        </JobOverlayAction>
        {canCancel && (
          <JobOverlayAction position="right">
            <JobsActionButton
              type="button"
              variant="solid"
              tone="danger"
              size="xs"
              onClick={(event) => {
                event.stopPropagation()
                onCancel(job.ID)
              }}
              disabled={cancelling}
              title={t('pages.jobs.cancelTask')}
            >
              <XCircle size={12} /> {t('common.cancel')}
            </JobsActionButton>
          </JobOverlayAction>
        )}
        {canRetry && (
          <JobOverlayAction position="right">
            <JobsActionButton
              type="button"
              variant="soft"
              size="xs"
              onClick={(event) => {
                event.stopPropagation()
                onRetry(job.ID)
              }}
              loading={retrying}
              title={t('common.retry')}
            >
              <RefreshCw size={12} /> {t('common.retry')}
            </JobsActionButton>
          </JobOverlayAction>
        )}
        {!isActive && job.status === 'failed' && (
          <JobCardState tone="danger" layout="stack" icon={<AlertCircle size={16} />} text={t('pages.jobs.status.failed')} />
        )}
        {!isActive && job.status === 'cancelled' && (
          <JobCardState layout="stack" icon={<XCircle size={16} />} text={t('pages.jobs.status.cancelled')} />
        )}
        {!isActive && job.status === 'succeeded' && out && (
          <JobGridMediaPreview>
            <MediaViewer resource={out} lightbox />
          </JobGridMediaPreview>
        )}
      </JobGridMediaArea>

      <JobGridCaption>
        <JobGridTitle>{getJobTitle(job)}</JobGridTitle>
        {job.prompt ? (
          <JobGridDescription>
            <PromptText text={job.prompt} />
          </JobGridDescription>
        ) : null}
        <JobContextBar>
          <JobContextSummary job={job} />
        </JobContextBar>
        <JobTimestamp>{formatTime(job.CreatedAt, i18n.language, t)}</JobTimestamp>
      </JobGridCaption>
    </JobCardShell>
  )
}
