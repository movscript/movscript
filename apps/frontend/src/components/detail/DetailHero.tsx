import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@movscript/ui'
import { cn } from '@/lib/utils'
import type { CanvasEntityKind } from '@/types'
import { EntitySurfaceHeader, ENTITY_TONE_CLASS, type EntityTone } from '@/components/entity/EntitySurface'

interface DetailHeroProps {
  kind?: CanvasEntityKind
  eyebrow?: ReactNode
  title: string
  description?: string
  meta?: ReactNode
  tone?: EntityTone
  onClose?: () => void
  onDelete?: () => void
  deleteLabel: string
  closeLabel: string
}

export function DetailHero({
  kind,
  eyebrow,
  title,
  description,
  meta,
  tone = 'neutral',
  onClose,
  onDelete,
  deleteLabel,
  closeLabel,
}: DetailHeroProps) {
  const body = compactText(description)
  const actions = (
    <>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="type-label text-muted-foreground transition-colors hover:text-destructive"
        >
          {deleteLabel}
        </button>
      )}
      {onClose && (
        <Button variant="outline" size="icon-sm" onClick={onClose} title={closeLabel} aria-label={closeLabel}>
          <X size={14} />
        </Button>
      )}
    </>
  )

  if (kind) {
    return (
      <EntitySurfaceHeader
        surface="content"
        kind={kind}
        title={title}
        description={body}
        eyebrow={eyebrow}
        meta={meta}
        tone={tone}
        actions={actions}
      />
    )
  }

  return (
    <header className={cn('shrink-0 border-b px-4 py-2.5', ENTITY_TONE_CLASS[tone])}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {eyebrow && (
            <div className="flex max-w-[38%] shrink-0 items-center gap-1.5 overflow-hidden type-label text-muted-foreground">
              {eyebrow}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-2">
              <h2 className="truncate type-body-lg font-semibold leading-6 text-foreground">{title}</h2>
              {body && <p className="hidden min-w-0 flex-1 truncate type-label text-muted-foreground lg:block">{body}</p>}
            </div>
            {meta && <div className="mt-1 flex flex-wrap items-center gap-1.5 type-caption text-muted-foreground">{meta}</div>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
        </div>
      </div>
    </header>
  )
}

export function HeroPill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex max-w-full items-center rounded border border-border/70 bg-background/80 px-1.5 py-0.5 type-caption font-medium leading-5 text-foreground', className)}>
      <span className="truncate">{children}</span>
    </span>
  )
}

export function HeroMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border/60 bg-background/70 px-1.5 py-0.5 leading-5">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </span>
  )
}

function compactText(value?: string) {
  return value?.replace(/\s+/g, ' ').trim()
}
