import type { AgentTranscriptMessageItem } from '@/features/agent/domain/agentTranscriptMessageItems'
import { projectionInteractionRunsForMessageItem } from '@/features/agent/domain/agentConversationProjectionInteractions'
import type {
  AgentConversationProjectionContentItem,
} from '@/features/agent/domain/agentConversationProjectionTypes'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { ChatRunActivityEvent } from '@/features/agent/state/agentStore'

type ProjectedMessageItem = Extract<AgentConversationProjectionContentItem, { type: 'message' }>['item']

export function projectionMessageItems(
  item: AgentTranscriptMessageItem,
  liveActivityEventsByRunId: Map<string, ChatRunActivityEvent[]>,
): AgentConversationProjectionContentItem[] {
  const {
    afterRuns,
    beforeRuns,
    embeddedRun,
  } = projectionInteractionRunsForMessageItem(item)
  const interactionSource = item.liveInteractionRuns ? 'live' : 'historical'
  return [
    ...beforeRuns.map((run) => projectionRunInteractionItem('before', item.message.id, run, interactionSource)),
    {
      id: item.message.id,
      type: 'message',
      item: projectTranscriptMessageItem(item, embeddedRun, liveActivityEventsByRunId),
    },
    ...afterRuns.map((run) => projectionRunInteractionItem('after', item.message.id, run, interactionSource)),
  ]
}

function projectionRunInteractionItem(
  placement: 'before' | 'after',
  messageId: string,
  run: AgentRun,
  source: Extract<AgentConversationProjectionContentItem, { type: 'run_interaction' }>['source'],
): AgentConversationProjectionContentItem {
  return {
    id: `run-interaction:${placement}:${messageId}:${run.id}`,
    type: 'run_interaction',
    run,
    source,
  }
}

function projectTranscriptMessageItem(
  item: AgentTranscriptMessageItem,
  embeddedInteractionRun: AgentRun | null,
  liveActivityEventsByRunId: Map<string, ChatRunActivityEvent[]>,
): ProjectedMessageItem {
  return {
    message: item.message,
    activity: {
      ...(item.timelineActivity ? { timelineActivity: item.timelineActivity } : {}),
      embeddedInteractionRun,
      embeddedInteractionEvents: embeddedInteractionRun
        ? liveActivityEventsByRunId.get(embeddedInteractionRun.id) ?? []
        : [],
    },
  }
}
