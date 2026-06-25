import { writeMovScriptDataServiceConfig } from '@movscript/data-client'
import {
  readMovScriptHomeConfig,
  resolveMovScriptHomeConfigPaths,
} from '@movscript/workspace/home'
import { readDesktopAppSettings } from '../services/appSettings'
import {
  formatDesktopRuntimePreflightFailure,
  prepareDesktopRuntimeDependencies,
} from '../services/desktopRuntime'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from '../services/movscriptWorkspaceDefaults'
import { ensureMCPServerReady } from './mcp'

export type ManagedServicesBootstrapResult = {
  localRuntime?: {
    enabled: boolean
    dataPlane: 'local' | 'cloud' | 'external'
    dataServiceURL?: string
  }
}

export async function bootstrapManagedServicesBeforeWindow(): Promise<ManagedServicesBootstrapResult> {
  const workspaceDir = resolveDesktopDefaultMovScriptWorkspaceDir()
  const homeConfig = readMovScriptHomeConfig(resolveMovScriptHomeConfigPaths(workspaceDir).configPath)
  const appSettings = readDesktopAppSettings(workspaceDir)
  const runtime = prepareDesktopRuntimeDependencies({
    workspaceDir,
    requireMovScriptServer: false,
    requireMovcli: true,
  })
  if (!runtime.preflight.ok) {
    throw new Error(`MovScript runtime dependency check failed:\n${formatDesktopRuntimePreflightFailure(runtime.preflight)}`)
  }
  if (appSettings?.launchMode === 'cloud' && appSettings.apiBaseURL) {
    writeMovScriptDataServiceConfig(workspaceDir, { baseURL: appSettings.apiBaseURL })
  }
  const smokeLocalRuntime = desktopSmokeLocalRuntimeFromEnv()
  await ensureMCPServerReady()
  console.info(`[bootstrap] agent policy=${homeConfig.startup.agentPolicy}; agent runtimes initialize on demand`)
  return {
    localRuntime: smokeLocalRuntime ?? (appSettings?.onboardingCompleted === true
      ? {
          enabled: true,
          dataPlane: appSettings.launchMode === 'local' ? 'local' : localRuntimeDataPlaneForAPIBaseURL(appSettings.apiBaseURL),
          ...(appSettings.launchMode !== 'local' && appSettings.apiBaseURL ? { dataServiceURL: appSettings.apiBaseURL } : {}),
        }
      : undefined),
  }
}

function desktopSmokeLocalRuntimeFromEnv(env: NodeJS.ProcessEnv = process.env): ManagedServicesBootstrapResult['localRuntime'] {
  if (env.MOVSCRIPT_DESKTOP_SMOKE_LOCAL_RUNTIME !== '1') return undefined
  const rawDataPlane = (env.MOVSCRIPT_DESKTOP_SMOKE_DATA_PLANE ?? env.MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE ?? 'local').trim()
  const dataPlane = rawDataPlane === 'cloud' || rawDataPlane === 'external' ? rawDataPlane : 'local'
  const dataServiceURL = env.MOVSCRIPT_DESKTOP_SMOKE_DATA_SERVICE_URL?.trim() || env.MOVSCRIPT_DATA_SERVICE_URL?.trim()
  return {
    enabled: true,
    dataPlane,
    ...(dataServiceURL ? { dataServiceURL } : {}),
  }
}

function localRuntimeDataPlaneForAPIBaseURL(apiBaseURL: string | undefined): 'cloud' | 'external' {
  if (!apiBaseURL) return 'cloud'
  try {
    const url = new URL(apiBaseURL)
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname) ? 'external' : 'cloud'
  } catch {
    return 'cloud'
  }
}
