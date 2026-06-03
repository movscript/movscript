import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { EMPTY_AGENT_CONTEXT_CONFIG } from '@/features/agent/domain/agentContextConfig'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import {
  useAgentStore,
  type Conversation,
} from '@/features/agent/state/agentStore'
import { EMPTY_CONVERSATION_WORKSPACE, useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import { localAgentClient } from '@/shared/infrastructure/localAgentClient'
import { runtimeThreadSummaryFromThread, upsertCachedLocalAgentThread } from '@/features/agent/application/agentRuntimeThreadQueryCache'
import type { AgentConversationRuntimeState } from '@/features/agent/state/agentSessionStore'

interface UseAgentChatStoreBindingsInput {
  conversation: Conversation
  userId: string
}

export interface AgentChatRuntimeBindingIdsInput {
  conversation: Pick<Conversation, 'id' | 'runtimeSessionId' | 'runtimeThreadId'>
  conversationRuntime?: Pick<AgentConversationRuntimeState, 'sessionId' | 'threadId'> | null
  localSessionId?: string
  localThreadId?: string
}

export interface AgentChatRuntimeBindingIds {
  localSessionId: string
  localThreadId: string
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
  const conversationRuntime = useAgentSessionStore((state) => state.conversationRuntimes[conversation.id] ?? null)
  const storedSessionId = useAgentSessionStore((state) => state.sessionIdsByConversation[conversation.id])
  const storedThreadId = useAgentSessionStore((state) => state.localThreadIdsByConversation[conversation.id])
  const bindingIds = useMemo(() => resolveAgentChatRuntimeBindingIds({
    conversation,
    conversationRuntime,
    localSessionId: storedSessionId,
    localThreadId: storedThreadId,
  }), [conversation, conversationRuntime, storedSessionId, storedThreadId])
  const localSessionId = bindingIds.localSessionId
  const localThreadId = bindingIds.localThreadId
  const setConversationSessionId = useAgentSessionStore((state) => state.setConversationSessionId)
  const setConversationRuntime = useAgentSessionStore((state) => state.setConversationRuntime)
  const setConversationRuntimeSessionId = useAgentSessionStore((state) => state.setConversationRuntimeSessionId)
  const setConversationRuntimeThreadId = useAgentSessionStore((state) => state.setConversationRuntimeThreadId)
  const setConversationRun = useAgentSessionStore((state) => state.setConversationRun)
  const setLocalThreadId = useAgentSessionStore((state) => state.setLocalThreadId)
  const setPageTaskRunning = useAgentSessionStore((state) => state.setPageTaskRunning)
  const updateConversationTitle = useAgentSessionStore((state) => state.updateConversationTitle)
  const workspace = useAgentSessionStore((state) => state.workspacesByUser[userId]?.[conversation.id] ?? EMPTY_CONVERSATION_WORKSPACE)
  const clearConversationWorkspace = useAgentSessionStore((state) => state.clearConversationWorkspace)
  const updateConversationTitleAndPersist = useCallback((targetUserId: string, conversationId: string, title: string) => {
    updateConversationTitle(targetUserId, conversationId, title)
    const trimmed = title.trim()
    const threadId = conversationId === conversation.id ? localThreadId : ''
    if (!trimmed || !threadId) return
    const runtimeClient = localSessionId
      ? localAgentClient.forSession({ sessionId: localSessionId })
      : localAgentClient
    void runtimeClient.updateThread(threadId, { title: trimmed, metadata: { frontendTitle: trimmed } })
      .then((thread) => upsertCachedLocalAgentThread(queryClient, runtimeThreadSummaryFromThread(thread)))
      .catch((error) => {
        console.error('[agent] failed to persist runtime conversation title', error)
      })
  }, [conversation.id, localSessionId, localThreadId, queryClient, updateConversationTitle])

  return {
    agentContextConfig: EMPTY_AGENT_CONTEXT_CONFIG,
    conversationRuntime,
    currentProject,
    workspace,
    localRuntimeEnabled: true,
    localSessionId,
    localThreadId,
    setConversationRuntimeSessionId,
    setConversationSessionId,
    setConversationRun,
    setConversationRuntime,
    setConversationRuntimeThreadId,
    setLocalThreadId,
    setPageTaskRunning,
    settings,
    updateConversationTitle: updateConversationTitleAndPersist,
    updateSettings,
    clearConversationWorkspace,
  }
}

export function resolveAgentChatRuntimeBindingIds(input: AgentChatRuntimeBindingIdsInput): AgentChatRuntimeBindingIds {
  return {
    localSessionId: firstTrimmedString(
      input.localSessionId,
      input.conversation.runtimeSessionId,
      input.conversationRuntime?.sessionId,
    ),
    localThreadId: firstTrimmedString(
      input.localThreadId,
      input.conversation.runtimeThreadId,
      input.conversationRuntime?.threadId,
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
