import type { IpcRenderer } from 'electron'
import type {
  ElectronAPI,
  ElectronAgentRuntimeStreamMessage,
} from '../../../src/shared/contracts/electronApi'

export function createAgentRuntimeAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'ensureAgentRuntime' | 'agentRuntimeRequest' | 'agentRuntimeOpenEventStream' | 'agentRuntimeCloseEventStream' | 'onAgentRuntimeStreamMessage'> {
  return {
    ensureAgentRuntime: (input) => ipcRenderer.invoke('agent:ensure-running', input),
    agentRuntimeRequest: (input) => ipcRenderer.invoke('agent:runtime-request', input),
    agentRuntimeOpenEventStream: (input) => ipcRenderer.invoke('agent:runtime-open-event-stream', input),
    agentRuntimeCloseEventStream: (input) => ipcRenderer.invoke('agent:runtime-close-event-stream', input),
    onAgentRuntimeStreamMessage: (handler: (message: ElectronAgentRuntimeStreamMessage) => void) => {
      const listener = (_event: unknown, message: ElectronAgentRuntimeStreamMessage) => handler(message)
      ipcRenderer.on('agent:runtime-stream-message', listener)
      return () => {
        ipcRenderer.removeListener('agent:runtime-stream-message', listener)
      }
    },
  }
}
