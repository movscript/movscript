import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
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
import {
  JobActionRow,
  JobCardShell,
  JobCardState,
  JobContextBar,
  JobGridCaption,
  JobGridDescription,
  JobGridMediaArea,
  JobGridMediaPreview,
  JobGridTitle,
  JobListHeader,
  JobListMediaArea,
  JobListMediaPreview,
  JobOverlayAction,
  JobTimestamp,
  JobTitleBlock,
  JobTypeIcon,
  JobSpinIcon,
} from '@/shared/ui/JobDisplayUi'
import { JobsActionButton } from '@/features/jobs/components/JobsPageUi'
import {
  formatJobTime,
  getJobTitle,
  JobStatusPill,
} from './JobsPageCardModel'

type JobCardProps = {
  job: Job
  onCancel: (id: number) => void
  onRetry: (id: number) => void
  onSelect: (id: number) => void
  cancelling: boolean
  retrying: boolean
  selected: boolean
}

export function JobListCard({
  job,
  onCancel,
  onRetry,
  onSelect,
  cancelling,
  retrying,
  selected,
}: JobCardProps) {
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
          <JobTimestamp>{formatJobTime(job.CreatedAt, i18n.language, t)}</JobTimestamp>
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
}: JobCardProps) {
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
            <MediaViewer resource={out} fit="contain" lightbox />
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
        <JobTimestamp>{formatJobTime(job.CreatedAt, i18n.language, t)}</JobTimestamp>
      </JobGridCaption>
    </JobCardShell>
  )
}
