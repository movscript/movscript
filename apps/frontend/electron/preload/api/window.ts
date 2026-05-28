import type { IpcRenderer } from 'electron'
import type {
  ElectronAPI,
  ElectronWindowState,
} from '../../../src/shared/contracts/electronApi'

export function createWindowAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'windowControl' | 'getWindowState' | 'onWindowState'> {
  return {
    windowControl: (action) => ipcRenderer.invoke('window:control', action),
    getWindowState: () => ipcRenderer.invoke('window:get-state'),
    onWindowState: (handler: (state: ElectronWindowState) => void) => {
      const listener = (_event: unknown, state: ElectronWindowState) => handler(state)
      ipcRenderer.on('window:state', listener)
      return () => {
        ipcRenderer.removeListener('window:state', listener)
      }
    },
  }
}
