import { homedir } from 'node:os'
import { join, win32 as pathWin32 } from 'node:path'
import * as electron from 'electron'

export type MovScriptDesktopEdition = 'community' | 'enterprise'

export interface MovScriptDesktopIdentity {
  edition: MovScriptDesktopEdition
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
  const edition = normalizeDesktopEdition(env.MOVSCRIPT_DESKTOP_EDITION || env.MOVSCRIPT_APP_EDITION)
  const appName = env.MOVSCRIPT_DESKTOP_APP_NAME?.trim() || (edition === 'enterprise' ? 'MovScript Enterprise' : 'Movscript')
  const homeDir = env.MOVSCRIPT_DESKTOP_HOME?.trim()
    || env.MOVSCRIPT_HOME?.trim()
    || env.MOVSCRIPT_WORKSPACE_DIR?.trim()
    || fallbackDesktopMovScriptHomeDir(edition, env, platform, userHomeDir)
  const userDataDir = env.MOVSCRIPT_DESKTOP_USER_DATA_DIR?.trim()
    || (edition === 'enterprise' ? joinForPlatform(platform, appDataDir, 'MovScript Enterprise') : undefined)

  return {
    edition,
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

function normalizeDesktopEdition(value: string | undefined): MovScriptDesktopEdition {
  return value?.trim().toLowerCase() === 'enterprise' ? 'enterprise' : 'community'
}

function fallbackDesktopMovScriptHomeDir(
  edition: MovScriptDesktopEdition,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  userHomeDir: string,
): string {
  if (platform === 'win32') {
    const appName = edition === 'enterprise' ? 'MovScript Enterprise' : 'Movscript'
    return pathWin32.join(getWindowsLocalAppDataDir(env, userHomeDir), appName, 'Home')
  }
  return edition === 'enterprise' ? join(userHomeDir, '.movscript-enterprise') : join(userHomeDir, '.movscript')
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
