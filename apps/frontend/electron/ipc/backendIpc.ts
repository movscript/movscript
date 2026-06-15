import { ipcMain } from 'electron'
import type { ElectronAPI } from '../../src/shared/contracts/electronApi'
import { getBackendStatus } from '../services/backend'
import { openAdminConsoleWindow } from '../adminWindow'

export function registerBackendIpcHandlers(): void {
  ipcMain.handle('backend:get-status', () => {
    return getBackendStatus()
  })

  ipcMain.handle('app:open-admin-console', async (_e, input?: Parameters<NonNullable<ElectronAPI['openAdminConsole']>>[0]) => {
    return openAdminConsoleWindow(input)
  })
}
