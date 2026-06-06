import { useCallback, useMemo } from 'react'
import type { MutableRefObject } from 'react'
import { api } from '@/shared/infrastructure/api'
import {
  createProviderSessionStopAbortError,
  stopProviderSessionRunAction,
  type StopProviderSessionRunActionDeps,
} from '@/features/agent/domain/agentRunControl'
import { providerSessionClient, type AgentRun } from '@/shared/infrastructure/providerSessionClient'
import type { GenerationProgressState } from '@/features/agent/domain/agentGenerationMedia'
import type { AgentThinkingState } from '@/features/agent/domain/agentThinkingState'

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
  setPendingAssistantState: (state: AgentThinkingState | null) => void
  resetStreamingAssistant: () => void
  setConversationRun: (conversationId: string, run: AgentRun, patch: Parameters<StopProviderSessionRunActionDeps['setConversationRun']>[1]) => void
  setConversationProviderSessionState: (conversationId: string, patch: Parameters<StopProviderSessionRunActionDeps['setConversationProviderSessionState']>[0]) => void
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
  setConversationProviderSessionState,
}: UseAgentRunStopActionInput) {
  const providerSessionRunClient = useMemo(() => sessionId?.trim()
    ? providerSessionClient.forSession({
        sessionId: sessionId.trim(),
        ...(workspaceDir?.trim() ? { workspaceDir: workspaceDir.trim() } : {}),
      })
    : providerSessionClient, [sessionId, workspaceDir])
  const deps = useMemo<StopProviderSessionRunActionDeps>(() => ({
    abortActiveSend: () => {
      const sendController = activeSendAbortControllerRef.current
      if (sendController && !sendController.signal.aborted) {
        sendController.abort(createProviderSessionStopAbortError())
      }
    },
    setPendingAssistantState,
    resetStreamingAssistant,
    setConversationRun: (nextRun, patch) => setConversationRun(conversationId, nextRun, patch),
    setConversationProviderSessionState: (patch) => setConversationProviderSessionState(conversationId, patch),
    cancelGenerationJobIfActive: () => {
      void cancelGenerationJobIfActive(generationProgressState)
    },
    cancelRun: (runId, input) => providerSessionRunClient.cancelRun(runId, input),
    getRun: (runId) => providerSessionRunClient.getRun(runId),
  }), [
    activeSendAbortControllerRef,
    conversationId,
    generationProgressState,
    resetStreamingAssistant,
    providerSessionRunClient,
    setConversationRun,
    setConversationProviderSessionState,
    setPendingAssistantState,
  ])

  return useCallback(() => {
    stopProviderSessionRunAction({
      run,
      loading,
      building,
      stopping,
      stopRequestedBeforeRun,
      deps,
    })
  }, [building, deps, loading, run, stopRequestedBeforeRun, stopping])
}
