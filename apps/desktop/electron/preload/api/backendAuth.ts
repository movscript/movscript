import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createBackendAuthAPI(
  ipcRenderer: IpcRenderer,
): Pick<ElectronAPI, 'setBackendAuthSession' | 'handleBackendAuthExpired' | 'onBackendAuthSessionExpired'> {
  return {
    setBackendAuthSession: (session) => ipcRenderer.invoke('backend-auth:set-session', session),
    handleBackendAuthExpired: () => ipcRenderer.invoke('backend-auth:handle-expired'),
    onBackendAuthSessionExpired: (handler) => {
      const listener = () => handler()
      ipcRenderer.on('backend-auth:session-expired', listener)
      return () => ipcRenderer.removeListener('backend-auth:session-expired', listener)
    },
  }
}
