import { setMovScriptBackendAPIBaseURL } from '@movscript/core/backend/node'
import {
  readMovScriptHomeConfig,
  resolveMovScriptHomeConfigPaths,
} from '@movscript/core/workspace/node'
import {
  getBackendLaunchPolicy,
  LOCAL_BACKEND_URL,
  startBackend,
} from '../services/backend'
import { readDesktopAppSettings } from '../services/appSettings'
import {
  formatDesktopRuntimePreflightFailure,
  prepareDesktopRuntimeDependencies,
} from '../services/desktopRuntime'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from '../services/movscriptWorkspaceDefaults'
import { broadcastBackendStatus } from './backendStatus'
import { ensureMCPServerReady } from './mcp'

async function bootstrapBackendServices(policy: ReturnType<typeof getBackendLaunchPolicy>): Promise<boolean> {
  console.info(`[bootstrap] backend policy=${policy}`)
  const status = await startBackend(policy, broadcastBackendStatus)
  if (policy !== 'spawn') return true

  if (status.state !== 'ready') {
    console.warn(`[backend] local bootstrap failed: ${status.message ?? status.state}`)
    throw new Error(status.message ?? 'Local backend failed to start')
  }

  console.info(`[bootstrap] local backend ready at ${LOCAL_BACKEND_URL}; provider sessions will use this backend by default`)
  setMovScriptBackendAPIBaseURL(LOCAL_BACKEND_URL)
  return true
}

export async function bootstrapManagedServicesBeforeWindow(): Promise<void> {
  const workspaceDir = resolveDesktopDefaultMovScriptWorkspaceDir()
  const homeConfig = readMovScriptHomeConfig(resolveMovScriptHomeConfigPaths(workspaceDir).configPath)
  const appSettings = readDesktopAppSettings(workspaceDir)
  const shouldStartLocalBackend = appSettings?.onboardingCompleted === true && appSettings.launchMode === 'local'
  const policy = getBackendLaunchPolicy({ workspaceDir })
  const runtime = prepareDesktopRuntimeDependencies({
    workspaceDir,
    requireMovScriptServer: shouldStartLocalBackend && policy === 'spawn',
    requireMovcli: true,
  })
  if (!runtime.preflight.ok) {
    throw new Error(`MovScript runtime dependency check failed:\n${formatDesktopRuntimePreflightFailure(runtime.preflight)}`)
  }
  if (shouldStartLocalBackend) {
    await bootstrapBackendServices(policy)
  } else {
    console.info('[bootstrap] local backend deferred until local launch mode is selected')
    if (appSettings?.apiBaseURL) setMovScriptBackendAPIBaseURL(appSettings.apiBaseURL)
  }
  await ensureMCPServerReady()
  console.info(`[bootstrap] agent policy=${homeConfig.startup.agentPolicy}; agent runtimes initialize on demand`)
}
