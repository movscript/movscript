import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { splitResourceMentionParts } from '@movscript/workspace'
import { Cpu, Paperclip, SlidersHorizontal } from 'lucide-react'
import { MediaViewer } from '@movscript/resource-surface/resource-media-viewer'
import type { Job, RawResource } from '@/types'
import { readCachedResourceById } from '@movscript/resource-surface/data'
import {
  GenerationContextMeta,
  GenerationContextRow,
  GenerationContextSummary,
  GenerationContextValue,
  GenerationContextValueList,
  GenerationInlineResourceChip,
  GenerationResultCard
} from '@movscript/ui/business/generation'

// ── PromptText ────────────────────────────────────────────────────────────────
// Renders a prompt string, replacing @[resource:ID] tokens with inline thumbnails.

function ResourceChip({ id }: { id: number }) {
  const qc = useQueryClient()
  const resource = readCachedResourceById(qc, id)

  if (!resource) {
    return (
      <GenerationInlineResourceChip className="generation-result-resource-chip--prompt" label={`#${id}`} />
    )
  }

  return (
    <GenerationInlineResourceChip
      className="generation-result-resource-chip--prompt"
      label={resource.name}
      media={<MediaViewer resource={resource} lightbox={false} thumbnailMaxSize={96} />}
    />
  )
}

export function PromptText({ text, className }: { text: string; className?: string }) {
  const parts = splitResourceMentionParts(text)
  return (
    <span className={className}>
      {parts.map((part) => {
        if (part.type === 'resource') return <ResourceChip key={part.key} id={part.resourceId} />
        return <span key={part.key}>{part.text}</span>
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
  outputType: 'image' | 'video' | 'audio'
  error?: string
  timestamp?: string
  onReuse?: () => void
  contextPanel?: React.ReactNode
  debugPanel?: React.ReactNode
  compact?: boolean
  largePreview?: boolean
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
  largePreview = false,
  className,
}: GenResultCardProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const timestampLabel = timestamp ? formatGenTime(timestamp, t, locale) : undefined

  const statusLabel: Record<string, string> = {
    pending: t('pages.jobs.status.pending'),
    running: t('pages.jobs.status.running'),
    done: t('canvas.status.done'),
    failed: t('canvas.status.failed'),
    cancelled: t('pages.jobs.status.cancelled'),
    idle: t('canvas.status.notRun'),
  }

  return (
    <GenerationResultCard
      prompt={prompt ? <PromptText text={prompt} /> : undefined}
      status={status}
      statusLabel={statusLabel[status]}
      timestampLabel={timestampLabel}
      loadingLabel={status === 'pending' ? t('shared.generation.waitingStart') : t('pages.jobs.generating')}
      failedLabel={error ?? t('pages.jobs.generationFailed')}
      cancelledLabel={error ?? t('pages.jobs.taskCancelled')}
      output={outputResource ? (
        <MediaViewer
          resource={outputResource}
          fit="contain"
          lightbox
        />
      ) : undefined}
      contextPanel={contextPanel}
      debugPanel={debugPanel}
      reuseTitle={t('shared.genResult.reusePrompt')}
      compact={compact}
      largePreview={largePreview}
      className={className}
      onReuse={onReuse}
    />
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
    job.model_id ||
    ''
  const identifier = snapshot?.model?.identifier ||
    job.model_identifier ||
    job.model_id ||
    ''
  const provider = snapshot?.model?.provider_name || job.provider_name || ''
  return { name, identifier, provider }
}

function ResourceContextChip({ resource }: { resource: ContextResource }) {
  const hasURL = 'url' in resource && !!resource.url
  return (
    <GenerationInlineResourceChip
      label={resourceName(resource)}
      media={hasURL ? (
        <MediaViewer resource={resource as RawResource} lightbox={false} />
      ) : (
        <Paperclip size={10} className="m-[3px] text-muted-foreground" />
      )}
    />
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
    <GenerationContextSummary className={className}>
      {hasModel && (
        <GenerationContextRow
          icon={<Cpu size={12} />}
          label={t('shared.genResult.context.model')}
        >
          <GenerationContextValue>{includeProvider && model.provider ? `${model.provider} / ` : ''}{model.name}</GenerationContextValue>
          {model.identifier && model.identifier !== model.name && (
            <GenerationContextMeta>{model.identifier}</GenerationContextMeta>
          )}
        </GenerationContextRow>
      )}

      {resources.length > 0 && (
        <GenerationContextRow
          className="generation-result-context-row--start"
          icon={<Paperclip size={12} />}
          label={t('shared.genResult.context.resources')}
        >
          <GenerationContextValueList>
            {resources.map((resource, index) => (
              <ResourceContextChip key={`${resourceID(resource)}-${index}`} resource={resource} />
            ))}
          </GenerationContextValueList>
        </GenerationContextRow>
      )}

      {hasParams && (
        <GenerationContextRow
          className="generation-result-context-row--start"
          icon={<SlidersHorizontal size={12} />}
          label={t('shared.genResult.context.params')}
        >
          <GenerationContextValueList>
            {Object.entries(params).map(([key, value]) => (
              <GenerationContextMeta key={key}>
                {key}: {String(value)}
              </GenerationContextMeta>
            ))}
          </GenerationContextValueList>
        </GenerationContextRow>
      )}
    </GenerationContextSummary>
  )
}
