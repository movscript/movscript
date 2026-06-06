import type { MCPTool } from '../protocol/types'
import { focusTools } from '../tools/focus/definitions'
import { workspaceTools } from '../tools/workspace/definitions'
import { modelTools } from '../tools/model/definitions'
import { generationTools } from '../tools/generation/definitions'
import { shotLibraryTools } from '../tools/shot-library/definitions'
import { resourceLibraryTools } from '../tools/resource-library/definitions'
import { resourceMediaTools } from '../tools/resource-media/definitions'
import { externalResourceTools } from '../tools/external-resources/definitions'

export function listTools(): MCPTool[] {
  return [
    ...focusTools(),
    ...modelTools(),
    ...resourceLibraryTools(),
    ...resourceMediaTools(),
    ...shotLibraryTools(),
    ...externalResourceTools(),
    ...generationTools(),
    ...workspaceTools(),
  ]
}
