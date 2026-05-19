import { Badge } from '@movscript/ui'
import type { AgentProductWorkflowSummary } from '@/lib/agentProductWorkflow'

export function AgentProductWorkflowCard({ summary }: { summary: AgentProductWorkflowSummary }) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-2" data-testid="agent-product-workflow-card">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-foreground">{summary.title}</p>
          <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{summary.description}</p>
        </div>
        <Badge variant={productWorkflowBadgeVariant(summary.stage)} className="shrink-0 text-[9px] leading-4 px-1.5 py-0">
          {summary.primaryAction}
        </Badge>
      </div>
      {summary.contextItems.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {summary.contextItems.map((item) => (
            <Badge key={item} variant="secondary" className="max-w-full truncate text-[9px] leading-4 px-1.5 py-0">
              {item}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

function productWorkflowBadgeVariant(stage: AgentProductWorkflowSummary['stage']): 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' {
  if (stage === 'result_ready') return 'success'
  if (stage === 'failed') return 'destructive'
  if (stage === 'waiting_for_user') return 'warning'
  if (stage === 'cancelled') return 'secondary'
  return 'outline'
}
