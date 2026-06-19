import type { AgentConversationProjectionItem } from '@/features/agent/domain/agentConversationProjectionTypes'
import type { AgentRun } from '@movscript/core/agent/protocol'

export function hiddenActivityActionItemIdsFromProjectionItems(items: AgentConversationProjectionItem[]): Set<string> {
  const ids = new Set<string>()
  collectInteractionActionItemIdsFromProjectionItems(items, ids)
  return ids
}

function collectInteractionActionItemIdsFromProjectionItems(
  items: AgentConversationProjectionItem[],
  ids: Set<string>,
) {
  for (const item of items) {
    if (item.type === 'run_interaction') collectInteractionActionItemIds(item.run, ids)
    if (item.type === 'run_turn') collectInteractionActionItemIdsFromProjectionItems(item.items, ids)
  }
}

function collectInteractionActionItemIds(run: AgentRun, ids: Set<string>) {
  for (const approval of run.pendingApprovals ?? []) ids.add(`approval-${approval.id}`)
  for (const request of run.pendingInputRequests ?? []) ids.add(`input-${request.id}`)
}
