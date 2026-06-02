import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { upsertInteractionRunSnapshot } from '@/features/agent/domain/agentRunInteraction'
import { localAgentClient, type AgentRun, type AgentRuntimeEventV2 } from '@/shared/infrastructure/localAgentClient'
import { runtimeAssistantProgressFromEvent } from '@movscript/event-state'
import type { AgentConversationRuntimeState } from '@/features/agent/state/agentSessionStore'

type ConversationRunPatch = Partial<Omit<AgentConversationRuntimeState, 'conversationId' | 'run' | 'runId' | 'threadId' | 'status' | 'updatedAt'>>

export interface UseAgentRunResultActionsInput {
  conversationId: string
  setConversationRun: (conversationId: string, run: AgentRun, patch?: ConversationRunPatch) => void
  setSubmittedInteractionRuns: Dispatch<SetStateAction<AgentRun[]>>
  recordLiveTraceEvent: (event: AgentRuntimeEventV2) => void
  updateStreamingAssistantText: (runId: string, text: string, roundIndex?: number) => void
}

export function useAgentRunResultActions({
  conversationId,
  setConversationRun,
  setSubmittedInteractionRuns,
  recordLiveTraceEvent,
  updateStreamingAssistantText,
}: UseAgentRunResultActionsInput) {
  const streamFollowUpRun = useCallback(async (runId: string) => {
    return await localAgentClient.streamRun(runId, {
      timeoutMs: 900_000,
      pollMs: 1000,
      onRunUpdate: (nextRun) => {
        setConversationRun(conversationId, nextRun, { approving: true, loading: true })
        setSubmittedInteractionRuns((current) => current.some((run) => run.id === nextRun.id) ? upsertInteractionRunSnapshot(current, nextRun) : current)
      },
      onRuntimeEvent: (event) => {
        recordLiveTraceEvent(event)
        const progress = runtimeAssistantProgressFromEvent(event)
        if (progress) {
          updateStreamingAssistantText(progress.runId, progress.accumulated, progress.roundIndex)
        }
      },
    })
  }, [conversationId, recordLiveTraceEvent, setConversationRun, setSubmittedInteractionRuns, updateStreamingAssistantText])

  return {
    streamFollowUpRun,
  }
}
