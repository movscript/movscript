import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { translateApiError } from '@/lib/apiError'
import type { Job, RawResource } from '@/types'
import {
  Loader2, AlertCircle, CheckCircle2, Clock,
  Image as ImageIcon, Video, Wand2,
  LayoutGrid, List, ChevronDown, ChevronRight,
  ChevronLeft, Eye, RefreshCw, XCircle,
} from 'lucide-react'
import { MediaViewer } from '@/components/shared/MediaViewer'
import { JobContextSummary, PromptText } from '@/components/shared/GenResultCard'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'
import { AppEmptyState, AppKeyValue, AppPanel, AppStateMessage, Button, SemanticStatusBadge, semanticToneClass } from '@movscript/ui'

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
      return { label: t('pages.jobs.status.running'), icon: <Loader2 size={10} className="animate-spin" /> }
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
    <AppPanel
      data-testid="job-detail-card"
      icon={Eye}
      title={getJobTitle(job)}
      action={(
        <div className="flex items-center gap-2">
          <SemanticStatusBadge status={job.status} {...jobStatusBadgeProps(job.status, t)} />
          <Button type="button" variant="ghost" size="xs" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      )}
      className="bg-background shadow-sm"
      bodyClassName="grid gap-3 px-4 py-3"
    >
      <div className="min-w-0">
        {job.title && job.prompt ? (
          <p className="line-clamp-2 type-label text-muted-foreground">{job.prompt}</p>
        ) : null}
        <p className="mt-1 type-label text-muted-foreground">
          {job.job_type} · #{job.ID} · {job.provider_name ?? job.model_display ?? t('pages.jobs.generating')}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <AppKeyValue label={t('pages.jobs.status.running')} value={job.provider_task_status ?? job.status} />
        <AppKeyValue label={t('pages.jobs.status.succeeded')} value={job.finished_at ? formatTime(job.finished_at, i18n.language, t) : '—'} />
        <AppKeyValue label={t('pages.jobs.time.justNow')} value={job.started_at ? formatTime(job.started_at, i18n.language, t) : '—'} />
        <AppKeyValue label={t('pages.jobs.cancelTask')} value={job.provider_task_id ?? '—'} />
      </div>

      {stateTrace.length > 0 && (
        <div>
          <p className="mb-2 type-label font-semibold text-foreground">状态轨迹</p>
          <div className="space-y-2">
            {stateTrace.map((entry, index) => (
              <div key={`${entry.state}-${entry.started_at}-${index}`} className="rounded-md border border-border bg-muted/20 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="type-label font-medium text-foreground">{entry.state}</p>
                  <span className="type-tiny text-muted-foreground">{entry.status}</span>
                </div>
                <p className="mt-1 type-caption text-muted-foreground">{entry.message ?? entry.error ?? '—'}</p>
                <p className="mt-1 type-tiny text-muted-foreground/70">
                  {formatTime(entry.started_at, i18n.language, t)}
                  {entry.finished_at ? ` → ${formatTime(entry.finished_at, i18n.language, t)}` : ''}
                  {typeof entry.duration_ms === 'number' ? ` · ${entry.duration_ms}ms` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {job.provider_task_history && (
        <div>
          <p className="mb-2 type-label font-semibold text-foreground">Provider 历史</p>
          <pre className="max-h-56 overflow-auto rounded-md border border-border bg-muted/20 p-3 type-caption leading-relaxed text-muted-foreground whitespace-pre-wrap break-all">
            {job.provider_task_history}
          </pre>
        </div>
      )}
    </AppPanel>
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
    <AppPanel
      role="button"
      tabIndex={0}
      onClick={() => onSelect(job.ID)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(job.ID)
        }
      }}
      className={cn(
        'bg-background shadow-sm transition-colors',
        selected ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-foreground/20',
      )}
      bodyClassName="p-0"
    >
      <div className="px-4 py-3 border-b border-border flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          {job.job_type.startsWith('video') ? (
            <Video size={14} className="text-muted-foreground" />
          ) : (
            <ImageIcon size={14} className="text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate type-body font-semibold text-foreground">{getJobTitle(job)}</p>
          {job.prompt ? (
            <p className="mt-0.5 line-clamp-2 type-label leading-relaxed text-muted-foreground">
              <PromptText text={job.prompt} />
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SemanticStatusBadge status={job.status} {...jobStatusBadgeProps(job.status, t)} />
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={(event) => {
              event.stopPropagation()
              onSelect(job.ID)
            }}
          >
            <Eye size={10} /> {t('common.details')}
          </Button>
          {canCancel && (
            <Button
              type="button"
              variant="destructive"
              size="xs"
              onClick={(event) => {
                event.stopPropagation()
                onCancel(job.ID)
              }}
              disabled={cancelling}
              title={t('pages.jobs.cancelTask')}
            >
              <XCircle size={10} /> {t('common.cancel')}
            </Button>
          )}
          {canRetry && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={(event) => {
                event.stopPropagation()
                onRetry(job.ID)
              }}
              disabled={retrying}
              className="relative z-10"
              title={t('common.retry')}
            >
              <RefreshCw size={10} className={cn(retrying && 'animate-spin')} /> {t('common.retry')}
            </Button>
          )}
          <span className="type-label text-muted-foreground/50">{formatTime(job.CreatedAt, i18n.language, t)}</span>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-border bg-muted/10 empty:hidden">
        <JobContextSummary job={job} />
      </div>

      <div className="bg-card min-h-[64px] flex items-center">
        {isActive && (
          <div className="flex items-center justify-center w-full py-8">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 size={18} className="animate-spin" />
              <p className="type-label">{job.status === 'pending' ? t('pages.jobs.waitingWorker') : t('pages.jobs.aiGenerating')}</p>
            </div>
          </div>
        )}

        {!isActive && job.status === 'failed' && (
          <div className="flex items-center gap-2 text-destructive px-4 py-4">
            <AlertCircle size={14} />
            <p className="type-body">{job.error_msg || t('pages.jobs.generationFailed')}</p>
          </div>
        )}

        {!isActive && job.status === 'cancelled' && (
          <div className="flex items-center gap-2 text-muted-foreground px-4 py-4">
            <XCircle size={14} />
            <p className="type-body">{job.error_msg || t('pages.jobs.taskCancelled')}</p>
          </div>
        )}

        {!isActive && job.status === 'succeeded' && out && (
          <div className="relative w-full h-48 bg-muted overflow-hidden">
            <MediaViewer resource={out} fit="contain" className="w-full h-full rounded-none" lightbox />
          </div>
        )}
      </div>
    </AppPanel>
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
    <AppPanel
      role="button"
      tabIndex={0}
      onClick={() => onSelect(job.ID)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(job.ID)
        }
      }}
      className={cn(
        'bg-background transition-colors',
        selected ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-foreground/20',
      )}
      bodyClassName="p-0"
    >
      {/* 4:3 media area */}
      <div className="relative w-full aspect-[4/3] bg-muted">
        {isActive && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <Loader2 size={18} className="animate-spin" />
            <p className="type-tiny">{job.status === 'pending' ? t('pages.jobs.status.pending') : t('pages.jobs.status.running')}</p>
          </div>
        )}
        <Button
          type="button"
          variant="secondary"
          size="xs"
          onClick={(event) => {
            event.stopPropagation()
            onSelect(job.ID)
          }}
          className="absolute left-2 top-2 z-10 shadow-sm"
        >
          <Eye size={12} /> {t('common.details')}
        </Button>
        {canCancel && (
          <Button
            type="button"
            variant="destructive"
            size="xs"
            onClick={(event) => {
              event.stopPropagation()
              onCancel(job.ID)
            }}
            disabled={cancelling}
            className="absolute right-2 top-2 z-10 shadow-sm"
            title={t('pages.jobs.cancelTask')}
          >
            <XCircle size={12} /> {t('common.cancel')}
          </Button>
        )}
        {canRetry && (
          <Button
            type="button"
            variant="secondary"
            size="xs"
            onClick={(event) => {
              event.stopPropagation()
              onRetry(job.ID)
            }}
            disabled={retrying}
            className="absolute right-2 top-2 z-10 shadow-sm"
            title={t('common.retry')}
          >
            <RefreshCw size={12} className={cn(retrying && 'animate-spin')} /> {t('common.retry')}
          </Button>
        )}
        {!isActive && job.status === 'failed' && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-destructive">
            <AlertCircle size={16} />
            <p className="type-tiny">{t('pages.jobs.status.failed')}</p>
          </div>
        )}
        {!isActive && job.status === 'cancelled' && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
            <XCircle size={16} />
            <p className="type-tiny">{t('pages.jobs.status.cancelled')}</p>
          </div>
        )}
        {!isActive && job.status === 'succeeded' && out && (
          <MediaViewer resource={out} className="absolute inset-0 w-full h-full" lightbox />
        )}
      </div>

      {/* Caption */}
      <div className="px-2 py-1.5">
        <p className="truncate type-tiny font-medium text-foreground">{getJobTitle(job)}</p>
        {job.prompt ? (
          <p className="mt-0.5 line-clamp-2 type-tiny leading-relaxed text-muted-foreground">
            <PromptText text={job.prompt} />
          </p>
        ) : null}
        <JobContextSummary job={job} className="mt-1" />
        <p className="type-micro text-muted-foreground/50 mt-0.5">{formatTime(job.CreatedAt, i18n.language, t)}</p>
      </div>
    </AppPanel>
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
    <div>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => setOpen((o) => !o)}
        className="mb-2 text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {label}
        <span className="bg-muted rounded-full px-1.5 type-tiny">{jobs.length}</span>
      </Button>

      {open && (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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
          </div>
        ) : (
          <div className="space-y-3">
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
          </div>
        )
      )}
    </div>
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-background shrink-0">
        <h1 className="type-body font-semibold text-foreground">{t('header.titles.jobs')}</h1>
        <span className="type-label text-muted-foreground">{t('pages.jobs.recordsCount', { count: total })}</span>
        {hasActiveJobs(jobs) && (
          <AppStateMessage className={`border-0 bg-transparent p-0 type-label ${semanticToneClass('info', 'icon')}`}>
            <Loader2 size={12} className="animate-spin" /> {t('pages.jobs.generating')}
          </AppStateMessage>
        )}
        <div className="flex-1" />
        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setViewMode('grid')}
            className={cn(
              viewMode === 'grid'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title={t('pages.resources.gridTitle')}
          >
            <LayoutGrid size={14} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setViewMode('list')}
            className={cn(
              viewMode === 'list'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title={t('pages.resources.listTitle')}
          >
            <List size={14} />
          </Button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-border bg-background shrink-0 overflow-x-auto">
        <div className="flex items-center gap-1 shrink-0">
          {STATUS_FILTERS.map((filter) => (
            <Button
              type="button"
              variant={statusFilter === filter.key ? 'default' : 'secondary'}
              size="xs"
              key={filter.key}
              onClick={() => setStatusFilter(filter.key)}
              className={cn(
                'whitespace-nowrap rounded-full',
                statusFilter !== filter.key && 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(filter.labelKey)}
            </Button>
          ))}
        </div>
        <div className="h-5 w-px bg-border shrink-0" />
        {CATEGORIES.map((cat) => {
          const showCount = cat.key === activeCategory
          return (
            <Button
              type="button"
              variant={activeCategory === cat.key ? 'default' : 'secondary'}
              size="xs"
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={cn(
                'whitespace-nowrap rounded-full shrink-0',
                activeCategory !== cat.key && 'text-muted-foreground hover:text-foreground',
              )}
            >
              {cat.icon}
              {t(cat.labelKey)}
              {showCount && (
                <span className="type-tiny font-semibold tabular-nums opacity-70">{total}</span>
              )}
            </Button>
          )
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {selectedJob && (
          <div className="mb-4">
            <JobDetailCard job={selectedJob} onClose={() => setSelectedJobId(null)} />
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground type-body">{t('common.loadingShort')}</div>
        ) : total === 0 ? (
          <AppEmptyState icon={Wand2} title={t('pages.jobs.empty')} detail={t('pages.jobs.emptyHint')} compact />
        ) : activeCategory === 'all' ? (
          // Grouped view
          <div className="space-y-6">
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
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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
          </div>
        ) : (
          <div className="space-y-4">
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
          </div>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-background shrink-0">
          <span className="type-label text-muted-foreground">
            {t('pages.resources.pageStatus', { page, pageCount })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground"
            >
              <ChevronLeft size={12} /> {t('pages.resources.previousPage')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page === pageCount}
              className="text-muted-foreground hover:text-foreground disabled:hover:text-muted-foreground"
            >
              {t('pages.resources.nextPage')} <ChevronRight size={12} />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
