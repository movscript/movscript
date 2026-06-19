import {
  suppressedInteractionRunIdsForActiveRun,
} from '@/features/agent/domain/agentConversationProjectionInteractions'
import {
  liveActivityEventsByRunIdFromBlocks,
  renderableLiveBlocksForProjection,
} from '@/features/agent/domain/agentConversationProjectionLiveBlocks'
import type { AgentConversationLiveBlock } from '@/features/agent/domain/agentConversationLiveBlocks'
import type { AgentConversationProjectionRunInteractions } from '@/features/agent/domain/agentConversationProjectionRunInteractions'
import type { AgentRun, AgentTimelineItem } from '@movscript/core/agent/protocol'
import type { ChatRunActivityEvent } from '@/features/agent/state/agentStore'

export interface AgentConversationProjectionPreparedContext {
  activeRunId?: string
  liveActivityEventsByRunId: Map<string, ChatRunActivityEvent[]>
  renderableLiveBlocks: AgentConversationLiveBlock[]
  suppressedInteractionRunIds: Set<string>
}

export function prepareAgentConversationProjectionContext(input: {
  activeRun?: AgentRun | null
  liveBlocks: AgentConversationLiveBlock[]
  runInteractions: AgentConversationProjectionRunInteractions
  suppressedInteractionRunIds?: Set<string>
  timelineItems: AgentTimelineItem[]
}): AgentConversationProjectionPreparedContext {
  const activeRunId = normalizeRunId(input.activeRun?.id)
  const suppressedInteractionRunIds = input.suppressedInteractionRunIds
    ?? suppressedInteractionRunIdsForActiveRun(input.activeRun)
  const anchoredInteractionRunIds = interactionRunIdsAnchoredToResultMessages(input.runInteractions.runsByResultMessageId)

  return {
    activeRunId,
    liveActivityEventsByRunId: liveActivityEventsByRunIdFromBlocks(input.liveBlocks),
    renderableLiveBlocks: renderableLiveBlocksForProjection({
      anchoredInteractionRunIds,
      liveBlocks: input.liveBlocks,
      timelineItems: input.timelineItems,
    }),
    suppressedInteractionRunIds,
  }
}

function interactionRunIdsAnchoredToResultMessages(runsByResultMessageId: Map<string, AgentRun[]>): Set<string> {
  return new Set(Array.from(runsByResultMessageId.values())
    .flat()
    .map((run) => run.id))
}

function normalizeRunId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
