import { configureSurfaceRouteClient, type SurfaceRouteKey } from '@movscript/shared'
import { ROUTES } from '@/routes/projectRoutes'

const routePatterns: Record<SurfaceRouteKey, string> = {
  'project.home': ROUTES.project.home,
  'project.agentCanvases': ROUTES.project.agentCanvases,
  'project.scripts': ROUTES.project.scripts,
  'project.standards': ROUTES.project.standards,
  'project.content': ROUTES.project.content,
  'project.contentCanvas': ROUTES.project.contentCanvas,
  'project.contentPreview': ROUTES.project.contentPreview,
  'project.settings': ROUTES.project.settings,
  resources: ROUTES.resources,
  'canvas.list': ROUTES.canvases,
  'canvas.editor': ROUTES.canvasEditor,
  'canvas.projectBack': ROUTES.project.home,
  'canvas.agentBack': ROUTES.project.agentCanvases,
  'agent.console': ROUTES.agentConsole,
}

configureSurfaceRouteClient({
  routePattern: (key) => routePatterns[key],
})
