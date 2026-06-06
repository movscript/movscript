import { runInteractionAnswerEchoesForMessages } from '@/features/agent/domain/agentRunInteraction'
import { buildInteractionRunsByResultMessageId } from '@/features/agent/domain/agentRunInteractionAnchors'
import { timelineActivitiesFromItems } from '@/features/agent/domain/agentTimelineActivityItems'
import type { AgentRun, AgentTimelineItem } from '@/shared/infrastructure/providerSessionClient'
import type { ChatMessage } from '@/features/agent/state/agentStore'

export interface AgentConversationProjectionRunInteractions {
  answerEchoMessageIds: Set<string>
  runsByResultMessageId: Map<string, AgentRun[]>
  standaloneRuns: AgentRun[]
}

export function buildAgentConversationProjectionRunInteractions(input: {
  interactionRuns: AgentRun[]
  messages: ChatMessage[]
  timelineItems: AgentTimelineItem[]
}): AgentConversationProjectionRunInteractions {
  const runsByResultMessageId = buildInteractionRunsByResultMessageId({
    messages: input.messages,
    interactionRuns: input.interactionRuns,
  })
  const insertedRunIds = new Set(Array.from(runsByResultMessageId.values()).flat().map((interactionRun) => interactionRun.id))

  return {
    answerEchoMessageIds: runInteractionAnswerEchoesForMessages(
      input.messages,
      input.interactionRuns,
      timelineActivitiesFromItems(input.timelineItems),
    ),
    runsByResultMessageId,
    standaloneRuns: input.interactionRuns.filter((interactionRun) => !insertedRunIds.has(interactionRun.id)),
  }
}
