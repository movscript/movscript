import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import {
  JSONRPCRequest,
  JSONRPCResponse,
  MCPContextSnapshot,
  MCPJSONValue,
  MCPResource,
  MCPTool,
} from './types'
import {
  generationJobMessage,
  getJobId,
  isTerminalGenerationStatus,
  normalizeGenerationJob,
  stringValue,
} from './generation'
import { getRequiredPositiveIntegerAliasParam } from './candidateParams'
import { getDraftDomainModel, type DraftSeedMode } from '../../src/lib/draftDomainModel'
import type { AgentDraftKind } from '../../src/lib/localAgentClient'

const DEFAULT_PORT = 18765
const MAX_PORT_PROBES = 20
const MCP_DEBUG = process.env.MOVSCRIPT_MCP_DEBUG === '1'
let apiBaseURL = normalizeAPIBaseURL(process.env.MOVSCRIPT_API_BASE_URL || 'http://localhost:8765')
let nextHTTPRequestId = 1

const PATCH_ROUTES: Record<string, string> = {
  script: '/scripts/:id',
  asset_slot: '/projects/:projectId/entities/asset-slots/:id',
  segment: '/projects/:projectId/entities/segments/:id',
  scene_moment: '/projects/:projectId/entities/scene-moments/:id',
  storyboard_script: '/projects/:projectId/entities/storyboard-scripts/:id',
  content_unit: '/projects/:projectId/entities/content-units/:id',
  keyframe: '/projects/:projectId/entities/keyframes/:id',
  preview_timeline: '/projects/:projectId/entities/preview-timelines/:id',
  delivery_version: '/projects/:projectId/entities/delivery-versions/:id',
}

const FIELD_ALLOWLIST: Record<string, Set<string>> = {
  script: new Set([
    'title', 'description', 'content', 'status', 'summary', 'characters', 'character_profiles',
    'character_relationships', 'core_settings', 'background', 'scenes_desc', 'hook', 'plot_summary',
    'script_points',
  ]),
  asset_slot: new Set(['name', 'kind', 'description', 'prompt_hint', 'priority', 'status', 'metadata_json']),
  segment: new Set(['title', 'kind', 'summary', 'content', 'production_id', 'text_block_id', 'status', 'metadata_json']),
  scene_moment: new Set(['title', 'description', 'time_text', 'location_text', 'condition_text', 'action_text', 'mood', 'status', 'metadata_json']),
  storyboard_script: new Set(['name', 'description', 'is_primary', 'status', 'metadata_json']),
  content_unit: new Set(['title', 'kind', 'description', 'prompt', 'duration_sec', 'status', 'metadata_json']),
  keyframe: new Set(['title', 'description', 'prompt', 'status', 'metadata_json']),
  preview_timeline: new Set(['name', 'duration_sec', 'is_primary', 'status', 'metadata_json']),
  delivery_version: new Set(['name', 'description', 'duration_sec', 'is_primary', 'status', 'metadata_json']),
}

const contextSnapshot: MCPContextSnapshot = {
  route: { pathname: '/', search: '', hash: '' },
  project: null,
  user: null,
  selection: null,
  updatedAt: new Date(0).toISOString(),
}

let server: Server | null = null
let contextAuthToken = ''

export interface MCPServerStatus {
  ok: boolean
  listening: boolean
  endpoint: string
  port?: number
  health?: {
    ok: boolean
    status?: number
    error?: string
  }
  initialize?: {
    ok: boolean
    status?: number
    elapsedMs?: number
    serverInfo?: unknown
    error?: string
  }
  error?: string
}

export function updateMCPContextSnapshot(next: MCPContextSnapshot & { auth?: { token: string } | null }): void {
  contextSnapshot.route = next.route
  contextSnapshot.project = next.project
  contextSnapshot.user = next.user
  contextSnapshot.selection = next.selection
  contextSnapshot.updatedAt = next.updatedAt
  contextAuthToken = next.auth?.token ?? ''
}

export function setMCPAPIBaseURL(next: string): void {
  apiBaseURL = normalizeAPIBaseURL(next)
}

export function getMCPContextSnapshot(): MCPContextSnapshot {
  return { ...contextSnapshot }
}

export async function getMCPServerStatus(): Promise<MCPServerStatus> {
  const endpoint = process.env.MOVSCRIPT_MCP_ENDPOINT || `http://127.0.0.1:${DEFAULT_PORT}/mcp`
  const port = server ? addressPort(server) ?? Number(new URL(endpoint).port || DEFAULT_PORT) : Number(new URL(endpoint).port || DEFAULT_PORT)
  if (!server?.listening) {
    return {
      ok: false,
      listening: false,
      endpoint,
      port,
      error: 'MCP server is not running',
    }
  }

  try {
    const healthURL = new URL(endpoint)
    healthURL.pathname = '/health'
    healthURL.search = ''
    healthURL.hash = ''
    const controller = new AbortController()
    const timer = globalThis.setTimeout(() => controller.abort(), 1500)
    try {
      const res = await fetch(healthURL.toString(), {
        signal: controller.signal,
        cache: 'no-store',
      })
      if (!res.ok) {
        return {
          ok: false,
          listening: true,
          endpoint,
          port,
          health: { ok: false, status: res.status },
          error: `MCP health check returned HTTP ${res.status}`,
        }
      }
      const body = await res.json() as { ok?: unknown }
      if (body.ok !== true) {
        return {
          ok: false,
          listening: true,
          endpoint,
          port,
          health: { ok: false, status: res.status },
          error: 'MCP health check did not report ok',
        }
      }
      const initialize = await probeMCPInitialize(endpoint)
      return {
        ok: initialize.ok,
        listening: true,
        endpoint,
        port,
        health: { ok: true, status: res.status },
        initialize,
        ...(initialize.ok ? {} : { error: initialize.error ?? 'MCP initialize probe failed' }),
      }
    } finally {
      globalThis.clearTimeout(timer)
    }
  } catch (error) {
    return {
      ok: false,
      listening: true,
      endpoint,
      port,
      health: { ok: false, error: error instanceof Error ? error.message : String(error) },
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function startMCPServer(): Promise<number> {
  if (server?.listening) return addressPort(server) ?? DEFAULT_PORT

  const requestedPort = Number(process.env.MOVSCRIPT_MCP_PORT || DEFAULT_PORT)
  const ports = process.env.MOVSCRIPT_MCP_PORT
    ? [requestedPort]
    : Array.from({ length: MAX_PORT_PROBES }, (_item, index) => requestedPort + index)
  let lastError: unknown
  for (const port of ports) {
    const nextServer = createServer(handleHTTP)
    // Keep-alive intentionally disabled: clients (movscript-agent) may otherwise reuse a half-open
    // socket after Electron main-process restarts (dev hot reload) and observe a 3ms ECONNRESET.
    // Pair with the per-response `Connection: close` header in writeJSON so every fetch opens a
    // fresh TCP connection.
    nextServer.keepAliveTimeout = 0
    try {
      await listenOnPort(nextServer, port)
      server = nextServer
      process.env.MOVSCRIPT_MCP_ENDPOINT = `http://127.0.0.1:${port}/mcp`
      console.info(`[mcp] MovScript MCP server listening on http://127.0.0.1:${port}/mcp`)
      return port
    } catch (error) {
      lastError = error
      nextServer.close()
      if (!isAddressInUseError(error)) throw error
      if (process.env.MOVSCRIPT_MCP_PORT) {
        throw new Error(`MovScript MCP port ${port} is already in use. Stop the existing process or set MOVSCRIPT_MCP_PORT to a free port.`)
      }
      console.warn(`[mcp] port ${port} is already in use; trying ${port + 1}`)
    }
  }

  throw new Error(`Unable to start MovScript MCP server near port ${requestedPort}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
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

function listenOnPort(nextServer: Server, port: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    nextServer.once('error', reject)
    nextServer.listen(port, '127.0.0.1', () => {
      nextServer.off('error', reject)
      resolve()
    })
  })
}

function isAddressInUseError(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE'
}

async function probeMCPInitialize(endpoint: string): Promise<NonNullable<MCPServerStatus['initialize']>> {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), 1500)
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'status-probe',
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          clientInfo: { name: 'movscript-desktop-status', version: '0.1.0' },
          capabilities: {},
        },
      }),
      signal: controller.signal,
      cache: 'no-store',
    })
    const elapsedMs = Date.now() - startedAt
    const text = await res.text()
    if (!res.ok) {
      return { ok: false, status: res.status, elapsedMs, error: `HTTP ${res.status}: ${truncate(text, 500)}` }
    }
    const body = JSON.parse(text) as JSONRPCResponse
    if (body.error) {
      return { ok: false, status: res.status, elapsedMs, error: `JSON-RPC ${body.error.code}: ${body.error.message}` }
    }
    const result = isRecord(body.result) ? body.result : {}
    return { ok: true, status: res.status, elapsedMs, serverInfo: result.serverInfo }
  } catch (error) {
    return { ok: false, elapsedMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) }
  } finally {
    globalThis.clearTimeout(timer)
  }
}

function debugHTTPStart(requestId: number, req: IncomingMessage): void {
  if (!MCP_DEBUG) return
  console.info([
    `[mcp] http start requestId=${requestId}`,
    `method=${req.method ?? ''}`,
    `url=${req.url ?? ''}`,
    `remote=${req.socket.remoteAddress ?? ''}:${req.socket.remotePort ?? ''}`,
    `contentLength=${req.headers['content-length'] ?? ''}`,
  ].join(' '))
}

async function handleHTTP(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const requestId = nextHTTPRequestId++
  const startedAt = Date.now()
  res.on('finish', () => {
    if (MCP_DEBUG) {
      console.info(`[mcp] http finish requestId=${requestId} method=${req.method ?? ''} url=${req.url ?? ''} status=${res.statusCode} elapsedMs=${Date.now() - startedAt}`)
    }
  })
  setCORSHeaders(res)

  if (req.method === 'OPTIONS') {
    debugHTTPStart(requestId, req)
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url === '/health') {
    debugHTTPStart(requestId, req)
    writeJSON(res, 200, { ok: true, service: 'movscript-mcp', updatedAt: contextSnapshot.updatedAt })
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
    if (MCP_DEBUG) {
      console.info(`[mcp] http body requestId=${requestId} bytes=${body.length}`)
    }
    const payload = JSON.parse(body) as JSONRPCRequest | JSONRPCRequest[]
    if (Array.isArray(payload)) {
      const responses = await Promise.all(payload.map((item) => handleJSONRPC(item, requestId)))
      writeJSON(res, 200, responses)
    } else {
      writeJSON(res, 200, await handleJSONRPC(payload, requestId))
    }
  } catch (error) {
    console.error(`[mcp] http error requestId=${requestId} method=${req.method ?? ''} url=${req.url ?? ''} elapsedMs=${Date.now() - startedAt}`, error)
    writeJSON(res, 200, makeError(null, -32700, 'Parse error', String(error)))
  }
}

async function handleJSONRPC(req: JSONRPCRequest, httpRequestId?: number): Promise<JSONRPCResponse> {
  const startedAt = Date.now()
  const id = req.id ?? null
  if (MCP_DEBUG) {
    console.info(`[mcp] rpc start httpRequestId=${httpRequestId ?? 'n/a'} rpcId=${String(id)} method=${req.method ?? ''}`)
  }
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
    console.error(`[mcp] rpc error httpRequestId=${httpRequestId ?? 'n/a'} rpcId=${String(id)} method=${req.method} elapsedMs=${Date.now() - startedAt}`, error)
    return makeError(id, -32000, error instanceof Error ? error.message : String(error), errorData(error))
  } finally {
    if (MCP_DEBUG) {
      console.info(`[mcp] rpc finish httpRequestId=${httpRequestId ?? 'n/a'} rpcId=${String(id)} method=${req.method ?? ''} elapsedMs=${Date.now() - startedAt}`)
    }
  }
}

function listResources(): MCPResource[] {
  const resources: MCPResource[] = [
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
    {
      uri: 'movscript://projects',
      name: 'Projects',
      description: 'All visible MovScript projects.',
      mimeType: 'text/markdown',
    },
  ]

  if (contextSnapshot.project) {
    const id = contextSnapshot.project.id
    resources.push(
      resource(`movscript://project/${id}/summary`, 'Project summary'),
      resource(`movscript://project/${id}/scripts`, 'Scripts'),
      resource(`movscript://project/${id}/creative-references`, 'Creative references'),
      resource(`movscript://project/${id}/assets`, 'Assets'),
      resource(`movscript://project/${id}/episodes`, 'Episodes'),
      resource(`movscript://project/${id}/scenes`, 'Scenes'),
      resource(`movscript://project/${id}/storyboards`, 'Storyboards'),
      resource(`movscript://project/${id}/shots`, 'Shots')
    )
  }

  return resources
}

function resource(uri: string, name: string): MCPResource {
  return { uri, name, mimeType: 'text/markdown' }
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
  if (uri === 'movscript://projects') {
    return resourceContent(uri, await listProjects({}))
  }

  const match = uri.match(/^movscript:\/\/project\/(\d+)\/([a-z-]+)$/)
  if (!match) throw new Error(`Unsupported resource URI: ${uri}`)

  const projectId = Number(match[1])
  const kind = match[2]

  const data = await backendGet(projectEndpoint(projectId, kind))
  return resourceContent(uri, summarizeResource(data))
}

function resourceContent(uri: string, value: unknown): MCPJSONValue {
  return {
    contents: [
      {
        uri,
        mimeType: 'text/markdown',
        text: renderMarkdown(value ?? null),
      },
    ],
    data: toMCPJSONValue(value ?? null),
  }
}

function projectEndpoint(projectId: number, kind: string): string {
  switch (kind) {
    case 'summary':
      return `/projects/${projectId}`
    case 'assets':
    case 'assests':
      return `/projects/${projectId}/entities/asset-slots`
    case 'episodes':
      return `/projects/${projectId}/entities/productions`
    case 'scenes':
      return `/projects/${projectId}/entities/segments`
    case 'storyboards':
      return `/projects/${projectId}/entities/storyboard-scripts`
    case 'shots':
      return `/projects/${projectId}/entities/content-units`
    case 'creative-references':
      return `/projects/${projectId}/entities/creative-references`
    case 'scripts':
      return `/projects/${projectId}/${kind}`
    default:
      throw new Error(`Unsupported project resource kind: ${kind}`)
  }
}

export function listTools(): MCPTool[] {
  return [
    {
      name: 'movscript_get_focus',
      description: 'Return the current MovScript task focus: route, selected project, active production id, current user, and selected entity. This does not load project lists, scripts, drafts, or resources.',
      inputSchema: objectSchema({}),
    },
    {
      name: 'movscript_list_projects',
      description: 'List all visible projects as numbered Markdown summaries.',
      inputSchema: objectSchema(
        {
          limit: { type: 'number' },
        }
      ),
    },
    {
      name: 'movscript_read_project_scripts',
      description: 'Read scripts in the current or specified project. Use this when project planning, splitting, or orchestration needs access to the project screenplay/library. Set includeContent when the actual script body is needed.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number', description: 'Defaults to the current UI project when omitted.' },
          scriptId: { type: 'number', description: 'Optional script ID to read one script.' },
          includeContent: { type: 'boolean', description: 'When true, include script body text up to contentLimit characters per script.' },
          contentLimit: { type: 'number', description: 'Maximum script body characters per script when includeContent is true. Defaults to 8000.' },
          limit: { type: 'number', description: 'Maximum scripts to return when scriptId is omitted. Defaults to 50.' },
        }
      ),
    },
    {
      name: 'movscript_query_creative_references',
      description: 'Query project creative references / setting materials such as characters, places, props, products, style rules, and restrictions. Can include related states, usages, relationships, and asset slots for candidate material planning.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number', description: 'Defaults to the current UI project when omitted.' },
          creative_reference_id: { type: 'number', description: 'Optional creative reference ID to return one setting material.' },
          kind: { type: 'string', description: 'Optional reference kind such as person, place, prop, product, brand, style, world_rule, time_period, or restriction.' },
          status: { type: 'string', description: 'Optional local status filter applied client-side.' },
          query: { type: 'string', description: 'Optional text search over name, alias, description, content, and tags/profile JSON fields.' },
          include_states: { type: 'boolean', description: 'When true, include creative-reference states for returned references.' },
          include_usages: { type: 'boolean', description: 'When true, include usages for returned references.' },
          include_relationships: { type: 'boolean', description: 'When true, include creative relationships for returned references.' },
          include_asset_slots: { type: 'boolean', description: 'When true, include asset slots linked to returned references or their states.' },
          limit: { type: 'number', description: 'Maximum references to return. Defaults to 50.' },
        }
      ),
    },
    {
      name: 'movscript_query_asset_slots',
      description: 'Query project asset slots, including slots owned by a creative reference, creative reference state, segment, scene moment, storyboard line, content unit, or keyframe.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number', description: 'Defaults to the current UI project when omitted.' },
          asset_slot_id: { type: 'number', description: 'Optional asset slot ID to return one slot.' },
          creative_reference_id: { type: 'number', description: 'Optional creative reference ID; matches direct reference links and reference-owned slots.' },
          creative_reference_state_id: { type: 'number', description: 'Optional creative reference state ID; matches direct state links and state-owned slots.' },
          owner_type: { type: 'string', description: 'Optional owner type such as creative_reference, creative_reference_state, segment, scene_moment, content_unit, or keyframe.' },
          owner_id: { type: 'number', description: 'Optional owner entity ID. Applied with owner_type when provided.' },
          production_id: { type: 'number', description: 'Optional production filter.' },
          status: { type: 'string', description: 'Optional status filter such as missing, candidate, locked, or waived.' },
          query: { type: 'string', description: 'Optional text search over name, description, prompt_hint, slot_key, and metadata_json.' },
          include_internal: { type: 'boolean', description: 'When true, include internal asset-slot-owned slots.' },
          include_candidates: { type: 'boolean', description: 'When true, include existing asset slot candidates for returned slots.' },
          limit: { type: 'number', description: 'Maximum asset slots to return. Defaults to 50.' },
        }
      ),
    },
    {
      name: 'movscript_query_production_context',
      description: 'Query production context entities for material planning: productions, emotional / dramatic segments, scene moments, content units, and official keyframes. For a content_unit_id it can also build the generation context with references and asset slots.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number', description: 'Defaults to the current UI project when omitted.' },
          production_id: { type: 'number', description: 'Optional production ID.' },
          segment_id: { type: 'number', description: 'Optional segment ID.' },
          scene_moment_id: { type: 'number', description: 'Optional scene moment ID.' },
          content_unit_id: { type: 'number', description: 'Optional content unit ID.' },
          status: { type: 'string', description: 'Optional status filter for productions or segments where supported.' },
          query: { type: 'string', description: 'Optional text search over titles, descriptions, summaries, prompts, mood, action, and metadata.' },
          include: { type: 'array', items: { type: 'string', enum: ['productions', 'segments', 'scene_moments', 'content_units', 'keyframes'] }, description: 'Optional entity groups to include. Defaults to segments, scene_moments, and content_units. keyframes returns official keyframes only, excluding AI candidate keyframes.' },
          include_generation_context: { type: 'boolean', description: 'When true and content_unit_id is provided, include backend generation context for that content unit.' },
          intent: { type: 'string', enum: ['keyframe', 'video'], description: 'Generation-context intent. Defaults to video.' },
          limit: { type: 'number', description: 'Maximum items per group. Defaults to 50.' },
        }
      ),
    },
    {
      name: 'movscript_get_draft_model',
      description: 'Return the frontend-owned DraftDomainModel contract for a draft kind and target. This is the single source for draft field ownership, seed policy, review route, apply boundary, and optional hydrated seed data.',
      inputSchema: objectSchema(
        {
          kind: { type: 'string', enum: ['setting_proposal', 'project_proposal', 'production_proposal', 'script_split_proposal', 'asset_proposal'] },
          target: { type: 'object', additionalProperties: true, description: 'Optional target entity anchor. entityType/entityId defaults come from the model and current focus when available.' },
          seedMode: { type: 'string', enum: ['empty', 'snapshot', 'editable_snapshot'], description: 'Defaults to the model seed.defaultMode.' },
          include: { type: 'array', items: { type: 'string' }, description: 'Optional subset of the model seed.include allowlist.' },
          hydrate: { type: 'boolean', description: 'When true, include seed.data loaded from allowed backend endpoints. Defaults to true for non-empty seed modes.' },
        },
        ['kind']
      ),
      outputSchema: objectSchema(
        {
          contractVersion: { type: 'number' },
          kind: { type: 'string' },
          title: { type: 'string' },
          targetEntityType: { type: 'string' },
          target: { type: 'object' },
          seedPolicy: { type: 'object' },
          seed: { type: 'object' },
          contentSchemaId: { type: 'string' },
          contentSchema: { type: 'object' },
          fieldGuide: { type: 'object' },
          applyBoundary: { type: 'object' },
          reviewRouteTemplate: { type: 'string' },
          reviewRoute: { type: 'string' },
          modelRef: { type: 'string' },
        },
        ['contractVersion', 'kind', 'targetEntityType', 'target', 'seedPolicy', 'fieldGuide', 'applyBoundary', 'reviewRouteTemplate', 'reviewRoute', 'modelRef']
      ),
    },
    {
      name: 'movscript_create_project',
      description: 'Create a formal MovScript project. Use only when the user explicitly asks to create a new project or confirms the project name.',
      inputSchema: objectSchema(
        {
          name: { type: 'string' },
          description: { type: 'string' },
          status: { type: 'string' },
          total_episodes: { type: 'number' },
        },
        ['name']
      ),
    },
    {
      name: 'movscript_list_models',
      description: 'List enabled AI models for a capability or feature. The result includes public model_id values plus model_contracts with contract_version 1, capabilities, input_requirements, supported_param_keys, supported_params, and params_schema rule counts so the agent can choose a valid model before generation. Use model_id for generation calls.',
      inputSchema: objectSchema(
        {
          capability: { type: 'string', description: 'Optional capability filter such as text, image, image_edit, video, video_i2v, or video_v2v.' },
          feature: { type: 'string', description: 'Optional feature key filter. Takes precedence over capability when provided.' },
          feature_key: { type: 'string', description: 'Alias for feature.' },
          provider_variants: { type: 'boolean', description: 'When true, include provider-specific model variants.' },
          include_provider_variants: { type: 'boolean', description: 'Alias for provider_variants.' },
        }
      ),
      outputSchema: objectSchema(
        {
          count: { type: 'number' },
          queries: { type: 'array', items: { type: 'string' } },
          model_contracts: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
              required: ['contract_version', 'model_id', 'capabilities', 'input_requirements', 'supported_param_keys', 'supported_params'],
              properties: {
                contract_version: { type: 'number', const: 1 },
                model_id: { type: 'string', description: 'Public logical model ID to pass to movscript_create_generation_job.' },
                display_name: { type: 'string' },
                short_name: { type: 'string' },
                logical_model_id: { type: 'string', description: 'Legacy alias for model_id.' },
                capabilities: { type: 'array', items: { type: 'string' } },
                accepts_image_input: { type: 'boolean' },
                input_requirements: {
                  type: 'object',
                  required: ['image', 'video'],
                  properties: {
                    image: {
                      type: 'object',
                      required: ['min', 'max'],
                      properties: {
                        min: { type: 'number' },
                        max: { type: 'number' },
                      },
                    },
                    video: {
                      type: 'object',
                      required: ['min', 'max'],
                      properties: {
                        min: { type: 'number' },
                        max: { type: 'number' },
                      },
                    },
                  },
                },
                supported_param_keys: { type: 'array', items: { type: 'string' } },
                supported_params: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: true,
                    required: ['key'],
                    properties: {
                      key: { type: 'string' },
                      label: { type: 'string' },
                      type: { type: 'string', enum: ['select', 'number', 'boolean', 'string'] },
                      options: { type: 'array', items: { type: 'string' } },
                      conflicts_with: { type: 'array', items: { type: 'string' } },
                      conditional_enum: { type: 'array' },
                      conditional_const: { type: 'array' },
                      requires_value: { type: 'array' },
                    },
                  },
                },
                params_schema_loaded: { type: 'boolean' },
                params_schema_rule_count: { type: 'number' },
              },
            },
          },
          models: { type: 'array' },
        },
        ['count', 'queries', 'model_contracts', 'models']
      ),
    },
    {
      name: 'movscript_create_generation_job',
      description: 'Create and wait for an AI image or video generation job through the MovScript backend. Before choosing model_id, input_resource_ids, or extra_params, inspect movscript_list_models and obey the selected model capability contract: capabilities, input_requirements, supported_params, and params_schema. Returns the completed job, output_resource/output_resource_id for the first output, output_resources/output_resource_ids when multiple outputs exist, and param_validation audit_version 1 data, including non-blocking preflight_errors and input_preflight_errors, for direct chat display. This is cost-bearing and should only run after explicit user approval.',
      inputSchema: objectSchema(
        {
          prompt: { type: 'string' },
          title: { type: 'string', description: 'Optional display title for the generation job.' },
          output_type: { type: 'string', enum: ['image', 'video'], description: 'High-level output type. Ignored when job_type is provided.' },
          job_type: { type: 'string', enum: ['image', 'image_edit', 'video', 'video_i2v', 'video_v2v'] },
          model_id: { type: 'string', description: 'Public logical model ID from movscript_list_models. If omitted, MovScript chooses the first available model for the requested capability.' },
          input_resource_ids: { type: 'array', items: { type: 'number' }, description: 'Optional reference image/video resource IDs. Count should satisfy the selected model contract input_requirements; mismatches are reported in param_validation.input_preflight_errors.' },
          reference_type: { type: 'string', enum: ['image', 'video'], description: 'Use video with output_type video when reference resources should create a video_v2v job.' },
          aspect_ratio: { type: 'string', description: 'Optional aspect ratio such as 1:1, 16:9, or 9:16.' },
          duration: { type: 'number', description: 'Optional video duration in seconds.' },
          extra_params: {
            type: 'object',
            description: 'Optional model-specific generation parameters. Keys must come from the selected model returned by movscript_list_models.supported_params / params_schema. Unsupported keys are omitted before submission and reported in param_validation audit_version 1 dropped_extra_params; obvious local type/option/range and compact cross-parameter rule mismatches are reported in non-blocking param_validation.preflight_errors.',
            additionalProperties: true,
          },
          feature_key: { type: 'string', description: 'Optional feature key for routing/audit. Defaults to agent.chat_generation.' },
          projectId: { type: 'number' },
          wait: { type: 'boolean', description: 'Defaults to true. When false, returns after enqueueing the job.' },
          timeout_ms: { type: 'number', description: 'Maximum wait time. Defaults to 180000 for image, 600000 for video.' },
          poll_interval_ms: { type: 'number', description: 'Polling interval. Defaults to 2500.' },
        },
        ['prompt']
      ),
      outputSchema: objectSchema(
        {
          status: { type: 'string', description: 'Current or final backend generation status.' },
          job: { type: 'object', description: 'Normalized generation job payload.' },
          jobId: { type: 'number', description: 'Generation job ID for monitoring and audit.' },
          monitor: {
            type: 'object',
            description: 'Present when the job needs asynchronous monitoring.',
            properties: {
              tool: { type: 'string', const: 'movscript_get_generation_job' },
              args: { type: 'object' },
              message: { type: 'string' },
            },
          },
          output_resource: { type: 'object', description: 'Generated resource object when available.' },
          output_resource_id: { type: 'number', description: 'Generated resource ID when available.' },
          output_resources: { type: 'array', items: { type: 'object' }, description: 'Generated resource objects when the provider returns multiple outputs.' },
          output_resource_ids: { type: 'array', items: { type: 'number' }, description: 'Generated resource IDs when the provider returns multiple outputs.' },
          media: { type: 'object', description: 'Media preview metadata when available.' },
          param_validation: {
            type: 'object',
            description: 'audit_version 1 parameter filtering and preflight audit.',
            properties: {
              audit_version: { type: 'number', const: 1 },
              model_config_id: { type: 'number' },
              model_contract_loaded: { type: 'boolean' },
              params_schema_loaded: { type: 'boolean' },
              params_schema_rule_count: { type: 'number' },
              input_requirements: { type: 'object' },
              submitted_inputs: { type: 'object' },
              supported_params: { type: 'array', items: { type: 'string' } },
              provided_extra_params: { type: 'array', items: { type: 'string' } },
              submitted_extra_params: { type: 'array', items: { type: 'string' } },
              dropped_extra_params: { type: 'array', items: { type: 'string' } },
              dropped_top_level_params: { type: 'array', items: { type: 'string' } },
              drop_reasons: { type: 'object' },
              renamed_extra_params: { type: 'object' },
              extra_params_parse_error: { type: 'string' },
              preflight_errors: { type: 'array' },
              input_preflight_errors: { type: 'array' },
            },
          },
          terminal: { type: 'boolean', description: 'Whether status is terminal when wait=true.' },
          message: { type: 'string' },
        },
        ['status', 'job', 'jobId', 'param_validation', 'message']
      ),
    },
    {
      name: 'movscript_get_generation_job',
      description: 'Inspect one AI image or video generation job. Returns status, progress hints, output resource, and media preview data when available.',
      inputSchema: objectSchema(
        {
          jobId: { type: 'number', description: 'Generation job ID.' },
          projectId: { type: 'number' },
        },
        ['jobId']
      ),
    },
    {
      name: 'movscript_attach_asset_slot_candidate',
      description: 'Add an existing raw resource to the reviewable candidate set for an asset slot. Use after generation succeeds and an output_resource_id is available. This creates or reuses the candidate asset slot and candidate relation, but does not accept, select, bind, or lock the candidate.',
      inputSchema: withCandidateAttachAliasRequirements(objectSchema(
        {
          projectId: { type: 'number', description: 'Defaults to the current UI project when omitted.' },
          asset_slot_id: { type: 'number', minimum: 1, description: 'Target asset slot / requirement ID.' },
          assetSlotId: { type: 'number', minimum: 1, description: 'Alias for asset_slot_id.' },
          resource_id: { type: 'number', minimum: 1, description: 'Existing raw resource ID, usually movscript_create_generation_job.output_resource_id.' },
          resourceId: { type: 'number', minimum: 1, description: 'Alias for resource_id.' },
          output_resource_id: { type: 'number', minimum: 1, description: 'Alias for resource_id when using movscript_create_generation_job.output_resource_id directly.' },
          outputResourceId: { type: 'number', minimum: 1, description: 'Alias for output_resource_id.' },
          source_type: { type: 'string', description: 'Optional audit source type. Defaults to agent.' },
          sourceType: { type: 'string', description: 'Alias for source_type.' },
          source_id: { type: 'number', description: 'Optional source entity/job/canvas ID for audit.' },
          sourceId: { type: 'number', description: 'Alias for source_id.' },
          jobId: { type: 'number', description: 'Alias for source_id when the source is a generation job.' },
          score: { type: 'number', description: 'Optional candidate score.' },
          note: { type: 'string', description: 'Optional review note for why this resource is a candidate.' },
        }
      ), ['asset_slot_id', 'assetSlotId']),
      outputSchema: objectSchema(
        {
          status: { type: 'string' },
          candidate: { type: 'object', description: 'Created or reused asset_slot_candidate.' },
          asset_slot_id: { type: 'number' },
          candidate_asset_slot_id: { type: 'number' },
          resource_id: { type: 'number' },
          message: { type: 'string' },
        },
        ['status', 'candidate', 'asset_slot_id', 'resource_id', 'message']
      ),
    },
    {
      name: 'movscript_attach_keyframe_candidate',
      description: 'Add an existing raw resource to the reviewable candidate set for an original target keyframe / visual anchor. Use after generation succeeds and an output_resource_id is available. This creates or reuses a candidate keyframe linked to the original target keyframe, but does not accept, select, bind, or lock the candidate. Do not pass an existing generated candidate keyframe as the target.',
      inputSchema: withCandidateAttachAliasRequirements(objectSchema(
        {
          projectId: { type: 'number', description: 'Defaults to the current UI project when omitted.' },
          keyframe_id: { type: 'number', minimum: 1, description: 'Original target keyframe / visual anchor ID, not an existing generated candidate keyframe.' },
          keyframeId: { type: 'number', minimum: 1, description: 'Alias for keyframe_id.' },
          target_keyframe_id: { type: 'number', minimum: 1, description: 'Alias for the original target keyframe / visual anchor ID when reusing generated candidate metadata. Do not pass the generated candidate keyframe ID.' },
          targetKeyframeId: { type: 'number', minimum: 1, description: 'Alias for target_keyframe_id; must still be the original target keyframe / visual anchor ID.' },
          resource_id: { type: 'number', minimum: 1, description: 'Existing raw resource ID, usually movscript_create_generation_job.output_resource_id.' },
          resourceId: { type: 'number', minimum: 1, description: 'Alias for resource_id.' },
          output_resource_id: { type: 'number', minimum: 1, description: 'Alias for resource_id when using movscript_create_generation_job.output_resource_id directly.' },
          outputResourceId: { type: 'number', minimum: 1, description: 'Alias for output_resource_id.' },
          source_type: { type: 'string', description: 'Optional audit source type. Defaults to agent.' },
          sourceType: { type: 'string', description: 'Alias for source_type.' },
          source_id: { type: 'number', description: 'Optional source entity/job/canvas ID for audit.' },
          sourceId: { type: 'number', description: 'Alias for source_id.' },
          jobId: { type: 'number', description: 'Alias for source_id and source_job_id when the source is a generation job.' },
          title: { type: 'string', description: 'Optional candidate title. Defaults to the target keyframe title/name when available.' },
          description: { type: 'string', description: 'Optional candidate description. Defaults to the target keyframe description when available.' },
          prompt: { type: 'string', description: 'Optional candidate prompt. Defaults to the target keyframe prompt or description when available.' },
          note: { type: 'string', description: 'Optional review note for why this resource is a candidate.' },
        }
      ), ['keyframe_id', 'keyframeId', 'target_keyframe_id', 'targetKeyframeId']),
      outputSchema: objectSchema(
        {
          status: { type: 'string' },
          candidate: { type: 'object', description: 'Created or reused keyframe candidate.' },
          keyframe_id: { type: 'number' },
          resource_id: { type: 'number' },
          message: { type: 'string' },
        },
        ['status', 'candidate', 'keyframe_id', 'resource_id', 'message']
      ),
    },
    {
      name: 'movscript_list_generation_jobs',
      description: 'List recent AI image or video generation jobs for the current project so the agent can monitor queued and running work.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number' },
          status: { type: 'string', description: 'Optional job status filter, such as pending, running, succeeded, failed, or cancelled.' },
          job_type: { type: 'string', description: 'Optional job type filter, such as image, image_edit, video, video_i2v, or video_v2v.' },
          limit: { type: 'number', description: 'Maximum number of jobs to return. Defaults to 20.' },
        }
      ),
    },
    {
      name: 'movscript_cancel_generation_job',
      description: 'Cancel a running video generation job. This is cost/state affecting and should only run after explicit user approval.',
      inputSchema: objectSchema(
        {
          jobId: { type: 'number', description: 'Generation job ID.' },
          projectId: { type: 'number' },
        },
        ['jobId']
      ),
    },
    {
      name: 'movscript_apply_draft_review',
      description: 'Apply an approved local draft review to the formal MovScript backend entity. This writes backend state and must only run after UI approval.',
      inputSchema: objectSchema(
        {
          review: { type: 'object' },
          userId: { type: 'number' },
        },
        ['review']
      ),
    },
    {
      name: 'movscript_preview_apply_draft_review',
      description: 'Preview backend effects for applying a local draft review without writing final entity state when the backend supports dry run.',
      inputSchema: objectSchema(
        {
          review: { type: 'object' },
          userId: { type: 'number' },
        },
        ['review']
      ),
    },
    {
      name: 'movscript_create_script_backend',
      description: 'Create a formal backend script record from an approved agent script payload. This is an internal approval-backed write tool.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number' },
          payload: { type: 'object' },
          userId: { type: 'number' },
        },
        ['projectId', 'payload']
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

function withCandidateAttachAliasRequirements(schema: ReturnType<typeof objectSchema>, targetIdAliases: string[]) {
  const resourceIdAliases = ['resource_id', 'resourceId', 'output_resource_id', 'outputResourceId']
  const anyRequired = (fields: string[]) => ({
    anyOf: fields.map((field) => ({ required: [field] })),
  })
  const { required: _required, ...baseSchema } = schema
  return {
    ...baseSchema,
    allOf: [
      anyRequired(targetIdAliases),
      anyRequired(resourceIdAliases),
    ],
  }
}

async function callTool(params: MCPJSONValue | undefined): Promise<MCPJSONValue> {
  const name = getStringParam(params, 'name')
  const args = getObjectParam(params, 'arguments')

  switch (name) {
    case 'movscript_get_focus':
      return toolText(getFocus())
    case 'movscript_list_projects':
      return toolText(await listProjects(args))
    case 'movscript_read_project_scripts':
      return toolText(await readProjectScripts(args))
    case 'movscript_query_creative_references':
      return toolText(await queryCreativeReferences(args))
    case 'movscript_query_asset_slots':
      return toolText(await queryAssetSlots(args))
    case 'movscript_query_production_context':
      return toolText(await queryProductionContext(args))
    case 'movscript_get_draft_model':
      return toolText(await getDraftModelContract(args))
    case 'movscript_create_project':
      return toolText(await createProject(args))
    case 'movscript_list_models':
      return toolText(await listModels(args))
    case 'movscript_create_generation_job':
      return toolText(await createGenerationJob(args))
    case 'movscript_attach_asset_slot_candidate':
      return toolText(await attachAssetSlotCandidate(args))
    case 'movscript_attach_keyframe_candidate':
      return toolText(await attachKeyframeCandidate(args))
    case 'movscript_get_generation_job':
      return toolText(await getGenerationJob(args))
    case 'movscript_list_generation_jobs':
      return toolText(await listGenerationJobs(args))
    case 'movscript_cancel_generation_job':
      return toolText(await cancelGenerationJob(args))
    case 'movscript_apply_draft_review':
      return toolText(await applyDraftReview(args))
    case 'movscript_preview_apply_draft_review':
      return toolText(await previewApplyDraftReview(args))
    case 'movscript_create_script_backend':
      return toolText(await createScriptBackend(args))
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

function getFocus(): unknown {
  const startedAt = Date.now()
  const focusMs = Date.now() - startedAt
  return {
    focus: contextSnapshot,
    timings: {
      totalMs: focusMs,
      focusMs,
    },
  }
}

async function listProjects(args: Record<string, unknown>): Promise<unknown> {
  const limit = getOptionalNumber(args, 'limit') ?? 100
  const projects = await backendList('/projects')
  return {
    count: projects.length,
    projects: projects.slice(0, limit).map(summarizeProject),
  }
}

export async function listModels(args: Record<string, unknown>): Promise<unknown> {
  const rawFeature = getOptionalString(args, 'feature') ?? getOptionalString(args, 'feature_key') ?? getOptionalString(args, 'featureKey')
  const rawCapability = getOptionalString(args, 'capability')
  const featureCapability = normalizeModelCapabilityAlias(rawFeature)
  const feature = featureCapability ? undefined : rawFeature
  const capability = featureCapability ?? normalizeModelCapabilityAlias(rawCapability) ?? rawCapability
  const providerVariants = args.provider_variants === true || args.include_provider_variants === true

  const queries = feature
    ? [{ label: `feature:${feature}`, path: `/models?feature=${encodeURIComponent(feature)}${providerVariants ? '&provider_variants=true' : ''}` }]
    : capability
      ? [{ label: `capability:${capability}`, path: `/models?capability=${encodeURIComponent(capability)}${providerVariants ? '&provider_variants=true' : ''}` }]
      : ['text', 'image', 'image_edit', 'video', 'video_i2v', 'video_v2v'].map((item) => ({
        label: `capability:${item}`,
        path: `/models?capability=${encodeURIComponent(item)}${providerVariants ? '&provider_variants=true' : ''}`,
      }))

  const byId = new Map<number, any>()
  for (const query of queries) {
    const models = await backendList(query.path)
    for (const model of models) {
      const id = Number(model?.id ?? model?.ID)
      if (Number.isFinite(id) && id > 0 && !byId.has(id)) {
        byId.set(id, model)
      }
    }
  }

  return {
    count: byId.size,
    queries: queries.map((query) => query.label),
    model_contracts: Array.from(byId.values()).map(summarizeModelContractForAgent),
    models: Array.from(byId.values()),
  }
}

function normalizeModelCapabilityAlias(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase().replace(/-/g, '_')
  switch (normalized) {
    case 'text':
    case 'reasoning':
    case 'image':
    case 'image_edit':
    case 'video':
    case 'video_i2v':
    case 'video_v2v':
    case 'audio':
      return normalized
    case 'text_to_image':
    case 't2i':
    case 'txt2img':
      return 'image'
    case 'image_to_image':
    case 'i2i':
    case 'img2img':
      return 'image_edit'
    case 'text_to_video':
    case 't2v':
    case 'txt2video':
      return 'video'
    case 'image_to_video':
    case 'i2v':
    case 'img2video':
      return 'video_i2v'
    case 'video_to_video':
    case 'v2v':
      return 'video_v2v'
    default:
      return undefined
  }
}

export function summarizeModelContractForAgent(model: unknown): Record<string, unknown> {
  const source = isRecord(model) ? model : {}
  const schema = isRecord(source.params_schema) ? source.params_schema : undefined
  const supportedParams = Array.isArray(source.supported_params) ? source.supported_params : []
  const numericID = numericModelField(source, 'id') ?? numericModelField(source, 'ID')
  const supportedParamKeys = supportedParams.flatMap((param) => {
    if (!isRecord(param) || typeof param.key !== 'string' || !param.key.trim()) return []
    return [param.key.trim()]
  })
  const propertyKeys = Object.keys(isRecord(schema?.properties) ? schema.properties : {})
  return {
    contract_version: 1,
    model_id: stringModelField(source, 'model_id') ?? stringModelField(source, 'logical_model_id') ?? stringModelField(source, 'model_def_id') ?? (numericID ? `backend.model.${numericID}` : 'default'),
    ...(typeof source.display_name === 'string' && source.display_name.trim() ? { display_name: source.display_name.trim() } : {}),
    ...(typeof source.short_name === 'string' && source.short_name.trim() ? { short_name: source.short_name.trim() } : {}),
    ...(typeof source.logical_model_id === 'string' && source.logical_model_id.trim() ? { logical_model_id: source.logical_model_id.trim() } : {}),
    capabilities: stringArrayModelField(source.capabilities),
    accepts_image_input: source.accepts_image_input === true,
    input_requirements: summarizeInputRequirementsForAgent(source.input_requirements),
    supported_params: summarizeSupportedParamsForAgent(supportedParams, schema),
    supported_param_keys: Array.from(new Set(supportedParamKeys.length > 0 ? supportedParamKeys : propertyKeys)).sort(),
    params_schema_loaded: !!schema,
    ...(Array.isArray(schema?.allOf) ? { params_schema_rule_count: schema.allOf.length } : {}),
  }
}

function summarizeInputRequirementsForAgent(value: unknown): Record<string, Record<string, number>> {
  const source = isRecord(value) ? value : {}
  return {
    image: summarizeInputRequirementForAgent(source.image),
    video: summarizeInputRequirementForAgent(source.video),
  }
}

function summarizeInputRequirementForAgent(value: unknown): Record<string, number> {
  const source = isRecord(value) ? value : {}
  const min = integerModelField(source, 'min', 0, 0)
  const max = integerModelField(source, 'max', -1, 0)
  if (max !== -1 && min > max) return { min: 0, max: 0 }
  return {
    min,
    max,
  }
}

function summarizeSupportedParamsForAgent(supportedParams: unknown[], schema: Record<string, unknown> | undefined): Array<Record<string, unknown>> {
  const properties = isRecord(schema?.properties) ? schema.properties : undefined
  const params = supportedParams
    .map((param) => summarizeSupportedParamDefForAgent(param, properties))
    .filter((param): param is Record<string, unknown> => !!param)
  if (params.length > 0) return params

  if (!properties) return []
  return Object.entries(properties)
    .map(([key, property]) => summarizeSchemaPropertyForAgent(key, property))
    .filter((param): param is Record<string, unknown> => !!param)
}

function summarizeSupportedParamDefForAgent(param: unknown, schemaProperties: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!isRecord(param) || typeof param.key !== 'string' || !param.key.trim()) return undefined
  const out: Record<string, unknown> = { key: param.key.trim() }
  if (typeof param.label === 'string' && param.label.trim()) out.label = param.label.trim()
  if (typeof param.type === 'string' && param.type.trim()) out.type = param.type.trim()
  if (Array.isArray(param.options)) {
    const options = stringArrayModelField(param.options)
    if (options.length > 0) out.options = options
  }
  if (param.default !== undefined) out.default = param.default
  copyFiniteNumber(out, param, 'min')
  copyFiniteNumber(out, param, 'max')
  copyFiniteNumber(out, param, 'step')
  copyStringArray(out, param, 'conflicts_with')
  copyConditionalEnumRules(out, param)
  copyConditionalConstRules(out, param)
  copyRequiresValueRules(out, param)
  mergeSchemaPropertySummary(out, schemaProperties?.[out.key as string])
  return out
}

function summarizeSchemaPropertyForAgent(key: string, property: unknown): Record<string, unknown> | undefined {
  const trimmedKey = key.trim()
  if (!trimmedKey || !isRecord(property)) return undefined
  const out: Record<string, unknown> = { key: trimmedKey }
  if (typeof property.type === 'string' && property.type.trim()) out.type = property.type.trim()
  copySchemaEnum(out, property)
  if (property.default !== undefined) out.default = property.default
  copyFiniteNumber(out, property, 'minimum', 'min')
  copyFiniteNumber(out, property, 'maximum', 'max')
  copyFiniteNumber(out, property, 'multipleOf', 'step')
  if (typeof property.description === 'string' && property.description.trim()) out.description = property.description.trim()
  return out
}

function mergeSchemaPropertySummary(out: Record<string, unknown>, property: unknown): void {
  if (!isRecord(property)) return
  copySchemaEnum(out, property)
  copyFiniteNumber(out, property, 'minimum', 'min')
  copyFiniteNumber(out, property, 'maximum', 'max')
  copyFiniteNumber(out, property, 'multipleOf', 'step')
  if (property.default !== undefined && out.default === undefined) out.default = property.default
  if (typeof property.description === 'string' && property.description.trim()) out.description = property.description.trim()
}

function copySchemaEnum(out: Record<string, unknown>, property: Record<string, unknown>): void {
  if (!Array.isArray(property.enum)) return
  const values = property.enum.filter(isJSONScalar)
  if (values.length === 0) return
  if (values.every((value) => typeof value === 'string')) out.options = values
  else out.enum = values
}

function copyFiniteNumber(out: Record<string, unknown>, source: Record<string, unknown>, sourceKey: string, targetKey = sourceKey): void {
  const value = source[sourceKey]
  if (typeof value === 'number' && Number.isFinite(value)) out[targetKey] = value
}

function isJSONScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function copyStringArray(out: Record<string, unknown>, source: Record<string, unknown>, key: string): void {
  const value = source[key]
  if (!Array.isArray(value)) return
  const items = stringArrayModelField(value)
  if (items.length > 0) out[key] = items
}

function copyConditionalEnumRules(out: Record<string, unknown>, source: Record<string, unknown>): void {
  const value = source.conditional_enum
  if (!Array.isArray(value)) return
  const rules = value.flatMap((item) => {
    if (!isRecord(item)) return []
    const whenParam = typeof item.when_param === 'string' ? item.when_param.trim() : ''
    const options = Array.isArray(item.options) ? item.options.filter((option): option is string => typeof option === 'string') : []
    if (!whenParam || !isJSONScalar(item.when_value) || options.length === 0) return []
    return [{
      when_param: whenParam,
      when_value: item.when_value,
      options,
    }]
  })
  if (rules.length > 0) out.conditional_enum = rules
}

function copyConditionalConstRules(out: Record<string, unknown>, source: Record<string, unknown>): void {
  const value = source.conditional_const
  if (!Array.isArray(value)) return
  const rules = value.flatMap((item) => {
    if (!isRecord(item)) return []
    const whenParam = typeof item.when_param === 'string' ? item.when_param.trim() : ''
    if (!whenParam || !isJSONScalar(item.when_value) || !isJSONScalar(item.value)) return []
    return [{
      when_param: whenParam,
      when_value: item.when_value,
      value: item.value,
    }]
  })
  if (rules.length > 0) out.conditional_const = rules
}

function copyRequiresValueRules(out: Record<string, unknown>, source: Record<string, unknown>): void {
  const value = source.requires_value
  if (!Array.isArray(value)) return
  const rules = value.flatMap((item) => {
    if (!isRecord(item)) return []
    const param = typeof item.param === 'string' ? item.param.trim() : ''
    if (!param || !isJSONScalar(item.value)) return []
    return [{
      param,
      value: item.value,
    }]
  })
  if (rules.length > 0) out.requires_value = rules
}

async function readProjectScripts(args: Record<string, unknown>): Promise<unknown> {
  const projectId = getOptionalNumber(args, 'projectId') ?? contextSnapshot.project?.id
  if (!projectId) throw new Error('projectId is required when no current project is selected')

  const scriptId = getOptionalNumber(args, 'scriptId')
  const includeContent = args.includeContent === true
  const contentLimit = clampNumber(Math.floor(getOptionalNumber(args, 'contentLimit') ?? 8000), 500, 50000)
  const limit = Math.max(1, Math.min(Math.floor(getOptionalNumber(args, 'limit') ?? 50), 100))
  const scripts = await backendList(`/projects/${projectId}/scripts`)
  const selectedScripts = scriptId
    ? scripts.filter((script: any) => Number(script?.ID ?? script?.id) === scriptId)
    : scripts.slice(0, limit)

  return {
    projectId,
    count: scripts.length,
    returned: selectedScripts.length,
    includeContent,
    contentLimit: includeContent ? contentLimit : 0,
    scripts: selectedScripts.map((script: any) => summarizeScript(script, { includeContent, contentLimit })),
  }
}

export async function queryCreativeReferences(args: Record<string, unknown>): Promise<unknown> {
  const projectId = resolveToolProjectId(args)
  const referenceId = getOptionalNumeric(args, 'creative_reference_id') ?? getOptionalNumeric(args, 'creativeReferenceId')
  const kind = getOptionalString(args, 'kind')
  const status = getOptionalString(args, 'status')
  const query = getOptionalString(args, 'query')
  const limit = normalizeListLimit(args.limit, 50, 200)
  const path = withQuery(`/projects/${projectId}/entities/creative-references`, { kind })
  const rawReferences = await backendList(path)
  const matchedReferences = rawReferences.filter((item) => {
    if (referenceId !== undefined && entityId(item) !== referenceId) return false
    if (status && normalizedStringField(item, 'status') !== status) return false
    if (query && !recordMatchesQuery(item, query, ['name', 'alias', 'description', 'content', 'profile_json', 'tags_json'])) return false
    return true
  })
  const references = limitItems(matchedReferences, limit)
  const referenceIds = new Set(references.map(entityId).filter((id): id is number => id !== undefined))

  const includeStates = args.include_states === true || args.includeStates === true || args.include_asset_slots === true || args.includeAssetSlots === true
  const includeUsages = args.include_usages === true || args.includeUsages === true
  const includeRelationships = args.include_relationships === true || args.includeRelationships === true
  const includeAssetSlots = args.include_asset_slots === true || args.includeAssetSlots === true

  const states = includeStates
    ? await queryReferenceStates(projectId, referenceIds)
    : []
  const stateIds = new Set(states.map(entityId).filter((id): id is number => id !== undefined))
  const usages = includeUsages
    ? await queryReferenceUsages(projectId, referenceIds)
    : []
  const relationships = includeRelationships
    ? await queryReferenceRelationships(projectId, referenceIds)
    : []
  const assetSlots = includeAssetSlots
    ? await queryAssetSlots({
        projectId,
        include_internal: true,
        limit: 200,
        _creativeReferenceIds: Array.from(referenceIds),
        _creativeReferenceStateIds: Array.from(stateIds),
      })
    : undefined

  return {
    projectId,
    kind: 'creative_references',
    filters: compactObject({ creative_reference_id: referenceId, kind, status, query, limit }),
    count: matchedReferences.length,
    total_count: rawReferences.length,
    returned: references.length,
    ...(rawReferences.length > 0 && matchedReferences.length === 0 ? { note: 'Filters matched no creative references. count is the filtered match count; total_count is the unfiltered backend count.' } : {}),
    references: references.map(summarizeCreativeReference),
    ...(includeStates ? { states: states.map(summarizeCreativeReferenceState) } : {}),
    ...(includeUsages ? { usages: usages.map(summarizeCreativeReferenceUsage) } : {}),
    ...(includeRelationships ? { relationships: relationships.map(summarizeCreativeRelationship) } : {}),
    ...(includeAssetSlots && isRecord(assetSlots) ? { asset_slots: assetSlots.asset_slots } : {}),
  }
}

export async function queryAssetSlots(args: Record<string, unknown>): Promise<unknown> {
  const projectId = resolveToolProjectId(args)
  const assetSlotId = getOptionalNumeric(args, 'asset_slot_id') ?? getOptionalNumeric(args, 'assetSlotId')
  const creativeReferenceId = getOptionalNumeric(args, 'creative_reference_id') ?? getOptionalNumeric(args, 'creativeReferenceId')
  const creativeReferenceStateId = getOptionalNumeric(args, 'creative_reference_state_id') ?? getOptionalNumeric(args, 'creativeReferenceStateId')
  const ownerType = getOptionalString(args, 'owner_type') ?? getOptionalString(args, 'ownerType')
  const ownerId = getOptionalNumeric(args, 'owner_id') ?? getOptionalNumeric(args, 'ownerId')
  const productionId = getOptionalNumeric(args, 'production_id') ?? getOptionalNumeric(args, 'productionId')
  const status = getOptionalString(args, 'status')
  const query = getOptionalString(args, 'query')
  const includeInternal = args.include_internal === true || args.includeInternal === true
  const includeCandidates = args.include_candidates === true || args.includeCandidates === true
  const limit = normalizeListLimit(args.limit, 50, 200)
  const referenceIds = numberSetArg(args._creativeReferenceIds, creativeReferenceId)
  const stateIds = numberSetArg(args._creativeReferenceStateIds, creativeReferenceStateId)

  const path = withQuery(`/projects/${projectId}/entities/asset-slots`, {
    production_id: productionId,
    status,
    owner_type: ownerType,
    include_internal: includeInternal ? 'true' : undefined,
  })
  const rawSlots = await backendList(path)
  const matchedSlots = rawSlots.filter((slot) => {
    if (assetSlotId !== undefined && entityId(slot) !== assetSlotId) return false
    const slotOwnerType = normalizedStringField(slot, 'owner_type') ?? normalizedStringField(slot, 'ownerType')
    const slotOwnerId = numericValue(isRecord(slot) ? slot.owner_id ?? slot.ownerId : undefined)
    if (ownerId !== undefined && slotOwnerId !== ownerId) return false
    if (referenceIds.size > 0) {
      const directReferenceId = numericValue(isRecord(slot) ? slot.creative_reference_id ?? slot.creativeReferenceId : undefined)
      const ownerReferenceId = slotOwnerType === 'creative_reference' ? slotOwnerId : undefined
      const directStateId = numericValue(isRecord(slot) ? slot.creative_reference_state_id ?? slot.creativeReferenceStateId : undefined)
      const ownerStateId = slotOwnerType === 'creative_reference_state' ? slotOwnerId : undefined
      const matchesReference = referenceIds.has(directReferenceId ?? -1) || referenceIds.has(ownerReferenceId ?? -1)
      const matchesState = stateIds.size > 0 && (stateIds.has(directStateId ?? -1) || stateIds.has(ownerStateId ?? -1))
      if (!matchesReference && !matchesState) return false
    }
    if (stateIds.size > 0) {
      const directStateId = numericValue(isRecord(slot) ? slot.creative_reference_state_id ?? slot.creativeReferenceStateId : undefined)
      const ownerStateId = slotOwnerType === 'creative_reference_state' ? slotOwnerId : undefined
      const directReferenceId = numericValue(isRecord(slot) ? slot.creative_reference_id ?? slot.creativeReferenceId : undefined)
      const ownerReferenceId = slotOwnerType === 'creative_reference' ? slotOwnerId : undefined
      const matchesState = stateIds.has(directStateId ?? -1) || stateIds.has(ownerStateId ?? -1)
      const matchesReference = referenceIds.size > 0 && (referenceIds.has(directReferenceId ?? -1) || referenceIds.has(ownerReferenceId ?? -1))
      if (!matchesState && !matchesReference) return false
    }
    if (query && !recordMatchesQuery(slot, query, ['name', 'description', 'prompt_hint', 'slot_key', 'metadata_json'])) return false
    return true
  })
  const slots = limitItems(matchedSlots, limit)

  const candidates = includeCandidates
    ? await queryAssetSlotCandidates(projectId, slots)
    : []

  return {
    projectId,
    kind: 'asset_slots',
    filters: compactObject({
      asset_slot_id: assetSlotId,
      creative_reference_id: creativeReferenceId,
      creative_reference_state_id: creativeReferenceStateId,
      owner_type: ownerType,
      owner_id: ownerId,
      production_id: productionId,
      status,
      query,
      include_internal: includeInternal,
      include_candidates: includeCandidates,
      limit,
    }),
    count: matchedSlots.length,
    total_count: rawSlots.length,
    returned: slots.length,
    ...(rawSlots.length > 0 && matchedSlots.length === 0 ? { note: 'Filters matched no asset slots. count is the filtered match count; total_count is the unfiltered backend count.' } : {}),
    asset_slots: slots.map(summarizeAssetSlot),
    ...(includeCandidates ? { candidates: candidates.map(summarizeAssetSlotCandidate) } : {}),
  }
}

export async function queryProductionContext(args: Record<string, unknown>): Promise<unknown> {
  const projectId = resolveToolProjectId(args)
  const productionId = getOptionalNumeric(args, 'production_id') ?? getOptionalNumeric(args, 'productionId')
  const segmentId = getOptionalNumeric(args, 'segment_id') ?? getOptionalNumeric(args, 'segmentId')
  const sceneMomentId = getOptionalNumeric(args, 'scene_moment_id') ?? getOptionalNumeric(args, 'sceneMomentId')
  const contentUnitId = getOptionalNumeric(args, 'content_unit_id') ?? getOptionalNumeric(args, 'contentUnitId')
  const status = getOptionalString(args, 'status')
  const query = getOptionalString(args, 'query')
  const limit = normalizeListLimit(args.limit, 50, 200)
  const include = normalizeProductionContextInclude(args.include)

  const result: Record<string, unknown> = {
    projectId,
    kind: 'production_context',
    filters: compactObject({
      production_id: productionId,
      segment_id: segmentId,
      scene_moment_id: sceneMomentId,
      content_unit_id: contentUnitId,
      status,
      query,
      include: Array.from(include),
      limit,
    }),
  }

  let segments: unknown[] = []
  let sceneMoments: unknown[] = []
  if (include.has('productions')) {
    const productions = await backendList(withQuery(`/projects/${projectId}/entities/productions`, { status }))
    result.productions = limitItems(productions.filter((item) => {
      if (productionId !== undefined && entityId(item) !== productionId) return false
      if (query && !recordMatchesQuery(item, query, ['name', 'description', 'source_type', 'owner_label', 'metadata_json'])) return false
      return true
    }), limit).map(summarizeProductionContextEntity)
  }
  if (include.has('segments') || include.has('scene_moments')) {
    segments = await backendList(withQuery(`/projects/${projectId}/entities/segments`, {
      production_id: productionId,
      status,
    }))
  }
  if (include.has('segments')) {
    result.segments = limitItems(segments.filter((item) => {
      if (segmentId !== undefined && entityId(item) !== segmentId) return false
      if (query && !recordMatchesQuery(item, query, ['title', 'kind', 'summary', 'content', 'metadata_json'])) return false
      return true
    }), limit).map(summarizeProductionContextEntity)
  }
  if (include.has('scene_moments') || include.has('content_units')) {
    const segmentIds = new Set(segments
      .map(entityId)
      .filter((id): id is number => id !== undefined))
    sceneMoments = await backendList(withQuery(`/projects/${projectId}/entities/scene-moments`, { segment_id: segmentId }))
    if (productionId !== undefined && segmentIds.size > 0) {
      sceneMoments = sceneMoments.filter((item) => segmentIds.has(numericValue(isRecord(item) ? item.segment_id ?? item.segmentId : undefined) ?? -1))
    }
  }
  if (include.has('scene_moments')) {
    result.scene_moments = limitItems(sceneMoments.filter((item) => {
      if (sceneMomentId !== undefined && entityId(item) !== sceneMomentId) return false
      if (query && !recordMatchesQuery(item, query, ['title', 'description', 'time_text', 'location_text', 'condition_text', 'action_text', 'mood', 'metadata_json'])) return false
      return true
    }), limit).map(summarizeProductionContextEntity)
  }
  if (include.has('content_units')) {
    const contentUnits = await backendList(withQuery(`/projects/${projectId}/entities/content-units`, {
      production_id: productionId,
      segment_id: segmentId,
      scene_moment_id: sceneMomentId,
    }))
    result.content_units = limitItems(contentUnits.filter((item) => {
      if (contentUnitId !== undefined && entityId(item) !== contentUnitId) return false
      if (query && !recordMatchesQuery(item, query, ['title', 'kind', 'description', 'prompt', 'camera_notes', 'metadata_json'])) return false
      return true
    }), limit).map(summarizeProductionContextEntity)
  }
  if (include.has('keyframes')) {
    const keyframes = await backendList(withQuery(`/projects/${projectId}/entities/keyframes`, {
      production_id: productionId,
      scene_moment_id: sceneMomentId,
      content_unit_id: contentUnitId,
      status,
    }))
    const segmentContentUnitIds = segmentId !== undefined && contentUnitId === undefined && sceneMomentId === undefined
      ? new Set((await backendList(withQuery(`/projects/${projectId}/entities/content-units`, { segment_id: segmentId })))
        .map(entityId)
        .filter((id): id is number => id !== undefined))
      : undefined
    result.keyframes = limitItems(keyframes.filter((item) => {
      if (!isRecord(item)) return false
      if (isGeneratedKeyframeCandidateRecord(item)) return false
      if (contentUnitId !== undefined && numericValue(item.content_unit_id ?? item.contentUnitId) !== contentUnitId) return false
      if (sceneMomentId !== undefined && numericValue(item.scene_moment_id ?? item.sceneMomentId) !== sceneMomentId) return false
      if (productionId !== undefined && numericValue(item.production_id ?? item.productionId) !== productionId) return false
      if (segmentContentUnitIds && !segmentContentUnitIds.has(numericValue(item.content_unit_id ?? item.contentUnitId) ?? -1)) return false
      if (query && !recordMatchesQuery(item, query, ['title', 'description', 'prompt', 'metadata_json'])) return false
      return true
    }), limit).map(summarizeProductionContextEntity)
  }
  if ((args.include_generation_context === true || args.includeGenerationContext === true) && contentUnitId !== undefined) {
    result.generation_context = await backendPost(
      `/projects/${projectId}/entities/content-units/${contentUnitId}/generation-context`,
      { target_type: 'content_unit', target_id: contentUnitId, intent: getOptionalString(args, 'intent') ?? 'video' },
    )
  }

  return result
}

export async function getDraftModelContract(args: Record<string, unknown>): Promise<unknown> {
  const kind = getRequiredString(args, 'kind') as AgentDraftKind
  const model = getDraftDomainModel(kind)
  if (!model) throw new Error(`Unsupported draft model kind: ${kind}`)
  const target = normalizeDraftModelTarget(model.targetEntityType, args.target)
  const mode = normalizeDraftSeedMode(args.seedMode, model.seed.defaultMode)
  if (!model.seed.allowedModes.includes(mode)) {
    throw new Error(`seedMode ${mode} is not allowed for ${kind}`)
  }
  const include = normalizeDraftModelInclude(args.include, model.seed.include)
  const shouldHydrate = args.hydrate === undefined ? mode !== 'empty' : args.hydrate === true
  const seedData = shouldHydrate && mode !== 'empty'
    ? await hydrateDraftSeedData(kind, target, include)
    : undefined
  const reviewRoute = buildDraftModelReviewRoute(model.routes.reviewTemplate, target)
  const modelRef = `frontend:DraftDomainModel:${kind}:v1`
  return {
    contractVersion: 1,
    kind,
    title: model.title,
    targetEntityType: model.targetEntityType,
    target,
    seedPolicy: {
      mode,
      defaultMode: model.seed.defaultMode,
      allowedModes: model.seed.allowedModes,
      include,
      allowedInclude: model.seed.include,
      ...(model.seed.maxDepth !== undefined ? { maxDepth: model.seed.maxDepth } : {}),
      conflictKeys: model.seed.conflictKeys,
    },
    seed: {
      mode,
      include,
      hydrated: !!seedData,
      hydratedAt: new Date().toISOString(),
      modelRef,
      ...(seedData ? { data: seedData.data, sourceVersions: seedData.sourceVersions } : {}),
      ...(seedData?.warnings && seedData.warnings.length > 0 ? { warnings: seedData.warnings } : {}),
    },
    ...(model.contentSchemaId ? { contentSchemaId: model.contentSchemaId } : {}),
    ...(model.contentSchema ? { contentSchema: model.contentSchema } : {}),
    fieldGuide: model.fieldGuide,
    applyBoundary: model.applyBoundary,
    reviewRouteTemplate: model.routes.reviewTemplate,
    reviewRoute,
    modelRef,
  }
}

function normalizeDraftModelTarget(targetEntityType: string, value: unknown): Record<string, unknown> {
  const source = isRecord(value) ? value : {}
  const entityType = typeof source.entityType === 'string' && source.entityType.trim()
    ? source.entityType.trim()
    : targetEntityType
  const entityId = source.entityId
    ?? (targetEntityType === 'project' ? contextSnapshot.project?.id : undefined)
    ?? (targetEntityType === 'production' && contextSnapshot.selection?.entityType === 'production' ? contextSnapshot.selection.entityId : undefined)
  const out: Record<string, unknown> = {
    ...source,
    entityType,
    ...(entityId !== undefined ? { entityId } : {}),
  }
  if (targetEntityType === 'project' && contextSnapshot.project?.id && out.projectId === undefined) {
    out.projectId = contextSnapshot.project.id
  }
  if (targetEntityType !== 'project' && contextSnapshot.project?.id && out.projectId === undefined) {
    out.projectId = contextSnapshot.project.id
  }
  return out
}

function normalizeDraftSeedMode(value: unknown, fallback: DraftSeedMode): DraftSeedMode {
  return value === 'empty' || value === 'snapshot' || value === 'editable_snapshot'
    ? value
    : fallback
}

function normalizeDraftModelInclude(value: unknown, allowedInclude: string[]): string[] {
  if (!Array.isArray(value)) return allowedInclude
  const requested = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
  const allowed = new Set(allowedInclude)
  return requested.filter((item) => allowed.has(item))
}

async function hydrateDraftSeedData(
  kind: AgentDraftKind,
  target: Record<string, unknown>,
  include: string[],
): Promise<{ data: Record<string, unknown>; sourceVersions: Record<string, unknown>; warnings: string[] }> {
  const data: Record<string, unknown> = {}
  const sourceVersions: Record<string, unknown> = {}
  const warnings: string[] = []
  const projectId = numericValue(target.projectId) ?? (['setting_proposal', 'asset_proposal', 'project_proposal'].includes(kind) ? numericValue(target.entityId) : contextSnapshot.project?.id)
  const targetIds = {
    entityId: numericValue(target.entityId),
    productionId: numericValue(target.productionId ?? target.production_id),
    segmentId: numericValue(target.segmentId ?? target.segment_id),
    sceneMomentId: numericValue(target.sceneMomentId ?? target.scene_moment_id),
    contentUnitId: numericValue(target.contentUnitId ?? target.content_unit_id),
  }

  if (!projectId) {
    return { data, sourceVersions, warnings: ['projectId unavailable; seed hydration skipped.'] }
  }

  for (const item of include) {
    try {
      const hydrated = await hydrateDraftSeedInclude(kind, projectId, targetIds, item)
      if (hydrated === undefined) continue
      data[item] = hydrated
      sourceVersions[item] = collectSeedSourceVersions(hydrated)
    } catch (error) {
      warnings.push(`${item}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return { data, sourceVersions, warnings }
}

interface DraftSeedTargetIds {
  entityId?: number
  productionId?: number
  segmentId?: number
  sceneMomentId?: number
  contentUnitId?: number
}

async function hydrateDraftSeedInclude(kind: AgentDraftKind, projectId: number, targetIds: DraftSeedTargetIds, include: string): Promise<unknown> {
  const entityId = targetIds.entityId
  const sceneMomentId = targetIds.sceneMomentId ?? (kind === 'content_unit_proposal' ? entityId : undefined)
  const contentUnitId = targetIds.contentUnitId
  const productionId = targetIds.productionId
    ?? (kind === 'production_proposal' ? entityId : undefined)
    ?? await resolveDraftSeedProductionId(projectId, { sceneMomentId, contentUnitId })
  switch (include) {
    case 'project':
      return summarizeSeedValue(await backendGet(`/projects/${projectId}`))
    case 'creative_references':
      return summarizeSeedValue(await backendList(`/projects/${projectId}/entities/creative-references`))
    case 'asset_slot_ownership':
      return summarizeAssetSlotOwnership(await backendList(`/projects/${projectId}/entities/asset-slots`))
    case 'production': {
      if (!productionId) return undefined
      const productions = await backendList(`/projects/${projectId}/entities/productions`)
      return summarizeSeedValue(productions.find((production) => numericValue(production?.ID ?? production?.id) === productionId) ?? null)
    }
    case 'production_script_brief': {
      if (!entityId) return undefined
      return hydrateProductionScriptBrief(projectId, entityId)
    }
    case 'segments': {
      const segments = await backendList(`/projects/${projectId}/entities/segments`)
      return summarizeSeedValue(productionId
        ? segments.filter((segment) => numericValue(segment?.production_id ?? segment?.productionId) === productionId)
        : segments)
    }
    case 'scene_moments': {
      const segments = await backendList(`/projects/${projectId}/entities/segments`)
      const segmentIds = new Set(segments
        .filter((segment) => !productionId || numericValue(segment?.production_id ?? segment?.productionId) === productionId)
        .map((segment) => numericValue(segment?.ID ?? segment?.id))
        .filter((id): id is number => id !== undefined))
      const moments = await backendList(`/projects/${projectId}/entities/scene-moments`)
      return summarizeSeedValue(sceneMomentId
        ? moments.filter((moment) => numericValue(moment?.ID ?? moment?.id) === sceneMomentId)
        : productionId
          ? moments.filter((moment) => segmentIds.has(numericValue(moment?.segment_id ?? moment?.segmentId) ?? -1))
          : moments)
    }
    case 'content_units': {
      const units = await backendList(`/projects/${projectId}/entities/content-units`)
      return summarizeSeedValue(contentUnitId
        ? units.filter((unit) => numericValue(unit?.ID ?? unit?.id) === contentUnitId)
        : sceneMomentId
          ? units.filter((unit) => numericValue(unit?.scene_moment_id ?? unit?.sceneMomentId) === sceneMomentId)
          : productionId
            ? units.filter((unit) => numericValue(unit?.production_id ?? unit?.productionId) === productionId)
            : units)
    }
    case 'content_unit': {
      if (!contentUnitId) return undefined
      const units = await backendList(`/projects/${projectId}/entities/content-units`)
      return summarizeSeedValue(units.find((unit) => numericValue(unit?.ID ?? unit?.id) === contentUnitId) ?? null)
    }
    case 'reference_resources':
      return summarizeSeedValue(contentUnitId
        ? await backendList(`/projects/${projectId}/resources?ref_type=content_unit&ref_id=${encodeURIComponent(String(contentUnitId))}`)
        : await backendList(`/projects/${projectId}/resources`))
    case 'asset_slots': {
      const slots = await backendList(`/projects/${projectId}/entities/asset-slots`)
      return summarizeSeedValue(contentUnitId
        ? slots.filter((slot) => slot.owner_type === 'content_unit' && numericValue(slot.owner_id) === contentUnitId)
        : sceneMomentId
          ? slots.filter((slot) => slot.owner_type === 'scene_moment' && numericValue(slot.owner_id) === sceneMomentId)
          : productionId
            ? slots.filter((slot) => numericValue(slot.production_id ?? slot.productionId) === productionId)
            : slots)
    }
    case 'asset_slot_usages':
      return summarizeAssetSlotOwnership(await backendList(`/projects/${projectId}/entities/asset-slots`))
    case 'creative_reference_usages':
      return summarizeSeedValue(await backendList(`/projects/${projectId}/entities/creative-reference-usages`))
    case 'asset_slot': {
      if (!entityId) return undefined
      const slots = await backendList(`/projects/${projectId}/entities/asset-slots`)
      return summarizeSeedValue(slots.find((slot) => numericValue(slot?.ID ?? slot?.id) === entityId) ?? null)
    }
    case 'asset_need':
    case 'unresolved_requirements':
    case 'source_script':
    case 'project_scripts':
      return summarizeProjectScripts(await backendList(`/projects/${projectId}/scripts`))
    case 'productions':
      return summarizeSeedValue(await hydrateDraftKnownFallback(projectId, include))
    default:
      return undefined
  }
}

async function resolveDraftSeedProductionId(
  projectId: number,
  target: { sceneMomentId?: number; contentUnitId?: number },
): Promise<number | undefined> {
  let sceneMomentId = target.sceneMomentId
  if (!sceneMomentId && target.contentUnitId) {
    const units = await backendList(`/projects/${projectId}/entities/content-units`)
    const unit = units.find((item) => numericValue(item?.ID ?? item?.id) === target.contentUnitId)
    const directProductionId = numericValue(unit?.production_id ?? unit?.productionId)
    if (directProductionId) return directProductionId
    sceneMomentId = numericValue(unit?.scene_moment_id ?? unit?.sceneMomentId)
  }
  if (!sceneMomentId) return undefined

  const moments = await backendList(`/projects/${projectId}/entities/scene-moments`)
  const moment = moments.find((item) => numericValue(item?.ID ?? item?.id) === sceneMomentId)
  const directProductionId = numericValue(moment?.production_id ?? moment?.productionId)
  if (directProductionId) return directProductionId

  const segmentId = numericValue(moment?.segment_id ?? moment?.segmentId)
  if (!segmentId) return undefined
  const segments = await backendList(`/projects/${projectId}/entities/segments`)
  const segment = segments.find((item) => numericValue(item?.ID ?? item?.id) === segmentId)
  return numericValue(segment?.production_id ?? segment?.productionId)
}

async function hydrateProductionScriptBrief(projectId: number, productionId: number): Promise<unknown> {
  const productions = await backendList(`/projects/${projectId}/entities/productions`)
  const production = productions.find((item) => numericValue(item?.ID ?? item?.id) === productionId)
  if (!production || typeof production !== 'object') {
    return {
      productionId,
      warning: 'Production not found while hydrating production_script_brief.',
    }
  }

  const scriptVersionId = numericValue(production.script_version_id ?? production.scriptVersionId)
  const productionSummary = summarizeEntity(production)
  if (!scriptVersionId) {
    return {
      production: productionSummary,
      brief: textOrUndefined(production.description) ?? textOrUndefined(production.summary) ?? '',
      sourceType: production.source_type,
      warning: 'Production has no linked script_version_id; using production brief fields only.',
    }
  }

  const scriptVersions = await backendList(`/projects/${projectId}/entities/script-versions`)
  const scriptVersion = scriptVersions.find((item) => numericValue(item?.ID ?? item?.id) === scriptVersionId)
  const body = textOrUndefined(scriptVersion?.content) ?? textOrUndefined(scriptVersion?.raw_source) ?? ''
  return {
    production: productionSummary,
    scriptVersion: summarizeScriptVersion(scriptVersion),
    brief: textOrUndefined(production.description) ?? textOrUndefined(scriptVersion?.summary) ?? '',
    scriptVersionId,
    scriptVersionTitle: textOrUndefined(scriptVersion?.title),
    scriptVersionUpdatedAt: textOrUndefined(scriptVersion?.UpdatedAt ?? scriptVersion?.updatedAt),
    body_length: body.length,
    body_excerpt: body ? truncateLongText(body.slice(0, 4000)) : '',
    body_excerpt_truncated: body.length > 4000,
  }
}

async function hydrateDraftKnownFallback(projectId: number, include: string): Promise<unknown> {
  switch (include) {
    case 'project_scripts':
    case 'source_script':
      return backendList(`/projects/${projectId}/scripts`)
    case 'productions':
      return backendList(`/projects/${projectId}/entities/productions`)
    default:
      return null
  }
}

function summarizeSeedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => summarizeResource(item))
  if (isRecord(value)) return summarizeResource(value)
  return value
}

function summarizeAssetSlotOwnership(slots: unknown[]): unknown[] {
  return slots.flatMap((slot) => {
    if (!isRecord(slot)) return []
    const id = slot.ID ?? slot.id
    return [{
      id,
      owner_type: slot.owner_type,
      owner_id: slot.owner_id,
      creative_reference_id: slot.creative_reference_id,
      production_id: slot.production_id,
      UpdatedAt: slot.UpdatedAt ?? slot.updatedAt,
    }]
  })
}

function collectSeedSourceVersions(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (!isRecord(item)) return []
      const id = item.ID ?? item.id
      const updatedAt = item.UpdatedAt ?? item.updatedAt
      return id !== undefined || updatedAt !== undefined ? [{ id, updatedAt }] : []
    })
  }
  if (isRecord(value)) {
    return {
      id: value.ID ?? value.id ?? value.scriptVersionId,
      updatedAt: value.UpdatedAt ?? value.updatedAt ?? value.scriptVersionUpdatedAt,
    }
  }
  return null
}

function buildDraftModelReviewRoute(template: string, target: Record<string, unknown>): string {
  const entityId = target.entityId !== undefined ? String(target.entityId) : ''
  return template
    .replace(/:targetEntityId/g, encodeURIComponent(entityId))
    .replace(/:draftId/g, ':draftId')
}

async function createProject(args: Record<string, unknown>): Promise<unknown> {
  const name = getRequiredString(args, 'name').trim()
  if (!name) throw new Error('name is required')
  const payload: Record<string, unknown> = { name }
  const description = typeof args.description === 'string' ? args.description.trim() : ''
  const status = typeof args.status === 'string' ? args.status.trim() : ''
  const totalEpisodes = getOptionalNumber(args, 'total_episodes')
  if (description) payload.description = description
  if (status) payload.status = status
  if (totalEpisodes !== undefined) payload.total_episodes = totalEpisodes

  const project = await backendPost('/projects', payload)
  const summary = summarizeProject(project)
  return {
    status: 'created',
    project: summary,
    message: isRecord(summary) && typeof summary.id === 'number'
      ? `项目「${name}」已创建（project#${summary.id}）。`
      : `项目「${name}」已创建。`,
  }
}

async function backendList(path: string): Promise<any[]> {
  const data = await backendGet(path)
  if (Array.isArray(data)) return data
  if (isRecord(data) && Array.isArray(data.items)) return data.items
  return []
}

function resolveToolProjectId(args: Record<string, unknown>): number {
  const projectId = getOptionalNumeric(args, 'projectId') ?? getOptionalNumeric(args, 'project_id') ?? contextSnapshot.project?.id
  if (!projectId) throw new Error('projectId is required when no current project is selected')
  return projectId
}

function withQuery(path: string, params: Record<string, unknown>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    query.set(key, String(value))
  }
  const serialized = query.toString()
  return serialized ? `${path}?${serialized}` : path
}

function normalizeListLimit(value: unknown, fallback: number, max: number): number {
  const parsed = numericValue(value)
  if (parsed === undefined) return fallback
  return clampNumber(Math.floor(parsed), 1, max)
}

function limitItems<T>(items: T[], limit: number): T[] {
  return items.slice(0, limit)
}

function entityId(item: unknown): number | undefined {
  return numericValue(isRecord(item) ? item.ID ?? item.id : undefined)
}

function normalizedStringField(item: unknown, key: string): string | undefined {
  if (!isRecord(item)) return undefined
  const value = item[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberSetArg(value: unknown, extra?: number): Set<number> {
  const out = new Set<number>()
  if (extra !== undefined) out.add(extra)
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = numericValue(item)
      if (parsed !== undefined) out.add(parsed)
    }
  }
  return out
}

function recordMatchesQuery(item: unknown, query: string, fields: string[]): boolean {
  if (!isRecord(item)) return false
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return fields.some((field) => {
    const value = item[field]
    if (value === undefined || value === null) return false
    return String(value).toLowerCase().includes(needle)
  })
}

function compactObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''))
}

async function queryReferenceStates(projectId: number, referenceIds: Set<number>): Promise<unknown[]> {
  const out: unknown[] = []
  for (const id of referenceIds) {
    out.push(...await backendList(`/projects/${projectId}/entities/creative-reference-states?creative_reference_id=${encodeURIComponent(String(id))}`))
  }
  return out
}

async function queryReferenceUsages(projectId: number, referenceIds: Set<number>): Promise<unknown[]> {
  const out: unknown[] = []
  for (const id of referenceIds) {
    out.push(...await backendList(`/projects/${projectId}/entities/creative-reference-usages?creative_reference_id=${encodeURIComponent(String(id))}`))
  }
  return out
}

async function queryReferenceRelationships(projectId: number, referenceIds: Set<number>): Promise<unknown[]> {
  const seen = new Set<number>()
  const out: unknown[] = []
  for (const id of referenceIds) {
    const relationships = await backendList(`/projects/${projectId}/entities/creative-relationships?creative_reference_id=${encodeURIComponent(String(id))}`)
    for (const relationship of relationships) {
      const relationshipId = entityId(relationship)
      if (relationshipId !== undefined) {
        if (seen.has(relationshipId)) continue
        seen.add(relationshipId)
      }
      out.push(relationship)
    }
  }
  return out
}

async function queryAssetSlotCandidates(projectId: number, slots: unknown[]): Promise<unknown[]> {
  const out: unknown[] = []
  for (const slot of slots) {
    const id = entityId(slot)
    if (id === undefined) continue
    out.push(...await backendList(`/projects/${projectId}/entities/asset-slot-candidates?asset_slot_id=${encodeURIComponent(String(id))}`))
  }
  return out
}

function normalizeProductionContextInclude(value: unknown): Set<string> {
  const allowed = new Set(['productions', 'segments', 'scene_moments', 'content_units', 'keyframes'])
  if (!Array.isArray(value)) return new Set(['segments', 'scene_moments', 'content_units'])
  const out = new Set(value.filter((item): item is string => typeof item === 'string' && allowed.has(item)))
  return out.size > 0 ? out : new Set(['segments', 'scene_moments', 'content_units'])
}

export async function createGenerationJob(args: Record<string, unknown>): Promise<unknown> {
  const prompt = getRequiredString(args, 'prompt').trim()
  if (!prompt) throw new Error('prompt is required')

  const inputResourceIds = getNumberArray(args.input_resource_ids ?? args.inputResourceIds ?? args.reference_resource_ids)
  const jobType = inferGenerationJobType(args, inputResourceIds)
  const requestedModelId = getOptionalString(args, 'model_id') ?? getOptionalString(args, 'modelId')
  const legacyModelConfigId = getOptionalNumeric(args, 'model_config_id') ?? getOptionalNumeric(args, 'modelConfigId')
  const modelRoute = await resolveGenerationModelRouteForMcp(jobType, requestedModelId, legacyModelConfigId)
  const modelConfigId = modelRoute.modelConfigId
  if (!modelRoute.modelId) throw new Error(`没有可用的 ${jobType} model_id，请先在管理后台检查模型配置`)
  const projectId = getOptionalNumeric(args, 'projectId') ?? contextSnapshot.project?.id
  const wait = args.wait !== false
  let aspectRatio = getOptionalString(args, 'aspect_ratio')
  const duration = getOptionalNumeric(args, 'duration')
  const featureKey = getOptionalString(args, 'feature_key') ?? getOptionalString(args, 'featureKey') ?? 'agent.chat_generation'
  const modelParamContract = await getGenerationModelParamContract(modelConfigId, jobType)
  const supportedParamKeys = modelParamContract?.supportedParamKeys
  const extraParamAudit = normalizeGenerationExtraParams(args.extra_params, supportedParamKeys)
  const extraParams = extraParamAudit.extraParams
  if (aspectRatio && supportedParamKeys && !supportedParamKeys.has('aspect_ratio')) {
    aspectRatio = undefined
  }
  const submittedParamsForPreflight: Record<string, unknown> = {
    ...(extraParamAudit.submittedParams ?? {}),
    ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
    ...(duration !== undefined ? { duration } : {}),
  }
  const preflightErrors = preflightGenerationParams(submittedParamsForPreflight, modelParamContract)
  const inputPreflightErrors = preflightGenerationInputs(jobType, inputResourceIds.length, modelParamContract)
  const paramValidation = buildGenerationParamValidationAudit(modelConfigId, modelParamContract, extraParamAudit, {
    aspectRatioRequested: getOptionalString(args, 'aspect_ratio'),
    aspectRatioSubmitted: aspectRatio,
    preflightErrors,
    submittedInputs: buildSubmittedGenerationInputs(jobType, inputResourceIds.length),
    inputPreflightErrors,
  })
  const title = getOptionalString(args, 'title') ?? defaultGenerationJobTitle(jobType)

  const job = await backendPost('/jobs', {
    model_id: modelRoute.modelId,
    job_type: jobType,
    feature_key: featureKey,
    title,
    prompt,
    ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
    ...(duration !== undefined ? { duration } : {}),
    ...(extraParams ? { extra_params: extraParams } : {}),
    ...(inputResourceIds.length > 0 ? { input_resource_ids: inputResourceIds } : {}),
    ...(projectId ? { project_id: projectId } : {}),
  })

  const initialJobId = getJobId(job)
  if (!wait) {
    const normalized = normalizeGenerationJob(job)
    return {
      status: 'queued',
      job: normalized.job,
      jobId: initialJobId,
      monitor: {
        tool: 'movscript_get_generation_job',
        args: initialJobId ? { jobId: initialJobId, ...(projectId ? { projectId } : {}) } : undefined,
        message: 'Generation is asynchronous. Inspect this job until it reaches a terminal status before claiming completion.',
      },
      param_validation: paramValidation,
      message: `生成任务已创建${initialJobId ? `（Job #${initialJobId}）` : ''}。`,
    }
  }
  if (!initialJobId) throw new Error('generation job was created without an ID')

  const timeoutMs = getOptionalNumeric(args, 'timeout_ms') ?? (jobType.startsWith('video') ? 600_000 : 180_000)
  const pollIntervalMs = clampNumber(getOptionalNumeric(args, 'poll_interval_ms') ?? 2500, 500, 15_000)
  const finalJob = await waitForGenerationJob(initialJobId, timeoutMs, pollIntervalMs)
  const normalized = normalizeGenerationJob(finalJob)
  const finalStatus = stringValue(normalized.status) ?? 'unknown'
  const outputResourceId = typeof normalized.output_resource_id === 'number' ? normalized.output_resource_id : undefined
  const outputResource = isRecord(normalized.output_resource) ? normalized.output_resource : undefined
  const outputResourceIds = Array.isArray(normalized.output_resource_ids) ? normalized.output_resource_ids.filter((id): id is number => typeof id === 'number') : []
  const outputResources = Array.isArray(normalized.output_resources) ? normalized.output_resources.filter(isRecord) : []
  const media = isRecord(normalized.media) ? normalized.media : undefined

  return {
    status: finalStatus,
    job: normalized.job,
    jobId: initialJobId,
    ...(outputResources.length > 0 ? { output_resources: outputResources } : {}),
    ...(outputResourceIds.length > 0 ? { output_resource_ids: outputResourceIds } : {}),
    ...(outputResource ? { output_resource: outputResource } : {}),
    ...(outputResourceId ? { output_resource_id: outputResourceId } : {}),
    ...(media ? { media } : {}),
    param_validation: paramValidation,
    terminal: isTerminalGenerationStatus(finalStatus),
    message: finalStatus === 'succeeded'
      ? generationJobMessage(initialJobId, normalized)
      : `生成任务结束，状态：${finalStatus}。`,
  }
}

export async function attachAssetSlotCandidate(args: Record<string, unknown>): Promise<unknown> {
  const projectId = resolveToolProjectId(args)
  const assetSlotIdAliases = ['asset_slot_id', 'assetSlotId']
  const resourceIdAliases = ['resource_id', 'resourceId', 'output_resource_id', 'outputResourceId']
  const assetSlotId = getRequiredPositiveIntegerAliasParam(args, assetSlotIdAliases, 'asset_slot_id')
  const resourceId = getRequiredPositiveIntegerAliasParam(args, resourceIdAliases, 'resource_id')

  const sourceType = getOptionalString(args, 'source_type') ?? getOptionalString(args, 'sourceType') ?? 'agent'
  const sourceId = getOptionalNumeric(args, 'source_id') ?? getOptionalNumeric(args, 'sourceId') ?? getOptionalNumeric(args, 'jobId')
  const score = getOptionalNumeric(args, 'score')
  const note = getOptionalString(args, 'note')
  const candidate = await backendPost(`/projects/${projectId}/entities/asset-slot-candidates`, {
    asset_slot_id: assetSlotId,
    resource_id: resourceId,
    source_type: sourceType,
    ...(sourceId ? { source_id: sourceId } : {}),
    ...(score !== undefined ? { score } : {}),
    ...(note ? { note } : {}),
  })
  const candidateAssetSlotId = numericValue(isRecord(candidate) ? candidate.candidate_asset_slot_id ?? candidate.candidateAssetSlotId : undefined)

  return {
    status: 'attached',
    candidate,
    asset_slot_id: assetSlotId,
    ...(candidateAssetSlotId ? { candidate_asset_slot_id: candidateAssetSlotId } : {}),
    resource_id: resourceId,
    message: `资源 #${resourceId} 已加入素材位 #${assetSlotId} 的候选集。`,
  }
}

export async function attachKeyframeCandidate(args: Record<string, unknown>): Promise<unknown> {
  const projectId = resolveToolProjectId(args)
  const keyframeIdAliases = ['keyframe_id', 'keyframeId', 'target_keyframe_id', 'targetKeyframeId']
  const resourceIdAliases = ['resource_id', 'resourceId', 'output_resource_id', 'outputResourceId']
  const keyframeId = getRequiredPositiveIntegerAliasParam(args, keyframeIdAliases, 'keyframe_id')
  const resourceId = getRequiredPositiveIntegerAliasParam(args, resourceIdAliases, 'resource_id')

  const keyframes = await backendList(`/projects/${projectId}/entities/keyframes`)
  const target = keyframes.find((item) => entityId(item) === keyframeId)
  if (!target || !isRecord(target)) throw new Error(`target keyframe ${keyframeId} not found in project ${projectId}`)
  if (isGeneratedKeyframeCandidateTarget(target)) {
    throw new Error(`keyframe ${keyframeId} is already a generated candidate; choose the original target keyframe`)
  }

  const sourceType = getOptionalString(args, 'source_type') ?? getOptionalString(args, 'sourceType') ?? 'agent'
  const sourceId = getOptionalNumeric(args, 'source_id') ?? getOptionalNumeric(args, 'sourceId') ?? getOptionalNumeric(args, 'jobId')
  const sourceJobId = getOptionalNumeric(args, 'jobId') ?? (sourceType === 'job' ? sourceId : undefined)
  const explicitTitle = getOptionalString(args, 'title')
  const explicitDescription = getOptionalString(args, 'description')
  const explicitPrompt = getOptionalString(args, 'prompt')
  const note = getOptionalString(args, 'note')
  const targetTitle = stringValue(target.title) ?? stringValue(target.name) ?? `画面锚点 #${keyframeId}`
  const targetDescription = stringValue(target.description)
  const targetPrompt = stringValue(target.prompt)
  const metadata: Record<string, unknown> = {
    source: 'ai_generated_keyframe_candidate',
    target_keyframe_id: keyframeId,
    resource_id: resourceId,
    source_type: sourceType,
    ...(sourceId ? { source_id: sourceId } : {}),
    ...(sourceJobId ? { source_job_id: sourceJobId } : {}),
    ...(note ? { note } : {}),
  }

  const candidate = await backendPost(`/projects/${projectId}/entities/keyframes`, {
    production_id: numericValue(target.production_id ?? target.productionId),
    scene_moment_id: numericValue(target.scene_moment_id ?? target.sceneMomentId),
    content_unit_id: numericValue(target.content_unit_id ?? target.contentUnitId),
    resource_id: resourceId,
    canvas_id: numericValue(target.canvas_id ?? target.canvasId),
    title: explicitTitle ?? `候选：${targetTitle}`,
    description: explicitDescription ?? targetDescription ?? '',
    prompt: explicitPrompt ?? targetPrompt ?? '',
    order: numericValue(target.order ?? target.sort_order ?? target.sortOrder) ?? 0,
    status: 'candidate',
    metadata_json: JSON.stringify(metadata),
  })

  return {
    status: 'attached',
    candidate,
    keyframe_id: keyframeId,
    resource_id: resourceId,
    message: `资源 #${resourceId} 已加入画面锚点 #${keyframeId} 的候选集。`,
  }
}

function isGeneratedKeyframeCandidateTarget(keyframe: Record<string, unknown>): boolean {
  return isGeneratedKeyframeCandidateRecord(keyframe)
}

function isGeneratedKeyframeCandidateRecord(keyframe: Record<string, unknown>): boolean {
  const metadata = parseMetadataRecord(keyframe.metadata_json)
  return metadata?.source === 'ai_generated_keyframe_candidate'
    || numericValue(metadata?.target_keyframe_id) !== undefined
}

function parseMetadataRecord(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || value.trim().length === 0) return undefined
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function defaultGenerationJobTitle(jobType: string): string {
  const labels: Record<string, string> = {
    image: '文生图',
    image_edit: '参考生图',
    video: '文生视频',
    video_i2v: '参考生视频',
    video_v2v: '视频迁移',
  }
  return `${labels[jobType] ?? '生成任务'}-${Math.floor(1000 + Math.random() * 9000)}`
}

async function getGenerationJob(args: Record<string, unknown>): Promise<unknown> {
  const jobId = getRequiredNumber(args, 'jobId')
  const rawJob = await backendGet(`/jobs/${jobId}`)
  const normalized = normalizeGenerationJob(rawJob)
  const status = stringValue(normalized.status) ?? 'unknown'
  return {
    ...normalized,
    jobId,
    terminal: isTerminalGenerationStatus(status),
    message: generationJobMessage(jobId, normalized),
  }
}

async function listGenerationJobs(args: Record<string, unknown>): Promise<unknown> {
  const projectId = getOptionalNumeric(args, 'projectId') ?? contextSnapshot.project?.id
  const limit = clampNumber(Math.floor(getOptionalNumeric(args, 'limit') ?? 20), 1, 100)
  const query = new URLSearchParams({ limit: String(limit) })
  if (projectId) query.set('project_id', String(projectId))
  const status = getOptionalString(args, 'status')
  if (status) query.set('status', status)
  const jobType = getOptionalString(args, 'job_type') ?? getOptionalString(args, 'jobType')
  if (jobType) {
    query.set('exact_type', '1')
    query.set('type', jobType)
  }

  const raw = await backendGet(`/jobs?${query.toString()}`)
  const jobs = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.items)
      ? raw.items
      : []
  const normalizedJobs = jobs.map((job) => normalizeGenerationJob(job))
  return {
    projectId,
    count: normalizedJobs.length,
    jobs: normalizedJobs,
    active: normalizedJobs.filter((item) => !isTerminalGenerationStatus(stringValue(item.status) ?? 'unknown')).length,
  }
}

async function cancelGenerationJob(args: Record<string, unknown>): Promise<unknown> {
  const jobId = getRequiredNumber(args, 'jobId')
  const rawJob = await backendPost(`/jobs/${jobId}/cancel`, {})
  const normalized = normalizeGenerationJob(rawJob)
  const status = stringValue(normalized.status) ?? 'unknown'
  return {
    ...normalized,
    jobId,
    terminal: isTerminalGenerationStatus(status),
    message: `生成任务 Job #${jobId} 已请求取消，当前状态：${status}。`,
  }
}

export async function applyDraftReview(args: Record<string, unknown>): Promise<unknown> {
  const review = getReviewParam(args)
  const request = buildApplyRequest(review)
  const response = request.method === 'PATCH'
    ? await backendPatch(request.path, request.payload, args.userId)
    : await backendPost(request.path, request.payload, args.userId)
  return {
    performed: true,
    method: request.method,
    url: `${apiBaseURL}${request.path}`,
    payload: request.payload,
    response,
  }
}

async function previewApplyDraftReview(args: Record<string, unknown>): Promise<unknown> {
  const review = getReviewParam(args)
  const request = buildApplyRequest(review)
  if (!isProjectProposalTarget(review) && !isProductionProposalTarget(review)) {
    return {
      performed: false,
      skippedReason: 'backend apply preview is only implemented for proposal drafts',
    }
  }
  const path = request.path.replace(/\/apply$/, '/apply-preview')
  const response = await backendPost(path, request.payload, args.userId)
  return {
    performed: true,
    method: request.method,
    url: `${apiBaseURL}${path}`,
    payload: request.payload,
    response,
  }
}

async function createScriptBackend(args: Record<string, unknown>): Promise<unknown> {
  const projectId = getRequiredNumber(args, 'projectId')
  const payload = getObjectParamValue(args, 'payload')
  const path = `/projects/${encodeURIComponent(String(projectId))}/scripts`
  const response = await backendPost(path, payload, args.userId)
  return {
    performed: true,
    method: 'POST',
    url: `${apiBaseURL}${path}`,
    payload,
    response,
  }
}

function getReviewParam(args: Record<string, unknown>): Record<string, unknown> {
  return getObjectParamValue(args, 'review')
}

function buildApplyRequest(review: Record<string, unknown>): { method: 'PATCH' | 'POST'; path: string; payload: Record<string, unknown> } {
  if (isProjectProposalTarget(review)) {
    return buildProjectProposalRequest(review)
  }
  if (isProductionProposalTarget(review)) {
    return buildProductionProposalRequest(review)
  }
  const target = getObjectValue(review.target, 'target')
  const entityType = stringValue(target.entityType)
  const entityId = target.entityId
  const field = stringValue(target.field)
  if (!entityType || !(entityType in PATCH_ROUTES)) {
    throw new Error(`apply_draft does not support target entity type: ${entityType ?? 'unknown'}`)
  }
  if (entityId === undefined || entityId === null || String(entityId).trim() === '') {
    throw new Error('apply_draft requires target entity id')
  }
  const route = PATCH_ROUTES[entityType]
  const projectId = target.projectId
  if (route.includes(':projectId') && (projectId === undefined || projectId === null || String(projectId).trim() === '')) {
    throw new Error(`apply_draft requires projectId for target entity type: ${entityType}`)
  }
  if (!field || !FIELD_ALLOWLIST[entityType]?.has(field)) {
    throw new Error(`apply_draft cannot write field ${field ?? 'unknown'} on ${entityType}`)
  }
  return {
    method: 'PATCH',
    path: route
      .replace(':projectId', encodeURIComponent(String(projectId)))
      .replace(':id', encodeURIComponent(String(entityId))),
    payload: {
      [field]: toMCPJSONValue(review.proposedValue),
    } as Record<string, unknown>,
  }
}

function buildProjectProposalRequest(review: Record<string, unknown>): { method: 'POST'; path: string; payload: Record<string, unknown> } {
  const projectId = resolveProjectId(review)
  return {
    method: 'POST',
    path: `/projects/${encodeURIComponent(String(projectId))}/entities/project-proposals/apply`,
    payload: normalizeProjectProposalPayloadForKind(review.proposedValue, stringValue(review.draftKind) as AgentDraftKind),
  }
}

function isProjectProposalTarget(review: Record<string, unknown>): boolean {
  const target = isRecord(review.target) ? review.target : {}
  return target.entityType === 'project' && target.field === 'proposal'
}

function buildProductionProposalRequest(review: Record<string, unknown>): { method: 'POST'; path: string; payload: Record<string, unknown> } {
  const projectId = resolveProjectId(review)
  const target = getObjectValue(review.target, 'target')
  return {
    method: 'POST',
    path: `/projects/${encodeURIComponent(String(projectId))}/entities/production-proposals/apply`,
    payload: normalizeProductionProposalPayload(review.proposedValue, target.entityId),
  }
}

function isProductionProposalTarget(review: Record<string, unknown>): boolean {
  const target = isRecord(review.target) ? review.target : {}
  return review.draftKind === 'production_proposal' || target.entityType === 'production'
}

function resolveProjectId(review: Record<string, unknown>): string | number {
  const target = getObjectValue(review.target, 'target')
  const candidate = target.projectId ?? (isProjectProposalTarget(review) ? target.entityId : undefined)
  if ((typeof candidate !== 'string' && typeof candidate !== 'number') || String(candidate).trim() === '') {
    throw new Error('apply_draft requires projectId for proposal apply')
  }
  return candidate
}

function normalizeProjectProposalPayload(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (isRecord(parsed)) return parsed
    } catch {
      // handled below
    }
    throw new Error('project proposal draft content must be a JSON object')
  }
  if (!isRecord(value)) {
    throw new Error('project proposal draft content must be a JSON object')
  }
  return value
}

function normalizeProjectProposalPayloadForKind(value: unknown, kind: AgentDraftKind): Record<string, unknown> {
  const payload = normalizeProjectProposalPayload(value)
  const effectiveKind = inferProjectProposalDraftKind(payload, kind)
  const proposal = isRecord(payload.proposal) ? payload.proposal : {}
  if (effectiveKind === 'setting_proposal' || effectiveKind === 'asset_proposal') {
    return {
      ...payload,
      mode: 'snapshot',
      proposal: {
        ...proposal,
        creative_references: effectiveKind === 'setting_proposal' ? normalizeProjectProposalSnapshotNodes(proposal.creative_references) : [],
        asset_slots: effectiveKind === 'asset_proposal' ? normalizeProjectProposalSnapshotNodes(proposal.asset_slots) : [],
      },
    }
  }
  if (effectiveKind !== 'project_proposal') return payload
  return {
    ...payload,
    mode: 'snapshot',
    proposal: {
      ...proposal,
      project_style: isRecord(proposal.project_style) ? proposal.project_style : {},
      creative_references: [],
      asset_slots: [],
    },
  }
}

function inferProjectProposalDraftKind(payload: Record<string, unknown>, kind: AgentDraftKind): AgentDraftKind {
  if (kind === 'setting_proposal' || kind === 'asset_proposal' || kind === 'project_proposal') return kind
  const schema = typeof payload.schema === 'string' ? payload.schema : ''
  if (schema === 'movscript.setting_proposal.v1') return 'setting_proposal'
  if (schema === 'movscript.asset_proposal.v1') return 'asset_proposal'
  if (schema === 'movscript.project_proposal.v1') return 'project_proposal'
  const scope = typeof payload.scope === 'string' ? payload.scope : ''
  if (scope === 'setting_proposal' || scope === 'asset_proposal' || scope === 'project_proposal') return scope
  return kind
}

function normalizeProjectProposalSnapshotNodes(value: unknown): unknown[] {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => {
    if (isRecord(item) && item.fields !== undefined) {
      throw new Error(`project proposal snapshot node ${index} uses deprecated fields wrapper; put editable values directly on the node`)
    }
    return item
  })
}

function normalizeProductionProposalPayload(value: unknown, fallbackProductionId: unknown): Record<string, unknown> {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new Error('production proposal draft content must be a JSON object')
    }
  }
  if (!isRecord(parsed)) {
    throw new Error('production proposal draft content must be a JSON object')
  }
  const productionId = parsed.production_id ?? parsed.productionId ?? fallbackProductionId
  if ((typeof productionId !== 'string' && typeof productionId !== 'number') || String(productionId).trim() === '') {
    throw new Error('production proposal draft content requires productionId')
  }
  if (!isRecord(parsed.proposal)) {
    throw new Error('production proposal draft content requires proposal')
  }
  if (parsed.mode !== 'snapshot') {
    throw new Error('production proposal draft content requires mode "snapshot"')
  }
  if (containsActionField(parsed.proposal)) {
    throw new Error('production proposal snapshot must not include action fields')
  }
  return {
    ...parsed,
    production_id: productionId,
    proposal_scope: parsed.proposal_scope ?? parsed.proposalScope ?? 'production',
  }
}

function containsActionField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsActionField)
  if (!isRecord(value)) return false
  if (Object.prototype.hasOwnProperty.call(value, 'action')) return true
  return Object.values(value).some(containsActionField)
}

function inferGenerationJobType(args: Record<string, unknown>, inputResourceIds: number[]): string {
  const explicit = getOptionalString(args, 'job_type') ?? getOptionalString(args, 'jobType')
  if (explicit && isGenerationJobType(explicit)) return explicit
  if (explicit) throw new Error(`unsupported job_type: ${explicit}`)

  const outputType = getOptionalString(args, 'output_type') ?? getOptionalString(args, 'outputType') ?? 'image'
  if (outputType === 'image') return inputResourceIds.length > 0 ? 'image_edit' : 'image'
  if (outputType === 'video') {
    const referenceKind = getOptionalString(args, 'reference_type') ?? getOptionalString(args, 'referenceType')
    if (referenceKind === 'video') return 'video_v2v'
    if (inputResourceIds.length > 0) return 'video_i2v'
    return 'video'
  }
  if (isGenerationJobType(outputType)) return outputType
  throw new Error(`unsupported output_type: ${outputType}`)
}

function isGenerationJobType(value: string): boolean {
  return value === 'image'
    || value === 'image_edit'
    || value === 'video'
    || value === 'video_i2v'
    || value === 'video_v2v'
}

function numericModelField(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key]
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function stringModelField(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function integerModelField(source: Record<string, unknown>, key: string, min: number, fallback: number): number {
  const value = source[key]
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isInteger(parsed) || parsed < min) return fallback
  return parsed
}

function stringArrayModelField(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.flatMap((item) => (
    typeof item === 'string' && item.trim() ? [item.trim()] : []
  ))))
}

async function pickGenerationModelConfigId(jobType: string): Promise<number> {
  const capabilityCandidates = modelCapabilityCandidates(jobType)
  for (const capability of capabilityCandidates) {
    const models = await backendList(`/models?capability=${encodeURIComponent(capability)}`)
    const model = models.find((item) => Number.isFinite(Number(item?.id ?? item?.ID)))
    const id = Number(model?.id ?? model?.ID)
    if (Number.isFinite(id) && id > 0) return id
  }
  throw new Error(`没有可用的 ${jobType} 模型配置，请先在管理后台配置可用模型`)
}

async function resolveGenerationModelRouteForMcp(jobType: string, requestedModelId?: string, legacyModelConfigId?: number): Promise<{ modelId?: string, modelConfigId: number }> {
  if (requestedModelId) {
    return {
      modelId: requestedModelId,
      modelConfigId: await findGenerationModelConfigIdByModelId(jobType, requestedModelId) ?? legacyModelConfigId ?? 0,
    }
  }
  if (legacyModelConfigId) {
    return {
      modelId: await findGenerationModelIdByConfigId(jobType, legacyModelConfigId),
      modelConfigId: legacyModelConfigId,
    }
  }
  return pickGenerationModelRoute(jobType)
}

async function pickGenerationModelRoute(jobType: string): Promise<{ modelId?: string, modelConfigId: number }> {
  const capabilityCandidates = modelCapabilityCandidates(jobType)
  for (const capability of capabilityCandidates) {
    const models = await backendList(`/models?capability=${encodeURIComponent(capability)}`)
    const model = models.find((item) => Number.isFinite(Number(item?.id ?? item?.ID)))
    const id = Number(model?.id ?? model?.ID)
    if (Number.isFinite(id) && id > 0) {
      return { modelId: modelIDFromModel(model), modelConfigId: id }
    }
  }
  throw new Error(`没有可用的 ${jobType} 模型配置，请先在管理后台配置可用模型`)
}

async function findGenerationModelConfigIdByModelId(jobType: string, modelId: string): Promise<number | undefined> {
  for (const capability of modelCapabilityCandidates(jobType)) {
    const models = await backendList(`/models?capability=${encodeURIComponent(capability)}`)
    const model = models.find((item) => modelIDFromModel(item) === modelId || item?.logical_model_id === modelId || item?.model_def_id === modelId)
    const id = Number(model?.id ?? model?.ID)
    if (Number.isFinite(id) && id > 0) return id
  }
  return undefined
}

async function findGenerationModelIdByConfigId(jobType: string, modelConfigId: number): Promise<string | undefined> {
  for (const capability of modelCapabilityCandidates(jobType)) {
    const models = await backendList(`/models?capability=${encodeURIComponent(capability)}`)
    const model = models.find((item) => Number(item?.id ?? item?.ID) === modelConfigId)
    const modelId = modelIDFromModel(model)
    if (modelId) return modelId
  }
  return undefined
}

function modelIDFromModel(model: unknown): string | undefined {
  if (!isRecord(model)) return undefined
  return stringModelField(model, 'model_id') ?? stringModelField(model, 'logical_model_id') ?? stringModelField(model, 'model_def_id')
}

function modelCapabilityCandidates(jobType: string): string[] {
  switch (jobType) {
    case 'image_edit':
      return ['image_edit', 'image']
    case 'video_i2v':
      return ['video_i2v', 'video']
    case 'video_v2v':
      return ['video_v2v', 'video']
    default:
      return [jobType]
  }
}

interface GenerationModelParamContract {
  supportedParamKeys: Set<string>
  supportedParams: Map<string, GenerationModelParam>
  rules: GenerationModelParamRules
  inputRequirements: GenerationInputRequirements
  paramsSchemaLoaded: boolean
  paramsSchemaRuleCount?: number
}

type GenerationInputKind = 'image' | 'video'

interface GenerationInputRequirement {
  min: number
  max: number
}

interface GenerationInputRequirements {
  image: GenerationInputRequirement
  video: GenerationInputRequirement
}

interface GenerationModelParam {
  key: string
  type?: string
  options?: string[]
  enum?: Array<string | number | boolean>
  min?: number
  max?: number
  step?: number
}

interface GenerationModelParamRules {
  conflicts: Array<{ key: string, other: string }>
  conditionalEnums: Array<{ key: string, whenParam: string, whenValue: string | number | boolean, options: string[] }>
  conditionalConsts: Array<{ key: string, whenParam: string, whenValue: string | number | boolean, value: string | number | boolean }>
  requiresValues: Array<{ key: string, param: string, value: string | number | boolean }>
}

async function getGenerationModelParamContract(modelConfigId: number, jobType: string): Promise<GenerationModelParamContract | undefined> {
  for (const capability of modelCapabilityCandidates(jobType)) {
    const models = await backendList(`/models?capability=${encodeURIComponent(capability)}`)
    const model = models.find((item) => Number(item?.id ?? item?.ID) === modelConfigId)
    if (!model) continue
    const schema = isRecord(model.params_schema) ? model.params_schema : undefined
    const params = Array.isArray(model.supported_params) ? model.supported_params : undefined
    const supportedParamKeys = new Set<string>(
      params
        ? params.flatMap((param: unknown) => {
            if (!isRecord(param) || typeof param.key !== 'string' || !param.key.trim()) return []
            return [param.key.trim()]
          })
        : Object.keys(isRecord(schema?.properties) ? schema.properties : {}),
    )
    return {
      supportedParamKeys,
      supportedParams: buildGenerationModelParams(params, schema),
      rules: buildGenerationModelParamRules(params),
      inputRequirements: normalizeGenerationInputRequirements(model.input_requirements),
      paramsSchemaLoaded: !!schema,
      ...(Array.isArray(schema?.allOf) ? { paramsSchemaRuleCount: schema.allOf.length } : {}),
    }
  }
  return undefined
}

function buildGenerationModelParams(params: unknown[] | undefined, schema: Record<string, unknown> | undefined): Map<string, GenerationModelParam> {
  const out = new Map<string, GenerationModelParam>()
  const properties = isRecord(schema?.properties) ? schema.properties : {}
  if (params) {
    for (const param of params) {
      const item = compactGenerationModelParam(param)
      if (!item) continue
      mergeSchemaPropertyIntoModelParam(item, properties[item.key])
      out.set(item.key, item)
    }
  }
  for (const [key, property] of Object.entries(properties)) {
    if (out.has(key)) continue
    const item: GenerationModelParam = { key }
    mergeSchemaPropertyIntoModelParam(item, property)
    out.set(key, item)
  }
  return out
}

function compactGenerationModelParam(param: unknown): GenerationModelParam | undefined {
  if (!isRecord(param) || typeof param.key !== 'string' || !param.key.trim()) return undefined
  const out: GenerationModelParam = { key: param.key.trim() }
  if (typeof param.type === 'string' && param.type.trim()) out.type = param.type.trim()
  if (Array.isArray(param.options)) {
    const options = stringArrayModelField(param.options)
    if (options.length > 0) out.options = options
  }
  copyFiniteNumber(out as unknown as Record<string, unknown>, param, 'min')
  copyFiniteNumber(out as unknown as Record<string, unknown>, param, 'max')
  copyFiniteNumber(out as unknown as Record<string, unknown>, param, 'step')
  return out
}

// Exported for MCP contract tests; runtime uses this to normalize compact v1 rules for non-blocking preflight audits.
export function buildGenerationModelParamRules(params: unknown[] | undefined): GenerationModelParamRules {
  const rules: GenerationModelParamRules = { conflicts: [], conditionalEnums: [], conditionalConsts: [], requiresValues: [] }
  const conflictPairs = new Set<string>()
  for (const param of params ?? []) {
    if (!isRecord(param) || typeof param.key !== 'string' || !param.key.trim()) continue
    const key = param.key.trim()
    if (Array.isArray(param.conflicts_with)) {
      for (const other of param.conflicts_with) {
        if (typeof other !== 'string' || !other.trim()) continue
        const otherKey = other.trim()
        const pairKey = [key, otherKey].sort().join('\u0000')
        if (conflictPairs.has(pairKey)) continue
        conflictPairs.add(pairKey)
        rules.conflicts.push({ key, other: otherKey })
      }
    }
    if (Array.isArray(param.conditional_enum)) {
      for (const item of param.conditional_enum) {
        if (!isRecord(item) || typeof item.when_param !== 'string' || !item.when_param.trim() || !isJSONScalar(item.when_value)) continue
        const options = Array.isArray(item.options) ? item.options.filter((option): option is string => typeof option === 'string' && option.trim().length > 0) : []
        if (options.length > 0) rules.conditionalEnums.push({ key, whenParam: item.when_param.trim(), whenValue: item.when_value, options })
      }
    }
    if (Array.isArray(param.conditional_const)) {
      for (const item of param.conditional_const) {
        if (!isRecord(item) || typeof item.when_param !== 'string' || !item.when_param.trim() || !isJSONScalar(item.when_value) || !isJSONScalar(item.value)) continue
        rules.conditionalConsts.push({ key, whenParam: item.when_param.trim(), whenValue: item.when_value, value: item.value })
      }
    }
    if (Array.isArray(param.requires_value)) {
      for (const item of param.requires_value) {
        if (!isRecord(item) || typeof item.param !== 'string' || !item.param.trim() || !isJSONScalar(item.value)) continue
        rules.requiresValues.push({ key, param: item.param.trim(), value: item.value })
      }
    }
  }
  return rules
}

function mergeSchemaPropertyIntoModelParam(out: GenerationModelParam, property: unknown): void {
  if (!isRecord(property)) return
  if (typeof property.type === 'string' && !out.type) out.type = property.type
  if (Array.isArray(property.enum)) {
    const values = property.enum.filter(isJSONScalar)
    if (values.length > 0) {
      if (values.every((value) => typeof value === 'string')) out.options = values
      else out.enum = values
    }
  }
  copyFiniteNumber(out as unknown as Record<string, unknown>, property, 'minimum', 'min')
  copyFiniteNumber(out as unknown as Record<string, unknown>, property, 'maximum', 'max')
  copyFiniteNumber(out as unknown as Record<string, unknown>, property, 'multipleOf', 'step')
}

interface GenerationExtraParamAudit {
  extraParams?: string
  providedKeys: string[]
  submittedKeys: string[]
  droppedKeys: string[]
  submittedParams?: Record<string, unknown>
  dropReasons?: Record<string, string>
  renamedKeys?: Record<string, string>
  parseError?: string
}

export function normalizeGenerationExtraParams(value: unknown, supportedParamKeys?: Set<string>): GenerationExtraParamAudit {
  if (value === undefined || value === null) {
    return { providedKeys: [], submittedKeys: [], droppedKeys: [] }
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return { providedKeys: [], submittedKeys: [], droppedKeys: [] }
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (isRecord(parsed)) return normalizeGenerationExtraParams(parsed, supportedParamKeys)
    } catch (error) {
      return {
        extraParams: trimmed,
        providedKeys: [],
        submittedKeys: [],
        droppedKeys: [],
        parseError: error instanceof Error ? error.message : String(error),
      }
    }
    return {
      extraParams: trimmed,
      providedKeys: [],
      submittedKeys: [],
      droppedKeys: [],
    }
  }
  if (isRecord(value)) {
    const providedKeys = Object.keys(value)
    const params: Record<string, unknown> = {}
    const droppedKeys: string[] = []
    const renamedKeys: Record<string, string> = {}
    for (const [key, paramValue] of Object.entries(value)) {
      const canonicalKey = canonicalGenerationParamKey(key)
      if (supportedParamKeys && !supportedParamKeys.has(canonicalKey)) {
        droppedKeys.push(key)
        continue
      }
      if (canonicalKey !== key) renamedKeys[key] = canonicalKey
      if (params[canonicalKey] === undefined || key === canonicalKey) {
        params[canonicalKey] = paramValue
      }
    }
    const submittedKeys = Object.keys(params)
    return {
      extraParams: submittedKeys.length > 0 ? JSON.stringify(params) : undefined,
      providedKeys,
      submittedKeys,
      droppedKeys,
      ...(submittedKeys.length > 0 ? { submittedParams: params } : {}),
      ...(droppedKeys.length > 0 ? { dropReasons: Object.fromEntries(droppedKeys.map((key) => [key, 'unsupported_extra_param'])) } : {}),
      ...(Object.keys(renamedKeys).length > 0 ? { renamedKeys } : {}),
    }
  }
  return { providedKeys: [], submittedKeys: [], droppedKeys: [] }
}

function canonicalGenerationParamKey(key: string): string {
  switch (key) {
    case 'ratio':
      return 'aspect_ratio'
    case 'duration_seconds':
      return 'duration'
    case 'size':
      return 'image_size'
    case 'guidance_scale':
      return 'prompt_strength'
    case 'max_images':
      return 'image_count'
    case 'camera_fixed':
      return 'fixed_camera'
    case 'generate_audio':
      return 'audio'
    default:
      return key
  }
}

export function buildGenerationParamValidationAudit(
  modelConfigId: number,
  modelParamContract: GenerationModelParamContract | undefined,
  extraParamAudit: GenerationExtraParamAudit,
  options: {
    aspectRatioRequested?: string
    aspectRatioSubmitted?: string
    preflightErrors?: GenerationParamPreflightError[]
    submittedInputs?: Record<GenerationInputKind, number>
    inputPreflightErrors?: GenerationInputPreflightError[]
  },
): Record<string, unknown> {
  const supportedParamKeys = modelParamContract?.supportedParamKeys
  const droppedTopLevelParams: string[] = []
  if (options.aspectRatioRequested && !options.aspectRatioSubmitted) {
    droppedTopLevelParams.push('aspect_ratio')
  }
  const dropReasons: Record<string, string> = {}
  for (const key of extraParamAudit.droppedKeys) {
    dropReasons[key] = extraParamAudit.dropReasons?.[key] ?? 'unsupported_extra_param'
  }
  for (const key of droppedTopLevelParams) {
    dropReasons[key] = 'unsupported_top_level_param'
  }
  if (extraParamAudit.parseError) {
    dropReasons.extra_params = 'parse_error'
  }
  return {
    audit_version: 1,
    model_config_id: modelConfigId,
    model_contract_loaded: modelParamContract !== undefined,
    params_schema_loaded: modelParamContract?.paramsSchemaLoaded === true,
    ...(modelParamContract?.paramsSchemaRuleCount !== undefined ? { params_schema_rule_count: modelParamContract.paramsSchemaRuleCount } : {}),
    ...(modelParamContract ? { input_requirements: modelParamContract.inputRequirements } : {}),
    ...(options.submittedInputs ? { submitted_inputs: options.submittedInputs } : {}),
    ...(supportedParamKeys ? { supported_params: Array.from(supportedParamKeys).sort() } : {}),
    submitted_extra_params: extraParamAudit.submittedKeys.sort(),
    ...(extraParamAudit.providedKeys.length > 0 ? { provided_extra_params: extraParamAudit.providedKeys.sort() } : {}),
    ...(extraParamAudit.droppedKeys.length > 0 ? { dropped_extra_params: extraParamAudit.droppedKeys.sort() } : {}),
    ...(droppedTopLevelParams.length > 0 ? { dropped_top_level_params: droppedTopLevelParams } : {}),
    ...(Object.keys(dropReasons).length > 0 ? { drop_reasons: dropReasons } : {}),
    ...(extraParamAudit.renamedKeys && Object.keys(extraParamAudit.renamedKeys).length > 0 ? { renamed_extra_params: extraParamAudit.renamedKeys } : {}),
    ...(extraParamAudit.parseError ? { extra_params_parse_error: extraParamAudit.parseError } : {}),
    ...(options.preflightErrors && options.preflightErrors.length > 0 ? { preflight_errors: options.preflightErrors } : {}),
    ...(options.inputPreflightErrors && options.inputPreflightErrors.length > 0 ? { input_preflight_errors: options.inputPreflightErrors } : {}),
  }
}

type GenerationParamPreflightError = {
  code: string
  field: string
  message: string
  allowed_values?: Array<string | number | boolean>
  suggested_fix?: Record<string, string | number | boolean | null>
}

type GenerationInputPreflightError = {
  code: 'INVALID_INPUT_COUNT'
  field: GenerationInputKind
  message: string
  required_min: number
  allowed_max: number
  actual_count: number
}

function normalizeGenerationInputRequirements(value: unknown): GenerationInputRequirements {
  const source = isRecord(value) ? value : {}
  return {
    image: normalizeGenerationInputRequirement(source.image),
    video: normalizeGenerationInputRequirement(source.video),
  }
}

function normalizeGenerationInputRequirement(value: unknown): GenerationInputRequirement {
  const source = isRecord(value) ? value : {}
  const min = integerModelField(source, 'min', 0, 0)
  const max = integerModelField(source, 'max', -1, 0)
  if (max !== -1 && min > max) return { min: 0, max: 0 }
  return { min, max }
}

function buildSubmittedGenerationInputs(jobType: string, inputCount: number): Record<GenerationInputKind, number> {
  return {
    image: generationInputKindForJobType(jobType) === 'image' ? inputCount : 0,
    video: generationInputKindForJobType(jobType) === 'video' ? inputCount : 0,
  }
}

function preflightGenerationInputs(jobType: string, inputCount: number, modelParamContract: GenerationModelParamContract | undefined): GenerationInputPreflightError[] {
  if (!modelParamContract) return []
  const kind = generationInputKindForJobType(jobType)
  if (!kind) return []
  const requirement = modelParamContract.inputRequirements[kind]
  const errors: GenerationInputPreflightError[] = []
  if (inputCount < requirement.min) {
    errors.push({
      code: 'INVALID_INPUT_COUNT',
      field: kind,
      message: `${kind} generation input count is below the local model contract minimum`,
      required_min: requirement.min,
      allowed_max: requirement.max,
      actual_count: inputCount,
    })
  }
  if (requirement.max !== -1 && inputCount > requirement.max) {
    errors.push({
      code: 'INVALID_INPUT_COUNT',
      field: kind,
      message: `${kind} generation input count is above the local model contract maximum`,
      required_min: requirement.min,
      allowed_max: requirement.max,
      actual_count: inputCount,
    })
  }
  return errors
}

function generationInputKindForJobType(jobType: string): GenerationInputKind | undefined {
  if (jobType === 'image_edit' || jobType === 'video_i2v') return 'image'
  if (jobType === 'video_v2v') return 'video'
  return undefined
}

export function preflightGenerationParams(params: Record<string, unknown>, modelParamContract: GenerationModelParamContract | undefined): GenerationParamPreflightError[] {
  if (!modelParamContract || Object.keys(params).length === 0) return []
  const errors: GenerationParamPreflightError[] = []
  for (const [key, value] of Object.entries(params)) {
    const param = modelParamContract.supportedParams.get(key)
    if (!param) continue
    const enumValues = param.enum ?? param.options
    if (enumValues && enumValues.length > 0 && !enumValues.some((item) => scalarValuesEqual(item, value))) {
      errors.push({
        code: 'INVALID_PARAMETER_OPTION',
        field: key,
        message: `parameter "${key}" is not in the local model contract options`,
        allowed_values: enumValues,
        suggested_fix: { [key]: enumValues[0] },
      })
      continue
    }
    if (param.type === 'number') {
      const number = numericParamValue(value)
      if (number === undefined) {
        errors.push({ code: 'INVALID_PARAMETER_TYPE', field: key, message: `parameter "${key}" should be a number` })
        continue
      }
      if (param.min !== undefined && number < param.min) {
        errors.push({ code: 'INVALID_PARAMETER_RANGE', field: key, message: `parameter "${key}" is below the local model contract minimum` })
      }
      if (param.max !== undefined && number > param.max) {
        errors.push({ code: 'INVALID_PARAMETER_RANGE', field: key, message: `parameter "${key}" is above the local model contract maximum` })
      }
    } else if ((param.type === 'select' || param.type === 'string') && typeof value !== 'string') {
      errors.push({ code: 'INVALID_PARAMETER_TYPE', field: key, message: `parameter "${key}" should be a string` })
    } else if (param.type === 'boolean' && typeof value !== 'boolean') {
      errors.push({ code: 'INVALID_PARAMETER_TYPE', field: key, message: `parameter "${key}" should be a boolean` })
    }
  }
  for (const rule of modelParamContract.rules.conflicts) {
    if (paramHasValue(params[rule.key]) && paramHasValue(params[rule.other])) {
      errors.push({
        code: 'INVALID_PARAMETER_COMBINATION',
        field: rule.key,
        message: `parameter "${rule.key}" conflicts with "${rule.other}" in the local model contract`,
        suggested_fix: { [rule.other]: null },
      })
    }
  }
  for (const rule of modelParamContract.rules.conditionalEnums) {
    if (!scalarValuesEqual(rule.whenValue, params[rule.whenParam])) continue
    const value = params[rule.key]
    if (!paramHasValue(value) || rule.options.some((option) => scalarValuesEqual(option, value))) continue
    errors.push({
      code: 'INVALID_PARAMETER_COMBINATION',
      field: rule.key,
      message: `parameter "${rule.key}" is not allowed for "${rule.whenParam}" in the local model contract`,
      allowed_values: rule.options,
      suggested_fix: { [rule.key]: rule.options[0] },
    })
  }
  for (const rule of modelParamContract.rules.conditionalConsts) {
    if (!scalarValuesEqual(rule.whenValue, params[rule.whenParam])) continue
    const value = params[rule.key]
    if (!paramHasValue(value) || scalarValuesEqual(rule.value, value)) continue
    errors.push({
      code: 'INVALID_PARAMETER_COMBINATION',
      field: rule.key,
      message: `parameter "${rule.key}" must match the required value for "${rule.whenParam}" in the local model contract`,
      allowed_values: [rule.value],
      suggested_fix: { [rule.key]: rule.value },
    })
  }
  for (const rule of modelParamContract.rules.requiresValues) {
    if (!paramHasValue(params[rule.key]) || scalarValuesEqual(rule.value, params[rule.param])) continue
    errors.push({
      code: 'INVALID_PARAMETER_COMBINATION',
      field: rule.key,
      message: `parameter "${rule.key}" requires "${rule.param}" in the local model contract`,
      allowed_values: [rule.value],
      suggested_fix: { [rule.param]: rule.value },
    })
  }
  return errors
}

function numericParamValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function scalarValuesEqual(expected: string | number | boolean, actual: unknown): boolean {
  if (typeof expected === 'number') return numericParamValue(actual) === expected
  return expected === actual
}

function paramHasValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false
  if (typeof value === 'boolean') return value
  const number = numericParamValue(value)
  return number === undefined || number !== 0
}

async function waitForGenerationJob(jobId: number, timeoutMs: number, pollIntervalMs: number): Promise<unknown> {
  const deadline = Date.now() + timeoutMs
  let latest: unknown
  while (Date.now() <= deadline) {
    latest = await backendGet(`/jobs/${jobId}`)
    const status = isRecord(latest) && typeof latest.status === 'string' ? latest.status : ''
    if (status === 'succeeded' || status === 'failed' || status === 'cancelled') return latest
    await sleep(pollIntervalMs)
  }
  throw new Error(`generation job ${jobId} did not finish within ${timeoutMs}ms`)
}

function getOptionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function getOptionalNumeric(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key]
  return numericValue(value)
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function getNumberArray(value: unknown): number[] {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []
  return rawItems
    .map((item) => typeof item === 'number' ? item : typeof item === 'string' ? Number(item) : NaN)
    .filter((item) => Number.isInteger(item) && item > 0)
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function backendGet(path: string): Promise<any> {
  const headers: Record<string, string> = {}
  if (contextAuthToken) headers.Authorization = `Bearer ${contextAuthToken}`

  const res = await fetch(`${apiBaseURL}${path}`, { headers })
  if (!res.ok) {
    throw await BackendHTTPError.fromResponse('GET', path, res)
  }
  return res.json()
}

async function backendPost(path: string, body: Record<string, unknown>, userId?: unknown): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (contextAuthToken) headers.Authorization = `Bearer ${contextAuthToken}`
  if (typeof userId === 'number' || typeof userId === 'string') headers['X-User-ID'] = String(userId)

  const res = await fetch(`${apiBaseURL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw await BackendHTTPError.fromResponse('POST', path, res)
  }
  return res.json()
}

async function backendPatch(path: string, body: Record<string, unknown>, userId?: unknown): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (contextAuthToken) headers.Authorization = `Bearer ${contextAuthToken}`
  if (typeof userId === 'number' || typeof userId === 'string') headers['X-User-ID'] = String(userId)

  const res = await fetch(`${apiBaseURL}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw await BackendHTTPError.fromResponse('PATCH', path, res)
  }
  const text = await res.text()
  return text.trim() ? JSON.parse(text) : null
}

class BackendHTTPError extends Error {
  constructor(
    public readonly method: string,
    public readonly path: string,
    public readonly status: number,
    public readonly body: unknown,
    rawBody: string,
  ) {
    super(`Backend ${method} ${path} failed: HTTP ${status} ${backendErrorMessage(body, rawBody)}`)
    this.name = 'BackendHTTPError'
  }

  static async fromResponse(method: string, path: string, res: Response): Promise<BackendHTTPError> {
    const rawBody = await res.text()
    return new BackendHTTPError(method, path, res.status, parseJSONBody(rawBody), rawBody)
  }

  toJSON(): Record<string, unknown> {
    return normalizeBackendHTTPErrorForMCP(this.method, this.path, this.status, this.body)
  }
}

export function normalizeBackendHTTPErrorForMCP(method: string, path: string, status: number, body: unknown): Record<string, unknown> {
  const bodyRecord = isRecord(body) ? body : undefined
  return {
    type: 'backend_http_error',
    method,
    path,
    status,
    ...(bodyRecord ? { body: bodyRecord } : {}),
    ...(bodyRecord && typeof bodyRecord.code === 'string' ? { code: bodyRecord.code } : {}),
    ...(bodyRecord && typeof bodyRecord.field === 'string' ? { field: bodyRecord.field } : {}),
    ...(bodyRecord && Array.isArray(bodyRecord.allowed_values) ? { allowed_values: bodyRecord.allowed_values } : {}),
    ...(bodyRecord && isRecord(bodyRecord.suggested_fix) ? { suggested_fix: bodyRecord.suggested_fix } : {}),
    ...(bodyRecord && Number.isInteger(bodyRecord.required_min) ? { required_min: bodyRecord.required_min } : {}),
    ...(bodyRecord && Number.isInteger(bodyRecord.allowed_max) ? { allowed_max: bodyRecord.allowed_max } : {}),
    ...(bodyRecord && Number.isInteger(bodyRecord.actual_count) ? { actual_count: bodyRecord.actual_count } : {}),
    ...(bodyRecord && isRecord(bodyRecord.details) ? { details: bodyRecord.details } : {}),
  }
}

function parseJSONBody(rawBody: string): unknown {
  if (!rawBody.trim()) return undefined
  try {
    return JSON.parse(rawBody)
  } catch {
    return rawBody
  }
}

function backendErrorMessage(body: unknown, rawBody: string): string {
  if (isRecord(body) && typeof body.error === 'string') return body.error
  return rawBody
}

function errorData(error: unknown): unknown {
  if (error instanceof BackendHTTPError) return error.toJSON()
  return undefined
}

function normalizeAPIBaseURL(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`
}

function summarizeResource(data: unknown): unknown {
  if (!Array.isArray(data)) return data
  return data.map(summarizeEntity)
}

function summarizeProject(item: any): unknown {
  if (!item || typeof item !== 'object') return item
  const id = typeof item.id === 'number' ? item.id : typeof item.ID === 'number' ? item.ID : undefined
  return {
    ...(id !== undefined ? { id } : {}),
    ...(typeof item.name === 'string' ? { name: truncateLongText(item.name) } : {}),
    ...(typeof item.description === 'string' ? { description: truncateLongText(item.description) } : {}),
    ...(typeof item.status === 'string' ? { status: item.status } : {}),
    ...(typeof item.total_episodes === 'number' ? { totalEpisodes: item.total_episodes } : typeof item.totalEpisodes === 'number' ? { totalEpisodes: item.totalEpisodes } : {}),
    ...(typeof item.CreatedAt === 'string' ? { CreatedAt: item.CreatedAt } : {}),
    ...(typeof item.UpdatedAt === 'string' ? { UpdatedAt: item.UpdatedAt } : {}),
  }
}

function summarizeScript(item: any, options: { includeContent: boolean; contentLimit: number }): unknown {
  if (!item || typeof item !== 'object') return item
  const body = String(item.content || item.raw_source || '')
  const summary: Record<string, unknown> = {}
  for (const key of [
    'ID',
    'id',
    'project_id',
    'parent_script_id',
    'episode_id',
    'title',
    'script_type',
    'source_type',
    'version',
    'order',
    'status',
    'summary',
    'description',
    'characters',
    'core_settings',
    'hook',
    'plot_summary',
    'script_points',
    'planned_scene_count',
    'planned_character_count',
    'time_text',
    'location_text',
    'structured_characters',
    'plot_beats',
    'atmosphere',
    'CreatedAt',
    'UpdatedAt',
  ]) {
    if (item[key] !== undefined) summary[key] = truncateLongText(item[key])
  }
  summary.body_length = body.length
  if (options.includeContent) {
    summary.content = body.length > options.contentLimit ? `${body.slice(0, options.contentLimit)}...` : body
    summary.content_truncated = body.length > options.contentLimit
  }
  return summary
}

function summarizeProjectScripts(items: unknown[]): unknown[] {
  return items.map((item) => summarizeScript(item, { includeContent: false, contentLimit: 0 }))
}

function summarizeCreativeReference(item: any): unknown {
  return summarizePickedFields(item, [
    'ID',
    'id',
    'project_id',
    'kind',
    'name',
    'alias',
    'description',
    'content',
    'importance',
    'status',
    'profile_json',
    'tags_json',
    'CreatedAt',
    'UpdatedAt',
  ])
}

function summarizeCreativeReferenceState(item: any): unknown {
  return summarizePickedFields(item, [
    'ID',
    'id',
    'project_id',
    'creative_reference_id',
    'scope_type',
    'scope_id',
    'name',
    'description',
    'visual_notes',
    'emotion',
    'costume',
    'props',
    'status',
    'tags_json',
    'metadata_json',
    'CreatedAt',
    'UpdatedAt',
  ])
}

function summarizeCreativeReferenceUsage(item: any): unknown {
  return summarizePickedFields(item, [
    'ID',
    'id',
    'project_id',
    'owner_type',
    'owner_id',
    'creative_reference_id',
    'creative_reference_state_id',
    'role',
    'order',
    'evidence',
    'source',
    'status',
    'metadata_json',
    'CreatedAt',
    'UpdatedAt',
  ])
}

function summarizeCreativeRelationship(item: any): unknown {
  return summarizePickedFields(item, [
    'ID',
    'id',
    'project_id',
    'source_creative_reference_id',
    'target_creative_reference_id',
    'scope_type',
    'scope_id',
    'category',
    'type',
    'label',
    'description',
    'source',
    'status',
    'evidence',
    'metadata_json',
    'CreatedAt',
    'UpdatedAt',
  ])
}

function summarizeAssetSlot(item: any): unknown {
  const summary = summarizePickedFields(item, [
    'ID',
    'id',
    'project_id',
    'production_id',
    'owner_type',
    'owner_id',
    'creative_reference_id',
    'creative_reference_state_id',
    'kind',
    'name',
    'slot_key',
    'description',
    'prompt_hint',
    'priority',
    'resource_id',
    'locked_asset_slot_id',
    'status',
    'metadata_json',
    'CreatedAt',
    'UpdatedAt',
  ])
  if (isRecord(summary) && isRecord(item?.Resource)) summary.resource = summarizeResourceRecord(item.Resource)
  if (isRecord(summary) && isRecord(item?.resource)) summary.resource = summarizeResourceRecord(item.resource)
  if (isRecord(summary) && isRecord(item?.LockedAssetSlot)) summary.locked_asset_slot = summarizeAssetSlot(item.LockedAssetSlot)
  if (isRecord(summary) && isRecord(item?.locked_asset_slot)) summary.locked_asset_slot = summarizeAssetSlot(item.locked_asset_slot)
  return summary
}

function summarizeAssetSlotCandidate(item: any): unknown {
  const summary = summarizePickedFields(item, [
    'ID',
    'id',
    'project_id',
    'asset_slot_id',
    'candidate_asset_slot_id',
    'resource_id',
    'source_type',
    'source_id',
    'score',
    'status',
    'note',
    'CreatedAt',
    'UpdatedAt',
  ])
  if (isRecord(summary) && isRecord(item?.CandidateAssetSlot)) summary.candidate_asset_slot = summarizeAssetSlot(item.CandidateAssetSlot)
  if (isRecord(summary) && isRecord(item?.candidate_asset_slot)) summary.candidate_asset_slot = summarizeAssetSlot(item.candidate_asset_slot)
  return summary
}

function summarizeProductionContextEntity(item: any): unknown {
  return summarizePickedFields(item, [
    'ID',
    'id',
    'project_id',
    'production_id',
    'segment_id',
    'scene_moment_id',
    'script_version_id',
    'text_block_id',
    'parent_block_id',
    'preview_timeline_id',
    'name',
    'title',
    'kind',
    'source_type',
    'order',
    'summary',
    'content',
    'description',
    'time_text',
    'location_text',
    'condition_text',
    'action_text',
    'mood',
    'prompt',
    'duration_sec',
    'resource_id',
    'canvas_id',
    'shot_size',
    'camera_angle',
    'camera_height',
    'camera_motion',
    'motion_intensity',
    'camera_speed',
    'lens',
    'focal_length',
    'focus_subject',
    'composition_start',
    'composition_end',
    'stabilization',
    'camera_notes',
    'status',
    'metadata_json',
    'CreatedAt',
    'UpdatedAt',
  ])
}

function summarizeResourceRecord(item: Record<string, unknown>): unknown {
  return summarizePickedFields(item, ['ID', 'id', 'name', 'filename', 'file_name', 'type', 'mime_type', 'url', 'URL', 'status', 'CreatedAt', 'UpdatedAt'])
}

function summarizePickedFields(item: any, fields: string[]): unknown {
  if (!item || typeof item !== 'object') return item
  const summary: Record<string, unknown> = {}
  for (const key of fields) {
    if (item[key] !== undefined) summary[key] = truncateLongText(item[key])
  }
  return summary
}

function summarizeScriptVersion(item: any): unknown {
  if (!item || typeof item !== 'object') return item
  const body = String(item.content || item.raw_source || '')
  const summary: Record<string, unknown> = {}
  for (const key of [
    'ID',
    'id',
    'project_id',
    'script_id',
    'parent_version_id',
    'version_number',
    'title',
    'source_type',
    'summary',
    'status',
    'CreatedAt',
    'UpdatedAt',
  ]) {
    if (item[key] !== undefined) summary[key] = truncateLongText(item[key])
  }
  summary.body_length = body.length
  return summary
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

function textOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function toolText(value: unknown): MCPJSONValue {
  return {
    content: [
      {
        type: 'text',
        text: renderMarkdown(value ?? null),
      },
    ],
    data: toMCPJSONValue(value ?? null),
  }
}

function renderMarkdown(value: unknown): string {
  if (value === null || value === undefined) return '无数据。'
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return renderMarkdownArray(value)

  if (isRecord(value) && Array.isArray(value.projects)) {
    const lines = ['## 项目列表']
    if (value.projects.length === 0) {
      lines.push('没有可见项目。')
    } else {
      lines.push(...value.projects.map((project, index) => formatProjectLine(project, index)))
    }
    if (typeof value.count === 'number') lines.push('', `共 ${value.count} 个项目。`)
    return lines.join('\n')
  }

  if (isRecord(value) && isRecord(value.snapshot)) {
    const lines = ['## 当前上下文']
    lines.push(renderMarkdownObject(value.snapshot))
    if (Array.isArray(value.projects)) {
      lines.push('', '## 项目列表')
      if (value.projects.length === 0) {
        lines.push(typeof value.projectsError === 'string' ? `项目列表不可用：${value.projectsError}` : '没有可见项目。')
      } else {
        lines.push(...value.projects.map((project, index) => formatProjectLine(project, index)))
      }
    }
    return lines.join('\n')
  }

  return renderMarkdownObject(value as Record<string, unknown>)
}

function renderMarkdownArray(items: unknown[]): string {
  if (items.length === 0) return '没有条目。'
  return items.map((item, index) => `${index + 1}. ${renderInlineMarkdownValue(item)}`).join('\n')
}

function renderMarkdownObject(value: Record<string, unknown>): string {
  const lines: string[] = []
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue
    if (Array.isArray(item)) {
      lines.push(`### ${key}`)
      lines.push(renderMarkdownArray(item))
    } else if (isRecord(item)) {
      lines.push(`### ${key}`)
      lines.push(renderMarkdownObject(item))
    } else {
      lines.push(`- ${key}: ${renderInlineMarkdownValue(item)}`)
    }
  }
  return lines.length > 0 ? lines.join('\n') : '无数据。'
}

function formatProjectLine(project: unknown, index: number): string {
  if (!isRecord(project)) return `${index + 1}. 项目${index + 1}的名字${String(project)}`
  const name = typeof project.name === 'string' && project.name.trim() ? project.name.trim() : `未命名项目 ${index + 1}`
  const details = [
    typeof project.description === 'string' && project.description.trim() ? project.description.trim() : undefined,
    typeof project.status === 'string' && project.status.trim() ? `状态：${project.status.trim()}` : undefined,
    typeof project.totalEpisodes === 'number' ? `集数：${project.totalEpisodes}` : undefined,
  ].filter(Boolean).join('；')
  const id = typeof project.id === 'number' ? `（project#${project.id}）` : ''
  return `${index + 1}. 项目${index + 1}的名字${name}${details ? `，${details}` : ''}${id}`
}

function renderInlineMarkdownValue(value: unknown): string {
  if (value === null || value === undefined) return '无'
  if (typeof value !== 'object') return String(value)
  if (Array.isArray(value)) return value.length === 0 ? '无' : value.map(renderInlineMarkdownValue).join('；')
  if (isRecord(value)) {
    return Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => `${key}=${renderInlineMarkdownValue(item)}`)
      .join('，')
  }
  return String(value)
}

function toMCPJSONValue(value: unknown): MCPJSONValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value as MCPJSONValue
  if (Array.isArray(value)) return value.map(toMCPJSONValue)
  if (!isRecord(value)) return String(value)
  const obj: Record<string, MCPJSONValue> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) obj[key] = toMCPJSONValue(item)
  }
  return obj
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
      ...(data === undefined ? {} : { data }),
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
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    Connection: 'close',
  })
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

function getObjectParamValue(args: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = args[key]
  if (!isRecord(value)) throw new Error(`${key} is required`)
  return value
}

function getObjectValue(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} is required`)
  return value
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

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
