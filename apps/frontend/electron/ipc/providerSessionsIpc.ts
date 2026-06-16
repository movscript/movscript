import { ipcMain } from 'electron'
import { listProviderSessionsFromWorkspace } from '../services/providerSessionWorkspace'
import type { ElectronMovScriptHomeInput } from '../../src/shared/contracts/electronApi'

export function registerProviderSessionsIpcHandlers(): void {
  ipcMain.handle('movscript:provider-sessions-list', (_event, input?: ElectronMovScriptHomeInput & { providerProfileKey?: string }) => {
    return listProviderSessionsFromWorkspace(input)
  })
}
