import { MCPError } from '../../adapters/mcp/client/mcpClient.js'
import type { JSONValue } from '../../shared/protocol/types.js'
import { isJSONRecord } from '../../shared/json/jsonValue.js'

export function generationBackendErrorData(error: unknown): JSONValue | undefined {
  if (!(error instanceof MCPError)) return undefined
  const data = error.data
  if (!isJSONRecord(data)) return undefined
  if (data.type !== 'backend_http_error' || data.status !== 400 || typeof data.code !== 'string') return undefined
  return data
}
