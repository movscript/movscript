import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createRuntimeConfigAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'getRuntimeConfig' | 'applyRuntimeBundleAction'> {
  return {
    getRuntimeConfig: () => ipcRenderer.invoke('app:get-runtime-config'),
    applyRuntimeBundleAction: (input) => ipcRenderer.invoke('app:apply-runtime-bundle-action', input),
  }
}
