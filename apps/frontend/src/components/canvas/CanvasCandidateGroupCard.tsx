import type { LucideIcon } from 'lucide-react'
import {
  Check,
  ChevronRight,
  Circle,
  FileText,
  Layers,
  MoreHorizontal,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Button } from '@movscript/ui'
import type { CanvasEntityKind } from '@/types'
import { cn } from '@/lib/utils'
import { ENTITY_KIND_META } from '@/components/entity/EntitySurface'

export type CandidateDecision = 'selected' | 'pending' | 'rejected'

export type CandidateItem = {
  id: string
  kind: CanvasEntityKind
  title: string
  summary: string
  confidence?: number
  decision: CandidateDecision
  tags?: string[]
}

export interface CanvasCandidateGroupCardProps {
  title: string
  subtitle?: string
  sourceLabel: string
  status?: string
  selected?: boolean
  candidates: CandidateItem[]
  primaryActionLabel?: string
  secondaryActionLabel?: string
  className?: string
}

export function CanvasCandidateGroupCard({
  title,
  subtitle,
  sourceLabel,
  status,
  selected,
  candidates,
  primaryActionLabel = '创建选中实体',
  secondaryActionLabel = '重新生成',
  className,
}: CanvasCandidateGroupCardProps) {
  const selectedCount = candidates.filter((item) => item.decision === 'selected').length
  const pendingCount = candidates.filter((item) => item.decision === 'pending').length
  const rejectedCount = candidates.filter((item) => item.decision === 'rejected').length

  return (
    <div
      className={cn(
        'relative w-[330px] overflow-visible rounded-lg border bg-card text-xs shadow-sm transition-all',
        selected ? 'border-primary shadow-lg shadow-primary/10 ring-2 ring-primary/15' : 'border-border',
        className,
      )}
    >
      <header className="border-b border-border bg-emerald-500/10 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background/80">
            <Sparkles size={15} className="text-emerald-600" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none text-emerald-700 dark:text-emerald-300">
                候选
              </span>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold leading-5 text-foreground">{title}</p>
              {status && (
                <span className="shrink-0 rounded border border-border bg-background/85 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">
                  {status}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {subtitle ?? sourceLabel}
            </p>
          </div>
          <Button size="icon-xs" variant="ghost" className="h-6 w-6 shrink-0" aria-label="More">
            <MoreHorizontal size={13} />
          </Button>
        </div>
      </header>

      <div className="space-y-2.5 px-3 py-2.5">
        <div className="grid grid-cols-3 gap-1.5">
          <Metric label="选中" value={selectedCount} tone="selected" />
          <Metric label="待定" value={pendingCount} tone="pending" />
          <Metric label="放弃" value={rejectedCount} tone="rejected" />
        </div>

        <div className="space-y-1.5">
          {candidates.slice(0, 5).map((candidate) => (
            <CandidateRow key={candidate.id} candidate={candidate} />
          ))}
        </div>
      </div>

      <footer className="border-t border-border/70 px-3 py-2">
        <div className="flex items-center gap-2">
          <Button size="xs" className="h-7 flex-1 justify-center" disabled={selectedCount === 0}>
            <Check size={12} />
            {primaryActionLabel}
          </Button>
          <Button size="xs" variant="outline" className="h-7 shrink-0">
            <RefreshCw size={12} />
            {secondaryActionLabel}
          </Button>
        </div>
      </footer>
    </div>
  )
}

function CandidateRow({ candidate }: { candidate: CandidateItem }) {
  const cfg = ENTITY_KIND_META[candidate.kind]
  const Icon = cfg.icon
  return (
    <div
      data-output-port-id={candidate.decision === 'selected' ? `candidate:${candidate.id}` : undefined}
      className={cn(
        'relative rounded-md border bg-background px-2 py-1.5',
        candidate.decision === 'selected' && 'border-emerald-500/35 bg-emerald-500/[0.06]',
        candidate.decision === 'pending' && 'border-border',
        candidate.decision === 'rejected' && 'border-border bg-muted/20 opacity-65',
      )}
    >
      <div className="flex items-start gap-2">
        <DecisionMark decision={candidate.decision} />
        <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded', cfg.accentSoft)}>
          <Icon size={11} className={cfg.activeColor} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground">{candidate.title}</p>
            {candidate.confidence !== undefined && (
              <span className="shrink-0 rounded border border-border bg-card px-1 py-0.5 text-[9px] leading-none text-muted-foreground">
                {Math.round(candidate.confidence * 100)}%
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-foreground">{candidate.summary}</p>
          {(candidate.tags?.length ?? 0) > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {candidate.tags?.slice(0, 3).map((tag) => (
                <span key={tag} className="rounded border border-border bg-card px-1 py-0.5 text-[9px] leading-none text-muted-foreground">{tag}</span>
              ))}
            </div>
          )}
        </div>
        <ChevronRight size={12} className="mt-1 shrink-0 text-muted-foreground" />
      </div>
    </div>
  )
}

function DecisionMark({ decision }: { decision: CandidateDecision }) {
  if (decision === 'selected') {
    return (
      <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <Check size={10} />
      </span>
    )
  }
  if (decision === 'rejected') {
    return (
      <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground">
        <Trash2 size={9} />
      </span>
    )
  }
  return (
    <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
      <Circle size={8} />
    </span>
  )
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'selected' | 'pending' | 'rejected' }) {
  return (
    <div className={cn(
      'rounded-md border px-2 py-1.5',
      tone === 'selected' && 'border-emerald-500/25 bg-emerald-500/10',
      tone === 'pending' && 'border-border bg-background',
      tone === 'rejected' && 'border-border bg-muted/30',
    )}>
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}

function PortDot({
  side,
  tone,
  label,
  compact,
  className,
}: {
  side: 'left' | 'right'
  tone: 'target' | 'source' | 'muted'
  label: string
  compact?: boolean
  className?: string
}) {
  return (
    <span
      title={label}
      className={cn(
        'absolute z-20 -translate-y-1/2 rounded-full border-2 bg-card shadow-sm',
        compact ? 'top-1/2 h-3 w-3' : 'h-3.5 w-3.5',
        side === 'left' ? '-left-1.5' : '-right-1.5',
        tone === 'target' && 'border-sky-500 bg-sky-500/90',
        tone === 'source' && 'border-primary bg-primary/90',
        tone === 'muted' && 'border-border bg-muted',
        className,
      )}
      aria-hidden="true"
    />
  )
}
