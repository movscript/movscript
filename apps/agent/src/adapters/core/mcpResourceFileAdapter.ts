import { contentRevision } from '../../files/agentFileEdit.js'
import { isJSONRecord, isJSONValue } from '../../jsonValue.js'
import type { MCPClient } from '../../mcpClient.js'
import type { CoreResourceFilePort, CoreResourceFileReadOptions } from '../../ports/core/resourceFilePort.js'
import type { JSONValue } from '../../state/types.js'

export function createMCPResourceFilePort(
  mcpClient: Pick<MCPClient, 'initialize'> & { readResource?: (uri: string) => Promise<JSONValue> },
): CoreResourceFilePort {
  return {
    isResourceRef(ref) {
      return ref.startsWith('movscript://')
    },
    async readFile(ref, options = {}) {
      if (!mcpClient.readResource) throw new Error('core_file_read requires MCP resource read support for movscript:// refs')
      await mcpClient.initialize({ signal: options.signal })
      const resourceRef = withMCPResourceRange(ref, options)
      const raw = await mcpClient.readResource(resourceRef)
      const text = textFromMCPResource(raw)
      const contentLimit = Math.max(1, Math.min(Math.floor(options.contentLimit ?? 20000), 100000))
      const content = text.length > contentLimit ? text.slice(0, contentLimit) : text
      return {
        status: 'read',
        file: {
          provider: 'mcp',
          kind: 'readonly_resource',
          ref,
          id: ref,
          metadata: isJSONRecord(raw) && isJSONValue(raw.data) ? { data: raw.data } : undefined,
        } as unknown as JSONValue,
        ref,
        revision: contentRevision(text),
        contentLength: text.length,
        content,
        truncated: text.length > contentLimit,
      }
    },
  }
}

function withMCPResourceRange(ref: string, options: CoreResourceFileReadOptions): string {
  if (options.startLine === undefined && options.lineCount === undefined && options.contentLimit === undefined) return ref
  const url = new URL(ref)
  if (options.startLine !== undefined) url.searchParams.set('startLine', String(options.startLine))
  if (options.lineCount !== undefined) url.searchParams.set('lineCount', String(options.lineCount))
  if (options.contentLimit !== undefined) url.searchParams.set('maxChars', String(options.contentLimit))
  return url.toString()
}

function textFromMCPResource(value: JSONValue): string {
  if (!isJSONRecord(value) || !Array.isArray(value.contents)) throw new Error('MCP resource read returned invalid contents')
  const firstText = value.contents.find((item) => isJSONRecord(item) && typeof item.text === 'string')
  if (!isJSONRecord(firstText) || typeof firstText.text !== 'string') throw new Error('MCP resource read returned no text content')
  return firstText.text
}
