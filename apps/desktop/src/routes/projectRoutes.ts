import { AGENT_SURFACE_ROUTES, PROJECT_SURFACE_ROUTES } from '@movscript/project-surface/routes'
import { RESOURCE_SURFACE_ROUTES } from '@movscript/resource-surface/routes'
import { routePathWithParams } from '@movscript/shared/surface-routes'

export const ROUTES = {
  root: '/',
  onboarding: '/onboarding',
  projects: '/projects',
  projectData: '/project-data',
  user: '/user',
  appSettings: '/app/settings',
  invite: '/invite/:token',
  orgSelect: '/org/select',
  orgSettings: '/org/settings',
  canvases: '/canvases',
  canvasEditor: '/canvases/:id',
  editing: '/editing',
  editingProject: '/editing/:editingProjectId',
  resources: RESOURCE_SURFACE_ROUTES.resources,
  providerAssetLibrary: RESOURCE_SURFACE_ROUTES.providerAssetLibrary,
  agentResources: RESOURCE_SURFACE_ROUTES.agentResources,
  agentResourceDetail: RESOURCE_SURFACE_ROUTES.agentResourceDetail,
  agentContentPrompt: AGENT_SURFACE_ROUTES.contentPrompt,
  agentContentCandidates: AGENT_SURFACE_ROUTES.contentCandidates,
  agentGenerationJob: AGENT_SURFACE_ROUTES.generationJob,
  agentPreviewTimeline: AGENT_SURFACE_ROUTES.previewTimeline,
  agentImpact: AGENT_SURFACE_ROUTES.impact,
  agentProjectStatus: AGENT_SURFACE_ROUTES.projectStatus,
  studioOverview: PROJECT_SURFACE_ROUTES.overview,
  studioProgress: PROJECT_SURFACE_ROUTES.progress,
  studioDailies: PROJECT_SURFACE_ROUTES.dailies,
  studioLiveRoom: PROJECT_SURFACE_ROUTES.liveRoom,
  studioImpact: PROJECT_SURFACE_ROUTES.impact,
  studioTimeline: PROJECT_SURFACE_ROUTES.timeline,
  studioResources: RESOURCE_SURFACE_ROUTES.projectResources,
  studioScripts: PROJECT_SURFACE_ROUTES.scripts,
  studioStandards: PROJECT_SURFACE_ROUTES.standards,
  studioContent: PROJECT_SURFACE_ROUTES.content,
  studioContentCanvas: PROJECT_SURFACE_ROUTES.contentCanvas,
  studioContentPreview: PROJECT_SURFACE_ROUTES.contentPreview,
  studioRemotionStudio: PROJECT_SURFACE_ROUTES.remotionStudio,
  studioSettingPreview: PROJECT_SURFACE_ROUTES.settingPreview,
  studioSettings: PROJECT_SURFACE_ROUTES.settings,
  codexResources: '/codex/resources',
  externalResources: RESOURCE_SURFACE_ROUTES.externalResources,
  shotLibrary: '/shot-library',
  jobs: '/jobs',
  plugins: '/plugins',
  agentConsole: '/agent',
  agents: '/agents',
  agentProvider: '/agents/:providerRouteKey',
  modelProviders: '/model-providers',
  workspaceConfig: '/workspace/config',
  workspaceReview: '/workspace/review',
  agentConnections: '/agent/connections',
  agentSettings: '/agent/settings',
  project: {
    root: '/project',
    home: '/project/home',
    agent: '/project/agent',
    agentCanvases: '/project/agent/canvases',
    standards: '/project/standards',
    settings: '/project/settings',
    scripts: '/project/scripts/workbench',
    content: '/project/content',
    contentCanvas: '/project/content/canvas',
    contentPreview: '/project/content/preview',
    remotionStudio: '/project/remotion-studio',
    settingPreview: '/project/settings/preview',
    contentLegacy: '/project/content-orchestration/canvas',
    contentLegacyNext: '/project/content-orchestration/canvas-next',
  },
  tools: {
    image: '/tools/image',
    video: '/tools/video',
    audio: '/tools/audio',
    text: '/tools/text',
    privateAssets: RESOURCE_SURFACE_ROUTES.providerAssetLibrary,
    plugin: '/tools/plugin/:pluginId',
  },
} as const

export function withSearch(pathname: string, search = '') {
  if (!search) return pathname
  return `${pathname}${search.startsWith('?') ? search : `?${search}`}`
}

export function withRouteParams(pathname: string, params: Record<string, string | number | undefined>) {
  return routePathWithParams(pathname, params)
}

export function mergeSearch(pathname: string, search: string, nextParams: Record<string, string | number | undefined>) {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  for (const [key, value] of Object.entries(nextParams)) {
    if (value !== undefined && !params.has(key)) params.set(key, String(value))
  }
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}
