import { EMPTY_AGENT_CONTEXT_CONFIG } from '@/features/agent/domain/agentContextConfig'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import {
  useAgentStore,
  type Conversation,
} from '@/features/agent/state/agentStore'
import { EMPTY_CONVERSATION_WORKSPACE, useAgentSessionStore } from '@/features/agent/state/agentSessionStore'

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
  const localSessionId = useAgentSessionStore((state) => state.sessionIdsByConversation[conversation.id] ?? conversation.runtimeSessionId ?? state.conversationRuntimes[conversation.id]?.sessionId ?? '')
  const localThreadId = useAgentSessionStore((state) => state.localThreadIdsByConversation[conversation.id] ?? conversation.runtimeThreadId ?? '')
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
    updateConversationTitle,
    updateSettings,
    clearConversationWorkspace,
  }
}
