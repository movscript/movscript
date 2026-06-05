import type { MCPTool } from './types'
import { workspaceTools } from './tools/workspaceToolDefinitions'
import { modelTools } from './tools/modelToolDefinitions'
import { generationTools } from './tools/generationToolDefinitions'
import { shotLibraryTools } from './tools/shotLibraryToolDefinitions'
import { resourceLibraryTools } from './tools/resourceLibraryToolDefinitions'
import { resourceMediaTools } from './tools/resourceMediaToolDefinitions'
import { externalResourceTools } from './tools/externalResourceToolDefinitions'

export function listTools(): MCPTool[] {
  return [
    ...modelTools(),
    ...resourceLibraryTools(),
    ...resourceMediaTools(),
    ...shotLibraryTools(),
    ...externalResourceTools(),
    ...generationTools(),
    ...workspaceTools(),
  ]
}
