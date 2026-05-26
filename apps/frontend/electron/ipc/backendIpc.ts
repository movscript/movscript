import { ipcMain, shell } from 'electron'
import { getBackendStatus } from '../services/backend'
import { resolveAdminConsoleURL } from '../services/adminConsole'

export function registerBackendIpcHandlers(): void {
  ipcMain.handle('backend:get-status', () => {
    return getBackendStatus()
  })

  ipcMain.handle('app:open-admin-console', async (_e, input?: { baseURL?: string; path?: string }) => {
    const url = resolveAdminConsoleURL(input)
    await shell.openExternal(url)
    return { url }
  })
}
