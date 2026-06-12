import type { MCPTool } from '../../protocol/types'
import { objectSchema } from '../schema'

export function projectTools(): MCPTool[] {
  return [
    {
      name: 'movscript_project_create',
      description: 'Create a formal MovScript project. Use only when the user explicitly asks to create a new project or confirms the project name.',
      inputSchema: objectSchema(
        {
          name: { type: 'string' },
          description: { type: 'string' },
          total_episodes: { type: 'number' },
        },
        ['name']
      ),
    },
  ]
}
