import { useCallback, useMemo } from 'react'
import type { MutableRefObject } from 'react'
import { api } from '@/lib/api'
import {
  createLocalAgentStopAbortError,
  stopLocalRunAction,
  type StopLocalRunActionDeps,
} from '@/lib/agentRunControl'
import { localAgentClient, type AgentRun, type AgentThread } from '@/lib/localAgentClient'
import type { GenerationProgressState } from '@/lib/agentGenerationMedia'
import type { AgentLivePendingAssistantState } from '@/lib/agentLiveRunActivity'
import type { AgentConversationMessageStore } from '@/lib/agentConversationMessageStore'
import type { ChatRunActivityEvent } from '@/store/agentStore'

export async function cancelGenerationJobIfActive(state: GenerationProgressState | null): Promise<void> {
  if (!state || state.terminal || state.jobId === undefined) return
  try {
    await api.post(`/jobs/${state.jobId}/cancel`)
  } catch {
    // Stopping the agent run should still proceed if the backend job has already finished
    // or the generation provider cannot accept cancellation.
  }
}

export interface UseAgentRunStopActionInput {
  conversationId: string
  userId: string
  run: AgentRun | null
  loading: boolean
  building: boolean
  stopping: boolean
  stopRequestedBeforeRun: boolean
  generationProgressState: GenerationProgressState | null
  activeSendAbortControllerRef: MutableRefObject<AbortController | null>
  setPendingAssistantState: (state: AgentLivePendingAssistantState | null) => void
  resetStreamingAssistant: () => void
  setConversationRun: (conversationId: string, run: AgentRun, patch: Parameters<StopLocalRunActionDeps['setConversationRun']>[1]) => void
  setConversationRuntime: (conversationId: string, patch: Parameters<StopLocalRunActionDeps['setConversationRuntime']>[0]) => void
  appendAssistantRunResult: (run: AgentRun, thread: AgentThread, liveEvents: ChatRunActivityEvent[]) => Promise<unknown>
  liveEvents: () => ChatRunActivityEvent[]
  messageStore: Pick<AgentConversationMessageStore, 'addMessage'>
}

export function useAgentRunStopAction({
  conversationId,
  userId,
  run,
  loading,
  building,
  stopping,
  stopRequestedBeforeRun,
  generationProgressState,
  activeSendAbortControllerRef,
  setPendingAssistantState,
  resetStreamingAssistant,
  setConversationRun,
  setConversationRuntime,
  appendAssistantRunResult,
  liveEvents,
  messageStore,
}: UseAgentRunStopActionInput) {
  const deps = useMemo<StopLocalRunActionDeps>(() => ({
    abortActiveSend: () => {
      const sendController = activeSendAbortControllerRef.current
      if (sendController && !sendController.signal.aborted) {
        sendController.abort(createLocalAgentStopAbortError())
      }
    },
    setPendingAssistantState,
    resetStreamingAssistant,
    setConversationRun: (nextRun, patch) => setConversationRun(conversationId, nextRun, patch),
    setConversationRuntime: (patch) => setConversationRuntime(conversationId, patch),
    cancelGenerationJobIfActive: () => {
      void cancelGenerationJobIfActive(generationProgressState)
    },
    cancelRun: (runId, input) => localAgentClient.cancelRun(runId, input),
    getRun: (runId) => localAgentClient.getRun(runId),
    getThread: (threadId) => localAgentClient.getThread(threadId),
    appendAssistantRunResult,
    liveEvents,
    addAssistantMessage: (message) => messageStore.addMessage(userId, conversationId, message),
  }), [
    activeSendAbortControllerRef,
    appendAssistantRunResult,
    conversationId,
    generationProgressState,
    liveEvents,
    messageStore,
    resetStreamingAssistant,
    setConversationRun,
    setConversationRuntime,
    setPendingAssistantState,
    userId,
  ])

  return useCallback(() => {
    stopLocalRunAction({
      run,
      loading,
      building,
      stopping,
      stopRequestedBeforeRun,
      deps,
    })
  }, [building, deps, loading, run, stopRequestedBeforeRun, stopping])
}
