import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createProjectPluginStoreAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'getProjectPluginSnapshot' | 'installSystemPlugin' | 'uninstallSystemPlugin' | 'installProjectPlugin' | 'setProjectPluginEnabled' | 'setProjectSkillEnabled'> {
  return {
    getProjectPluginSnapshot: (input) => ipcRenderer.invoke('project-plugin-store:snapshot', input),
    installSystemPlugin: (input) => ipcRenderer.invoke('project-plugin-store:system-install', input),
    uninstallSystemPlugin: (input) => ipcRenderer.invoke('project-plugin-store:system-uninstall', input),
    installProjectPlugin: (input) => ipcRenderer.invoke('project-plugin-store:install', input),
    setProjectPluginEnabled: (input) => ipcRenderer.invoke('project-plugin-store:plugin-enabled', input),
    setProjectSkillEnabled: (input) => ipcRenderer.invoke('project-plugin-store:skill-enabled', input),
  }
}
