import { useCallback, useMemo } from 'react'
import type { MutableRefObject } from 'react'
import { api } from '@/shared/infrastructure/api'
import {
  createLocalAgentStopAbortError,
  stopLocalRunAction,
  type StopLocalRunActionDeps,
} from '@/features/agent/domain/agentRunControl'
import { localAgentClient, type AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { GenerationProgressState } from '@/features/agent/domain/agentGenerationMedia'
import type { AgentLivePendingAssistantState } from '@/features/agent/presentation/agentLiveRunActivity'

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
  workspaceDir?: string
  sessionId?: string
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
}

export function useAgentRunStopAction({
  conversationId,
  workspaceDir,
  sessionId,
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
}: UseAgentRunStopActionInput) {
  const runtimeClient = useMemo(() => sessionId?.trim()
    ? localAgentClient.forSession({
        sessionId: sessionId.trim(),
        ...(workspaceDir?.trim() ? { workspaceDir: workspaceDir.trim() } : {}),
      })
    : localAgentClient, [sessionId, workspaceDir])
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
    cancelRun: (runId, input) => runtimeClient.cancelRun(runId, input),
    getRun: (runId) => runtimeClient.getRun(runId),
  }), [
    activeSendAbortControllerRef,
    conversationId,
    generationProgressState,
    resetStreamingAssistant,
    runtimeClient,
    setConversationRun,
    setConversationRuntime,
    setPendingAssistantState,
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
