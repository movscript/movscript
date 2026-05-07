import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2, AlertCircle, RotateCcw, CheckCircle2, X, Cpu, Paperclip, SlidersHorizontal } from 'lucide-react'
import { AuthedImage, AuthedVideo } from './AuthedImage'
import { MediaViewer } from './MediaViewer'
import { cn } from '@/lib/utils'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import type { Job, RawResource } from '@/types'

// ── PromptText ────────────────────────────────────────────────────────────────
// Renders a prompt string, replacing @[resource:ID] tokens with inline thumbnails.

function ResourceChip({ id }: { id: number }) {
  const qc = useQueryClient()
  const resources = qc.getQueryData<RawResource[]>(['resources']) ?? []
  const resource = resources.find(r => r.ID === id)

  if (!resource) {
    return (
      <span className="inline-flex items-center gap-1 align-middle bg-muted rounded px-1.5 py-0.5 text-[11px] text-muted-foreground mx-0.5">
        #{id}
      </span>
    )
  }

  const url = resource.direct_url ?? `${API_BASE}${resource.url}`
  return (
    <span className="inline-flex items-center gap-1 align-middle bg-muted rounded-md px-1.5 py-0.5 mx-0.5 text-[11px] text-foreground whitespace-nowrap">
      <span className="w-4 h-4 rounded overflow-hidden shrink-0 bg-muted-foreground/20 inline-block">
        {resource.type === 'video' ? (
          resource.direct_url
            ? <video src={url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
            : <AuthedVideo src={url} className="w-full h-full object-cover" muted playsInline preload="metadata" />
        ) : resource.direct_url ? (
          <img src={url} alt={resource.name} className="w-full h-full object-cover" />
        ) : (
          <AuthedImage src={url} alt={resource.name} className="w-full h-full object-cover" />
        )}
      </span>
      <span className="max-w-[80px] truncate">{resource.name}</span>
    </span>
  )
}

export function PromptText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(@\[resource:\d+\])/g)
  return (
    <span className={className}>
      {parts.map((part, i) => {
        const m = part.match(/^@\[resource:(\d+)\]$/)
        if (m) return <ResourceChip key={i} id={Number(m[1])} />
        return <span key={i}>{part}</span>
      })}
    </span>
  )
}

export function formatGenTime(iso: string, t: (key: string, options?: Record<string, unknown>) => string, locale: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return t('pages.jobs.time.justNow')
  if (diff < 3_600_000) return t('pages.jobs.time.minutesAgo', { count: Math.floor(diff / 60_000) })
  if (diff < 86_400_000) return t('pages.jobs.time.hoursAgo', { count: Math.floor(diff / 3_600_000) })
  return new Date(iso).toLocaleDateString(locale)
}

export interface GenResultCardProps {
  prompt?: string
  status: 'idle' | 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
  outputResource?: RawResource
  outputType: 'image' | 'video'
  error?: string
  timestamp?: string
  onReuse?: () => void
  contextPanel?: React.ReactNode
  debugPanel?: React.ReactNode
  compact?: boolean
  className?: string
}

export function GenResultCard({
  prompt,
  status,
  outputResource,
  error,
  timestamp,
  onReuse,
  contextPanel,
  debugPanel,
  compact = false,
  className,
}: GenResultCardProps) {
  const { t, i18n } = useTranslation()
  const isRunning = status === 'pending' || status === 'running'
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'

  const statusLabel: Record<string, string> = {
    pending: t('pages.jobs.status.pending'),
    running: t('pages.jobs.status.running'),
    done: t('canvas.status.done'),
    failed: t('canvas.status.failed'),
    cancelled: t('pages.jobs.status.cancelled'),
    idle: t('canvas.status.notRun'),
  }

  return (
    <div className={cn(
      compact
        ? 'bg-background rounded-lg border border-border/80 shadow-sm overflow-hidden hover:border-border transition-colors'
        : 'bg-background rounded-xl border border-border shadow-sm overflow-hidden',
      className,
    )}>
      {/* Prompt */}
      {prompt && (
        <div className={cn(compact ? 'px-3 pt-3 pb-2' : 'px-4 py-3 border-b border-border')}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0',
                status === 'done' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                isRunning && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                status === 'failed' && 'bg-destructive/10 text-destructive',
                status === 'cancelled' && 'bg-muted text-muted-foreground',
                status === 'idle' && 'bg-muted text-muted-foreground',
              )}>
                {statusLabel[status]}
              </span>
              {timestamp && (
                <span className="text-[11px] text-muted-foreground/60 truncate">{formatGenTime(timestamp, t, locale)}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {status === 'done' && !compact && <CheckCircle2 size={12} className="text-green-500" />}
              {onReuse && (
                <button
                  onClick={onReuse}
                  title={t('shared.genResult.reusePrompt')}
                  className="text-muted-foreground/60 hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
                >
                  <RotateCcw size={13} />
                </button>
              )}
            </div>
          </div>
          <div className="flex items-start justify-between gap-2">
            <p className={cn('text-foreground flex-1 leading-relaxed whitespace-pre-wrap', compact ? 'text-xs line-clamp-3' : 'text-sm')}>
              <PromptText text={prompt} />
            </p>
          </div>
          {timestamp && !compact && (
            <span className="text-xs text-muted-foreground/50">{formatGenTime(timestamp, t, locale)}</span>
          )}
        </div>
      )}

      {contextPanel && (
        <div className={cn('empty:hidden', compact ? 'px-3 pb-2' : 'px-4 py-3 border-b border-border')}>
          {contextPanel}
        </div>
      )}

      {/* Output */}
      <div className={cn(compact ? 'px-3 pb-3 bg-background' : 'bg-card min-h-[80px]')}>
        {isRunning && (
          <div className={cn('flex items-center justify-center rounded-md bg-muted/40', compact ? 'h-24' : 'py-10')}>
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 size={compact ? 16 : 22} className="animate-spin" />
              <p className="text-xs">{status === 'pending' ? t('shared.generation.waitingStart') : t('pages.jobs.generating')}</p>
            </div>
          </div>
        )}

        {!isRunning && status === 'failed' && (
          <div className={cn('flex items-center justify-center gap-2 text-destructive rounded-md bg-destructive/5', compact ? 'min-h-20 px-3 py-4' : 'py-6')}>
            <AlertCircle size={compact ? 12 : 16} />
            <p className={compact ? 'text-xs' : 'text-sm'}>{error ?? t('pages.jobs.generationFailed')}</p>
          </div>
        )}

        {!isRunning && status === 'cancelled' && (
          <div className={cn('flex items-center justify-center gap-2 text-muted-foreground rounded-md bg-muted/40', compact ? 'min-h-20 px-3 py-4' : 'py-6')}>
            <X size={compact ? 12 : 16} />
            <p className={compact ? 'text-xs' : 'text-sm'}>{error ?? t('pages.jobs.taskCancelled')}</p>
          </div>
        )}

        {!isRunning && status === 'done' && outputResource && (
          <MediaCell
            outputResource={outputResource!}
            compact={compact}
          />
        )}
      </div>

      {debugPanel && (
        <div className="px-4 py-3 border-t border-border bg-muted/20">
          {debugPanel}
        </div>
      )}
    </div>
  )
}

type JobContextSnapshot = {
  model?: {
    display_name?: string
    identifier?: string
    provider_name?: string
  }
  params?: {
    aspect_ratio?: string
    duration?: number
    extra_params?: Record<string, unknown>
  }
  input_resources?: Array<{
    id: number
    name: string
    type: RawResource['type'] | string
    mime_type?: string
    size?: number
  }>
}

type ContextResource = RawResource | {
  ID: number
  name: string
  type: RawResource['type'] | string
}

function parseRequestContext(raw?: string): JobContextSnapshot | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as JobContextSnapshot
  } catch {
    return null
  }
}

function parseExtraParams(raw?: string): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function resourceID(resource: ContextResource): number {
  return 'ID' in resource ? resource.ID : 0
}

function resourceName(resource: ContextResource): string {
  return resource.name
}

function getContextResources(job: Job, snapshot: JobContextSnapshot | null): ContextResource[] {
  if (job.input_resources && job.input_resources.length > 0) return job.input_resources
  if (snapshot?.input_resources && snapshot.input_resources.length > 0) {
    return snapshot.input_resources.map((r) => ({ ID: r.id, name: r.name, type: r.type }))
  }
  return []
}

function getContextParams(job: Job, snapshot: JobContextSnapshot | null): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  const snapParams = snapshot?.params
  const aspect = snapParams?.aspect_ratio ?? job.aspect_ratio
  const duration = snapParams?.duration ?? job.duration
  if (aspect) params.aspect_ratio = aspect
  if (duration) params.duration = duration
  Object.assign(params, snapParams?.extra_params ?? parseExtraParams(job.extra_params))
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  )
}

function getModelLabel(job: Job, snapshot: JobContextSnapshot | null) {
  const name = snapshot?.model?.display_name ||
    job.model_display ||
    job.model_config?.custom_display_name ||
    job.model_config?.model_def_id ||
    (job.model_config_id ? `#${job.model_config_id}` : '')
  const identifier = snapshot?.model?.identifier ||
    job.model_identifier ||
    job.model_config?.model_id_override ||
    job.model_config?.model_def_id ||
    ''
  const provider = snapshot?.model?.provider_name || job.provider_name || ''
  return { name, identifier, provider }
}

function ResourceContextChip({ resource }: { resource: ContextResource }) {
  const hasURL = 'url' in resource && !!resource.url
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-foreground min-w-0">
      <span className="h-4 w-4 shrink-0 overflow-hidden rounded bg-muted-foreground/20">
        {hasURL ? (
          <MediaViewer resource={resource as RawResource} className="h-full w-full" lightbox={false} />
        ) : (
          <Paperclip size={10} className="m-[3px] text-muted-foreground" />
        )}
      </span>
      <span className="max-w-[120px] truncate">{resourceName(resource)}</span>
    </span>
  )
}

export function JobContextSummary({ job, className, includeProvider = false }: { job: Job; className?: string; includeProvider?: boolean }) {
  const { t } = useTranslation()
  const snapshot = parseRequestContext(job.request_context)
  const model = getModelLabel(job, snapshot)
  const resources = getContextResources(job, snapshot)
  const params = getContextParams(job, snapshot)
  const hasModel = Boolean(model.name)
  const hasParams = Object.keys(params).length > 0

  if (!hasModel && resources.length === 0 && !hasParams) return null

  return (
    <div className={cn('space-y-1.5 text-[11px]', className)}>
      {hasModel && (
        <div className="flex items-center gap-2 min-w-0">
          <Cpu size={11} className="shrink-0 text-muted-foreground" />
          <span className="w-10 shrink-0 text-muted-foreground">{t('shared.genResult.context.model')}</span>
          <span className="truncate text-foreground">{includeProvider && model.provider ? `${model.provider} / ` : ''}{model.name}</span>
          {model.identifier && model.identifier !== model.name && (
            <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">{model.identifier}</span>
          )}
        </div>
      )}

      {resources.length > 0 && (
        <div className="flex items-start gap-2 min-w-0">
          <Paperclip size={11} className="mt-1 shrink-0 text-muted-foreground" />
          <span className="mt-0.5 w-10 shrink-0 text-muted-foreground">{t('shared.genResult.context.resources')}</span>
          <div className="flex min-w-0 flex-1 flex-wrap gap-1">
            {resources.map((resource, index) => (
              <ResourceContextChip key={`${resourceID(resource)}-${index}`} resource={resource} />
            ))}
          </div>
        </div>
      )}

      {hasParams && (
        <div className="flex items-start gap-2 min-w-0">
          <SlidersHorizontal size={11} className="mt-1 shrink-0 text-muted-foreground" />
          <span className="mt-0.5 w-10 shrink-0 text-muted-foreground">{t('shared.genResult.context.params')}</span>
          <div className="flex min-w-0 flex-1 flex-wrap gap-1">
            {Object.entries(params).map(([key, value]) => (
              <span key={key} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {key}: {String(value)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── MediaCell ─────────────────────────────────────────────────────────────────
// 4:3 container, centered without cropping, opens a lightbox on click.

function MediaCell({
  outputResource,
  compact,
}: {
  outputResource: RawResource
  compact: boolean
}) {
  return (
    <MediaViewer
      resource={outputResource}
      fit="contain"
      className={cn(
        'w-full bg-muted',
        compact ? 'aspect-video rounded-md border border-border/60' : 'aspect-[4/3] rounded-none',
      )}
      lightbox
    />
  )
}
