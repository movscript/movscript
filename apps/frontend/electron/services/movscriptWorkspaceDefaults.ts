import * as electron from 'electron'
import { fallbackUserMovScriptWorkspaceDir, resolveDefaultMovScriptWorkspaceDir } from '@movscript/workspaces/node'

let configuredDesktopMovScriptWorkspaceDir: string | undefined

export function setDesktopDefaultMovScriptWorkspaceDir(workspaceDir: string | undefined): void {
  configuredDesktopMovScriptWorkspaceDir = workspaceDir?.trim() || undefined
}

export function resolveDesktopDefaultMovScriptWorkspaceDir(): string {
  if (process.env.MOVSCRIPT_WORKSPACE_DIR) {
    return resolveDefaultMovScriptWorkspaceDir()
  }
  if (configuredDesktopMovScriptWorkspaceDir) {
    return configuredDesktopMovScriptWorkspaceDir
  }
  return electron.app.isPackaged ? fallbackUserMovScriptWorkspaceDir() : process.cwd()
}
