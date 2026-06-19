import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../src/shared/contracts/electronApi'
import { createEmbeddedBrowserAPI } from './api/embeddedBrowser'
import { createPluginCatalogPackStoreAPI } from './api/pluginCatalogPackStore'
import { createProjectPluginStoreAPI } from './api/projectPluginStore'
import { createBackendAPI } from './api/backend'
import { createBackendAuthAPI } from './api/backendAuth'
import { createRuntimeConfigAPI } from './api/runtimeConfig'
import { createAppUpdateAPI } from './api/appUpdate'
import { createSdkRuntimeAPI } from './api/sdkRuntime'
import { createDialogAPI } from './api/dialog'
import { createMCPAPI } from './api/mcp'
import { createMovScriptEngineAPI } from './api/movscriptEngine'
import { createMovScriptWorkspaceAPI } from './api/movscriptWorkspace'
import { createSettingsAPI } from './api/settings'
import { createWindowAPI } from './api/window'
import { createLocalTerminalAPI } from './api/localTerminal'
import { createCrossPageNotificationAPI } from './api/crossPageNotifications'
import { createMediaPipelineAPI } from './api/mediaPipeline'
import { createDockShortcutAPI } from './api/dockShortcuts'
import { createAgentSessionPersistenceAPI } from './api/agentSessionPersistence'
import { createDesktopStateStoreAPI } from './api/desktopStateStore'

export function createElectronAPI(ipcRenderer: IpcRenderer, platform: NodeJS.Platform): ElectronAPI {
  return {
    platform,
    ...createDialogAPI(ipcRenderer),
    ...createMCPAPI(ipcRenderer),
    ...createSettingsAPI(ipcRenderer),
    ...createDesktopStateStoreAPI(ipcRenderer),
    ...createAgentSessionPersistenceAPI(ipcRenderer),
    ...createRuntimeConfigAPI(ipcRenderer),
    ...createBackendAPI(ipcRenderer),
    ...createBackendAuthAPI(ipcRenderer),
    ...createCrossPageNotificationAPI(ipcRenderer),
    ...createAppUpdateAPI(ipcRenderer),
    ...createWindowAPI(ipcRenderer),
    ...createEmbeddedBrowserAPI(ipcRenderer),
    ...createPluginCatalogPackStoreAPI(ipcRenderer),
    ...createProjectPluginStoreAPI(ipcRenderer),
    ...createMovScriptEngineAPI(ipcRenderer),
    ...createMovScriptWorkspaceAPI(ipcRenderer),
    ...createSdkRuntimeAPI(ipcRenderer),
    ...createLocalTerminalAPI(ipcRenderer),
    ...createMediaPipelineAPI(ipcRenderer),
    ...createDockShortcutAPI(ipcRenderer),
  }
}
