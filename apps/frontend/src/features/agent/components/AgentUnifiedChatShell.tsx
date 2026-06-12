import { useMemo } from 'react'

import {
  AppServerChatShell,
} from '@/features/agent/components/AppServerChatShell'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import {
  enabledProviders,
  providerInstanceId,
  providerProtocol,
  resolveNewConversationProvider,
  usesAppServerProtocol,
  useProviderConfigStore,
  type ProviderConfig,
  type ProviderSettings,
} from '@/shared/infrastructure/providerConfigStore'
import { selectActiveAgentConversationRegistryRecord, type AgentConversationRegistryState } from '@movscript/core/agent'

export interface AgentUnifiedChatShellProps {
  userId: string
  onCollapse: () => void
  emptyThreadLabel?: string
  showCollapse?: boolean
  host?: 'dock-panel' | 'floating-panel' | 'immersive'
  surface?: 'panel' | 'page'
}

export function AgentUnifiedChatShell(props: AgentUnifiedChatShellProps) {
  const providerSettings = useProviderConfigStore((s) => s.settings)
  const activeConversationIdsByUser = useAgentSessionStore((state) => state.activeConversationIdsByUser)
  const conversationsById = useAgentSessionStore((state) => state.conversationsById)
  const registryState = useMemo(() => ({
    activeConversationIdsByUser,
    conversationsById,
  }), [activeConversationIdsByUser, conversationsById])
  const activeProvider = useMemo(
    () => resolveAgentChatShellProvider(providerSettings, props.userId, registryState),
    [providerSettings, props.userId, registryState],
  )

  if (!usesAppServerProtocol(activeProvider)) return null

  return (
    <AppServerChatShell
      userId={props.userId}
      provider={activeProvider}
      emptyThreadLabel={props.emptyThreadLabel}
      host={props.host}
      surface={props.surface}
      showCollapse={props.showCollapse}
      onCollapse={props.onCollapse}
    />
  )
}

function resolveAgentChatShellProvider(
  settings: ProviderSettings,
  userId: string,
  registryState: AgentConversationRegistryState,
): ProviderConfig {
  const selectedProvider = resolveNewConversationProvider(settings)
  if (!usesAppServerProtocol(selectedProvider)) return selectedProvider
  if (selectActiveProviderConversation(registryState, userId, selectedProvider)) return selectedProvider
  const activeProvider = enabledProviders(settings)
    .filter(usesAppServerProtocol)
    .find((provider) => selectActiveProviderConversation(registryState, userId, provider))
  return activeProvider ?? selectedProvider
}

function selectActiveProviderConversation(
  registryState: AgentConversationRegistryState,
  userId: string,
  provider: ProviderConfig,
) {
  return selectActiveAgentConversationRegistryRecord(registryState, {
    userId,
    provider: provider.kind,
    providerId: provider.id,
    providerInstanceId: providerInstanceId(provider),
    providerProtocol: providerProtocol(provider),
  })
}
