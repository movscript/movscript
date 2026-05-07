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
let apiBaseURL = normalizeAPIBaseURL(process.env.MOVSCRIPT_API_BASE_URL || 'http://localhost:8765')

const contextSnapshot: MCPContextSnapshot = {
  route: { pathname: '/', search: '', hash: '' },
  project: null,
  user: null,
  selection: null,
  updatedAt: new Date(0).toISOString(),
}

const drafts = new Map<string, MCPDraft>()
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
      resource(`movscript://project/${id}/shots`, 'Shots'),
      resource(`movscript://project/${id}/drafts`, 'Drafts')
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

  if (kind === 'drafts') {
    const projectDrafts = Array.from(drafts.values()).filter((d) => d.projectId === projectId)
    return resourceContent(uri, projectDrafts)
  }

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
      name: 'movscript_read_entity',
      description: 'Read one project entity by type and id from MovScript backend APIs.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number' },
          entityType: { type: 'string', enum: ['project', 'script', 'creative_reference', 'asset', 'episode', 'scene', 'storyboard', 'shot'] },
          entityId: { type: 'number' },
        },
        ['entityType', 'entityId']
      ),
    },
    {
      name: 'movscript_search_entities',
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
      name: 'movscript_read_project_structure',
      description: 'Read compact project structure across scripts, creative references, episodes, scenes, storyboards, and shots.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number' },
          limit: { type: 'number' },
        }
      ),
    },
    {
      name: 'movscript_create_draft',
      description: 'Create a local draft artifact. This does not write to MovScript project entities.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number' },
          kind: { type: 'string', enum: ['script', 'creative_reference', 'storyboard', 'shot', 'prompt', 'note', 'pipeline'] },
          title: { type: 'string' },
          content: { type: 'string' },
          source: { type: 'object' },
        },
        ['kind', 'title', 'content']
      ),
    },
    {
      name: 'movscript_list_drafts',
      description: 'List local draft artifacts for the current or specified project.',
      inputSchema: objectSchema({ projectId: { type: 'number' } }),
    },
    {
      name: 'movscript_open_entity',
      description: 'Ask the MovScript UI to open a page for an entity type. This is navigation only.',
      inputSchema: objectSchema(
        {
          entityType: { type: 'string', enum: ['project', 'script', 'creative_reference', 'asset', 'episode', 'scene', 'storyboard', 'shot'] },
          entityId: { type: 'number' },
        },
        ['entityType']
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
      name: 'movscript_check_entity_conflicts',
      description: 'Given a list of proposed production entities, check each one against existing entities and return conflict status: "none" (safe to create), "duplicate" (very similar entity exists), or "supersedes" (new version replaces old). For creative_references, pass scope="project" to check across all productions and get reuse_candidates. Always call this before propose_production_entities.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number' },
          productionId: { type: 'number' },
          scope: { type: 'string', enum: ['production', 'project'], description: 'Conflict check scope. Use "project" to find reusable CreativeReferences across all productions.' },
          candidates: {
            type: 'object',
            description: 'Object with keys: segments, scene_moments, creative_references, asset_slots, content_units — each an array of candidate objects with client_id and identifying fields.',
          },
        },
        ['projectId', 'productionId', 'candidates']
      ),
    },
    {
      name: 'movscript_submit_production_proposal',
      description: 'Write the final analysis result as a local tree-form production_proposal draft so the frontend can compare it with the current production and ask for human confirmation. This does not modify backend entities.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number' },
          productionId: { type: 'number' },
          analysisScope: { type: 'string' },
          proposal: {
            type: 'object',
            description: 'Tree-form proposal with keys: segments (array), each segment has scene_moments (array), each scene_moment has content_units and creative_references. Each node has action: "create"|"reuse"|"update" and optionally id for reuse/update.',
          },
          candidates: {
            type: 'object',
            description: 'Legacy flat candidates format (segments, scene_moments, creative_references, asset_slots, content_units). Use proposal instead for tree-form.',
          },
          summary: { type: 'string' },
        },
        ['projectId', 'productionId']
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
    case 'movscript_create_project':
      return toolText(await createProject(args))
    case 'movscript_read_entity':
      return toolText(await readEntity(args))
    case 'movscript_search_entities':
      return toolText(await searchEntities(args))
    case 'movscript_read_project_structure':
      return toolText(await readProjectStructure(args))
    case 'movscript_list_productions':
      return toolText(await listProductions(args))
    case 'movscript_read_current_production':
      return toolText(await readCurrentProduction(args))
    case 'movscript_create_draft':
      return toolText(createDraft(args))
    case 'movscript_list_drafts':
      return toolText(listDrafts(args))
    case 'movscript_open_entity':
      return toolText(openEntity(args))
    case 'movscript_read_production_context':
      return toolText(await readProductionContext(args))
    case 'movscript_check_entity_conflicts':
      return toolText(await checkEntityConflicts(args))
    case 'movscript_submit_production_proposal':
      return toolText(proposeProductionEntities(args))
    case 'movscript_create_generation_job':
      return toolText(await createGenerationJob(args))
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

async function getContextPack(): Promise<unknown> {
  try {
    const projectsResult = await listProjects({})
    const projects = isRecord(projectsResult) && Array.isArray(projectsResult.projects) ? projectsResult.projects : []
    return {
      snapshot: contextSnapshot,
      projects,
      resources: listResources(),
      draftCount: drafts.size,
    }
  } catch (error) {
    return {
      snapshot: contextSnapshot,
      projects: [],
      projectsError: error instanceof Error ? error.message : String(error),
      resources: listResources(),
      draftCount: drafts.size,
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

async function readProjectStructure(args: Record<string, unknown>): Promise<unknown> {
  const projectId = getOptionalNumber(args, 'projectId') ?? contextSnapshot.project?.id
  const limit = getOptionalNumber(args, 'limit') ?? 50
  if (!projectId) throw new Error('projectId is required when no current project is selected')
  const [scripts, creativeReferences, episodes, scenes, storyboards, shots] = await Promise.all([
    backendList(`/projects/${projectId}/scripts`),
    backendList(`/projects/${projectId}/entities/creative-references`),
    backendList(`/projects/${projectId}/entities/productions`),
    backendList(`/projects/${projectId}/entities/segments`),
    backendList(`/projects/${projectId}/entities/storyboard-scripts`),
    backendList(`/projects/${projectId}/entities/content-units`),
  ])
  return {
    projectId,
    counts: {
      scripts: scripts.length,
      creativeReferences: creativeReferences.length,
      episodes: episodes.length,
      scenes: scenes.length,
      storyboards: storyboards.length,
      shots: shots.length,
    },
    scripts: scripts.slice(0, limit).map(summarizeEntity),
    creativeReferences: creativeReferences.slice(0, limit).map(summarizeEntity),
    episodes: episodes.slice(0, limit).map(summarizeEntity),
    scenes: scenes.slice(0, limit).map((scene) => {
      const summary = summarizeEntityObject(scene)
      return {
        ...summary,
        storyboards: storyboards.filter((storyboard) => Number(storyboard?.scene_id) === Number(scene?.ID ?? scene?.id)).length,
        shots: shots.filter((shot) => storyboards.some((storyboard) => Number(storyboard?.scene_id) === Number(scene?.ID ?? scene?.id) && Number(shot?.storyboard_id) === Number(storyboard?.ID ?? storyboard?.id))).length,
      }
    }),
    storyboards: storyboards.slice(0, limit).map((storyboard) => ({
      ...summarizeEntityObject(storyboard),
      shots: shots.filter((shot) => Number(shot?.storyboard_id) === Number(storyboard?.ID ?? storyboard?.id)).length,
    })),
    shots: shots.slice(0, limit).map(summarizeEntity),
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
    : ['script', 'creative_reference', 'asset', 'episode', 'scene', 'storyboard', 'shot']

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
    status: 'draft',
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
    return {
      status: 'queued',
      job,
      jobId: initialJobId,
      message: `生成任务已创建${initialJobId ? `（Job #${initialJobId}）` : ''}。`,
    }
  }
  if (!initialJobId) throw new Error('generation job was created without an ID')

  const timeoutMs = getOptionalNumeric(args, 'timeout_ms') ?? (jobType.startsWith('video') ? 600_000 : 180_000)
  const pollIntervalMs = clampNumber(getOptionalNumeric(args, 'poll_interval_ms') ?? 2500, 500, 15_000)
  const finalJob = await waitForGenerationJob(initialJobId, timeoutMs, pollIntervalMs)
  const outputResourceId = isRecord(finalJob) && typeof finalJob.output_resource_id === 'number' ? finalJob.output_resource_id : undefined
  const outputResource = isRecord(finalJob) && isRecord(finalJob.output_resource)
    ? finalJob.output_resource
    : outputResourceId
      ? await findRawResourceById(outputResourceId)
      : undefined
  const finalStatus = isRecord(finalJob) && typeof finalJob.status === 'string' ? finalJob.status : 'unknown'

  return {
    status: finalStatus,
    job: finalJob,
    jobId: initialJobId,
    output_resource: outputResource,
    ...(outputResourceId ? { output_resource_id: outputResourceId } : {}),
    media: outputResource ? {
      id: outputResourceId ?? getRawResourceId(outputResource),
      type: outputResource.type,
      name: outputResource.name,
      url: outputResource.url,
      direct_url: outputResource.direct_url,
      mime_type: outputResource.mime_type,
    } : undefined,
    message: finalStatus === 'succeeded'
      ? `生成完成${outputResourceId ? `，输出资源 #${outputResourceId}` : ''}。`
      : `生成任务结束，状态：${finalStatus}。`,
  }
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

function getJobId(job: unknown): number | undefined {
  if (!isRecord(job)) return undefined
  const id = Number(job.ID ?? job.id)
  return Number.isFinite(id) && id > 0 ? id : undefined
}

function getRawResourceId(resource: Record<string, unknown>): number | undefined {
  const id = Number(resource.ID ?? resource.id)
  return Number.isFinite(id) && id > 0 ? id : undefined
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

async function checkEntityConflicts(args: Record<string, unknown>): Promise<unknown> {
  const projectId = getRequiredNumber(args, 'projectId')
  const productionId = getRequiredNumber(args, 'productionId')
  const scope = typeof args.scope === 'string' && args.scope === 'project' ? 'project' : 'production'
  const candidates = isRecord(args.candidates) ? args.candidates : {}

  const [segments, sceneMoments, creativeReferences, assetSlots, contentUnits] = await Promise.all([
    backendList(`/projects/${projectId}/entities/segments`),
    backendList(`/projects/${projectId}/entities/scene-moments`),
    backendList(`/projects/${projectId}/entities/creative-references`),
    backendList(`/projects/${projectId}/entities/asset-slots`),
    backendList(`/projects/${projectId}/entities/content-units`),
  ])

  const productionSegments = segments.filter((s: any) => Number(s.production_id) === productionId)

  function checkConflict(
    proposed: any[],
    existing: any[],
    matchFn: (p: any, e: any) => boolean,
    similarityFn: (p: any, e: any) => number,
  ): any[] {
    return proposed.map((candidate) => {
      const exactMatch = existing.find((e) => matchFn(candidate, e))
      if (exactMatch) {
        return {
          ...candidate,
          conflict_status: 'duplicate',
          conflict_entity_id: Number(exactMatch.ID ?? exactMatch.id),
          conflict_entity_name: exactMatch.name ?? exactMatch.title ?? '',
          conflict_similarity: 1.0,
        }
      }
      const similar = existing
        .map((e) => ({ entity: e, score: similarityFn(candidate, e) }))
        .filter((r) => r.score >= 0.7)
        .sort((a, b) => b.score - a.score)[0]
      if (similar) {
        return {
          ...candidate,
          conflict_status: 'duplicate',
          conflict_entity_id: Number(similar.entity.ID ?? similar.entity.id),
          conflict_entity_name: similar.entity.name ?? similar.entity.title ?? '',
          conflict_similarity: similar.score,
        }
      }
      return { ...candidate, conflict_status: 'none' }
    })
  }

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

  function exactNameMatch(a: any, b: any): boolean {
    return String(a.name ?? a.title ?? '').toLowerCase().trim() ===
      String(b.name ?? b.title ?? '').toLowerCase().trim()
  }

  function segmentMatch(a: any, b: any): boolean {
    return exactNameMatch(a, b) && Number(b.production_id) === productionId
  }

  const checkedSegments = checkConflict(
    getArray(candidates.segments),
    productionSegments,
    segmentMatch,
    nameSimilarity,
  )
  const checkedSceneMoments = checkConflict(
    getArray(candidates.scene_moments),
    sceneMoments,
    exactNameMatch,
    nameSimilarity,
  )

  // For creative_references: project scope checks all existing refs (project-level entities have no production_id)
  // Returns reuse_candidates for items that already exist at project level
  const creativeRefCandidates = getArray(candidates.creative_references)
  const checkedCreativeReferences = creativeRefCandidates.map((candidate) => {
    const exactMatch = creativeReferences.find(
      (e: any) => exactNameMatch(candidate, e) && (candidate.type ?? candidate.kind) === (e.kind ?? e.type),
    )
    if (exactMatch) {
      return {
        ...candidate,
        conflict_status: 'duplicate',
        conflict_entity_id: Number(exactMatch.ID ?? exactMatch.id),
        conflict_entity_name: exactMatch.name ?? exactMatch.title ?? '',
        conflict_similarity: 1.0,
        ...(scope === 'project' ? { reuse_action: 'reuse', reuse_source: 'project' } : {}),
      }
    }
    const similar = creativeReferences
      .map((e: any) => ({
        entity: e,
        score: Math.min(1, nameSimilarity(candidate, e) + ((candidate.type ?? candidate.kind) === (e.kind ?? e.type) ? 0.2 : 0)),
      }))
      .filter((r: any) => r.score >= 0.7)
      .sort((a: any, b: any) => b.score - a.score)[0]
    if (similar) {
      return {
        ...candidate,
        conflict_status: 'duplicate',
        conflict_entity_id: Number(similar.entity.ID ?? similar.entity.id),
        conflict_entity_name: similar.entity.name ?? similar.entity.title ?? '',
        conflict_similarity: similar.score,
        ...(scope === 'project' ? { reuse_action: 'reuse', reuse_source: 'project' } : {}),
      }
    }
    return { ...candidate, conflict_status: 'none' }
  })

  // reuse_candidates: project-level CreativeReferences that match proposed ones
  const reuseCandidates = scope === 'project'
    ? checkedCreativeReferences
        .filter((c: any) => c.conflict_status === 'duplicate')
        .map((c: any) => ({
          proposed_client_id: c.client_id,
          existing_id: c.conflict_entity_id,
          existing_name: c.conflict_entity_name,
          similarity: c.conflict_similarity,
          source: 'project',
        }))
    : []

  const checkedAssetSlots = checkConflict(
    getArray(candidates.asset_slots),
    assetSlots,
    exactNameMatch,
    nameSimilarity,
  )
  const checkedContentUnits = checkConflict(
    getArray(candidates.content_units),
    contentUnits,
    exactNameMatch,
    nameSimilarity,
  )

  const conflictCounts = {
    segments: checkedSegments.filter((c) => c.conflict_status !== 'none').length,
    scene_moments: checkedSceneMoments.filter((c) => c.conflict_status !== 'none').length,
    creative_references: checkedCreativeReferences.filter((c: any) => c.conflict_status !== 'none').length,
    asset_slots: checkedAssetSlots.filter((c) => c.conflict_status !== 'none').length,
    content_units: checkedContentUnits.filter((c) => c.conflict_status !== 'none').length,
  }

  return {
    scope,
    conflict_counts: conflictCounts,
    total_conflicts: Object.values(conflictCounts).reduce((sum, n) => sum + n, 0),
    ...(scope === 'project' && reuseCandidates.length > 0 ? { reuse_candidates: reuseCandidates } : {}),
    candidates: {
      segments: checkedSegments,
      scene_moments: checkedSceneMoments,
      creative_references: checkedCreativeReferences,
      asset_slots: checkedAssetSlots,
      content_units: checkedContentUnits,
    },
  }
}

function proposeProductionEntities(args: Record<string, unknown>): unknown {
  const projectId = getRequiredNumber(args, 'projectId')
  const productionId = getRequiredNumber(args, 'productionId')
  const analysisScope = typeof args.analysisScope === 'string' ? args.analysisScope : 'production'
  const summary = typeof args.summary === 'string' ? args.summary : ''
  const proposal = isRecord(args.proposal) ? args.proposal : null
  const candidates = isRecord(args.candidates) ? args.candidates : {}

  // Supersede existing draft proposals for the same production
  const supersededIds: string[] = []
  for (const [id, draft] of drafts.entries()) {
    if (
      draft.projectId === projectId &&
      draft.kind === 'production_proposal' &&
      draft.status === 'draft' &&
      isRecord(draft.source) &&
      Number(draft.source.entityId) === productionId
    ) {
      drafts.set(id, { ...draft, status: 'superseded', updatedAt: new Date().toISOString() })
      supersededIds.push(id)
    }
  }

  const now = new Date().toISOString()
  const draftId = `prod_proposal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

  const draft: MCPDraft = {
    id: draftId,
    projectId,
    kind: 'production_proposal',
    status: 'draft',
    title: `制作编排提案 — ${analysisScope}`,
    content: JSON.stringify({
      productionId,
      analysisScope,
      summary,
      ...(proposal ? { proposal } : { candidates }),
      proposedAt: now,
    }),
    source: { entityType: 'production', entityId: productionId },
    createdAt: now,
    updatedAt: now,
  }

  drafts.set(draftId, draft)

  // Count proposed entities
  let counts: Record<string, number>
  if (proposal) {
    const segments = getArray(proposal.segments)
    const sceneMoments = segments.flatMap((s: any) => getArray(s.scene_moments))
    const contentUnits = sceneMoments.flatMap((sm: any) => getArray(sm.content_units))
    const creativeRefs = sceneMoments.flatMap((sm: any) => getArray(sm.creative_references))
    const assetSlots = sceneMoments.flatMap((sm: any) => getArray(sm.asset_slots))
    counts = {
      segments: segments.length,
      scene_moments: sceneMoments.length,
      content_units: contentUnits.length,
      creative_references: creativeRefs.length,
      asset_slots: assetSlots.length,
    }
  } else {
    counts = {
      segments: getArray(candidates.segments).length,
      scene_moments: getArray(candidates.scene_moments).length,
      creative_references: getArray(candidates.creative_references).length,
      asset_slots: getArray(candidates.asset_slots).length,
      content_units: getArray(candidates.content_units).length,
    }
  }

  const total = Object.values(counts).reduce((s, n) => s + n, 0)
  return {
    draftId,
    status: 'proposed',
    counts,
    supersededDraftIds: supersededIds,
    message: `已写入 ${total} 个候选实体${supersededIds.length > 0 ? `，已替换 ${supersededIds.length} 个旧提案` : ''}`,
  }
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

function collectionForEntity(entityType: string): string {
  switch (entityType) {
    case 'script':
      return 'scripts'
    case 'creative_reference':
      return 'entities/creative-references'
    case 'asset':
      return 'entities/asset-slots'
    case 'episode':
      return 'entities/productions'
    case 'scene':
      return 'entities/segments'
    case 'storyboard':
      return 'entities/storyboard-scripts'
    case 'shot':
      return 'entities/content-units'
    default:
      throw new Error(`Unsupported entity type: ${entityType}`)
  }
}

function routeForEntity(entityType: string): string {
  switch (entityType) {
    case 'project':
      return '/projects'
    case 'script':
      return '/scripts'
    case 'creative_reference':
      return '/creative-references'
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
    default:
      throw new Error(`Unsupported entity type: ${entityType}`)
  }
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

async function backendPost(path: string, body: Record<string, unknown>): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (contextAuthToken) headers.Authorization = `Bearer ${contextAuthToken}`

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
    if (typeof value.draftCount === 'number') lines.push('', `本地草稿数量：${value.draftCount}`)
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
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
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
