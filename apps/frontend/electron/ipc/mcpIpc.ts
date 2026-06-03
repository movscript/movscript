import { ipcMain } from 'electron'
import { getMCPServerStatus, updateMCPContextSnapshot, updateMCPPluginTools } from '../mcp/server'
import { toMCPPluginTool } from '../mcp/pluginTools'
import type { MCPContextUpdate } from '../../src/shared/contracts/mcpContext'
import type { ElectronMCPPluginTool } from '../../src/shared/contracts/electronApi'

export function registerMCPIpcHandlers(): void {
  ipcMain.handle('mcp:update-context', (_e, snapshot: MCPContextUpdate) => {
    updateMCPContextSnapshot(snapshot)
  })

  ipcMain.handle('mcp:get-status', () => {
    return getMCPServerStatus()
  })

  ipcMain.handle('mcp:update-plugin-tools', (_e, tools: ElectronMCPPluginTool[]) => {
    updateMCPPluginTools(
      (Array.isArray(tools) ? tools : [])
        .map(toMCPPluginTool)
        .filter((tool): tool is NonNullable<ReturnType<typeof toMCPPluginTool>> => Boolean(tool))
    )
  })
}
