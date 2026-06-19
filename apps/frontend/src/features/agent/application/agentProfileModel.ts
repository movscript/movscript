import {
  providerRuntimeProfile,
  type ProviderConfig,
  type ProviderSettings,
} from '@/shared/infrastructure/providerConfigStore'
import { providerRuntimeApiContract } from '@/shared/infrastructure/providerRuntimeApiCatalog'
import { providerRouteForKey, providerRouteKey } from '@/features/agent/application/providerRoutes'

export type AgentProfileConnectionKind = 'sdk' | 'unavailable'

export interface AgentProfile {
  id: string
  routeKey: string
  label: string
  enabled: boolean
  current: boolean
  provider: ProviderConfig
  connectionKind: AgentProfileConnectionKind
  connectionLabel: string
  detail: string
  route: string
}

export function agentProfilesFromProviderSettings(settings: ProviderSettings): AgentProfile[] {
  return settings.providers
    .filter(providerSupportsAgentProfile)
    .map((provider) => agentProfileFromProvider(provider, settings.defaultProviderId))
}

export function agentProfileFromProvider(provider: ProviderConfig, currentProviderId?: string): AgentProfile {
  const routeKey = providerRouteKey(provider)
  const connectionKind = agentProfileConnectionKind(provider)
  return {
    id: provider.id,
    routeKey,
    label: provider.label,
    enabled: provider.enabled,
    current: provider.id === currentProviderId,
    provider,
    connectionKind,
    connectionLabel: agentProfileConnectionLabel(connectionKind),
    detail: agentProfileDetail(provider, connectionKind),
    route: providerRouteForKey(routeKey),
  }
}

export function activeAgentProfileForRoute(
  profiles: AgentProfile[],
  routeKey: string | undefined,
): AgentProfile | undefined {
  if (routeKey) {
    const active = profiles.find((profile) => profile.routeKey === routeKey)
    if (active) return active
  }
  return profiles.find((profile) => profile.current)
    ?? profiles.find((profile) => profile.enabled)
    ?? profiles[0]
}

export function fallbackAgentProfileRoute(settings: ProviderSettings): string {
  const profiles = agentProfilesFromProviderSettings(settings)
  const profile = activeAgentProfileForRoute(profiles, undefined)
  return profile?.route ?? providerRouteForKey('mova')
}

export function providerSupportsAgentProfile(provider: ProviderConfig | undefined): provider is ProviderConfig {
  if (!provider) return false
  const runtime = providerRuntimeProfile(provider)
  return providerRuntimeApiContract(runtime.api)?.transport === 'sdk-client'
}

function agentProfileConnectionKind(provider: ProviderConfig): AgentProfileConnectionKind {
  const runtime = providerRuntimeProfile(provider)
  return providerRuntimeApiContract(runtime.api)?.transport === 'sdk-client' ? 'sdk' : 'unavailable'
}

function agentProfileConnectionLabel(kind: AgentProfileConnectionKind): string {
  if (kind === 'sdk') return 'SDK 连接'
  return '暂不可用'
}

function agentProfileDetail(provider: ProviderConfig, kind: AgentProfileConnectionKind): string {
  if (!provider.enabled) return '已停用，启用后才能设为当前 Agent。'
  if (kind === 'sdk') return '系统在发送消息时按需连接 SDK，不需要手动启动本地进程。'
  return '当前连接方式尚未接入统一 Agent 会话。'
}
