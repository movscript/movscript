import { useCallback, useMemo } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AgentRun, ProviderSessionEventV2 } from '@movscript/agent-protocol'
import { upsertInteractionRunSnapshot } from '@/features/agent/domain/agentRunInteraction'
import { createAgentProviderSessionCommandService } from '@/features/agent/application/agentProviderSessionCommandService'
import { providerSessionAssistantProgressFromEvent } from '@/features/agent/infrastructure/agentProviderSessionCompatibility'
import type { AgentConversationRuntimePatch } from '@/features/agent/state/agentSessionRuntimeModel'

export interface UseAgentRunResultActionsInput {
  conversationId: string
  providerSessionTreeId?: string
  sessionId?: string // legacy provider-session input; prefer providerSessionTreeId.
  setConversationRun: (conversationId: string, run: AgentRun, patch?: AgentConversationRuntimePatch) => void
  setSubmittedInteractionRuns: Dispatch<SetStateAction<AgentRun[]>>
  recordLiveTraceEvent: (event: ProviderSessionEventV2) => void
  updateStreamingAssistantText: (runId: string, text: string, roundIndex?: number) => void
}

export function useAgentRunResultActions({
  conversationId,
  providerSessionTreeId,
  sessionId: legacySessionId,
  setConversationRun,
  setSubmittedInteractionRuns,
  recordLiveTraceEvent,
  updateStreamingAssistantText,
}: UseAgentRunResultActionsInput) {
  const normalizedProviderSessionTreeId = providerSessionTreeId?.trim() || legacySessionId?.trim() || undefined
  const commandService = useMemo(() => createAgentProviderSessionCommandService({ providerSessionTreeId: normalizedProviderSessionTreeId }), [normalizedProviderSessionTreeId])

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
