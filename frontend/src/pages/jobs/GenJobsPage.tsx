import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { GenJob, RawResource } from '@/types'
import {
  Loader2, AlertCircle, CheckCircle2, Clock,
  Image as ImageIcon, Video, Download, Wand2,
  LayoutGrid, List, ChevronDown, ChevronRight,
} from 'lucide-react'
import { MediaViewer } from '@/components/shared/MediaViewer'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { PromptText } from '@/components/shared/GenResultCard'
import { cn } from '@/lib/utils'

const API_BASE = 'http://localhost:8765'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

type Category = {
  key: string
  label: string
  icon: React.ReactNode
}

const CATEGORIES: Category[] = [
  { key: 'all',           label: '全部',       icon: <Wand2 size={13} /> },
  { key: 'image',         label: '文生图',      icon: <ImageIcon size={13} /> },
  { key: 'image_edit',    label: '参考生图',    icon: <ImageIcon size={13} /> },
  { key: 'video',         label: '文生视频',    icon: <Video size={13} /> },
  { key: 'video_i2v',     label: '参考生视频',  icon: <Video size={13} /> },
  { key: 'video_v2v',     label: '视频迁移',    icon: <Video size={13} /> },
  { key: 'canvas',        label: '画布',        icon: <LayoutGrid size={13} /> },
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
  switch (status) {
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          <Clock size={10} /> 排队中
        </span>
      )
    case 'running':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-full">
          <Loader2 size={10} className="animate-spin" /> 生成中
        </span>
      )
    case 'succeeded':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 dark:bg-green-950 px-2 py-0.5 rounded-full">
          <CheckCircle2 size={10} /> 完成
        </span>
      )
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
          <AlertCircle size={10} /> 失败
        </span>
      )
  }
}

// ── List view card ────────────────────────────────────────────────────────────

function JobListCard({ job }: { job: GenJob }) {
  const isActive = job.status === 'pending' || job.status === 'running'
  const out = job.output_resource as RawResource | undefined
  const downloadUrl = out ? out.direct_url ?? `${API_BASE}${out.url}` : undefined

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
          {job.prompt ? <PromptText text={job.prompt} /> : '（无提示词）'}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={job.status} />
          <span className="text-xs text-muted-foreground/50">{formatTime(job.CreatedAt)}</span>
        </div>
      </div>

      <div className="bg-card min-h-[64px] flex items-center">
        {isActive && (
          <div className="flex items-center justify-center w-full py-8">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 size={20} className="animate-spin" />
              <p className="text-xs">{job.status === 'pending' ? '等待 worker 处理…' : 'AI 生成中…'}</p>
            </div>
          </div>
        )}

        {!isActive && job.status === 'failed' && (
          <div className="flex items-center gap-2 text-destructive px-4 py-4">
            <AlertCircle size={14} />
            <p className="text-sm">{job.error_msg || '生成失败'}</p>
          </div>
        )}

        {!isActive && job.status === 'succeeded' && out && (
          <div className="relative w-full h-48 bg-muted flex items-center justify-center overflow-hidden">
            {out.type === 'video' ? (
              out.direct_url
                ? <video src={downloadUrl} className="max-w-full max-h-full object-contain" muted playsInline preload="metadata" />
                : <AuthedVideo src={`${API_BASE}${out.url}`} className="max-w-full max-h-full object-contain" muted playsInline preload="metadata" />
            ) : out.direct_url ? (
              <img src={downloadUrl} alt={out.name} className="max-w-full max-h-full object-contain" />
            ) : (
              <AuthedImage src={`${API_BASE}${out.url}`} alt={out.name} className="max-w-full max-h-full object-contain" />
            )}
            {downloadUrl && (
              <a
                href={downloadUrl}
                download={out.name}
                className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-foreground/80 text-background px-3 py-1.5 rounded-full text-xs hover:bg-foreground backdrop-blur-sm transition-colors"
              >
                <Download size={11} /> 下载
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Grid view thumbnail ───────────────────────────────────────────────────────

function JobGridThumb({ job }: { job: GenJob }) {
  const isActive = job.status === 'pending' || job.status === 'running'
  const out = job.output_resource as RawResource | undefined

  return (
    <div className="bg-background rounded-lg border border-border overflow-hidden">
      {/* 4:3 media area */}
      <div className="relative w-full aspect-[4/3] bg-muted">
        {isActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <Loader2 size={18} className="animate-spin" />
            <p className="text-[10px]">{job.status === 'pending' ? '排队中' : '生成中'}</p>
          </div>
        )}
        {!isActive && job.status === 'failed' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-destructive">
            <AlertCircle size={16} />
            <p className="text-[10px]">失败</p>
          </div>
        )}
        {!isActive && job.status === 'succeeded' && out && (
          <MediaViewer resource={out} className="absolute inset-0 w-full h-full" lightbox />
        )}
      </div>

      {/* Caption */}
      <div className="px-2 py-1.5">
        <p className="text-[10px] text-muted-foreground truncate">
          {job.prompt ? <PromptText text={job.prompt} /> : '（无提示词）'}
        </p>
        <p className="text-[9px] text-muted-foreground/50 mt-0.5">{formatTime(job.CreatedAt)}</p>
      </div>
    </div>
  )
}

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({
  label,
  jobs,
  viewMode,
}: {
  label: string
  jobs: GenJob[]
  viewMode: 'grid' | 'list'
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
            {jobs.map((job) => <JobGridThumb key={job.ID} job={job} />)}
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => <JobListCard key={job.ID} job={job} />)}
          </div>
        )
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GenJobsPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [activeCategory, setActiveCategory] = useState('all')

  const hasActiveJobs = (jobs: GenJob[]) =>
    jobs.some((j) => j.status === 'pending' || j.status === 'running')

  const { data: jobs = [], isLoading } = useQuery<GenJob[]>({
    queryKey: ['gen-jobs'],
    queryFn: () => api.get('/gen-jobs?limit=200').then((r) => r.data),
    refetchInterval: (query) => {
      const data = query.state.data as GenJob[] | undefined
      return data && hasActiveJobs(data) ? 3000 : 30000
    },
  })

  const filtered = filterJobs(jobs, activeCategory)

  // Group by category for "all" view
  const grouped: { key: string; label: string; jobs: GenJob[] }[] =
    activeCategory === 'all'
      ? CATEGORIES.filter((c) => c.key !== 'all').map((c) => ({
          key: c.key,
          label: c.label,
          jobs: filterJobs(jobs, c.key),
        })).filter((g) => g.jobs.length > 0)
      : []

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-background shrink-0">
        <h1 className="text-sm font-semibold text-foreground">生成记录</h1>
        <span className="text-xs text-muted-foreground">{jobs.length} 条</span>
        {hasActiveJobs(jobs) && (
          <span className="flex items-center gap-1 text-xs text-blue-600">
            <Loader2 size={11} className="animate-spin" /> 生成中…
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
            title="缩略图"
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
            title="列表"
          >
            <List size={13} />
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-1 px-5 py-2 border-b border-border bg-background shrink-0 overflow-x-auto">
        {CATEGORIES.map((cat) => {
          const count = cat.key === 'all' ? jobs.length : filterJobs(jobs, cat.key).length
          if (cat.key !== 'all' && count === 0) return null
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
              {cat.label}
              <span className={cn(
                'text-[10px] font-semibold tabular-nums',
                activeCategory === cat.key ? 'text-background/70' : 'text-muted-foreground/60'
              )}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">加载中…</div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground/50">
            <Wand2 size={32} className="mb-3 opacity-30" />
            <p className="text-sm">还没有生成记录</p>
            <p className="text-xs mt-1">在工具页提交生成任务</p>
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
              />
            ))}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filtered.map((job) => <JobGridThumb key={job.ID} job={job} />)}
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((job) => <JobListCard key={job.ID} job={job} />)}
          </div>
        )}
      </div>
    </div>
  )
}
