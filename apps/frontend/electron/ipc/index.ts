import type { BackendStatus } from '../services/backend'
import { registerAgentBrowserIpcHandlers } from './agentBrowserIpc'
import { registerAgentCatalogPackStoreIpcHandlers } from './agentCatalogPackStoreIpc'
import { registerAgentRuntimeIpcHandlers } from './agentRuntimeIpc'
import { registerBackendIpcHandlers } from './backendIpc'
import { registerDialogIpcHandlers } from './dialogIpc'
import { registerMCPIpcHandlers } from './mcpIpc'
import { registerSettingsIpcHandlers } from './settingsIpc'
import { registerVideoIpcHandlers } from './videoIpc'
import { registerWindowIpcHandlers } from './windowIpc'

export interface IpcHandlerDependencies {
  broadcastBackendStatus: (status: BackendStatus) => void
  ensureMCPServerReady: () => Promise<void>
}

export function registerIpcHandlers(deps: IpcHandlerDependencies): void {
  registerDialogIpcHandlers()
  registerMCPIpcHandlers()
  registerBackendIpcHandlers()
  registerWindowIpcHandlers()
  registerAgentBrowserIpcHandlers()
  registerAgentCatalogPackStoreIpcHandlers()
  registerSettingsIpcHandlers(deps)
  registerAgentRuntimeIpcHandlers()
  registerVideoIpcHandlers()
}
