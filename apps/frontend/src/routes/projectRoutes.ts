export const ROUTES = {
  root: '/',
  projects: '/projects',
  user: '/user',
  appSettings: '/app/settings',
  invite: '/invite/:token',
  orgSelect: '/org/select',
  orgSettings: '/org/settings',
  canvases: '/canvases',
  canvasEditor: '/canvases/:id',
  resources: '/resources',
  externalResources: '/resources/external',
  shotLibrary: '/shot-library',
  jobs: '/jobs',
  plugins: '/plugins',
  agentConsole: '/agent',
  agents: '/agents',
  agentProvider: '/agents/:providerRouteKey',
  modelProviders: '/model-providers',
  workspaceConfig: '/workspace/config',
  workspaceReview: '/workspace/review',
  agentFiles: '/agent/files',
  agentSettings: '/agent/settings',
  agentRuns: '/agent/runs',
  agentRun: '/agent/runs/:runId',
  project: {
    agent: '/project/agent',
    agentCanvases: '/project/agent/canvases',
    overview: '/project/overview',
    standards: '/project/standards',
    preProduction: '/project/pre-production',
    scripts: '/project/scripts/workbench',
    legacyScripts: '/project/scripts',
    contentUnitWorkbench: '/project/content-units/workbench',
    contentUnitEditor: '/project/content-units/editor',
    production: '/project/production',
    productionOrchestration: '/project/production/orchestration',
    tasks: '/project/tasks',
    delivery: '/project/delivery',
    deliveryWorkbench: '/project/delivery/workbench',
  },
  tools: {
    refImageGen: '/tools/ref-image-gen',
    refVideoGen: '/tools/ref-video-gen',
    motionImitation: '/tools/motion-imitation',
    styleTransfer: '/tools/style-transfer',
    multiAngle: '/tools/multi-angle',
    plugin: '/tools/plugin/:pluginId',
  },
} as const

export function withSearch(pathname: string, search = '') {
  if (!search) return pathname
  return `${pathname}${search.startsWith('?') ? search : `?${search}`}`
}

export function withRouteParams(pathname: string, params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `${pathname}?${query}` : pathname
}

export function mergeSearch(pathname: string, search: string, nextParams: Record<string, string | number | undefined>) {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  for (const [key, value] of Object.entries(nextParams)) {
    if (value !== undefined && !params.has(key)) params.set(key, String(value))
  }
  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

export function agentRunPath(runId: string, providerSession?: { sessionId?: string; workspaceDir?: string }) {
  return withRouteParams(`/agent/runs/${encodeURIComponent(runId)}`, {
    sessionId: providerSession?.sessionId,
    workspaceDir: providerSession?.workspaceDir,
  })
}
