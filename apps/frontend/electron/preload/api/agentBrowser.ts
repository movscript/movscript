import type { IpcRenderer } from 'electron'
import type {
  ElectronAgentBrowserState,
  ElectronAPI,
} from '../../../src/shared/contracts/electronApi'

type AgentBrowserAPIKey =
  | 'agentBrowserNavigate'
  | 'agentBrowserActivate'
  | 'agentBrowserSetBounds'
  | 'agentBrowserHide'
  | 'agentBrowserGetState'
  | 'agentBrowserClose'
  | 'agentBrowserGoBack'
  | 'agentBrowserGoForward'
  | 'agentBrowserReload'
  | 'agentBrowserStop'
  | 'onAgentBrowserState'

export function createAgentBrowserAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, AgentBrowserAPIKey> {
  return {
    agentBrowserNavigate: (input) => ipcRenderer.invoke('agent-browser:navigate', input),
    agentBrowserActivate: (input) => ipcRenderer.invoke('agent-browser:activate', input),
    agentBrowserSetBounds: (bounds) => ipcRenderer.invoke('agent-browser:set-bounds', bounds),
    agentBrowserHide: () => ipcRenderer.invoke('agent-browser:hide'),
    agentBrowserGetState: (input) => ipcRenderer.invoke('agent-browser:get-state', input),
    agentBrowserClose: (input) => ipcRenderer.invoke('agent-browser:close', input),
    agentBrowserGoBack: (input) => ipcRenderer.invoke('agent-browser:go-back', input),
    agentBrowserGoForward: (input) => ipcRenderer.invoke('agent-browser:go-forward', input),
    agentBrowserReload: (input) => ipcRenderer.invoke('agent-browser:reload', input),
    agentBrowserStop: (input) => ipcRenderer.invoke('agent-browser:stop', input),
    onAgentBrowserState: (handler: (state: ElectronAgentBrowserState) => void) => {
      const listener = (_event: unknown, state: ElectronAgentBrowserState) => handler(state)
      ipcRenderer.on('agent-browser:state', listener)
      return () => {
        ipcRenderer.removeListener('agent-browser:state', listener)
      }
    },
  }
}
