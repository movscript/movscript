export const AGENT_THREAD_RENDER_WINDOW_INITIAL_SIZE = 80
export const AGENT_THREAD_RENDER_WINDOW_PAGE_SIZE = 40

export interface AgentThreadRenderWindowInput<T extends { id: string }> {
  items: T[]
  visibleCount: number
  pageSize?: number
  keepItemIds?: string[]
}

export interface AgentThreadRenderWindow<T> {
  hiddenCount: number
  nextVisibleCount: number
  totalCount: number
  visibleCount: number
  visibleItems: T[]
}

export function buildAgentThreadRenderWindow<T extends { id: string }>({
  items,
  visibleCount,
  pageSize = AGENT_THREAD_RENDER_WINDOW_PAGE_SIZE,
  keepItemIds = [],
}: AgentThreadRenderWindowInput<T>): AgentThreadRenderWindow<T> {
  const totalCount = items.length
  const normalizedVisibleCount = Math.max(1, Math.floor(visibleCount))
  const normalizedPageSize = Math.max(1, Math.floor(pageSize))
  let startIndex = Math.max(0, totalCount - normalizedVisibleCount)

  for (const itemId of keepItemIds) {
    const index = items.findIndex((item) => item.id === itemId)
    if (index >= 0) startIndex = Math.min(startIndex, index)
  }

  const hiddenCount = startIndex
  const effectiveVisibleCount = totalCount - hiddenCount
  return {
    hiddenCount,
    nextVisibleCount: Math.min(totalCount, effectiveVisibleCount + normalizedPageSize),
    totalCount,
    visibleCount: effectiveVisibleCount,
    visibleItems: hiddenCount > 0 ? items.slice(hiddenCount) : items,
  }
}
