import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import {
  agentRunProfilePresetById,
  type AgentRunProfilePresetId,
  type AgentRunProfileSelection,
} from '@/features/agent/domain/agentRunProfilePreset'
import {
  applyAgentChatThreadExecutionSettings,
  agentThreadNeedsRunProfileSettingsSync,
  errorMessage,
} from '@/features/agent/presentation/agentChatDataSourceShellModel'
import type {
  AgentChatDataSource,
  AgentChatModelSelection,
  AgentChatRuntimeAction,
  AgentChatRuntimeState,
  AgentChatThread,
  AgentChatTurn,
} from '@movscript/core/agent/chat'

interface UseAgentChatRunProfileSettingsInput {
  activeThreadId: string | null
  activeTurn: AgentChatTurn | null | undefined
  dataSource?: AgentChatDataSource
  dispatchRuntime: Dispatch<AgentChatRuntimeAction>
  profilePresetId: AgentRunProfilePresetId
  runtimeRef: MutableRefObject<AgentChatRuntimeState>
  selectedModelSelectionForRequest: (thread?: AgentChatThread | null) => AgentChatModelSelection
  setError: Dispatch<SetStateAction<string | null>>
  setProfilePresetId: Dispatch<SetStateAction<AgentRunProfilePresetId>>
}

export function useAgentChatRunProfileSettings({
  activeThreadId,
  activeTurn,
  dataSource,
  dispatchRuntime,
  profilePresetId,
  runtimeRef,
  selectedModelSelectionForRequest,
  setError,
  setProfilePresetId,
}: UseAgentChatRunProfileSettingsInput) {
  const applyThreadExecutionSettings = useCallback((threadId: string, settings: unknown) => {
    dispatchRuntime({
      type: 'updateThreads',
      update: (current) => applyAgentChatThreadExecutionSettings({
        nowSeconds: Math.floor(Date.now() / 1000),
        settings,
        threadId,
        threads: current,
      }),
    })
  }, [dispatchRuntime])

  const syncThreadRunProfileSettingsForTurn = useCallback(async (
    syncDataSource: AgentChatDataSource,
    thread: AgentChatThread,
    runProfile: AgentRunProfileSelection,
  ) => {
    if (!syncDataSource.updateThreadSettings || thread.status === 'notLoaded') return
    if (!agentThreadNeedsRunProfileSettingsSync(thread, runProfile)) return
    const settings = await syncDataSource.updateThreadSettings({
      threadId: thread.id,
      runProfile,
      ...(thread.cwd?.trim() ? { cwd: thread.cwd.trim() } : {}),
      ...selectedModelSelectionForRequest(thread),
    })
    applyThreadExecutionSettings(thread.id, settings)
  }, [applyThreadExecutionSettings, selectedModelSelectionForRequest])

  const handleProfilePresetChange = useCallback((nextProfilePresetId: AgentRunProfilePresetId) => {
    const previousProfilePresetId = profilePresetId
    setProfilePresetId(nextProfilePresetId)
    if (!dataSource?.updateThreadSettings || !activeThreadId || activeTurn) return
    const thread = runtimeRef.current.threads.find((item) => item.id === activeThreadId)
    if (!thread || thread.status === 'notLoaded') return
    void dataSource.updateThreadSettings({
      threadId: activeThreadId,
      runProfile: agentRunProfilePresetById(nextProfilePresetId),
      ...(thread?.cwd?.trim() ? { cwd: thread.cwd.trim() } : {}),
      ...selectedModelSelectionForRequest(thread),
    })
      .then((settings) => {
        applyThreadExecutionSettings(activeThreadId, settings)
      })
      .catch((nextError) => {
        setProfilePresetId(previousProfilePresetId)
        setError(errorMessage(nextError))
      })
  }, [activeThreadId, activeTurn, applyThreadExecutionSettings, dataSource, profilePresetId, runtimeRef, selectedModelSelectionForRequest, setError, setProfilePresetId])

  return {
    handleProfilePresetChange,
    syncThreadRunProfileSettingsForTurn,
  }
}
