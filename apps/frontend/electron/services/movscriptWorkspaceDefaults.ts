import * as electron from 'electron'
import { setMovScriptBackendDefaultWorkspaceDir } from '@movscript/core/backend/node'
import { setMCPDefaultWorkspaceDir } from '@movscript/core/mcp/node'
import { fallbackUserMovScriptHomeDir, resolveDefaultMovScriptWorkspaceDir } from '@movscript/core/workspace/node'

let configuredDesktopMovScriptWorkspaceDir: string | undefined

export function setDesktopDefaultMovScriptWorkspaceDir(workspaceDir: string | undefined): void {
  configuredDesktopMovScriptWorkspaceDir = workspaceDir?.trim() || undefined
  setMovScriptBackendDefaultWorkspaceDir(configuredDesktopMovScriptWorkspaceDir)
  setMCPDefaultWorkspaceDir(configuredDesktopMovScriptWorkspaceDir)
}

export function resolveDesktopDefaultMovScriptWorkspaceDir(): string {
  if (configuredDesktopMovScriptWorkspaceDir) {
    return configuredDesktopMovScriptWorkspaceDir
  }
  if (process.env.MOVSCRIPT_HOME || process.env.MOVSCRIPT_WORKSPACE_DIR) {
    return resolveDefaultMovScriptWorkspaceDir()
  }
  return electron.app.isPackaged ? fallbackUserMovScriptHomeDir() : process.cwd()
}
