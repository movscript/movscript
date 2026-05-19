import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { assistantResultPayloadForRun } from '@/lib/agentMessageViewModel'
import { upsertWorkflowRunSnapshot } from '@/lib/agentWorkflowInteraction'
import { localAgentClient, type AgentRun, type AgentRunStreamEvent, type AgentThread } from '@/lib/localAgentClient'
import { formatLocalAgentAssistantContent } from '@/components/agent/localRuntime'
import type { AgentConversationMessageStore } from '@/lib/agentConversationMessageStore'
import type { ChatRunActivityEvent } from '@/store/agentStore'
import type { AgentConversationRuntimeState } from '@/store/agentSessionStore'

type ConversationRunPatch = Partial<Omit<AgentConversationRuntimeState, 'conversationId' | 'run' | 'runId' | 'threadId' | 'status' | 'updatedAt'>>

export interface UseAgentRunResultActionsInput {
  conversationId: string
  userId: string
  setConversationRun: (conversationId: string, run: AgentRun, patch?: ConversationRunPatch) => void
  setSubmittedInteractionRuns: Dispatch<SetStateAction<AgentRun[]>>
  recordLiveTraceEvent: (event: AgentRunStreamEvent) => void
  updateStreamingAssistantText: (runId: string, text: string, roundIndex?: number) => void
  getStreamingAssistantMessageId: () => string | null
  resetStreamingAssistant: () => void
  messageStore: Pick<AgentConversationMessageStore, 'addMessage' | 'upsertMessage'>
}

export function useAgentRunResultActions({
  conversationId,
  userId,
  setConversationRun,
  setSubmittedInteractionRuns,
  recordLiveTraceEvent,
  updateStreamingAssistantText,
  getStreamingAssistantMessageId,
  resetStreamingAssistant,
  messageStore,
}: UseAgentRunResultActionsInput) {
  const streamFollowUpRun = useCallback(async (runId: string) => {
    return await localAgentClient.streamRun(runId, {
      timeoutMs: 900_000,
      pollMs: 1000,
      onRunUpdate: (nextRun) => {
        setConversationRun(conversationId, nextRun, { approving: true, loading: true })
        setSubmittedInteractionRuns((current) => current.some((run) => run.id === nextRun.id) ? upsertWorkflowRunSnapshot(current, nextRun) : current)
      },
      onStreamEvent: recordLiveTraceEvent,
      onAssistantDelta: (event) => {
        updateStreamingAssistantText(event.runId, event.accumulated, event.roundIndex)
      },
    })
  }, [conversationId, recordLiveTraceEvent, setConversationRun, setSubmittedInteractionRuns, updateStreamingAssistantText])

  const appendAssistantRunResult = useCallback(async (run: AgentRun, thread: AgentThread, liveEvents: ChatRunActivityEvent[] = []) => {
    const content = formatLocalAgentAssistantContent(run, thread)
    const resultPayload = await assistantResultPayloadForRun(run, liveEvents, content)
    const artifacts = resultPayload.meta.draftArtifacts ?? []
    const streamingMessageId = getStreamingAssistantMessageId()
    resetStreamingAssistant()
    const message = {
      role: 'assistant' as const,
      content,
      ...resultPayload,
    }
    if (streamingMessageId) {
      messageStore.upsertMessage(userId, conversationId, streamingMessageId, message)
    } else {
      messageStore.addMessage(userId, conversationId, message)
    }
    return { artifacts, content }
  }, [conversationId, getStreamingAssistantMessageId, messageStore, resetStreamingAssistant, userId])

  return {
    appendAssistantRunResult,
    streamFollowUpRun,
  }
}
