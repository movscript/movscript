import { GitBranch, Route } from 'lucide-react'
import { Button } from '@movscript/ui'

export function ProductionProposalReviewEmptyState({ onSwitchToStructure }: { onSwitchToStructure: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-lg border border-dashed border-border bg-background p-6">
        <div className="flex items-start gap-3">
          <GitBranch size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="type-body font-semibold text-foreground">当前没有 AI 编排提案</h2>
            <p className="mt-1 type-label leading-5 text-muted-foreground">
              这里显示 AI 给出的编排提案。可以逐条接受、退回，或者回到编排写作区继续编辑编排段和情节。
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" className="gap-1.5 type-label" onClick={onSwitchToStructure}>
            <Route size={12} />
            回到编排写作
          </Button>
        </div>
      </div>
    </div>
  )
}
