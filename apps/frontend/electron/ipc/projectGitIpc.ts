import { ipcMain } from 'electron'
import { pushProjectGitWorkspace } from '../services/projectGit'
import type { ElectronProjectGitActionInput } from '../../src/shared/contracts/electronApi'

export function registerProjectGitIpcHandlers(): void {
  ipcMain.handle('movscript:project-git-push', (_event, input: ElectronProjectGitActionInput) => {
    return pushProjectGitWorkspace(input)
  })
}
