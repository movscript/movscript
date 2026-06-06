import { buildAgentConversationThreadItems } from '@/features/agent/domain/agentConversationThreadItems'
import { finalizeAgentConversationProjection } from '@/features/agent/domain/agentConversationProjectionFinalize'
import { prepareAgentConversationProjectionContext } from '@/features/agent/domain/agentConversationProjectionPrepare'
import { projectionItemsForThreadItems } from '@/features/agent/domain/agentConversationProjectionRunTurns'
import { buildAgentTranscriptMessageItems } from '@/features/agent/domain/agentTranscriptMessageItems'
import type {
  AgentConversationProjection,
  AgentConversationProjectionItem,
} from '@/features/agent/domain/agentConversationProjectionTypes'
import type { AgentConversationProjectionRunInteractions } from '@/features/agent/domain/agentConversationProjectionRunInteractions'
import type { AgentConversationLiveBlock } from '@/features/agent/domain/agentConversationLiveBlocks'
import type { AgentThinkingState } from '@/features/agent/domain/agentThinkingState'
import type { AgentRun, AgentTimelineItem } from '@/shared/infrastructure/providerSessionClient'
import type { ChatMessage } from '@/features/agent/state/agentStore'

export function buildAgentConversationProjection(input: {
  activeRun?: AgentRun | null
  liveBlocks: AgentConversationLiveBlock[]
  runInteractions: AgentConversationProjectionRunInteractions
  suppressedInteractionRunIds?: Set<string>
  thinkingState?: AgentThinkingState
  timelineItems: AgentTimelineItem[]
  transcriptMessages: ChatMessage[]
}): AgentConversationProjection {
  const context = prepareAgentConversationProjectionContext({
    activeRun: input.activeRun,
    liveBlocks: input.liveBlocks,
    runInteractions: input.runInteractions,
    suppressedInteractionRunIds: input.suppressedInteractionRunIds,
    timelineItems: input.timelineItems,
  })
  const transcriptMessageItems = buildAgentTranscriptMessageItems({
    transcriptMessages: input.transcriptMessages,
    timelineItems: input.timelineItems,
    runInteractionAnswerEchoes: input.runInteractions.answerEchoMessageIds,
    interactionRunsByResultMessageId: input.runInteractions.runsByResultMessageId,
    suppressedInteractionRunIds: context.suppressedInteractionRunIds,
  })
  const threadItems = buildAgentConversationThreadItems({
    transcriptMessageItems,
  })
  const itemsWithoutHiddenActions: AgentConversationProjectionItem[] = projectionItemsForThreadItems({
    activeRun: input.activeRun,
    activeRunId: context.activeRunId,
    liveActivityEventsByRunId: context.liveActivityEventsByRunId,
    renderableLiveBlocks: context.renderableLiveBlocks,
    thinkingState: input.thinkingState,
    threadItems,
  })

  return finalizeAgentConversationProjection({
    items: itemsWithoutHiddenActions,
    liveBlocks: input.liveBlocks,
    standaloneRuns: input.runInteractions.standaloneRuns,
  })
}
