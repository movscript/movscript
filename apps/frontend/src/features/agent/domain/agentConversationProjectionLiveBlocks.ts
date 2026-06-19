import { runIdsWithTimelineActivityItems } from '@/features/agent/domain/agentTimelineActivityItems'
import type { AgentConversationLiveBlock } from '@/features/agent/domain/agentConversationLiveBlocks'
import type {
  AgentConversationProjectionContentItem, } from '@/features/agent/domain/agentConversationProjectionTypes'
import type { AgentThinkingState } from '@/features/agent/domain/agentThinkingState'
import type { AgentRun, AgentTimelineItem } from '@movscript/core/agent/protocol'
import type { ChatRunActivityEvent } from '@/features/agent/state/agentStore'

export function renderableLiveBlocksForProjection(input: {
  anchoredInteractionRunIds: Set<string>
  liveBlocks: AgentConversationLiveBlock[]
  timelineItems: AgentTimelineItem[]
}): AgentConversationLiveBlock[] {
  const activityMessageRunIds = runIdsWithTimelineActivityItems(input.timelineItems)
  return input.liveBlocks.filter((block) => {
    if (block.type !== 'live_run_activity') return true
    const runId = normalizeRunId(block.run?.id)
    if (!runId) return true
    if (activityMessageRunIds.has(runId)) return false
    return !(block.run?.status === 'requires_action' && input.anchoredInteractionRunIds.has(runId))
  })
}

export function projectionLiveBlockItem(
  block: AgentConversationLiveBlock,
  input: {
    activeRun?: AgentRun | null
    thinkingState?: AgentThinkingState
  },
): AgentConversationProjectionContentItem {
  if (block.type === 'assistant_stream') {
    return {
      id: `assistant-stream:${block.id}`,
      type: 'assistant_stream',
      content: block.content,
    }
  }
  if (block.type === 'live_run_activity') {
    return {
      id: `live-run-activity:${block.id}`,
      type: 'run_activity',
      run: block.run,
      events: block.events,
    }
  }
  return {
    id: `thinking:${block.id}`,
    type: 'thinking',
    run: input.activeRun ?? null,
    state: input.thinkingState ?? { status: 'thinking' },
  }
}

export function projectionStandaloneInteractionActivityItem(run: AgentRun): AgentConversationProjectionContentItem {
  return {
    id: `run-activity:standalone:${run.id}`,
    type: 'run_activity',
    run,
    events: [],
  }
}

export function liveActivityEventsByRunIdFromBlocks(blocks: AgentConversationLiveBlock[]): Map<string, ChatRunActivityEvent[]> {
  const byRunId = new Map<string, ChatRunActivityEvent[]>()
  for (const block of blocks) {
    if (block.type !== 'live_run_activity') continue
    const runId = normalizeRunId(block.run?.id)
    if (!runId || block.events.length === 0) continue
    byRunId.set(runId, [...(byRunId.get(runId) ?? []), ...block.events])
  }
  return byRunId
}

export function liveActivityRunIdsFromBlocks(blocks: AgentConversationLiveBlock[]): Set<string> {
  return new Set(blocks
    .filter((block) => block.type === 'live_run_activity' && block.run?.id)
    .map((block) => block.type === 'live_run_activity' ? block.run?.id : undefined)
    .filter((id): id is string => Boolean(id)))
}

function normalizeRunId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
