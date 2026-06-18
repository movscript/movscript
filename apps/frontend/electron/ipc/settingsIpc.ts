import { ipcMain } from 'electron'
import type { AppSettings } from '../../src/shared/contracts/appSettings'
import { LOCAL_BACKEND_URL, startBackend, stopBackend, type BackendStatus } from '../services/backend'
import { resolveDesktopDefaultMovScriptWorkspaceDir, setDesktopDefaultMovScriptWorkspaceDir } from '../services/movscriptWorkspaceDefaults'
import { setMovScriptBackendAPIBaseURL, writeMovScriptBackendConfig } from '@movscript/core/backend/node'
import { readDesktopAppSettings, writeDesktopAppSettings } from '../services/appSettings'
import { readAppSettingsSecrets, writeAppSettingsSecretsFromSettings } from '../services/appSettingsSecrets'

export interface SettingsIpcDependencies {
  broadcastBackendStatus: (status: BackendStatus) => void
  ensureMCPServerReady: () => Promise<void>
}

export function registerSettingsIpcHandlers(deps: SettingsIpcDependencies): void {
  ipcMain.handle('app:set-settings', async (_e, settings?: AppSettings) => {
    setDesktopDefaultMovScriptWorkspaceDir(settings?.movScriptWorkspaceDir)
    const movScriptHomeDir = settings?.movScriptWorkspaceDir?.trim() || resolveDesktopDefaultMovScriptWorkspaceDir()
    if (settings) {
      writeDesktopAppSettings(movScriptHomeDir, settings)
      writeAppSettingsSecretsFromSettings(movScriptHomeDir, settings)
    }
    if (settings?.launchMode === 'local') {
      deps.broadcastBackendStatus({ state: 'starting', baseURL: LOCAL_BACKEND_URL })
      await startBackend('spawn', deps.broadcastBackendStatus)
    } else if (settings?.launchMode === 'cloud') {
      await stopBackend(deps.broadcastBackendStatus, { terminate: true })
    }
    if (!settings?.apiBaseURL) return
    setMovScriptBackendAPIBaseURL(settings.apiBaseURL)
    writeMovScriptBackendConfig(movScriptHomeDir, { baseURL: settings.apiBaseURL })
    await deps.ensureMCPServerReady()
  })
  ipcMain.handle('app:get-settings', () => {
    return readDesktopAppSettings(resolveDesktopDefaultMovScriptWorkspaceDir())
  })
  ipcMain.handle('app:get-settings-secrets', () => {
    return readAppSettingsSecrets(resolveDesktopDefaultMovScriptWorkspaceDir())
  })
}
