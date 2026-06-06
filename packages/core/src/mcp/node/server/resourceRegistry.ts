import type { MCPJSONValue, MCPResource } from '../../protocol/types.js'
import {
  focusResourceReaders,
  listFocusResources,
} from '../tools/focus/resources.js'
import {
  listProjectResources,
  projectResourceReaders,
} from '../tools/project/resources.js'
import {
  listShotLibraryResources,
  shotLibraryResourceReaders,
} from '../tools/shot-library/resources.js'
import {
  listResourceLibraryResources,
  resourceLibraryResourceReaders,
} from '../tools/resource-library/resources.js'
import {
  listResourceMediaResources,
  resourceMediaResourceReaders,
} from '../tools/resource-media/resources.js'
import {
  externalResourceReaders,
  listExternalResourceResources,
} from '../tools/external-resources/resources.js'

type ResourceReader = (uri: string) => Promise<MCPJSONValue | null> | MCPJSONValue | null

const resourceReaders: ResourceReader[] = [
  ...focusResourceReaders,
  ...projectResourceReaders,
  ...shotLibraryResourceReaders,
  ...resourceLibraryResourceReaders,
  ...resourceMediaResourceReaders,
  ...externalResourceReaders,
]

export function listResources(): MCPResource[] {
  return [
    ...listFocusResources(),
    ...listProjectResources(),
    ...listShotLibraryResources(),
    ...listResourceLibraryResources(),
    ...listResourceMediaResources(),
    ...listExternalResourceResources(),
  ]
}

export async function readResource(uri: string): Promise<MCPJSONValue> {
  for (const reader of resourceReaders) {
    const result = await reader(uri)
    if (result) return result
  }
  throw new Error(`Unsupported resource URI: ${uri}`)
}
