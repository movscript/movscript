import { CheckCircle2, Circle, Dot, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AgentPlan, AgentPlanTaskStatus, AgentPlanRevision } from '@/lib/localAgentClient'

export function AgentCurrentPlanPanel({ plan }: { plan?: AgentPlan }) {
  if (!plan || plan.items.length === 0) return null
  const pct = plan.totalCount > 0 ? Math.round((plan.completedCount / plan.totalCount) * 100) : 0
  return (
    <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
      <div className="rounded-md border border-border bg-muted/20 p-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <ListChecks size={14} className="shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="type-caption font-medium text-foreground">Plan</p>
              {plan.explanation && <p className="truncate type-micro text-muted-foreground">{plan.explanation}</p>}
            </div>
          </div>
          <span className="shrink-0 type-micro text-muted-foreground">{plan.completedCount}/{plan.totalCount} · {pct}%</span>
        </div>
        <div className="mt-2 space-y-1">
          {plan.items.map((item, index) => (
            <PlanItemRow key={`${index}-${item.step}`} step={item.step} status={item.status} compact />
          ))}
        </div>
      </div>
    </div>
  )
}

export function AgentPlanRevisionCard({ revision }: { revision: AgentPlanRevision }) {
  const plan = revision.snapshot
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ListChecks size={15} className="shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="type-label font-medium text-foreground">Plan updated</p>
            {revision.explanation && <p className="mt-0.5 type-tiny text-muted-foreground">{revision.explanation}</p>}
          </div>
        </div>
        <span className="shrink-0 type-micro text-muted-foreground">{plan.completedCount}/{plan.totalCount}</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {plan.items.map((item, index) => (
          <PlanItemRow key={`${index}-${item.step}`} step={item.step} status={item.status} />
        ))}
      </div>
    </div>
  )
}

function PlanItemRow({
  step,
  status,
  compact = false,
}: {
  step: string
  status: AgentPlanTaskStatus
  compact?: boolean
}) {
  return (
    <div className={cn('flex min-w-0 items-start gap-2 text-muted-foreground', compact ? 'type-micro' : 'type-tiny')}>
      <PlanStatusIcon status={status} />
      <span className={cn(
        'min-w-0 flex-1 leading-snug',
        status === 'completed' ? 'text-muted-foreground line-through decoration-muted-foreground/50' : 'text-foreground',
      )}>
        {step}
      </span>
    </div>
  )
}

function PlanStatusIcon({ status }: { status: AgentPlanTaskStatus }) {
  if (status === 'completed') return <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />
  if (status === 'in_progress') return <Dot size={16} className="mt-0.5 shrink-0 text-primary" />
  return <Circle size={12} className="mt-1 shrink-0 text-muted-foreground" />
}
