import { useMemo } from 'react'

import {
  AgentRuntimeChatShell,
  agentRuntimeThreadScopeKey,
} from '@/features/agent/components/AgentRuntimeChatShell'
import {
  enabledProviders,
  resolveNewConversationProvider,
  useProviderConfigStore,
  type ProviderConfig,
  type ProviderSettings,
} from '@/shared/infrastructure/providerConfigStore'
import { providerSupportsAgentProfile } from '@/features/agent/application/agentProfileModel'
import type { AgentConversationRegistryState } from '@movscript/core/agent'
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
  const activeProvider = useMemo(
    () => resolveAgentChatShellProvider(providerSettings, props.userId),
    [providerSettings, props.userId],
  )

  if (!providerSupportsAgentProfile(activeProvider)) return null

  return (
    <AgentRuntimeChatShell
      key={agentRuntimeThreadScopeKey(activeProvider)}
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
  _userId: string,
  _registryState?: AgentConversationRegistryState,
): ProviderConfig {
  const selectedProvider = resolveNewConversationProvider(settings)
  const agentChatProviders = enabledProviders(settings).filter(providerSupportsAgentProfile)
  return providerSupportsAgentProfile(selectedProvider)
    ? selectedProvider
    : agentChatProviders[0] ?? selectedProvider
}
