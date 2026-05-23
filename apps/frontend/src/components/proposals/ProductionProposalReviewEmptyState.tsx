import { GitBranch, Route } from 'lucide-react'
import { AppEmptyState, Button } from '@movscript/ui'

export function ProductionProposalReviewEmptyState({ onSwitchToStructure }: { onSwitchToStructure: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-4">
      <AppEmptyState
        icon={GitBranch}
        title="当前没有 AI 编排提案"
        detail="这里显示 AI 给出的编排提案。提案模式下正式项目保持只读；如果暂时不处理提案，可以退出提案模式回到正式编排。"
        compact
        className="w-full max-w-2xl"
        action={
          <Button size="sm" className="gap-1.5 type-label" onClick={onSwitchToStructure}>
            <Route size={12} />
            退出提案模式
          </Button>
        }
      />
    </div>
  )
}
