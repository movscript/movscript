import { homedir } from 'node:os'
import { join } from 'node:path'
import * as electron from 'electron'
import { fallbackUserMovScriptHomeDir } from '@movscript/core/workspace/node'

export type MovScriptDesktopEdition = 'community' | 'enterprise'

export interface MovScriptDesktopIdentity {
  edition: MovScriptDesktopEdition
  appName: string
  homeDir: string
  userDataDir?: string
}

export function resolveDesktopIdentity(env: NodeJS.ProcessEnv = process.env): MovScriptDesktopIdentity {
  const edition = normalizeDesktopEdition(env.MOVSCRIPT_DESKTOP_EDITION || env.MOVSCRIPT_APP_EDITION)
  const appName = env.MOVSCRIPT_DESKTOP_APP_NAME?.trim() || (edition === 'enterprise' ? 'MovScript Enterprise' : 'Movscript')
  const homeDir = env.MOVSCRIPT_DESKTOP_HOME?.trim()
    || env.MOVSCRIPT_HOME?.trim()
    || env.MOVSCRIPT_WORKSPACE_DIR?.trim()
    || fallbackDesktopMovScriptHomeDir(edition)
  const userDataDir = env.MOVSCRIPT_DESKTOP_USER_DATA_DIR?.trim()
    || (edition === 'enterprise' ? join(getElectronAppDataDir(), 'MovScript Enterprise') : undefined)

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

function fallbackDesktopMovScriptHomeDir(edition: MovScriptDesktopEdition): string {
  return edition === 'enterprise' ? join(homedir(), '.movscript-enterprise') : fallbackUserMovScriptHomeDir()
}

function getElectronApp(): Electron.App | undefined {
  const candidate = (electron as unknown as { app?: Electron.App }).app
  return candidate && typeof candidate.getPath === 'function' ? candidate : undefined
}

function getElectronAppDataDir(): string {
  const app = getElectronApp()
  if (app) return app.getPath('appData')
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support')
  if (process.platform === 'win32') return process.env.APPDATA?.trim() || join(homedir(), 'AppData', 'Roaming')
  return process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), '.config')
}
