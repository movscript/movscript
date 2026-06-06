import type { MCPTool } from '../../protocol/types'
import { objectSchema } from '../schema'

export function resourceLibraryTools(): MCPTool[] {
  return [
    {
      name: 'movscript_resource_library_query',
      description: 'Query MovScript RawResources stored in the internal resource library. Use returned RawResource.ID values as input_resource_ids or reference_resource_ids for generation.',
      inputSchema: objectSchema(
        {
          query: { type: 'string', description: 'Search resource names.' },
          q: { type: 'string', description: 'Alias for query.' },
          resource_id: { type: 'number', description: 'Optional RawResource ID to filter the requested page.' },
          resourceId: { type: 'number', description: 'Camel-case alias for resource_id.' },
          id: { type: 'number', description: 'Alias for resource_id.' },
          type: { type: 'string', enum: ['image', 'video', 'audio', 'text', 'file'], description: 'Optional MovScript resource type filter.' },
          media_type: { type: 'string', enum: ['image', 'video', 'audio', 'text', 'file'], description: 'Alias for type.' },
          scope: { type: 'string', enum: ['personal', 'team'], description: 'Optional library scope. Omit for the unified visible library.' },
          folder_id: { type: 'string', description: 'Optional folder filter. Use "root" or "0" for unfiled resources.' },
          folderId: { type: 'string', description: 'Camel-case alias for folder_id.' },
          page: { type: 'number', description: '1-based page number. Defaults to 1.' },
          page_size: { type: 'number', description: 'Page size, clamped to 1-100. Defaults to 20.' },
          pageSize: { type: 'number', description: 'Camel-case alias for page_size.' },
          limit: { type: 'number', description: 'Alias for page_size.' },
          include_full: { type: 'boolean', description: 'When true, return full backend RawResource records.' },
          includeFull: { type: 'boolean', description: 'Camel-case alias for include_full.' },
        }
      ),
      outputSchema: objectSchema(
        {
          source: { type: 'string' },
          query: { type: 'string' },
          type: { type: 'string' },
          scope: { type: 'string' },
          folder_id: { type: 'string' },
          page: { type: 'number' },
          pageSize: { type: 'number' },
          total: { type: 'number' },
          count: { type: 'number' },
          items: { type: 'array', items: { type: 'object', additionalProperties: true } },
          usage: { type: 'string' },
          warning: { type: 'string' },
        },
        ['source', 'query', 'page', 'pageSize', 'total', 'count', 'items', 'usage']
      ),
    },
  ]
}
