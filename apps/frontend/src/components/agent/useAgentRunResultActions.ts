import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { assistantResultPayloadForRun } from '@/lib/agentMessageViewModel'
import { upsertWorkflowRunSnapshot } from '@/lib/agentWorkflowInteraction'
import { localAgentClient, type AgentRun, type AgentRuntimeEventV2, type AgentThread } from '@/lib/localAgentClient'
import { formatLocalAgentAssistantContent } from '@/components/agent/localRuntime'
import { appendAssistantRunResultMessage, type AgentConversationMessageStore } from '@movscript/conversation'
import { runtimeAssistantDeltaFromEvent } from '@movscript/event-state'
import type { ChatMessage, ChatMessageMeta, ChatRunActivityEvent } from '@/store/agentStore'
import type { AgentConversationRuntimeState } from '@/store/agentSessionStore'

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
        const delta = runtimeAssistantDeltaFromEvent(event)
        if (delta) {
          updateStreamingAssistantText(delta.runId, delta.accumulated, delta.roundIndex)
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
