import { useCallback, type Dispatch, type SetStateAction } from 'react'
import {
  notifyAgentPanelRunSettled,
  type AgentPanelNewConversationPayload,
  type AgentPanelWorkspacePayload,
} from '@/features/agent/application/agentPanelBridge'
import {
  agentRunProfilePresetById,
  type AgentRunProfilePresetId,
  type AgentRunProfileSelection,
} from '@/features/agent/domain/agentRunProfilePreset'
import {
  buildAgentChatDraftThreadControlOptions,
  errorMessage,
} from '@/features/agent/presentation/agentChatDataSourceShellModel'
import {
  beginAgentPerformanceOperation,
  finishAgentPerformanceOperation,
  markAgentPerformancePhase,
  performanceNow,
  recordAgentPerformanceMetric,
} from '@/features/agent/state/agentPerformanceStore'
import {
  type AgentChatCollaborationMode,
  type AgentChatDataSource,
  type AgentChatModelSelection,
  type AgentChatThread,
} from '@movscript/core/agent/chat'

export type AgentChatStartThreadInput = AgentPanelNewConversationPayload & {
  runProfile?: AgentRunProfileSelection
  useDraftModeSettings?: boolean
}

export interface AgentChatStartThreadResult {
  thread: AgentChatThread
  dataSource: AgentChatDataSource
}

interface UseAgentChatThreadCreationInput {
  collaborationMode: AgentChatCollaborationMode
  dataSource?: AgentChatDataSource
  endpoint?: string
  goalModeEnabled: boolean
  loadDataSourceForNewThread?: (input: AgentPanelNewConversationPayload) => Promise<{ dataSource?: AgentChatDataSource; endpoint?: string }>
  markThreadOpen: (threadId: string) => void
  profilePresetId: AgentRunProfilePresetId
  registerThreadConversation: (thread: AgentChatThread, input?: { workspaceContext?: AgentPanelNewConversationPayload['workspaceContext']; projectId?: number }) => void
  selectedModelSelectionForRequest: (thread?: AgentChatThread | null) => AgentChatModelSelection
  setActiveThreadIdValue: (threadId: string | null) => void
  setDataSource: Dispatch<SetStateAction<AgentChatDataSource | undefined>>
  setEndpoint: Dispatch<SetStateAction<string | undefined>>
  setError: Dispatch<SetStateAction<string | null>>
  setHistoryOpen: Dispatch<SetStateAction<boolean>>
  upsertThread: (thread: AgentChatThread) => void
}

export function useAgentChatThreadCreation({
  collaborationMode,
  dataSource,
  endpoint,
  goalModeEnabled,
  loadDataSourceForNewThread,
  markThreadOpen,
  profilePresetId,
  registerThreadConversation,
  selectedModelSelectionForRequest,
  setActiveThreadIdValue,
  setDataSource,
  setEndpoint,
  setError,
  setHistoryOpen,
  upsertThread,
}: UseAgentChatThreadCreationInput) {
  const startThreadResult = useCallback(async (input: AgentChatStartThreadInput = {}): Promise<AgentChatStartThreadResult | null> => {
    if (!dataSource) return null
    const operationId = beginAgentPerformanceOperation({
      kind: 'conversation_create',
      meta: {
        provider: dataSource.provider,
        hasWorkspaceContext: Boolean(input.workspaceContext),
      },
    })
    const startedMs = performanceNow()
    setError(null)
    markAgentPerformancePhase(operationId, 'conversation_create_start')
    try {
      let nextDataSource = dataSource
      if (input.workspaceContext && loadDataSourceForNewThread) {
        markAgentPerformancePhase(operationId, 'ensure_provider_session_start')
        const result = await loadDataSourceForNewThread(input)
        markAgentPerformancePhase(operationId, 'ensure_provider_session_done', {
          details: {
            endpointChanged: Boolean(result.endpoint && result.endpoint !== endpoint),
          },
        })
        if (result.dataSource) {
          nextDataSource = result.dataSource
          setDataSource(result.dataSource)
          setEndpoint(result.endpoint)
        }
      }
      const {
        workspaceContext,
        useDraftModeSettings,
        ...threadInput
      } = input
      const runProfile = threadInput.runProfile ?? agentRunProfilePresetById(profilePresetId)
      markAgentPerformancePhase(operationId, 'provider_session_thread_start_request_start')
      const thread = await nextDataSource.startThread({
        ...threadInput,
        runProfile,
        ...(useDraftModeSettings ? buildAgentChatDraftThreadControlOptions({ collaborationMode, goalModeEnabled }) : {}),
        ...selectedModelSelectionForRequest(),
      })
      markAgentPerformancePhase(operationId, 'provider_session_thread_start_request_done', {
        details: {
          threadId: thread.id,
          providerSessionTreeId: thread.providerSessionTreeId?.trim() || undefined,
        },
      })
      markAgentPerformancePhase(operationId, 'provider_session_conversation_create_start')
      registerThreadConversation(thread, {
        ...(workspaceContext ? { workspaceContext } : {}),
        ...(typeof threadInput.projectId === 'number' ? { projectId: threadInput.projectId } : {}),
      })
      upsertThread(thread)
      setActiveThreadIdValue(thread.id)
      markThreadOpen(thread.id)
      setHistoryOpen(false)
      markAgentPerformancePhase(operationId, 'provider_session_conversation_create_done')
      recordAgentPerformanceMetric({
        name: 'frontend_agent_conversation_create_duration_ms',
        value: Math.max(0, performanceNow() - startedMs),
        unit: 'ms',
        labels: {
          provider: dataSource.provider,
          status: 'success',
        },
      })
      finishAgentPerformanceOperation(operationId, 'success', { threadId: thread.id })
      return { thread, dataSource: nextDataSource }
    } catch (nextError) {
      setError(errorMessage(nextError))
      recordAgentPerformanceMetric({
        name: 'frontend_agent_conversation_create_duration_ms',
        value: Math.max(0, performanceNow() - startedMs),
        unit: 'ms',
        labels: {
          provider: dataSource.provider,
          status: 'error',
        },
      })
      finishAgentPerformanceOperation(operationId, 'error', { error: errorMessage(nextError) })
      return null
    }
  }, [collaborationMode, dataSource, endpoint, goalModeEnabled, loadDataSourceForNewThread, markThreadOpen, profilePresetId, registerThreadConversation, selectedModelSelectionForRequest, setActiveThreadIdValue, setDataSource, setEndpoint, setError, setHistoryOpen, upsertThread])

  const startWorkspaceTask = useCallback(async (payload: AgentPanelWorkspacePayload) => {
    if (!dataSource) return
    const normalizedTitle = payload.title?.trim()
    const runProfile = agentRunProfilePresetById(profilePresetId)
    const started = await startThreadResult({
      ...(normalizedTitle ? { title: normalizedTitle } : {}),
      ...(typeof payload.projectId === 'number' ? { projectId: payload.projectId } : {}),
      runProfile,
    })
    if (!started) return
    const { thread, dataSource: taskDataSource } = started
    const providerSessionTreeId = thread.providerSessionTreeId?.trim() || undefined
    try {
      const turn = payload.autoSend && payload.message.trim()
        ? await taskDataSource.startTextTurn({
            threadId: thread.id,
            text: payload.message,
            runProfile,
            ...selectedModelSelectionForRequest(thread),
          })
        : undefined
      if (payload.requestId) {
        notifyAgentPanelRunSettled({
          requestId: payload.requestId,
          status: 'completed',
          thread: {
            id: thread.id,
            providerSessionTreeId,
          },
          ...(turn ? {
            run: {
              id: turn.id,
              threadId: thread.id,
              providerSessionTreeId,
              status: turn.status,
              error: turn.error?.message ?? null,
            },
          } : {}),
        })
      }
    } catch (nextError) {
      if (payload.requestId) {
        notifyAgentPanelRunSettled({
          requestId: payload.requestId,
          status: 'error',
          thread: {
            id: thread.id,
            providerSessionTreeId,
          },
          error: errorMessage(nextError),
        })
      }
      throw nextError
    }
  }, [dataSource, profilePresetId, selectedModelSelectionForRequest, startThreadResult])

  return {
    startThreadResult,
    startWorkspaceTask,
  }
}
