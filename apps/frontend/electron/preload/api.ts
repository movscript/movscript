import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../src/shared/contracts/electronApi'
import { createEmbeddedBrowserAPI } from './api/embeddedBrowser'
import { createPluginCatalogPackStoreAPI } from './api/pluginCatalogPackStore'
import { createBackendAPI } from './api/backend'
import { createAppServerAPI } from './api/appServer'
import { createDialogAPI } from './api/dialog'
import { createMCPAPI } from './api/mcp'
import { createMovScriptWorkspaceAPI } from './api/movscriptWorkspace'
import { createSettingsAPI } from './api/settings'
import { createVideoAPI } from './api/video'
import { createWindowAPI } from './api/window'

export function createElectronAPI(ipcRenderer: IpcRenderer, platform: NodeJS.Platform): ElectronAPI {
  return {
    platform,
    ...createDialogAPI(ipcRenderer),
    ...createMCPAPI(ipcRenderer),
    ...createSettingsAPI(ipcRenderer),
    ...createBackendAPI(ipcRenderer),
    ...createWindowAPI(ipcRenderer),
    ...createEmbeddedBrowserAPI(ipcRenderer),
    ...createPluginCatalogPackStoreAPI(ipcRenderer),
    ...createMovScriptWorkspaceAPI(ipcRenderer),
    ...createAppServerAPI(ipcRenderer),
    ...createVideoAPI(ipcRenderer),
  }
}
