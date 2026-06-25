import { ipcMain } from 'electron'
import {
  commitProjectGitWorkspace,
  getProjectGitWorkspaceStatus,
  initProjectGitWorkspace,
  pullProjectGitWorkspace,
  pushProjectGitWorkspace,
} from '../services/projectGit'
import type { ElectronProjectGitActionInput } from '../../src/shared/contracts/electronApi'

export function registerProjectGitIpcHandlers(): void {
  ipcMain.handle('movscript:project-git-init', (_event, input: ElectronProjectGitActionInput) => {
    return initProjectGitWorkspace(input)
  })
  ipcMain.handle('movscript:project-git-status', (_event, input: ElectronProjectGitActionInput) => {
    return getProjectGitWorkspaceStatus(input)
  })
  ipcMain.handle('movscript:project-git-commit', (_event, input: ElectronProjectGitActionInput) => {
    return commitProjectGitWorkspace(input)
  })
  ipcMain.handle('movscript:project-git-pull', (_event, input: ElectronProjectGitActionInput) => {
    return pullProjectGitWorkspace(input)
  })
  ipcMain.handle('movscript:project-git-push', (_event, input: ElectronProjectGitActionInput) => {
    return pushProjectGitWorkspace(input)
  })
}
