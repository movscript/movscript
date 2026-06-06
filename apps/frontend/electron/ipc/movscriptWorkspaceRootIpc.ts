import { ipcMain } from 'electron'
import { getMovScriptWorkspaceRoot } from '../services/movscriptWorkspaceRoot'

export function registerMovScriptWorkspaceRootIpcHandlers(): void {
  ipcMain.handle('movscript:workspace-root-get', (_event, input?: { workspaceDir?: string }) => {
    return getMovScriptWorkspaceRoot(input)
  })
}
