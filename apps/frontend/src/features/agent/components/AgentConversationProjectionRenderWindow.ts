import { buildAgentThreadRenderWindow, type AgentThreadRenderWindow } from '@/features/agent/components/AgentThreadRenderWindow'
import type {
  AgentConversationProjectionContentItem,
  AgentConversationProjection,
  AgentConversationProjectionItem,
} from '@/features/agent/domain/agentConversationProjectionTypes'

export function buildAgentConversationProjectionRenderWindow(input: {
  projection: AgentConversationProjection
  visibleCount: number
}): AgentThreadRenderWindow<AgentConversationProjectionItem> {
  return buildAgentThreadRenderWindow({
    items: input.projection.items,
    visibleCount: input.visibleCount,
    keepItemIds: projectionLiveRunTurnItemIds(input.projection.items),
  })
}

function projectionLiveRunTurnItemIds(items: AgentConversationProjectionItem[]): string[] {
  return items
    .filter((item) => item.type === 'run_turn' && item.items.some(projectionContentItemIsLive))
    .map((item) => item.id)
}

function projectionContentItemIsLive(item: AgentConversationProjectionContentItem): boolean {
  return item.type === 'assistant_stream' || item.type === 'run_activity' || item.type === 'thinking'
}
