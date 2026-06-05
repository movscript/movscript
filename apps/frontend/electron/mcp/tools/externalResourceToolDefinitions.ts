import type { MCPTool } from '../types'
import { objectSchema } from './schema'

export function externalResourceTools(): MCPTool[] {
  return [
    {
      name: 'movscript_external_resource_source_list',
      description: 'List configured external media search sources such as Pexels or Pixabay. Use this when choosing a source_id for external media search.',
      inputSchema: objectSchema(
        {
          include_disabled: { type: 'boolean', description: 'When true, include disabled sources.' },
          includeDisabled: { type: 'boolean', description: 'Camel-case alias for include_disabled.' },
        }
      ),
      outputSchema: objectSchema(
        {
          source: { type: 'string' },
          count: { type: 'number' },
          items: { type: 'array', items: { type: 'object', additionalProperties: true } },
          usage: { type: 'string' },
        },
        ['source', 'count', 'items', 'usage']
      ),
    },
    {
      name: 'movscript_external_resource_search',
      description: 'Search external image/video providers configured in MovScript. Results are external media candidates and must be imported into MovScript before they can be used as generation resource IDs.',
      inputSchema: objectSchema(
        {
          query: { type: 'string', description: 'Search query, e.g. neon city street, handheld office scene, product packshot.' },
          q: { type: 'string', description: 'Alias for query.' },
          source_id: { type: 'number', description: 'External resource source ID. Omit to use the first enabled source.' },
          sourceId: { type: 'number', description: 'Camel-case alias for source_id.' },
          media_type: { type: 'string', enum: ['image', 'video'], description: 'Optional media type filter.' },
          mediaType: { type: 'string', enum: ['image', 'video'], description: 'Camel-case alias for media_type.' },
          orientation: { type: 'string', enum: ['all', 'landscape', 'portrait', 'square'], description: 'Optional orientation filter.' },
          page: { type: 'number', description: '1-based page number. Defaults to 1.' },
          page_size: { type: 'number', description: 'Page size, clamped to 1-80. Defaults to 20.' },
          pageSize: { type: 'number', description: 'Camel-case alias for page_size.' },
          limit: { type: 'number', description: 'Alias for page_size.' },
        },
      ),
      outputSchema: objectSchema(
        {
          source: { type: 'string' },
          source_id: { type: 'number' },
          query: { type: 'string' },
          media_type: { type: 'string' },
          orientation: { type: 'string' },
          page: { type: 'number' },
          pageSize: { type: 'number' },
          total: { type: 'number' },
          count: { type: 'number' },
          provider: { type: 'string' },
          source_name: { type: 'string' },
          next_page: { type: 'string' },
          items: { type: 'array', items: { type: 'object', additionalProperties: true } },
          usage: { type: 'string' },
        },
        ['source', 'source_id', 'query', 'page', 'pageSize', 'total', 'count', 'items', 'usage']
      ),
    },
  ]
}
