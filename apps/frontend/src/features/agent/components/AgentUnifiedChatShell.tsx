import { useMemo } from 'react'

import {
  AppServerChatShell,
} from '@/features/agent/components/AppServerChatShell'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import {
  enabledProviders,
  providerInstanceId,
  providerProtocol,
  providerRuntimeProfile,
  providerSupportsAppServerRuntime,
  resolveAppServerProfile,
  resolveNewConversationProvider,
  useProviderConfigStore,
  type ProviderConfig,
  type ProviderSettings,
} from '@/shared/infrastructure/providerConfigStore'
import { providerRuntimeApiContract } from '@/shared/infrastructure/providerRuntimeApiCatalog'
import { selectActiveAgentConversationRegistryRecord, type AgentConversationRegistryState } from '@movscript/core/agent'
import type { Project } from '@/types'

export interface AgentUnifiedChatShellProps {
  userId: string
  onCollapse: () => void
  emptyThreadLabel?: string
  showCollapse?: boolean
  host?: 'dock-panel' | 'floating-panel' | 'immersive'
  surface?: 'panel' | 'page'
  currentProject?: Project | null
  composerWorkspaceContextLocked?: boolean
  hideComposerWorkspaceProjectSelector?: boolean
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

  if (!providerSupportsAgentChatRuntime(activeProvider)) return null

  return (
    <AppServerChatShell
      userId={props.userId}
      provider={activeProvider}
      emptyThreadLabel={props.emptyThreadLabel}
      host={props.host}
      surface={props.surface}
      currentProject={props.currentProject}
      composerWorkspaceContextLocked={props.composerWorkspaceContextLocked}
      hideComposerWorkspaceProjectSelector={props.hideComposerWorkspaceProjectSelector}
      showCollapse={props.showCollapse}
      onCollapse={props.onCollapse}
    />
  )
}

export function resolveAgentChatShellProvider(
  settings: ProviderSettings,
  userId: string,
  registryState: AgentConversationRegistryState,
): ProviderConfig {
  const selectedProvider = resolveNewConversationProvider(settings)
  if (selectActiveProviderConversation(registryState, userId, selectedProvider)) return selectedProvider
  const agentChatProviders = enabledProviders(settings).filter(providerSupportsAgentChatRuntime)
  const activeProvider = agentChatProviders
    .find((provider) => selectActiveProviderConversation(registryState, userId, provider))
  if (activeProvider) return activeProvider
  return providerSupportsAgentChatRuntime(selectedProvider)
    ? selectedProvider
    : agentChatProviders[0] ?? selectedProvider
}

function providerSupportsAgentChatRuntime(provider: ProviderConfig | undefined): boolean {
  if (!provider) return false
  if (providerSupportsAppServerRuntime(provider)) return true
  return providerRuntimeApiContract(providerRuntimeProfile(provider).api)?.transport === 'sdk-client'
}

function selectActiveProviderConversation(
  registryState: AgentConversationRegistryState,
  userId: string,
  provider: ProviderConfig,
) {
  const activeRecord = selectActiveAgentConversationRegistryRecord(registryState, {
    userId,
    provider: provider.kind,
    providerId: provider.id,
    providerInstanceId: providerInstanceId(provider),
    providerProtocol: providerProtocol(provider),
  })
  if (activeRecord) return activeRecord
  if (providerProtocol(provider) !== 'app-server') return undefined
  return selectActiveAgentConversationRegistryRecord(registryState, {
    userId,
    provider: provider.kind,
    providerId: provider.id,
    providerInstanceId: resolveAppServerProfile(provider).id,
    providerProtocol: 'app-server',
  })
}
