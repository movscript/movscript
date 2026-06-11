export interface AgentTimelineStateItem {
  id: string
  createdAt: string
  revision: number
  sortRank: number
}

export interface AgentTimelinePage<TItem extends AgentTimelineStateItem = AgentTimelineStateItem> {
  items: TItem[]
  nextBefore?: string
  hasMoreBefore: boolean
  snapshotRevision: number
}

export type AgentTimelineStreamEvent<TItem extends AgentTimelineStateItem = AgentTimelineStateItem> =
  | {
      type: 'timeline.item.created' | 'timeline.item.updated'
      revision: number
      item: TItem
    }
  | {
      type: 'timeline.reset_required'
      revision: number
      reason?: string
    }

export interface AgentTimelineState<TItem extends AgentTimelineStateItem = AgentTimelineStateItem> {
  items: TItem[]
  nextBefore?: string
  hasMoreBefore: boolean
  snapshotRevision: number
  lastRevision: number
  needsReset: boolean
  postResetItemIds: string[]
}

export const EMPTY_AGENT_TIMELINE_STATE: AgentTimelineState = {
  items: [],
  hasMoreBefore: false,
  snapshotRevision: 0,
  lastRevision: 0,
  needsReset: false,
  postResetItemIds: [],
}

export function replaceTimelinePage<TItem extends AgentTimelineStateItem>(
  page: AgentTimelinePage<TItem>,
): AgentTimelineState<TItem> {
  return {
    items: sortTimelineItems(dedupeTimelineItems(page.items)),
    ...(page.nextBefore ? { nextBefore: page.nextBefore } : {}),
    hasMoreBefore: page.hasMoreBefore,
    snapshotRevision: page.snapshotRevision,
    lastRevision: page.snapshotRevision,
    needsReset: false,
    postResetItemIds: [],
  }
}

export function mergeTimelinePage<TItem extends AgentTimelineStateItem>(
  state: AgentTimelineState<TItem>,
  page: AgentTimelinePage<TItem>,
): AgentTimelineState<TItem> {
  return {
    ...state,
    items: sortTimelineItems(dedupeTimelineItems([...state.items, ...page.items])),
    ...(page.nextBefore ? { nextBefore: page.nextBefore } : { nextBefore: undefined }),
    hasMoreBefore: page.hasMoreBefore,
    snapshotRevision: Math.max(state.snapshotRevision, page.snapshotRevision),
    lastRevision: Math.max(state.lastRevision, page.snapshotRevision),
    needsReset: false,
    postResetItemIds: [],
  }
}

export function mergeTimelineResetPage<TItem extends AgentTimelineStateItem>(
  state: AgentTimelineState<TItem>,
  page: AgentTimelinePage<TItem>,
): AgentTimelineState<TItem> {
  const postResetItemIds = new Set(state.postResetItemIds)
  const concurrentItems = state.items.filter((item) => (
    postResetItemIds.has(item.id)
    && item.revision > page.snapshotRevision
  ))
  const concurrentRevision = concurrentItems.reduce((max, item) => Math.max(max, item.revision), 0)
  return {
    ...replaceTimelinePage({
      ...page,
      items: [...page.items, ...concurrentItems],
      snapshotRevision: Math.max(page.snapshotRevision, concurrentRevision),
    }),
    snapshotRevision: page.snapshotRevision,
    lastRevision: Math.max(state.lastRevision, page.snapshotRevision, concurrentRevision),
    needsReset: false,
    postResetItemIds: [],
  }
}

export function applyTimelineEvent<TItem extends AgentTimelineStateItem>(
  state: AgentTimelineState<TItem>,
  event: AgentTimelineStreamEvent<TItem>,
): AgentTimelineState<TItem> {
  if (event.type === 'timeline.reset_required') {
    return {
      ...state,
      needsReset: true,
      lastRevision: Math.max(state.lastRevision, event.revision),
      postResetItemIds: [],
    }
  }
  const existing = state.items.find((item) => item.id === event.item.id)
  if (existing && existing.revision > event.item.revision) {
    return {
      ...state,
      lastRevision: Math.max(state.lastRevision, event.revision),
    }
  }
  return {
    ...state,
    items: sortTimelineItems(dedupeTimelineItems([...state.items.filter((item) => item.id !== event.item.id), event.item])),
    lastRevision: Math.max(state.lastRevision, event.revision),
    needsReset: state.needsReset,
    postResetItemIds: state.needsReset
      ? uniqueStrings([...state.postResetItemIds, event.item.id])
      : state.postResetItemIds,
  }
}

export function sortTimelineItems<TItem extends AgentTimelineStateItem>(items: TItem[]): TItem[] {
  return [...items].sort((left, right) => {
    const createdOrder = timelineItemTime(left.createdAt) - timelineItemTime(right.createdAt)
    if (createdOrder !== 0) return createdOrder
    const rankOrder = left.sortRank - right.sortRank
    if (rankOrder !== 0) return rankOrder
    return left.id.localeCompare(right.id)
  })
}

function timelineItemTime(value: string): number {
  return Date.parse(value) || 0
}

function dedupeTimelineItems<TItem extends AgentTimelineStateItem>(items: TItem[]): TItem[] {
  const byId = new Map<string, TItem>()
  for (const item of items) {
    const previous = byId.get(item.id)
    if (!previous || item.revision >= previous.revision) byId.set(item.id, item)
  }
  return [...byId.values()]
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}
