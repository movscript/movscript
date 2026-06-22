import {
  normalizeBackendAPIBaseURL,
  normalizeBackendBaseURL,
  resolveMovScriptBackendSession,
} from '@movscript/core/backend/node'
import type { ElectronRuntimeConfig } from '../../src/shared/contracts/electronApi'
import { readDesktopAppSettings } from './appSettings'
import { getBackendStatus, LOCAL_BACKEND_URL } from './backend'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'
import { providerRuntimeEnvSnapshot } from './providerRuntimeEnv'

export function getElectronRuntimeConfig(): ElectronRuntimeConfig {
  const movScriptHomeDir = resolveDesktopDefaultMovScriptWorkspaceDir()
  const backendStatus = getBackendStatus()
  const appSettings = readDesktopAppSettings(movScriptHomeDir)
  const session = resolveMovScriptBackendSession({ workspaceDir: movScriptHomeDir })
  const apiBaseURL = resolveEffectiveAPIBaseURL({
    configuredBaseURL: appSettings?.apiBaseURL ?? session.baseURL,
    backendStatus,
    shouldPreferLocalBackend: appSettings?.onboardingCompleted === true && appSettings.launchMode === 'local',
  })
  return {
    movScriptHomeDir,
    workspaceDir: movScriptHomeDir,
    apiBaseURL,
    apiV1BaseURL: normalizeBackendAPIBaseURL(apiBaseURL),
    localAPIBaseURL: normalizeBackendBaseURL(LOCAL_BACKEND_URL),
    providerRuntimeEnv: providerRuntimeEnvSnapshot(process.env),
    backendStatus: {
      ...backendStatus,
      baseURL: normalizeBackendBaseURL(backendStatus.baseURL),
    },
  }
}

function resolveEffectiveAPIBaseURL(input: {
  configuredBaseURL: string
  backendStatus: ReturnType<typeof getBackendStatus>
  shouldPreferLocalBackend: boolean
}): string {
  if (
    input.shouldPreferLocalBackend
    &&
    input.backendStatus.state === 'ready'
    && normalizeBackendBaseURL(input.backendStatus.baseURL) === normalizeBackendBaseURL(LOCAL_BACKEND_URL)
  ) {
    return normalizeBackendBaseURL(input.backendStatus.baseURL)
  }
  return normalizeBackendBaseURL(input.configuredBaseURL)
}
