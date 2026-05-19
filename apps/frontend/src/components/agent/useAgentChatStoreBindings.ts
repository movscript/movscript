import { useMemo } from 'react'
import { EMPTY_AGENT_CONTEXT_CONFIG } from '@/components/agent/AgentContextPanels'
import { useProjectStore } from '@/store/projectStore'
import {
  useAgentStore,
  type AgentAttachment,
  type Conversation,
} from '@/store/agentStore'
import { useAgentSessionStore } from '@/store/agentSessionStore'

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
    setConversationRuntimeThreadId,
    updateConversationTitle,
    updateSettings,
  } = useAgentStore()
  const currentProject = useProjectStore((state) => state.current)
  const conversationRuntime = useAgentSessionStore((state) => state.conversationRuntimes[conversation.id] ?? null)
  const localThreadId = useAgentSessionStore((state) => state.localThreadIdsByConversation[conversation.id] ?? conversation.runtimeThreadId ?? '')
  const setConversationRuntime = useAgentSessionStore((state) => state.setConversationRuntime)
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
    localThreadId,
    setConversationRun,
    setConversationRuntime,
    setConversationRuntimeThreadId,
    setLocalThreadId,
    setPageTaskRunning,
    settings,
    updateConversationTitle,
    updateSettings,
    messageStore,
  }
}
