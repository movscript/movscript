import type { IpcRenderer } from 'electron'
import type { ElectronAPI, ElectronMCPPluginToolCall } from '../../../src/shared/contracts/electronApi'

export function createMCPAPI(ipcRenderer: IpcRenderer): Pick<ElectronAPI, 'updateMCPContext' | 'updateMCPPluginTools' | 'getMCPStatus' | 'onMCPPluginToolCall' | 'onMCPOpenRoute'> {
  return {
    updateMCPContext: (snapshot) => ipcRenderer.invoke('mcp:update-context', snapshot),
    updateMCPPluginTools: (tools) => ipcRenderer.invoke('mcp:update-plugin-tools', tools),
    getMCPStatus: () => ipcRenderer.invoke('mcp:get-status'),
    onMCPPluginToolCall: (handler) => {
      const listener = (_event: unknown, call: ElectronMCPPluginToolCall & { requestId?: string }) => {
        const requestId = call.requestId
        if (!requestId) return
        handler(call)
          .then((result) => {
            ipcRenderer.send('mcp:plugin-tool-result', { requestId, result })
          })
          .catch((error) => {
            ipcRenderer.send('mcp:plugin-tool-result', {
              requestId,
              error: error instanceof Error ? error.message : String(error),
            })
          })
      }
      ipcRenderer.on('mcp:plugin-tool-call', listener)
      return () => {
        ipcRenderer.removeListener('mcp:plugin-tool-call', listener)
      }
    },
    onMCPOpenRoute: (handler: (route: string) => void) => {
      const listener = (_event: unknown, route: string) => handler(route)
      ipcRenderer.on('mcp:open-route', listener)
      return () => {
        ipcRenderer.removeListener('mcp:open-route', listener)
      }
    },
  }
}
