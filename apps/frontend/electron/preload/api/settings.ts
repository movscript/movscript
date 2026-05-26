import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createSettingsAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'setAppSettings'> {
  return {
    setAppSettings: (settings) => ipcRenderer.invoke('app:set-settings', settings),
  }
}
