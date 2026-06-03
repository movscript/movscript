import type {
  AgentFeedMessage,
  AgentFeedMessagePage,
  AgentFeedMessageStreamEvent,
} from '@/shared/infrastructure/localAgentClient'

export interface AgentMessageFeedState {
  messages: AgentFeedMessage[]
  nextBefore?: string
  hasMoreBefore: boolean
  snapshotRevision: number
  lastRevision: number
  needsReset: boolean
  postResetMessageIds: string[]
}

export const EMPTY_AGENT_MESSAGE_FEED_STATE: AgentMessageFeedState = {
  messages: [],
  hasMoreBefore: false,
  snapshotRevision: 0,
  lastRevision: 0,
  needsReset: false,
  postResetMessageIds: [],
}

export function replaceMessageFeedPage(page: AgentFeedMessagePage): AgentMessageFeedState {
  return {
    messages: sortFeedMessages(dedupeFeedMessages(page.messages)),
    ...(page.nextBefore ? { nextBefore: page.nextBefore } : {}),
    hasMoreBefore: page.hasMoreBefore,
    snapshotRevision: page.snapshotRevision,
    lastRevision: page.snapshotRevision,
    needsReset: false,
    postResetMessageIds: [],
  }
}

export function mergeMessageFeedPage(state: AgentMessageFeedState, page: AgentFeedMessagePage): AgentMessageFeedState {
  return {
    ...state,
    messages: sortFeedMessages(dedupeFeedMessages([...state.messages, ...page.messages])),
    ...(page.nextBefore ? { nextBefore: page.nextBefore } : { nextBefore: undefined }),
    hasMoreBefore: page.hasMoreBefore,
    snapshotRevision: Math.max(state.snapshotRevision, page.snapshotRevision),
    lastRevision: Math.max(state.lastRevision, page.snapshotRevision),
    needsReset: false,
    postResetMessageIds: [],
  }
}

export function mergeMessageFeedResetPage(state: AgentMessageFeedState, page: AgentFeedMessagePage): AgentMessageFeedState {
  const postResetMessageIds = new Set(state.postResetMessageIds)
  const concurrentMessages = state.messages.filter((message) => (
    postResetMessageIds.has(message.id)
    && message.revision > page.snapshotRevision
  ))
  const concurrentRevision = concurrentMessages.reduce((max, message) => Math.max(max, message.revision), 0)
  return {
    ...replaceMessageFeedPage({
      ...page,
      messages: [...page.messages, ...concurrentMessages],
      snapshotRevision: Math.max(page.snapshotRevision, concurrentRevision),
    }),
    snapshotRevision: page.snapshotRevision,
    lastRevision: Math.max(state.lastRevision, page.snapshotRevision, concurrentRevision),
    needsReset: false,
    postResetMessageIds: [],
  }
}

export function applyMessageFeedEvent(state: AgentMessageFeedState, event: AgentFeedMessageStreamEvent): AgentMessageFeedState {
  if (event.type === 'messages.reset_required') {
    return {
      ...state,
      needsReset: true,
      lastRevision: Math.max(state.lastRevision, event.revision),
      postResetMessageIds: [],
    }
  }
  if (!event.message) return state
  const existing = state.messages.find((message) => message.id === event.message?.id)
  if (existing && existing.revision > event.message.revision) {
    return {
      ...state,
      lastRevision: Math.max(state.lastRevision, event.revision),
    }
  }
  return {
    ...state,
    messages: sortFeedMessages(dedupeFeedMessages([...state.messages.filter((message) => message.id !== event.message?.id), event.message])),
    lastRevision: Math.max(state.lastRevision, event.revision),
    needsReset: state.needsReset,
    postResetMessageIds: state.needsReset
      ? uniqueStrings([...state.postResetMessageIds, event.message.id])
      : state.postResetMessageIds,
  }
}

export function sortFeedMessages(messages: AgentFeedMessage[]): AgentFeedMessage[] {
  return [...messages].sort((left, right) => {
    const cursorOrder = compareFeedMessageCursor(left.cursor, right.cursor)
    if (cursorOrder !== 0) return cursorOrder
    return left.id.localeCompare(right.id)
  })
}

function compareFeedMessageCursor(left: string, right: string): number {
  const leftParts = parseFeedMessageCursor(left)
  const rightParts = parseFeedMessageCursor(right)
  if (leftParts.time !== rightParts.time) return leftParts.time < rightParts.time ? -1 : 1
  if (leftParts.id === rightParts.id) return 0
  return leftParts.id < rightParts.id ? -1 : 1
}

function parseFeedMessageCursor(cursor: string): { time: number; id: string } {
  const [time, ...rest] = cursor.split(':')
  return {
    time: Number(time) || 0,
    id: decodeURIComponent(rest.join(':')),
  }
}

function dedupeFeedMessages(messages: AgentFeedMessage[]): AgentFeedMessage[] {
  const byId = new Map<string, AgentFeedMessage>()
  for (const message of messages) {
    const previous = byId.get(message.id)
    if (!previous || message.revision >= previous.revision) byId.set(message.id, message)
  }
  return [...byId.values()]
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}
