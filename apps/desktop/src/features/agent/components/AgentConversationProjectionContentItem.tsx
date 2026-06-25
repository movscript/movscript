import {
  AgentProjectedAssistantStreamBubble,
  AgentProjectedThinkingBubble,
} from '@/features/agent/components/AgentProjectedLiveBubbles'
import { AgentProjectedMessageBubble } from '@/features/agent/components/AgentProjectedMessageBubble'
import {
  AgentProjectedRunActivityBubble,
  AgentProjectedRunInteractionBubble,
} from '@/features/agent/components/AgentProjectedRunBubbles'
import type { AgentConversationProjectionContentItem } from '@/features/agent/domain/agentConversationProjectionTypes'
import type { AgentConversationProjectionActions } from '@/features/agent/components/AgentConversationProjectionActions'

export interface AgentConversationProjectionContentItemViewProps extends AgentConversationProjectionActions {
  hiddenActivityActionItemIds: Set<string>
  item: AgentConversationProjectionContentItem
  projectId?: number
}

export function AgentConversationProjectionContentItemView({
  approvingActiveRun,
  hiddenActivityActionItemIds,
  item,
  projectId,
  onAnswerRunInput,
  onApproveRun,
  onRejectRun,
}: AgentConversationProjectionContentItemViewProps) {
  if (item.type === 'message') {
    return (
      <AgentProjectedMessageBubble
        item={item.item}
        projectId={projectId}
        hiddenActivityActionItemIds={hiddenActivityActionItemIds}
        approvingActiveRun={approvingActiveRun}
        onApproveRun={onApproveRun}
        onRejectRun={onRejectRun}
        onAnswerRunInput={onAnswerRunInput}
      />
    )
  }
  if (item.type === 'assistant_stream') return <AgentProjectedAssistantStreamBubble item={item} />
  if (item.type === 'run_activity') {
    return (
      <AgentProjectedRunActivityBubble
        item={item}
        hiddenActivityActionItemIds={hiddenActivityActionItemIds}
        approvingActiveRun={approvingActiveRun}
        onApproveRun={onApproveRun}
        onRejectRun={onRejectRun}
        onAnswerRunInput={onAnswerRunInput}
      />
    )
  }
  if (item.type === 'run_interaction') {
    return (
      <AgentProjectedRunInteractionBubble
        item={item}
        approvingActiveRun={approvingActiveRun}
        onApproveRun={onApproveRun}
        onRejectRun={onRejectRun}
        onAnswerRunInput={onAnswerRunInput}
      />
    )
  }
  return <AgentProjectedThinkingBubble item={item} />
}
