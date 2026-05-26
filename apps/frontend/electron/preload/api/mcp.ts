import type { IpcRenderer } from 'electron'
import type { ElectronAPI } from '../../../src/shared/contracts/electronApi'

export function createMCPAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'updateMCPContext' | 'getMCPStatus' | 'onMCPOpenRoute'> {
  return {
    updateMCPContext: (snapshot) => ipcRenderer.invoke('mcp:update-context', snapshot),
    getMCPStatus: () => ipcRenderer.invoke('mcp:get-status'),
    onMCPOpenRoute: (handler: (route: string) => void) => {
      const listener = (_event: unknown, route: string) => handler(route)
      ipcRenderer.on('mcp:open-route', listener)
      return () => {
        ipcRenderer.removeListener('mcp:open-route', listener)
      }
    },
  }
}
