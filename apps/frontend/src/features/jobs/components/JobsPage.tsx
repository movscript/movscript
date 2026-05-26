import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/infrastructure/api'
import { translateApiError } from '@/shared/infrastructure/apiError'
import type { Job, RawResource } from '@/types'
import {
  Loader2, AlertCircle, CheckCircle2, Clock,
  Image as ImageIcon, Video, Wand2,
  LayoutGrid, List, ChevronDown, ChevronRight,
  ChevronLeft, Eye, RefreshCw, XCircle,
} from 'lucide-react'
import { MediaViewer } from '@/shared/ui/MediaViewer'
import { JobContextSummary, PromptText } from '@/shared/ui/GenResultCard'
import { jobStatusRecipe } from '@/features/jobs/presentation/jobsSemanticUi'
import { useTranslation } from 'react-i18next'
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
  JobsActionButton,
  JobsCategorySection,
  JobsCollection,
  JobsCountPill,
  JobsEmptyState,
  JobsFilterBar,
  JobsFilterChipButton,
  JobsFilterDivider,
  JobsFilterGroup,
  JobsHeader,
  JobsHeaderStatus,
  JobsLoadingState,
  JobsPageShell,
  JobsPager,
  JobsPagerButton,
  JobsSelectedDetailRegion,
  JobsViewToggle,
  JobSpinIcon,
} from '@movscript/ui'

const PAGE_SIZE = 24

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string, locale: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return t('pages.jobs.time.justNow')
  if (diff < 3_600_000) return t('pages.jobs.time.minutesAgo', { count: Math.floor(diff / 60_000) })
  if (diff < 86_400_000) return t('pages.jobs.time.hoursAgo', { count: Math.floor(diff / 3_600_000) })
  return new Date(iso).toLocaleDateString(locale)
}

type Category = {
  key: string
  labelKey: string
  icon: React.ReactNode
}

type StatusFilter = 'all' | 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'

type JobsQueryResult = {
  jobs: Job[]
  total: number
}

type JobStateTraceEntry = {
  state: string
  status: 'running' | 'succeeded' | 'failed'
  message?: string
  error?: string
  started_at: string
  finished_at?: string
  duration_ms?: number
}

const CATEGORIES: Category[] = [
  { key: 'all',           labelKey: 'common.all',                    icon: <Wand2 size={14} /> },
  { key: 'image',         labelKey: 'pages.jobs.categories.image',    icon: <ImageIcon size={14} /> },
  { key: 'image_edit',    labelKey: 'pages.jobs.categories.imageEdit', icon: <ImageIcon size={14} /> },
  { key: 'video',         labelKey: 'pages.jobs.categories.video',    icon: <Video size={14} /> },
  { key: 'video_i2v',     labelKey: 'pages.jobs.categories.videoI2V', icon: <Video size={14} /> },
  { key: 'video_v2v',     labelKey: 'pages.jobs.categories.videoV2V', icon: <Video size={14} /> },
  { key: 'canvas',        labelKey: 'header.titles.canvases',         icon: <LayoutGrid size={14} /> },
]

const STATUS_FILTERS: Array<{ key: StatusFilter; labelKey: string }> = [
  { key: 'all', labelKey: 'pages.jobs.allStatuses' },
  { key: 'pending', labelKey: 'pages.jobs.status.pending' },
  { key: 'running', labelKey: 'pages.jobs.status.running' },
  { key: 'succeeded', labelKey: 'pages.jobs.status.succeeded' },
  { key: 'failed', labelKey: 'pages.jobs.status.failed' },
  { key: 'cancelled', labelKey: 'pages.jobs.status.cancelled' },
]

function getJobCategory(job: Job): string {
  if (job.job_type === 'canvas') return 'canvas'
  return job.job_type
}

function getJobTitle(job: Job): string {
  return job.title?.trim() || job.prompt?.trim() || '未命名任务'
}

function filterJobs(jobs: Job[], category: string): Job[] {
  if (category === 'all') return jobs
  if (category === 'canvas') return jobs.filter((j) => j.job_type === 'canvas')
  return jobs.filter((j) => getJobCategory(j) === category)
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

function JobDetailCard({ job, onClose }: { job: Job; onClose: () => void }) {
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

// ── List view card ────────────────────────────────────────────────────────────

function JobListCard({
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
          {job.job_type.startsWith('video') ? (
            <Video size={14} />
          ) : (
            <ImageIcon size={14} />
          )}
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
              variant="solid" tone="danger"
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

// ── Grid view thumbnail ───────────────────────────────────────────────────────

function JobGridThumb({
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
              variant="solid" tone="danger"
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

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({
  label,
  jobs,
  viewMode,
  onCancel,
  onRetry,
  onSelect,
  cancellingId,
  retryingId,
  selectedJobId,
}: {
  label: string
  jobs: Job[]
  viewMode: 'grid' | 'list'
  onCancel: (id: number) => void
  onRetry: (id: number) => void
  onSelect: (id: number) => void
  cancellingId?: number
  retryingId?: number
  selectedJobId?: number | null
}) {
  const [open, setOpen] = useState(true)

  return (
    <JobsCategorySection
      control={(
        <JobsActionButton
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {label}
          <JobsCountPill>{jobs.length}</JobsCountPill>
        </JobsActionButton>
      )}
    >
      {open && (
        viewMode === 'grid' ? (
          <JobsCollection layout="grid">
            {jobs.map((job) => (
              <JobGridThumb
                key={job.ID}
                job={job}
                onCancel={onCancel}
                onRetry={onRetry}
                onSelect={onSelect}
                cancelling={cancellingId === job.ID}
                retrying={retryingId === job.ID}
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
                onCancel={onCancel}
                onRetry={onRetry}
                onSelect={onSelect}
                cancelling={cancellingId === job.ID}
                retrying={retryingId === job.ID}
                selected={selectedJobId === job.ID}
              />
            ))}
          </JobsCollection>
        )
      )}
    </JobsCategorySection>
  )
}

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

  const { data, isLoading } = useQuery<JobsQueryResult>({
    queryKey: ['jobs', { category: activeCategory, status: statusFilter, page }],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      })
      if (activeCategory !== 'all') {
        params.set('type', activeCategory)
        params.set('exact_type', '1')
      }
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const res = await api.get<Job[]>(`/jobs?${params.toString()}`)
      const total = Number(res.headers['x-total-count'] ?? res.data.length)
      return { jobs: res.data, total }
    },
    refetchInterval: (query) => {
      const data = query.state.data as JobsQueryResult | undefined
      return data && hasActiveJobs(data.jobs) ? 3000 : 30000
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (id: number) => api.post(`/jobs/${id}/cancel`).then((r) => r.data as Job),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] })
    },
    onError: (err: any) => {
      alert(translateApiError(err?.response?.data, 'pages.jobs.cancelFailed'))
    },
  })
  const retryMutation = useMutation({
    mutationFn: (id: number) => api.post(`/jobs/${id}/retry`).then((r) => r.data as Job),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] })
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
      header={(
        <JobsHeader
          title={t('header.titles.jobs')}
          meta={t('pages.jobs.recordsCount', { count: total })}
          status={hasActiveJobs(jobs) ? (
            <JobsHeaderStatus icon={<JobSpinIcon><Loader2 size={12} /></JobSpinIcon>}>
              {t('pages.jobs.generating')}
            </JobsHeaderStatus>
          ) : undefined}
          actions={(
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
          )}
        />
      )}
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
        {selectedJob && (
          <JobsSelectedDetailRegion>
            <JobDetailCard job={selectedJob} onClose={() => setSelectedJobId(null)} />
          </JobsSelectedDetailRegion>
        )}

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
