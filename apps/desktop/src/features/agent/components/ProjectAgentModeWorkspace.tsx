import { useEffect, useMemo } from 'react'
import {
  AgentModeChatSurface,
  AgentModeChatSurfaceInner,
} from '@/features/agent/components/AgentModeUi'
import { selectAgentConversationRegistryRecords } from '@movscript/core/agent'

import { AgentUnifiedChatShell, resolveAgentChatShellProfile } from '@/features/agent/components/AgentUnifiedChatShell'
import { shouldRestoreProjectAgentActiveConversation } from '@/features/agent/presentation/agentModeActiveConversation'
import {
  agentConversationRegistryActions,
  useAgentActiveConversationId,
  useAgentConversationRecordsById,
} from '@/features/agent/state/agentConversationRegistryStore'
import { AGENT_MODE_CONVERSATION_FOCUS_SCOPE } from '@/features/agent/state/agentConversationFocusScope'
import { useProviderConfigStore } from '@/shared/infrastructure/providerConfigStore'

function ProjectAgentChatSurface({ userId }: { userId: string }) {
  const providerSettings = useProviderConfigStore((s) => s.settings)
  const activeConversationId = useAgentActiveConversationId(userId, AGENT_MODE_CONVERSATION_FOCUS_SCOPE)
  const conversationsById = useAgentConversationRecordsById()
  const activeRegistryState = useMemo(() => ({
    activeConversationIdsByUser: { [userId]: activeConversationId },
    conversationsById,
  }), [activeConversationId, conversationsById, userId])
  const activeProfile = useMemo(
    () => resolveAgentChatShellProfile(providerSettings, userId, activeRegistryState),
    [activeRegistryState, providerSettings, userId],
  )
  const activeProviderProfile = activeProfile?.providerProfile
  const activeProviderIdentity = useMemo(() => ({
    provider: activeProviderProfile?.kind ?? 'mova',
    providerId: activeProviderProfile?.id,
    providerInstanceId: activeProviderProfile?.instanceId,
    providerProtocol: activeProviderProfile?.protocol,
  }), [activeProviderProfile])
  const setActiveConversation = agentConversationRegistryActions().setActiveConversation
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
    setActiveConversation(userId, openConversations[0]?.id ?? null, AGENT_MODE_CONVERSATION_FOCUS_SCOPE)
  }, [activeConversationId, activeConversationOpen, openConversations, setActiveConversation, userId])

  return (
    <AgentModeChatSurface>
      <AgentModeChatSurfaceInner>
        <AgentUnifiedChatShell
          userId={userId}
          conversationFocusScope={AGENT_MODE_CONVERSATION_FOCUS_SCOPE}
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
