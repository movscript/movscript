import type { AgentChatDataSource } from '@movscript/core/agent/chat'
import { createAgentChatDataSourceForProvider } from '@/features/agent/application/agentChatDataSourceFactory'
import type { ProviderConfig } from '@/shared/infrastructure/providerConfigStore'

export interface AgentControlCapabilityHealth {
  checkedProviderCount: number
  providerCount: number
  warningCount: number
  toolSummary: AgentControlToolSummary
  skillSummary: AgentControlSkillSummary
  pluginSummary: AgentControlPluginSummary
  providers: AgentControlProviderCapabilityHealth[]
}

export interface AgentControlProviderCapabilityHealth {
  providerId: string
  providerKind: ProviderConfig['kind']
  providerLabel: string
  ok: boolean
  warningCount: number
  credential?: AgentControlCredentialHealth
  toolCount: number
  blockedToolCount: number
  mcpServerCount: number
  mcpToolCount: number
  skillCount: number
  pluginCount: number
  warnings: string[]
}

export interface AgentControlCredentialHealth {
  ok: boolean
  configured: boolean
  env: string
  source: string
  modelEndpointBaseURL?: string
  detail?: string
}

export interface AgentControlToolSummary {
  available: number
  blocked: number
  discovered: number
  warningCount: number
}

export interface AgentControlSkillSummary {
  total: number
  enabled: number
  warningCount: number
}

export interface AgentControlPluginSummary {
  total: number
  enabled: number
  warningCount: number
}

export const EMPTY_AGENT_CONTROL_CAPABILITY_HEALTH: AgentControlCapabilityHealth = {
  checkedProviderCount: 0,
  providerCount: 0,
  warningCount: 0,
  toolSummary: {
    available: 0,
    blocked: 0,
    discovered: 0,
    warningCount: 0,
  },
  skillSummary: {
    total: 0,
    enabled: 0,
    warningCount: 0,
  },
  pluginSummary: {
    total: 0,
    enabled: 0,
    warningCount: 0,
  },
  providers: [],
}

export async function inspectAgentControlProviderCapabilities(providers: ProviderConfig[]): Promise<AgentControlCapabilityHealth> {
  const providerHealth = await Promise.all(providers.map(inspectAgentControlProviderCapability))
  return summarizeAgentControlCapabilityHealth(providerHealth, providers.length)
}

export async function inspectAgentControlDataSourceCapabilities(
  provider: ProviderConfig,
  dataSource: AgentChatDataSource,
): Promise<AgentControlProviderCapabilityHealth> {
  const warnings: string[] = []
  const commandAvailable = Boolean(dataSource.capabilities?.command?.exec)
  const fsAvailable = Boolean(dataSource.capabilities?.fs?.readFile)
  const runtime = dataSource.capabilities?.runtime?.probe
    ? await inspectCapabilityCall('Runtime', () => dataSource.capabilities?.runtime?.probe?.() ?? Promise.resolve(null))
    : okCapabilityCall('Runtime', null)
  const mcp = dataSource.capabilities?.mcp?.listServers
    ? await inspectCapabilityCall('MCP', () => dataSource.capabilities?.mcp?.listServers?.() ?? Promise.resolve(null))
    : okCapabilityCall('MCP', null)
  const plugins = dataSource.capabilities?.plugins?.installed || dataSource.capabilities?.plugins?.list
    ? await inspectCapabilityCall('Plugins', () => inspectAgentControlInstalledPlugins(dataSource))
    : okCapabilityCall('Plugins', null)
  const skills = dataSource.capabilities?.skills?.list
    ? await inspectCapabilityCall('Skills', () => dataSource.capabilities?.skills?.list?.() ?? Promise.resolve(null))
    : okCapabilityCall('Skills', null)

  for (const result of [runtime, mcp, plugins, skills]) {
    if (!result.ok) warnings.push(`${result.label}：${result.error}`)
  }
  const credential = runtime.ok ? agentControlCredentialHealthFromProbe(runtime.value) : undefined
  if (runtime.ok && runtimeProbeFailed(runtime.value) && !credential) {
    warnings.push(`Runtime：${runtimeProbeError(runtime.value) ?? 'Agent runtime probe failed.'}`)
  }
  if (credential && !credential.ok) warnings.push(`Runtime 凭据：${credential.detail ?? `${credential.env} 未配置。`}`)

  const mcpServerCount = mcp.ok ? countMcpServers(mcp.value) : 0
  const mcpToolCount = mcp.ok ? countMcpTools(mcp.value) : 0
  const pluginCount = plugins.ok ? countPluginItems(plugins.value) : 0
  const skillCount = skills.ok ? countSkillItems(skills.value) : 0
  const directToolCount = [commandAvailable, fsAvailable].filter(Boolean).length
  const catalogToolCount = skills.ok ? countResolvedTools(skills.value, 'available') : 0
  const blockedToolCount = skills.ok ? countResolvedTools(skills.value, 'blocked') : 0

  return {
    providerId: provider.id,
    providerKind: provider.kind,
    providerLabel: provider.label,
    ok: warnings.length === 0,
    warningCount: warnings.length,
    ...(credential ? { credential } : {}),
    toolCount: directToolCount + mcpToolCount + catalogToolCount,
    blockedToolCount,
    mcpServerCount,
    mcpToolCount,
    skillCount,
    pluginCount,
    warnings,
  }
}

export function summarizeAgentControlCapabilityHealth(
  providers: AgentControlProviderCapabilityHealth[],
  providerCount: number,
): AgentControlCapabilityHealth {
  const warningCount = providers.reduce((sum, provider) => sum + provider.warningCount, 0)
  const discoveredTools = providers.reduce((sum, provider) => sum + provider.toolCount, 0)
  const blockedTools = providers.reduce((sum, provider) => sum + provider.blockedToolCount, 0)
  const skills = providers.reduce((sum, provider) => sum + provider.skillCount, 0)
  const plugins = providers.reduce((sum, provider) => sum + provider.pluginCount, 0)
  return {
    checkedProviderCount: providers.length,
    providerCount,
    warningCount,
    toolSummary: {
      available: discoveredTools,
      blocked: blockedTools,
      discovered: discoveredTools,
      warningCount,
    },
    skillSummary: {
      total: skills,
      enabled: skills,
      warningCount: providers.filter((provider) => provider.skillCount === 0).length,
    },
    pluginSummary: {
      total: plugins,
      enabled: plugins,
      warningCount: providers.filter((provider) => provider.pluginCount === 0).length,
    },
    providers,
  }
}

async function inspectAgentControlProviderCapability(provider: ProviderConfig): Promise<AgentControlProviderCapabilityHealth> {
  try {
    const dataSource = await createAgentChatDataSourceForProvider(provider)
    return await inspectAgentControlDataSourceCapabilities(provider, dataSource)
  } catch (error) {
    return failedAgentControlProviderCapabilityHealth(provider, error)
  }
}

function failedAgentControlProviderCapabilityHealth(
  provider: ProviderConfig,
  error: unknown,
): AgentControlProviderCapabilityHealth {
  return {
    providerId: provider.id,
    providerKind: provider.kind,
    providerLabel: provider.label,
    ok: false,
    warningCount: 1,
    credential: {
      ok: false,
      configured: false,
      env: '-',
      source: 'unknown',
      detail: capabilityErrorMessage(error),
    },
    toolCount: 0,
    blockedToolCount: 0,
    mcpServerCount: 0,
    mcpToolCount: 0,
    skillCount: 0,
    pluginCount: 0,
    warnings: [capabilityErrorMessage(error)],
  }
}

function agentControlCredentialHealthFromProbe(value: unknown): AgentControlCredentialHealth | undefined {
  if (!isRecord(value)) return undefined
  const raw = isRecord(value.credentials) ? value.credentials : isRecord(value.checks) && isRecord(value.checks.credentials) ? value.checks.credentials : undefined
  if (!raw) return undefined
  const env = stringField(raw.env) ?? '-'
  return {
    ok: raw.ok === true || raw.configured === true,
    configured: raw.configured === true,
    env,
    source: stringField(raw.source) ?? 'unknown',
    ...(stringField(raw.modelEndpointBaseURL) ? { modelEndpointBaseURL: stringField(raw.modelEndpointBaseURL) } : {}),
    ...(stringField(raw.detail) ? { detail: stringField(raw.detail) } : {}),
  }
}

function runtimeProbeFailed(value: unknown): boolean {
  return isRecord(value) && value.ok === false
}

function runtimeProbeError(value: unknown): string | undefined {
  return isRecord(value) ? stringField(value.error) : undefined
}

async function inspectCapabilityCall(label: string, fn: () => Promise<unknown>): Promise<{ ok: true; label: string; value: unknown } | { ok: false; label: string; error: string }> {
  try {
    return { ok: true, label, value: await fn() }
  } catch (error) {
    return { ok: false, label, error: capabilityErrorMessage(error) }
  }
}

function inspectAgentControlInstalledPlugins(dataSource: AgentChatDataSource): Promise<unknown> {
  if (dataSource.capabilities?.plugins?.installed) return dataSource.capabilities.plugins.installed()
  if (dataSource.capabilities?.plugins?.list) return dataSource.capabilities.plugins.list()
  return Promise.resolve(null)
}

function okCapabilityCall(label: string, value: unknown): { ok: true; label: string; value: unknown } {
  return { ok: true, label, value }
}

function countMcpServers(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (!isRecord(value)) return 0
  for (const key of ['servers', 'data', 'items']) {
    const next = value[key]
    if (Array.isArray(next)) return next.length
    if (isRecord(next)) return Object.keys(next).length
  }
  return 0
}

function countMcpTools(value: unknown): number {
  const servers = extractCollection(value, ['servers', 'data', 'items'])
  return servers.reduce<number>((sum, server) => {
    if (!isRecord(server)) return sum
    const tools = server.tools
    if (Array.isArray(tools)) return sum + tools.length
    if (isRecord(tools)) return sum + Object.keys(tools).length
    return sum
  }, 0)
}

function countPluginItems(value: unknown): number {
  return extractCollection(value, ['plugins', 'installed', 'data', 'items']).length
}

function countSkillItems(value: unknown): number {
  const entries = extractCollection(value, ['skills', 'data', 'items'])
  if (entries.length > 0 && entries.every((entry) => isRecord(entry) && Array.isArray(entry.skills))) {
    return entries.reduce<number>((sum, entry) => sum + (isRecord(entry) && Array.isArray(entry.skills) ? entry.skills.length : 0), 0)
  }
  return entries.length
}

function countResolvedTools(value: unknown, key: 'available' | 'blocked'): number {
  if (!isRecord(value)) return 0
  const resolvedTools = value.resolvedTools
  if (!isRecord(resolvedTools)) return 0
  const tools = resolvedTools[key]
  if (Array.isArray(tools)) return tools.length
  if (isRecord(tools)) return Object.keys(tools).length
  return 0
}

function extractCollection(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value)) return value
  if (!isRecord(value)) return []
  for (const key of keys) {
    const next = value[key]
    if (Array.isArray(next)) return next
    if (isRecord(next)) return Object.values(next)
  }
  return []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function capabilityErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
