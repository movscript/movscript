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
let contextAuthToken = ''

export function updateMCPContextSnapshot(next: MCPContextSnapshot & { auth?: { token: string } | null }): void {
  contextSnapshot.route = next.route
  contextSnapshot.project = next.project
  contextSnapshot.user = next.user
  contextSnapshot.selection = next.selection
  contextSnapshot.updatedAt = next.updatedAt
  contextAuthToken = next.auth?.token ?? ''
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
  return resourceContent(uri, summarizeResource(data))
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
    case 'scripts':
    case 'settings':
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
          entityType: { type: 'string', enum: ['project', 'script', 'setting', 'asset', 'episode', 'scene', 'storyboard', 'shot'] },
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
      name: 'movscript.read_project_structure',
      description: 'Read compact project structure across scripts, settings, episodes, scenes, storyboards, and shots.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number' },
          limit: { type: 'number' },
        }
      ),
    },
    {
      name: 'movscript.create_draft',
      description: 'Create a local draft artifact. This does not write to MovScript project entities.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number' },
          kind: { type: 'string', enum: ['script', 'setting', 'storyboard', 'shot', 'prompt', 'note', 'pipeline'] },
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
          entityType: { type: 'string', enum: ['project', 'script', 'setting', 'asset', 'episode', 'scene', 'storyboard', 'shot'] },
          entityId: { type: 'number' },
        },
        ['entityType']
      ),
    },
    {
      name: 'movscript.read_production_context',
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
      name: 'movscript.check_entity_conflicts',
      description: 'Given a list of proposed production entities, check each one against existing entities and return conflict status: "none" (safe to create), "duplicate" (very similar entity exists), or "supersedes" (new version replaces old). Always call this before propose_production_entities.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number' },
          productionId: { type: 'number' },
          candidates: {
            type: 'object',
            description: 'Object with keys: segments, scene_moments, creative_references, asset_slots, content_units — each an array of candidate objects with client_id and identifying fields.',
          },
        },
        ['projectId', 'productionId', 'candidates']
      ),
    },
    {
      name: 'movscript.propose_production_entities',
      description: 'Write the final analysis result — all five entity types with their relationships and conflict statuses — into a draft so the frontend can display them for user review. Call this as the last step after check_entity_conflicts.',
      inputSchema: objectSchema(
        {
          projectId: { type: 'number' },
          productionId: { type: 'number' },
          analysisScope: { type: 'string' },
          candidates: {
            type: 'object',
            description: 'Object with keys: segments, scene_moments, creative_references, asset_slots, content_units — each an array with conflict_status field added.',
          },
          summary: { type: 'string' },
        },
        ['projectId', 'productionId', 'candidates']
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
    case 'movscript.read_project_structure':
      return toolText(await readProjectStructure(args))
    case 'movscript.create_draft':
      return toolText(createDraft(args))
    case 'movscript.list_drafts':
      return toolText(listDrafts(args))
    case 'movscript.open_entity':
      return toolText(openEntity(args))
    case 'movscript.read_production_context':
      return toolText(await readProductionContext(args))
    case 'movscript.check_entity_conflicts':
      return toolText(await checkEntityConflicts(args))
    case 'movscript.propose_production_entities':
      return toolText(proposeProductionEntities(args))
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

async function readProjectStructure(args: Record<string, unknown>): Promise<unknown> {
  const projectId = getOptionalNumber(args, 'projectId') ?? contextSnapshot.project?.id
  const limit = getOptionalNumber(args, 'limit') ?? 50
  if (!projectId) throw new Error('projectId is required when no current project is selected')
  const [scripts, settings, episodes, scenes, storyboards, shots] = await Promise.all([
    backendList(`/projects/${projectId}/scripts`),
    backendList(`/projects/${projectId}/settings`),
    backendList(`/projects/${projectId}/entities/productions`),
    backendList(`/projects/${projectId}/entities/segments`),
    backendList(`/projects/${projectId}/entities/storyboard-scripts`),
    backendList(`/projects/${projectId}/entities/content-units`),
  ])
  return {
    projectId,
    counts: {
      scripts: scripts.length,
      settings: settings.length,
      episodes: episodes.length,
      scenes: scenes.length,
      storyboards: storyboards.length,
      shots: shots.length,
    },
    scripts: scripts.slice(0, limit).map(summarizeEntity),
    settings: settings.slice(0, limit).map(summarizeEntity),
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
    : ['script', 'setting', 'asset', 'episode', 'scene', 'storyboard', 'shot']

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
  if (includeScriptText && production?.script_version_id) {
    try {
      const scriptVersions = await backendList(`/projects/${projectId}/entities/script-versions`)
      const version = scriptVersions.find((v: any) => Number(v.ID ?? v.id) === Number(production.script_version_id))
      scriptText = version?.content || version?.raw_source || undefined
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
    ...(scriptText !== undefined ? { scriptText: scriptText.length > 8000 ? scriptText.slice(0, 8000) + '...' : scriptText } : {}),
  }
}

async function checkEntityConflicts(args: Record<string, unknown>): Promise<unknown> {
  const projectId = getRequiredNumber(args, 'projectId')
  const productionId = getRequiredNumber(args, 'productionId')
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
  const checkedCreativeReferences = checkConflict(
    getArray(candidates.creative_references),
    creativeReferences,
    (a, b) => exactNameMatch(a, b) && (a.type ?? a.kind) === (b.kind ?? b.type),
    (a, b) => {
      const nameSim = nameSimilarity(a, b)
      const kindMatch = (a.type ?? a.kind) === (b.kind ?? b.type) ? 0.2 : 0
      return Math.min(1, nameSim + kindMatch)
    },
  )
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
    creative_references: checkedCreativeReferences.filter((c) => c.conflict_status !== 'none').length,
    asset_slots: checkedAssetSlots.filter((c) => c.conflict_status !== 'none').length,
    content_units: checkedContentUnits.filter((c) => c.conflict_status !== 'none').length,
  }

  return {
    conflict_counts: conflictCounts,
    total_conflicts: Object.values(conflictCounts).reduce((sum, n) => sum + n, 0),
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
  const candidates = isRecord(args.candidates) ? args.candidates : {}
  const analysisScope = typeof args.analysisScope === 'string' ? args.analysisScope : 'production'
  const summary = typeof args.summary === 'string' ? args.summary : ''

  const now = new Date().toISOString()
  const draftId = `prod_proposal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

  const draft: MCPDraft = {
    id: draftId,
    projectId,
    kind: 'pipeline',
    title: `制作编排候选 — ${analysisScope}`,
    content: JSON.stringify({
      productionId,
      analysisScope,
      summary,
      candidates,
      proposedAt: now,
    }),
    source: { entityType: 'production', entityId: productionId },
    createdAt: now,
    updatedAt: now,
  }

  drafts.set(draftId, draft)

  const counts = {
    segments: getArray(candidates.segments).length,
    scene_moments: getArray(candidates.scene_moments).length,
    creative_references: getArray(candidates.creative_references).length,
    asset_slots: getArray(candidates.asset_slots).length,
    content_units: getArray(candidates.content_units).length,
  }
  const conflictCounts = {
    segments: getArray(candidates.segments).filter((c: any) => c.conflict_status === 'duplicate').length,
    scene_moments: getArray(candidates.scene_moments).filter((c: any) => c.conflict_status === 'duplicate').length,
    creative_references: getArray(candidates.creative_references).filter((c: any) => c.conflict_status === 'duplicate').length,
    asset_slots: getArray(candidates.asset_slots).filter((c: any) => c.conflict_status === 'duplicate').length,
    content_units: getArray(candidates.content_units).filter((c: any) => c.conflict_status === 'duplicate').length,
  }

  return {
    draftId,
    status: 'proposed',
    counts,
    conflict_counts: conflictCounts,
    message: `已写入 ${Object.values(counts).reduce((s, n) => s + n, 0)} 个候选（其中 ${Object.values(conflictCounts).reduce((s, n) => s + n, 0)} 个有冲突需用户决策）`,
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

function getArray(value: unknown): any[] {
  return Array.isArray(value) ? value : []
}

function collectionForEntity(entityType: string): string {
  switch (entityType) {
    case 'script':
      return 'scripts'
    case 'setting':
      return 'settings'
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
    default:
      throw new Error(`Unsupported entity type: ${entityType}`)
  }
}

async function backendGet(path: string): Promise<any> {
  const headers: Record<string, string> = {}
  if (contextAuthToken) headers.Authorization = `Bearer ${contextAuthToken}`

  const res = await fetch(`${API_BASE_URL}${path}`, { headers })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Backend GET ${path} failed: HTTP ${res.status} ${text}`)
  }
  return res.json()
}

function summarizeResource(data: unknown): unknown {
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
