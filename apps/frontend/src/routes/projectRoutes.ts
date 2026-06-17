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
  agentConnections: '/agent/connections',
  agentSettings: '/agent/settings',
  project: {
    root: '/project',
    home: '/project/home',
    agent: '/project/agent',
    agentCanvases: '/project/agent/canvases',
    standards: '/project/standards',
    scripts: '/project/scripts/workbench',
    content: '/project/content',
    contentLegacy: '/project/content-orchestration/canvas',
    contentLegacyNext: '/project/content-orchestration/canvas-next',
  },
  tools: {
    refImageGen: '/tools/ref-image-gen',
    refVideoGen: '/tools/ref-video-gen',
    audioGen: '/tools/audio-gen',
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
