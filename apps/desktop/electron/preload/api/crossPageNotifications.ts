import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createCrossPageNotificationAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'onCrossPageNotification'> {
  return {
    onCrossPageNotification: (handler) => {
      const listener = (_event: unknown, notification: unknown) => handler(notification)
      ipcRenderer.on('cross-page-notification', listener)
      return () => {
        ipcRenderer.removeListener('cross-page-notification', listener)
      }
    },
  }
}
