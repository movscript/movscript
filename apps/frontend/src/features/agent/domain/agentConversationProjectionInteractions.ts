import type { AgentTranscriptMessageItem } from '@/features/agent/domain/agentTranscriptMessageItems'
import { transcriptMessageItemRelatedRunId } from '@/features/agent/domain/agentMessageBoundaries'
import { isTerminalAgentRunStatus } from '@/features/agent/domain/agentRunControl'
import type {
  AgentConversationProjectionContentItem,
  AgentConversationProjectionItem,
} from '@/features/agent/domain/agentConversationProjectionTypes'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'

type ProjectedMessageItem = Extract<AgentConversationProjectionContentItem, { type: 'message' }>['item']

export function projectionInteractionRunsForMessageItem(
  item: AgentTranscriptMessageItem,
): {
  beforeRuns: AgentRun[]
  afterRuns: AgentRun[]
  embeddedRun: AgentRun | null
} {
  const { afterMessageInteractionRuns, beforeMessageInteractionRuns, liveInteractionRuns } = item
  const interactionRuns = liveInteractionRuns ?? [...beforeMessageInteractionRuns, ...afterMessageInteractionRuns]
  const embeddedRun = liveInteractionRuns?.find((run) => interactionRunEmbedsInMessage(run, item)) ?? null
  const beforeInteractionRunIds = new Set(beforeMessageInteractionRuns.map((run) => run.id))
  if (liveInteractionRuns) {
    return {
      embeddedRun,
      beforeRuns: interactionRuns.filter((run) => (
        run.id !== embeddedRun?.id
        && beforeInteractionRunIds.has(run.id)
      )),
      afterRuns: interactionRuns.filter((run) => (
        run.id !== embeddedRun?.id
        && !beforeInteractionRunIds.has(run.id)
      )),
    }
  }
  return {
    embeddedRun,
    beforeRuns: beforeMessageInteractionRuns,
    afterRuns: afterMessageInteractionRuns,
  }
}

export function interactionRunIdsEmbeddedInProjectedMessages(items: AgentConversationProjectionItem[]): Set<string> {
  const runIds = new Set<string>()
  for (const item of projectedMessagesFromItems(items)) {
    const runId = transcriptMessageItemRelatedRunId({
      message: item.message,
      timelineActivity: item.activity.timelineActivity,
    })
    if (runId) runIds.add(runId)
  }
  return runIds
}

export function standaloneInteractionRunsForProjection(input: {
  embeddedInteractionRunIds: Set<string>
  liveActivityRunIds: Set<string>
  runs: AgentRun[]
}): AgentRun[] {
  return input.runs
    .filter((run) => !input.liveActivityRunIds.has(run.id))
    .filter((run) => !input.embeddedInteractionRunIds.has(run.id))
}

export function suppressedInteractionRunIdsForActiveRun(activeRun: AgentRun | null | undefined): Set<string> {
  const activeRunId = normalizeRunId(activeRun?.id)
  if (
    activeRunId
    && activeRun?.status !== 'requires_action'
    && !isTerminalAgentRunStatus(activeRun?.status)
  ) {
    return new Set([activeRunId])
  }
  return new Set()
}

function interactionRunEmbedsInMessage(run: AgentRun, item: AgentTranscriptMessageItem): boolean {
  return transcriptMessageItemRelatedRunId(item) === run.id
}

function projectedMessagesFromItems(items: AgentConversationProjectionItem[]): ProjectedMessageItem[] {
  return items.flatMap((item) => {
    if (item.type === 'message') return [item.item]
    if (item.type === 'run_turn') return projectedMessagesFromItems(item.items)
    return []
  })
}

function normalizeRunId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
