import { ipcMain } from 'electron'
import {
  checkForAppUpdate,
  getAppUpdateStatus,
  openAppUpdateDownload,
} from '../services/appUpdate'

export function registerAppUpdateIpcHandlers(): void {
  ipcMain.handle('app-update:get-status', () => {
    return getAppUpdateStatus()
  })

  ipcMain.handle('app-update:check', () => {
    return checkForAppUpdate()
  })

  ipcMain.handle('app-update:open-download', () => {
    return openAppUpdateDownload()
  })
}
