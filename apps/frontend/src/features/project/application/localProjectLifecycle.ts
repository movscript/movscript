import { api } from '@/shared/infrastructure/api'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import type { ElectronLocalProjectResult } from '@/shared/contracts/electronApi'
import type { Project } from '@/types'

type ProjectEnsureResponse = {
  project: Project
  created?: boolean
}

type ProjectResolveResponse = {
  project: Project
}

type ProjectDataSpaceResponse = {
  project_uid: string
}

export type LocalProjectScope = {
  scopeKind: 'user' | 'org'
  scopeId: string
}

export async function resolveBackendProjectByUID(projectUid: string): Promise<Project | null> {
  const response = await api.post<ProjectResolveResponse>('/projects/resolve', {
    project_uid: projectUid,
  }, {
    validateStatus: (status) => (status >= 200 && status < 300) || status === 404,
  })
  if (response.status === 404) return null
  return response.data.project
}

export async function ensureBackendProjectForLocalProject(local: ElectronLocalProjectResult): Promise<{ project: Project; created: boolean }> {
  const projectUid = local.projectUid ?? local.project.project_uid
  if (!projectUid) throw new Error('本地项目缺少 project_uid')
  const response = await api.post<ProjectEnsureResponse>('/projects/ensure', {
    project_uid: projectUid,
    name: local.project.name,
    description: local.project.description,
  })
  return {
    project: response.data.project,
    created: Boolean(response.data.created),
  }
}

export async function ensureProjectDataSpaceForLocalProject(local: ElectronLocalProjectResult, scope: LocalProjectScope): Promise<void> {
  const projectUid = local.projectUid ?? local.project.project_uid
  if (!projectUid) throw new Error('本地项目缺少 project_uid')
  await api.post<ProjectDataSpaceResponse>('/project-data/spaces', {
    scope_kind: scope.scopeKind,
    scope_id: scope.scopeId,
    project_uid: projectUid,
    title: local.project.name,
  })
}

export async function bindLocalProjectToBackend(local: ElectronLocalProjectResult, backendProject: Project, scope: LocalProjectScope): Promise<ElectronLocalProjectResult> {
  const projectUid = local.projectUid ?? local.project.project_uid ?? backendProject.project_uid
  if (!projectUid) throw new Error('本地项目缺少 project_uid')
  const api = readElectronApi()
  if (!api?.bindLocalMovScriptProject) return local
  return await api.bindLocalMovScriptProject({
    projectDir: local.projectDir,
    projectUid,
    backendProjectId: backendProject.ID,
    scopeKind: scope.scopeKind,
    scopeId: scope.scopeId,
  })
}

export function backendProjectWithLocalPath(backendProject: Project, local: ElectronLocalProjectResult): Project {
  return {
    ...backendProject,
    name: local.project.name || backendProject.name,
    description: local.project.description || backendProject.description,
    project_uid: backendProject.project_uid ?? local.projectUid ?? local.project.project_uid,
    workspace_path: local.projectDir,
    project_path: local.projectDir,
    local: true,
  }
}
