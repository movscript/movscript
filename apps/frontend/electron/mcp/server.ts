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
let apiBaseURL = normalizeAPIBaseURL(process.env.MOVSCRIPT_API_BASE_URL || 'http://localhost:8765')

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

export async function startMCPServer(): Promise<number> {
  if (server?.listening) return addressPort(server) ?? DEFAULT_PORT

  const requestedPort = Number(process.env.MOVSCRIPT_MCP_PORT || DEFAULT_PORT)
  const ports = process.env.MOVSCRIPT_MCP_PORT
    ? [requestedPort]
    : Array.from({ length: MAX_PORT_PROBES }, (_item, index) => requestedPort + index)
  let lastError: unknown
  for (const port of ports) {
    const nextServer = createServer(handleHTTP)
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

function listTools(): MCPTool[] {
  return [
    {
      name: 'movscript_get_context_pack',
      description: 'Return the current route, project, user, selection, and available resources.',
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
      name: 'movscript_list_productions',
      description: 'List productions for the current or specified project.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number' },
          status: { type: 'string' },
          limit: { type: 'number' },
        }
      ),
    },
    {
      name: 'movscript_read_current_production',
      description: 'Read the current production and its focused production proposal context: scene moments, creative references, asset slots, content units, and keyframes.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number' },
          productionId: { type: 'number', description: 'Defaults to the current UI production when omitted.' },
          includeScriptText: { type: 'boolean' },
        }
      ),
    },
    {
      name: 'movscript_read_production_context',
      description: 'Read the full production orchestration context: existing segments, scene moments, creative references (project-level), asset slots (project-level), and content units for a given production. Use this as the first step before generating any candidates.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number' },
          productionId: { type: 'number' },
          includeScriptText: { type: 'boolean' },
        },
        ['projectId', 'productionId']
      ),
    },
    {
      name: 'movscript_check_proposal_is_available',
      description: 'Validate whether a production_proposal tree is available to submit/apply for the current production. Checks reuse/update ids, project-scoped creative references and asset slots, production-scoped segments and scene moments, and returns suggestions plus a normalized proposal when existing items can be reused.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number' },
          productionId: { type: 'number' },
          proposal: {
            type: 'object',
            description: 'Production proposal tree with segments, nested scene_moments, creative_references, asset_slots, content_units, and keyframes.',
          },
          autofix: { type: 'boolean', description: 'When true, normalizedProposal fills missing reuse/update ids or converts duplicate create actions to reuse/update where unambiguous. Defaults to true.' },
        },
        ['projectId', 'productionId', 'proposal']
      ),
    },
    {
      name: 'movscript_build_orchestration_diff',
      description: 'Compare an agent-derived orchestration proposal with the current production and project-level settings/assets before writing a draft. Returns setting coverage, asset coverage, segment and scene-moment diffs, and review gates.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number' },
          productionId: { type: 'number', description: 'Defaults to the current UI production when omitted.' },
          proposal: {
            type: 'object',
            description: 'Agent-derived tree with segments, nested scene_moments, creative_references, and asset_slots.',
          },
          currentDraft: {
            type: 'object',
            description: 'Optional current local production_proposal tree, used to mark draft keep/update/supersede differences.',
          },
        },
        ['proposal']
      ),
    },
    {
      name: 'movscript_list_models',
      description: 'List enabled AI models for a capability or feature, including supported parameters, so the agent can choose a valid model before generation.',
      inputSchema: objectSchema(
        {
          capability: { type: 'string', description: 'Optional capability filter such as text, image, image_edit, video, video_i2v, or video_v2v.' },
          feature: { type: 'string', description: 'Optional feature key filter. Takes precedence over capability when provided.' },
          provider_variants: { type: 'boolean', description: 'When true, include provider-specific model variants.' },
          include_provider_variants: { type: 'boolean', description: 'Alias for provider_variants.' },
        }
      ),
    },
    {
      name: 'movscript_create_generation_job',
      description: 'Create and wait for an AI image or video generation job through the MovScript backend. Returns the completed job and output_resource for direct chat display. This is cost-bearing and should only run after explicit user approval.',
      inputSchema: objectSchema(
        {
          prompt: { type: 'string' },
          output_type: { type: 'string', enum: ['image', 'video'], description: 'High-level output type. Ignored when job_type is provided.' },
          job_type: { type: 'string', enum: ['image', 'image_edit', 'video', 'video_i2v', 'video_v2v'] },
          model_config_id: { type: 'number', description: 'Optional AIModelConfig ID. If omitted, MovScript chooses the first available model for the requested capability.' },
          input_resource_ids: { type: 'array', items: { type: 'number' }, description: 'Optional reference image/video resource IDs.' },
          aspect_ratio: { type: 'string', description: 'Optional aspect ratio such as 1:1, 16:9, or 9:16.' },
          duration: { type: 'number', description: 'Optional video duration in seconds.' },
          extra_params: { type: 'object', description: 'Optional provider/model-specific generation parameters.' },
          feature_key: { type: 'string', description: 'Optional feature key for routing/audit. Defaults to agent.chat_generation.' },
          projectId: { type: 'number' },
          wait: { type: 'boolean', description: 'Defaults to true. When false, returns after enqueueing the job.' },
          timeout_ms: { type: 'number', description: 'Maximum wait time. Defaults to 180000 for image, 600000 for video.' },
          poll_interval_ms: { type: 'number', description: 'Polling interval. Defaults to 2500.' },
        },
        ['prompt']
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
    case 'movscript_get_context_pack':
      return toolText(await getContextPack())
    case 'movscript_list_projects':
      return toolText(await listProjects(args))
    case 'movscript_read_project_scripts':
      return toolText(await readProjectScripts(args))
    case 'movscript_create_project':
      return toolText(await createProject(args))
    case 'movscript_list_productions':
      return toolText(await listProductions(args))
    case 'movscript_read_current_production':
      return toolText(await readCurrentProduction(args))
    case 'movscript_read_production_context':
      return toolText(await readProductionContext(args))
    case 'movscript_check_proposal_is_available':
      return toolText(await checkProposalIsAvailable(args))
    case 'movscript_build_orchestration_diff':
      return toolText(await buildOrchestrationDiff(args))
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

async function getContextPack(): Promise<unknown> {
  const startedAt = Date.now()
  try {
    const projectsStartedAt = Date.now()
    const projectsResult = await listProjects({})
    const projects = isRecord(projectsResult) && Array.isArray(projectsResult.projects) ? projectsResult.projects : []
    const projectsMs = Date.now() - projectsStartedAt
    return {
      snapshot: contextSnapshot,
      projects,
      resources: listResources(),
      timings: {
        totalMs: Date.now() - startedAt,
        projectsMs,
      },
    }
  } catch (error) {
    return {
      snapshot: contextSnapshot,
      projects: [],
      projectsError: error instanceof Error ? error.message : String(error),
      resources: listResources(),
      timings: {
        totalMs: Date.now() - startedAt,
      },
    }
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

async function listModels(args: Record<string, unknown>): Promise<unknown> {
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
    models: Array.from(byId.values()),
  }
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

async function listProductions(args: Record<string, unknown>): Promise<unknown> {
  const projectId = getOptionalNumber(args, 'projectId') ?? contextSnapshot.project?.id
  const status = typeof args.status === 'string' ? args.status.trim() : ''
  const limit = getOptionalNumber(args, 'limit') ?? 50
  if (!projectId) throw new Error('projectId is required when no current project is selected')

  let productions = await backendList(`/projects/${projectId}/entities/productions`)
  if (status) {
    productions = productions.filter((production: any) => String(production?.status ?? '') === status)
  }

  return {
    projectId,
    count: productions.length,
    productions: productions.slice(0, limit).map(summarizeProductionEntity),
  }
}

async function backendList(path: string): Promise<any[]> {
  const data = await backendGet(path)
  if (Array.isArray(data)) return data
  if (isRecord(data) && Array.isArray(data.items)) return data.items
  return []
}

async function createGenerationJob(args: Record<string, unknown>): Promise<unknown> {
  const prompt = getRequiredString(args, 'prompt').trim()
  if (!prompt) throw new Error('prompt is required')

  const inputResourceIds = getNumberArray(args.input_resource_ids ?? args.inputResourceIds ?? args.reference_resource_ids)
  const jobType = inferGenerationJobType(args, inputResourceIds)
  const modelConfigId = getOptionalNumeric(args, 'model_config_id')
    ?? getOptionalNumeric(args, 'modelConfigId')
    ?? await pickGenerationModelConfigId(jobType)
  const projectId = getOptionalNumeric(args, 'projectId') ?? contextSnapshot.project?.id
  const wait = args.wait !== false
  const aspectRatio = getOptionalString(args, 'aspect_ratio')
  const duration = getOptionalNumeric(args, 'duration')
  const featureKey = getOptionalString(args, 'feature_key') ?? getOptionalString(args, 'featureKey') ?? 'agent.chat_generation'
  const extraParams = normalizeGenerationExtraParams(args.extra_params)

  const job = await backendPost('/jobs', {
    model_config_id: modelConfigId,
    job_type: jobType,
    feature_key: featureKey,
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
    terminal: isTerminalGenerationStatus(finalStatus),
    message: finalStatus === 'succeeded'
      ? `生成完成${outputResourceId ? `，输出资源 #${outputResourceId}` : ''}。`
      : `生成任务结束，状态：${finalStatus}。`,
  }
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

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
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

function normalizeGenerationExtraParams(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value.trim() || undefined
  if (isRecord(value)) return JSON.stringify(value)
  return undefined
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

async function findRawResourceById(resourceId: number): Promise<Record<string, unknown> | undefined> {
  const resources = await backendList('/resources?page=1&page_size=200&type=image,video')
  return resources.find((resource) => Number(resource?.ID ?? resource?.id) === resourceId)
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

async function readProductionContext(args: Record<string, unknown>): Promise<unknown> {
  const projectId = getRequiredNumber(args, 'projectId')
  const productionId = getRequiredNumber(args, 'productionId')
  const includeScriptText = args.includeScriptText === true

  const [segments, sceneMoments, creativeReferences, assetSlots, contentUnits, productions] = await Promise.all([
    backendList(`/projects/${projectId}/entities/segments`),
    backendList(`/projects/${projectId}/entities/scene-moments`),
    backendList(`/projects/${projectId}/entities/creative-references`),
    backendList(`/projects/${projectId}/entities/asset-slots`),
    backendList(`/projects/${projectId}/entities/content-units`),
    backendList(`/projects/${projectId}/entities/productions`),
  ])

  const production = productions.find((p: any) => Number(p.ID ?? p.id) === productionId) ?? null
  const productionSegments = segments.filter((s: any) => Number(s.production_id) === productionId)
  const segmentIds = new Set(productionSegments.map((s: any) => Number(s.ID ?? s.id)))
  const productionSceneMoments = sceneMoments.filter((sm: any) => segmentIds.has(Number(sm.segment_id)))
  const sceneMomentIds = new Set(productionSceneMoments.map((sm: any) => Number(sm.ID ?? sm.id)))
  const productionContentUnits = contentUnits.filter((cu: any) =>
    Number(cu.production_id) === productionId ||
    segmentIds.has(Number(cu.segment_id)) ||
    sceneMomentIds.has(Number(cu.scene_moment_id))
  )

  let scriptText: string | undefined
  let scriptSource: Record<string, unknown> | undefined
  if (includeScriptText && production?.script_version_id) {
    try {
      const scriptVersions = await backendList(`/projects/${projectId}/entities/script-versions`)
      const version = scriptVersions.find((v: any) => Number(v.ID ?? v.id) === Number(production.script_version_id))
      const rawScriptText = version?.content || version?.raw_source || undefined
      const scoped = scopeScriptTextForProduction(rawScriptText, production, version?.title)
      scriptText = scoped.text
      scriptSource = {
        script_version_id: Number(production.script_version_id),
        title: version?.title,
        scoped: scoped.scoped,
        episode_order: scoped.episodeOrder,
        source_length: typeof rawScriptText === 'string' ? rawScriptText.length : 0,
        sent_length: scoped.text?.length ?? 0,
      }
    } catch {
      // script text is optional
    }
  }

  return {
    production: production ? summarizeProductionEntity(production) : null,
    counts: {
      segments: productionSegments.length,
      sceneMoments: productionSceneMoments.length,
      creativeReferences: creativeReferences.length,
      assetSlots: assetSlots.length,
      contentUnits: productionContentUnits.length,
    },
    segments: productionSegments.map(summarizeProductionEntity),
    sceneMoments: productionSceneMoments.map(summarizeProductionEntity),
    creativeReferences: creativeReferences.map(summarizeProductionEntity),
    assetSlots: assetSlots.map(summarizeProductionEntity),
    contentUnits: productionContentUnits.map(summarizeProductionEntity),
    ...(scriptSource ? { scriptSource } : {}),
    ...(scriptText !== undefined ? { scriptText: scriptText.length > 8000 ? scriptText.slice(0, 8000) + '...' : scriptText } : {}),
  }
}

async function readCurrentProduction(args: Record<string, unknown>): Promise<unknown> {
  const projectId = getRequiredNumber(args, 'projectId')
  const productionId = getOptionalNumber(args, 'productionId') ?? contextSnapshot.productionId
  if (!productionId) throw new Error('productionId is required and no current production is selected')

  const [context, keyframes] = await Promise.all([
    readProductionContext({ projectId, productionId, includeScriptText: args.includeScriptText === true }),
    backendList(`/projects/${projectId}/entities/keyframes`),
  ])
  const contentUnitIds = new Set(
    isRecord(context) && Array.isArray(context.contentUnits)
      ? context.contentUnits.map((item: any) => Number(item.ID ?? item.id)).filter((id) => Number.isFinite(id))
      : [],
  )
  const sceneMomentIds = new Set(
    isRecord(context) && Array.isArray(context.sceneMoments)
      ? context.sceneMoments.map((item: any) => Number(item.ID ?? item.id)).filter((id) => Number.isFinite(id))
      : [],
  )
  const productionKeyframes = keyframes.filter((keyframe: any) => (
    Number(keyframe.production_id) === productionId ||
    sceneMomentIds.has(Number(keyframe.scene_moment_id)) ||
    contentUnitIds.has(Number(keyframe.content_unit_id))
  ))

  return {
    ...(isRecord(context) ? context : {}),
    productionId,
    counts: {
      ...(isRecord(context) && isRecord(context.counts) ? context.counts : {}),
      keyframes: productionKeyframes.length,
    },
    keyframes: productionKeyframes.map(summarizeProductionEntity),
  }
}

async function checkProposalIsAvailable(args: Record<string, unknown>): Promise<unknown> {
  const projectId = getRequiredNumber(args, 'projectId')
  const productionId = getRequiredNumber(args, 'productionId')
  const autofix = args.autofix !== false
  const proposal = isRecord(args.proposal)
    ? cloneJSON(args.proposal)
    : legacyCandidatesToProposal(isRecord(args.candidates) ? args.candidates : {})

  const [segments, sceneMoments, creativeReferences, assetSlots, contentUnits, keyframes] = await Promise.all([
    backendList(`/projects/${projectId}/entities/segments`),
    backendList(`/projects/${projectId}/entities/scene-moments`),
    backendList(`/projects/${projectId}/entities/creative-references`),
    backendList(`/projects/${projectId}/entities/asset-slots`),
    backendList(`/projects/${projectId}/entities/content-units`),
    backendList(`/projects/${projectId}/entities/keyframes`),
  ])

  const productionSegments = segments.filter((s: any) => Number(s.production_id) === productionId)
  const segmentIds = new Set(productionSegments.map((s: any) => entityId(s)).filter((id): id is number => id !== undefined))
  const productionSceneMoments = sceneMoments.filter((sm: any) => segmentIds.has(Number(sm.segment_id)))
  const sceneMomentIds = new Set(productionSceneMoments.map((sm: any) => entityId(sm)).filter((id): id is number => id !== undefined))
  const productionContentUnits = contentUnits.filter((cu: any) =>
    Number(cu.production_id) === productionId ||
    segmentIds.has(Number(cu.segment_id)) ||
    sceneMomentIds.has(Number(cu.scene_moment_id))
  )
  const contentUnitIds = new Set(productionContentUnits.map((cu: any) => entityId(cu)).filter((id): id is number => id !== undefined))
  const productionKeyframes = keyframes.filter((keyframe: any) => (
    Number(keyframe.production_id) === productionId ||
    sceneMomentIds.has(Number(keyframe.scene_moment_id)) ||
    contentUnitIds.has(Number(keyframe.content_unit_id))
  ))
  const errors: Array<Record<string, unknown>> = []
  const warnings: Array<Record<string, unknown>> = []
  const suggestions: Array<Record<string, unknown>> = []
  const counts = { checked: 0, errors: 0, warnings: 0, suggestions: 0, autofixed: 0 }

  function nameSimilarity(a: any, b: any): number {
    const nameA = String(a.name ?? a.title ?? '').toLowerCase().trim()
    const nameB = String(b.name ?? b.title ?? '').toLowerCase().trim()
    if (!nameA || !nameB) return 0
    if (nameA === nameB) return 1.0
    if (nameA.includes(nameB) || nameB.includes(nameA)) return 0.85
    const wordsA = new Set(nameA.split(/\s+/))
    const wordsB = new Set(nameB.split(/\s+/))
    const intersection = [...wordsA].filter((w) => wordsB.has(w)).length
    const union = new Set([...wordsA, ...wordsB]).size
    return union > 0 ? intersection / union : 0
  }

  function addError(issue: Record<string, unknown>) {
    errors.push(issue)
    counts.errors += 1
  }

  function addWarning(issue: Record<string, unknown>) {
    warnings.push(issue)
    counts.warnings += 1
  }

  function addSuggestion(suggestion: Record<string, unknown>) {
    suggestions.push(suggestion)
    counts.suggestions += 1
  }

  function findReusable(candidate: any, existing: any[], kindSensitive = false): { entity: any; score: number } | undefined {
    const candidateKind = String(candidate.kind ?? candidate.type ?? '').trim()
    const exact = existing.find((item) => {
      if (normalizeName(candidate) !== normalizeName(item)) return false
      if (!kindSensitive) return true
      const itemKind = String(item.kind ?? item.type ?? '').trim()
      return !candidateKind || !itemKind || candidateKind === itemKind
    })
    if (exact) return { entity: exact, score: 1 }
    return existing
      .map((item) => {
        const itemKind = String(item.kind ?? item.type ?? '').trim()
        const kindBonus = candidateKind && itemKind && candidateKind === itemKind ? 0.2 : 0
        return { entity: item, score: Math.min(1, nameSimilarity(candidate, item) + kindBonus) }
      })
      .filter((item) => item.score >= 0.7)
      .sort((a, b) => b.score - a.score)[0]
  }

  function validateNode(options: {
    node: Record<string, unknown>
    path: string
    nodeType: string
    existing: any[]
    kindSensitive?: boolean
    duplicateAction?: 'reuse' | 'update'
  }) {
    counts.checked += 1
    const action = typeof options.node.action === 'string' && options.node.action.trim()
      ? options.node.action.trim()
      : 'create'
    const id = getOptionalNumeric(options.node, 'id')
    const existingById = id === undefined ? undefined : options.existing.find((item) => entityId(item) === id)
    const match = findReusable(options.node, options.existing, options.kindSensitive)
    const matchId = match ? entityId(match.entity) : undefined
    const label = String(options.node.name ?? options.node.title ?? options.node.client_id ?? options.node.localRef ?? options.path)

    if ((action === 'reuse' || action === 'update') && id === undefined) {
      if (autofix && matchId !== undefined) {
        options.node.id = matchId
        counts.autofixed += 1
        addSuggestion({
          path: options.path,
          node_type: options.nodeType,
          code: `${action.toUpperCase()}_ID_FILLED`,
          action,
          id: matchId,
          existing_name: match?.entity?.name ?? match?.entity?.title ?? '',
          similarity: match?.score,
          message: `${options.nodeType} ${JSON.stringify(label)} ${action} id filled from existing context.`,
        })
        return
      }
      addError({
        path: options.path,
        node_type: options.nodeType,
        code: `${action.toUpperCase()}_ID_REQUIRED`,
        action,
        message: `${options.nodeType} ${JSON.stringify(label)} uses action ${JSON.stringify(action)} but does not provide id.`,
      })
      return
    }

    if ((action === 'reuse' || action === 'update') && id !== undefined && !existingById) {
      addError({
        path: options.path,
        node_type: options.nodeType,
        code: `${action.toUpperCase()}_ID_NOT_FOUND`,
        action,
        id,
        message: `${options.nodeType} ${JSON.stringify(label)} references id ${id}, but it is not available in the current project/production scope.`,
      })
      return
    }

    if (action === 'create' && match && matchId !== undefined) {
      addWarning({
        path: options.path,
        node_type: options.nodeType,
        code: 'CREATE_DUPLICATES_EXISTING',
        action,
        existing_id: matchId,
        existing_name: match.entity?.name ?? match.entity?.title ?? '',
        similarity: match.score,
        message: `${options.nodeType} ${JSON.stringify(label)} looks like an existing item and should usually reuse/update instead of create.`,
      })
      if (autofix && options.duplicateAction) {
        options.node.action = options.duplicateAction
        options.node.id = matchId
        counts.autofixed += 1
        addSuggestion({
          path: options.path,
          node_type: options.nodeType,
          code: 'DUPLICATE_CREATE_AUTOFIXED',
          action: options.duplicateAction,
          id: matchId,
          existing_name: match.entity?.name ?? match.entity?.title ?? '',
          similarity: match.score,
        })
      }
    }
  }

  getArray((proposal as any).segments).forEach((segment: any, segmentIndex) => {
    if (!isRecord(segment)) return
    const segmentPath = `/segments/${segmentIndex}`
    validateNode({ node: segment, path: segmentPath, nodeType: 'segment', existing: productionSegments, duplicateAction: 'update' })
    getArray(segment.scene_moments).forEach((sceneMoment: any, sceneMomentIndex) => {
      if (!isRecord(sceneMoment)) return
      const sceneMomentPath = `${segmentPath}/scene_moments/${sceneMomentIndex}`
      validateNode({ node: sceneMoment, path: sceneMomentPath, nodeType: 'scene_moment', existing: productionSceneMoments, duplicateAction: 'update' })
      getArray(sceneMoment.creative_references).forEach((reference: any, referenceIndex) => {
        if (!isRecord(reference)) return
        validateNode({
          node: reference,
          path: `${sceneMomentPath}/creative_references/${referenceIndex}`,
          nodeType: 'creative_reference',
          existing: creativeReferences,
          kindSensitive: true,
          duplicateAction: 'reuse',
        })
      })
      getArray(sceneMoment.asset_slots).forEach((asset: any, assetIndex) => {
        if (!isRecord(asset)) return
        validateNode({
          node: asset,
          path: `${sceneMomentPath}/asset_slots/${assetIndex}`,
          nodeType: 'asset_slot',
          existing: assetSlots,
          duplicateAction: 'reuse',
        })
      })
      getArray(sceneMoment.content_units).forEach((unit: any, unitIndex) => {
        if (!isRecord(unit)) return
        const unitPath = `${sceneMomentPath}/content_units/${unitIndex}`
        validateNode({ node: unit, path: unitPath, nodeType: 'content_unit', existing: productionContentUnits, duplicateAction: 'update' })
        getArray(unit.keyframes).forEach((keyframe: any, keyframeIndex) => {
          if (!isRecord(keyframe)) return
          validateNode({ node: keyframe, path: `${unitPath}/keyframes/${keyframeIndex}`, nodeType: 'keyframe', existing: productionKeyframes, duplicateAction: 'update' })
        })
      })
      getArray(sceneMoment.keyframes).forEach((keyframe: any, keyframeIndex) => {
        if (!isRecord(keyframe)) return
        validateNode({ node: keyframe, path: `${sceneMomentPath}/keyframes/${keyframeIndex}`, nodeType: 'keyframe', existing: productionKeyframes, duplicateAction: 'update' })
      })
    })
  })

  return {
    ok: errors.length === 0,
    projectId,
    productionId,
    counts,
    errors,
    warnings,
    suggestions,
    normalizedProposal: proposal,
  }
}

async function buildOrchestrationDiff(args: Record<string, unknown>): Promise<unknown> {
  const projectId = getOptionalNumber(args, 'projectId') ?? contextSnapshot.project?.id
  const productionId = getOptionalNumber(args, 'productionId') ?? contextSnapshot.productionId
  if (!projectId) throw new Error('projectId is required when no current project is selected')
  if (!productionId) throw new Error('productionId is required and no current production is selected')

  const proposal = normalizeProposalTree(args.proposal)
  const currentDraft = args.currentDraft === undefined ? undefined : normalizeProposalTree(args.currentDraft)

  const [segments, sceneMoments, creativeReferences, assetSlots] = await Promise.all([
    backendList(`/projects/${projectId}/entities/segments`),
    backendList(`/projects/${projectId}/entities/scene-moments`),
    backendList(`/projects/${projectId}/entities/creative-references`),
    backendList(`/projects/${projectId}/entities/asset-slots`),
  ])

  const productionSegments = segments.filter((segment: any) => Number(segment.production_id) === productionId)
  const productionSegmentIds = new Set(productionSegments.map((segment: any) => entityId(segment)).filter((id): id is number => id !== undefined))
  const productionSceneMoments = sceneMoments.filter((sceneMoment: any) => productionSegmentIds.has(Number(sceneMoment.segment_id)))
  const productionSceneMomentIds = new Set(productionSceneMoments.map((sceneMoment: any) => entityId(sceneMoment)).filter((id): id is number => id !== undefined))
  const productionAssetSlots = assetSlots.filter((slot: any) => (
    Number(slot.production_id) === productionId ||
    (String(slot.owner_type ?? '') === 'segment' && productionSegmentIds.has(Number(slot.owner_id))) ||
    (String(slot.owner_type ?? '') === 'scene_moment' && productionSceneMomentIds.has(Number(slot.owner_id)))
  ))

  const settingCoverage: Array<Record<string, unknown>> = []
  const assetCoverage: Array<Record<string, unknown>> = []
  const segmentDiffs: Array<Record<string, unknown>> = []
  const sceneMomentDiffs: Array<Record<string, unknown>> = []
  const reviewGates: Array<Record<string, unknown>> = []
  const actionCounts: Record<string, number> = { create: 0, reuse: 0, update: 0, keep: 0, ignore: 0, supersede: 0 }

  function recordAction(action: string | undefined) {
    const key = action && action in actionCounts ? action : 'create'
    actionCounts[key] += 1
  }

  const draftSegments = currentDraft ? getArray((currentDraft as any).segments) : []
  getArray((proposal as any).segments).forEach((segment: any, segmentIndex) => {
    if (!isRecord(segment)) return
    const segmentPath = `/segments/${segmentIndex}`
    const segmentRef = ensureRequirementRef(segment, `segment_${segmentIndex + 1}`, segmentPath)
    const existingSegmentMatch = findReusableEntity(segment, productionSegments, false)
    const draftSegmentMatch = findProposalNodeByName(segment, draftSegments)
    const segmentDiff = annotateStructuralNode({
      node: segment,
      path: segmentPath,
      nodeType: 'segment',
      requirementRef: segmentRef,
      existingMatch: existingSegmentMatch,
      draftMatch: draftSegmentMatch,
      updateFields: ['kind', 'title', 'summary'],
      reviewGates,
    })
    segmentDiffs.push(segmentDiff)
    recordAction(String(segment.diff_action ?? segment.action ?? 'create'))

    getArray(segment.scene_moments).forEach((sceneMoment: any, sceneMomentIndex) => {
      if (!isRecord(sceneMoment)) return
      const sceneMomentPath = `${segmentPath}/scene_moments/${sceneMomentIndex}`
      const sceneRef = ensureRequirementRef(sceneMoment, `${segmentRef}.scene_${sceneMomentIndex + 1}`, sceneMomentPath)
      const existingSceneMatch = findReusableEntity(sceneMoment, productionSceneMoments, false)
      const draftSceneMatch = draftSegmentMatch
        ? findProposalNodeByName(sceneMoment, getArray(draftSegmentMatch.node.scene_moments))
        : undefined
      const sceneDiff = annotateStructuralNode({
        node: sceneMoment,
        path: sceneMomentPath,
        nodeType: 'scene_moment',
        requirementRef: sceneRef,
        existingMatch: existingSceneMatch,
        draftMatch: draftSceneMatch,
        updateFields: ['title', 'description', 'time_text', 'location_text', 'action_text', 'mood'],
        reviewGates,
      })
      sceneMomentDiffs.push(sceneDiff)
      recordAction(String(sceneMoment.diff_action ?? sceneMoment.action ?? 'create'))

      getArray(sceneMoment.creative_references).forEach((reference: any, referenceIndex) => {
        if (!isRecord(reference)) return
        const referencePath = `${sceneMomentPath}/creative_references/${referenceIndex}`
        const requirementRef = ensureRequirementRef(reference, `${sceneRef}.setting_${referenceIndex + 1}`, referencePath)
        const match = findReusableEntity(reference, creativeReferences, true)
        const coverage = annotateCoverageNode({
          node: reference,
          path: referencePath,
          nodeType: 'creative_reference',
          requirementRef,
          existingMatch: match,
          missingMessage: 'Project settings do not yet contain this required creative reference.',
          matchedMessage: 'Project settings already contain a reusable creative reference.',
        })
        settingCoverage.push({
          ...coverage,
          scene_moment_ref: sceneRef,
          role: reference.role,
        })
        recordAction(String(reference.diff_action ?? reference.action ?? 'create'))
      })

      getArray(sceneMoment.asset_slots).forEach((slot: any, slotIndex) => {
        if (!isRecord(slot)) return
        const assetPath = `${sceneMomentPath}/asset_slots/${slotIndex}`
        const requirementRef = ensureRequirementRef(slot, `${sceneRef}.asset_${slotIndex + 1}`, assetPath)
        const match = findReusableEntity(slot, productionAssetSlots.length > 0 ? productionAssetSlots : assetSlots, true)
        const coverage = annotateCoverageNode({
          node: slot,
          path: assetPath,
          nodeType: 'asset_slot',
          requirementRef,
          existingMatch: match,
          missingMessage: 'Current production assets do not yet cover this scene or setting need.',
          matchedMessage: 'Current project or production already has a reusable asset slot.',
        })
        assetCoverage.push({
          ...coverage,
          scene_moment_ref: sceneRef,
          priority: slot.priority,
        })
        recordAction(String(slot.diff_action ?? slot.action ?? 'create'))
      })
    })
  })

  const counts = {
    segment_requirements: segmentDiffs.length,
    scene_moment_requirements: sceneMomentDiffs.length,
    setting_requirements: settingCoverage.length,
    asset_requirements: assetCoverage.length,
    missing_settings: settingCoverage.filter((item) => item.coverage_status === 'missing').length,
    missing_assets: assetCoverage.filter((item) => item.coverage_status === 'missing').length,
    creates: actionCounts.create,
    reuses: actionCounts.reuse,
    updates: actionCounts.update,
    keeps: actionCounts.keep,
    review_gates: reviewGates.length,
  }

  return {
    ok: reviewGates.filter((gate) => gate.severity === 'error').length === 0,
    projectId,
    productionId,
    counts,
    settingCoverage,
    assetCoverage,
    segmentDiffs,
    sceneMomentDiffs,
    reviewGates,
    annotatedProposal: proposal,
  }
}

function normalizeProposalTree(value: unknown): Record<string, unknown> {
  const raw = isRecord(value) && isRecord(value.proposal) ? value.proposal : value
  const proposal = cloneJSON(isRecord(raw) ? raw : { segments: [] }) as Record<string, unknown>
  if (!Array.isArray(proposal.segments)) proposal.segments = []
  return proposal
}

function ensureRequirementRef(node: Record<string, unknown>, fallback: string, path: string): string {
  const current = getOptionalString(node, 'requirement_ref')
    ?? getOptionalString(node, 'requirementRef')
    ?? getOptionalString(node, 'client_id')
    ?? getOptionalString(node, 'localRef')
    ?? fallback
  node.requirement_ref = current
  node.localRef = getOptionalString(node, 'localRef') ?? getOptionalString(node, 'client_id') ?? current
  node.client_id = getOptionalString(node, 'client_id') ?? getOptionalString(node, 'localRef') ?? current
  if (!node.source_evidence) node.source_evidence = path
  return current
}

function annotateStructuralNode(input: {
  node: Record<string, unknown>
  path: string
  nodeType: string
  requirementRef: string
  existingMatch?: { entity: any; score: number }
  draftMatch?: { node: Record<string, unknown>; path: string; score: number }
  updateFields: string[]
  reviewGates: Array<Record<string, unknown>>
}): Record<string, unknown> {
  const existing = input.existingMatch?.entity
  const existingId = existing ? entityId(existing) : undefined
  const hasDifference = existing ? hasMeaningfulDifference(input.node, existing, input.updateFields) : false
  const status = existing
    ? hasDifference ? 'partial' : 'covered'
    : input.draftMatch ? 'partial' : 'missing'
  const diffAction = existing
    ? hasDifference ? 'update' : 'keep'
    : input.draftMatch ? 'supersede' : 'create'
  const proposalAction = diffAction === 'keep' ? 'reuse' : diffAction === 'supersede' ? 'update' : diffAction

  input.node.coverage_status = status
  input.node.diff_action = diffAction
  input.node.action = getOptionalString(input.node, 'action') ?? proposalAction
  if ((input.node.action === 'reuse' || input.node.action === 'update') && existingId !== undefined) input.node.id = getOptionalNumeric(input.node, 'id') ?? existingId
  input.node.rationale = getOptionalString(input.node, 'rationale')
    ?? structuralRationale(input.nodeType, status, diffAction, input.existingMatch?.score, input.draftMatch?.path)

  if (existing && String(existing.status ?? '') === 'confirmed' && diffAction === 'update') {
    input.reviewGates.push({
      severity: 'warning',
      code: 'CONFIRMED_ENTITY_UPDATE_REQUIRES_REVIEW',
      node_type: input.nodeType,
      path: input.path,
      existing_id: existingId,
      message: 'This proposal updates a confirmed entity. Keep it as an explicit reviewed update, not an automatic overwrite.',
    })
  }

  return {
    path: input.path,
    node_type: input.nodeType,
    requirement_ref: input.requirementRef,
    title: input.node.title ?? input.node.name,
    coverage_status: status,
    diff_action: diffAction,
    proposed_action: input.node.action,
    existing_id: existingId,
    existing_name: existing?.title ?? existing?.name,
    similarity: input.existingMatch?.score,
    current_draft_path: input.draftMatch?.path,
    rationale: input.node.rationale,
  }
}

function annotateCoverageNode(input: {
  node: Record<string, unknown>
  path: string
  nodeType: string
  requirementRef: string
  existingMatch?: { entity: any; score: number }
  missingMessage: string
  matchedMessage: string
}): Record<string, unknown> {
  const existing = input.existingMatch?.entity
  const existingId = existing ? entityId(existing) : undefined
  const status = existing ? input.existingMatch!.score >= 1 ? 'covered' : 'partial' : 'missing'
  const diffAction = existing ? 'reuse' : 'create'
  input.node.coverage_status = status
  input.node.diff_action = diffAction
  input.node.action = getOptionalString(input.node, 'action') ?? diffAction
  if ((input.node.action === 'reuse' || input.node.action === 'update') && existingId !== undefined) input.node.id = getOptionalNumeric(input.node, 'id') ?? existingId
  input.node.rationale = getOptionalString(input.node, 'rationale') ?? (existing ? input.matchedMessage : input.missingMessage)
  return {
    path: input.path,
    node_type: input.nodeType,
    requirement_ref: input.requirementRef,
    name: input.node.name ?? input.node.title,
    kind: input.node.kind ?? input.node.type,
    coverage_status: status,
    diff_action: diffAction,
    proposed_action: input.node.action,
    existing_id: existingId,
    existing_name: existing?.name ?? existing?.title,
    similarity: input.existingMatch?.score,
    rationale: input.node.rationale,
  }
}

function findReusableEntity(candidate: Record<string, unknown>, existing: any[], kindSensitive = false): { entity: any; score: number } | undefined {
  const candidateKind = String(candidate.kind ?? candidate.type ?? '').trim()
  const exact = existing.find((item) => {
    if (normalizeName(candidate) !== normalizeName(item)) return false
    if (!kindSensitive) return true
    const itemKind = String(item.kind ?? item.type ?? '').trim()
    return !candidateKind || !itemKind || candidateKind === itemKind
  })
  if (exact) return { entity: exact, score: 1 }
  return existing
    .map((item) => {
      const itemKind = String(item.kind ?? item.type ?? '').trim()
      const kindBonus = candidateKind && itemKind && candidateKind === itemKind ? 0.2 : 0
      return { entity: item, score: Math.min(1, proposalNameSimilarity(candidate, item) + kindBonus) }
    })
    .filter((item) => item.score >= 0.7)
    .sort((a, b) => b.score - a.score)[0]
}

function findProposalNodeByName(candidate: Record<string, unknown>, nodes: unknown[]): { node: Record<string, unknown>; path: string; score: number } | undefined {
  return nodes
    .map((node, index) => isRecord(node)
      ? { node, path: String(index), score: proposalNameSimilarity(candidate, node) }
      : undefined)
    .filter((item): item is { node: Record<string, unknown>; path: string; score: number } => !!item && item.score >= 0.7)
    .sort((a, b) => b.score - a.score)[0]
}

function proposalNameSimilarity(a: any, b: any): number {
  const nameA = normalizeName(a)
  const nameB = normalizeName(b)
  if (!nameA || !nameB) return 0
  if (nameA === nameB) return 1
  if (nameA.includes(nameB) || nameB.includes(nameA)) return 0.85
  const wordsA = new Set(nameA.split(/\s+/))
  const wordsB = new Set(nameB.split(/\s+/))
  const intersection = [...wordsA].filter((word) => wordsB.has(word)).length
  const union = new Set([...wordsA, ...wordsB]).size
  return union > 0 ? intersection / union : 0
}

function hasMeaningfulDifference(candidate: Record<string, unknown>, existing: Record<string, unknown>, fields: string[]): boolean {
  return fields.some((field) => {
    const next = normalizedComparableText(candidate[field])
    if (!next) return false
    const current = normalizedComparableText(existing[field])
    return current !== '' && next !== current
  })
}

function normalizedComparableText(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function structuralRationale(nodeType: string, coverageStatus: string, diffAction: string, score?: number, draftPath?: string): string {
  if (diffAction === 'keep') return `Existing ${nodeType} already covers this requirement.`
  if (diffAction === 'update') return `Existing ${nodeType} partially covers this requirement but differs in proposed fields.`
  if (diffAction === 'supersede') return `A current draft candidate exists at ${draftPath}; replace it with this reviewed derivation.`
  if (coverageStatus === 'missing') return `No existing ${nodeType} covers this derived requirement.`
  return `Matched existing ${nodeType}${score !== undefined ? ` with similarity ${score.toFixed(2)}` : ''}.`
}

function cloneJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function legacyCandidatesToProposal(candidates: Record<string, unknown>): Record<string, unknown> {
  const segments = getArray(candidates.segments)
  if (segments.length > 0) return { segments }
  const sceneMoments = getArray(candidates.scene_moments)
  const creativeReferences = getArray(candidates.creative_references)
  const assetSlots = getArray(candidates.asset_slots)
  const contentUnits = getArray(candidates.content_units)
  if (sceneMoments.length === 0 && creativeReferences.length === 0 && assetSlots.length === 0 && contentUnits.length === 0) {
    return { segments: [] }
  }
  return {
    segments: [{
      action: 'create',
      client_id: 'legacy_segment',
      title: 'Legacy proposal candidates',
      scene_moments: [{
        action: 'create',
        client_id: 'legacy_scene_moment',
        title: 'Legacy proposal candidates',
        creative_references: creativeReferences,
        asset_slots: assetSlots,
        content_units: contentUnits,
      }, ...sceneMoments],
    }],
  }
}

function entityId(item: any): number | undefined {
  const id = Number(item?.ID ?? item?.id)
  return Number.isFinite(id) && id > 0 ? id : undefined
}

function normalizeName(item: any): string {
  return String(item?.name ?? item?.title ?? '').toLowerCase().trim()
}

function summarizeProductionEntity(item: any): unknown {
  if (!item || typeof item !== 'object') return item
  const summary: Record<string, unknown> = {}
  for (const key of [
    'ID', 'id', 'project_id', 'production_id', 'segment_id', 'scene_moment_id',
    'content_unit_id', 'creative_reference_id', 'script_version_id',
    'title', 'name', 'kind', 'type', 'status', 'importance', 'priority',
    'order', 'summary', 'description', 'source_range',
    'time_text', 'location_text', 'action_text', 'mood',
    'shot_size', 'camera_angle', 'owner_type', 'owner_id',
    'CreatedAt', 'UpdatedAt',
  ]) {
    if (item[key] !== undefined) summary[key] = truncateLongText(item[key])
  }
  return summary
}

function scopeScriptTextForProduction(rawScriptText: unknown, production: any, scriptVersionTitle?: unknown) {
  const text = typeof rawScriptText === 'string' ? rawScriptText.trim() : ''
  const episodeOrder = inferEpisodeOrderForProduction(production, scriptVersionTitle)
  if (!text || !episodeOrder) return { text, scoped: false, episodeOrder: undefined as number | undefined }

  const ranges = findEpisodeTextRanges(text)
  const range = ranges.find((item) => item.order === episodeOrder)
  if (!range) return { text, scoped: false, episodeOrder }

  const scoped = text.slice(range.start, range.end).trim()
  if (!scoped || scoped.length >= text.length * 0.85) return { text, scoped: false, episodeOrder }
  return { text: scoped, scoped: true, episodeOrder }
}

function inferEpisodeOrderForProduction(production: any, scriptVersionTitle?: unknown) {
  const candidates = [
    String(production?.name ?? ''),
    String(production?.title ?? ''),
    String(production?.description ?? ''),
    String(scriptVersionTitle ?? ''),
  ]
  for (const candidate of candidates) {
    const order = parseEpisodeOrder(candidate)
    if (order) return order
  }
  return undefined
}

function findEpisodeTextRanges(text: string): Array<{ order: number; start: number; end: number }> {
  const ranges: Array<{ order: number; start: number; end: number }> = []
  const headingPattern = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:《[^》]+》\s*)?(?:第\s*([0-9零〇一二三四五六七八九十百千万两]+)\s*[集话回]|(?:EP|E|Episode)\s*0*([0-9]+))(?:\s*[：:\-—]\s*.*)?/gi
  let match: RegExpExecArray | null
  while ((match = headingPattern.exec(text)) !== null) {
    const token = match[1] || match[2]
    const order = parseEpisodeOrder(token)
    if (!order) continue
    ranges.push({
      order,
      start: match.index + (match[0].startsWith('\n') ? 1 : 0),
      end: text.length,
    })
  }
  for (let index = 0; index < ranges.length - 1; index += 1) {
    ranges[index].end = ranges[index + 1].start
  }
  return ranges
}

function parseEpisodeOrder(value: string) {
  const text = String(value ?? '').trim()
  const match = text.match(/第\s*([0-9零〇一二三四五六七八九十百千万两]+)\s*[集话回]/)
    ?? text.match(/(?:EP|E|Episode)\s*0*([0-9]+)/i)
  const token = match?.[1] ?? (/^[0-9零〇一二三四五六七八九十百千万两]+$/.test(text) ? text : '')
  if (!token) return undefined
  if (/^\d+$/.test(token)) {
    const num = Number(token)
    return Number.isFinite(num) && num > 0 ? num : undefined
  }
  return parseChineseEpisodeNumber(token) || undefined
}

function parseChineseEpisodeNumber(value: string) {
  const digitMap: Record<string, number> = {
    零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  }
  const unitMap: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 }
  let total = 0
  let section = 0
  let number = 0
  for (const char of value) {
    if (char in digitMap) {
      number = digitMap[char]
      continue
    }
    const unit = unitMap[char]
    if (!unit) continue
    if (unit === 10000) {
      total += (section + number) * unit
      section = 0
      number = 0
      continue
    }
    section += (number || 1) * unit
    number = 0
  }
  return total + section + number
}

function getArray(value: unknown): any[] {
  return Array.isArray(value) ? value : []
}

async function backendGet(path: string): Promise<any> {
  const headers: Record<string, string> = {}
  if (contextAuthToken) headers.Authorization = `Bearer ${contextAuthToken}`

  const res = await fetch(`${apiBaseURL}${path}`, { headers })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Backend GET ${path} failed: HTTP ${res.status} ${text}`)
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
    const text = await res.text()
    throw new Error(`Backend POST ${path} failed: HTTP ${res.status} ${text}`)
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
    const text = await res.text()
    throw new Error(`Backend PATCH ${path} failed: HTTP ${res.status} ${text}`)
  }
  const text = await res.text()
  return text.trim() ? JSON.parse(text) : null
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

function summarizeEntityObject(item: any): Record<string, unknown> {
  const summary = summarizeEntity(item)
  return isRecord(summary) ? summary : {}
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

function getStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
