import type { AgentConversationProjection } from '@/features/agent/domain/agentConversationProjectionTypes'
import { latestPlanFromTimelineItems } from '@/features/agent/domain/agentTimelinePlan'
import type { AgentPlan, AgentRun, AgentTimelineItem } from '@/shared/infrastructure/providerSessionClient'

export interface AgentChatThreadViewStateInput {
  activeRun: AgentRun | null
  conversationProjection: AgentConversationProjection
  hasTranscriptMessages: boolean
  timelineItems: AgentTimelineItem[]
  timelineLoading: boolean
}

export interface AgentChatThreadViewState {
  conversationStarted: boolean
  currentPlan?: AgentPlan
  showTimelineLoading: boolean
}

export function buildAgentChatThreadViewState({
  activeRun,
  conversationProjection,
  hasTranscriptMessages,
  timelineItems,
  timelineLoading,
}: AgentChatThreadViewStateInput): AgentChatThreadViewState {
  const hasProjectionItems = conversationProjection.items.length > 0
  return {
    conversationStarted: hasTranscriptMessages || hasProjectionItems,
    currentPlan: latestPlanFromTimelineItems(timelineItems),
    showTimelineLoading: timelineLoading
      && !hasTranscriptMessages
      && !activeRun
      && !hasProjectionItems,
  }
}
