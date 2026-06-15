import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createProjectPluginStoreAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'getProjectPluginSnapshot' | 'installProjectPlugin' | 'setProjectSkillEnabled'> {
  return {
    getProjectPluginSnapshot: (input) => ipcRenderer.invoke('project-plugin-store:snapshot', input),
    installProjectPlugin: (input) => ipcRenderer.invoke('project-plugin-store:install', input),
    setProjectSkillEnabled: (input) => ipcRenderer.invoke('project-plugin-store:skill-enabled', input),
  }
}
