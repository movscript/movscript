export type ProviderPluginSourceType = 'local' | 'git' | 'remote' | 'unknown'

export interface ProviderPluginMarketplaceProvider {
  id: string
  kind: string
  label: string
}

export interface ProviderPluginMarketplaceItem {
  key: string
  providerId: string
  providerKind: string
  providerLabel: string
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
  sourceType: ProviderPluginSourceType
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

export function normalizeProviderPluginMarketplace(
  provider: ProviderPluginMarketplaceProvider,
  listed: unknown,
  installed?: unknown,
): ProviderPluginMarketplaceItem[] {
  if (isProviderPluginInventory(listed)) {
    const installedKeys = installedProviderPluginMarketplaceKeys(installed)
    return listed.marketplaces.flatMap((marketplace) => {
      const marketplaceName = stringField(marketplace.name) ?? 'local'
      const marketplacePath = stringField(marketplace.path) ?? undefined
      const marketplaceInterface = isRecord(marketplace.interface) ? marketplace.interface : {}
      const marketplaceDisplayName = stringField(marketplaceInterface.displayName) ?? titleCase(marketplaceName)
      const marketplacePlugins = Array.isArray(marketplace.plugins) ? marketplace.plugins.filter(isRecord) : []
      return marketplacePlugins.map((plugin) => {
        const pluginName = stringField(plugin.name) ?? stringField(plugin.id) ?? 'unknown'
        const interfaceRecord = isRecord(plugin.interface) ? plugin.interface : {}
        const source = isRecord(plugin.source) ? plugin.source : {}
        const key = providerPluginMarketplaceKey(provider.id, marketplacePath, marketplaceName, pluginName)
        const installedKey = providerPluginMarketplaceKey('', marketplacePath, marketplaceName, pluginName).slice(1)
        const installedHere = booleanField(plugin.installed) || installedKeys.has(installedKey) || installedKeys.has(stringField(plugin.id) ?? '')
        const sourceType = providerPluginSourceType(source.type)
        const sourcePath = providerPluginSourcePath(sourceType, source)
        return {
          key,
          providerId: provider.id,
          providerKind: provider.kind,
          providerLabel: provider.label,
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
          sourceLabel: providerPluginSourceLabel(sourceType, sourcePath),
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
        key: providerPluginMarketplaceKey(provider.id, undefined, 'provider-local', id),
        providerId: provider.id,
        providerKind: provider.kind,
        providerLabel: provider.label,
        marketplaceName: 'provider-local',
        marketplaceDisplayName: 'Provider Local',
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

export function providerPluginInstallInput(item: Pick<ProviderPluginMarketplaceItem, 'name' | 'marketplaceName' | 'marketplacePath'>): Record<string, unknown> {
  return {
    pluginName: item.name,
    ...(item.marketplacePath ? { marketplacePath: item.marketplacePath } : { remoteMarketplaceName: item.marketplaceName }),
  }
}

export function providerPluginMarketplaceKey(
  providerId: string,
  marketplacePath: string | undefined,
  marketplaceName: string,
  pluginName: string,
): string {
  return [providerId, marketplacePath ?? marketplaceName, pluginName].join(':')
}

export function installedProviderPluginMarketplaceKeys(installed: unknown): Set<string> {
  const keys = new Set<string>()
  if (!isProviderPluginInventory(installed)) return keys
  for (const marketplace of installed.marketplaces) {
    const marketplaceName = stringField(marketplace.name) ?? 'local'
    const marketplacePath = stringField(marketplace.path) ?? undefined
    const marketplacePlugins = Array.isArray(marketplace.plugins) ? marketplace.plugins.filter(isRecord) : []
    for (const plugin of marketplacePlugins) {
      const pluginName = stringField(plugin.name) ?? stringField(plugin.id)
      if (!pluginName) continue
      keys.add(providerPluginMarketplaceKey('', marketplacePath, marketplaceName, pluginName).slice(1))
      const pluginId = stringField(plugin.id)
      if (pluginId) keys.add(pluginId)
    }
  }
  return keys
}

export function providerPluginSourceType(value: unknown): ProviderPluginSourceType {
  return value === 'local' || value === 'git' || value === 'remote' ? value : 'unknown'
}

export function providerPluginSourceLabel(type: ProviderPluginSourceType, path?: string): string {
  if (type === 'local') return path ? `Local · ${path}` : 'Local'
  if (type === 'git') return path ? `Git · ${path}` : 'Git'
  if (type === 'remote') return 'Remote'
  return 'Unknown'
}

function providerPluginSourcePath(type: ProviderPluginSourceType, source: Record<string, unknown>): string | undefined {
  if (type === 'local') return stringField(source.path)
  if (type === 'git') return stringField(source.url) ?? stringField(source.path)
  return undefined
}

function isProviderPluginInventory(value: unknown): value is { marketplaces: Array<Record<string, unknown>> } {
  return isRecord(value) && Array.isArray(value.marketplaces)
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
