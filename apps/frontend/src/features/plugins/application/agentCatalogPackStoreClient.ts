import type {
  ElectronAgentCatalogPackFile,
  ElectronAgentCatalogPackInstallInput,
  ElectronAgentCatalogPackInstallResult,
  ElectronAgentCatalogPackPlugin,
  ElectronAgentCatalogPackStoreDirs,
  ElectronAgentCatalogPackUninstallInput,
  ElectronAgentCatalogPackUninstallResult,
} from '@/shared/contracts/electronApi'

export type AgentCatalogPackFile = ElectronAgentCatalogPackFile
export type AgentCatalogPackInstallResult = ElectronAgentCatalogPackInstallResult

export interface AgentCatalogPackStoreClient {
  listAgentCatalogPackPlugins: () => Promise<{ dirs: ElectronAgentCatalogPackStoreDirs; plugins: ElectronAgentCatalogPackPlugin[] }>
  installAgentCatalogPack: (input: ElectronAgentCatalogPackInstallInput, signal?: AbortSignal) => Promise<ElectronAgentCatalogPackInstallResult>
  uninstallAgentCatalogPack: (input: ElectronAgentCatalogPackUninstallInput, signal?: AbortSignal) => Promise<ElectronAgentCatalogPackUninstallResult>
}

export const agentCatalogPackStoreClient: AgentCatalogPackStoreClient = {
  async listAgentCatalogPackPlugins() {
    const api = resolveAgentCatalogPackStoreAPI()
    return api.listAgentCatalogPackPlugins()
  },
  async installAgentCatalogPack(input, signal) {
    throwIfAborted(signal)
    const api = resolveAgentCatalogPackStoreAPI()
    const result = await api.installAgentCatalogPack(input)
    throwIfAborted(signal)
    return result
  },
  async uninstallAgentCatalogPack(input, signal) {
    throwIfAborted(signal)
    const api = resolveAgentCatalogPackStoreAPI()
    const result = await api.uninstallAgentCatalogPack(input)
    throwIfAborted(signal)
    return result
  },
}

function resolveAgentCatalogPackStoreAPI(): Required<Pick<NonNullable<Window['api']>, 'listAgentCatalogPackPlugins' | 'installAgentCatalogPack' | 'uninstallAgentCatalogPack'>> {
  const api = window.api
  if (!api?.listAgentCatalogPackPlugins || !api.installAgentCatalogPack || !api.uninstallAgentCatalogPack) {
    throw new Error('agent catalog pack store is only available in the desktop app')
  }
  return {
    listAgentCatalogPackPlugins: api.listAgentCatalogPackPlugins,
    installAgentCatalogPack: api.installAgentCatalogPack,
    uninstallAgentCatalogPack: api.uninstallAgentCatalogPack,
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return
  throw signal.reason ?? new Error('aborted')
}
