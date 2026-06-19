import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createDesktopStateStoreAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'getDesktopState' | 'setDesktopState' | 'removeDesktopState'> {
  return {
    getDesktopState: (input) => ipcRenderer.invoke('desktop-state:get', input),
    setDesktopState: (input) => ipcRenderer.invoke('desktop-state:set', input),
    removeDesktopState: (input) => ipcRenderer.invoke('desktop-state:remove', input),
  }
}
