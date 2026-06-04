import { useAgentActivePlanSnapshot } from '@/features/agent/presentation/useAgentActivePlanSnapshot'
import { useAgentChatDerivedState, type UseAgentChatDerivedStateOptions } from '@/features/agent/presentation/useAgentChatDerivedState'
import { useAgentConversationAutoScroll } from '@/features/agent/presentation/useAgentConversationAutoScroll'
import { projectionItemsScrollKey } from '@/features/agent/presentation/agentConversationProjectionScrollKey'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'

interface UseAgentChatPresentationStateInput extends Omit<UseAgentChatDerivedStateOptions, 'activePlanSnapshot' | 'run'> {
  activeRun: AgentRun | null
  conversationId: string
  localRuntimeEnabled: boolean
  localAgentOnline: boolean
  localSessionId?: string
}

export function useAgentChatPresentationState({
  activeRun,
  conversationId,
  localRuntimeEnabled,
  localAgentOnline,
  localSessionId,
  ...derivedInput
}: UseAgentChatPresentationStateInput) {
  const { data: activePlanSnapshot, refetch: refetchActivePlanSnapshot } = useAgentActivePlanSnapshot({
    activeRun,
    localRuntimeEnabled,
    localAgentOnline,
    sessionId: localSessionId,
  })

  const derived = useAgentChatDerivedState({
    ...derivedInput,
    activePlanSnapshot,
    run: activeRun,
  })
  const conversationProjectionScrollKey = projectionItemsScrollKey(derived.conversationProjection.items)
  const pendingRuntimeInputQueueKey = derived.pendingRuntimeInputQueue
    .map((item) => `${item.id}:${item.timestamp}:${item.content.length}`)
    .join('|')

  const scroll = useAgentConversationAutoScroll({
    conversationId,
    conversationProjectionScrollKey,
    generationProgressKey: derived.generationProgressKey,
    pendingRuntimeInputQueueKey,
  })

  return {
    activePlanSnapshot,
    refetchActivePlanSnapshot,
    ...derived,
    ...scroll,
  }
}
