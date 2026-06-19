import { useCallback, useMemo, type Dispatch } from 'react'
import {
  agentConversationRegistryRecordFromChatThread,
} from '@movscript/core/agent'
import {
  type AgentChatRuntimeAction,
  type AgentChatThread,
} from '@movscript/core/agent/chat'
import {
  agentChatComposerConversationId,
  agentChatConversationWorkspaceIsEmpty,
  agentConversationUsesProviderSession,
  buildAgentChatConversationPatchInput,
  buildAgentChatConversationRegistryIndex,
  buildAgentChatProviderIdentity,
} from '@/features/agent/presentation/agentChatDataSourceShellModel'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import type {
  MovScriptWorkspaceContext,
  ProviderKind,
  ProviderProtocol,
} from '@/shared/infrastructure/providerConfigStore'

interface UseAgentChatConversationRegistryInput {
  dispatchRuntime: Dispatch<AgentChatRuntimeAction>
  provider?: ProviderKind
  providerId?: string
  providerInstanceId?: string
  providerProtocol?: ProviderProtocol
  readCurrentActiveThreadId: () => string | null
  setActiveThreadIdValue: (threadId: string | null) => void
  threadScopeKey: string
  userId: string
}

export function useAgentChatConversationRegistry({
  dispatchRuntime,
  provider,
  providerId,
  providerInstanceId,
  providerProtocol,
  readCurrentActiveThreadId,
  setActiveThreadIdValue,
  threadScopeKey,
  userId,
}: UseAgentChatConversationRegistryInput) {
  const conversationsById = useAgentSessionStore((state) => state.conversationsById)
  const conversations = useMemo(() => Object.values(conversationsById), [conversationsById])
  const providerIdentity = useMemo(() => buildAgentChatProviderIdentity({
    provider,
    providerId,
    providerInstanceId,
    providerProtocol,
  }), [provider, providerId, providerInstanceId, providerProtocol])

  const {
    closedThreadIds,
    openThreadIds,
    threadOrderIndex,
  } = useMemo(() => buildAgentChatConversationRegistryIndex({
    records: conversations,
    userId,
    providerIdentity,
  }), [conversations, providerIdentity, userId])

  const conversationPatchInputForThread = useCallback((threadId: string, open: boolean) => buildAgentChatConversationPatchInput({
    nowMs: Date.now(),
    open,
    provider,
    providerId,
    providerInstanceId,
    providerProtocol,
    threadId,
    userId,
  }), [provider, providerId, providerInstanceId, providerProtocol, userId])

  const registerThreadConversation = useCallback((thread: Pick<AgentChatThread, 'id' | 'name' | 'preview' | 'status' | 'createdAt' | 'updatedAt' | 'cwd' | 'providerSessionTreeId' | 'sessionId'>, input?: {
    workspaceContext?: MovScriptWorkspaceContext
    projectId?: number
  }) => {
    const threadId = thread.id.trim()
    if (!threadId) return
    const sessionId = agentConversationUsesProviderSession(providerIdentity)
      ? thread.sessionId?.trim() || thread.providerSessionTreeId?.trim()
      : ''
    useAgentSessionStore.getState().upsertConversation(agentConversationRegistryRecordFromChatThread({
      userId,
      ...providerIdentity,
      ...(sessionId ? { providerSessionId: sessionId } : {}),
      thread,
      ...(input?.workspaceContext ? { workspaceContext: input.workspaceContext } : {}),
      ...(typeof input?.projectId === 'number' ? { projectId: input.projectId } : {}),
    }))
  }, [providerIdentity, userId])

  const markThreadOpen = useCallback((threadId: string) => {
    const store = useAgentSessionStore.getState()
    const conversationId = store.upsertConversation(conversationPatchInputForThread(threadId, true))
    store.setConversationOpen(userId, conversationId, true)
    store.setActiveConversation(userId, conversationId)
  }, [conversationPatchInputForThread, userId])

  const markThreadClosed = useCallback((threadId: string, clearActive: boolean) => {
    const activeThreadClosed = readCurrentActiveThreadId() === threadId
    const store = useAgentSessionStore.getState()
    const conversationId = store.upsertConversation(conversationPatchInputForThread(threadId, false))
    store.setConversationOpen(userId, conversationId, false)
    if (clearActive || activeThreadClosed) {
      store.setActiveConversation(userId, null)
    }
  }, [conversationPatchInputForThread, readCurrentActiveThreadId, userId])

  const clearUnavailableActiveThread = useCallback((threadId: string) => {
    if (readCurrentActiveThreadId() === threadId) setActiveThreadIdValue(null)
    markThreadClosed(threadId, true)
  }, [markThreadClosed, readCurrentActiveThreadId, setActiveThreadIdValue])

  const clearUnavailableStoredThread = useCallback((threadId: string): boolean => {
    const store = useAgentSessionStore.getState()
    const conversationId = agentChatComposerConversationId(threadScopeKey, threadId)
    const workspace = store.getConversationWorkspace(userId, conversationId)
    const emptyWorkspace = agentChatConversationWorkspaceIsEmpty(workspace)

    if (!emptyWorkspace) {
      const draftConversationId = agentChatComposerConversationId(threadScopeKey, null)
      store.updateConversationWorkspace(userId, draftConversationId, workspace)
    }

    if (readCurrentActiveThreadId() === threadId) setActiveThreadIdValue(null)
    store.removeProviderSessionConversation(userId, threadId)
    dispatchRuntime({ type: 'removeThread', threadId })
    return emptyWorkspace
  }, [dispatchRuntime, readCurrentActiveThreadId, setActiveThreadIdValue, threadScopeKey, userId])

  return {
    clearUnavailableActiveThread,
    clearUnavailableStoredThread,
    closedThreadIds,
    conversations,
    markThreadClosed,
    markThreadOpen,
    openThreadIds,
    providerIdentity,
    registerThreadConversation,
    threadOrderIndex,
  }
}
