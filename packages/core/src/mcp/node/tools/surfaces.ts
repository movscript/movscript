export {
  AGENT_SURFACE_ROUTES,
  agentGenerationJobPath,
  candidateIdFromArgs,
  createAgentBrowserSurface,
  createContentCandidatesSurface,
  createGenerationJobSurface,
  createImpactSurface,
  createPreviewTimelineSurface,
  createProjectStatusSurface,
  createPromptSurface,
  projectIdFromArgs,
  resolveFrontendOrigin,
  resolveMCPProxyBaseURL,
} from '../../../agent/surfaces.js'

export type {
  AgentBrowserSurface,
  AgentSurfaceEntity,
  AgentSurfaceInput,
  AgentSurfaceIntent,
  AgentSurfaceMode,
  AgentSurfaceRouteKey,
} from '../../../agent/surfaces.js'
import {
  createAgentBrowserSurface,
  type AgentBrowserSurface,
} from '../../../agent/surfaces.js'

const RESOURCE_AGENT_ROUTES = {
  resources: '/agent/resources',
  resourceDetail: '/agent/resources/:resourceId',
} as const

export function agentResourceDetailPath(resourceId: string | number): string {
  return `/agent/resources/${encodeURIComponent(String(resourceId))}`
}

export function createResourceLibrarySurface(
  args: Record<string, unknown>,
  query?: Record<string, string | number | boolean | undefined>,
): AgentBrowserSurface {
  return createAgentBrowserSurface(args, {
    route: RESOURCE_AGENT_ROUTES.resources,
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
