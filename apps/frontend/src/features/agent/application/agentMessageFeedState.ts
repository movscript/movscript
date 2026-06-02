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
}

export const EMPTY_AGENT_MESSAGE_FEED_STATE: AgentMessageFeedState = {
  messages: [],
  hasMoreBefore: false,
  snapshotRevision: 0,
  lastRevision: 0,
  needsReset: false,
}

export function replaceMessageFeedPage(page: AgentFeedMessagePage): AgentMessageFeedState {
  return {
    messages: sortFeedMessages(dedupeFeedMessages(page.messages)),
    ...(page.nextBefore ? { nextBefore: page.nextBefore } : {}),
    hasMoreBefore: page.hasMoreBefore,
    snapshotRevision: page.snapshotRevision,
    lastRevision: page.snapshotRevision,
    needsReset: false,
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
  }
}

export function applyMessageFeedEvent(state: AgentMessageFeedState, event: AgentFeedMessageStreamEvent): AgentMessageFeedState {
  if (event.type === 'messages.reset_required') {
    return {
      ...state,
      needsReset: true,
      lastRevision: Math.max(state.lastRevision, event.revision),
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
    needsReset: false,
  }
}

export function sortFeedMessages(messages: AgentFeedMessage[]): AgentFeedMessage[] {
  return [...messages].sort((left, right) => {
    if (left.cursor === right.cursor) return 0
    return left.cursor < right.cursor ? -1 : 1
  })
}

function dedupeFeedMessages(messages: AgentFeedMessage[]): AgentFeedMessage[] {
  const byId = new Map<string, AgentFeedMessage>()
  for (const message of messages) {
    const previous = byId.get(message.id)
    if (!previous || message.revision >= previous.revision) byId.set(message.id, message)
  }
  return [...byId.values()]
}
