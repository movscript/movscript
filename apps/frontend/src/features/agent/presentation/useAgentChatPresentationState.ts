import { useAgentActivePlanSnapshot } from '@/features/agent/presentation/useAgentActivePlanSnapshot'
import { useAgentChatDerivedState, type UseAgentChatDerivedStateOptions } from '@/features/agent/presentation/useAgentChatDerivedState'
import { useAgentConversationAutoScroll } from '@/features/agent/presentation/useAgentConversationAutoScroll'
import { projectionItemsScrollKey } from '@/features/agent/presentation/agentConversationProjectionScrollKey'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'

interface UseAgentChatPresentationStateInput extends Omit<UseAgentChatDerivedStateOptions, 'activePlanSnapshot' | 'run'> {
  activeRun: AgentRun | null
  conversationId: string
  providerSessionEnabled: boolean
  providerSessionOnline: boolean
  providerSessionId?: string
}

export function useAgentChatPresentationState({
  activeRun,
  conversationId,
  providerSessionEnabled,
  providerSessionOnline,
  providerSessionId,
  ...derivedInput
}: UseAgentChatPresentationStateInput) {
  const { data: activePlanSnapshot, refetch: refetchActivePlanSnapshot } = useAgentActivePlanSnapshot({
    activeRun,
    providerSessionEnabled,
    providerSessionOnline,
    sessionId: providerSessionId,
  })

  const derived = useAgentChatDerivedState({
    ...derivedInput,
    activePlanSnapshot,
    run: activeRun,
  })
  const conversationProjectionScrollKey = projectionItemsScrollKey(derived.conversationProjection.items)
  const pendingActiveRunInputQueueKey = derived.pendingActiveRunInputQueue
    .map((item) => `${item.id}:${item.timestamp}:${item.content.length}`)
    .join('|')

  const scroll = useAgentConversationAutoScroll({
    conversationId,
    conversationProjectionScrollKey,
    generationProgressKey: derived.generationProgressKey,
    pendingActiveRunInputQueueKey,
  })

  return {
    activePlanSnapshot,
    refetchActivePlanSnapshot,
    ...derived,
    ...scroll,
  }
}
