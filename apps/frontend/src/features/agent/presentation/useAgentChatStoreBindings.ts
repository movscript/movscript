import { useMemo } from 'react'
import { EMPTY_AGENT_CONTEXT_CONFIG } from '@/features/agent/domain/agentContextConfig'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import {
  useAgentStore,
  type AgentAttachment,
  type Conversation,
} from '@/features/agent/state/agentStore'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'

const EMPTY_CONVERSATION_DRAFT: { input: string; attachments: AgentAttachment[] } = {
  input: '',
  attachments: [],
}

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
    addMessage,
    upsertMessage,
    setConversationMessages,
    updateMessageMeta,
    removeMessage,
    setConversationRuntimeSessionId,
    setConversationRuntimeThreadId,
    updateConversationTitle,
    updateSettings,
  } = useAgentStore()
  const currentProject = useProjectStore((state) => state.current)
  const conversationRuntime = useAgentSessionStore((state) => state.conversationRuntimes[conversation.id] ?? null)
  const runtimeThreadProjectionMessages = useAgentSessionStore((state) => state.runtimeThreadProjections[conversation.id]?.messages)
  const localSessionId = useAgentSessionStore((state) => state.sessionIdsByConversation[conversation.id] ?? conversation.runtimeSessionId ?? state.conversationRuntimes[conversation.id]?.sessionId ?? '')
  const localThreadId = useAgentSessionStore((state) => state.localThreadIdsByConversation[conversation.id] ?? conversation.runtimeThreadId ?? '')
  const setConversationSessionId = useAgentSessionStore((state) => state.setConversationSessionId)
  const setConversationRuntime = useAgentSessionStore((state) => state.setConversationRuntime)
  const setRuntimeThreadProjection = useAgentSessionStore((state) => state.setRuntimeThreadProjection)
  const setConversationRun = useAgentSessionStore((state) => state.setConversationRun)
  const setLocalThreadId = useAgentSessionStore((state) => state.setLocalThreadId)
  const setPageTaskRunning = useAgentSessionStore((state) => state.setPageTaskRunning)
  const draft = useAgentStore((state) => state.convsByUser[userId]?.draftsByConversation?.[conversation.id] ?? EMPTY_CONVERSATION_DRAFT)
  const clearConversationDraft = useAgentStore((state) => state.clearConversationDraft)
  const messageStore = useMemo(() => ({
    addMessage,
    upsertMessage,
    removeMessage,
    updateMessageMeta,
    setConversationMessages,
    clearConversationDraft,
  }), [addMessage, clearConversationDraft, removeMessage, setConversationMessages, updateMessageMeta, upsertMessage])

  return {
    agentContextConfig: EMPTY_AGENT_CONTEXT_CONFIG,
    conversationRuntime,
    currentProject,
    draft,
    localRuntimeEnabled: true,
    localSessionId,
    localThreadId,
    runtimeThreadProjectionMessages,
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
