import {
  buildRunActivitySnapshot,
} from '@/features/agent/domain/agentRunActivitySnapshot'
import {
  buildAgentRunActivityRoundIndex as buildConversationRunActivityRoundIndex,
} from '@/features/agent/domain/agentConversation'
import type { AgentRun } from '@movscript/agent-protocol'
import type { ChatRunActivity, ChatRunActivityEvent } from '@/features/agent/state/agentStore'
import type {
  AgentActivityFeed,
} from './types'
import { buildActivityItemIndex } from './activityItemIndex'
import { latestStatusText } from './roundLabels'
import {
  buildRoundIndexActivityRounds,
  filterHiddenActionItems,
} from './rounds'

export function buildAgentActivityFeed(input: {
  activity?: ChatRunActivity
  run?: AgentRun | null
  events?: ChatRunActivityEvent[]
  hiddenActionItemIds?: Set<string>
}): AgentActivityFeed | undefined {
  const snapshot = buildRunActivitySnapshot(input)
  if (!snapshot) return undefined
  const { activity } = snapshot
  const runActivityRoundIndex = buildConversationRunActivityRoundIndex(activity)

  const itemIndex = buildActivityItemIndex(activity)
  const rounds = filterHiddenActionItems(
    buildRoundIndexActivityRounds(activity, runActivityRoundIndex, snapshot.rounds, itemIndex),
    input.hiddenActionItemIds,
  )
  const items = rounds.flatMap((round) => round.items)

  return {
    runId: activity.runId,
    status: activity.status,
    ...(latestStatusText(activity) ? { statusText: latestStatusText(activity) } : {}),
    rounds,
    items,
    totals: snapshot.totals,
    activity,
  }
}
