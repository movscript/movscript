import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createRuntimeConfigAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'getRuntimeConfig'> {
  return {
    getRuntimeConfig: () => ipcRenderer.invoke('app:get-runtime-config'),
  }
}
