import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createAgentCatalogPackStoreAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'listAgentCatalogPackPlugins' | 'installAgentCatalogPack' | 'uninstallAgentCatalogPack'> {
  return {
    listAgentCatalogPackPlugins: () => ipcRenderer.invoke('agent-catalog-pack-store:list'),
    installAgentCatalogPack: (input) => ipcRenderer.invoke('agent-catalog-pack-store:install', input),
    uninstallAgentCatalogPack: (input) => ipcRenderer.invoke('agent-catalog-pack-store:uninstall', input),
  }
}
