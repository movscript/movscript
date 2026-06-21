import { ipcMain } from 'electron'
import type { ElectronLocalProjectBindInput, ElectronLocalProjectCreateInput, ElectronLocalProjectInspectInput, ElectronLocalProjectOpenInput } from '../../src/shared/contracts/electronApi'
import { bindLocalMovScriptProject, createLocalMovScriptProject, inspectLocalMovScriptProject, openLocalMovScriptProject } from '../services/localProject'

export function registerLocalProjectIpcHandlers(): void {
  ipcMain.handle('movscript:local-project-inspect', (_event, input: ElectronLocalProjectInspectInput) => {
    return inspectLocalMovScriptProject(input)
  })
  ipcMain.handle('movscript:local-project-create', (_event, input: ElectronLocalProjectCreateInput) => {
    return createLocalMovScriptProject(input)
  })
  ipcMain.handle('movscript:local-project-open', (_event, input: ElectronLocalProjectOpenInput) => {
    return openLocalMovScriptProject(input)
  })
  ipcMain.handle('movscript:local-project-bind', (_event, input: ElectronLocalProjectBindInput) => {
    return bindLocalMovScriptProject(input)
  })
}
