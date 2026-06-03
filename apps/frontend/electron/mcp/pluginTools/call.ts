import * as electron from 'electron'
import type { IpcMainEvent } from 'electron'

const { BrowserWindow, ipcMain } = electron

export interface MCPPluginToolCallInput {
  pluginId: string
  toolName: string
  args: Record<string, unknown>
}

interface MCPPluginToolCallResponse {
  requestId: string
  result?: unknown
  error?: string
}

const PLUGIN_TOOL_CALL_TIMEOUT_MS = 120_000

export async function callMCPPluginTool(input: MCPPluginToolCallInput): Promise<unknown> {
  const target = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!target) throw new Error('No renderer window is available to execute plugin tool')
  const requestId = `plugin_tool_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const response = waitForPluginToolResponse(requestId)
  target.webContents.send('mcp:plugin-tool-call', {
    requestId,
    pluginId: input.pluginId,
    toolName: input.toolName,
    args: input.args,
  })
  return await response
}

function waitForPluginToolResponse(requestId: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ipcMain.removeListener('mcp:plugin-tool-result', listener)
      reject(new Error(`Plugin tool call timed out: ${requestId}`))
    }, PLUGIN_TOOL_CALL_TIMEOUT_MS)

    const listener = (_event: IpcMainEvent, response: MCPPluginToolCallResponse) => {
      if (response?.requestId !== requestId) return
      clearTimeout(timeout)
      ipcMain.removeListener('mcp:plugin-tool-result', listener)
      if (response.error) {
        reject(new Error(response.error))
        return
      }
      resolve(response.result)
    }

    ipcMain.on('mcp:plugin-tool-result', listener)
  })
}
