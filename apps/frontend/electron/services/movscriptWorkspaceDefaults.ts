import * as electron from 'electron'
import { setMCPDefaultWorkspaceDir } from '@movscript/core/mcp/node'
import { fallbackUserMovScriptHomeDir, resolveDefaultMovScriptWorkspaceDir } from '@movscript/core/workspace/node'

let configuredDesktopMovScriptWorkspaceDir: string | undefined

export function setDesktopDefaultMovScriptWorkspaceDir(workspaceDir: string | undefined): void {
  configuredDesktopMovScriptWorkspaceDir = workspaceDir?.trim() || undefined
  setMCPDefaultWorkspaceDir(configuredDesktopMovScriptWorkspaceDir)
}

export function resolveDesktopDefaultMovScriptWorkspaceDir(): string {
  if (process.env.MOVSCRIPT_HOME || process.env.MOVSCRIPT_WORKSPACE_DIR) {
    return resolveDefaultMovScriptWorkspaceDir()
  }
  if (configuredDesktopMovScriptWorkspaceDir) {
    return configuredDesktopMovScriptWorkspaceDir
  }
  return electron.app.isPackaged ? fallbackUserMovScriptHomeDir() : process.cwd()
}
