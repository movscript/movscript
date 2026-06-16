import { app, ipcMain } from 'electron'
import {
  getProjectPluginSnapshot,
  installProjectPlugin,
  setProjectSkillEnabled,
} from '../services/projectPluginStore'
import type { ElectronMovScriptHomeInput, ElectronProjectPluginInstallInput, ElectronProjectSkillToggleInput } from '../../src/shared/contracts/electronApi'

export function registerProjectPluginStoreIpcHandlers(): void {
  ipcMain.handle('project-plugin-store:snapshot', (_event, input?: ElectronMovScriptHomeInput & { projectId?: string | number; userId?: string | number; orgId?: string | number }) => {
    return getProjectPluginSnapshot({ ...input, desktopDataDir: app.getPath('userData') })
  })
  ipcMain.handle('project-plugin-store:install', (_event, input: ElectronProjectPluginInstallInput) => {
    return installProjectPlugin({ ...input, desktopDataDir: app.getPath('userData') })
  })
  ipcMain.handle('project-plugin-store:skill-enabled', (_event, input: ElectronProjectSkillToggleInput) => {
    return setProjectSkillEnabled({ ...input, desktopDataDir: app.getPath('userData') })
  })
}
