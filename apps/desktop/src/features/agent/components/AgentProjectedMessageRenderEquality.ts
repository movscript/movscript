import { shallowReferenceArrayEqual } from '@/features/agent/components/AgentRenderEquality'
import type { AgentConversationProjectionContentItem } from '@/features/agent/domain/agentConversationProjectionTypes'

type ProjectedMessageItem = Extract<AgentConversationProjectionContentItem, { type: 'message' }>['item']

export function agentProjectedTranscriptMessageItemHasInteractionRuns(item: ProjectedMessageItem): boolean {
  return !!item.activity.embeddedInteractionRun
}

export function agentProjectedTranscriptMessageItemsEqual(
  prev: ProjectedMessageItem,
  next: ProjectedMessageItem,
): boolean {
  return prev.message === next.message
    && prev.activity.timelineActivity === next.activity.timelineActivity
    && prev.activity.embeddedInteractionRun === next.activity.embeddedInteractionRun
    && shallowReferenceArrayEqual(prev.activity.embeddedInteractionEvents, next.activity.embeddedInteractionEvents)
}
