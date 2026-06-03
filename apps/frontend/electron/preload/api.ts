import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../src/shared/contracts/electronApi'
import { createAgentBrowserAPI } from './api/agentBrowser'
import { createAgentCatalogPackStoreAPI } from './api/agentCatalogPackStore'
import { createAgentRuntimeAPI } from './api/agentRuntime'
import { createBackendAPI } from './api/backend'
import { createDialogAPI } from './api/dialog'
import { createMCPAPI } from './api/mcp'
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
    ...createAgentBrowserAPI(ipcRenderer),
    ...createAgentCatalogPackStoreAPI(ipcRenderer),
    ...createAgentRuntimeAPI(ipcRenderer),
    ...createVideoAPI(ipcRenderer),
  }
}
