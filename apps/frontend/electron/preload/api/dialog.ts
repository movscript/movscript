import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createDialogAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'openFile' | 'saveFile'> {
  return {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    saveFile: (defaultPath?: string) => ipcRenderer.invoke('dialog:saveFile', defaultPath),
  }
}
