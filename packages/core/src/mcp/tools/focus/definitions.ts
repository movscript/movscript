import type { MCPTool } from '../../protocol/types'
import { objectSchema } from '../schema'

export function focusTools(): MCPTool[] {
  return [
    {
      name: 'movscript_focus_get',
      description: 'Return the current MovScript task focus: route, selected project, active production id, current user, and selected entity. This does not load project lists, scripts, workspaces, or resources.',
      inputSchema: objectSchema({}),
    },
  ]
}
