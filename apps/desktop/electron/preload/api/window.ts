import type { IpcRenderer } from 'electron'
import type {
  ElectronAPI,
  ElectronWindowState,
} from '../../../src/shared/contracts/electronApi'

export function createWindowAPI(ipcRenderer: IpcRenderer): Pick<
  ElectronAPI,
  'windowControl'
    | 'getWindowState'
    | 'onWindowState'
    | 'getAppWindowContext'
    | 'openHomeWindow'
    | 'openAgentWindow'
    | 'openProjectWindow'
    | 'openEditingWindow'
    | 'openEditingProjectWindow'
    | 'openCanvasWindow'
    | 'openToolWindow'
    | 'openSettingsWindow'
    | 'updateAppWindowRouteContext'
> {
  return {
    windowControl: (action) => ipcRenderer.invoke('window:control', action),
    getWindowState: () => ipcRenderer.invoke('window:get-state'),
    getAppWindowContext: () => ipcRenderer.invoke('window:get-context'),
    openHomeWindow: () => ipcRenderer.invoke('window:open-home'),
    openAgentWindow: () => ipcRenderer.invoke('window:open-agent'),
    openProjectWindow: (input) => ipcRenderer.invoke('window:open-project', input),
    openEditingWindow: () => ipcRenderer.invoke('window:open-editing'),
    openEditingProjectWindow: (input) => ipcRenderer.invoke('window:open-editing-project', input),
    openCanvasWindow: (input) => ipcRenderer.invoke('window:open-canvas', input),
    openToolWindow: (input) => ipcRenderer.invoke('window:open-tool', input),
    openSettingsWindow: (input) => ipcRenderer.invoke('window:open-settings', input),
    updateAppWindowRouteContext: (input) => ipcRenderer.invoke('window:update-route-context', input),
    onWindowState: (handler: (state: ElectronWindowState) => void) => {
      const listener = (_event: unknown, state: ElectronWindowState) => handler(state)
      ipcRenderer.on('window:state', listener)
      return () => {
        ipcRenderer.removeListener('window:state', listener)
      }
    },
  }
}
