import { ipcMain } from 'electron'
import {
  getProjectPluginSnapshot,
  installSystemPlugin,
  uninstallSystemPlugin,
  installProjectPlugin,
  setProjectPluginEnabled,
  setProjectSkillEnabled,
} from '../services/projectPluginStore'
import type { ElectronMovScriptHomeInput, ElectronProjectPluginInstallInput, ElectronProjectPluginToggleInput, ElectronProjectSkillToggleInput, ElectronSystemPluginInstallInput, ElectronSystemPluginUninstallInput } from '../../src/shared/contracts/electronApi'

export function registerProjectPluginStoreIpcHandlers(): void {
  ipcMain.handle('project-plugin-store:snapshot', (_event, input?: ElectronMovScriptHomeInput & { projectId?: string | number; userId?: string | number; orgId?: string | number }) => {
    return getProjectPluginSnapshot(input)
  })
  ipcMain.handle('project-plugin-store:install', (_event, input: ElectronProjectPluginInstallInput) => {
    return installProjectPlugin(input)
  })
  ipcMain.handle('project-plugin-store:system-install', (_event, input: ElectronSystemPluginInstallInput) => {
    return installSystemPlugin(input)
  })
  ipcMain.handle('project-plugin-store:system-uninstall', (_event, input: ElectronSystemPluginUninstallInput) => {
    return uninstallSystemPlugin(input)
  })
  ipcMain.handle('project-plugin-store:plugin-enabled', (_event, input: ElectronProjectPluginToggleInput) => {
    return setProjectPluginEnabled(input)
  })
  ipcMain.handle('project-plugin-store:skill-enabled', (_event, input: ElectronProjectSkillToggleInput) => {
    return setProjectSkillEnabled(input)
  })
}
