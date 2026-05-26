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
