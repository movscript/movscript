import {
  interactionRunIdsEmbeddedInProjectedMessages,
  standaloneInteractionRunsForProjection,
} from '@/features/agent/domain/agentConversationProjectionInteractions'
import {
  liveActivityRunIdsFromBlocks,
  projectionStandaloneInteractionActivityItem,
} from '@/features/agent/domain/agentConversationProjectionLiveBlocks'
import type { AgentConversationLiveBlock } from '@/features/agent/domain/agentConversationLiveBlocks'
import type {
  AgentConversationProjection,
  AgentConversationProjectionItem,
} from '@/features/agent/domain/agentConversationProjectionTypes'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'

export function finalizeAgentConversationProjection(input: {
  items: AgentConversationProjectionItem[]
  liveBlocks: AgentConversationLiveBlock[]
  standaloneRuns: AgentRun[]
}): AgentConversationProjection {
  const itemsWithoutHiddenActions = [
    ...input.items,
    ...standaloneInteractionRunsForProjection({
      embeddedInteractionRunIds: interactionRunIdsEmbeddedInProjectedMessages(input.items),
      liveActivityRunIds: liveActivityRunIdsFromBlocks(input.liveBlocks),
      runs: input.standaloneRuns,
    }).map(projectionStandaloneInteractionActivityItem),
  ]

  return {
    items: itemsWithoutHiddenActions,
  }
}
