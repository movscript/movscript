import { useCallback, useMemo } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AgentRun, ProviderSessionEventV2 } from '@movscript/core/agent/protocol'
import { upsertInteractionRunSnapshot } from '@/features/agent/domain/agentRunInteraction'
import { createAgentProviderSessionCommandService } from '@/features/agent/application/agentProviderSessionCommandService'
import { providerSessionAssistantProgressFromEvent } from '@/shared/infrastructure/provider-session-client/providerSessionEventFacts'
import type { AgentConversationRuntimePatch } from '@/features/agent/state/agentSessionStore'

export interface UseAgentRunResultActionsInput {
  conversationId: string
  sessionId?: string
  setConversationRun: (conversationId: string, run: AgentRun, patch?: AgentConversationRuntimePatch) => void
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
  const commandService = useMemo(() => createAgentProviderSessionCommandService({ sessionId }), [sessionId])

  const streamFollowUpRun = useCallback(async (runId: string) => {
    return await commandService.streamRun(runId, {
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
  }, [commandService, conversationId, recordLiveTraceEvent, setConversationRun, setSubmittedInteractionRuns, updateStreamingAssistantText])

  return {
    streamFollowUpRun,
  }
}
