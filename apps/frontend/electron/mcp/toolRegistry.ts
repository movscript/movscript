import type { MCPTool } from './types'
import { generationTools } from './tools/generationToolDefinitions'
import { workspaceTools } from './tools/workspaceToolDefinitions'

export function listTools(): MCPTool[] {
  return [
    ...workspaceTools(),
    ...generationTools(),
  ]
}
