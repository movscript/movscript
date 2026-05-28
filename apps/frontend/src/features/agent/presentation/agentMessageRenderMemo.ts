import type { AgentConversationMessageItem } from '@/features/agent/domain/agentConversationThreadItems'

export function agentConversationMessageItemsEqual(
  prev: AgentConversationMessageItem,
  next: AgentConversationMessageItem,
) {
  return prev.message === next.message
    && prev.showMessage === next.showMessage
    && shallowReferenceArrayEqual(prev.beforeMessageWorkflowRuns, next.beforeMessageWorkflowRuns)
    && shallowReferenceArrayEqual(prev.afterMessageWorkflowRuns, next.afterMessageWorkflowRuns)
    && shallowReferenceArrayEqual(prev.liveWorkflowRuns, next.liveWorkflowRuns)
}

export function agentConversationMessageItemUsesLiveWorkflowState(item: AgentConversationMessageItem) {
  return !!item.liveWorkflowRuns?.length
}

export function agentConversationMessageItemHasWorkflowRuns(item: AgentConversationMessageItem) {
  return !!item.liveWorkflowRuns?.length
    || item.beforeMessageWorkflowRuns.length > 0
    || item.afterMessageWorkflowRuns.length > 0
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
