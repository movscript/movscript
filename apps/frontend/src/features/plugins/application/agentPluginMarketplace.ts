import type { AgentChatDataSource } from '@/features/agent/domain/agentChatProtocol'
import {
  enabledAgentProviders,
  normalizeAgentProviderSettings,
  useAgentProviderConfigStore,
  type AgentProviderConfig,
} from '@/features/agent/state/agentProviderConfigStore'
import { createAgentChatDataSourceForProvider } from '@/features/agent/application/agentChatDataSourceFactory'

export type AgentPluginSourceType = 'local' | 'git' | 'remote' | 'unknown'

export interface AgentPluginMarketplaceItem {
  key: string
  agentProviderId: string
  agentProviderKind: AgentProviderConfig['kind']
  agentLabel: string
  marketplaceName: string
  marketplaceDisplayName: string
  marketplacePath?: string
  id: string
  name: string
  displayName: string
  version?: string
  description?: string
  developerName?: string
  category?: string
  keywords: string[]
  capabilities: string[]
  sourceType: AgentPluginSourceType
  sourceLabel: string
  sourcePath?: string
  installed: boolean
  enabled: boolean
  installPolicy?: string
  authPolicy?: string
  availability?: string
  remotePluginId?: string
  raw: unknown
}

export interface AgentPluginMarketplaceAgentState {
  provider: AgentProviderConfig
  ok: boolean
  loading?: boolean
  error?: string
  items: AgentPluginMarketplaceItem[]
}

export interface AgentPluginMarketplaceState {
  agents: AgentPluginMarketplaceAgentState[]
  items: AgentPluginMarketplaceItem[]
  errors: Array<{ agentProviderId: string; agentLabel: string; message: string }>
}

export async function loadAgentPluginMarketplaceState(
  providers = enabledAgentProviders(normalizeAgentProviderSettings(useAgentProviderConfigStore.getState().settings)),
): Promise<AgentPluginMarketplaceState> {
  const agents = await Promise.all(providers.map(loadAgentPluginMarketplaceForProvider))
  return {
    agents,
    items: agents.flatMap((agent) => agent.items),
    errors: agents
      .filter((agent) => !agent.ok)
      .map((agent) => ({
        agentProviderId: agent.provider.id,
        agentLabel: agent.provider.label,
        message: agent.error ?? 'Plugin inventory is unavailable.',
      })),
  }
}

export async function installAgentMarketplacePlugin(item: AgentPluginMarketplaceItem): Promise<unknown> {
  const dataSource = await dataSourceForItem(item)
  if (!dataSource.capabilities?.plugins?.install) throw new Error(`${item.agentLabel} does not support plugin install`)
  return dataSource.capabilities.plugins.install(pluginInstallInput(item))
}

export async function uninstallAgentMarketplacePlugin(item: AgentPluginMarketplaceItem): Promise<unknown> {
  const dataSource = await dataSourceForItem(item)
  if (!dataSource.capabilities?.plugins?.uninstall) throw new Error(`${item.agentLabel} does not support plugin uninstall`)
  return dataSource.capabilities.plugins.uninstall({ pluginId: item.id })
}

export async function loadAgentPluginMarketplaceForProvider(provider: AgentProviderConfig): Promise<AgentPluginMarketplaceAgentState> {
  try {
    const dataSource = await createAgentChatDataSourceForProvider(provider, { codexAppServerPolicy: 'status-only' })
    const plugins = dataSource.capabilities?.plugins
    if (!plugins?.list && !plugins?.installed) throw new Error('Agent does not expose plugin/list or plugin/installed')
    const installed = await (plugins.installed?.({}).catch(() => undefined) ?? Promise.resolve(undefined))
    const listed = provider.kind === 'codex'
      ? installed
      : await plugins.list?.({ marketplaceKinds: ['local', 'workspace-directory', 'shared-with-me'] })
    return {
      provider,
      ok: true,
      items: normalizeAgentPluginMarketplace(provider, listed, installed),
    }
  } catch (error) {
    return {
      provider,
      ok: false,
      error: errorMessage(error),
      items: [],
    }
  }
}

export function normalizeAgentPluginMarketplace(
  provider: AgentProviderConfig,
  listed: unknown,
  installed?: unknown,
): AgentPluginMarketplaceItem[] {
  if (isCodexPluginInventory(listed)) {
    const installedKeys = installedPluginKeys(installed)
    return listed.marketplaces.flatMap((marketplace) => {
      const marketplaceName = stringField(marketplace.name) ?? 'local'
      const marketplacePath = stringField(marketplace.path) ?? undefined
      const marketplaceInterface = isRecord(marketplace.interface) ? marketplace.interface : {}
      const marketplaceDisplayName = stringField(marketplaceInterface.displayName) ?? titleCase(marketplaceName)
      const marketplacePlugins = Array.isArray(marketplace.plugins) ? marketplace.plugins.filter(isRecord) : []
      return marketplacePlugins
        .map((plugin) => {
          const pluginName = stringField(plugin.name) ?? stringField(plugin.id) ?? 'unknown'
          const interfaceRecord = isRecord(plugin.interface) ? plugin.interface : {}
          const source = isRecord(plugin.source) ? plugin.source : {}
          const key = agentPluginMarketplaceKey(provider.id, marketplacePath, marketplaceName, pluginName)
          const installedKey = agentPluginMarketplaceKey('', marketplacePath, marketplaceName, pluginName).slice(1)
          const installedHere = booleanField(plugin.installed) || installedKeys.has(installedKey) || installedKeys.has(stringField(plugin.id) ?? '')
          const sourceType = sourceTypeField(source.type)
          const sourcePath = sourceType === 'local'
            ? stringField(source.path)
            : sourceType === 'git'
              ? stringField(source.url) ?? stringField(source.path)
              : undefined
          return {
            key,
            agentProviderId: provider.id,
            agentProviderKind: provider.kind,
            agentLabel: provider.label,
            marketplaceName,
            marketplaceDisplayName,
            ...(marketplacePath ? { marketplacePath } : {}),
            id: stringField(plugin.id) ?? pluginName,
            name: pluginName,
            displayName: stringField(interfaceRecord.displayName) ?? pluginName,
            ...(stringField(plugin.localVersion) ? { version: stringField(plugin.localVersion) } : {}),
            ...(stringField(interfaceRecord.shortDescription) ?? stringField(interfaceRecord.longDescription)
              ? { description: stringField(interfaceRecord.shortDescription) ?? stringField(interfaceRecord.longDescription) }
              : {}),
            ...(stringField(interfaceRecord.developerName) ? { developerName: stringField(interfaceRecord.developerName) } : {}),
            ...(stringField(interfaceRecord.category) ? { category: stringField(interfaceRecord.category) } : {}),
            keywords: stringArray(plugin.keywords),
            capabilities: stringArray(interfaceRecord.capabilities),
            sourceType,
            sourceLabel: sourceLabel(sourceType, sourcePath),
            ...(sourcePath ? { sourcePath } : {}),
            installed: installedHere,
            enabled: booleanField(plugin.enabled) !== false,
            ...(stringField(plugin.installPolicy) ? { installPolicy: stringField(plugin.installPolicy) } : {}),
            ...(stringField(plugin.authPolicy) ? { authPolicy: stringField(plugin.authPolicy) } : {}),
            ...(stringField(plugin.availability) ? { availability: stringField(plugin.availability) } : {}),
            ...(stringField(plugin.remotePluginId) ? { remotePluginId: stringField(plugin.remotePluginId) } : {}),
            raw: plugin,
          }
        })
    })
  }

  if (isRecord(listed) && Array.isArray(listed.plugins)) {
    return listed.plugins.filter(isRecord).map((plugin) => {
      const id = stringField(plugin.id) ?? stringField(plugin.name) ?? 'unknown'
      return {
        key: agentPluginMarketplaceKey(provider.id, undefined, 'agent-local', id),
        agentProviderId: provider.id,
        agentProviderKind: provider.kind,
        agentLabel: provider.label,
        marketplaceName: 'agent-local',
        marketplaceDisplayName: 'Agent Local',
        id,
        name: stringField(plugin.name) ?? id,
        displayName: stringField(plugin.name) ?? id,
        ...(stringField(plugin.version) ? { version: stringField(plugin.version) } : {}),
        ...(stringField(plugin.description) ? { description: stringField(plugin.description) } : {}),
        ...(stringField(plugin.author) ? { developerName: stringField(plugin.author) } : {}),
        keywords: [],
        capabilities: [],
        sourceType: 'local',
        sourceLabel: 'Local',
        installed: true,
        enabled: true,
        raw: plugin,
      }
    })
  }

  return []
}

function installedPluginKeys(installed: unknown): Set<string> {
  const keys = new Set<string>()
  if (!isCodexPluginInventory(installed)) return keys
  for (const marketplace of installed.marketplaces) {
    const marketplaceName = stringField(marketplace.name) ?? 'local'
    const marketplacePath = stringField(marketplace.path) ?? undefined
    const marketplacePlugins = Array.isArray(marketplace.plugins) ? marketplace.plugins.filter(isRecord) : []
    for (const plugin of marketplacePlugins) {
      const pluginName = stringField(plugin.name) ?? stringField(plugin.id)
      if (!pluginName) continue
      keys.add(agentPluginMarketplaceKey('', marketplacePath, marketplaceName, pluginName).slice(1))
      const pluginId = stringField(plugin.id)
      if (pluginId) keys.add(pluginId)
    }
  }
  return keys
}

async function dataSourceForItem(item: AgentPluginMarketplaceItem): Promise<AgentChatDataSource> {
  const providers = enabledAgentProviders(normalizeAgentProviderSettings(useAgentProviderConfigStore.getState().settings))
  const provider = providers.find((candidate) => candidate.id === item.agentProviderId)
  if (!provider) throw new Error(`Agent provider is not enabled: ${item.agentLabel}`)
  return createAgentChatDataSourceForProvider(provider)
}

function pluginInstallInput(item: AgentPluginMarketplaceItem): Record<string, unknown> {
  return {
    pluginName: item.name,
    ...(item.marketplacePath ? { marketplacePath: item.marketplacePath } : { remoteMarketplaceName: item.marketplaceName }),
  }
}

function agentPluginMarketplaceKey(
  providerId: string,
  marketplacePath: string | undefined,
  marketplaceName: string,
  pluginName: string,
): string {
  return [providerId, marketplacePath ?? marketplaceName, pluginName].join(':')
}

function isCodexPluginInventory(value: unknown): value is { marketplaces: Array<Record<string, unknown>> } {
  return isRecord(value) && Array.isArray(value.marketplaces)
}

function sourceTypeField(value: unknown): AgentPluginSourceType {
  return value === 'local' || value === 'git' || value === 'remote' ? value : 'unknown'
}

function sourceLabel(type: AgentPluginSourceType, path?: string): string {
  if (type === 'local') return path ? `Local · ${path}` : 'Local'
  if (type === 'git') return path ? `Git · ${path}` : 'Git'
  if (type === 'remote') return 'Remote'
  return 'Unknown'
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ') || value
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function booleanField(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
