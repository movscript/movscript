import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createAgentRuntimeAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'ensureAgentRuntime'> {
  return {
    ensureAgentRuntime: (input) => ipcRenderer.invoke('agent:ensure-running', input),
  }
}
