import { configureSurfaceRouteClient, type SurfaceRouteKey } from '@movscript/shared'
import { ROUTES } from '../../../routes/projectRoutes'

const routePatterns: Record<SurfaceRouteKey, string> = {
  'project.home': ROUTES.studioOverview,
  'project.agentCanvases': ROUTES.canvases,
  'project.scripts': ROUTES.studioScripts,
  'project.standards': ROUTES.studioStandards,
  'project.content': ROUTES.studioContent,
  'project.settings': ROUTES.studioSettings,
  resources: ROUTES.resources,
  'canvas.list': ROUTES.canvases,
  'canvas.editor': ROUTES.canvasEditor,
  'canvas.projectBack': '/studio',
  'canvas.agentBack': '/project/agent/canvases',
  'agent.console': ROUTES.root,
}

configureSurfaceRouteClient({
  routePattern: (key) => routePatterns[key],
})
