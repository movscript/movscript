import { PROJECT_SURFACE_ROUTES } from '@movscript/project-surface/routes'
import { RESOURCE_SURFACE_ROUTES } from '@movscript/resource-surface/routes'

export const ROUTES = {
  root: '/',
  canvases: '/canvases',
  canvasEditor: '/canvases/:id',
  editing: '/editing',
  editingProject: '/editing/:editingProjectId',
  projects: '/projects',
  resources: RESOURCE_SURFACE_ROUTES.resources,
  externalResources: RESOURCE_SURFACE_ROUTES.externalResources,
  agentResources: RESOURCE_SURFACE_ROUTES.agentResources,
  agentResourceDetail: RESOURCE_SURFACE_ROUTES.agentResourceDetail,
  studioProject: '/studio/*',
  studioOverview: PROJECT_SURFACE_ROUTES.overview,
  studioScripts: PROJECT_SURFACE_ROUTES.scripts,
  studioStandards: PROJECT_SURFACE_ROUTES.standards,
  studioContent: PROJECT_SURFACE_ROUTES.content,
  studioSettings: PROJECT_SURFACE_ROUTES.settings,
} as const
