import { setMovScriptBackendDefaultWorkspaceDir } from '../../../backend/runtime.js'

let configuredMCPDefaultWorkspaceDir: string | undefined

export function setMCPDefaultWorkspaceDir(workspaceDir: string | undefined): void {
  configuredMCPDefaultWorkspaceDir = workspaceDir?.trim() || undefined
  setMovScriptBackendDefaultWorkspaceDir(configuredMCPDefaultWorkspaceDir)
}

export function resolveMCPDefaultWorkspaceDir(): string {
  return configuredMCPDefaultWorkspaceDir || process.env.MOVSCRIPT_WORKSPACE_DIR || process.cwd()
}
