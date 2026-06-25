import { useAppSettingsStore } from './appSettingsStore'
import { useProjectStore } from './session/projectStore'
import { rememberLocalProject } from './session/localProjectRecentsStore'
import type { Project } from '@movscript/shared'

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
  const projectId = project?.ID
  const fallbackRoute = projectId ? `/studio/${encodeURIComponent(String(projectId))}` : '/projects'
  window.location.assign(projectRouteForLocalHost(input.route, projectId) ?? fallbackRoute)
}

export async function openHomeWindow(): Promise<void> {
  window.location.assign('/')
}

function projectRouteForLocalHost(route: string | undefined, projectId: number | undefined): string | undefined {
  if (!route || !projectId) return undefined
  if (route.startsWith('/studio/')) return route
  const encodedProjectId = encodeURIComponent(String(projectId))
  const mapped = projectRouteSegment(route)
  return mapped ? `/studio/${encodedProjectId}/${mapped}` : `/studio/${encodedProjectId}`
}

function projectRouteSegment(route: string): string | undefined {
  if (route.endsWith('/standards')) return 'standards'
  if (route.endsWith('/settings')) return 'settings'
  if (route.endsWith('/scripts') || route.endsWith('/scripts/workbench')) return 'scripts'
  if (route.endsWith('/content') || route.endsWith('/content-orchestration/canvas') || route.endsWith('/content-orchestration/canvas-next')) return 'content'
  if (route.endsWith('/home') || route.endsWith('/project')) return undefined
  return undefined
}
