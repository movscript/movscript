import type {
  AgentTimelineItem,
  AgentTimelinePage,
  AgentTimelineStreamEvent,
} from '@/shared/infrastructure/localAgentClient'

export interface AgentTimelineState {
  items: AgentTimelineItem[]
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

export function replaceTimelinePage(page: AgentTimelinePage): AgentTimelineState {
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

export function mergeTimelinePage(state: AgentTimelineState, page: AgentTimelinePage): AgentTimelineState {
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

export function mergeTimelineResetPage(state: AgentTimelineState, page: AgentTimelinePage): AgentTimelineState {
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

export function applyTimelineEvent(state: AgentTimelineState, event: AgentTimelineStreamEvent): AgentTimelineState {
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

export function sortTimelineItems(items: AgentTimelineItem[]): AgentTimelineItem[] {
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

function dedupeTimelineItems(items: AgentTimelineItem[]): AgentTimelineItem[] {
  const byId = new Map<string, AgentTimelineItem>()
  for (const item of items) {
    const previous = byId.get(item.id)
    if (!previous || item.revision >= previous.revision) byId.set(item.id, item)
  }
  return [...byId.values()]
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}
