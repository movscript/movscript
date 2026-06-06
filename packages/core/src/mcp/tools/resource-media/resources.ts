import type { MCPJSONValue, MCPResource } from '../../protocol/types'
import { readResourceFileBlob } from './actions.js'

export function listResourceMediaResources(): MCPResource[] {
  return [
    {
      uri: 'movscript://resource-file/{resource_id}',
      name: 'MovScript resource file',
      description: 'Dynamic binary RawResource reader. Replace {resource_id} with an ID, for example movscript://resource-file/42?maxBytes=8388608. Use image/video media tools for Codex vision workflows.',
      mimeType: 'application/octet-stream',
    },
  ]
}

export const resourceMediaResourceReaders = [
  readResourceMediaResource,
]

async function readResourceMediaResource(uri: string): Promise<MCPJSONValue | null> {
  const resourceFile = parseResourceFileURI(uri)
  if (!resourceFile) return null
  const file = await readResourceFileBlob(resourceFile.resourceId, { maxBytes: resourceFile.maxBytes })
  return {
    contents: [
      {
        uri,
        mimeType: file.mimeType,
        blob: file.blob,
      },
    ],
    data: {
      resource_id: resourceFile.resourceId,
      mime_type: file.mimeType,
      size_bytes: file.sizeBytes,
    },
  }
}

function parseResourceFileURI(uri: string): { resourceId: number; maxBytes?: number } | null {
  const match = uri.match(/^movscript:\/\/resource-file\/(\d+)(?:\?(.*))?$/)
  if (!match) return null
  const params = new URLSearchParams(match[2] ?? '')
  const maxBytes = numericParam(params.get('maxBytes') ?? params.get('max_bytes'))
  return {
    resourceId: Number(match[1]),
    ...(maxBytes !== undefined ? { maxBytes } : {}),
  }
}

function numericParam(value: string | null): number | undefined {
  if (!value?.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
