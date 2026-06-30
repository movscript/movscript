import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  getMCPContextSnapshot,
  getMCPServerStatus,
  handleMCPHTTP,
  installMCPContextWorkspaceBackendAuthPersistence,
  makeError,
  readBody,
  setCORSHeaders,
  setEditingRuntimePort,
  setMCPDefaultWorkspaceDir,
  startMCPHTTPServer,
  stopMCPServer,
  updateMCPContextSnapshot as updateLocalMCPContextSnapshot,
  writeAccepted,
  writeJSON,
  type EditingRuntimePort,
  type JSONRPCRequest,
  type JSONRPCResponse,
  type MCPServerStatus,
  type MCPContextUpdate,
} from '@movscript/core/mcp/node'
import {
  LOCAL_RUNTIME_DAEMON_GATEWAY_SERVICE,
} from '@movscript/local-runtime'
import {
  findRuntimeEndpoint,
  readRuntimeHomeSnapshot,
  resolveMovScriptHomeDir,
} from '@movscript/runtime-contracts'
import { handleMCPHostJSONRPC } from './stdio.js'

const MCP_HOST_HTTP_DEBUG = process.env.MOVSCRIPT_MCP_HOST_HTTP_DEBUG === '1'
let nextHTTPRequestId = 1

export type { EditingRuntimePort, MCPServerStatus }

export {
  getMCPServerStatus,
  installMCPContextWorkspaceBackendAuthPersistence,
  setEditingRuntimePort,
  setMCPDefaultWorkspaceDir,
  stopMCPServer,
}

export async function updateMCPContextSnapshot(next: MCPContextUpdate): Promise<void> {
  await postMCPContextSnapshotToDaemon(next).catch((error) => {
    if (MCP_HOST_HTTP_DEBUG) {
      console.info(`[mcp-host] daemon context update failed: ${errorMessage(error)}`)
    }
  })
  updateLocalMCPContextSnapshot(next)
}

export async function startMCPHostHTTPServer(): Promise<number> {
  return startMCPHTTPServer(handleMCPHostHTTP)
}

export async function handleMCPHostHTTP(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const requestId = nextHTTPRequestId++
  const startedAt = Date.now()
  res.on('finish', () => {
    if (MCP_HOST_HTTP_DEBUG) {
      console.info(`[mcp-host] http finish requestId=${requestId} method=${req.method ?? ''} url=${req.url ?? ''} status=${res.statusCode} elapsedMs=${Date.now() - startedAt}`)
    }
  })

  if (isAgentAPIProxyRequest(req)) {
    await handleMCPHTTP(req, res)
    return
  }

  setCORSHeaders(res, req.headers.origin)

  if (req.method === 'OPTIONS') {
    debugHTTPStart(requestId, req)
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url === '/health') {
    debugHTTPStart(requestId, req)
    writeJSON(res, 200, { ok: true, service: 'movscript-mcp-host', updatedAt: getMCPContextSnapshot().updatedAt })
    return
  }

  if (req.url !== '/mcp' || req.method !== 'POST') {
    debugHTTPStart(requestId, req)
    writeJSON(res, 404, { error: 'not found' })
    return
  }

  try {
    debugHTTPStart(requestId, req)
    const body = await readBody(req)
    const payload = JSON.parse(body) as JSONRPCRequest | JSONRPCRequest[]
    const response = Array.isArray(payload)
      ? (await Promise.all(payload.map((item) => handleMCPHostJSONRPC(item, { proxyToDaemon: true })))).filter((item): item is JSONRPCResponse => item !== undefined)
      : await handleMCPHostJSONRPC(payload, { proxyToDaemon: true })
    if (Array.isArray(response)) {
      if (response.length > 0) writeJSON(res, 200, response)
      else writeAccepted(res)
      return
    }
    if (response !== undefined) writeJSON(res, 200, response)
    else writeAccepted(res)
  } catch (error) {
    console.error(`[mcp-host] http error requestId=${requestId} method=${req.method ?? ''} url=${req.url ?? ''} elapsedMs=${Date.now() - startedAt}`, error)
    writeJSON(res, 200, makeError(null, -32700, 'Parse error', errorMessage(error)))
  }
}

function isAgentAPIProxyRequest(req: IncomingMessage): boolean {
  return !!req.url && req.url.startsWith('/agent-api/v1/')
}

async function postMCPContextSnapshotToDaemon(next: MCPContextUpdate): Promise<boolean> {
  const endpoint = daemonContextSessionsEndpoint()
  if (!endpoint) return false
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(daemonContextPayload(next)),
    signal: AbortSignal.timeout(1000),
  })
  if (!response.ok) {
    throw new Error(`daemon context update failed with HTTP ${response.status}`)
  }
  return true
}

function daemonContextSessionsEndpoint(): string | undefined {
  const homeDir = resolveMovScriptHomeDir()
  const endpoint = endpointURL(findRuntimeEndpoint(readRuntimeHomeSnapshot(homeDir), LOCAL_RUNTIME_DAEMON_GATEWAY_SERVICE))
  if (!endpoint) return undefined
  return `${trimURLTrailingSlash(endpoint)}/v1/context/sessions`
}

function daemonContextPayload(next: MCPContextUpdate): Record<string, unknown> {
  const projectDir = mcpContextProjectDir(next)
  return {
    schema: 'movscript.daemon-context-session-update.v1',
    sessionId: 'desktop-current',
    windowId: 'desktop-main',
    ...(next.project ? {
      projectId: next.project.id,
      projectTitle: next.project.name,
    } : {}),
    ...(projectDir ? {
      projectDir,
      workspaceRootUri: projectDir,
      workspaceKind: 'local-fs',
      capabilities: {
        localFileAccess: true,
        fileImport: true,
        mediaPreview: true,
      },
    } : {}),
    ...(next.user ? {
      principal: {
        userId: String(next.user.id),
        kind: 'cloud-user',
        displayName: next.user.username,
        scopeKind: 'user',
        scopeId: next.user.id,
      },
    } : {}),
    mcpContext: next,
  }
}

function mcpContextProjectDir(next: MCPContextUpdate): string | undefined {
  const project = next.project
  if (!project) return undefined
  return project.projectDir
    ?? project.projectPath
    ?? project.workspacePath
    ?? project.project_path
    ?? project.workspace_path
}

function endpointURL(endpoint: { url?: string; baseURL?: string; port?: number; protocol?: string } | undefined): string | undefined {
  if (!endpoint) return undefined
  if (endpoint.url) return endpoint.url
  if (endpoint.baseURL) return endpoint.baseURL
  if (endpoint.port && endpoint.protocol === 'http') return `http://127.0.0.1:${endpoint.port}`
  if (endpoint.port) return `http://127.0.0.1:${endpoint.port}`
  return undefined
}

function trimURLTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function debugHTTPStart(requestId: number, req: IncomingMessage): void {
  if (!MCP_HOST_HTTP_DEBUG) return
  console.info([
    `[mcp-host] http start requestId=${requestId}`,
    `method=${req.method ?? ''}`,
    `url=${req.url ?? ''}`,
    `remote=${req.socket.remoteAddress ?? ''}:${req.socket.remotePort ?? ''}`,
    `contentLength=${req.headers['content-length'] ?? ''}`,
  ].join(' '))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
