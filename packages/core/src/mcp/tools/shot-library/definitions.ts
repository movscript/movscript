import type { MCPTool } from '../../protocol/types'
import { objectSchema } from '../schema'

export function shotLibraryTools(): MCPTool[] {
  return [
    {
      name: 'movscript_shot_library_query',
      description: 'Query the MovScript shot reference library for reusable camera, composition, movement, narrative, emotion, and production patterns. Use this before generation when the user asks for a shot style, camera plan, reference shot, or reusable visual pattern.',
      inputSchema: objectSchema(
        {
          query: { type: 'string', description: 'Natural-language or tag query, e.g. 角色发现真相前, slow push in, foreground obstruction, tension.' },
          q: { type: 'string', description: 'Alias for query.' },
          shot_reference_id: { type: 'number', description: 'Optional shot reference ID to filter the requested page.' },
          shotReferenceId: { type: 'number', description: 'Camel-case alias for shot_reference_id.' },
          id: { type: 'number', description: 'Alias for shot_reference_id.' },
          page: { type: 'number', description: '1-based page number. Defaults to 1.' },
          page_size: { type: 'number', description: 'Page size, clamped to 1-100. Defaults to 20.' },
          pageSize: { type: 'number', description: 'Camel-case alias for page_size.' },
          limit: { type: 'number', description: 'Alias for page_size.' },
          topK: { type: 'number', description: 'Alias for page_size.' },
          include_full: { type: 'boolean', description: 'When true, return the full backend record instead of a compact agent summary.' },
          includeFull: { type: 'boolean', description: 'Camel-case alias for include_full.' },
        }
      ),
      outputSchema: objectSchema(
        {
          query: { type: 'string' },
          page: { type: 'number' },
          pageSize: { type: 'number' },
          total: { type: 'number' },
          count: { type: 'number' },
          items: { type: 'array', items: { type: 'object', additionalProperties: true } },
          warning: { type: 'string' },
        },
        ['query', 'page', 'pageSize', 'total', 'count', 'items']
      ),
    },
  ]
}
