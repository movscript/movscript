import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { surfaceDataApi as api } from '@movscript/shared/surface-http'
import { translateApiError } from '../../../infrastructure/apiError'
import type { Job } from '@movscript/shared'
import {
  Loader2, Wand2,
  LayoutGrid, List, ChevronRight,
  ChevronLeft,
} from 'lucide-react'
import { jobKeys } from '../application/jobQueryKeys'
import { invalidateJobMutationResult, jobListChangedResult } from '../application/jobMutationInvalidation'
import {
  installGenerationJobStatusStream,
  publishGenerationJobStatus,
} from '../application/generationJobStatusStream'
import { useTranslation } from 'react-i18next'
import { Dialog } from '@movscript/ui/primitives'
import {
  JobsActionButton,
  JobsCollection,
  JobsDetailDialogContent,
  JobsDetailDialogTitle,
  JobsEmptyState,
  JobsFilterBar,
  JobsFilterChipButton,
  JobsFilterDivider,
  JobsFilterGroup,
  JobsHeaderStatus,
  JobsLoadingState,
  JobsPageShell,
  JobsPager,
  JobsPagerButton,
  JobsViewToggle,
} from './JobsPageUi'
import {
  JobSpinIcon,
} from '../../../shared/ui/JobDisplayUi'
import {
  CATEGORIES,
  CategorySection,
  JobDetailCard,
  JobGridThumb,
  JobListCard,
  STATUS_FILTERS,
  filterJobs,
  type JobsQueryResult,
  type StatusFilter,
} from './JobsPageParts'

const PAGE_SIZE = 24

// ── Page ──────────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [activeCategory, setActiveCategory] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null)

  const hasActiveJobs = (jobs: Job[]) =>
    jobs.some((j) => j.status === 'pending' || j.status === 'running')

  useEffect(() => {
    return installGenerationJobStatusStream(qc)
  }, [qc])

  const { data, isLoading } = useQuery<JobsQueryResult>({
    queryKey: jobKeys.list({ category: activeCategory, status: statusFilter, page }),
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      })
      if (activeCategory !== 'all') {
        const intent = generationIntentFilterFromCategory(activeCategory)
        if (intent) {
          params.set('generation_capability', intent.capability)
          params.set('generation_operation', intent.operation)
        } else {
          params.set('type', activeCategory)
          params.set('exact_type', '1')
        }
      }
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const res = await api.get<unknown>(`/jobs?${params.toString()}`)
      const jobs = readJobsPayload(res.data)
      const total = Number(res.headers['x-total-count'] ?? jobs.length)
      return { jobs, total }
    },
    refetchInterval: (query) => {
      const data = query.state.data as JobsQueryResult | undefined
      return data && hasActiveJobs(data.jobs) ? 3000 : 30000
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (id: number) => api.post(`/jobs/${id}/cancel`).then((r) => r.data as Job),
    onSuccess: (job) => {
      publishGenerationJobStatus({
        jobId: job.ID,
        job,
        status: job.status,
        projectId: job.project_id,
        jobType: job.job_type,
        providerTaskId: job.provider_task_id,
        source: 'jobs-page-cancel',
        updatedAt: job.UpdatedAt,
      })
      invalidateJobMutationResult(qc, jobListChangedResult({ changedIds: [job.ID] }))
    },
    onError: (err: any) => {
      alert(translateApiError(err?.response?.data, 'pages.jobs.cancelFailed'))
    },
  })
  const retryMutation = useMutation({
    mutationFn: (id: number) => api.post(`/jobs/${id}/retry`).then((r) => r.data as Job),
    onSuccess: (job) => {
      publishGenerationJobStatus({
        jobId: job.ID,
        job,
        status: job.status,
        projectId: job.project_id,
        jobType: job.job_type,
        providerTaskId: job.provider_task_id,
        source: 'jobs-page-retry',
        updatedAt: job.UpdatedAt,
      })
      invalidateJobMutationResult(qc, jobListChangedResult({ changedIds: [job.ID] }))
    },
    onError: (err: any) => {
      alert(translateApiError(err?.response?.data, 'pages.jobs.retryFailed'))
    },
  })

  const jobs = data?.jobs ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const selectedJob = useMemo(
    () => jobs.find((job) => job.ID === selectedJobId) ?? null,
    [jobs, selectedJobId],
  )

  useEffect(() => {
    setPage(1)
  }, [activeCategory, statusFilter])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  // Group by category for "all" view
  const grouped: { key: string; label: string; jobs: Job[] }[] =
    activeCategory === 'all'
      ? CATEGORIES.filter((c) => c.key !== 'all').map((c) => ({
          key: c.key,
          label: t(c.labelKey),
          jobs: filterJobs(jobs, c.key),
        })).filter((g) => g.jobs.length > 0)
      : []

  return (
    <JobsPageShell
      filters={(
        <JobsFilterBar>
          <JobsFilterGroup>
            {STATUS_FILTERS.map((filter) => (
              <JobsFilterChipButton
                key={filter.key}
                active={statusFilter === filter.key}
                onClick={() => setStatusFilter(filter.key)}
              >
                {t(filter.labelKey)}
              </JobsFilterChipButton>
            ))}
          </JobsFilterGroup>
          <JobsViewToggle>
            <JobsActionButton
              type="button"
              variant={viewMode === 'grid' ? 'soft' : 'ghost'}
              size="icon-sm"
              onClick={() => setViewMode('grid')}
              title={t('pages.resources.gridTitle')}
            >
              <LayoutGrid size={14} />
            </JobsActionButton>
            <JobsActionButton
              type="button"
              variant={viewMode === 'list' ? 'soft' : 'ghost'}
              size="icon-sm"
              onClick={() => setViewMode('list')}
              title={t('pages.resources.listTitle')}
            >
              <List size={14} />
            </JobsActionButton>
          </JobsViewToggle>
          {hasActiveJobs(jobs) ? (
            <JobsHeaderStatus icon={<JobSpinIcon><Loader2 size={12} /></JobSpinIcon>}>
              {t('pages.jobs.generating')}
            </JobsHeaderStatus>
          ) : null}
          <JobsFilterDivider />
          {CATEGORIES.map((cat) => {
            const showCount = cat.key === activeCategory
            return (
              <JobsFilterChipButton
                key={cat.key}
                active={activeCategory === cat.key}
                icon={cat.icon}
                count={showCount ? total : undefined}
                onClick={() => setActiveCategory(cat.key)}
              >
                {t(cat.labelKey)}
              </JobsFilterChipButton>
            )
          })}
        </JobsFilterBar>
      )}
      pager={total > PAGE_SIZE ? (
        <JobsPager
          status={t('pages.resources.pageStatus', { page, pageCount })}
          actions={(
            <>
              <JobsPagerButton
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft size={12} /> {t('pages.resources.previousPage')}
              </JobsPagerButton>
              <JobsPagerButton
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page === pageCount}
              >
                {t('pages.resources.nextPage')} <ChevronRight size={12} />
              </JobsPagerButton>
            </>
          )}
        />
      ) : undefined}
    >
        <Dialog
          open={Boolean(selectedJob)}
          onOpenChange={(open) => {
            if (!open) setSelectedJobId(null)
          }}
        >
          <JobsDetailDialogContent closeLabel={t('common.close')}>
            <JobsDetailDialogTitle>
              {selectedJob?.title || t('common.details')}
            </JobsDetailDialogTitle>
            {selectedJob ? (
              <JobDetailCard job={selectedJob} onClose={() => setSelectedJobId(null)} />
            ) : null}
          </JobsDetailDialogContent>
        </Dialog>

        {isLoading ? (
          <JobsLoadingState>{t('common.loadingShort')}</JobsLoadingState>
        ) : total === 0 ? (
          <JobsEmptyState icon={Wand2} title={t('pages.jobs.empty')} detail={t('pages.jobs.emptyHint')} compact />
        ) : activeCategory === 'all' ? (
          // Grouped view
          <JobsCollection>
            {grouped.map((g) => (
              <CategorySection
                key={g.key}
                label={g.label}
                jobs={g.jobs}
                viewMode={viewMode}
                onCancel={(id) => cancelMutation.mutate(id)}
                onRetry={(id) => retryMutation.mutate(id)}
                onSelect={setSelectedJobId}
                cancellingId={cancelMutation.variables}
                retryingId={retryMutation.variables}
                selectedJobId={selectedJobId}
              />
            ))}
          </JobsCollection>
        ) : viewMode === 'grid' ? (
          <JobsCollection layout="grid">
            {jobs.map((job) => (
              <JobGridThumb
                key={job.ID}
                job={job}
                onCancel={(id) => cancelMutation.mutate(id)}
                onRetry={(id) => retryMutation.mutate(id)}
                onSelect={setSelectedJobId}
                cancelling={cancelMutation.variables === job.ID}
                retrying={retryMutation.variables === job.ID}
                selected={selectedJobId === job.ID}
              />
            ))}
          </JobsCollection>
        ) : (
          <JobsCollection>
            {jobs.map((job) => (
              <JobListCard
                key={job.ID}
                job={job}
                onCancel={(id) => cancelMutation.mutate(id)}
                onRetry={(id) => retryMutation.mutate(id)}
                onSelect={setSelectedJobId}
                cancelling={cancelMutation.variables === job.ID}
                retrying={retryMutation.variables === job.ID}
                selected={selectedJobId === job.ID}
              />
            ))}
          </JobsCollection>
        )}
    </JobsPageShell>
  )
}

function generationIntentFilterFromCategory(category: string): { capability: string; operation: string } | undefined {
  const [capability, operation, ...rest] = category.split(':')
  if (!capability || !operation || rest.length > 0) return undefined
  if (!capability.endsWith('_generation')) return undefined
  return { capability, operation }
}

function readJobsPayload(payload: unknown): Job[] {
  if (Array.isArray(payload)) return payload.filter(isJob)
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    for (const key of ['jobs', 'items', 'records', 'data']) {
      const value = record[key]
      if (Array.isArray(value)) return value.filter(isJob)
    }
  }
  return []
}

function isJob(value: unknown): value is Job {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as Partial<Job>).ID === 'number'
    && typeof (value as Partial<Job>).job_type === 'string'
    && typeof (value as Partial<Job>).status === 'string'
}
