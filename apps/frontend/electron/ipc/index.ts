import type { BackendStatus } from '../services/backend'
import { registerAgentBrowserIpcHandlers } from './agentBrowserIpc'
import { registerAgentRuntimeIpcHandlers } from './agentRuntimeIpc'
import { registerBackendIpcHandlers } from './backendIpc'
import { registerDialogIpcHandlers } from './dialogIpc'
import { registerGenerationToolsIpcHandlers } from './generationToolsIpc'
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
  registerGenerationToolsIpcHandlers()
  registerBackendIpcHandlers()
  registerWindowIpcHandlers()
  registerAgentBrowserIpcHandlers()
  registerSettingsIpcHandlers(deps)
  registerAgentRuntimeIpcHandlers(deps)
  registerVideoIpcHandlers()
}
