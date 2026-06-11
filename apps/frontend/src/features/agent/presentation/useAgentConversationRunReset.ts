import { useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AgentRun } from '@/shared/infrastructure/providerSessionClient'

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
  const resetCursorRef = useRef<AgentConversationRunResetCursor | undefined>(undefined)
  useEffect(() => {
    const decision = nextAgentConversationRunReset({
      cursor: resetCursorRef.current,
      conversationId,
      activeRunId,
    })
    resetCursorRef.current = decision.cursor
    if (decision.shouldReset) {
      resetAgentConversationRunState({
        resetLiveRunActivity,
        resetStreamingAssistant,
        setSubmittedInteractionRuns,
      })
    }
  }, [activeRunId, conversationId, resetLiveRunActivity, resetStreamingAssistant, setSubmittedInteractionRuns])
}

export function agentConversationRunResetKey(conversationId: string, activeRunId?: string | null): string {
  const runId = typeof activeRunId === 'string' && activeRunId.trim() ? activeRunId.trim() : 'none'
  return `${conversationId}\u0000${runId}`
}

export interface AgentConversationRunResetCursor {
  conversationId: string
  lastConcreteRunId?: string
}

export function nextAgentConversationRunReset(input: {
  activeRunId?: string | null
  conversationId: string
  cursor?: AgentConversationRunResetCursor
}): { cursor: AgentConversationRunResetCursor; shouldReset: boolean } {
  const runId = normalizeRunId(input.activeRunId)
  if (!input.cursor || input.cursor.conversationId !== input.conversationId) {
    return {
      cursor: {
        conversationId: input.conversationId,
        ...(runId ? { lastConcreteRunId: runId } : {}),
      },
      shouldReset: true,
    }
  }
  if (!runId) {
    return {
      cursor: input.cursor,
      shouldReset: false,
    }
  }
  if (input.cursor.lastConcreteRunId !== runId) {
    return {
      cursor: {
        conversationId: input.conversationId,
        lastConcreteRunId: runId,
      },
      shouldReset: true,
    }
  }
  return {
    cursor: input.cursor,
    shouldReset: false,
  }
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

function normalizeRunId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
