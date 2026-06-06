import type { MCPTool } from '../../protocol/types.js'
import { focusTools } from '../../tools/focus/definitions.js'
import { workspaceTools } from '../../tools/workspace/definitions.js'
import { modelTools } from '../../tools/model/definitions.js'
import { generationTools } from '../../tools/generation/definitions.js'
import { shotLibraryTools } from '../../tools/shot-library/definitions.js'
import { resourceLibraryTools } from '../../tools/resource-library/definitions.js'
import { resourceMediaTools } from '../../tools/resource-media/definitions.js'
import { externalResourceTools } from '../../tools/external-resources/definitions.js'

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
