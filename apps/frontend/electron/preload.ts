import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings } from '../src/lib/config'

contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (defaultPath?: string) => ipcRenderer.invoke('dialog:saveFile', defaultPath),
  updateMCPContext: (snapshot: unknown) => ipcRenderer.invoke('mcp:update-context', snapshot),
  getMCPStatus: () => ipcRenderer.invoke('mcp:get-status'),
  setAppSettings: (settings: AppSettings) => ipcRenderer.invoke('app:set-settings', settings),
  onBackendStatus: (handler: (status: unknown) => void) => {
    const listener = (_event: unknown, status: unknown) => handler(status)
    ipcRenderer.on('backend:status', listener)
    return () => ipcRenderer.removeListener('backend:status', listener)
  },
  getBackendStatus: () => ipcRenderer.invoke('backend:get-status'),
  openAdminConsole: (input?: { baseURL?: string; path?: string }) => ipcRenderer.invoke('app:open-admin-console', input),
  ensureAgentRuntime: (input?: { baseURL?: string }) => ipcRenderer.invoke('agent:ensure-running', input),
  clipVideo: (input: unknown) => ipcRenderer.invoke('video:clip', input),
  getVideoClipStatus: () => ipcRenderer.invoke('video:clip-status'),
  onMCPOpenRoute: (handler: (route: string) => void) => {
    const listener = (_event: unknown, route: string) => handler(route)
    ipcRenderer.on('mcp:open-route', listener)
    return () => ipcRenderer.removeListener('mcp:open-route', listener)
  },
})
