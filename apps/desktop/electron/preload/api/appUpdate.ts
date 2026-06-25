import type { IpcRenderer } from 'electron'
import type {
  ElectronAPI,
  ElectronAppUpdateStatus,
} from '../../../src/shared/contracts/electronApi'

export function createAppUpdateAPI(ipcRenderer: IpcRenderer): Pick<
  ElectronAPI,
  'getAppUpdateStatus' | 'checkForAppUpdate' | 'openAppUpdateDownload' | 'downloadAppUpdate' | 'installAppUpdate' | 'onAppUpdateStatus'
> {
  return {
    getAppUpdateStatus: () => ipcRenderer.invoke('app-update:get-status'),
    checkForAppUpdate: () => ipcRenderer.invoke('app-update:check'),
    openAppUpdateDownload: () => ipcRenderer.invoke('app-update:open-download'),
    downloadAppUpdate: () => ipcRenderer.invoke('app-update:download'),
    installAppUpdate: () => ipcRenderer.invoke('app-update:install'),
    onAppUpdateStatus: (handler: (status: ElectronAppUpdateStatus) => void) => {
      const listener = (_event: unknown, status: ElectronAppUpdateStatus) => handler(status)
      ipcRenderer.on('app-update:status', listener)
      return () => {
        ipcRenderer.removeListener('app-update:status', listener)
      }
    },
  }
}
