import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createDockShortcutAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'updateDockShortcutMenu'> {
  return {
    updateDockShortcutMenu: (snapshot) => ipcRenderer.invoke('dock-shortcuts:update', snapshot),
  }
}
