import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createAgentSessionPersistenceAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'getAgentSessionState' | 'setAgentSessionState'> {
  return {
    getAgentSessionState: (input) => ipcRenderer.invoke('agent-session-state:get', input),
    setAgentSessionState: (input) => ipcRenderer.invoke('agent-session-state:set', input),
  }
}
