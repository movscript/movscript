import type { MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'
import type { Project } from '@/types'

export const USER_WORKSPACE_VALUE = '__user__'

export interface AgentWorkspaceContextSelectOption {
  value: string
  label: string
  meta?: string
}

export function normalizeAgentWorkspaceContext(
  context: MovScriptWorkspaceContext | undefined,
  lockedProject?: Project | null,
): MovScriptWorkspaceContext {
  const projectDir = nonEmptyString(context?.projectDir)
  if (context?.scope === 'project' && projectDir) {
    const projectUid = nonEmptyString(context.projectUid)
    const projectTitle = nonEmptyString(context.projectTitle)
    return {
      scope: 'project',
      ...(context.projectId !== undefined ? { projectId: context.projectId } : {}),
      projectDir,
      ...(projectUid ? { projectUid } : {}),
      ...(projectTitle ? { projectTitle } : {}),
    }
  }
  const projectId = positiveInteger(context?.projectId)
  if (lockedProject?.ID && (projectId === undefined || projectId === lockedProject.ID)) {
    return agentWorkspaceContextFromProject(lockedProject)
  }
  if ((context?.scope === 'project' || projectId !== undefined) && projectId !== undefined) {
    return {
      scope: 'project',
      projectId,
    }
  }
  if (lockedProject?.ID) {
    return agentWorkspaceContextFromProject(lockedProject)
  }
  return {
    scope: 'global',
  }
}

export function agentWorkspaceContextFromProject(project: Project): MovScriptWorkspaceContext {
  const projectDir = project.workspace_path || project.project_path
  return {
    scope: 'project',
    projectId: project.ID,
    ...(projectDir ? { projectDir } : {}),
    ...(project.project_uid ? { projectUid: project.project_uid } : {}),
    ...(project.name ? { projectTitle: project.name } : {}),
  }
}

export function positiveInteger(value: unknown): number | undefined {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function mergeCurrentProject(projects: Project[], currentProject: Project | null): Project[] {
  if (!currentProject || projects.some((project) => project.ID === currentProject.ID)) return projects
  return [currentProject, ...projects]
}

export function buildAgentWorkspaceContextSelectOptions(
  projects: Project[],
  currentProject: Project | null,
): AgentWorkspaceContextSelectOption[] {
  return [
    { value: USER_WORKSPACE_VALUE, label: '全局', meta: '不绑定项目' },
    ...projects
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((project) => ({
        value: String(project.ID),
        label: project.name || `项目 #${project.ID}`,
        meta: project.ID === currentProject?.ID
          ? '当前项目'
          : project.description || undefined,
      })),
  ]
}
