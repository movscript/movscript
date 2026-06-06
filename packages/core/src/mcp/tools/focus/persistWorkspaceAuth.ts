import type { MCPContextUpdate } from './types.js'
import { writeMovScriptBackendAuth } from '../../../backend/config.js'
import { setMCPContextAuthPersistence } from './store.js'
import { resolveMCPDefaultWorkspaceDir } from '../workspace/dir.js'

export function installMCPContextWorkspaceBackendAuthPersistence(): void {
  setMCPContextAuthPersistence(persistWorkspaceBackendAuth)
}

export function persistWorkspaceBackendAuth(next: MCPContextUpdate): void {
  const token = next.auth?.token?.trim()
  if (!token) return
  try {
    writeMovScriptBackendAuth(resolveMCPDefaultWorkspaceDir(), {
      token,
      user: next.user ? {
        id: next.user.id,
        username: next.user.username,
      } : undefined,
    })
  } catch {
    // MCP context updates must not fail just because workspace auth persistence is unavailable.
  }
}
