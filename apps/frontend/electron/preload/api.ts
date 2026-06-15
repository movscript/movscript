import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../src/shared/contracts/electronApi'
import { createEmbeddedBrowserAPI } from './api/embeddedBrowser'
import { createPluginCatalogPackStoreAPI } from './api/pluginCatalogPackStore'
import { createProjectPluginStoreAPI } from './api/projectPluginStore'
import { createBackendAPI } from './api/backend'
import { createBackendAuthAPI } from './api/backendAuth'
import { createAppUpdateAPI } from './api/appUpdate'
import { createAppServerAPI } from './api/appServer'
import { createDialogAPI } from './api/dialog'
import { createMCPAPI } from './api/mcp'
import { createMovScriptEngineAPI } from './api/movscriptEngine'
import { createMovScriptWorkspaceAPI } from './api/movscriptWorkspace'
import { createSettingsAPI } from './api/settings'
import { createVideoAPI } from './api/video'
import { createWindowAPI } from './api/window'
import { createLocalTerminalAPI } from './api/localTerminal'

export function createElectronAPI(ipcRenderer: IpcRenderer, platform: NodeJS.Platform): ElectronAPI {
  return {
    platform,
    ...createDialogAPI(ipcRenderer),
    ...createMCPAPI(ipcRenderer),
    ...createSettingsAPI(ipcRenderer),
    ...createBackendAPI(ipcRenderer),
    ...createBackendAuthAPI(ipcRenderer),
    ...createAppUpdateAPI(ipcRenderer),
    ...createWindowAPI(ipcRenderer),
    ...createEmbeddedBrowserAPI(ipcRenderer),
    ...createPluginCatalogPackStoreAPI(ipcRenderer),
    ...createProjectPluginStoreAPI(ipcRenderer),
    ...createMovScriptEngineAPI(ipcRenderer),
    ...createMovScriptWorkspaceAPI(ipcRenderer),
    ...createAppServerAPI(ipcRenderer),
    ...createLocalTerminalAPI(ipcRenderer),
    ...createVideoAPI(ipcRenderer),
  }
}
