import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@movscript/ui'
import { cn } from '@/lib/utils'

interface DetailHeroProps {
  eyebrow?: ReactNode
  title: string
  description?: string
  meta?: ReactNode
  tone?: 'sky' | 'violet' | 'blue' | 'emerald' | 'amber' | 'rose' | 'neutral'
  onClose?: () => void
  onDelete?: () => void
  deleteLabel: string
  closeLabel: string
}

const TONE_CLASS: Record<NonNullable<DetailHeroProps['tone']>, string> = {
  sky: 'from-sky-500/14 via-background to-background border-sky-500/20',
  violet: 'from-violet-500/14 via-background to-background border-violet-500/20',
  blue: 'from-blue-500/14 via-background to-background border-blue-500/20',
  emerald: 'from-emerald-500/14 via-background to-background border-emerald-500/20',
  amber: 'from-amber-500/16 via-background to-background border-amber-500/20',
  rose: 'from-rose-500/14 via-background to-background border-rose-500/20',
  neutral: 'from-muted/70 via-background to-background border-border',
}

export function DetailHero({
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

  return (
    <header className={cn('shrink-0 border-b bg-gradient-to-r px-5 py-4', TONE_CLASS[tone])}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <div className="mb-2 flex min-h-6 flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {eyebrow}
            </div>
          )}
          <h2 className="truncate text-xl font-semibold leading-7 text-foreground">{title}</h2>
          {body && <p className="mt-1 line-clamp-2 max-w-3xl text-sm leading-5 text-muted-foreground">{body}</p>}
          {meta && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{meta}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="text-xs text-muted-foreground transition-colors hover:text-destructive"
            >
              {deleteLabel}
            </button>
          )}
          {onClose && (
            <Button variant="outline" size="icon-sm" onClick={onClose} title={closeLabel} aria-label={closeLabel}>
              <X size={14} />
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}

export function HeroPill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex max-w-full items-center rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-xs font-medium text-foreground', className)}>
      <span className="truncate">{children}</span>
    </span>
  )
}

export function HeroMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/70 px-2 py-1">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </span>
  )
}

function compactText(value?: string) {
  return value?.replace(/\s+/g, ' ').trim()
}
