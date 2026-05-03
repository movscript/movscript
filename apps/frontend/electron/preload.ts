import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (defaultPath?: string) => ipcRenderer.invoke('dialog:saveFile', defaultPath),
  updateMCPContext: (snapshot: unknown) => ipcRenderer.invoke('mcp:update-context', snapshot),
  ensureProductionRuntime: (input?: { baseURL?: string }) => ipcRenderer.invoke('agent:ensure-running', input),
  onMCPOpenRoute: (handler: (route: string) => void) => {
    const listener = (_event: unknown, route: string) => handler(route)
    ipcRenderer.on('mcp:open-route', listener)
    return () => ipcRenderer.removeListener('mcp:open-route', listener)
  },
})
