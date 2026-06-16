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
  const projectId = positiveInteger(context?.projectId)
  if ((context?.scope === 'project' || projectId !== undefined) && projectId !== undefined) {
    return {
      scope: 'project',
      projectId,
    }
  }
  if (lockedProject?.ID) {
    return {
      scope: 'project',
      projectId: lockedProject.ID,
    }
  }
  return {
    scope: 'global',
  }
}

export function positiveInteger(value: unknown): number | undefined {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined
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
