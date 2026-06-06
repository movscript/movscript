import { ipcMain } from 'electron'
import { listProviderSessionsFromWorkspace } from '../services/providerSessionWorkspace'

export function registerProviderSessionsIpcHandlers(): void {
  ipcMain.handle('movscript:provider-sessions-list', (_event, input?: { workspaceDir?: string; providerProfileKey?: string }) => {
    return listProviderSessionsFromWorkspace(input)
  })
}
