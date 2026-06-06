import { useCallback, useMemo } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { upsertInteractionRunSnapshot } from '@/features/agent/domain/agentRunInteraction'
import { providerSessionClient, type AgentRun, type ProviderSessionEventV2 } from '@/shared/infrastructure/providerSessionClient'
import { providerSessionAssistantProgressFromEvent } from '@/shared/infrastructure/provider-session-client/providerSessionEventFacts'
import type { AgentConversationProviderSessionState } from '@/features/agent/state/agentSessionStore'

type ConversationRunPatch = Partial<Omit<AgentConversationProviderSessionState, 'conversationId' | 'run' | 'runId' | 'threadId' | 'status' | 'updatedAt'>>

export interface UseAgentRunResultActionsInput {
  conversationId: string
  sessionId?: string
  setConversationRun: (conversationId: string, run: AgentRun, patch?: ConversationRunPatch) => void
  setSubmittedInteractionRuns: Dispatch<SetStateAction<AgentRun[]>>
  recordLiveTraceEvent: (event: ProviderSessionEventV2) => void
  updateStreamingAssistantText: (runId: string, text: string, roundIndex?: number) => void
}

export function useAgentRunResultActions({
  conversationId,
  sessionId,
  setConversationRun,
  setSubmittedInteractionRuns,
  recordLiveTraceEvent,
  updateStreamingAssistantText,
}: UseAgentRunResultActionsInput) {
  const providerSessionRunClient = useMemo(() => sessionId?.trim()
    ? providerSessionClient.forSession({ sessionId: sessionId.trim() })
    : providerSessionClient, [sessionId])

  const streamFollowUpRun = useCallback(async (runId: string) => {
    return await providerSessionRunClient.streamRun(runId, {
      timeoutMs: 900_000,
      pollMs: 1000,
      onRunUpdate: (nextRun) => {
        setConversationRun(conversationId, nextRun, { approving: true, loading: true })
        setSubmittedInteractionRuns((current) => current.some((run) => run.id === nextRun.id) ? upsertInteractionRunSnapshot(current, nextRun) : current)
      },
      onProviderEvent: (event) => {
        recordLiveTraceEvent(event)
        const progress = providerSessionAssistantProgressFromEvent(event)
        if (progress) {
          updateStreamingAssistantText(progress.runId, progress.accumulated, progress.roundIndex)
        }
      },
    })
  }, [conversationId, providerSessionRunClient, recordLiveTraceEvent, setConversationRun, setSubmittedInteractionRuns, updateStreamingAssistantText])

  return {
    streamFollowUpRun,
  }
}
