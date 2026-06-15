import { useEffect, useMemo } from 'react'
import {
  AgentModeChatSurface,
  AgentModeChatSurfaceInner,
} from '@/features/agent/components/AgentModeUi'
import { selectAgentConversationRegistryRecords } from '@movscript/core/agent'

import { AgentUnifiedChatShell, resolveAgentChatShellProvider } from '@/features/agent/components/AgentUnifiedChatShell'
import { shouldRestoreProjectAgentActiveConversation } from '@/features/agent/presentation/agentModeActiveConversation'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import {
  providerInstanceId,
  providerProtocol,
  useProviderConfigStore,
} from '@/shared/infrastructure/providerConfigStore'

function ProjectAgentChatSurface({ userId }: { userId: string }) {
  const providerSettings = useProviderConfigStore((s) => s.settings)
  const activeConversationId = useAgentSessionStore((s) => s.activeConversationIdsByUser?.[userId] ?? null)
  const conversationsById = useAgentSessionStore((s) => s.conversationsById)
  const activeRegistryState = useMemo(() => ({
    activeConversationIdsByUser: { [userId]: activeConversationId },
    conversationsById,
  }), [activeConversationId, conversationsById, userId])
  const activeProvider = useMemo(
    () => resolveAgentChatShellProvider(providerSettings, userId, activeRegistryState),
    [activeRegistryState, providerSettings, userId],
  )
  const activeProviderIdentity = useMemo(() => ({
    provider: activeProvider.kind,
    providerId: activeProvider.id,
    providerInstanceId: providerInstanceId(activeProvider),
    providerProtocol: providerProtocol(activeProvider),
  }), [activeProvider])
  const setActiveConversation = useAgentSessionStore((s) => s.setActiveConversation)
  const openConversations = useMemo(
    () => selectAgentConversationRegistryRecords(conversationsById, { userId, ...activeProviderIdentity }),
    [activeProviderIdentity, conversationsById, userId],
  )
  const activeConversationOpen = !!activeConversationId
    && openConversations.some((record) => record.id === activeConversationId)
  const emptyThreadLabel = '我们做些什么'

  useEffect(() => {
    if (!shouldRestoreProjectAgentActiveConversation({ activeConversationId, activeConversationOpen })) {
      return
    }
    setActiveConversation(userId, openConversations[0]?.id ?? null)
  }, [activeConversationId, activeConversationOpen, openConversations, setActiveConversation, userId])

  return (
    <AgentModeChatSurface>
      <AgentModeChatSurfaceInner>
        <AgentUnifiedChatShell
          userId={userId}
          emptyThreadLabel={emptyThreadLabel}
          onCollapse={() => { }}
          showCollapse={false}
          host="immersive"
          surface="page"
        />
      </AgentModeChatSurfaceInner>
    </AgentModeChatSurface>
  )
}

export function ProjectAgentModeWorkspace({ userId }: { userId: string }) {
  return (
    <div className="agent-mode-workspace-stack">
      <ProjectAgentChatSurface userId={userId} />
    </div>
  )
}
