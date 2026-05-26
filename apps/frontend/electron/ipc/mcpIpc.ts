import { ipcMain } from 'electron'
import { getMCPServerStatus, updateMCPContextSnapshot } from '../mcp/server'
import type { MCPContextUpdate } from '../../src/shared/contracts/mcpContext'

export function registerMCPIpcHandlers(): void {
  ipcMain.handle('mcp:update-context', (_e, snapshot: MCPContextUpdate) => {
    updateMCPContextSnapshot(snapshot)
  })

  ipcMain.handle('mcp:get-status', () => {
    return getMCPServerStatus()
  })
}
