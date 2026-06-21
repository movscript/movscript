import { ipcMain } from 'electron'
import type { ElectronLocalProjectCreateInput, ElectronLocalProjectOpenInput } from '../../src/shared/contracts/electronApi'
import { createLocalMovScriptProject, openLocalMovScriptProject } from '../services/localProject'

export function registerLocalProjectIpcHandlers(): void {
  ipcMain.handle('movscript:local-project-create', (_event, input: ElectronLocalProjectCreateInput) => {
    return createLocalMovScriptProject(input)
  })
  ipcMain.handle('movscript:local-project-open', (_event, input: ElectronLocalProjectOpenInput) => {
    return openLocalMovScriptProject(input)
  })
}
