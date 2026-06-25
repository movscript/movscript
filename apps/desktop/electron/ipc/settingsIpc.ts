import { BrowserWindow, ipcMain } from 'electron'
import { writeMovScriptDataServiceConfig } from '@movscript/data-client'
import { findRuntimeEndpoint, readRuntimeHomeSnapshot } from '@movscript/runtime-contracts'
import type { AppSettings } from '../../src/shared/contracts/appSettings'
import { LOCAL_BACKEND_URL, setBackendStatus, stopBackend, type BackendStatus } from '../services/backend'
import { resolveDesktopDefaultMovScriptWorkspaceDir, setDesktopDefaultMovScriptWorkspaceDir } from '../services/movscriptWorkspaceDefaults'
import { readDesktopAppSettings, writeDesktopAppSettings } from '../services/appSettings'
import { ensureDesktopLocalRuntime } from '../../runtime/desktopApplicationRuntime'
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
      await ensureDesktopLocalRuntime({
        homeDir: movScriptHomeDir,
        dataPlane: 'local',
      })
      setBackendStatus({ state: 'ready', baseURL: resolveDataServiceURL(movScriptHomeDir) ?? settings.apiBaseURL ?? LOCAL_BACKEND_URL }, deps.broadcastBackendStatus)
    } else if (settings.launchMode === 'cloud') {
      await stopBackend(deps.broadcastBackendStatus, { terminate: true })
      await ensureDesktopLocalRuntime({
        homeDir: movScriptHomeDir,
        dataPlane: dataPlaneForAPIBaseURL(settings.apiBaseURL),
        ...(settings.apiBaseURL ? { dataServiceURL: settings.apiBaseURL } : {}),
      })
      setBackendStatus({ state: 'ready', baseURL: settings.apiBaseURL }, deps.broadcastBackendStatus)
    }
    if (settings.launchMode === 'cloud' && settings.apiBaseURL) {
      writeMovScriptDataServiceConfig(movScriptHomeDir, { baseURL: settings.apiBaseURL })
    }
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

function dataPlaneForAPIBaseURL(apiBaseURL: string | undefined): 'cloud' | 'external' {
  if (!apiBaseURL) return 'cloud'
  try {
    const url = new URL(apiBaseURL)
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname) ? 'external' : 'cloud'
  } catch {
    return 'cloud'
  }
}

function resolveDataServiceURL(homeDir: string): string | undefined {
  const endpoint = findRuntimeEndpoint(readRuntimeHomeSnapshot(homeDir), 'movscript.data.service')
  if (!endpoint) return undefined
  return endpoint.url ?? endpoint.baseURL ?? (endpoint.port ? `http://127.0.0.1:${endpoint.port}` : undefined)
}

function broadcastAppSettingsUpdated(settings: AppSettings): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('app:settings-updated', settings)
    }
  }
}
