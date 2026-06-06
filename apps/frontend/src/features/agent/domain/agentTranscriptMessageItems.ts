import { isRunInteractionAnswerEchoMessage, runInteractionFromActivity } from '@/features/agent/domain/agentRunInteraction'
import { runInteractionPlacementForMessage } from '@/features/agent/domain/agentRunInteractionAnchors'
import { timelineActivityByMessageId } from '@/features/agent/domain/agentTimelineActivityItems'
import type { AgentRun, AgentTimelineItem } from '@/shared/infrastructure/providerSessionClient'
import type { ChatMessage, ChatRunActivity } from '@/features/agent/state/agentStore'

export interface AgentTranscriptMessageItem {
  beforeMessageInteractionRuns: AgentRun[]
  afterMessageInteractionRuns: AgentRun[]
  liveInteractionRuns: AgentRun[] | null
  message: ChatMessage
  timelineActivity?: ChatRunActivity
}

export function buildAgentTranscriptMessageItems({
  transcriptMessages,
  runInteractionAnswerEchoes,
  interactionRunsByResultMessageId,
  suppressedInteractionRunIds = new Set(),
  timelineItems = [],
}: {
  transcriptMessages: ChatMessage[]
  runInteractionAnswerEchoes: Set<string>
  interactionRunsByResultMessageId: Map<string, AgentRun[]>
  suppressedInteractionRunIds?: Set<string>
  timelineItems?: AgentTimelineItem[]
}): AgentTranscriptMessageItem[] {
  const activityByMessageId = timelineActivityByMessageId(timelineItems)
  return transcriptMessages.flatMap((message) => {
    if (isRunInteractionAnswerEchoMessage(message, runInteractionAnswerEchoes)) return []
    const timelineActivity = activityByMessageId.get(message.id)
    const mappedInteractionRuns = interactionRunsByResultMessageId.get(message.id) ?? null
    const liveInteractionRuns = mappedInteractionRuns
      ?.filter((run) => !suppressedInteractionRunIds.has(run.id)) ?? null
    const historicalInteractionRun = mappedInteractionRuns || message.role === 'assistant' ? null : runInteractionFromActivity(timelineActivity)
    const visibleHistoricalInteractionRun = historicalInteractionRun
      && !suppressedInteractionRunIds.has(historicalInteractionRun.id)
      ? historicalInteractionRun
      : null
    const interactionRuns = liveInteractionRuns ?? (visibleHistoricalInteractionRun ? [visibleHistoricalInteractionRun] : [])
    const beforeMessageInteractionRuns: AgentRun[] = []
    const afterMessageInteractionRuns: AgentRun[] = []
    for (const run of interactionRuns) {
      if (runInteractionPlacementForMessage(run, message) === 'after') afterMessageInteractionRuns.push(run)
      else beforeMessageInteractionRuns.push(run)
    }
    return [{
      beforeMessageInteractionRuns,
      afterMessageInteractionRuns,
      liveInteractionRuns,
      message,
      ...(timelineActivity ? { timelineActivity } : {}),
    }]
  })
}
