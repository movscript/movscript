import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { AgentConversationRegistryRecord } from '@movscript/core/agent'
import type { AgentThreadSummary } from '@movscript/agent-protocol'

import { createAgentChatDataSourceForProvider } from '@/features/agent/application/agentChatDataSourceFactory'
import { openAgentPanelNewConversation } from '@/features/agent/application/agentPanelBridge'
import { agentThreadRegistryProviderIdentity } from '@/features/agent/application/useAgentThreadRegistryHydration'
import { openAgentRuntimeThread } from '@/features/agent/components/AgentRuntimeChatShell'
import {
  agentRuntimeConversationIdForThread,
  agentRuntimeProviderIdentityKey,
} from '@/features/agent/components/ProjectAgentModeConversationModel'
import type { AgentModeProviderIdentity } from '@/features/agent/components/ProjectAgentModeSidebarParts'
import { AGENT_MODE_CONVERSATION_FOCUS_SCOPE } from '@/features/agent/state/agentConversationFocusScope'
import {
  agentConversationRegistryActions,
  readAgentConversationRegistrySnapshot,
} from '@/features/agent/state/agentConversationRegistryStore'
import { useAgentContentAreaStore } from '@/features/agent/state/agentContentAreaStore'
import type { AgentConversationThreadBinding } from '@/features/agent/state/agentSessionRuntimeModel'
import type { Conversation } from '@/features/agent/state/agentStore'
import { ROUTES } from '@/routes/projectRoutes'
import type { ProviderConfig } from '@/shared/infrastructure/providerConfigStore'

const MISSING_ARCHIVED_RUNTIME_THREAD_MESSAGE = 'no archived rollout found'

function isMissingArchivedRuntimeThread(error: unknown): boolean {
  return error instanceof Error && error.message.includes(MISSING_ARCHIVED_RUNTIME_THREAD_MESSAGE)
}

export function useProjectAgentModeSidebarActions({
  activeAgentProvider,
  conversations,
  conversationRecordsById,
  conversationsById,
  conversationThreadBindings,
  providerByIdentityKey,
  providerSessionThreadsByConversationId,
  refetchSourceThreads,
  setNewConversationProviderId,
  userId,
}: {
  activeAgentProvider: ProviderConfig
  conversations: Conversation[]
  conversationRecordsById: Record<string, AgentConversationRegistryRecord>
  conversationsById: Record<string, AgentConversationRegistryRecord>
  conversationThreadBindings: Record<string, AgentConversationThreadBinding>
  providerByIdentityKey: Map<string, ProviderConfig>
  providerSessionThreadsByConversationId: Map<string, AgentThreadSummary>
  refetchSourceThreads: () => Promise<unknown>
  setNewConversationProviderId: (providerId: string) => void
  userId: string
}) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const registryActions = agentConversationRegistryActions()
  const getActiveConversationId = registryActions.getActiveConversationId
  const removeProviderSessionConversation = registryActions.removeProviderSessionConversation
  const setActiveConversation = registryActions.setActiveConversation
  const setConversationOpenInRegistry = registryActions.setConversationOpen
  const removeContentArea = useAgentContentAreaStore((s) => s.removeContentArea)

  function providerForIdentity(identity: Partial<AgentModeProviderIdentity> | undefined): ProviderConfig {
    if (!identity) return activeAgentProvider
    return providerByIdentityKey.get(agentRuntimeProviderIdentityKey(identity)) ?? activeAgentProvider
  }

  function providerForConversation(conversationId: string): ProviderConfig {
    return providerForIdentity(conversationRecordsById[conversationId] ?? conversationsById[conversationId])
  }

  function upsertAgentRuntimeConversationForThread(threadId: string, provider: ProviderConfig, open = true) {
    const providerIdentity = agentThreadRegistryProviderIdentity(provider)
    const conversationId = agentRuntimeConversationIdForThread(threadId, providerIdentity)
    const existing = conversationRecordsById[conversationId] ?? conversationsById[conversationId]
    registryActions.upsertConversation(existing ?? {
      userId,
      ...providerIdentity,
      providerThreadId: threadId,
      open,
      archived: false,
    })
    setConversationOpenInRegistry(userId, conversationId, open, AGENT_MODE_CONVERSATION_FOCUS_SCOPE)
    return conversationId
  }

  function threadIdForConversation(conversation: Conversation) {
    return conversationThreadBindings[conversation.id]?.providerThreadId
      ?? conversation.providerThreadId
      ?? (conversation.id.startsWith('thread_') ? conversation.id : undefined)
  }

  async function agentRuntimeDataSource(provider: ProviderConfig = activeAgentProvider) {
    return createAgentChatDataSourceForProvider(provider)
  }

  async function setRuntimeThreadArchived(threadId: string, archived: boolean, provider: ProviderConfig = activeAgentProvider) {
    const dataSource = await agentRuntimeDataSource(provider)
    if (archived) {
      await dataSource.archiveThread?.({ threadId })
      return true
    }
    try {
      await dataSource.unarchiveThread?.({ threadId })
      return true
    } catch (error) {
      if (isMissingArchivedRuntimeThread(error)) return false
      throw error
    }
  }

  function startNewConversation() {
    openAgentPanelNewConversation({
      workspaceContext: { scope: 'global' },
    })
    navigate(ROUTES.project.agent)
  }

  function selectConversation(id: string) {
    void (async () => {
      const conversation = conversations.find((item) => item.id === id)
      const providerThreadId = conversation?.providerThreadId
        ?? conversationRecordsById[id]?.providerThreadId
        ?? conversationsById[id]?.providerThreadId
        ?? (id.startsWith('thread_') ? id : undefined)
      const targetProvider = providerForConversation(id)
      if (providerThreadId) {
        const providerIdentity = agentThreadRegistryProviderIdentity(targetProvider)
        const conversationId = agentRuntimeConversationIdForThread(providerThreadId, providerIdentity)
        const restored = await setRuntimeThreadArchived(providerThreadId, false, targetProvider)
        if (!restored) {
          removeProviderSessionConversation(userId, conversationId)
          if (id !== conversationId) removeProviderSessionConversation(userId, id)
          removeContentArea(conversationId)
          removeContentArea(id)
          void refetchSourceThreads()
          return
        }
        upsertAgentRuntimeConversationForThread(providerThreadId, targetProvider, true)
        void refetchSourceThreads()
      }
      setNewConversationProviderId(targetProvider.id)
      const conversationId = providerThreadId
        ? agentRuntimeConversationIdForThread(providerThreadId, agentThreadRegistryProviderIdentity(targetProvider))
        : id
      setActiveConversation(userId, conversationId, AGENT_MODE_CONVERSATION_FOCUS_SCOPE)
      setConversationOpenInRegistry(userId, conversationId, true, AGENT_MODE_CONVERSATION_FOCUS_SCOPE)
      if (providerThreadId) {
        window.setTimeout(() => {
          openAgentRuntimeThread({ threadId: providerThreadId, provider: targetProvider })
        }, 0)
      }
      navigate(ROUTES.project.agent)
    })().catch((error) => {
      console.error('[agent] failed to restore agent runtime conversation', error)
    })
  }

  function archiveConversationFromSidebar(conversation: Conversation) {
    void (async () => {
      const providerThreadId = threadIdForConversation(conversation)
      if (providerThreadId && providerSessionThreadsByConversationId.get(conversation.id)?.status === 'running') {
        window.alert(t('agents.chat.stopBeforeClosingConversation'))
        return
      }
      setConversationOpenInRegistry(userId, conversation.id, false, AGENT_MODE_CONVERSATION_FOCUS_SCOPE)
      if (getActiveConversationId(userId, AGENT_MODE_CONVERSATION_FOCUS_SCOPE) === conversation.id) {
        setActiveConversation(userId, null, AGENT_MODE_CONVERSATION_FOCUS_SCOPE)
      }
    })().catch((error) => {
      console.error('[agent] failed to archive agent runtime conversation', error)
    })
  }

  function cleanupDeletedProviderSessionConversations(
    conversationId: string,
    deletedThreadIds: Iterable<string>,
    providerIdentity?: Partial<AgentModeProviderIdentity>,
  ) {
    const deletedThreadIdSet = new Set(deletedThreadIds)
    const sessionState = readAgentConversationRegistrySnapshot()
    const idsToRemove = new Set<string>([conversationId])
    const mappedConversationIds = new Set([
      ...Object.keys(sessionState.conversationThreadBindings),
      ...Object.keys(sessionState.conversationsById),
    ])
    for (const id of mappedConversationIds) {
      const record = sessionState.conversationsById[id]
      if (providerIdentity && record && agentRuntimeProviderIdentityKey(record) !== agentRuntimeProviderIdentityKey(providerIdentity)) continue
      const providerThreadId = sessionState.conversationThreadBindings[id]?.providerThreadId
        ?? record?.providerThreadId
        ?? (id.startsWith('thread_') ? id : undefined)
      if (providerThreadId && deletedThreadIdSet.has(providerThreadId)) idsToRemove.add(id)
    }
    for (const id of idsToRemove) {
      removeProviderSessionConversation(userId, id)
      removeContentArea(id)
    }
  }

  function deleteConversationFromSidebar(conversation: Conversation) {
    void (async () => {
      const providerThreadId = threadIdForConversation(conversation)
      if (!providerThreadId) {
        removeProviderSessionConversation(userId, conversation.id)
        removeContentArea(conversation.id)
        return
      }
      const targetProvider = providerForConversation(conversation.id)
      const dataSource = await agentRuntimeDataSource(targetProvider)
      if (!dataSource.deleteThread) throw new Error(`${targetProvider.label} 不支持删除 thread。`)
      await dataSource.deleteThread({ threadId: providerThreadId })
      cleanupDeletedProviderSessionConversations(conversation.id, [providerThreadId], agentThreadRegistryProviderIdentity(targetProvider))
      void refetchSourceThreads()
    })().catch((error) => {
      console.error('[agent] failed to delete agent runtime conversation', error)
    })
  }

  function deleteHistoryThread(threadId: string, providerIdentity: AgentModeProviderIdentity) {
    void (async () => {
      const targetProvider = providerForIdentity(providerIdentity)
      const dataSource = await agentRuntimeDataSource(targetProvider)
      if (!dataSource.deleteThread) throw new Error(`${targetProvider.label} 不支持删除 thread。`)
      await dataSource.deleteThread({ threadId })
      cleanupDeletedProviderSessionConversations(agentRuntimeConversationIdForThread(threadId, providerIdentity), [threadId], providerIdentity)
      void refetchSourceThreads()
    })().catch((error) => {
      console.error('[agent] failed to delete agent runtime thread', error)
    })
  }

  function restoreHistoryThread(threadId: string, providerIdentity: AgentModeProviderIdentity) {
    const targetProvider = providerForIdentity(providerIdentity)
    const conversationId = upsertAgentRuntimeConversationForThread(threadId, targetProvider, true)
    setNewConversationProviderId(targetProvider.id)
    setConversationOpenInRegistry(userId, conversationId, true, AGENT_MODE_CONVERSATION_FOCUS_SCOPE)
    setActiveConversation(userId, conversationId, AGENT_MODE_CONVERSATION_FOCUS_SCOPE)
    navigate(ROUTES.project.agent)
    window.setTimeout(() => {
      openAgentRuntimeThread({ threadId, provider: targetProvider })
    }, 0)
  }

  return {
    archiveConversationFromSidebar,
    deleteConversationFromSidebar,
    deleteHistoryThread,
    restoreHistoryThread,
    selectConversation,
    startNewConversation,
  }
}
