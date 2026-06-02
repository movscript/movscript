import { ipcMain } from 'electron'
import { ensureAgentRuntimeRunning } from '../services/agentRuntime'
import { agentRuntimeRequest } from './agent-runtime/request'
import { agentRuntimeOpenEventStream, closeAgentRuntimeEventStream, pumpAgentRuntimeStream } from './agent-runtime/stream'
import type {
  ElectronAgentRuntimeEnsureInput,
  ElectronAgentRuntimeRequestInput,
  ElectronAgentRuntimeStreamCloseInput,
  ElectronAgentRuntimeStreamInput,
} from '../../src/shared/contracts/electronApi'

export interface AgentRuntimeIpcDependencies {
  ensureMCPServerReady: () => Promise<void>
}

export function registerAgentRuntimeIpcHandlers(deps: AgentRuntimeIpcDependencies): void {
  ipcMain.handle('agent:ensure-running', async (_e, input?: ElectronAgentRuntimeEnsureInput) => {
    await deps.ensureMCPServerReady()
    return ensureAgentRuntimeRunning(input)
  })
  ipcMain.handle('agent:runtime-request', async (_e, input?: ElectronAgentRuntimeRequestInput) => {
    return agentRuntimeRequest(input)
  })
  ipcMain.handle('agent:runtime-open-event-stream', async (event, input?: ElectronAgentRuntimeStreamInput) => {
    if (!input?.streamId) throw new Error('agent runtime stream requires streamId')
    const stream = await agentRuntimeOpenEventStream(input)
    if (stream.status < 200 || stream.status >= 300) return stream.response
    void pumpAgentRuntimeStream(input.streamId, stream.stream, (message) => {
      event.sender.send('agent:runtime-stream-message', message)
    })
    return stream.response
  })
  ipcMain.handle('agent:runtime-close-event-stream', (_event, input?: ElectronAgentRuntimeStreamCloseInput) => {
    closeAgentRuntimeEventStream(input)
  })
}
