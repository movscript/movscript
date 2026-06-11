import {
  AGENT_CHAT_VISIBLE_ITEM_WINDOW_INITIAL_SIZE,
  AGENT_CHAT_VISIBLE_ITEM_WINDOW_PAGE_SIZE,
  buildAgentChatVisibleItemWindow,
  type AgentChatVisibleItemWindow,
} from '@movscript/core/agent/chat'

export const AGENT_THREAD_RENDER_WINDOW_INITIAL_SIZE = AGENT_CHAT_VISIBLE_ITEM_WINDOW_INITIAL_SIZE
export const AGENT_THREAD_RENDER_WINDOW_PAGE_SIZE = AGENT_CHAT_VISIBLE_ITEM_WINDOW_PAGE_SIZE

export interface AgentThreadRenderWindowInput<T extends { id: string }> {
  items: T[]
  visibleCount: number
  pageSize?: number
  keepItemIds?: string[]
}

export type AgentThreadRenderWindow<T> = AgentChatVisibleItemWindow<T>

export function buildAgentThreadRenderWindow<T extends { id: string }>({
  items,
  visibleCount,
  pageSize = AGENT_THREAD_RENDER_WINDOW_PAGE_SIZE,
  keepItemIds = [],
}: AgentThreadRenderWindowInput<T>): AgentThreadRenderWindow<T> {
  const keepItemIdSet = new Set(keepItemIds)
  return buildAgentChatVisibleItemWindow({
    items,
    visibleCount,
    pageSize,
    keepItem: (item) => keepItemIdSet.has(item.id),
  })
}
