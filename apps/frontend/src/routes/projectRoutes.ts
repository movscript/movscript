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
  jobs: '/jobs',
  plugins: '/plugins',
  agentDrafts: '/agent/drafts',
  agentSettings: '/agent/settings',
  agentDebug: '/agent/debug',
  agentRun: '/agent/runs/:runId',
  project: {
    overview: '/project/overview',
    standards: '/project/standards',
    preProduction: '/project/pre-production',
    scripts: '/project/scripts',
    segments: '/project/segments',
    sceneMoments: '/project/scene-moments',
    contentUnits: '/project/content-units',
    contentUnitWorkbench: '/project/content-units/workbench',
    production: '/project/production',
    productionOrchestration: '/project/production/orchestration',
    productionPreview: '/project/production/preview',
    tasks: '/project/tasks',
    delivery: '/project/delivery',
    deliveryWorkbench: '/project/delivery/workbench',
    referenceRelations: '/project/reference-relations',
    referenceRelationsWorkbench: '/project/reference-relations/workbench',
  },
  tools: {
    refImageGen: '/tools/ref-image-gen',
    refVideoGen: '/tools/ref-video-gen',
    motionImitation: '/tools/motion-imitation',
    styleTransfer: '/tools/style-transfer',
    multiAngle: '/tools/multi-angle',
    videoEdit: '/tools/video-edit',
    brainstorm: '/tools/brainstorm',
    plugin: '/tools/plugin/:pluginId',
  },
} as const

export const LEGACY_ROUTES = {
  projectHome: '/project-home',
  projectWorkspace: '/project-workspace',
  preProduction: '/pre-production',
  creativeReferences: '/creative-references',
  assetSlots: '/asset-slots',
  productionOrchestration: '/production-orchestrate',
  production: '/production',
  contentUnitOrchestrate: '/content-unit-orchestrate',
  collaboration: '/collaboration',
  finalVideos: '/final-videos',
  delivery: '/delivery',
  deliveryWorkbench: '/delivery/workbench',
  deliveryWorkbenchFlat: '/delivery-workbench',
  creation: '/creation',
  creativeWorkbench: '/creative-workbench',
  workbench: '/workbench',
  scriptSplitWorkbench: '/script-split-workbench',
  workbenchScript: '/workbench/script',
  workbenchProductionPlan: '/workbench/production-plan',
  workbenchPreview: '/workbench/preview',
  workbenchCreative: '/workbench/creative',
  workbenchAssets: '/workbench/assets',
  workbenchProduction: '/workbench/production',
  workbenchDelivery: '/workbench/delivery',
  workbenchObject: '/workbench/object',
  workbenchReferenceRelations: '/workbench/reference-relations',
  scripts: '/scripts',
  segments: '/segments',
  sceneMoments: '/scene-moments',
  contents: '/contents',
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

export function agentRunPath(runId: string) {
  return `/agent/runs/${encodeURIComponent(runId)}`
}
