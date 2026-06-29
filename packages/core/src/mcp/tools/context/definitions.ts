import type { MCPTool } from '../../protocol/types.js'
import { objectSchema } from '../schema.js'

export function contextTools(): MCPTool[] {
  return [
    {
      name: 'context_current_get',
      description: 'Return the current MovScript context/session hint for the agent: route, selected project, active production id, current user, and selected entity. This is read-only UI context and must not replace explicit project locators for writes.',
      inputSchema: objectSchema({}),
    },
  ]
}
