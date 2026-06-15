import type { IpcRenderer } from 'electron'
import type {
  ElectronAPI,
  ElectronWindowState,
} from '../../../src/shared/contracts/electronApi'

export function createWindowAPI(ipcRenderer: IpcRenderer): Pick<
  ElectronAPI,
  'windowControl'
    | 'getWindowState'
    | 'onWindowState'
    | 'getAppWindowContext'
    | 'openHomeWindow'
    | 'openAgentWindow'
    | 'openProjectWindow'
> {
  return {
    windowControl: (action) => ipcRenderer.invoke('window:control', action),
    getWindowState: () => ipcRenderer.invoke('window:get-state'),
    getAppWindowContext: () => ipcRenderer.invoke('window:get-context'),
    openHomeWindow: () => ipcRenderer.invoke('window:open-home'),
    openAgentWindow: () => ipcRenderer.invoke('window:open-agent'),
    openProjectWindow: (input) => ipcRenderer.invoke('window:open-project', input),
    onWindowState: (handler: (state: ElectronWindowState) => void) => {
      const listener = (_event: unknown, state: ElectronWindowState) => handler(state)
      ipcRenderer.on('window:state', listener)
      return () => {
        ipcRenderer.removeListener('window:state', listener)
      }
    },
  }
}
