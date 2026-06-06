import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { EMPTY_AGENT_CONTEXT_CONFIG } from '@/features/agent/domain/agentContextConfig'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import {
  useAgentStore,
  type Conversation,
} from '@/features/agent/state/agentStore'
import { EMPTY_CONVERSATION_WORKSPACE, useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import { providerSessionClient } from '@/shared/infrastructure/providerSessionClient'
import { providerSessionThreadSummaryFromThread, upsertCachedProviderSessionThread } from '@/features/agent/application/providerSessionThreadQueryCache'
import type { AgentConversationProviderSessionState } from '@/features/agent/state/agentSessionStore'

interface UseAgentChatStoreBindingsInput {
  conversation: Conversation
  userId: string
}

export interface AgentChatProviderSessionBindingIdsInput {
  conversation: Pick<Conversation, 'id' | 'providerSessionId' | 'providerThreadId'>
  conversationProviderSessionState?: Pick<AgentConversationProviderSessionState, 'sessionId' | 'threadId'> | null
  providerSessionId?: string
  providerThreadId?: string
}

export interface AgentChatProviderSessionBindingIds {
  providerSessionId: string
  providerThreadId: string
}

export function useAgentChatStoreBindings({
  conversation,
  userId,
}: UseAgentChatStoreBindingsInput) {
  const queryClient = useQueryClient()
  const {
    settings,
    updateSettings,
  } = useAgentStore()
  const currentProject = useProjectStore((state) => state.current)
  const conversationProviderSessionState = useAgentSessionStore((state) => state.conversationProviderSessionStates[conversation.id] ?? null)
  const storedSessionId = useAgentSessionStore((state) => state.sessionIdsByConversation[conversation.id])
  const storedThreadId = useAgentSessionStore((state) => state.providerThreadIdsByConversation[conversation.id])
  const bindingIds = useMemo(() => resolveAgentChatProviderSessionBindingIds({
    conversation,
    conversationProviderSessionState,
    providerSessionId: storedSessionId,
    providerThreadId: storedThreadId,
  }), [conversation, conversationProviderSessionState, storedSessionId, storedThreadId])
  const providerSessionId = bindingIds.providerSessionId
  const providerThreadId = bindingIds.providerThreadId
  const setConversationSessionId = useAgentSessionStore((state) => state.setConversationSessionId)
  const setConversationProviderSessionState = useAgentSessionStore((state) => state.setConversationProviderSessionState)
  const setConversationProviderSessionId = useAgentSessionStore((state) => state.setConversationProviderSessionId)
  const setConversationProviderThreadId = useAgentSessionStore((state) => state.setConversationProviderThreadId)
  const setConversationRun = useAgentSessionStore((state) => state.setConversationRun)
  const setProviderThreadId = useAgentSessionStore((state) => state.setProviderThreadId)
  const setPageTaskRunning = useAgentSessionStore((state) => state.setPageTaskRunning)
  const updateConversationTitle = useAgentSessionStore((state) => state.updateConversationTitle)
  const workspace = useAgentSessionStore((state) => state.workspacesByUser[userId]?.[conversation.id] ?? EMPTY_CONVERSATION_WORKSPACE)
  const clearConversationWorkspace = useAgentSessionStore((state) => state.clearConversationWorkspace)
  const updateConversationTitleAndPersist = useCallback((targetUserId: string, conversationId: string, title: string) => {
    updateConversationTitle(targetUserId, conversationId, title)
    const trimmed = title.trim()
    const threadId = conversationId === conversation.id ? providerThreadId : ''
    if (!trimmed || !threadId) return
    const client = providerSessionId
      ? providerSessionClient.forSession({ sessionId: providerSessionId })
      : providerSessionClient
    void client.updateThread(threadId, { title: trimmed, metadata: { frontendTitle: trimmed } })
      .then((thread) => upsertCachedProviderSessionThread(queryClient, providerSessionThreadSummaryFromThread(thread)))
      .catch((error) => {
        console.error('[agent] failed to persist provider-session conversation title', error)
      })
  }, [conversation.id, providerSessionId, providerThreadId, queryClient, updateConversationTitle])

  return {
    agentContextConfig: EMPTY_AGENT_CONTEXT_CONFIG,
    conversationProviderSessionState,
    currentProject,
    workspace,
    providerSessionEnabled: true,
    providerSessionId,
    providerThreadId,
    setConversationProviderSessionId,
    setConversationSessionId,
    setConversationRun,
    setConversationProviderSessionState,
    setConversationProviderThreadId,
    setProviderThreadId,
    setPageTaskRunning,
    settings,
    updateConversationTitle: updateConversationTitleAndPersist,
    updateSettings,
    clearConversationWorkspace,
  }
}

export function resolveAgentChatProviderSessionBindingIds(input: AgentChatProviderSessionBindingIdsInput): AgentChatProviderSessionBindingIds {
  return {
    providerSessionId: firstTrimmedString(
      input.providerSessionId,
      input.conversation.providerSessionId,
      input.conversationProviderSessionState?.sessionId,
    ),
    providerThreadId: firstTrimmedString(
      input.providerThreadId,
      input.conversation.providerThreadId,
      input.conversationProviderSessionState?.threadId,
    ),
  }
}

function firstTrimmedString(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  return ''
}
