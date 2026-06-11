import type { AgentChatDataSource } from '@movscript/core/agent/chat'
import {
  normalizeProviderPluginMarketplace,
  providerPluginInstallInput,
  type ProviderPluginMarketplaceItem,
  type ProviderPluginSourceType,
} from '@movscript/core/plugins'
import {
  enabledProviders,
  normalizeProviderSettings,
  usesAppServerProtocol,
  useProviderConfigStore,
  type ProviderConfig,
} from '@/shared/infrastructure/providerConfigStore'
import { createAgentChatDataSourceForProvider } from '@/features/agent/application/agentChatDataSourceFactory'

export { normalizeProviderPluginMarketplace }
export type { ProviderPluginMarketplaceItem, ProviderPluginSourceType }

export interface ProviderPluginMarketplaceProviderState {
  provider: ProviderConfig
  ok: boolean
  loading?: boolean
  error?: string
  items: ProviderPluginMarketplaceItem[]
}

export interface ProviderPluginMarketplaceState {
  providers: ProviderPluginMarketplaceProviderState[]
  items: ProviderPluginMarketplaceItem[]
  errors: Array<{ providerId: string; providerLabel: string; message: string }>
}

export async function loadProviderPluginMarketplaceState(
  providers = enabledProviders(normalizeProviderSettings(useProviderConfigStore.getState().settings)),
): Promise<ProviderPluginMarketplaceState> {
  const providerStates = await Promise.all(providers.map(loadProviderPluginMarketplaceForProvider))
  return {
    providers: providerStates,
    items: providerStates.flatMap((providerState) => providerState.items),
    errors: providerStates
      .filter((providerState) => !providerState.ok)
      .map((providerState) => ({
        providerId: providerState.provider.id,
        providerLabel: providerState.provider.label,
        message: providerState.error ?? 'Plugin inventory is unavailable.',
      })),
  }
}

export async function installProviderMarketplacePlugin(item: ProviderPluginMarketplaceItem): Promise<unknown> {
  const dataSource = await dataSourceForItem(item)
  if (!dataSource.capabilities?.plugins?.install) throw new Error(`${item.providerLabel} does not support plugin install`)
  return dataSource.capabilities.plugins.install(providerPluginInstallInput(item))
}

export async function uninstallProviderMarketplacePlugin(item: ProviderPluginMarketplaceItem): Promise<unknown> {
  const dataSource = await dataSourceForItem(item)
  if (!dataSource.capabilities?.plugins?.uninstall) throw new Error(`${item.providerLabel} does not support plugin uninstall`)
  return dataSource.capabilities.plugins.uninstall({ pluginId: item.id })
}

export async function loadProviderPluginMarketplaceForProvider(provider: ProviderConfig): Promise<ProviderPluginMarketplaceProviderState> {
  try {
    const dataSource = await createAgentChatDataSourceForProvider(provider, { appServerPolicy: 'status-only' })
    const plugins = dataSource.capabilities?.plugins
    if (!plugins?.list && !plugins?.installed) throw new Error('Provider does not expose plugin/list or plugin/installed')
    const installed = await (plugins.installed?.({}).catch(() => undefined) ?? Promise.resolve(undefined))
    const listed = usesAppServerProtocol(provider)
      ? installed
      : await plugins.list?.({ marketplaceKinds: ['local', 'workspace-directory', 'shared-with-me'] })
    return {
      provider,
      ok: true,
      items: normalizeProviderPluginMarketplace(provider, listed, installed),
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

async function dataSourceForItem(item: ProviderPluginMarketplaceItem): Promise<AgentChatDataSource> {
  const providers = enabledProviders(normalizeProviderSettings(useProviderConfigStore.getState().settings))
  const provider = providers.find((candidate) => candidate.id === item.providerId)
  if (!provider) throw new Error(`Provider is not enabled: ${item.providerLabel}`)
  return createAgentChatDataSourceForProvider(provider)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
