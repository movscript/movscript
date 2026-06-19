import { useMemo } from 'react'

import {
  AgentRuntimeChatShell,
  agentRuntimeThreadScopeKey,
} from '@/features/agent/components/AgentRuntimeChatShell'
import {
  resolveNewConversationProvider,
  useProviderConfigStore,
  type ProviderConfig,
  type ProviderSettings,
} from '@/shared/infrastructure/providerConfigStore'
import {
  activeAgentProfileForRoute,
  agentProfilesFromProviderSettings,
  type AgentProfile,
} from '@/features/agent/application/agentProfileModel'
import type { AgentConversationRegistryState } from '@movscript/core/agent'
import type { AgentConversationFocusScope } from '@/features/agent/state/agentConversationFocusScope'
import type { Project } from '@/types'

export interface AgentUnifiedChatShellProps {
  userId: string
  onCollapse: () => void
  emptyThreadLabel?: string
  showCollapse?: boolean
  host?: 'dock-panel' | 'floating-panel' | 'immersive'
  surface?: 'panel' | 'page'
  currentProject?: Project | null
  conversationFocusScope?: AgentConversationFocusScope
  composerWorkspaceContextLocked?: boolean
  hideComposerWorkspaceProjectSelector?: boolean
}

export function AgentUnifiedChatShell(props: AgentUnifiedChatShellProps) {
  const providerSettings = useProviderConfigStore((s) => s.settings)
  const activeProfile = useMemo(
    () => resolveAgentChatShellProfile(providerSettings, props.userId),
    [providerSettings, props.userId],
  )

  if (!activeProfile) return null

  return (
    <AgentRuntimeChatShell
      key={agentRuntimeThreadScopeKey(activeProfile.provider)}
      userId={props.userId}
      provider={activeProfile.provider}
      emptyThreadLabel={props.emptyThreadLabel}
      host={props.host}
      surface={props.surface}
      currentProject={props.currentProject}
      conversationFocusScope={props.conversationFocusScope}
      composerWorkspaceContextLocked={props.composerWorkspaceContextLocked}
      hideComposerWorkspaceProjectSelector={props.hideComposerWorkspaceProjectSelector}
      showCollapse={props.showCollapse}
      onCollapse={props.onCollapse}
    />
  )
}

export function resolveAgentChatShellProfile(
  settings: ProviderSettings,
  _userId: string,
  _registryState?: AgentConversationRegistryState,
): AgentProfile | undefined {
  const profiles = agentProfilesFromProviderSettings(settings)
  const selectedProvider = resolveNewConversationProvider(settings)
  return profiles.find((profile) => profile.id === selectedProvider.id)
    ?? activeAgentProfileForRoute(profiles, undefined)
}

export function resolveAgentChatShellProvider(
  settings: ProviderSettings,
  userId: string,
  registryState?: AgentConversationRegistryState,
): ProviderConfig {
  return resolveAgentChatShellProfile(settings, userId, registryState)?.provider
    ?? resolveNewConversationProvider(settings)
}
