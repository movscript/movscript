import type { MCPTool } from './types'
import { workspaceTools } from './tools/workspaceToolDefinitions'
import { listMCPPluginTools } from './pluginTools'
import { modelTools } from './tools/modelToolDefinitions'

export function listTools(): MCPTool[] {
  return [
    ...modelTools(),
    ...workspaceTools(),
    ...listMCPPluginTools(),
  ]
}
