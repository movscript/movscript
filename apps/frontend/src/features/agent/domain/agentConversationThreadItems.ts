import {
  transcriptMessageItemThreadRunId,
  transcriptUserRelatedRunId,
} from '@/features/agent/domain/agentMessageBoundaries'
import { activeRunInputIsWaitingForDelivery } from '@/features/agent/domain/agentActiveRunInputMessages'
import {
  type AgentTranscriptMessageItem,
} from '@/features/agent/domain/agentTranscriptMessageItems'
import type { ChatMessage } from '@/features/agent/state/agentStore'

export type AgentConversationThreadItem =
  | {
    id: string
    type: 'message'
    item: AgentTranscriptMessageItem
  }
  | {
    id: string
    type: 'run_group'
    runId: string
    items: AgentTranscriptMessageItem[]
  }

export function buildAgentConversationThreadItems(input: {
  transcriptMessageItems: AgentTranscriptMessageItem[]
}): AgentConversationThreadItem[] {
  const groupsByRunId = new Map<string, Extract<AgentConversationThreadItem, { type: 'run_group' }>>()
  const threadItems: AgentConversationThreadItem[] = []
  const seenUserRunIds = new Set<string>()

  for (const item of input.transcriptMessageItems) {
    if (isPendingActiveRunInputMessage(item.message)) continue
    const userRunId = transcriptUserRelatedRunId(item.message)
    if (userRunId && !seenUserRunIds.has(userRunId)) {
      seenUserRunIds.add(userRunId)
      threadItems.push({
        id: `message:${item.message.id}`,
        type: 'message',
        item,
      })
      continue
    }
    if (userRunId) seenUserRunIds.add(userRunId)
    const groupRunId = runGroupIdForMessageItem(item)
    if (!groupRunId) {
      threadItems.push({
        id: `message:${item.message.id}`,
        type: 'message',
        item,
      })
      continue
    }

    let group = groupsByRunId.get(groupRunId)
    if (!group) {
      group = {
        id: `run-group:${groupRunId}`,
        type: 'run_group',
        runId: groupRunId,
        items: [],
      }
      groupsByRunId.set(groupRunId, group)
      threadItems.push(group)
    }
    group.items.push(item)
  }

  return threadItems.filter((item) => item.type === 'message' || item.items.length > 0)
}

function isPendingActiveRunInputMessage(message: ChatMessage): boolean {
  return activeRunInputIsWaitingForDelivery(message)
}

function runGroupIdForMessageItem(item: AgentTranscriptMessageItem): string | undefined {
  return transcriptMessageItemThreadRunId(item)
}
