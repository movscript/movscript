import type { AgentTranscriptMessageItem } from '@/features/agent/domain/agentConversationThreadItems'

export function agentTranscriptMessageItemsEqual(
  prev: AgentTranscriptMessageItem,
  next: AgentTranscriptMessageItem,
) {
  return prev.message === next.message
    && prev.timelineActivity === next.timelineActivity
    && prev.showMessage === next.showMessage
    && shallowReferenceArrayEqual(prev.beforeMessageInteractionRuns, next.beforeMessageInteractionRuns)
    && shallowReferenceArrayEqual(prev.afterMessageInteractionRuns, next.afterMessageInteractionRuns)
    && shallowReferenceArrayEqual(prev.liveInteractionRuns, next.liveInteractionRuns)
}

export function agentTranscriptMessageItemUsesLiveRunInteractionState(item: AgentTranscriptMessageItem) {
  return !!item.liveInteractionRuns?.length
}

export function agentTranscriptMessageItemHasInteractionRuns(item: AgentTranscriptMessageItem) {
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
