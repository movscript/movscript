import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../src/shared/contracts/electronApi'
import { createAgentBrowserAPI } from './api/agentBrowser'
import { createAgentRuntimeAPI } from './api/agentRuntime'
import { createBackendAPI } from './api/backend'
import { createDialogAPI } from './api/dialog'
import { createGenerationToolsAPI } from './api/generationTools'
import { createMCPAPI } from './api/mcp'
import { createSettingsAPI } from './api/settings'
import { createVideoAPI } from './api/video'

export function createElectronAPI(ipcRenderer: IpcRenderer, platform: NodeJS.Platform): ElectronAPI {
  return {
    platform,
    ...createDialogAPI(ipcRenderer),
    ...createMCPAPI(ipcRenderer),
    ...createSettingsAPI(ipcRenderer),
    ...createGenerationToolsAPI(ipcRenderer),
    ...createBackendAPI(ipcRenderer),
    ...createAgentBrowserAPI(ipcRenderer),
    ...createAgentRuntimeAPI(ipcRenderer),
    ...createVideoAPI(ipcRenderer),
  }
}
