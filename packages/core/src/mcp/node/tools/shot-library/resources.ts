import { resourceContent } from '../../../protocol/index.js'
import type { MCPJSONValue, MCPResource } from '../../../protocol/types.js'
import { isShotLibraryURI, readShotLibrary } from './actions.js'

export function listShotLibraryResources(): MCPResource[] {
  return [
    {
      uri: 'movscript://shot-library',
      name: 'Shot reference library',
      description: 'Searchable MovScript shot reference library for reusable camera, composition, movement, narrative, emotion, and production patterns.',
      mimeType: 'text/markdown',
    },
  ]
}

export const shotLibraryResourceReaders = [
  readShotLibraryResource,
]

async function readShotLibraryResource(uri: string): Promise<MCPJSONValue | null> {
  if (!isShotLibraryURI(uri)) return null
  return resourceContent(uri, await readShotLibrary(uri))
}
