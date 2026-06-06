import { ipcMain } from 'electron'
import {
  getMCPServerStatus,
  installMCPContextWorkspaceBackendAuthPersistence,
  updateMCPContextSnapshot,
} from '@movscript/core/mcp/node'
import type { MCPContextUpdate } from '../../src/shared/contracts/mcpContext'

export function registerMCPIpcHandlers(): void {
  installMCPContextWorkspaceBackendAuthPersistence()

  ipcMain.handle('mcp:update-context', (_e, snapshot: MCPContextUpdate) => {
    updateMCPContextSnapshot(snapshot)
  })

  ipcMain.handle('mcp:get-status', () => {
    return getMCPServerStatus()
  })
}
