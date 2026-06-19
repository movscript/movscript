import type { AgentConversationThreadItem, } from '@/features/agent/domain/agentConversationThreadItems'
import type { AgentTranscriptMessageItem } from '@/features/agent/domain/agentTranscriptMessageItems'
import { projectionLiveBlockItem } from '@/features/agent/domain/agentConversationProjectionLiveBlocks'
import { projectionMessageItems } from '@/features/agent/domain/agentConversationProjectionMessages'
import type {
  AgentConversationProjectionItem, } from '@/features/agent/domain/agentConversationProjectionTypes'
import type { AgentConversationLiveBlock } from '@/features/agent/domain/agentConversationLiveBlocks'
import type { AgentThinkingState } from '@/features/agent/domain/agentThinkingState'
import type { AgentRun } from '@movscript/core/agent/protocol'
import type { ChatRunActivityEvent } from '@/features/agent/state/agentStore'

export function projectionItemsForThreadItems(input: {
  activeRun?: AgentRun | null
  activeRunId?: string
  liveActivityEventsByRunId: Map<string, ChatRunActivityEvent[]>
  renderableLiveBlocks: AgentConversationLiveBlock[]
  thinkingState?: AgentThinkingState
  threadItems: AgentConversationThreadItem[]
}): AgentConversationProjectionItem[] {
  const items = input.threadItems.flatMap((threadItem): AgentConversationProjectionItem[] => {
    if (threadItem.type === 'message') {
      return projectionMessageItems(threadItem.item, input.liveActivityEventsByRunId)
    }
    const split = input.activeRunId === threadItem.runId
      ? splitRunGroupItemsForLiveBlocks(threadItem.items)
      : { beforeLiveBlocks: threadItem.items, afterLiveBlocks: [] }
    return [{
      id: threadItem.id,
      type: 'run_turn',
      runId: threadItem.runId,
      items: [
        ...split.beforeLiveBlocks.flatMap((item) => projectionMessageItems(item, input.liveActivityEventsByRunId)),
        ...(input.activeRunId === threadItem.runId
          ? input.renderableLiveBlocks.map((block) => projectionLiveBlockItem(block, input))
          : []),
        ...split.afterLiveBlocks.flatMap((item) => projectionMessageItems(item, input.liveActivityEventsByRunId)),
      ],
    }]
  })

  const activeRunHasThreadGroup = !!input.activeRunId
    && items.some((item) => item.type === 'run_turn' && item.runId === input.activeRunId)
  if (input.activeRunId && !activeRunHasThreadGroup && input.renderableLiveBlocks.length > 0) {
    items.push({
      id: `run-turn:${input.activeRunId}:transient`,
      type: 'run_turn',
      runId: input.activeRunId,
      items: input.renderableLiveBlocks.map((block) => projectionLiveBlockItem(block, input)),
    })
  } else if (!input.activeRunId && input.renderableLiveBlocks.length > 0) {
    items.push(...input.renderableLiveBlocks.map((block) => projectionLiveBlockItem(block, input)))
  }

  return items
}

function splitRunGroupItemsForLiveBlocks(items: AgentTranscriptMessageItem[]): {
  beforeLiveBlocks: AgentTranscriptMessageItem[]
  afterLiveBlocks: AgentTranscriptMessageItem[]
} {
  return {
    beforeLiveBlocks: items.filter((item) => item.message.role === 'user'),
    afterLiveBlocks: items.filter((item) => item.message.role !== 'user'),
  }
}
