import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface ProductionProposalReviewStatus {
  tone: 'neutral' | 'ok' | 'warn' | 'danger'
  icon: LucideIcon
  iconClassName?: string
  label: string
  title: string
  detail: string
}

export interface ProductionProposalReviewMetric {
  icon: LucideIcon
  label: string
  value: string
}

export function ProductionProposalReviewHeader({
  summary,
  status,
  metrics,
}: {
  summary?: string
  status: ProductionProposalReviewStatus
  metrics: ProductionProposalReviewMetric[]
}) {
  return (
    <div className="mt-3 border-b border-border pb-4">
      {summary ? (
        <p className="mt-3 type-caption leading-4 text-muted-foreground">{summary}</p>
      ) : null}
      <div className="mt-4">
        <ProductionProposalStatusCard status={status} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => (
          <ProductionProposalMetric key={metric.label} {...metric} />
        ))}
      </div>
    </div>
  )
}

function ProductionProposalStatusCard({
  status,
}: {
  status: ProductionProposalReviewStatus
}) {
  const Icon = status.icon
  const toneClass = status.tone === 'ok'
    ? 'border-emerald-200 bg-emerald-50/60 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300'
    : status.tone === 'warn'
      ? 'border-amber-200 bg-amber-50/60 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300'
      : status.tone === 'danger'
        ? 'border-rose-200 bg-rose-50/60 text-rose-700 dark:border-rose-800/50 dark:bg-rose-950/30 dark:text-rose-300'
        : 'border-border bg-background text-muted-foreground'
  return (
    <div className={cn('rounded-lg border p-3', toneClass)}>
      <div className="flex flex-wrap items-center gap-2">
        <Icon size={13} className={cn('shrink-0', status.iconClassName)} />
        <p className="type-label font-semibold">{status.label}</p>
        <span className="rounded-full bg-background/70 px-2 py-0.5 type-tiny font-medium">{status.title}</span>
      </div>
      <p className="mt-1 type-caption leading-4 opacity-85">{status.detail}</p>
    </div>
  )
}

function ProductionProposalMetric({ icon: Icon, label, value }: ProductionProposalReviewMetric) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-2 type-label">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon size={12} />
        {label}
      </span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}
