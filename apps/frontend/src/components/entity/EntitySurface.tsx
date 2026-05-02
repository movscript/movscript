import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Database, FileText, Image } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CanvasEntityKind, EntityWorkflowSchema, EntityWorkflowSchemaField } from '@/types'
import { cn } from '@/lib/utils'

export type EntitySurface = 'content' | 'workbench' | 'canvas'
export type EntityTone = 'sky' | 'violet' | 'blue' | 'emerald' | 'amber' | 'rose' | 'teal' | 'indigo' | 'orange' | 'neutral'

export const ENTITY_KIND_META: Record<CanvasEntityKind, {
  labelKey: string
  icon: LucideIcon
  tone: EntityTone
  accent: string
  accentSoft: string
  activeColor: string
}> = {
  script:      { labelKey: 'entities.scripts',      icon: FileText,     tone: 'sky',     accent: 'bg-sky-500',     accentSoft: 'bg-sky-500/10',     activeColor: 'text-sky-600' },
  setting:     { labelKey: 'entities.settings',     icon: Database,     tone: 'teal',    accent: 'bg-teal-500',    accentSoft: 'bg-teal-500/10',    activeColor: 'text-teal-600' },
  asset_slot:  { labelKey: 'entities.assetSlots',   icon: Image,        tone: 'amber',   accent: 'bg-amber-500',   accentSoft: 'bg-amber-500/10',   activeColor: 'text-amber-600' },
}

export const ENTITY_TONE_CLASS: Record<EntityTone, string> = {
  sky: 'border-sky-500/20 bg-sky-500/[0.04]',
  violet: 'border-violet-500/20 bg-violet-500/[0.04]',
  blue: 'border-blue-500/20 bg-blue-500/[0.04]',
  emerald: 'border-emerald-500/20 bg-emerald-500/[0.04]',
  amber: 'border-amber-500/20 bg-amber-500/[0.05]',
  rose: 'border-rose-500/20 bg-rose-500/[0.04]',
  teal: 'border-teal-500/20 bg-teal-500/[0.04]',
  indigo: 'border-indigo-500/20 bg-indigo-500/[0.04]',
  orange: 'border-orange-500/20 bg-orange-500/[0.05]',
  neutral: 'border-border bg-background',
}

interface EntitySurfaceHeaderProps {
  surface: EntitySurface
  kind: CanvasEntityKind
  title: ReactNode
  description?: ReactNode
  eyebrow?: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  nodeBadge?: ReactNode
  tone?: EntityTone
  className?: string
}

export function EntitySurfaceHeader({
  surface,
  kind,
  title,
  description,
  eyebrow,
  meta,
  actions,
  nodeBadge,
  tone,
  className,
}: EntitySurfaceHeaderProps) {
  const { t } = useTranslation()
  const cfg = ENTITY_KIND_META[kind]
  const Icon = cfg.icon
  const isWorkbench = surface === 'workbench'

  return (
    <header
      className={cn(
        'shrink-0 border-b',
        isWorkbench ? 'flex h-11 items-center justify-between gap-3 bg-background px-3' : 'px-4 py-2.5',
        !isWorkbench && ENTITY_TONE_CLASS[tone ?? cfg.tone],
        className
      )}
    >
      <div className={cn('flex min-w-0 flex-1 items-center', isWorkbench ? 'gap-3' : 'gap-2.5')}>
        <span className={cn('flex shrink-0 items-center justify-center rounded', isWorkbench ? 'h-7 w-7' : 'h-8 w-8', cfg.accentSoft)}>
          <Icon size={isWorkbench ? 14 : 15} className={cfg.activeColor} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shrink-0 rounded border border-border bg-background/80 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
              {t(cfg.labelKey)}
            </span>
            {eyebrow}
            <h1 className={cn('min-w-0 truncate font-semibold text-foreground', isWorkbench ? 'text-sm' : 'text-base leading-6')}>
              {title}
            </h1>
            {nodeBadge}
          </div>
          {(description || meta) && (
            <div className={cn('mt-1 flex min-w-0 items-center gap-2 text-muted-foreground', isWorkbench ? 'text-xs' : 'text-[11px]')}>
              {description && <p className="min-w-0 truncate">{description}</p>}
              {meta && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{meta}</div>}
            </div>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}

export type EntityPreviewField = {
  id: string
  label: string
  summary: string
  hasValue: boolean
  readable: boolean
  writable: boolean
}

export function buildEntityPreviewFields({
  schema,
  values,
  t,
  limit = 3,
}: {
  schema?: EntityWorkflowSchema
  values?: Record<string, unknown>
  t: (key: string, options?: Record<string, unknown>) => string
  limit?: number
}): EntityPreviewField[] {
  if (!schema) return []
  const fields = schema.sections.flatMap((section) => section.fields)
    .filter((field) => !field.deprecated && (field.workflow.readable || field.workflow.writable))
    .map((field) => {
      const value = values?.[field.id]
      const summary = summarizeEntityValue(value)
      return {
        id: field.id,
        label: entityPreviewFieldLabel(schema.kind, field, t),
        summary: summary || t('canvas.entityCard.noValue'),
        hasValue: !!summary,
        readable: field.workflow.readable,
        writable: field.workflow.writable,
      }
    })

  return fields
    .sort((a, b) => Number(b.hasValue) - Number(a.hasValue) || Number(b.readable) - Number(a.readable))
    .slice(0, limit)
}

function entityPreviewFieldLabel(
  kind: CanvasEntityKind,
  field: EntityWorkflowSchemaField,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (kind === 'asset_slot') {
    if (field.id === 'name') return t('details.assetSlotName', { defaultValue: 'Asset slot name' })
    if (field.id === 'prompt_hint') return t('details.promptHint', { defaultValue: 'Prompt hint' })
  }
  return field.labelKey ? t(field.labelKey, { defaultValue: entityFieldFallbackLabel(field) }) : entityFieldFallbackLabel(field)
}

export function EntityPreviewFieldList({
  fields,
  emptyText,
  className,
}: {
  fields: EntityPreviewField[]
  emptyText: ReactNode
  className?: string
}) {
  if (fields.length === 0) {
    return <p className="text-xs italic text-muted-foreground/45">{emptyText}</p>
  }

  return (
    <div className={cn('divide-y divide-border/60 border-t border-border/60', className)}>
      {fields.map((field) => (
        <div key={field.id} className="py-1.5">
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">{field.label}</span>
            {field.readable && <span className="rounded border border-border bg-muted/50 px-1 py-0.5 leading-none text-muted-foreground">out</span>}
            {field.writable && <span className="rounded border border-border bg-muted/50 px-1 py-0.5 leading-none text-muted-foreground">in</span>}
          </div>
          <p className={cn(
            'mt-0.5 text-[11px] leading-snug',
            field.hasValue ? 'line-clamp-1 text-muted-foreground' : 'italic text-muted-foreground/45'
          )}>
            {field.summary}
          </p>
        </div>
      ))}
    </div>
  )
}

function entityFieldFallbackLabel(field: EntityWorkflowSchemaField) {
  return field.fallbackLabel || field.workflow.portId || field.id
}

export function summarizeEntityValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return compactText(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return ''
    const sample = value.slice(0, 3).map(summarizeEntityListItem).filter(Boolean).join(', ')
    return value.length > 3 ? `${sample} +${value.length - 3}` : sample
  }
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>
    const title = item.title ?? item.name ?? item.label ?? item.number ?? item.ID ?? item.id
    if (title !== undefined) return compactText(String(title))
    try {
      return compactText(JSON.stringify(value))
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function summarizeEntityListItem(value: unknown): string {
  if (typeof value === 'number') return `#${value}`
  if (typeof value === 'string') return compactText(value)
  if (typeof value === 'object' && value) {
    const item = value as Record<string, unknown>
    const title = item.title ?? item.name ?? item.label ?? item.number ?? item.ID ?? item.id
    if (title !== undefined) return compactText(String(title))
  }
  return summarizeEntityValue(value)
}

function compactText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}
