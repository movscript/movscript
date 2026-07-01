import {
  normalizeDomainFocus,
  type MovScriptNormalizedFocus,
} from '@movscript/domain'

export type AgentSurfaceMode = 'inspect' | 'review' | 'edit'

export type AgentSurfaceIntent =
  | 'open_resource_library'
  | 'inspect_resource'
  | 'edit_prompt'
  | 'monitor_generation'
  | 'review_candidates'
  | 'preview_timeline'
  | 'review_impact'
  | 'inspect_project_status'

export type AgentSurfaceEntity = {
  project_id?: string | number
  project_uid?: string
  content_unit_id?: string | number
  candidate_id?: string
  resource_id?: number
  stream_id?: string
  job_id?: number
  production_id?: string | number
  scene_moment_id?: string | number
  timeline_scope_kind?: string
  timeline_scope_ref?: string | number
  target_category?: string
  target_kind?: string
  target_ref?: string | number
  domain_focus?: MovScriptNormalizedFocus
}

export type AgentBrowserSurface = {
  kind: 'browser_url'
  surface: AgentSurfaceMode
  title: string
  route: string
  url: string
  frontend_origin: string
  mcp_api_base_url: string
  api_proxy: {
    base_url: string
    auth: 'agent_mcp_context'
  }
  entity?: AgentSurfaceEntity
  intent: AgentSurfaceIntent
  usage: string
}

export type AgentSurfaceInput = {
  route: string
  title: string
  surface: AgentSurfaceMode
  intent: AgentSurfaceIntent
  usage: string
  entity?: AgentSurfaceEntity
  query?: Record<string, string | number | boolean | undefined>
}

export type AgentTimelineSurfaceInput = {
  projectId?: string | number
  productionId?: string | number
  scopeKind?: string
  scopeRef?: string | number
  namespaceKind?: string
  namespaceRef?: string | number
  namespacePath?: string
  targetCategory?: string
  targetKind?: string
  targetRef?: string | number
}

export const AGENT_SURFACE_ROUTES = {
  resources: '/agent/resources',
  resourceDetail: '/agent/resources/:resourceId',
  contentPrompt: '/agent/content/prompt',
  contentCandidates: '/agent/content/candidates',
  generationJob: '/agent/generation/jobs/:jobId',
  previewTimeline: '/agent/preview/timeline',
  impact: '/agent/impact',
  projectStatus: '/agent/project/status',
} as const

export type AgentSurfaceRouteKey = keyof typeof AGENT_SURFACE_ROUTES

export function agentResourceDetailPath(resourceId: string | number): string {
  return `/agent/resources/${encodeURIComponent(String(resourceId))}`
}

export function agentGenerationJobPath(jobId: string | number): string {
  return `/agent/generation/jobs/${encodeURIComponent(String(jobId))}`
}

export function createAgentBrowserSurface(args: Record<string, unknown>, input: AgentSurfaceInput): AgentBrowserSurface {
  const frontendOrigin = resolveFrontendOrigin(args)
  const proxyBaseURL = resolveMCPProxyBaseURL(args)
  const mcpApiBaseURL = `${proxyBaseURL}/agent-api/v1`
  const url = new URL(input.route, frontendOrigin)
  url.searchParams.set('mcpApiBaseURL', mcpApiBaseURL)
  url.searchParams.set('source', 'mcp')
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined) continue
    url.searchParams.set(key, String(value))
  }

  return {
    kind: 'browser_url',
    surface: input.surface,
    title: input.title,
    route: input.route,
    url: url.toString(),
    frontend_origin: frontendOrigin,
    mcp_api_base_url: mcpApiBaseURL,
    api_proxy: {
      base_url: mcpApiBaseURL,
      auth: 'agent_mcp_context',
    },
    ...(input.entity ? { entity: input.entity } : {}),
    intent: input.intent,
    usage: input.usage,
  }
}

export function createResourceLibrarySurface(args: Record<string, unknown>, query?: Record<string, string | number | boolean | undefined>): AgentBrowserSurface {
  return createAgentBrowserSurface(args, {
    route: AGENT_SURFACE_ROUTES.resources,
    title: 'MovScript resource library',
    surface: 'inspect',
    intent: 'open_resource_library',
    query,
    usage: 'Open url in an agent in-app browser. The page uses the local MovScript MCP proxy, which forwards requests with the active agent context.',
  })
}

export function createResourceDetailSurface(
  args: Record<string, unknown>,
  resourceId: number,
): AgentBrowserSurface {
  return createAgentBrowserSurface(args, {
    route: agentResourceDetailPath(resourceId),
    title: `MovScript resource #${resourceId}`,
    surface: 'inspect',
    intent: 'inspect_resource',
    entity: { resource_id: resourceId },
    query: { resourceId },
    usage: 'Open this resource detail surface to inspect the RawResource preview, metadata, provenance, and candidate usage context.',
  })
}

export function createPromptSurface(
  args: Record<string, unknown>,
  input: { contentUnitId: string | number; mode?: 'inspect' | 'edit'; projectId?: string | number },
): AgentBrowserSurface {
  return createAgentBrowserSurface(args, {
    route: AGENT_SURFACE_ROUTES.contentPrompt,
    title: `Content unit prompt ${String(input.contentUnitId)}`,
    surface: input.mode === 'inspect' ? 'inspect' : 'edit',
    intent: 'edit_prompt',
    entity: {
      ...(input.projectId !== undefined ? { project_id: input.projectId } : {}),
      content_unit_id: input.contentUnitId,
    },
    query: {
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      contentUnitId: input.contentUnitId,
      mode: input.mode ?? 'edit',
    },
    usage: 'Open this prompt workbench to inspect semantic refs, blockers, compiled prompt text, provider prompt text, and generation inputs.',
  })
}

export function createGenerationJobSurface(
  args: Record<string, unknown>,
  input: { jobId: number; contentUnitId?: string | number; projectId?: string | number },
): AgentBrowserSurface {
  return createAgentBrowserSurface(args, {
    route: agentGenerationJobPath(input.jobId),
    title: `Generation job #${input.jobId}`,
    surface: 'inspect',
    intent: 'monitor_generation',
    entity: {
      job_id: input.jobId,
      ...(input.projectId !== undefined ? { project_id: input.projectId } : {}),
      ...(input.contentUnitId !== undefined ? { content_unit_id: input.contentUnitId } : {}),
    },
    query: {
      jobId: input.jobId,
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.contentUnitId !== undefined ? { contentUnitId: input.contentUnitId } : {}),
    },
    usage: 'Open this generation job surface to monitor status, inspect inputs, preview outputs, and continue to candidate review after success.',
  })
}

export function createContentCandidatesSurface(
  args: Record<string, unknown>,
  input: { contentUnitId: string | number; candidateId?: string; resourceId?: number; streamId?: string | number; projectId?: string | number },
): AgentBrowserSurface {
  return createAgentBrowserSurface(args, {
    route: AGENT_SURFACE_ROUTES.contentCandidates,
    title: `Content unit candidates ${String(input.contentUnitId)}`,
    surface: 'review',
    intent: 'review_candidates',
    entity: {
      ...(input.projectId !== undefined ? { project_id: input.projectId } : {}),
      content_unit_id: input.contentUnitId,
      ...(input.candidateId ? { candidate_id: input.candidateId } : {}),
      ...(input.resourceId !== undefined ? { resource_id: input.resourceId } : {}),
      ...(input.streamId !== undefined ? { stream_id: String(input.streamId) } : {}),
    },
    query: {
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      contentUnitId: input.contentUnitId,
      ...(input.candidateId ? { candidateId: input.candidateId } : {}),
      ...(input.resourceId !== undefined ? { resourceId: input.resourceId } : {}),
      ...(input.streamId !== undefined ? { streamId: String(input.streamId) } : {}),
    },
    usage: 'Open this candidate review surface to compare generated candidates, inspect prompt snapshots, and adopt, reject, or defer a content-unit candidate.',
  })
}

export function createPreviewTimelineSurface(
  args: Record<string, unknown>,
  input: AgentTimelineSurfaceInput,
): AgentBrowserSurface {
  const focus = resolveTimelineSurfaceFocus(input)
  return createAgentBrowserSurface(args, {
    route: AGENT_SURFACE_ROUTES.previewTimeline,
    title: `Timeline preview ${focus.label}`,
    surface: 'review',
    intent: 'preview_timeline',
    entity: focus.entity,
    query: focus.query,
    usage: 'Open this preview timeline surface to inspect selected scene-moment outputs for a timeline assembly or legacy production scope.',
  })
}

export function createImpactSurface(
  args: Record<string, unknown>,
  input: { projectId?: string | number; target?: string | number; source?: string },
): AgentBrowserSurface {
  return createAgentBrowserSurface(args, {
    route: AGENT_SURFACE_ROUTES.impact,
    title: 'MovScript change impact',
    surface: 'review',
    intent: 'review_impact',
    entity: {
      ...(input.projectId !== undefined ? { project_id: input.projectId } : {}),
    },
    query: {
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
      ...(input.target !== undefined ? { target: input.target } : {}),
      ...(input.source ? { source: input.source } : {}),
    },
    usage: 'Open this impact surface to review affected content units, stale selections, and explicit keep, relink, re-prompt, regenerate, or accept-stale decisions.',
  })
}

export function createProjectStatusSurface(
  args: Record<string, unknown>,
  input: AgentTimelineSurfaceInput = {},
): AgentBrowserSurface {
  const focus = resolveTimelineSurfaceFocus(input)
  return createAgentBrowserSurface(args, {
    route: AGENT_SURFACE_ROUTES.projectStatus,
    title: 'MovScript project status',
    surface: 'inspect',
    intent: 'inspect_project_status',
    entity: focus.entity,
    query: focus.query,
    usage: 'Open this project status surface to inspect timeline readiness, candidate coverage, selections, stale hints, and blockers.',
  })
}

function resolveTimelineSurfaceFocus(input: AgentTimelineSurfaceInput): {
  focus: MovScriptNormalizedFocus
  legacyProductionId?: string | number
  label: string
  entity: AgentSurfaceEntity
  query: Record<string, string | number | boolean | undefined>
} {
  const focusInput = {
    projectId: input.projectId,
    productionId: input.productionId,
    scopeKind: input.scopeKind,
    scopeRef: input.scopeRef,
    namespaceKind: input.namespaceKind,
    namespaceRef: input.namespaceRef,
    namespacePath: input.namespacePath,
    targetCategory: input.targetCategory,
    targetKind: input.targetKind,
    targetRef: input.targetRef,
  }
  const focus = normalizeDomainFocus(focusInput)
  const legacyProductionId = input.productionId ?? (focus.scope?.kind === 'production' ? focus.scope.ref : undefined)
  const entity: AgentSurfaceEntity = {
    ...(input.projectId !== undefined ? { project_id: input.projectId } : {}),
    ...(legacyProductionId !== undefined ? { production_id: legacyProductionId } : {}),
    ...(focus.scope ? {
      timeline_scope_kind: focus.scope.kind,
      timeline_scope_ref: focus.scope.ref,
    } : {}),
    ...(focus.target?.targetCategory ? { target_category: focus.target.targetCategory } : {}),
    ...(focus.target?.targetKind ? { target_kind: focus.target.targetKind } : {}),
    ...(focus.target?.targetRef !== undefined ? { target_ref: focus.target.targetRef } : {}),
    domain_focus: focus,
  }
  const query = {
    ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    ...(legacyProductionId !== undefined ? { productionId: legacyProductionId } : {}),
    ...(focus.scope ? {
      scopeKind: focus.scope.kind,
      scopeRef: focus.scope.ref,
    } : {}),
    ...(focus.target?.targetCategory ? { targetCategory: focus.target.targetCategory } : {}),
    ...(focus.target?.targetKind ? { targetKind: focus.target.targetKind } : {}),
    ...(focus.target?.targetRef !== undefined ? { targetRef: focus.target.targetRef } : {}),
  }
  return {
    focus,
    ...(legacyProductionId !== undefined ? { legacyProductionId } : {}),
    label: timelineFocusLabel(focus, legacyProductionId),
    entity,
    query,
  }
}

function timelineFocusLabel(focus: MovScriptNormalizedFocus, legacyProductionId: string | number | undefined): string {
  if (focus.scope?.kind && focus.scope.ref) return `${focus.scope.kind} ${focus.scope.ref}`
  if (focus.target?.targetKind && focus.target.targetRef) return `${focus.target.targetKind} ${focus.target.targetRef}`
  if (legacyProductionId !== undefined) return `production ${String(legacyProductionId)}`
  return 'project'
}

export function projectIdFromArgs(args: Record<string, unknown>): string | number | undefined {
  const value = args.projectId ?? args.project_id
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

export function candidateIdFromArgs(args: Record<string, unknown>): string | undefined {
  return getOptionalString(args, 'candidateId') ?? getOptionalString(args, 'candidate_id')
}

export function resolveFrontendOrigin(args: Record<string, unknown>): string {
  return normalizeHTTPOrigin(
    getOptionalString(args, 'frontend_origin')
      ?? getOptionalString(args, 'frontendOrigin')
      ?? process.env.MOVSCRIPT_FRONTEND_ORIGIN
      ?? process.env.VITE_DEV_SERVER_URL
      ?? 'http://127.0.0.1:5173',
  )
}

export function resolveMCPProxyBaseURL(args: Record<string, unknown>): string {
  const explicit = getOptionalString(args, 'mcp_base_url') ?? getOptionalString(args, 'mcpBaseURL')
  if (explicit) return normalizeHTTPOrigin(explicit)
  const endpoint = process.env.MOVSCRIPT_MCP_ENDPOINT
  if (endpoint) {
    try {
      const url = new URL(endpoint)
      return normalizeHTTPOrigin(url.origin)
    } catch {
      // Fall through to the default local MCP origin.
    }
  }
  const port = process.env.MOVSCRIPT_MCP_PORT || '28765'
  return normalizeHTTPOrigin(`http://127.0.0.1:${port}`)
}

function getOptionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeHTTPOrigin(value: string): string {
  const url = new URL(value.trim())
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Expected http(s) URL, got ${value}`)
  }
  return url.origin
}
