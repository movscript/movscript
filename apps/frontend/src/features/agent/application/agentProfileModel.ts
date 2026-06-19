import {
  providerInstanceId,
  providerMessageAdapter,
  providerProtocol,
  providerRuntimeProfile,
  type ProviderConfig,
  type ProviderKind,
  type ProviderMessageAdapterKind,
  type ProviderProtocol,
  type ProviderRuntimeApi,
  type ProviderSettings,
} from '@/shared/infrastructure/providerConfigStore'
import {
  runtimeBackendContract,
  type RuntimeBackendCapabilityContract,
  type RuntimeBackendCapabilitySupport,
  type RuntimeBackendContract,
  type RuntimeBackendTransport,
} from '@/shared/infrastructure/providerRuntimeApiCatalog'
import { providerRouteForKey, providerRouteKey } from '@/features/agent/application/providerRoutes'

export type AgentProfileConnectionKind = 'app-server' | 'sdk' | 'unavailable'
export type AgentRuntimeAccountMode = 'auto' | 'backend' | 'direct' | 'none'
export type AgentRuntimeBackendTransport = RuntimeBackendTransport | 'unavailable'
export type AgentRuntimeCapabilitySummaryStatus = 'supported' | 'limited' | 'unavailable'

export interface AgentProviderProfile {
  id: string
  kind: ProviderKind
  instanceId: string
  protocol: ProviderProtocol
  messageAdapter: ProviderMessageAdapterKind
  label: string
  enabled: boolean
}

export interface AgentRuntimeBackendProfile {
  id: string
  api: ProviderRuntimeApi
  label: string
  transport: AgentRuntimeBackendTransport
  capabilitySummary: AgentRuntimeCapabilitySummary
  contract?: RuntimeBackendContract
  packageName?: string
  sdkPackageName?: string
  binaryPackageName?: string
  packageVersion?: string
  executableCommand?: string
  executableEnvVar?: string
  runtimeApiEnvVar?: string
  packageNameEnvVar?: string
  sdkPackageNameEnvVar?: string
  binaryPackageNameEnvVar?: string
  packageVersionEnvVar?: string
}

export interface AgentRuntimeCapabilitySummary {
  status: AgentRuntimeCapabilitySummaryStatus
  supportedCount: number
  totalCount: number
  limitedCount: number
  limitedReasons: string[]
}

export interface AgentRuntimeCredentialHint {
  label: string
  env: string
  placeholder: string
  providerKey: string
  providerKeys: string[]
  support: RuntimeBackendCapabilitySupport
}

export interface AgentRuntimeAccountPolicy {
  mode: AgentRuntimeAccountMode
  backendGateway: boolean
  trustedSide: 'electron'
  rendererCanReadSecret: false
}

export interface AgentProfile {
  id: string
  routeKey: string
  label: string
  enabled: boolean
  current: boolean
  provider: ProviderConfig
  providerProfile: AgentProviderProfile
  runtimeBackend: AgentRuntimeBackendProfile
  accountPolicy: AgentRuntimeAccountPolicy
  credentialHint?: AgentRuntimeCredentialHint
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
  const providerProfile = providerProfileFromProvider(provider)
  const runtimeBackend = runtimeBackendProfileFromProvider(provider)
  const accountPolicy = runtimeAccountPolicyFromProvider(provider, runtimeBackend)
  const credentialHint = runtimeCredentialHintFromProvider(provider, runtimeBackend)
  const connectionKind = agentProfileConnectionKind(runtimeBackend)
  return {
    id: provider.id,
    routeKey,
    label: provider.label,
    enabled: provider.enabled,
    current: provider.id === currentProviderId,
    provider,
    providerProfile,
    runtimeBackend,
    accountPolicy,
    ...(credentialHint ? { credentialHint } : {}),
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
  return providerRuntimeTransportSupportsAgentProfile(runtimeBackendProfileFromProvider(provider).transport)
}

export function providerProfileFromProvider(provider: ProviderConfig): AgentProviderProfile {
  return {
    id: provider.id,
    kind: provider.kind,
    instanceId: providerInstanceId(provider),
    protocol: providerProtocol(provider),
    messageAdapter: providerMessageAdapter(provider),
    label: provider.label,
    enabled: provider.enabled,
  }
}

export function runtimeBackendProfileFromProvider(provider: ProviderConfig): AgentRuntimeBackendProfile {
  const runtime = providerRuntimeProfile(provider)
  const contract = runtimeBackendContract(runtime.api)
  const capabilitySummary = runtimeCapabilitySummaryFromContract(contract)
  return {
    id: runtime.id,
    api: runtime.api,
    label: runtime.label,
    transport: contract?.transport ?? 'unavailable',
    capabilitySummary,
    ...(contract ? { contract } : {}),
    ...(runtime.packageName ? { packageName: runtime.packageName } : {}),
    ...(runtime.sdkPackageName ? { sdkPackageName: runtime.sdkPackageName } : {}),
    ...(runtime.binaryPackageName ? { binaryPackageName: runtime.binaryPackageName } : {}),
    ...(runtime.packageVersion ? { packageVersion: runtime.packageVersion } : {}),
    ...(runtime.executableCommand ? { executableCommand: runtime.executableCommand } : {}),
    ...(runtime.executableEnvVar ? { executableEnvVar: runtime.executableEnvVar } : {}),
    ...(runtime.apiEnvVar ? { runtimeApiEnvVar: runtime.apiEnvVar } : {}),
    ...(runtime.packageNameEnvVar ? { packageNameEnvVar: runtime.packageNameEnvVar } : {}),
    ...(runtime.sdkPackageNameEnvVar ? { sdkPackageNameEnvVar: runtime.sdkPackageNameEnvVar } : {}),
    ...(runtime.binaryPackageNameEnvVar ? { binaryPackageNameEnvVar: runtime.binaryPackageNameEnvVar } : {}),
    ...(runtime.packageVersionEnvVar ? { packageVersionEnvVar: runtime.packageVersionEnvVar } : {}),
  }
}

export function runtimeCapabilitySummaryFromContract(contract: RuntimeBackendContract | undefined): AgentRuntimeCapabilitySummary {
  const supports = contract ? runtimeCapabilitySupports(contract) : []
  const supportedCount = supports.filter((support) => support.supported && support.level === 'supported').length
  const totalCount = supports.length
  const limitedCount = totalCount - supportedCount
  return {
    status: totalCount === 0 || supportedCount === 0
      ? 'unavailable'
      : limitedCount > 0
        ? 'limited'
        : 'supported',
    supportedCount,
    totalCount,
    limitedCount,
    limitedReasons: supports
      .filter((support) => !(support.supported && support.level === 'supported'))
      .map((support) => support.reason)
      .filter((reason): reason is string => Boolean(reason?.trim())),
  }
}

export function runtimeAccountPolicyFromProvider(
  provider: ProviderConfig,
  runtimeBackend: AgentRuntimeBackendProfile = runtimeBackendProfileFromProvider(provider),
): AgentRuntimeAccountPolicy {
  const accountSupport = runtimeBackend.contract?.support.capabilities.account
  if (runtimeBackend.transport === 'app-server' && accountSupport?.supported !== false) {
    return accountPolicy('backend', true)
  }
  if (runtimeCredentialHintFromProvider(provider, runtimeBackend)) {
    return accountPolicy('direct', false)
  }
  if (runtimeBackend.transport === 'sdk-client') {
    return accountPolicy('auto', true)
  }
  return accountPolicy('none', false)
}

export function runtimeCredentialHintFromProvider(
  provider: ProviderConfig,
  runtimeBackend: AgentRuntimeBackendProfile = runtimeBackendProfileFromProvider(provider),
): AgentRuntimeCredentialHint | undefined {
  const accountSupport = runtimeBackend.contract?.support.capabilities.account
  const credentialProfile = runtimeCredentialProfile(runtimeBackend.api)
  if (!credentialProfile || accountSupport?.supported !== false) return undefined
  return {
    ...credentialProfile,
    providerKey: provider.id || runtimeBackend.api,
    providerKeys: runtimeCredentialProviderKeys(provider.id, runtimeBackend.api, credentialProfile.aliases),
    support: accountSupport,
  }
}

function agentProfileConnectionKind(runtimeBackend: AgentRuntimeBackendProfile): AgentProfileConnectionKind {
  if (runtimeBackend.transport === 'app-server') return 'app-server'
  if (runtimeBackend.transport === 'sdk-client') return 'sdk'
  return 'unavailable'
}

function agentProfileConnectionLabel(kind: AgentProfileConnectionKind): string {
  if (kind === 'app-server') return 'app-server 连接'
  if (kind === 'sdk') return 'SDK 连接'
  return '暂不可用'
}

function agentProfileDetail(provider: ProviderConfig, kind: AgentProfileConnectionKind): string {
  if (!provider.enabled) return '已停用，启用后才能设为当前 Agent。'
  if (kind === 'app-server') return '系统通过 Runtime Host 按需连接 app-server，交互、工具审批和状态同步由 app-server 协议承载。'
  if (kind === 'sdk') return '系统在发送消息时按需连接 SDK，不需要手动启动本地进程。'
  return '当前连接方式尚未接入统一 Agent 会话。'
}

function providerRuntimeTransportSupportsAgentProfile(transport: AgentRuntimeBackendTransport | undefined): boolean {
  return transport === 'sdk-client' || transport === 'app-server'
}

function runtimeCapabilitySupports(contract: RuntimeBackendContract): RuntimeBackendCapabilitySupport[] {
  const keys: Array<keyof RuntimeBackendCapabilityContract> = ['tools', 'permissions', 'mcp', 'config', 'account']
  return keys.map((key) => contract.support.capabilities[key])
}

function accountPolicy(mode: AgentRuntimeAccountMode, backendGateway: boolean): AgentRuntimeAccountPolicy {
  return {
    mode,
    backendGateway,
    trustedSide: 'electron',
    rendererCanReadSecret: false,
  }
}

function runtimeCredentialProfile(api: ProviderRuntimeApi): {
  label: string
  env: string
  placeholder: string
  aliases: string[]
} | undefined {
  if (api === 'claude-sdk') {
    return {
      label: 'Claude API Key',
      env: 'ANTHROPIC_API_KEY',
      placeholder: 'sk-ant-...',
      aliases: ['claude', 'claude-code', 'claude-sdk'],
    }
  }
  return undefined
}

function runtimeCredentialProviderKeys(providerId: string | undefined, runtimeApi: ProviderRuntimeApi, aliases: string[]): string[] {
  return Array.from(new Set([providerId, runtimeApi, ...aliases].filter((key): key is string => Boolean(key?.trim()))))
}
