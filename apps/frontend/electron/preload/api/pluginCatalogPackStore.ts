import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createPluginCatalogPackStoreAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'listPluginCatalogPackPlugins' | 'installPluginCatalogPack' | 'uninstallPluginCatalogPack'> {
  return {
    listPluginCatalogPackPlugins: () => ipcRenderer.invoke('plugin-catalog-pack-store:list'),
    installPluginCatalogPack: (input) => ipcRenderer.invoke('plugin-catalog-pack-store:install', input),
    uninstallPluginCatalogPack: (input) => ipcRenderer.invoke('plugin-catalog-pack-store:uninstall', input),
  }
}
