import { ipcMain } from 'electron'
import {
  checkForAppUpdate,
  downloadAppUpdate,
  getAppUpdateStatus,
  installAppUpdate,
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

  ipcMain.handle('app-update:download', () => {
    return downloadAppUpdate()
  })

  ipcMain.handle('app-update:install', () => {
    return installAppUpdate()
  })
}
