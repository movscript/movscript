import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { assistantResultPayloadForRun } from '@/features/agent/domain/agentMessageViewModel'
import { upsertWorkflowRunSnapshot } from '@/features/agent/domain/agentWorkflowInteraction'
import { formatLocalAgentAssistantContent } from '@/features/agent/domain/localAgentResult'
import { localAgentClient, type AgentRun, type AgentRuntimeEventV2, type AgentThread } from '@/shared/infrastructure/localAgentClient'
import { appendAssistantRunResultMessage, type AgentConversationMessageStore } from '@movscript/conversation'
import { runtimeAssistantProgressFromEvent } from '@movscript/event-state'
import type { ChatMessage, ChatMessageMeta, ChatRunActivityEvent } from '@/features/agent/state/agentStore'
import type { AgentConversationRuntimeState } from '@/features/agent/state/agentSessionStore'

type ConversationRunPatch = Partial<Omit<AgentConversationRuntimeState, 'conversationId' | 'run' | 'runId' | 'threadId' | 'status' | 'updatedAt'>>

export interface UseAgentRunResultActionsInput {
  conversationId: string
  userId: string
  setConversationRun: (conversationId: string, run: AgentRun, patch?: ConversationRunPatch) => void
  setSubmittedInteractionRuns: Dispatch<SetStateAction<AgentRun[]>>
  recordLiveTraceEvent: (event: AgentRuntimeEventV2) => void
  updateStreamingAssistantText: (runId: string, text: string, roundIndex?: number) => void
  getStreamingAssistantMessageId: () => string | null
  resetStreamingAssistant: () => void
  messageStore: Pick<AgentConversationMessageStore<ChatMessage, ChatMessageMeta>, 'addMessage' | 'upsertMessage'>
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
      onRuntimeEvent: (event) => {
        recordLiveTraceEvent(event)
        const progress = runtimeAssistantProgressFromEvent(event)
        if (progress) {
          updateStreamingAssistantText(progress.runId, progress.accumulated, progress.roundIndex)
        }
      },
    })
  }, [conversationId, recordLiveTraceEvent, setConversationRun, setSubmittedInteractionRuns, updateStreamingAssistantText])

  const appendAssistantRunResult = useCallback(async (run: AgentRun, thread: AgentThread, liveEvents: ChatRunActivityEvent[] = []) => {
    const result = await appendAssistantRunResultMessage<ChatMessage, ChatMessageMeta, AgentRun, AgentThread, ChatRunActivityEvent>({
      run,
      thread,
      liveEvents,
      deps: {
        userId,
        conversationId,
        messageStore,
        getStreamingAssistantMessageId,
        resetStreamingAssistant,
        formatAssistantContent: formatLocalAgentAssistantContent,
        assistantResultPayloadForRun: (payloadRun, payloadLiveEvents, assistantContent) =>
          assistantResultPayloadForRun(payloadRun, payloadLiveEvents, assistantContent),
      },
    })
    return { artifacts: result.artifacts, content: result.content }
  }, [conversationId, getStreamingAssistantMessageId, messageStore, resetStreamingAssistant, userId])

  return {
    appendAssistantRunResult,
    streamFollowUpRun,
  }
}
