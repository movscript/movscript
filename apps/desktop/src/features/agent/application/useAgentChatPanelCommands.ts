import { useEffect, type Dispatch, type SetStateAction } from 'react'
import {
  consumeAgentPanelNewConversation,
  consumeAgentPanelThread,
  consumeAgentPanelWorkspace,
  subscribeAgentPanelNewConversation,
  subscribeAgentPanelThread,
  subscribeAgentPanelWorkspace,
  type AgentPanelNewConversationPayload,
  type AgentPanelThreadPayload,
  type AgentPanelWorkspacePayload,
} from '@/features/agent/application/agentPanelBridge'
import {
  publishAgentChatThreadOpen,
  subscribeAgentChatThreadOpen,
} from '@/features/agent/application/agentChatThreadBridge'
import {
  errorMessage,
  workspaceContextFromNewConversationPayload,
} from '@/features/agent/presentation/agentChatDataSourceShellModel'
import type { AgentChatDataSource } from '@movscript/agent-chat'

interface UseAgentChatPanelCommandsInput {
  activeThreadId: string | null
  createDraftConversation: (input?: AgentPanelNewConversationPayload) => string
  dataSource?: AgentChatDataSource
  openThread: (threadId: string) => Promise<void>
  openThreadEventName: string
  resetDraftModeSettings: () => void
  setError: Dispatch<SetStateAction<string | null>>
  sourceId: string
  startWorkspaceTask: (payload: AgentPanelWorkspacePayload) => Promise<void>
}

export function useAgentChatPanelCommands({
  activeThreadId,
  createDraftConversation,
  dataSource,
  openThread,
  openThreadEventName,
  resetDraftModeSettings,
  setError,
  sourceId,
  startWorkspaceTask,
}: UseAgentChatPanelCommandsInput): void {
  useEffect(() => {
    publishAgentChatThreadOpen({
      channel: openThreadEventName,
      sourceId,
      threadId: activeThreadId,
    })
  }, [activeThreadId, openThreadEventName, sourceId])

  useEffect(() => {
    return subscribeAgentChatThreadOpen(openThreadEventName, (payload) => {
      if (payload.sourceId === sourceId) return
      const threadId = payload.threadId.trim()
      if (!threadId) return
      void openThread(threadId)
    })
  }, [openThread, openThreadEventName, sourceId])

  useEffect(() => {
    if (!dataSource) return undefined

    function openFromPayload(payload: AgentPanelThreadPayload | undefined) {
      const threadId = payload?.threadId?.trim()
      if (!threadId) return
      void openThread(threadId)
    }

    for (let payload = consumeAgentPanelThread(); payload; payload = consumeAgentPanelThread()) {
      openFromPayload(payload)
    }

    return subscribeAgentPanelThread((payload) => {
      openFromPayload(consumeAgentPanelThread() ?? payload)
    })
  }, [dataSource, openThread])

  useEffect(() => {
    if (!dataSource) return undefined

    function startFromPayload(payload: AgentPanelNewConversationPayload | undefined) {
      const workspaceContext = workspaceContextFromNewConversationPayload(payload)
      resetDraftModeSettings()
      createDraftConversation({
        ...(payload?.title?.trim() ? { title: payload.title.trim() } : {}),
        ...(typeof payload?.projectId === 'number' ? { projectId: payload.projectId } : {}),
        ...(workspaceContext ? { workspaceContext } : {}),
      })
    }

    for (let payload = consumeAgentPanelNewConversation(); payload; payload = consumeAgentPanelNewConversation()) {
      startFromPayload(payload)
    }

    return subscribeAgentPanelNewConversation((payload) => {
      startFromPayload(consumeAgentPanelNewConversation() ?? payload)
    })
  }, [createDraftConversation, dataSource, resetDraftModeSettings])

  useEffect(() => {
    if (!dataSource) return undefined

    function startFromPayload(payload: AgentPanelWorkspacePayload | undefined) {
      if (!payload) return
      void startWorkspaceTask(payload).catch((nextError) => setError(errorMessage(nextError)))
    }

    for (let payload = consumeAgentPanelWorkspace(); payload; payload = consumeAgentPanelWorkspace()) {
      startFromPayload(payload)
    }

    return subscribeAgentPanelWorkspace((payload) => {
      startFromPayload(consumeAgentPanelWorkspace() ?? payload)
    })
  }, [dataSource, setError, startWorkspaceTask])
}
