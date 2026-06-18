import {
  normalizeBackendAPIBaseURL,
  normalizeBackendBaseURL,
  resolveMovScriptBackendSession,
} from '@movscript/core/backend/node'
import type { ElectronRuntimeConfig } from '../../src/shared/contracts/electronApi'
import { getBackendStatus, LOCAL_BACKEND_URL } from './backend'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'
import { providerRuntimeEnvSnapshot } from './providerRuntimeEnv'

export function getElectronRuntimeConfig(): ElectronRuntimeConfig {
  const movScriptHomeDir = resolveDesktopDefaultMovScriptWorkspaceDir()
  const backendStatus = getBackendStatus()
  const session = resolveMovScriptBackendSession({ workspaceDir: movScriptHomeDir })
  const apiBaseURL = resolveEffectiveAPIBaseURL({
    configuredBaseURL: session.baseURL,
    backendStatus,
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
}): string {
  if (
    input.backendStatus.state === 'ready'
    && normalizeBackendBaseURL(input.backendStatus.baseURL) === normalizeBackendBaseURL(LOCAL_BACKEND_URL)
  ) {
    return normalizeBackendBaseURL(input.backendStatus.baseURL)
  }
  return normalizeBackendBaseURL(input.configuredBaseURL)
}
