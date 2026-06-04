import type { MCPTool } from './types'
import { workspaceTools } from './tools/workspaceToolDefinitions'
import { modelTools } from './tools/modelToolDefinitions'
import { generationTools } from './tools/generationToolDefinitions'

export function listTools(): MCPTool[] {
  return [
    ...modelTools(),
    ...generationTools(),
    ...workspaceTools(),
  ]
}
