import { Eye } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { Job } from '@/types'
import {
  JobDetailActions,
  JobDetailCodeBlock,
  JobDetailKeyValue,
  JobDetailKeyValueGrid,
  JobDetailMeta,
  JobDetailPanel,
  JobDetailPrompt,
  JobDetailSummary,
  JobDetailBlock,
  JobTraceEntry,
  JobCodeHistory,
} from '@/shared/ui/JobDisplayUi'
import { JobsActionButton } from '@/features/jobs/components/JobsPageUi'
import {
  formatJobTime,
  getJobTitle,
  JobStatusPill,
  parseJobStateTrace,
} from './JobsPageCardModel'

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
        <JobDetailKeyValue label={t('pages.jobs.status.succeeded')} value={job.finished_at ? formatJobTime(job.finished_at, i18n.language, t) : '—'} />
        <JobDetailKeyValue label={t('pages.jobs.time.justNow')} value={job.started_at ? formatJobTime(job.started_at, i18n.language, t) : '—'} />
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
                  {formatJobTime(entry.started_at, i18n.language, t)}
                  {entry.finished_at ? ` → ${formatJobTime(entry.finished_at, i18n.language, t)}` : ''}
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
