import { useCallback, useMemo } from 'react'
import type { MutableRefObject } from 'react'
import { api } from '@/shared/infrastructure/api'
import { createAgentProviderSessionCommandService } from '@/features/agent/application/agentProviderSessionCommandService'
import {
  createProviderSessionStopAbortError,
  stopProviderSessionRunAction,
  type StopProviderSessionRunActionDeps,
} from '@/features/agent/domain/agentRunControl'
import type { AgentRun } from '@movscript/core/agent/protocol'
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
  providerSessionTreeId?: string
  sessionId?: string // legacy provider-session input; prefer providerSessionTreeId.
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
  updateConversationRuntimeState: (conversationId: string, patch: Parameters<StopProviderSessionRunActionDeps['updateConversationRuntimeState']>[0]) => void
}

export function useAgentRunStopAction({
  conversationId,
  workspaceDir,
  providerSessionTreeId,
  sessionId: legacySessionId,
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
  updateConversationRuntimeState,
}: UseAgentRunStopActionInput) {
  const normalizedProviderSessionTreeId = providerSessionTreeId?.trim() || legacySessionId?.trim() || undefined
  const commandService = useMemo(() => createAgentProviderSessionCommandService({
    providerSessionTreeId: normalizedProviderSessionTreeId,
    workspaceDir,
  }), [normalizedProviderSessionTreeId, workspaceDir])
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
    updateConversationRuntimeState: (patch) => updateConversationRuntimeState(conversationId, patch),
    cancelGenerationJobIfActive: () => {
      void cancelGenerationJobIfActive(generationProgressState)
    },
    cancelRun: (runId, input) => commandService.cancelRun(runId, input),
    getRun: (runId) => commandService.getRun(runId),
  }), [
    activeSendAbortControllerRef,
    conversationId,
    generationProgressState,
    resetStreamingAssistant,
    commandService,
    setConversationRun,
    updateConversationRuntimeState,
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
