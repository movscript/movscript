import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createDialogAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'openFile' | 'saveFile' | 'revealFileInFolder'> {
  return {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    saveFile: (defaultPath?: string) => ipcRenderer.invoke('dialog:saveFile', defaultPath),
    revealFileInFolder: (input) => ipcRenderer.invoke('dialog:revealFileInFolder', input),
  }
}
