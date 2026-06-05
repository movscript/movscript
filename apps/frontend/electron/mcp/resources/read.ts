import { backendGet } from '../backendClient'
import { getMCPContextSnapshot } from '../context/store'
import { listProjects, summarizeResource } from '../projectTools'
import { resourceContent, scriptFileResourceContent } from '../responseFormat'
import { parseProjectResourceURI, projectResourceEndpoint } from './routes'
import {
  loadReadonlyScriptFile,
  normalizeScriptLineRange,
  parseScriptFileURI,
  scriptFileRangePayload,
} from '../scriptLocate'
import { isShotLibraryURI, readShotLibrary } from '../shotLibrary'
import { isResourceLibraryURI, readResourceLibrary } from '../resourceLibrary'
import { isExternalResourcesURI, readExternalResources } from '../externalResources'
import { readResourceFileBlob } from '../resourceMedia'
import type { MCPJSONValue } from '../types'

export async function readResource(uri: string): Promise<MCPJSONValue> {
  const snapshot = getMCPContextSnapshot()
  if (uri === 'movscript://ui/current-route') {
    return resourceContent(uri, snapshot.route)
  }
  if (uri === 'movscript://ui/current-selection') {
    return resourceContent(uri, snapshot.selection)
  }
  if (uri === 'movscript://project/current') {
    return resourceContent(uri, snapshot.project)
  }
  if (uri === 'movscript://projects') {
    return resourceContent(uri, await listProjects({}))
  }
  if (isShotLibraryURI(uri)) {
    return resourceContent(uri, await readShotLibrary(uri))
  }
  if (isResourceLibraryURI(uri)) {
    return resourceContent(uri, await readResourceLibrary(uri))
  }
  if (isExternalResourcesURI(uri)) {
    return resourceContent(uri, await readExternalResources(uri))
  }

  const resourceFile = parseResourceFileURI(uri)
  if (resourceFile) {
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

  const scriptResource = parseScriptFileURI(uri)
  if (scriptResource) {
    const file = await loadReadonlyScriptFile(scriptResource.projectId, scriptResource.scriptVersionId)
    const range = normalizeScriptLineRange(file.lines.length, {
      startLine: scriptResource.startLine,
      endLine: scriptResource.endLine,
      lineCount: scriptResource.lineCount,
      maxChars: scriptResource.maxChars,
    })
    return scriptFileResourceContent(uri, scriptFileRangePayload(file, range))
  }

  const projectResource = parseProjectResourceURI(uri)
  if (!projectResource) throw new Error(`Unsupported resource URI: ${uri}`)

  const data = await backendGet(projectResourceEndpoint(projectResource.projectId, projectResource.kind))
  return resourceContent(uri, summarizeResource(data))
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
