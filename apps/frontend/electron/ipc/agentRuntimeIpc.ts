import { ipcMain } from 'electron'
import { ensureAgentRuntimeRunning } from '../services/agentRuntime'

export interface AgentRuntimeIpcDependencies {
  ensureMCPServerReady: () => Promise<void>
}

export function registerAgentRuntimeIpcHandlers(deps: AgentRuntimeIpcDependencies): void {
  ipcMain.handle('agent:ensure-running', async (_e, input?: { baseURL?: string }) => {
    await deps.ensureMCPServerReady()
    return ensureAgentRuntimeRunning(input)
  })
}
