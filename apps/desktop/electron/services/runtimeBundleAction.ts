import {
  installMovScriptHomePluginBundle,
  rollbackMovScriptHomePluginBundle,
} from '@movscript/plugins/node'
import type {
  ElectronRuntimeBundleAction,
  ElectronRuntimeBundleActionInput,
  ElectronRuntimeBundleActionResult,
} from '../../src/shared/contracts/electronApi'
import {
  ensureDesktopLocalRuntime,
  resolveDesktopBundledPluginRoot,
  type DesktopLocalRuntimeDataPlane,
} from '../../runtime/desktopApplicationRuntime'
import { readDesktopAppSettings } from './appSettings'
import { getElectronRuntimeConfig } from './runtimeConfig'
import { prepareDaemonForDesktopUpdateInstall } from './appUpdateDaemon'

export async function applyRuntimeBundleAction(
  input: ElectronRuntimeBundleActionInput = {},
): Promise<ElectronRuntimeBundleActionResult> {
  const before = getElectronRuntimeConfig()
  const action = runtimeBundleActionValue(input.action) ?? before.runtimeBundleStatus?.action ?? 'unknown'
  if (action === 'keep') return { ok: true, action, runtimeConfig: before }
  if (action === 'unknown') {
    return {
      ok: false,
      action,
      runtimeConfig: before,
      error: 'Runtime bundle status is unknown; refresh runtime config before applying an action.',
    }
  }

  const homeDir = before.movScriptHomeDir
  const installed = action === 'rollback'
    ? rollbackMovScriptHomePluginBundle({
      homeDir,
      reason: 'desktop-runtime-rollback',
      provider: 'desktop',
    })
    : installDesktopBundledRuntime(homeDir, action)
  const daemon = await restartDesktopRuntimeFromHomeCurrent(homeDir)
  const installedFlag = 'installed' in installed && typeof installed.installed === 'boolean'
    ? installed.installed
    : undefined
  return {
    ok: true,
    action,
    runtimeConfig: getElectronRuntimeConfig(),
    installed: {
      version: installed.version,
      pluginRoot: installed.targetPluginRoot,
      ...(installedFlag !== undefined ? { installed: installedFlag } : {}),
      ...(installed.bundleHash ? { bundleHash: installed.bundleHash } : {}),
    },
    daemon: {
      ...(daemon.daemonStatus ? { status: daemon.daemonStatus } : {}),
      ...(daemon.detail ? { detail: daemon.detail } : {}),
    },
  }
}

function installDesktopBundledRuntime(homeDir: string, action: 'upgrade' | 'repair') {
  const sourcePluginRoot = resolveDesktopBundledPluginRoot()
  if (!sourcePluginRoot) {
    throw new Error('Desktop bundled MovScript plugin runtime is not available.')
  }
  return installMovScriptHomePluginBundle({
    homeDir,
    sourcePluginRoot,
    mode: action === 'repair' ? 'repair' : 'seed-or-upgrade',
    reason: `desktop-runtime-${action}`,
    provider: 'desktop',
  })
}

async function restartDesktopRuntimeFromHomeCurrent(homeDir: string) {
  const daemon = await prepareDaemonForDesktopUpdateInstall({ homeDir })
  if (!daemon.ok) {
    throw new Error(`Failed to stop MovScript local runtime daemon before switching runtime bundle: ${daemon.error ?? daemon.daemonStatus ?? 'unknown error'}`)
  }
  const settings = readDesktopAppSettings(homeDir)
  const runtime = desktopRuntimeOptionsFromSettings(settings)
  await ensureDesktopLocalRuntime({
    homeDir,
    dataPlane: runtime.dataPlane,
    ...(runtime.dataServiceURL ? { dataServiceURL: runtime.dataServiceURL } : {}),
    forceRestart: true,
  })
  return daemon
}

function desktopRuntimeOptionsFromSettings(settings: ReturnType<typeof readDesktopAppSettings>): {
  dataPlane: DesktopLocalRuntimeDataPlane
  dataServiceURL?: string
} {
  const kind = settings?.dataConnection?.kind
  const dataPlane: DesktopLocalRuntimeDataPlane = settings?.launchMode === 'local' || kind === 'local'
    ? 'local'
    : 'cloud'
  const dataServiceURL = dataPlane === 'local'
    ? undefined
    : settings?.dataConnection?.url ?? settings?.cloudAPIBaseURL ?? settings?.apiBaseURL
  return {
    dataPlane,
    ...(dataServiceURL ? { dataServiceURL } : {}),
  }
}

function runtimeBundleActionValue(value: unknown): ElectronRuntimeBundleAction | undefined {
  if (value === 'upgrade' || value === 'keep' || value === 'repair' || value === 'rollback' || value === 'unknown') return value
  return undefined
}
