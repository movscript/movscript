import { resourceContent } from '../../protocol/index.js'
import type { MCPJSONValue, MCPResource } from '../../protocol/types'
import { isExternalResourcesURI, readExternalResources } from './actions.js'

export function listExternalResourceResources(): MCPResource[] {
  return [
    {
      uri: 'movscript://external-resources',
      name: 'External media search sources',
      description: 'Configured external image/video providers. Use movscript_external_resource_search for provider search; import results before generation.',
      mimeType: 'text/markdown',
    },
  ]
}

export const externalResourceReaders = [
  readExternalResourceResource,
]

async function readExternalResourceResource(uri: string): Promise<MCPJSONValue | null> {
  if (!isExternalResourcesURI(uri)) return null
  return resourceContent(uri, await readExternalResources(uri))
}
