import type { BackendStatus } from '../services/backend'
import { registerEmbeddedBrowserIpcHandlers } from './embeddedBrowserIpc'
import { registerPluginCatalogPackStoreIpcHandlers } from './pluginCatalogPackStoreIpc'
import { registerProjectPluginStoreIpcHandlers } from './projectPluginStoreIpc'
import { registerMovScriptWorkspaceFilesIpcHandlers } from './movscriptWorkspaceFilesIpc'
import { registerMovScriptEngineIpcHandlers } from './movscriptEngineIpc'
import { registerMovScriptWorkspaceRootIpcHandlers } from './movscriptWorkspaceRootIpc'
import { registerBackendIpcHandlers } from './backendIpc'
import { registerBackendAuthIpcHandlers } from './backendAuthIpc'
import { registerCodexPluginIpcHandlers } from './codexPluginIpc'
import { registerRuntimeConfigIpcHandlers } from './runtimeConfigIpc'
import { registerSdkRuntimeIpcHandlers } from './sdkRuntimeIpc'
import { registerAppUpdateIpcHandlers } from './appUpdateIpc'
import { registerDialogIpcHandlers } from './dialogIpc'
import { registerMCPIpcHandlers } from './mcpIpc'
import { registerMovScriptWorkspaceConfigIpcHandlers } from './movscriptWorkspaceConfigIpc'
import { registerSettingsIpcHandlers } from './settingsIpc'
import { registerWindowIpcHandlers } from './windowIpc'
import { registerProviderSessionsIpcHandlers } from './providerSessionsIpc'
import { registerProjectGitIpcHandlers } from './projectGitIpc'
import { registerLocalProjectIpcHandlers } from './localProjectIpc'
import { registerDesktopShellHostIpcHandlers } from './desktopShellHostIpc'
import { registerMediaPipelineIpcHandlers } from './mediaPipelineIpc'
import { registerDockShortcutIpcHandlers } from './dockShortcutIpc'
import { registerAgentSessionPersistenceIpcHandlers } from './agentSessionPersistenceIpc'
import { registerDesktopStateStoreIpcHandlers } from './desktopStateStoreIpc'

export interface IpcHandlerDependencies {
  broadcastBackendStatus: (status: BackendStatus) => void
  ensureMCPServerReady: () => Promise<void>
}

export function registerIpcHandlers(deps: IpcHandlerDependencies): void {
  registerDialogIpcHandlers()
  registerMCPIpcHandlers()
  registerBackendIpcHandlers()
  registerBackendAuthIpcHandlers()
  registerCodexPluginIpcHandlers()
  registerRuntimeConfigIpcHandlers()
  registerAppUpdateIpcHandlers()
  registerWindowIpcHandlers()
  registerEmbeddedBrowserIpcHandlers()
  registerPluginCatalogPackStoreIpcHandlers()
  registerProjectPluginStoreIpcHandlers()
  registerSettingsIpcHandlers(deps)
  registerDesktopStateStoreIpcHandlers()
  registerAgentSessionPersistenceIpcHandlers()
  registerMovScriptWorkspaceConfigIpcHandlers()
  registerMovScriptEngineIpcHandlers()
  registerMovScriptWorkspaceRootIpcHandlers()
  registerLocalProjectIpcHandlers()
  registerMovScriptWorkspaceFilesIpcHandlers()
  registerProjectGitIpcHandlers()
  registerProviderSessionsIpcHandlers()
  registerSdkRuntimeIpcHandlers()
  registerDesktopShellHostIpcHandlers()
  registerMediaPipelineIpcHandlers()
  registerDockShortcutIpcHandlers()
}
