import type { BackendStatus } from '../services/backend'
import { registerEmbeddedBrowserIpcHandlers } from './embeddedBrowserIpc'
import { registerPluginCatalogPackStoreIpcHandlers } from './pluginCatalogPackStoreIpc'
import { registerProjectPluginStoreIpcHandlers } from './projectPluginStoreIpc'
import { registerMovScriptWorkspaceFilesIpcHandlers } from './movscriptWorkspaceFilesIpc'
import { registerMovScriptEngineIpcHandlers } from './movscriptEngineIpc'
import { registerMovScriptWorkspaceRootIpcHandlers } from './movscriptWorkspaceRootIpc'
import { registerBackendIpcHandlers } from './backendIpc'
import { registerBackendAuthIpcHandlers } from './backendAuthIpc'
import { registerRuntimeConfigIpcHandlers } from './runtimeConfigIpc'
import { registerAppServerIpcHandlers } from './appServerIpc'
import { registerAppUpdateIpcHandlers } from './appUpdateIpc'
import { registerDialogIpcHandlers } from './dialogIpc'
import { registerMCPIpcHandlers } from './mcpIpc'
import { registerMovScriptWorkspaceConfigIpcHandlers } from './movscriptWorkspaceConfigIpc'
import { registerSettingsIpcHandlers } from './settingsIpc'
import { registerWindowIpcHandlers } from './windowIpc'
import { registerProviderSessionsIpcHandlers } from './providerSessionsIpc'
import { registerProjectGitIpcHandlers } from './projectGitIpc'
import { registerLocalTerminalIpcHandlers } from './localTerminalIpc'
import { registerMediaPipelineIpcHandlers } from './mediaPipelineIpc'
import { registerDockShortcutIpcHandlers } from './dockShortcutIpc'

export interface IpcHandlerDependencies {
  broadcastBackendStatus: (status: BackendStatus) => void
  ensureMCPServerReady: () => Promise<void>
}

export function registerIpcHandlers(deps: IpcHandlerDependencies): void {
  registerDialogIpcHandlers()
  registerMCPIpcHandlers()
  registerBackendIpcHandlers()
  registerBackendAuthIpcHandlers()
  registerRuntimeConfigIpcHandlers()
  registerAppUpdateIpcHandlers()
  registerWindowIpcHandlers()
  registerEmbeddedBrowserIpcHandlers()
  registerPluginCatalogPackStoreIpcHandlers()
  registerProjectPluginStoreIpcHandlers()
  registerSettingsIpcHandlers(deps)
  registerMovScriptWorkspaceConfigIpcHandlers()
  registerMovScriptEngineIpcHandlers()
  registerMovScriptWorkspaceRootIpcHandlers()
  registerMovScriptWorkspaceFilesIpcHandlers()
  registerProjectGitIpcHandlers()
  registerProviderSessionsIpcHandlers()
  registerAppServerIpcHandlers()
  registerLocalTerminalIpcHandlers()
  registerMediaPipelineIpcHandlers()
  registerDockShortcutIpcHandlers()
}
