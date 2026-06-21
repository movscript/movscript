import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createDialogAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'openFile' | 'openDirectory' | 'saveFile' | 'revealFileInFolder'> {
  return {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
    saveFile: (defaultPath?: string) => ipcRenderer.invoke('dialog:saveFile', defaultPath),
    revealFileInFolder: (input) => ipcRenderer.invoke('dialog:revealFileInFolder', input),
  }
}
