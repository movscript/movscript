import { BrowserWindow, shell } from 'electron'
import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import {
  JSONRPCRequest,
  JSONRPCResponse,
  MCPContextSnapshot,
  MCPDraft,
  MCPDraftKind,
  MCPJSONValue,
  MCPResource,
  MCPTool,
} from './types'

const DEFAULT_PORT = 18765
const API_BASE_URL = process.env.MOVSCRIPT_API_BASE_URL || 'http://localhost:8765/api/v1'

const contextSnapshot: MCPContextSnapshot = {
  route: { pathname: '/', search: '', hash: '' },
  project: null,
  user: null,
  selection: null,
  updatedAt: new Date(0).toISOString(),
}

const drafts = new Map<string, MCPDraft>()
let server: Server | null = null

export function updateMCPContextSnapshot(next: MCPContextSnapshot): void {
  contextSnapshot.route = next.route
  contextSnapshot.project = next.project
  contextSnapshot.user = next.user
  contextSnapshot.selection = next.selection
  contextSnapshot.updatedAt = next.updatedAt
}

export function getMCPContextSnapshot(): MCPContextSnapshot {
  return { ...contextSnapshot }
}

export async function startMCPServer(): Promise<number> {
  if (server?.listening) return addressPort(server) ?? DEFAULT_PORT

  const port = Number(process.env.MOVSCRIPT_MCP_PORT || DEFAULT_PORT)
  server = createServer(handleHTTP)

  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject)
    server!.listen(port, '127.0.0.1', () => {
      server!.off('error', reject)
      resolve()
    })
  })

  console.info(`[mcp] MovScript MCP server listening on http://127.0.0.1:${port}/mcp`)
  return port
}

export async function stopMCPServer(): Promise<void> {
  if (!server) return
  await new Promise<void>((resolve) => server!.close(() => resolve()))
  server = null
}

function addressPort(srv: Server): number | null {
  const address = srv.address()
  return typeof address === 'object' && address ? address.port : null
}

async function handleHTTP(req: IncomingMessage, res: ServerResponse): Promise<void> {
  setCORSHeaders(res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url === '/health') {
    writeJSON(res, 200, { ok: true, service: 'movscript-mcp', updatedAt: contextSnapshot.updatedAt })
    return
  }

  if (req.url !== '/mcp' || req.method !== 'POST') {
    writeJSON(res, 404, { error: 'not found' })
    return
  }

  try {
    const body = await readBody(req)
    const payload = JSON.parse(body) as JSONRPCRequest | JSONRPCRequest[]
    if (Array.isArray(payload)) {
      const responses = await Promise.all(payload.map(handleJSONRPC))
      writeJSON(res, 200, responses)
    } else {
      writeJSON(res, 200, await handleJSONRPC(payload))
    }
  } catch (error) {
    writeJSON(res, 200, makeError(null, -32700, 'Parse error', String(error)))
  }
}

async function handleJSONRPC(req: JSONRPCRequest): Promise<JSONRPCResponse> {
  const id = req.id ?? null
  if (req.jsonrpc !== '2.0' || !req.method) {
    return makeError(id, -32600, 'Invalid Request')
  }

  try {
    switch (req.method) {
      case 'initialize':
        return makeResult(id, {
          protocolVersion: '2025-06-18',
          serverInfo: { name: 'movscript-frontend-mcp', version: '0.1.0' },
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
        return makeError(id, -32601, `Method not found: ${req.method}`)
    }
  } catch (error) {
    return makeError(id, -32000, error instanceof Error ? error.message : String(error))
  }
}

function listResources(): MCPResource[] {
  const resources: MCPResource[] = [
    {
      uri: 'movscript://ui/current-route',
      name: 'Current route',
      description: 'Current MovScript route in the Electron renderer.',
      mimeType: 'application/json',
    },
    {
      uri: 'movscript://ui/current-selection',
      name: 'Current selection',
      description: 'Current selected entity, when a page has reported one.',
      mimeType: 'application/json',
    },
    {
      uri: 'movscript://project/current',
      name: 'Current project',
      description: 'Current MovScript project summary.',
      mimeType: 'application/json',
    },
  ]

  if (contextSnapshot.project) {
    const id = contextSnapshot.project.id
    resources.push(
      resource(`movscript://project/${id}/summary`, 'Project summary'),
      resource(`movscript://project/${id}/scripts`, 'Scripts'),
      resource(`movscript://project/${id}/settings`, 'Settings'),
      resource(`movscript://project/${id}/assets`, 'Assets'),
      resource(`movscript://project/${id}/episodes`, 'Episodes'),
      resource(`movscript://project/${id}/scenes`, 'Scenes'),
      resource(`movscript://project/${id}/storyboards`, 'Storyboards'),
      resource(`movscript://project/${id}/shots`, 'Shots'),
      resource(`movscript://project/${id}/pipeline`, 'Pipeline'),
      resource(`movscript://project/${id}/tasks`, 'Tasks'),
      resource(`movscript://project/${id}/drafts`, 'Drafts')
    )
  }

  return resources
}

function resource(uri: string, name: string): MCPResource {
  return { uri, name, mimeType: 'application/json' }
}

async function readResource(uri: string): Promise<MCPJSONValue> {
  if (uri === 'movscript://ui/current-route') {
    return resourceContent(uri, contextSnapshot.route)
  }
  if (uri === 'movscript://ui/current-selection') {
    return resourceContent(uri, contextSnapshot.selection)
  }
  if (uri === 'movscript://project/current') {
    return resourceContent(uri, contextSnapshot.project)
  }

  const match = uri.match(/^movscript:\/\/project\/(\d+)\/([a-z-]+)$/)
  if (!match) throw new Error(`Unsupported resource URI: ${uri}`)

  const projectId = Number(match[1])
  const kind = match[2]

  if (kind === 'drafts') {
    const projectDrafts = Array.from(drafts.values()).filter((d) => d.projectId === projectId)
    return resourceContent(uri, projectDrafts)
  }

  const data = await backendGet(projectEndpoint(projectId, kind))
  return resourceContent(uri, summarizeResource(kind, data))
}

function resourceContent(uri: string, value: unknown): MCPJSONValue {
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(value ?? null, null, 2),
      },
    ],
  }
}

function projectEndpoint(projectId: number, kind: string): string {
  switch (kind) {
    case 'summary':
      return `/projects/${projectId}`
    case 'scripts':
    case 'settings':
    case 'assets':
    case 'episodes':
    case 'scenes':
    case 'storyboards':
    case 'shots':
    case 'pipeline':
    case 'tasks':
      return `/projects/${projectId}/${kind}`
    default:
      throw new Error(`Unsupported project resource kind: ${kind}`)
  }
}

function listTools(): MCPTool[] {
  return [
    {
      name: 'movscript.get_context_pack',
      description: 'Return the current route, project, user, selection, and available resources.',
      inputSchema: objectSchema({}),
    },
    {
      name: 'movscript.read_entity',
      description: 'Read one project entity by type and id from MovScript backend APIs.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number' },
          entityType: { type: 'string', enum: ['project', 'script', 'setting', 'asset', 'episode', 'scene', 'storyboard', 'shot', 'task'] },
          entityId: { type: 'number' },
        },
        ['entityType', 'entityId']
      ),
    },
    {
      name: 'movscript.search_entities',
      description: 'Search project entities by keyword across first-version read scopes.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number' },
          query: { type: 'string' },
          entityTypes: { type: 'array', items: { type: 'string' } },
          limit: { type: 'number' },
        },
        ['query']
      ),
    },
    {
      name: 'movscript.create_draft',
      description: 'Create a local draft artifact. This does not write to MovScript project entities.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number' },
          kind: { type: 'string', enum: ['script', 'setting', 'storyboard', 'shot', 'task', 'prompt', 'note'] },
          title: { type: 'string' },
          content: { type: 'string' },
          source: { type: 'object' },
        },
        ['kind', 'title', 'content']
      ),
    },
    {
      name: 'movscript.list_drafts',
      description: 'List local draft artifacts for the current or specified project.',
      inputSchema: objectSchema({ projectId: { type: 'number' } }),
    },
    {
      name: 'movscript.open_entity',
      description: 'Ask the MovScript UI to open a page for an entity type. This is navigation only.',
      inputSchema: objectSchema(
        {
          entityType: { type: 'string', enum: ['project', 'script', 'setting', 'asset', 'episode', 'scene', 'storyboard', 'shot', 'task', 'pipeline'] },
          entityId: { type: 'number' },
        },
        ['entityType']
      ),
    },
  ]
}

function objectSchema(properties: Record<string, MCPJSONValue>, required?: string[]) {
  return {
    type: 'object' as const,
    properties,
    required,
    additionalProperties: false,
  }
}

async function callTool(params: MCPJSONValue | undefined): Promise<MCPJSONValue> {
  const name = getStringParam(params, 'name')
  const args = getObjectParam(params, 'arguments')

  switch (name) {
    case 'movscript.get_context_pack':
      return toolText({
        snapshot: contextSnapshot,
        resources: listResources(),
        draftCount: drafts.size,
      })
    case 'movscript.read_entity':
      return toolText(await readEntity(args))
    case 'movscript.search_entities':
      return toolText(await searchEntities(args))
    case 'movscript.create_draft':
      return toolText(createDraft(args))
    case 'movscript.list_drafts':
      return toolText(listDrafts(args))
    case 'movscript.open_entity':
      return toolText(openEntity(args))
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

async function readEntity(args: Record<string, unknown>): Promise<unknown> {
  const projectId = getOptionalNumber(args, 'projectId') ?? contextSnapshot.project?.id
  const entityType = getRequiredString(args, 'entityType')
  const entityId = getRequiredNumber(args, 'entityId')

  if (entityType === 'project') {
    return backendGet(`/projects/${entityId}`)
  }
  if (!projectId) throw new Error('projectId is required when no current project is selected')

  const collection = collectionForEntity(entityType)
  const data = await backendGet(`/projects/${projectId}/${collection}`)
  const items = Array.isArray(data) ? data : data?.items
  if (!Array.isArray(items)) return data

  const found = items.find((item) => Number(item?.ID ?? item?.id) === entityId)
  if (!found) throw new Error(`${entityType} ${entityId} not found`)
  return found
}

async function searchEntities(args: Record<string, unknown>): Promise<unknown> {
  const projectId = getOptionalNumber(args, 'projectId') ?? contextSnapshot.project?.id
  const query = getRequiredString(args, 'query').trim().toLowerCase()
  const limit = getOptionalNumber(args, 'limit') ?? 20
  const requestedTypes = getStringArray(args.entityTypes)
  const entityTypes = requestedTypes.length > 0
    ? requestedTypes
    : ['script', 'setting', 'asset', 'episode', 'scene', 'storyboard', 'shot', 'task']

  if (!projectId) throw new Error('projectId is required when no current project is selected')

  const results: unknown[] = []
  for (const entityType of entityTypes) {
    const collection = collectionForEntity(entityType)
    const data = await backendGet(`/projects/${projectId}/${collection}`)
    const items = Array.isArray(data) ? data : data?.items
    if (!Array.isArray(items)) continue

    for (const item of items) {
      const haystack = JSON.stringify(item).toLowerCase()
      if (haystack.includes(query)) {
        results.push({ entityType, item: summarizeEntity(item) })
      }
      if (results.length >= limit) return { results }
    }
  }

  return { results }
}

function createDraft(args: Record<string, unknown>): MCPDraft {
  const kind = getRequiredString(args, 'kind') as MCPDraftKind
  const title = getRequiredString(args, 'title')
  const content = getRequiredString(args, 'content')
  const projectId = getOptionalNumber(args, 'projectId') ?? contextSnapshot.project?.id ?? null
  const now = new Date().toISOString()
  const draft: MCPDraft = {
    id: `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    projectId,
    kind,
    title,
    content,
    source: isRecord(args.source) ? {
      entityType: typeof args.source.entityType === 'string' ? args.source.entityType : undefined,
      entityId: typeof args.source.entityId === 'number' ? args.source.entityId : undefined,
      runId: typeof args.source.runId === 'string' ? args.source.runId : undefined,
    } : undefined,
    createdAt: now,
    updatedAt: now,
  }
  drafts.set(draft.id, draft)
  return draft
}

function listDrafts(args: Record<string, unknown>): { drafts: MCPDraft[] } {
  const projectId = getOptionalNumber(args, 'projectId') ?? contextSnapshot.project?.id ?? null
  return {
    drafts: Array.from(drafts.values())
      .filter((draft) => projectId === null || draft.projectId === projectId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  }
}

function openEntity(args: Record<string, unknown>): { opened: boolean; route: string } {
  const entityType = getRequiredString(args, 'entityType')
  const route = routeForEntity(entityType)
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.webContents.send('mcp:open-route', route)
  } else {
    shell.openExternal(`movscript://${route.replace(/^\//, '')}`).catch(() => undefined)
  }
  return { opened: true, route }
}

function collectionForEntity(entityType: string): string {
  switch (entityType) {
    case 'script':
      return 'scripts'
    case 'setting':
      return 'settings'
    case 'asset':
      return 'assets'
    case 'episode':
      return 'episodes'
    case 'scene':
      return 'scenes'
    case 'storyboard':
      return 'storyboards'
    case 'shot':
      return 'shots'
    case 'task':
      return 'tasks'
    default:
      throw new Error(`Unsupported entity type: ${entityType}`)
  }
}

function routeForEntity(entityType: string): string {
  switch (entityType) {
    case 'project':
      return '/projects'
    case 'script':
    case 'setting':
      return '/scripts'
    case 'asset':
      return '/assets'
    case 'episode':
      return '/episodes'
    case 'scene':
      return '/scenes'
    case 'storyboard':
      return '/storyboards'
    case 'shot':
      return '/shots'
    case 'task':
      return '/collaboration'
    case 'pipeline':
      return '/pipeline'
    default:
      throw new Error(`Unsupported entity type: ${entityType}`)
  }
}

async function backendGet(path: string): Promise<any> {
  const headers: Record<string, string> = {}
  if (contextSnapshot.user?.id) headers['X-User-ID'] = String(contextSnapshot.user.id)

  const res = await fetch(`${API_BASE_URL}${path}`, { headers })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Backend GET ${path} failed: HTTP ${res.status} ${text}`)
  }
  return res.json()
}

function summarizeResource(kind: string, data: unknown): unknown {
  if (kind === 'pipeline') return data
  if (!Array.isArray(data)) return data
  return data.map(summarizeEntity)
}

function summarizeEntity(item: any): unknown {
  if (!item || typeof item !== 'object') return item
  const summary: Record<string, unknown> = {}
  for (const key of [
    'ID',
    'id',
    'project_id',
    'title',
    'name',
    'type',
    'script_type',
    'number',
    'status',
    'review_status',
    'description',
    'summary',
    'synopsis',
    'location',
    'time_of_day',
    'prompt',
    'final_prompt',
    'is_approved',
    'CreatedAt',
    'UpdatedAt',
  ]) {
    if (item[key] !== undefined) summary[key] = truncateLongText(item[key])
  }
  return summary
}

function truncateLongText(value: unknown): unknown {
  if (typeof value !== 'string') return value
  return value.length > 1200 ? `${value.slice(0, 1200)}...` : value
}

function toolText(value: unknown): MCPJSONValue {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(value ?? null, null, 2),
      },
    ],
  }
}

function makeResult(id: string | number | null, result: unknown): JSONRPCResponse {
  return { jsonrpc: '2.0', id, result }
}

function makeError(id: string | number | null, code: number, message: string, data?: unknown): JSONRPCResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      data: data === undefined ? undefined : String(data),
    },
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 1024 * 1024 * 4) {
        reject(new Error('request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function writeJSON(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function setCORSHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function getStringParam(params: MCPJSONValue | undefined, key: string): string {
  const obj = getObject(params)
  const value = obj[key]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${key} is required`)
  return value
}

function getObjectParam(params: MCPJSONValue | undefined, key: string): Record<string, unknown> {
  const obj = getObject(params)
  const value = obj[key]
  return isRecord(value) ? value : {}
}

function getObject(value: MCPJSONValue | undefined): Record<string, unknown> {
  if (!isRecord(value)) return {}
  return value
}

function getRequiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${key} is required`)
  return value
}

function getRequiredNumber(args: Record<string, unknown>, key: string): number {
  const value = args[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${key} is required`)
  return value
}

function getOptionalNumber(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
