import type { ClientPluginManifest } from '@/features/plugins/application/clientPlugins'

export interface EnsureBundledClientPluginsResult {
  pluginId: string
  status: 'already_installed' | 'installed' | 'pack_store_failed'
  manifest: ClientPluginManifest
  install?: unknown
  error?: string
}

export interface EnsureBundledClientPluginsDeps {
  loadPlugins?: () => Promise<ClientPluginManifest[]>
  savePlugin?: (plugin: ClientPluginManifest) => Promise<void>
  uninstallAgentCatalogPack?: (input: { pluginId: string }, signal?: AbortSignal) => Promise<unknown>
  now?: () => string
  signal?: AbortSignal
}

export async function ensureBundledClientPluginsInstalled(
  _deps: EnsureBundledClientPluginsDeps = {}
): Promise<EnsureBundledClientPluginsResult[]> {
  return []
}
