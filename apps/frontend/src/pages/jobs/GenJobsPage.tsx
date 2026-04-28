import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { translateApiError } from '@/lib/apiError'
import type { GenJob, RawResource } from '@/types'
import {
  Loader2, AlertCircle, CheckCircle2, Clock,
  Image as ImageIcon, Video, Wand2,
  LayoutGrid, List, ChevronDown, ChevronRight,
  ChevronLeft, XCircle,
} from 'lucide-react'
import { MediaViewer } from '@/components/shared/MediaViewer'
import { GenJobContextSummary, PromptText } from '@/components/shared/GenResultCard'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'

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

type StatusFilter = 'all' | 'succeeded'

type GenJobsQueryResult = {
  jobs: GenJob[]
  total: number
}

const CATEGORIES: Category[] = [
  { key: 'all',           labelKey: 'common.all',                    icon: <Wand2 size={13} /> },
  { key: 'image',         labelKey: 'pages.jobs.categories.image',    icon: <ImageIcon size={13} /> },
  { key: 'image_edit',    labelKey: 'pages.jobs.categories.imageEdit', icon: <ImageIcon size={13} /> },
  { key: 'video',         labelKey: 'pages.jobs.categories.video',    icon: <Video size={13} /> },
  { key: 'video_i2v',     labelKey: 'pages.jobs.categories.videoI2V', icon: <Video size={13} /> },
  { key: 'video_v2v',     labelKey: 'pages.jobs.categories.videoV2V', icon: <Video size={13} /> },
  { key: 'canvas',        labelKey: 'header.titles.canvases',         icon: <LayoutGrid size={13} /> },
]

function getJobCategory(job: GenJob): string {
  if (job.job_type === 'canvas') return 'canvas'
  return job.job_type
}

function filterJobs(jobs: GenJob[], category: string): GenJob[] {
  if (category === 'all') return jobs
  if (category === 'canvas') return jobs.filter((j) => j.job_type === 'canvas')
  return jobs.filter((j) => getJobCategory(j) === category)
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: GenJob['status'] }) {
  const { t } = useTranslation()

  switch (status) {
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          <Clock size={10} /> {t('pages.jobs.status.pending')}
        </span>
      )
    case 'running':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-full">
          <Loader2 size={10} className="animate-spin" /> {t('pages.jobs.status.running')}
        </span>
      )
    case 'succeeded':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 dark:bg-green-950 px-2 py-0.5 rounded-full">
          <CheckCircle2 size={10} /> {t('pages.jobs.status.succeeded')}
        </span>
      )
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
          <AlertCircle size={10} /> {t('pages.jobs.status.failed')}
        </span>
      )
    case 'cancelled':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          <XCircle size={10} /> {t('pages.jobs.status.cancelled')}
        </span>
      )
  }
}

// ── List view card ────────────────────────────────────────────────────────────

function JobListCard({ job, onCancel, cancelling }: { job: GenJob; onCancel: (id: number) => void; cancelling: boolean }) {
  const { t, i18n } = useTranslation()
  const isActive = job.status === 'pending' || job.status === 'running'
  const out = job.output_resource as RawResource | undefined
  const canCancel = isActive && job.job_type.startsWith('video')

  return (
    <div className="bg-background rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          {job.job_type.startsWith('video') ? (
            <Video size={14} className="text-muted-foreground" />
          ) : (
            <ImageIcon size={14} className="text-muted-foreground" />
          )}
        </div>
        <p className="text-sm text-foreground flex-1 leading-relaxed whitespace-pre-wrap line-clamp-3">
          {job.prompt ? <PromptText text={job.prompt} /> : t('pages.jobs.noPrompt')}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={job.status} />
          {canCancel && (
            <button
              type="button"
              onClick={() => onCancel(job.ID)}
              disabled={cancelling}
              className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive hover:bg-destructive/15 disabled:opacity-50"
              title={t('pages.jobs.cancelTask')}
            >
              <XCircle size={10} /> {t('common.cancel')}
            </button>
          )}
          <span className="text-xs text-muted-foreground/50">{formatTime(job.CreatedAt, i18n.language, t)}</span>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-border bg-muted/10 empty:hidden">
        <GenJobContextSummary job={job} />
      </div>

      <div className="bg-card min-h-[64px] flex items-center">
        {isActive && (
          <div className="flex items-center justify-center w-full py-8">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 size={20} className="animate-spin" />
              <p className="text-xs">{job.status === 'pending' ? t('pages.jobs.waitingWorker') : t('pages.jobs.aiGenerating')}</p>
            </div>
          </div>
        )}

        {!isActive && job.status === 'failed' && (
          <div className="flex items-center gap-2 text-destructive px-4 py-4">
            <AlertCircle size={14} />
            <p className="text-sm">{job.error_msg || t('pages.jobs.generationFailed')}</p>
          </div>
        )}

        {!isActive && job.status === 'cancelled' && (
          <div className="flex items-center gap-2 text-muted-foreground px-4 py-4">
            <XCircle size={14} />
            <p className="text-sm">{job.error_msg || t('pages.jobs.taskCancelled')}</p>
          </div>
        )}

        {!isActive && job.status === 'succeeded' && out && (
          <div className="relative w-full h-48 bg-muted overflow-hidden">
            <MediaViewer resource={out} fit="contain" className="w-full h-full rounded-none" lightbox />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Grid view thumbnail ───────────────────────────────────────────────────────

function JobGridThumb({ job, onCancel, cancelling }: { job: GenJob; onCancel: (id: number) => void; cancelling: boolean }) {
  const { t, i18n } = useTranslation()
  const isActive = job.status === 'pending' || job.status === 'running'
  const out = job.output_resource as RawResource | undefined
  const canCancel = isActive && job.job_type.startsWith('video')

  return (
    <div className="bg-background rounded-lg border border-border overflow-hidden">
      {/* 4:3 media area */}
      <div className="relative w-full aspect-[4/3] bg-muted">
        {isActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <Loader2 size={18} className="animate-spin" />
            <p className="text-[10px]">{job.status === 'pending' ? t('pages.jobs.status.pending') : t('pages.jobs.status.running')}</p>
          </div>
        )}
        {canCancel && (
          <button
            type="button"
            onClick={() => onCancel(job.ID)}
            disabled={cancelling}
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-1 text-[10px] text-destructive shadow-sm hover:bg-background disabled:opacity-50"
            title={t('pages.jobs.cancelTask')}
          >
            <XCircle size={11} /> {t('common.cancel')}
          </button>
        )}
        {!isActive && job.status === 'failed' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-destructive">
            <AlertCircle size={16} />
            <p className="text-[10px]">{t('pages.jobs.status.failed')}</p>
          </div>
        )}
        {!isActive && job.status === 'cancelled' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
            <XCircle size={16} />
            <p className="text-[10px]">{t('pages.jobs.status.cancelled')}</p>
          </div>
        )}
        {!isActive && job.status === 'succeeded' && out && (
          <MediaViewer resource={out} className="absolute inset-0 w-full h-full" lightbox />
        )}
      </div>

      {/* Caption */}
      <div className="px-2 py-1.5">
        <p className="text-[10px] text-muted-foreground truncate">
          {job.prompt ? <PromptText text={job.prompt} /> : t('pages.jobs.noPrompt')}
        </p>
        <GenJobContextSummary job={job} className="mt-1" />
        <p className="text-[9px] text-muted-foreground/50 mt-0.5">{formatTime(job.CreatedAt, i18n.language, t)}</p>
      </div>
    </div>
  )
}

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({
  label,
  jobs,
  viewMode,
  onCancel,
  cancellingId,
}: {
  label: string
  jobs: GenJob[]
  viewMode: 'grid' | 'list'
  onCancel: (id: number) => void
  cancellingId?: number
}) {
  const [open, setOpen] = useState(true)

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {label}
        <span className="bg-muted rounded-full px-1.5 text-[10px]">{jobs.length}</span>
      </button>

      {open && (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {jobs.map((job) => <JobGridThumb key={job.ID} job={job} onCancel={onCancel} cancelling={cancellingId === job.ID} />)}
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => <JobListCard key={job.ID} job={job} onCancel={onCancel} cancelling={cancellingId === job.ID} />)}
          </div>
        )
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GenJobsPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [activeCategory, setActiveCategory] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)

  const hasActiveJobs = (jobs: GenJob[]) =>
    jobs.some((j) => j.status === 'pending' || j.status === 'running')

  const { data, isLoading } = useQuery<GenJobsQueryResult>({
    queryKey: ['gen-jobs', { category: activeCategory, status: statusFilter, page }],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      })
      if (activeCategory !== 'all') {
        params.set('type', activeCategory)
        params.set('exact_type', '1')
      }
      if (statusFilter === 'succeeded') params.set('status', 'succeeded')

      const res = await api.get<GenJob[]>(`/gen-jobs?${params.toString()}`)
      const total = Number(res.headers['x-total-count'] ?? res.data.length)
      return { jobs: res.data, total }
    },
    refetchInterval: (query) => {
      const data = query.state.data as GenJobsQueryResult | undefined
      return data && hasActiveJobs(data.jobs) ? 3000 : 30000
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (id: number) => api.post(`/gen-jobs/${id}/cancel`).then((r) => r.data as GenJob),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gen-jobs'] })
    },
    onError: (err: any) => {
      alert(translateApiError(err?.response?.data, 'pages.jobs.cancelFailed'))
    },
  })

  const jobs = data?.jobs ?? []
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  useEffect(() => {
    setPage(1)
  }, [activeCategory, statusFilter])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  // Group by category for "all" view
  const grouped: { key: string; label: string; jobs: GenJob[] }[] =
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
        <h1 className="text-sm font-semibold text-foreground">{t('header.titles.jobs')}</h1>
        <span className="text-xs text-muted-foreground">{t('pages.jobs.recordsCount', { count: total })}</span>
        {hasActiveJobs(jobs) && (
          <span className="flex items-center gap-1 text-xs text-blue-600">
            <Loader2 size={11} className="animate-spin" /> {t('pages.jobs.generating')}
          </span>
        )}
        <div className="flex-1" />
        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              'p-1.5 rounded transition-colors',
              viewMode === 'grid'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title={t('pages.resources.gridTitle')}
          >
            <LayoutGrid size={13} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'p-1.5 rounded transition-colors',
              viewMode === 'list'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title={t('pages.resources.listTitle')}
          >
            <List size={13} />
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-border bg-background shrink-0 overflow-x-auto">
        <div className="flex items-center gap-1 shrink-0">
          {(['all', 'succeeded'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-colors',
                statusFilter === s
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              {s === 'all' ? t('pages.jobs.allStatuses') : t('pages.jobs.succeededOnly')}
            </button>
          ))}
        </div>
        <div className="h-5 w-px bg-border shrink-0" />
        {CATEGORIES.map((cat) => {
          const showCount = cat.key === activeCategory
          return (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-colors shrink-0',
                activeCategory === cat.key
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              {cat.icon}
              {t(cat.labelKey)}
              {showCount && (
                <span className="text-[10px] font-semibold tabular-nums opacity-70">{total}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">{t('common.loadingShort')}</div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground/50">
            <Wand2 size={32} className="mb-3 opacity-30" />
            <p className="text-sm">{t('pages.jobs.empty')}</p>
            <p className="text-xs mt-1">{t('pages.jobs.emptyHint')}</p>
          </div>
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
                cancellingId={cancelMutation.variables}
              />
            ))}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {jobs.map((job) => <JobGridThumb key={job.ID} job={job} onCancel={(id) => cancelMutation.mutate(id)} cancelling={cancelMutation.variables === job.ID} />)}
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => <JobListCard key={job.ID} job={job} onCancel={(id) => cancelMutation.mutate(id)} cancelling={cancelMutation.variables === job.ID} />)}
          </div>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-background shrink-0">
          <span className="text-xs text-muted-foreground">
            {t('pages.resources.pageStatus', { page, pageCount })}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground"
            >
              <ChevronLeft size={12} /> {t('pages.resources.previousPage')}
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={page === pageCount}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground"
            >
              {t('pages.resources.nextPage')} <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
