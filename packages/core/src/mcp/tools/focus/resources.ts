import { resourceContent } from '../../protocol/index.js'
import type { MCPJSONValue, MCPResource } from '../../protocol/types'
import { getMCPContextSnapshot } from './store.js'

export function listFocusResources(): MCPResource[] {
  return [
    {
      uri: 'movscript://ui/current-route',
      name: 'Current route',
      description: 'Current MovScript route in the Electron renderer.',
      mimeType: 'text/markdown',
    },
    {
      uri: 'movscript://ui/current-selection',
      name: 'Current selection',
      description: 'Current selected entity, when a page has reported one.',
      mimeType: 'text/markdown',
    },
    {
      uri: 'movscript://project/current',
      name: 'Current project',
      description: 'Current MovScript project summary.',
      mimeType: 'text/markdown',
    },
  ]
}

export const focusResourceReaders = [
  readFocusResource,
]

function readFocusResource(uri: string): MCPJSONValue | null {
  const snapshot = getMCPContextSnapshot()
  if (uri === 'movscript://ui/current-route') return resourceContent(uri, snapshot.route)
  if (uri === 'movscript://ui/current-selection') return resourceContent(uri, snapshot.selection)
  if (uri === 'movscript://project/current') return resourceContent(uri, snapshot.project)
  return null
}
