import * as electron from 'electron'
import { setMCPDefaultWorkspaceDir } from '@movscript/mcp-host'
import { fallbackUserMovScriptHomeDir, resolveDefaultMovScriptWorkspaceDir } from '@movscript/workspace/home'
import { resolveDesktopIdentity } from './desktopIdentity'

let configuredDesktopMovScriptWorkspaceDir: string | undefined

export function setDesktopDefaultMovScriptWorkspaceDir(workspaceDir: string | undefined): void {
  configuredDesktopMovScriptWorkspaceDir = workspaceDir?.trim() || undefined
  setMCPDefaultWorkspaceDir(configuredDesktopMovScriptWorkspaceDir)
}

export function resolveDesktopDefaultMovScriptWorkspaceDir(): string {
  if (configuredDesktopMovScriptWorkspaceDir) {
    return configuredDesktopMovScriptWorkspaceDir
  }
  if (process.env.MOVSCRIPT_HOME || process.env.MOVSCRIPT_WORKSPACE_DIR) {
    return resolveDefaultMovScriptWorkspaceDir()
  }
  const app = getElectronApp()
  if (app?.isPackaged) {
    return resolveDesktopIdentity().homeDir || fallbackUserMovScriptHomeDir()
  }
  return process.cwd()
}

function getElectronApp(): Electron.App | undefined {
  const candidate = (electron as unknown as { app?: Electron.App }).app
  return candidate && typeof candidate.getPath === 'function' ? candidate : undefined
}
