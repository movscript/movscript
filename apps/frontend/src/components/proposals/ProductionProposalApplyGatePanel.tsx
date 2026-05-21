import { AlertCircle, CheckCircle2, Eye } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface ProductionProposalApplyGate {
  status: 'ready' | 'blocked' | 'needs_preview' | 'empty'
  title: string
  detail: string
}

export function ProductionProposalApplyGatePanel({
  gate,
  compact = false,
}: {
  gate: ProductionProposalApplyGate
  compact?: boolean
}) {
  const toneClass = gate.status === 'ready'
    ? 'border-emerald-200 bg-emerald-50/60 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300'
    : gate.status === 'blocked'
      ? 'border-rose-200 bg-rose-50/60 text-rose-700 dark:border-rose-800/50 dark:bg-rose-950/30 dark:text-rose-300'
      : gate.status === 'empty'
        ? 'border-border bg-background text-muted-foreground'
        : 'border-amber-200 bg-amber-50/60 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300'
  const Icon = gate.status === 'ready' ? CheckCircle2 : gate.status === 'blocked' ? AlertCircle : Eye
  return (
    <div className={cn('rounded-lg border', compact ? 'p-2.5' : 'p-3', toneClass)}>
      <div className="flex items-center gap-2">
        <Icon size={13} className="shrink-0" />
        <p className="type-label font-semibold">{gate.title}</p>
      </div>
      {!compact && <p className="mt-1 type-caption leading-4 opacity-80">{gate.detail}</p>}
    </div>
  )
}
