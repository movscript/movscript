import { join } from 'node:path'
import { MOVSCRIPT_BUNDLED_PLUGIN_KEY } from './agentCapabilityResolver'
import type { AppServerConnection } from './appServerRuntimeConnection'
import type { AppServerRuntimeContext } from './appServerRuntimeContext'
import { installAgentRuntimeBundledPlugin } from './agentRuntimeBundledPluginCatalog'

const MOVSCRIPT_BUNDLED_PLUGIN_NAME = 'movscript'
const MOVSCRIPT_BUNDLED_MARKETPLACE_NAME = 'movscript-bundled'
const appServerBundledPluginInstallPromises = new Map<string, Promise<void>>()

export interface AppServerBundledPluginInstallerOptions {
  installBundledPlugin?: typeof installAgentRuntimeBundledPlugin
  warn?: (message: string, error?: unknown) => void
}

export async function ensureAppServerBundledPluginInstalled(
  connection: Pick<AppServerConnection, 'request'>,
  context: Pick<AppServerRuntimeContext, 'api' | 'kind' | 'workspaceDir'>,
  options: AppServerBundledPluginInstallerOptions = {},
): Promise<void> {
  if (!context.workspaceDir.trim()) return
  const key = appServerBundledPluginInstallKey(context)
  const current = appServerBundledPluginInstallPromises.get(key)
  if (current) {
    await current
    return
  }

  const pending = installAppServerBundledPlugin(connection, context, options).catch((error) => {
    appServerBundledPluginInstallPromises.delete(key)
    const warn = options.warn ?? defaultWarn
    warn(`Failed to install bundled MovScript plugin for ${context.api}.`, error)
  })
  appServerBundledPluginInstallPromises.set(key, pending)
  await pending
}

export function appServerParamsWithWorkspaceCwd(params: unknown, workspaceDir: string): Record<string, unknown> {
  const record = isRecord(params) ? { ...params } : {}
  const existingCwds = Array.isArray(record.cwds)
    ? record.cwds.flatMap((cwd) => typeof cwd === 'string' && cwd.trim() ? [cwd] : [])
    : []
  return compactParams({
    ...record,
    cwds: uniqueStrings([workspaceDir, ...existingCwds].filter((cwd) => cwd.trim())),
  })
}

export function appServerBundledPluginInstalled(response: unknown): boolean {
  const marketplaces = isRecord(response) && Array.isArray(response.marketplaces)
    ? response.marketplaces
    : []
  return marketplaces.some((marketplace) => {
    const marketplaceName = isRecord(marketplace) && typeof marketplace.name === 'string'
      ? marketplace.name
      : undefined
    const plugins = isRecord(marketplace) && Array.isArray(marketplace.plugins)
      ? marketplace.plugins
      : []
    return plugins.some((plugin) => {
      if (!isRecord(plugin)) return false
      const pluginId = typeof plugin.id === 'string' ? plugin.id : undefined
      const pluginName = typeof plugin.name === 'string' ? plugin.name : undefined
      const matchesMovScript = pluginId === MOVSCRIPT_BUNDLED_PLUGIN_KEY
        || (marketplaceName === MOVSCRIPT_BUNDLED_MARKETPLACE_NAME && pluginName === MOVSCRIPT_BUNDLED_PLUGIN_NAME)
      return matchesMovScript && plugin.installed === true && plugin.enabled !== false
    })
  })
}

export function resetAppServerBundledPluginInstallCacheForTests(): void {
  appServerBundledPluginInstallPromises.clear()
}

async function installAppServerBundledPlugin(
  connection: Pick<AppServerConnection, 'request'>,
  context: Pick<AppServerRuntimeContext, 'workspaceDir'>,
  options: AppServerBundledPluginInstallerOptions,
): Promise<void> {
  const installBundledPlugin = options.installBundledPlugin ?? installAgentRuntimeBundledPlugin
  const installed = installBundledPlugin({ workspaceDir: context.workspaceDir })
  const installedResponse = await connection.request('plugin/installed', appServerParamsWithWorkspaceCwd({
    installSuggestionPluginNames: [installed.pluginName || MOVSCRIPT_BUNDLED_PLUGIN_NAME],
  }, context.workspaceDir))
  if (appServerBundledPluginInstalled(installedResponse)) return

  await connection.request('plugin/install', {
    marketplacePath: preparedProjectMarketplacePath(installed.preparedPaths) ?? fallbackProjectMarketplacePath(context.workspaceDir),
    pluginName: installed.pluginName || MOVSCRIPT_BUNDLED_PLUGIN_NAME,
  })
}

function preparedProjectMarketplacePath(preparedPaths: unknown): string | undefined {
  return isRecord(preparedPaths) && typeof preparedPaths.projectMarketplacePath === 'string' && preparedPaths.projectMarketplacePath.trim()
    ? preparedPaths.projectMarketplacePath
    : undefined
}

function fallbackProjectMarketplacePath(workspaceDir: string): string {
  return join(workspaceDir, '.agents', 'plugins', 'marketplace.json')
}

function appServerBundledPluginInstallKey(context: Pick<AppServerRuntimeContext, 'api' | 'kind' | 'workspaceDir'>): string {
  return [context.api, context.kind, context.workspaceDir].join(':')
}

function compactParams<T extends object>(input: T): T {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) output[key] = value
  }
  return output as T
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

function defaultWarn(message: string, error?: unknown): void {
  console.warn(error ? `${message} ${errorMessage(error)}` : message)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
