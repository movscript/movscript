import { ipcMain } from 'electron'
import { LOCAL_BACKEND_URL, startBackend, stopBackend, type BackendStatus } from '../services/backend'
import { setMCPAPIBaseURL } from '../mcp/server'
import { setDesktopDefaultMovScriptWorkspaceDir } from '../services/movscriptWorkspaceDefaults'

export interface SettingsIpcDependencies {
  broadcastBackendStatus: (status: BackendStatus) => void
  ensureMCPServerReady: () => Promise<void>
}

export function registerSettingsIpcHandlers(deps: SettingsIpcDependencies): void {
  ipcMain.handle('app:set-settings', async (_e, settings?: { apiBaseURL?: string; launchMode?: 'cloud' | 'local'; movScriptWorkspaceDir?: string }) => {
    setDesktopDefaultMovScriptWorkspaceDir(settings?.movScriptWorkspaceDir)
    if (settings?.launchMode === 'local') {
      deps.broadcastBackendStatus({ state: 'starting', baseURL: LOCAL_BACKEND_URL })
      await startBackend('spawn', deps.broadcastBackendStatus)
    } else if (settings?.launchMode === 'cloud') {
      await stopBackend(deps.broadcastBackendStatus, { terminate: true })
    }
    if (!settings?.apiBaseURL) return
    setMCPAPIBaseURL(settings.apiBaseURL)
    await deps.ensureMCPServerReady()
  })
}
