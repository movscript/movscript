import { useAgentActivePlanSnapshot } from '@/features/agent/presentation/useAgentActivePlanSnapshot'
import { useAgentChatDerivedState, type UseAgentChatDerivedStateOptions } from '@/features/agent/presentation/useAgentChatDerivedState'
import { useAgentConversationAutoScroll } from '@/features/agent/presentation/useAgentConversationAutoScroll'
import { visibleTranscriptChatMessages } from '@/features/agent/domain/agentMessageBoundaries'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'

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
    building: derived.buildingSendWorkspace,
    conversationId,
    generationProgressKey: derived.generationProgressKey,
    hasPendingAssistantState: !!derivedInput.pendingAssistantState,
    hasStreamingAssistantContent: derived.hasStreamingAssistantContent,
    loading: derived.loading,
    messageCount: visibleTranscriptChatMessages(derivedInput.messages).length,
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
