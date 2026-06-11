import { setMovScriptBackendAPIBaseURL } from '@movscript/core/backend/node'
import {
  readMovScriptHomeConfig,
  resolveMovScriptHomeConfigPaths,
  type MovScriptAgentLaunchPolicy,
} from '@movscript/core/workspace/node'
import {
  getBackendLaunchPolicy,
  LOCAL_BACKEND_URL,
  startBackend,
} from '../services/backend'
import { appServerManager } from '../services/appServerManager'
import {
  formatDesktopRuntimePreflightFailure,
  prepareDesktopRuntimeDependencies,
} from '../services/desktopRuntime'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from '../services/movscriptWorkspaceDefaults'
import { broadcastBackendStatus } from './backendStatus'
import { ensureMCPServerReady } from './mcp'
import type { ElectronAppServerProfile } from '../../src/shared/contracts/electronApi'

const DEFAULT_BOOTSTRAP_AGENT_PROFILE: ElectronAppServerProfile = {
  id: 'mova-movscript-home',
  label: 'MovScript Mova',
  providerKey: 'mova',
  executableCommand: 'mova',
  executableEnvVar: 'MOVSCRIPT_MOVA_APP_SERVER_BIN',
  compatibilityBinEnvNames: ['MOVSCRIPT_MOVA_BIN'],
  candidateRootRelativePaths: [
    '../mova/codex-rs/target/debug',
    '../../mova/codex-rs/target/debug',
    '../../../mova/codex-rs/target/debug',
  ],
  candidateBinaryNames: [
    'app-server',
    'mova-app-server',
    ['codex', 'app-server'].join('-'),
    'codex',
  ],
  pathFallbackReady: false,
  home: '.mova',
  compatibilityHomeEnvNames: ['CODEX_HOME'],
  lifecycle: 'movscript-owned',
}

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

async function bootstrapAgentServices(policy: MovScriptAgentLaunchPolicy): Promise<void> {
  if (policy !== 'prewarm') {
    console.info(`[bootstrap] agent policy=${policy}; app-server will start on demand`)
    return
  }
  console.info('[bootstrap] agent policy=prewarm; starting managed app-server')
  const status = await appServerManager.ensure({ profile: DEFAULT_BOOTSTRAP_AGENT_PROFILE })
  if (!status.ok || !status.running) {
    throw new Error(status.error ?? 'Managed app-server failed to start')
  }
  console.info(`[bootstrap] managed app-server ready at ${status.endpoint ?? 'managed endpoint'}`)
}

export async function bootstrapManagedServicesBeforeWindow(): Promise<void> {
  const workspaceDir = resolveDesktopDefaultMovScriptWorkspaceDir()
  const homeConfig = readMovScriptHomeConfig(resolveMovScriptHomeConfigPaths(workspaceDir).configPath)
  const policy = getBackendLaunchPolicy({ workspaceDir })
  const runtime = prepareDesktopRuntimeDependencies({
    workspaceDir,
    requireMovScriptServer: policy === 'spawn',
    requireMovcli: true,
  })
  if (!runtime.preflight.ok) {
    throw new Error(`MovScript runtime dependency check failed:\n${formatDesktopRuntimePreflightFailure(runtime.preflight)}`)
  }
  await bootstrapBackendServices(policy)
  await ensureMCPServerReady()
  await bootstrapAgentServices(homeConfig.startup.agentPolicy)
}
