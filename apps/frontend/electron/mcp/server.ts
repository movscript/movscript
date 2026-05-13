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
  storyboard_line: '/projects/:projectId/entities/storyboard-lines/:id',
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
  asset_slot: new Set(['name', 'kind', 'description', 'prompt_hint', 'priority', 'resource_id', 'locked_asset_slot_id', 'status', 'metadata_json']),
  segment: new Set(['title', 'kind', 'summary', 'content', 'production_id', 'text_block_id', 'status', 'metadata_json']),
  scene_moment: new Set(['title', 'description', 'time_text', 'location_text', 'condition_text', 'action_text', 'mood', 'status', 'metadata_json']),
  storyboard_script: new Set(['name', 'description', 'is_primary', 'status', 'metadata_json']),
  storyboard_line: new Set(['title', 'kind', 'description', 'dialogue', 'visual_intent', 'duration_sec', 'status', 'metadata_json']),
  content_unit: new Set(['title', 'kind', 'description', 'prompt', 'duration_sec', 'status', 'metadata_json']),
  keyframe: new Set(['title', 'description', 'prompt', 'resource_id', 'status', 'metadata_json']),
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
      description: 'List enabled AI models for a capability or feature. The result includes raw models plus model_contracts with contract_version 1, capabilities, input_requirements, supported_param_keys, supported_params, and params_schema rule counts so the agent can choose a valid model before generation. Models are contract-scoped: entries with the same logical_model_id can still expose different model_config_id values and different contracts.',
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
              required: ['contract_version', 'model_config_id', 'capabilities', 'input_requirements', 'supported_param_keys', 'supported_params'],
              properties: {
                contract_version: { type: 'number', const: 1 },
                id: { type: 'number' },
                model_config_id: { type: 'number', description: 'Exact ID to pass to movscript_create_generation_job.' },
                display_name: { type: 'string' },
                short_name: { type: 'string' },
                logical_model_id: { type: 'string', description: 'Grouping metadata only. Do not use this instead of model_config_id.' },
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
      description: 'Create and wait for an AI image or video generation job through the MovScript backend. Before choosing model_config_id, input_resource_ids, or extra_params, inspect movscript_list_models and obey the selected model capability contract: capabilities, input_requirements, supported_params, and params_schema. Returns the completed job, output_resource, and param_validation audit_version 1 data, including non-blocking preflight_errors and input_preflight_errors, for direct chat display. This is cost-bearing and should only run after explicit user approval.',
      inputSchema: objectSchema(
        {
          prompt: { type: 'string' },
          title: { type: 'string', description: 'Optional display title for the generation job.' },
          output_type: { type: 'string', enum: ['image', 'video'], description: 'High-level output type. Ignored when job_type is provided.' },
          job_type: { type: 'string', enum: ['image', 'image_edit', 'video', 'video_i2v', 'video_v2v'] },
          model_config_id: { type: ['number', 'string'], description: 'Optional AIModelConfig ID. If omitted, MovScript chooses the first available model for the requested capability.' },
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
    case 'movscript_create_project':
      return toolText(await createProject(args))
    case 'movscript_list_models':
      return toolText(await listModels(args))
    case 'movscript_create_generation_job':
      return toolText(await createGenerationJob(args))
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
  const feature = getOptionalString(args, 'feature') ?? getOptionalString(args, 'feature_key') ?? getOptionalString(args, 'featureKey')
  const capability = getOptionalString(args, 'capability')
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

export function summarizeModelContractForAgent(model: unknown): Record<string, unknown> {
  const source = isRecord(model) ? model : {}
  const schema = isRecord(source.params_schema) ? source.params_schema : undefined
  const supportedParams = Array.isArray(source.supported_params) ? source.supported_params : []
  const supportedParamKeys = supportedParams.flatMap((param) => {
    if (!isRecord(param) || typeof param.key !== 'string' || !param.key.trim()) return []
    return [param.key.trim()]
  })
  const propertyKeys = Object.keys(isRecord(schema?.properties) ? schema.properties : {})
  return {
    contract_version: 1,
    id: numericModelField(source, 'id') ?? numericModelField(source, 'ID'),
    model_config_id: numericModelField(source, 'id') ?? numericModelField(source, 'ID'),
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

export async function createGenerationJob(args: Record<string, unknown>): Promise<unknown> {
  const prompt = getRequiredString(args, 'prompt').trim()
  if (!prompt) throw new Error('prompt is required')

  const inputResourceIds = getNumberArray(args.input_resource_ids ?? args.inputResourceIds ?? args.reference_resource_ids)
  const jobType = inferGenerationJobType(args, inputResourceIds)
  const modelConfigId = getOptionalNumeric(args, 'model_config_id')
    ?? getOptionalNumeric(args, 'modelConfigId')
    ?? await pickGenerationModelConfigId(jobType)
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
    model_config_id: modelConfigId,
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
  const media = isRecord(normalized.media) ? normalized.media : undefined

  return {
    status: finalStatus,
    job: normalized.job,
    jobId: initialJobId,
    ...(outputResource ? { output_resource: outputResource } : {}),
    ...(outputResourceId ? { output_resource_id: outputResourceId } : {}),
    ...(media ? { media } : {}),
    param_validation: paramValidation,
    terminal: isTerminalGenerationStatus(finalStatus),
    message: finalStatus === 'succeeded'
      ? `生成完成${outputResourceId ? `，输出资源 #${outputResourceId}` : ''}。`
      : `生成任务结束，状态：${finalStatus}。`,
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

async function applyDraftReview(args: Record<string, unknown>): Promise<unknown> {
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
  if (!isProjectProposalTarget(review)) {
    return {
      performed: false,
      skippedReason: 'backend apply preview is only implemented for project_proposal drafts',
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
    payload: normalizeProjectProposalPayload(review.proposedValue),
  }
}

function isProjectProposalTarget(review: Record<string, unknown>): boolean {
  const target = isRecord(review.target) ? review.target : {}
  return target.entityType === 'project' && target.field === 'proposal'
}

function resolveProjectId(review: Record<string, unknown>): string | number {
  const target = getObjectValue(review.target, 'target')
  const candidate = target.projectId ?? target.entityId
  if ((typeof candidate !== 'string' && typeof candidate !== 'number') || String(candidate).trim() === '') {
    throw new Error('apply_draft requires projectId for project proposal apply')
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
