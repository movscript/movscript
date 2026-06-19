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
  agentChatConversationRecordForThread,
  agentChatConversationWorkspaceIsEmpty,
  agentConversationUsesProviderSession,
  buildAgentChatConversationPatchInput,
  buildAgentChatConversationRegistryIndex,
  buildAgentChatProviderIdentity,
  buildAgentChatThreadDeckOrderUpdates,
} from '@/features/agent/presentation/agentChatDataSourceShellModel'
import {
  agentConversationRegistryActions,
  readAgentConversationRegistrySnapshot,
  useAgentConversationRecordsById,
} from '@/features/agent/state/agentConversationRegistryStore'
import {
  readAgentConversationWorkspace,
  updateAgentConversationWorkspace,
} from '@/features/agent/state/agentConversationDraftStore'
import type {
  MovScriptWorkspaceContext,
  ProviderKind,
  ProviderProtocol,
} from '@/shared/infrastructure/providerConfigStore'
import type { AgentConversationFocusScope } from '@/features/agent/state/agentConversationFocusScope'

interface UseAgentChatConversationRegistryInput {
  dispatchRuntime: Dispatch<AgentChatRuntimeAction>
  provider?: ProviderKind
  providerId?: string
  providerInstanceId?: string
  providerProtocol?: ProviderProtocol
  focusScope?: AgentConversationFocusScope
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
  focusScope,
  readCurrentActiveThreadId,
  setActiveThreadIdValue,
  threadScopeKey,
  userId,
}: UseAgentChatConversationRegistryInput) {
  const conversationsById = useAgentConversationRecordsById()
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
    const providerSessionTreeId = agentConversationUsesProviderSession(providerIdentity)
      ? thread.providerSessionTreeId?.trim() || thread.sessionId?.trim()
      : ''
    agentConversationRegistryActions().upsertConversation(agentConversationRegistryRecordFromChatThread({
      userId,
      ...providerIdentity,
      ...(providerSessionTreeId ? { providerSessionId: providerSessionTreeId } : {}),
      thread,
      ...(input?.workspaceContext ? { workspaceContext: input.workspaceContext } : {}),
      ...(typeof input?.projectId === 'number' ? { projectId: input.projectId } : {}),
    }))
  }, [providerIdentity, userId])

  const syncThreadConversationTitle = useCallback((threadId: string, title: string | null | undefined) => {
    const normalizedThreadId = threadId.trim()
    const normalizedTitle = title?.trim()
    if (!normalizedThreadId || !normalizedTitle) return
    const store = agentConversationRegistryActions()
    const snapshot = readAgentConversationRegistrySnapshot()
    const record = agentChatConversationRecordForThread({
      records: snapshot.conversationsById,
      threadId: normalizedThreadId,
      providerIdentity,
      userId,
    })
    if (record) store.updateConversationTitle(userId, record.id, normalizedTitle)
  }, [providerIdentity, userId])

  const markThreadOpen = useCallback((threadId: string) => {
    const store = agentConversationRegistryActions()
    const conversationId = store.upsertConversation(conversationPatchInputForThread(threadId, true))
    store.setConversationOpen(userId, conversationId, true, focusScope)
    store.setActiveConversation(userId, conversationId, focusScope)
  }, [conversationPatchInputForThread, focusScope, userId])

  const markThreadClosed = useCallback((threadId: string, clearActive: boolean) => {
    const activeThreadClosed = readCurrentActiveThreadId() === threadId
    const store = agentConversationRegistryActions()
    const conversationId = store.upsertConversation(conversationPatchInputForThread(threadId, false))
    store.setConversationOpen(userId, conversationId, false, focusScope)
    if (clearActive || activeThreadClosed) {
      store.setActiveConversation(userId, null, focusScope)
    }
  }, [conversationPatchInputForThread, focusScope, readCurrentActiveThreadId, userId])

  const reorderOpenThreads = useCallback((draggedThreadId: string, targetThreadId: string, position: 'before' | 'after') => {
    const store = agentConversationRegistryActions()
    const snapshot = readAgentConversationRegistrySnapshot()
    const updates = buildAgentChatThreadDeckOrderUpdates({
      draggedThreadId,
      targetThreadId,
      position,
      providerIdentity,
      records: Object.values(snapshot.conversationsById),
      userId,
    })
    if (updates.length > 0) store.setConversationDeckOrders(updates)
  }, [providerIdentity, userId])

  const clearUnavailableActiveThread = useCallback((threadId: string) => {
    if (readCurrentActiveThreadId() === threadId) setActiveThreadIdValue(null)
    markThreadClosed(threadId, true)
  }, [markThreadClosed, readCurrentActiveThreadId, setActiveThreadIdValue])

  const clearUnavailableStoredThread = useCallback((threadId: string): boolean => {
    const store = agentConversationRegistryActions()
    const conversationId = agentChatComposerConversationId(threadScopeKey, threadId)
    const workspace = readAgentConversationWorkspace(userId, conversationId)
    const emptyWorkspace = agentChatConversationWorkspaceIsEmpty(workspace)

    if (!emptyWorkspace) {
      const draftConversationId = agentChatComposerConversationId(threadScopeKey, null)
      updateAgentConversationWorkspace(userId, draftConversationId, workspace)
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
    reorderOpenThreads,
    syncThreadConversationTitle,
    threadOrderIndex,
  }
}
