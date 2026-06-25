import React from 'react'
import { MessageBubble } from '@/features/agent/components/AgentChatBubbles'
import {
  agentProjectedTranscriptMessageItemHasInteractionRuns,
  agentProjectedTranscriptMessageItemsEqual,
} from '@/features/agent/components/AgentProjectedMessageRenderEquality'
import type { AgentConversationProjectionContentItem } from '@/features/agent/domain/agentConversationProjectionTypes'
import type { AgentConversationProjectionActions } from '@/features/agent/components/AgentConversationProjectionActions'

type ProjectedMessageItem = Extract<AgentConversationProjectionContentItem, { type: 'message' }>['item']

interface AgentProjectedMessageBubbleProps extends AgentConversationProjectionActions {
  hiddenActivityActionItemIds: Set<string>
  item: ProjectedMessageItem
  projectId?: number
}

export const AgentProjectedMessageBubble = React.memo(function AgentProjectedMessageBubble({
  hiddenActivityActionItemIds,
  item,
  projectId,
  approvingActiveRun,
  onApproveRun,
  onRejectRun,
  onAnswerRunInput,
}: AgentProjectedMessageBubbleProps) {
  const { message } = item
  const { activity } = item
  return (
    <MessageBubble
      msg={message}
      projectId={projectId}
      timelineActivity={activity.timelineActivity}
      liveInteractionRun={activity.embeddedInteractionRun}
      liveInteractionEvents={activity.embeddedInteractionEvents}
      approvingActiveRun={approvingActiveRun}
      onApproveRun={onApproveRun}
      onRejectRun={onRejectRun}
      onAnswerRunInput={onAnswerRunInput}
      hiddenActivityActionItemIds={hiddenActivityActionItemIds}
    />
  )
}, areAgentProjectedMessageBubblePropsEqual)

function areAgentProjectedMessageBubblePropsEqual(
  prev: AgentProjectedMessageBubbleProps,
  next: AgentProjectedMessageBubbleProps,
) {
  const comparesRunInteractionActions = agentProjectedTranscriptMessageItemHasInteractionRuns(prev.item)
    || agentProjectedTranscriptMessageItemHasInteractionRuns(next.item)
  return agentProjectedTranscriptMessageItemsEqual(prev.item, next.item)
    && prev.hiddenActivityActionItemIds === next.hiddenActivityActionItemIds
    && prev.projectId === next.projectId
    && (!comparesRunInteractionActions || prev.approvingActiveRun === next.approvingActiveRun)
    && (!comparesRunInteractionActions || prev.onApproveRun === next.onApproveRun)
    && (!comparesRunInteractionActions || prev.onRejectRun === next.onRejectRun)
    && (!comparesRunInteractionActions || prev.onAnswerRunInput === next.onAnswerRunInput)
}
