import { BrowserWindow, ipcMain } from 'electron'
import type { AppSettings } from '../../src/shared/contracts/appSettings'
import { LOCAL_BACKEND_URL, startBackend, stopBackend, type BackendStatus } from '../services/backend'
import { resolveDesktopDefaultMovScriptWorkspaceDir, setDesktopDefaultMovScriptWorkspaceDir } from '../services/movscriptWorkspaceDefaults'
import { setMovScriptBackendAPIBaseURL, writeMovScriptBackendConfig } from '@movscript/core/backend/node'
import { readDesktopAppSettings, writeDesktopAppSettings } from '../services/appSettings'
import {
  agentRuntimeCredentialSummary,
  readAgentRuntimeCredentialSummary,
  readAppSettingsSecrets,
  rendererAppSettingsSecrets,
  writeAgentRuntimeApiKey,
  writeAppSettingsSecretsFromSettings,
} from '../services/appSettingsSecrets'

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
      broadcastAppSettingsUpdated(settings)
    }
    if (!settings?.onboardingCompleted) {
      return
    }
    if (settings.launchMode === 'local') {
      deps.broadcastBackendStatus({ state: 'starting', baseURL: LOCAL_BACKEND_URL })
      await startBackend('spawn', deps.broadcastBackendStatus)
    } else if (settings.launchMode === 'cloud') {
      await stopBackend(deps.broadcastBackendStatus, { terminate: true })
    }
    if (!settings.apiBaseURL) return
    setMovScriptBackendAPIBaseURL(settings.apiBaseURL)
    writeMovScriptBackendConfig(movScriptHomeDir, { baseURL: settings.apiBaseURL })
    void deps.ensureMCPServerReady().catch((error) => {
      console.warn('[settings] failed to prepare MCP server after settings update', error)
    })
  })
  ipcMain.handle('app:get-settings', () => {
    return readDesktopAppSettings(resolveDesktopDefaultMovScriptWorkspaceDir())
  })
  ipcMain.handle('app:get-settings-secrets', () => {
    return rendererAppSettingsSecrets(readAppSettingsSecrets(resolveDesktopDefaultMovScriptWorkspaceDir()))
  })
  ipcMain.handle('app:get-agent-runtime-credential-summary', () => {
    return readAgentRuntimeCredentialSummary(resolveDesktopDefaultMovScriptWorkspaceDir())
  })
  ipcMain.handle('app:set-agent-runtime-api-key', (_event, input?: { providerKey?: string; providerKeys?: string[]; apiKey?: string | null }) => {
    const workspaceDir = resolveDesktopDefaultMovScriptWorkspaceDir()
    const result = writeAgentRuntimeApiKey(workspaceDir, input ?? {})
    const summary = agentRuntimeCredentialSummary(result)
    console.log('[Movscript Claude credential flow] ipc.setAgentRuntimeApiKey', JSON.stringify({
      workspaceDir,
      providerKey: input?.providerKey,
      providerKeys: input?.providerKeys ?? [],
      hasApiKey: Boolean(input?.apiKey?.trim()),
      savedProviderKeys: summary.savedProviderKeys,
    }))
    return summary
  })
}

function broadcastAppSettingsUpdated(settings: AppSettings): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('app:settings-updated', settings)
    }
  }
}
