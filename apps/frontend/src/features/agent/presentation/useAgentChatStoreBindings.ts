import { useMemo } from 'react'
import { EMPTY_AGENT_CONTEXT_CONFIG } from '@/features/agent/domain/agentContextConfig'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import {
  useAgentStore,
  type AgentAttachment,
  type Conversation,
} from '@/features/agent/state/agentStore'
import { EMPTY_CONVERSATION_DRAFT, useAgentSessionStore } from '@/features/agent/state/agentSessionStore'

interface UseAgentChatStoreBindingsInput {
  conversation: Conversation
  userId: string
}

export function useAgentChatStoreBindings({
  conversation,
  userId,
}: UseAgentChatStoreBindingsInput) {
  const {
    settings,
    updateSettings,
  } = useAgentStore()
  const currentProject = useProjectStore((state) => state.current)
  const conversationRuntime = useAgentSessionStore((state) => state.conversationRuntimes[conversation.id] ?? null)
  const runtimeThreadProjectionMessages = useAgentSessionStore((state) => state.runtimeThreadProjections[conversation.id]?.messages)
  const transientMessages = useAgentSessionStore((state) => state.transientMessagesByConversation[conversation.id] ?? [])
  const localSessionId = useAgentSessionStore((state) => state.sessionIdsByConversation[conversation.id] ?? conversation.runtimeSessionId ?? state.conversationRuntimes[conversation.id]?.sessionId ?? '')
  const localThreadId = useAgentSessionStore((state) => state.localThreadIdsByConversation[conversation.id] ?? conversation.runtimeThreadId ?? '')
  const setConversationSessionId = useAgentSessionStore((state) => state.setConversationSessionId)
  const setConversationRuntime = useAgentSessionStore((state) => state.setConversationRuntime)
  const setConversationRuntimeSessionId = useAgentSessionStore((state) => state.setConversationRuntimeSessionId)
  const setConversationRuntimeThreadId = useAgentSessionStore((state) => state.setConversationRuntimeThreadId)
  const setRuntimeThreadProjection = useAgentSessionStore((state) => state.setRuntimeThreadProjection)
  const addTransientMessage = useAgentSessionStore((state) => state.addTransientMessage)
  const updateTransientMessageMeta = useAgentSessionStore((state) => state.updateTransientMessageMeta)
  const removeTransientMessage = useAgentSessionStore((state) => state.removeTransientMessage)
  const setConversationRun = useAgentSessionStore((state) => state.setConversationRun)
  const setLocalThreadId = useAgentSessionStore((state) => state.setLocalThreadId)
  const setPageTaskRunning = useAgentSessionStore((state) => state.setPageTaskRunning)
  const updateConversationTitle = useAgentSessionStore((state) => state.updateConversationTitle)
  const draft = useAgentSessionStore((state) => state.draftsByUser[userId]?.[conversation.id] ?? EMPTY_CONVERSATION_DRAFT)
  const clearConversationDraft = useAgentSessionStore((state) => state.clearConversationDraft)
  const messageStore = useMemo(() => ({
    addMessage: (_userId: string, conversationId: string, msg: Parameters<typeof addTransientMessage>[1]) => addTransientMessage(conversationId, msg),
    removeMessage: (_userId: string, conversationId: string, messageId: string) => removeTransientMessage(conversationId, messageId),
    updateMessageMeta: (_userId: string, conversationId: string, messageId: string, meta: Parameters<typeof updateTransientMessageMeta>[2]) => updateTransientMessageMeta(conversationId, messageId, meta),
    clearConversationDraft,
  }), [addTransientMessage, clearConversationDraft, removeTransientMessage, updateTransientMessageMeta])

  return {
    agentContextConfig: EMPTY_AGENT_CONTEXT_CONFIG,
    conversationRuntime,
    currentProject,
    draft,
    localRuntimeEnabled: true,
    localSessionId,
    localThreadId,
    runtimeThreadProjectionMessages,
    transientMessages,
    setConversationRuntimeSessionId,
    setConversationSessionId,
    setConversationRun,
    setConversationRuntime,
    setRuntimeThreadProjection,
    setConversationRuntimeThreadId,
    setLocalThreadId,
    setPageTaskRunning,
    settings,
    updateConversationTitle,
    updateSettings,
    messageStore,
  }
}
