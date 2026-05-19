import { useAgentActivePlanSnapshot } from '@/components/agent/useAgentActivePlanSnapshot'
import { useAgentChatDerivedState, type UseAgentChatDerivedStateOptions } from '@/components/agent/useAgentChatDerivedState'
import { useAgentConversationAutoScroll } from '@/components/agent/useAgentConversationAutoScroll'
import type { AgentRun } from '@/lib/localAgentClient'

interface UseAgentChatPresentationStateInput extends Omit<UseAgentChatDerivedStateOptions, 'activePlanSnapshot' | 'run'> {
  activeRun: AgentRun | null
  conversationId: string
  localRuntimeEnabled: boolean
  localAgentOnline: boolean
}

export function useAgentChatPresentationState({
  activeRun,
  conversationId,
  localRuntimeEnabled,
  localAgentOnline,
  ...derivedInput
}: UseAgentChatPresentationStateInput) {
  const { data: activePlanSnapshot, refetch: refetchActivePlanSnapshot } = useAgentActivePlanSnapshot({
    activeRun,
    localRuntimeEnabled,
    localAgentOnline,
  })

  const derived = useAgentChatDerivedState({
    ...derivedInput,
    activePlanSnapshot,
    run: activeRun,
  })

  const scroll = useAgentConversationAutoScroll({
    blockCount: derived.conversationPresentation.blocks.length,
    building: derived.buildingSendDraft,
    conversationId,
    generationProgressKey: derived.generationProgressKey,
    hasPendingAssistantState: !!derivedInput.pendingAssistantState,
    hasStreamingAssistantContent: derived.hasStreamingAssistantContent,
    loading: derived.loading,
    messageCount: derivedInput.messages.length,
    streamingAssistantText: derivedInput.streamingAssistantText,
    visibleActivityEventCount: derivedInput.visibleActivityEvents.length,
  })

  return {
    activePlanSnapshot,
    refetchActivePlanSnapshot,
    ...derived,
    ...scroll,
  }
}
