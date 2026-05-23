import type { LucideIcon } from 'lucide-react'
import { AppKeyValue, ReviewCallout, ReviewStat, type ReviewTone } from '@movscript/ui'

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
  const tone = productionProposalReviewTone(status.tone)
  return (
    <ReviewCallout tone={tone}>
      <div className="flex flex-wrap items-center gap-2">
        <Icon size={14} className={cn('shrink-0', status.iconClassName)} />
        <p className="type-label font-semibold">{status.label}</p>
        <ReviewStat tone="neutral" className="rounded-full bg-background/70 px-2 py-0.5 font-medium">{status.title}</ReviewStat>
      </div>
      <p className="mt-1 type-caption leading-4 opacity-85">{status.detail}</p>
    </ReviewCallout>
  )
}

function ProductionProposalMetric({ icon: Icon, label, value }: ProductionProposalReviewMetric) {
  return (
    <AppKeyValue
      label={(
        <span className="flex items-center gap-1.5">
          <Icon size={12} />
          {label}
        </span>
      )}
      value={value}
      strong
    />
  )
}

function productionProposalReviewTone(tone: ProductionProposalReviewStatus['tone']): ReviewTone {
  if (tone === 'ok') return 'success'
  if (tone === 'warn') return 'warning'
  if (tone === 'danger') return 'danger'
  return 'neutral'
}
