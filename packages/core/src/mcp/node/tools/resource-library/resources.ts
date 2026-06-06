import { resourceContent } from '../../../protocol/index.js'
import type { MCPJSONValue, MCPResource } from '../../../protocol/types.js'
import { isResourceLibraryURI, readResourceLibrary } from './actions.js'

export function listResourceLibraryResources(): MCPResource[] {
  return [
    {
      uri: 'movscript://resource-library',
      name: 'MovScript resource library',
      description: 'Internal MovScript RawResource library. Use the movscript_resource_library_query tool for search and generation-ready resource IDs.',
      mimeType: 'text/markdown',
    },
  ]
}

export const resourceLibraryResourceReaders = [
  readResourceLibraryResource,
]

async function readResourceLibraryResource(uri: string): Promise<MCPJSONValue | null> {
  if (!isResourceLibraryURI(uri)) return null
  return resourceContent(uri, await readResourceLibrary(uri))
}
