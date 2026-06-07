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
import type { AgentConversationRuntimeState, AgentConversationThreadBinding } from '@/features/agent/state/agentSessionStore'

interface UseAgentChatStoreBindingsInput {
  conversation: Conversation
  userId: string
}

export interface AgentChatProviderSessionBindingIdsInput {
  conversation: Pick<Conversation, 'id' | 'providerSessionId' | 'providerThreadId'>
  conversationThreadBinding?: Pick<AgentConversationThreadBinding, 'providerSessionTreeId' | 'providerThreadId'> | null
  conversationProviderSessionState?: { sessionId?: string; threadId?: string } | null
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
  const conversationThreadBinding = useAgentSessionStore((state) => state.conversationThreadBindings[conversation.id] ?? null)
  const conversationRuntimeState = useAgentSessionStore((state) => state.conversationRuntimeStates[conversation.id] ?? null)
  const conversationProviderSessionState = useAgentSessionStore((state) => state.conversationProviderSessionStates[conversation.id] ?? null)
  const bindingIds = useMemo(() => resolveAgentChatProviderSessionBindingIds({
    conversation,
    conversationThreadBinding,
    conversationProviderSessionState,
  }), [conversation, conversationProviderSessionState, conversationThreadBinding])
  const providerSessionId = bindingIds.providerSessionId
  const providerThreadId = bindingIds.providerThreadId
  const setConversationProviderSessionTreeId = useAgentSessionStore((state) => state.setConversationProviderSessionTreeId)
  const updateConversationRuntimeState = useAgentSessionStore((state) => state.updateConversationRuntimeState)
  const setConversationProviderSessionId = useAgentSessionStore((state) => state.setConversationProviderSessionId)
  const setConversationProviderThreadId = useAgentSessionStore((state) => state.setConversationProviderThreadId)
  const setConversationRun = useAgentSessionStore((state) => state.setConversationRun)
  const setConversationProviderThreadBindingId = useAgentSessionStore((state) => state.setConversationProviderThreadBindingId)
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
    conversationRuntimeState: runtimeStateWithLegacyFallback(conversation.id, conversationRuntimeState, conversationProviderSessionState),
    conversationProviderSessionState,
    currentProject,
    workspace,
    providerSessionEnabled: true,
    providerSessionId,
    providerThreadId,
    updateConversationRuntimeState,
    setConversationProviderSessionId,
    setConversationSessionId: setConversationProviderSessionTreeId,
    setConversationProviderSessionTreeId,
    setConversationRun,
    setConversationProviderThreadId,
    setProviderThreadId: setConversationProviderThreadBindingId,
    setConversationProviderThreadBindingId,
    setPageTaskRunning,
    settings,
    updateConversationTitle: updateConversationTitleAndPersist,
    updateSettings,
    clearConversationWorkspace,
  }
}

function runtimeStateWithLegacyFallback(
  conversationId: string,
  runtimeState: AgentConversationRuntimeState | null,
  legacyState: { run?: AgentConversationRuntimeState['run']; status?: string; loading?: boolean; building?: boolean; approving?: boolean; stopping?: boolean; stopRequested?: boolean; error?: string } | null,
): AgentConversationRuntimeState | null {
  if (!legacyState) return runtimeState
  return {
    conversationId,
    loading: legacyState.loading ?? runtimeState?.loading ?? false,
    building: legacyState.building ?? runtimeState?.building ?? false,
    approving: legacyState.approving ?? runtimeState?.approving ?? false,
    stopping: legacyState.stopping ?? runtimeState?.stopping ?? false,
    stopRequested: legacyState.stopRequested ?? runtimeState?.stopRequested ?? false,
    ...runtimeState,
    ...(legacyState.run && !runtimeState?.run ? { run: legacyState.run, activeRunId: legacyState.run.id } : {}),
    ...(legacyState.status !== undefined && runtimeState?.status === undefined ? { status: legacyState.status } : {}),
    ...(legacyState.error !== undefined && runtimeState?.error === undefined ? { error: legacyState.error } : {}),
    updatedAt: runtimeState?.updatedAt ?? 0,
  }
}

export function resolveAgentChatProviderSessionBindingIds(input: AgentChatProviderSessionBindingIdsInput): AgentChatProviderSessionBindingIds {
  return {
    providerSessionId: firstTrimmedString(
      input.conversationThreadBinding?.providerSessionTreeId,
      input.providerSessionId,
      input.conversation.providerSessionId,
      input.conversationProviderSessionState?.sessionId,
    ),
    providerThreadId: firstTrimmedString(
      input.conversationThreadBinding?.providerThreadId,
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
