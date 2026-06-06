import type { BackendStatus } from '../services/backend'
import { registerEmbeddedBrowserIpcHandlers } from './embeddedBrowserIpc'
import { registerPluginCatalogPackStoreIpcHandlers } from './pluginCatalogPackStoreIpc'
import { registerMovScriptWorkspaceFilesIpcHandlers } from './movscriptWorkspaceFilesIpc'
import { registerMovScriptWorkspaceRootIpcHandlers } from './movscriptWorkspaceRootIpc'
import { registerBackendIpcHandlers } from './backendIpc'
import { registerAppServerIpcHandlers } from './appServerIpc'
import { registerDialogIpcHandlers } from './dialogIpc'
import { registerMCPIpcHandlers } from './mcpIpc'
import { registerMovScriptWorkspaceConfigIpcHandlers } from './movscriptWorkspaceConfigIpc'
import { registerSettingsIpcHandlers } from './settingsIpc'
import { registerVideoIpcHandlers } from './videoIpc'
import { registerWindowIpcHandlers } from './windowIpc'
import { registerProviderSessionsIpcHandlers } from './providerSessionsIpc'

export interface IpcHandlerDependencies {
  broadcastBackendStatus: (status: BackendStatus) => void
  ensureMCPServerReady: () => Promise<void>
}

export function registerIpcHandlers(deps: IpcHandlerDependencies): void {
  registerDialogIpcHandlers()
  registerMCPIpcHandlers()
  registerBackendIpcHandlers()
  registerWindowIpcHandlers()
  registerEmbeddedBrowserIpcHandlers()
  registerPluginCatalogPackStoreIpcHandlers()
  registerSettingsIpcHandlers(deps)
  registerMovScriptWorkspaceConfigIpcHandlers()
  registerMovScriptWorkspaceRootIpcHandlers()
  registerMovScriptWorkspaceFilesIpcHandlers()
  registerProviderSessionsIpcHandlers()
  registerAppServerIpcHandlers()
  registerVideoIpcHandlers()
}
