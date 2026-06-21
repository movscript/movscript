import { resourceContent } from '../../../protocol/index.js'
import type { MCPJSONValue, MCPResource } from '../../../protocol/types.js'
import { isResourceLibraryURI, openResourceLibrary, readResourceLibrary } from './actions.js'

export function listResourceLibraryResources(): MCPResource[] {
  return [
    {
      uri: 'movscript://resource-library',
      name: 'MovScript resource library',
      description: 'Internal MovScript RawResource library. Use the movscript_resource_library_query tool for search and generation-ready resource IDs.',
      mimeType: 'text/markdown',
    },
    {
      uri: 'movscript://resource-library/open',
      name: 'Open MovScript resource library',
      description: 'Agent in-app browser URL for the MovScript resource library. Read this resource or call system_resource_library_open to get the current URL.',
      mimeType: 'text/markdown',
    },
  ]
}

export const resourceLibraryResourceReaders = [
  readResourceLibraryResource,
]

async function readResourceLibraryResource(uri: string): Promise<MCPJSONValue | null> {
  if (uri === 'movscript://resource-library/open') return resourceContent(uri, openResourceLibrary({}))
  if (!isResourceLibraryURI(uri)) return null
  return resourceContent(uri, await readResourceLibrary(uri))
}
