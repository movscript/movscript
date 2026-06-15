import type { IpcRenderer } from 'electron'
import type {
  ElectronAPI,
  ElectronAdminAuthSessionInput,
  ElectronBackendStatus,
} from '../../../src/shared/contracts/electronApi'

export function createBackendAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'onBackendStatus' | 'getBackendStatus' | 'openAdminConsole'> {
  return {
    onBackendStatus: (handler: (status: ElectronBackendStatus) => void) => {
      const listener = (_event: unknown, status: ElectronBackendStatus) => handler(status)
      ipcRenderer.on('backend:status', listener)
      return () => {
        ipcRenderer.removeListener('backend:status', listener)
      }
    },
    getBackendStatus: () => ipcRenderer.invoke('backend:get-status'),
    openAdminConsole: (input?: { baseURL?: string; path?: string; authSession?: ElectronAdminAuthSessionInput | null }) => ipcRenderer.invoke('app:open-admin-console', input),
  }
}
