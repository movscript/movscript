import { ipcMain } from 'electron'
import { getMovScriptWorkspaceRoot } from '../services/movscriptWorkspaceRoot'
import type { ElectronMovScriptHomeInput } from '../../src/shared/contracts/electronApi'

export function registerMovScriptWorkspaceRootIpcHandlers(): void {
  ipcMain.handle('movscript:workspace-root-get', (_event, input?: ElectronMovScriptHomeInput) => {
    return getMovScriptWorkspaceRoot(input)
  })
}
