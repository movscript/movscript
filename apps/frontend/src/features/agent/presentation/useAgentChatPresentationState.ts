import { useAgentActivePlanSnapshot } from '@/features/agent/presentation/useAgentActivePlanSnapshot'
import { useAgentChatDerivedState, type UseAgentChatDerivedStateOptions } from '@/features/agent/presentation/useAgentChatDerivedState'
import { useAgentConversationAutoScroll } from '@/features/agent/presentation/useAgentConversationAutoScroll'
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

  const scroll = useAgentConversationAutoScroll({
    conversationId,
  })

  return {
    activePlanSnapshot,
    refetchActivePlanSnapshot,
    ...derived,
    ...scroll,
  }
}
