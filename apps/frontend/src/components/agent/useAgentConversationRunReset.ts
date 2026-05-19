import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AgentRun } from '@/lib/localAgentClient'

interface UseAgentConversationRunResetInput {
  conversationId: string
  resetLiveRunActivity: () => void
  setSubmittedInteractionRuns: Dispatch<SetStateAction<AgentRun[]>>
}

export function useAgentConversationRunReset({
  conversationId,
  resetLiveRunActivity,
  setSubmittedInteractionRuns,
}: UseAgentConversationRunResetInput) {
  useEffect(() => {
    resetLiveRunActivity()
    setSubmittedInteractionRuns([])
  }, [conversationId, resetLiveRunActivity, setSubmittedInteractionRuns])
}
