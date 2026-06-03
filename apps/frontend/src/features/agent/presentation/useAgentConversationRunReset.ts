import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AgentRun } from '@/shared/infrastructure/localAgentClient'

interface UseAgentConversationRunResetInput {
  activeRunId?: string | null
  conversationId: string
  resetLiveRunActivity: () => void
  resetStreamingAssistant: () => void
  setSubmittedInteractionRuns: Dispatch<SetStateAction<AgentRun[]>>
}

export function useAgentConversationRunReset({
  activeRunId,
  conversationId,
  resetLiveRunActivity,
  resetStreamingAssistant,
  setSubmittedInteractionRuns,
}: UseAgentConversationRunResetInput) {
  const resetKey = agentConversationRunResetKey(conversationId, activeRunId)
  useEffect(() => {
    resetAgentConversationRunState({
      resetLiveRunActivity,
      resetStreamingAssistant,
      setSubmittedInteractionRuns,
    })
  }, [resetKey, resetLiveRunActivity, resetStreamingAssistant, setSubmittedInteractionRuns])
}

export function agentConversationRunResetKey(conversationId: string, activeRunId?: string | null): string {
  const runId = typeof activeRunId === 'string' && activeRunId.trim() ? activeRunId.trim() : 'none'
  return `${conversationId}\u0000${runId}`
}

export function resetAgentConversationRunState(input: {
  resetLiveRunActivity: () => void
  resetStreamingAssistant: () => void
  setSubmittedInteractionRuns: Dispatch<SetStateAction<AgentRun[]>>
}) {
  input.resetLiveRunActivity()
  input.resetStreamingAssistant()
  input.setSubmittedInteractionRuns([])
}
