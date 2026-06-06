import type {
  JSONRPCRequest,
  JSONRPCResponse,
} from './types'
import { errorData } from '../../backend/errors.js'
import {
  makeError,
  makeResult,
} from './transport'
import { listResources, readResource } from '../server/resourceRegistry.js'
import { getStringParam } from './params'
import { callTool } from '../tools/router'
import { listTools } from '../server/toolRegistry'

const MCP_DEBUG = process.env.MOVSCRIPT_MCP_DEBUG === '1'

export async function handleJSONRPC(req: JSONRPCRequest, httpRequestId?: number): Promise<JSONRPCResponse | undefined> {
  const startedAt = Date.now()
  const isNotification = !Object.prototype.hasOwnProperty.call(req, 'id')
  const id = isNotification ? null : req.id ?? null
  if (MCP_DEBUG) {
    console.info(`[mcp] rpc start httpRequestId=${httpRequestId ?? 'n/a'} rpcId=${String(id)} method=${req.method ?? ''}`)
  }
  if (req.jsonrpc !== '2.0' || !req.method) {
    if (isNotification) return undefined
    return makeError(id, -32600, 'Invalid Request')
  }

  try {
    switch (req.method) {
      case 'initialized':
      case 'notifications/cancelled':
      case 'notifications/progress':
        return undefined
      case 'initialize':
        return makeResult(id, {
          protocolVersion: '2025-06-18',
          serverInfo: { name: 'movscript-core-mcp', version: '0.1.0' },
          capabilities: {
            resources: {},
            tools: {},
          },
        })
      case 'resources/list':
        return makeResult(id, { resources: listResources() })
      case 'resources/read':
        return makeResult(id, await readResource(getStringParam(req.params, 'uri')))
      case 'tools/list':
        return makeResult(id, { tools: listTools() })
      case 'tools/call':
        return makeResult(id, await callTool(req.params))
      default:
        if (isNotification) return undefined
        return makeError(id, -32601, `Method not found: ${req.method}`)
    }
  } catch (error) {
    console.error(`[mcp] rpc error httpRequestId=${httpRequestId ?? 'n/a'} rpcId=${String(id)} method=${req.method} elapsedMs=${Date.now() - startedAt}`, error)
    if (isNotification) return undefined
    return makeError(id, -32000, error instanceof Error ? error.message : String(error), errorData(error))
  } finally {
    if (MCP_DEBUG) {
      console.info(`[mcp] rpc finish httpRequestId=${httpRequestId ?? 'n/a'} rpcId=${String(id)} method=${req.method ?? ''} elapsedMs=${Date.now() - startedAt}`)
    }
  }
}
