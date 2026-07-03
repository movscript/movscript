import { homedir } from 'node:os'
import { join, win32 as pathWin32 } from 'node:path'
import * as electron from 'electron'
import { fallbackUserMovScriptHomeDir } from '@movscript/workspace/home'

export type MovScriptDesktopDistributionProfile = 'default-local' | 'self-hosted' | 'custom'

export interface MovScriptDesktopIdentity {
  distributionProfile: MovScriptDesktopDistributionProfile
  appName: string
  homeDir: string
  userDataDir?: string
}

export interface ResolveDesktopIdentityOptions {
  platform?: NodeJS.Platform
  userHomeDir?: string
  appDataDir?: string
}

export function resolveDesktopIdentity(
  env: NodeJS.ProcessEnv = process.env,
  options: ResolveDesktopIdentityOptions = {},
): MovScriptDesktopIdentity {
  const platform = options.platform ?? process.platform
  const userHomeDir = options.userHomeDir ?? homedir()
  const appDataDir = options.appDataDir ?? getElectronAppDataDir(env, platform, userHomeDir)
  const distributionProfile = normalizeDesktopDistributionProfile(
    env.MOVSCRIPT_DESKTOP_DISTRIBUTION_PROFILE
      || env.MOVSCRIPT_DISTRIBUTION_PROFILE
      || env.MOVSCRIPT_DESKTOP_EDITION
      || env.MOVSCRIPT_APP_EDITION,
  )
  const appName = env.MOVSCRIPT_DESKTOP_APP_NAME?.trim() || desktopDistributionProfileAppName(distributionProfile)
  const homeDir = env.MOVSCRIPT_DESKTOP_HOME?.trim()
    || env.MOVSCRIPT_HOME?.trim()
    || env.MOVSCRIPT_WORKSPACE_DIR?.trim()
    || fallbackDesktopMovScriptHomeDir(distributionProfile, env, platform, userHomeDir)
  const userDataDir = env.MOVSCRIPT_DESKTOP_USER_DATA_DIR?.trim()
    || (distributionProfile === 'default-local' ? undefined : joinForPlatform(platform, appDataDir, appName))

  return {
    distributionProfile,
    appName,
    homeDir,
    ...(userDataDir ? { userDataDir } : {}),
  }
}

export function installDesktopIdentity(identity = resolveDesktopIdentity()): void {
  const app = getElectronApp()
  app?.setName(identity.appName)
  if (identity.userDataDir) app?.setPath('userData', identity.userDataDir)
  process.env.MOVSCRIPT_HOME ||= identity.homeDir
  process.env.MOVSCRIPT_WORKSPACE_DIR ||= identity.homeDir
}

function normalizeDesktopDistributionProfile(value: string | undefined): MovScriptDesktopDistributionProfile {
  switch (value?.trim().toLowerCase()) {
    case 'custom':
      return 'custom'
    case 'self-hosted':
    case 'self_hosted':
    case 'selfhosted':
    case 'enterprise':
      return 'self-hosted'
    case 'default':
    case 'default-local':
    case 'local':
    case 'community':
    default:
      return 'default-local'
  }
}

function desktopDistributionProfileAppName(profile: MovScriptDesktopDistributionProfile): string {
  switch (profile) {
    case 'self-hosted':
      return 'MovScript Self Hosted'
    case 'custom':
      return 'MovScript Custom'
    case 'default-local':
    default:
      return 'Movscript'
  }
}

function fallbackDesktopMovScriptHomeDir(
  distributionProfile: MovScriptDesktopDistributionProfile,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  userHomeDir: string,
): string {
  if (distributionProfile === 'default-local') return fallbackUserMovScriptHomeDir({ env, platform, userHomeDir })
  const homeName = distributionProfile === 'custom' ? 'MovScript Custom' : 'MovScript Self Hosted'
  const dotDir = distributionProfile === 'custom' ? '.movscript-custom' : '.movscript-self-hosted'
  if (platform === 'win32') {
    return pathWin32.join(getWindowsLocalAppDataDir(env, userHomeDir), homeName, 'Home')
  }
  return join(userHomeDir, dotDir)
}

function getElectronApp(): Electron.App | undefined {
  const candidate = (electron as unknown as { app?: Electron.App }).app
  return candidate && typeof candidate.getPath === 'function' ? candidate : undefined
}

function getElectronAppDataDir(env: NodeJS.ProcessEnv, platform: NodeJS.Platform, userHomeDir: string): string {
  const app = getElectronApp()
  if (app) return app.getPath('appData')
  if (platform === 'darwin') return join(userHomeDir, 'Library', 'Application Support')
  if (platform === 'win32') return env.APPDATA?.trim() || pathWin32.join(userHomeDir, 'AppData', 'Roaming')
  return env.XDG_CONFIG_HOME?.trim() || join(userHomeDir, '.config')
}

function getWindowsLocalAppDataDir(env: NodeJS.ProcessEnv, userHomeDir: string): string {
  return env.LOCALAPPDATA?.trim() || pathWin32.join(userHomeDir, 'AppData', 'Local')
}

function joinForPlatform(platform: NodeJS.Platform, ...parts: string[]): string {
  return platform === 'win32' ? pathWin32.join(...parts) : join(...parts)
}
