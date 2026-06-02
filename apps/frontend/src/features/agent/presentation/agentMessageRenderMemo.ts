import type { AgentConversationMessageItem } from '@/features/agent/domain/agentConversationThreadItems'

export function agentConversationMessageItemsEqual(
  prev: AgentConversationMessageItem,
  next: AgentConversationMessageItem,
) {
  return prev.message === next.message
    && prev.showMessage === next.showMessage
    && shallowReferenceArrayEqual(prev.beforeMessageInteractionRuns, next.beforeMessageInteractionRuns)
    && shallowReferenceArrayEqual(prev.afterMessageInteractionRuns, next.afterMessageInteractionRuns)
    && shallowReferenceArrayEqual(prev.liveInteractionRuns, next.liveInteractionRuns)
}

export function agentConversationMessageItemUsesLiveRunInteractionState(item: AgentConversationMessageItem) {
  return !!item.liveInteractionRuns?.length
}

export function agentConversationMessageItemHasInteractionRuns(item: AgentConversationMessageItem) {
  return !!item.liveInteractionRuns?.length
    || item.beforeMessageInteractionRuns.length > 0
    || item.afterMessageInteractionRuns.length > 0
}

export function shallowReferenceArrayEqual<T>(
  prev: readonly T[] | null | undefined,
  next: readonly T[] | null | undefined,
) {
  if (prev === next) return true
  if (!prev || !next) return false
  if (prev.length !== next.length) return false
  return prev.every((item, index) => item === next[index])
}
