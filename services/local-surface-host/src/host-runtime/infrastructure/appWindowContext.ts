import { useAppSettingsStore } from './appSettingsStore'
import { useProjectStore } from './session/projectStore'
import { rememberLocalProject } from './session/localProjectRecentsStore'
import type { Project } from '@movscript/shared'
import type { ProjectSurfaceRouteKey } from '@movscript/project-surface/routes'
import { projectSurfaceHrefForLocalProject } from '../../routes/localRouteLinks'

export async function openProjectWindow(input: {
  project?: Project | unknown
  projectDir?: string
  route?: string
}): Promise<void> {
  const project = input.project as Project | undefined
  if (project) {
    useProjectStore.getState().setCurrent(project)
    if (project.workspace_path || project.project_path || project.local) rememberLocalProject(project)
  }
  useAppSettingsStore.getState().setWorkMode('project')
  const fallbackRoute = project
    ? projectSurfaceHrefForLocalProject(project, 'overview', new URLSearchParams())
    : '/projects'
  window.location.assign(projectRouteForLocalHost(input.route, project) ?? projectRouteWithLocalProjectQuery(fallbackRoute, project))
}

export async function openHomeWindow(): Promise<void> {
  window.location.assign('/')
}

function projectRouteForLocalHost(route: string | undefined, project: Project | undefined): string | undefined {
  if (!route || !project) return undefined
  const [pathname, rawSearch = ''] = route.split('?')
  const query = new URLSearchParams(rawSearch)
  if (pathname === '/studio') return projectSurfaceHrefForLocalProject(project, 'overview', query)
  if (pathname.startsWith('/studio/')) return projectRouteWithLocalProjectQuery(route, project)
  const mapped = projectRouteKey(route)
  return projectSurfaceHrefForLocalProject(project, mapped ?? 'overview', query)
}

function projectRouteWithLocalProjectQuery(route: string, project: Project | undefined): string {
  if (!project) return route
  const [pathname, rawSearch = ''] = route.split('?')
  const query = new URLSearchParams(rawSearch)
  const projectDir = project.workspace_path?.trim() || project.project_path?.trim()
  if (projectDir && !query.get('projectDir')) query.set('projectDir', projectDir)
  if (project.project_uid && !query.get('projectUid')) query.set('projectUid', project.project_uid)
  if (project.ID > 0 && !query.get('projectId')) query.set('projectId', String(project.ID))
  if (project.name && !query.get('projectName')) query.set('projectName', project.name)
  const search = query.toString()
  return search ? `${pathname}?${search}` : pathname
}

function projectRouteKey(route: string): ProjectSurfaceRouteKey | undefined {
  if (route.endsWith('/standards')) return 'standards'
  if (route.endsWith('/settings/preview')) return 'settingPreview'
  if (route.endsWith('/settings')) return 'settings'
  if (route.endsWith('/scripts') || route.endsWith('/scripts/workbench')) return 'scripts'
  if (route.endsWith('/content/canvas')) return 'contentCanvas'
  if (route.endsWith('/content/preview')) return 'contentPreview'
  if (route.endsWith('/content') || route.endsWith('/content-orchestration/canvas') || route.endsWith('/content-orchestration/canvas-next')) return 'content'
  if (route.endsWith('/home') || route.endsWith('/project')) return undefined
  return undefined
}
