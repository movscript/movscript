import { type ReactNode, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { projectSurfacePath } from '@movscript/project-surface/routes'
import {
  ProjectSurfaceProvider,
  useProjectSurfaceRuntime,
} from '@movscript/project-surface/react'
import type { ProjectSurfaceReadModelStatus } from '@movscript/project-surface/react'
import {
  createProjectSurfaceRuntime,
  type ProjectSurfaceGitAction,
  type ProjectSurfaceRouteKey,
  type ProjectSurfaceRouteParams,
  type ProjectSurfaceRuntime,
} from '@movscript/project-surface/runtime'

import { ROUTES } from '@/routes/projectRoutes'
import { api } from '@/shared/infrastructure/api'
import {
  getAPIBaseURL,
  getRuntimeConfigSnapshot,
  refreshRuntimeConfigSnapshot,
} from '@/shared/infrastructure/config'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { workspaceOwnerContext } from '@/shared/infrastructure/session/workspaceOwnerContext'
import { toast } from '@movscript/ui/toast'

const PROJECT_SERVICE_READ_MODEL_ENDPOINT = '/v1/project/read-model'
const PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT = '/v1/project/resources/view'
const PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT = '/v1/project/source/command'

export interface DesktopProjectSurfaceProviderProps {
  children: ReactNode
}

export function DesktopProjectSurfaceProvider({ children }: DesktopProjectSurfaceProviderProps) {
  const runtime = useDesktopProjectSurfaceRuntime()

  return (
    <ProjectSurfaceProvider runtime={runtime}>
      {children}
    </ProjectSurfaceProvider>
  )
}

export function useDesktopProjectSurfaceRuntime(): ProjectSurfaceRuntime {
  const project = useProjectStore((state) => state.current)
  const workspaceRoot = useProjectStore((state) => state.workspaceRoot)
  const currentUser = useUserStore((state) => state.currentUser)
  const currentOrgID = useUserStore((state) => state.currentOrgID)
  const orgMemberships = useUserStore((state) => state.orgMemberships)
  const projectDir = project?.workspace_path ?? project?.project_path ?? workspaceRoot ?? undefined
  const projectId = String(project?.project_uid ?? project?.ID ?? 'current-project')
  const owner = useMemo(
    () => workspaceOwnerContext({ currentUser, currentOrgID, orgMemberships }),
    [currentOrgID, currentUser, orgMemberships],
  )
  const runtimeConfigQuery = useQuery({
    queryKey: ['desktop-project-surface', 'runtime-config'],
    queryFn: () => refreshRuntimeConfigSnapshot(),
    staleTime: 5_000,
  })
  const runtimeConfig = runtimeConfigQuery.data ?? getRuntimeConfigSnapshot()
  const projectServiceBaseURL = runtimeConfig?.projectServiceBaseURL

  return useMemo(() => createProjectSurfaceRuntime({
    project: {
      projectId,
      location: projectDir ? 'local' : 'remote',
      ...(projectDir ? { projectDir } : {}),
      ...(project?.project_uid ? { projectUid: project.project_uid } : {}),
      ...(project?.name ? { title: project.name } : {}),
    },
    services: {
      ...(projectServiceBaseURL ? { projectServiceBaseURL } : {}),
      ...(runtimeConfig?.apiBaseURL ? { dataServiceBaseURL: runtimeConfig.apiBaseURL } : {}),
      ...(runtimeConfig?.canvasServiceBaseURL ? { controlBaseURL: runtimeConfig.canvasServiceBaseURL } : {}),
    },
    capabilities: {
      nativeWindowControls: true,
      localFilePicker: true,
      localDirectoryPicker: true,
      localGit: Boolean(projectDir),
      resourceUpload: true,
      generation: true,
      editing: true,
      mediaPipeline: true,
    },
    navigator: {
      href: (route, params) => desktopProjectSurfaceHref(route, projectId, params),
      open: (route, params) => {
        window.location.assign(desktopProjectSurfaceHref(route, projectId, params))
      },
      openExternal: (url) => {
        window.open(url, '_blank', 'noopener,noreferrer')
      },
    },
    notifier: {
      success: (message, detail) => toast.success(message, detail),
      warning: (message, detail) => toast.info(message, detail),
      error: (message, detail) => toast.error(message, detail),
      info: (message, detail) => toast.info(message, detail),
    },
    gateways: {
      project: {
        readModel: async () => {
          const latestConfig = await refreshRuntimeConfigSnapshot()
          const latestProjectServiceBaseURL = latestConfig?.projectServiceBaseURL ?? projectServiceBaseURL
          if (!projectDir) throw new Error('Project directory is not configured for this Desktop project.')
          if (!latestProjectServiceBaseURL) throw new Error('Project Service endpoint is not available in Desktop runtime config.')
          const decisionStore = desktopProjectDecisionStoreConfig({
            projectUid: project?.project_uid,
            title: project?.name,
            dataServiceBaseURL: latestConfig?.apiBaseURL ?? runtimeConfig?.apiBaseURL,
            owner,
          })
          return postProjectService(latestProjectServiceBaseURL, PROJECT_SERVICE_READ_MODEL_ENDPOINT, {
            projectDir,
            includeSource: false,
            includeInspection: false,
            ...(decisionStore ? { decisionStore } : {}),
          })
        },
        resourceView: async (input) => {
          const latestConfig = await refreshRuntimeConfigSnapshot()
          const latestProjectServiceBaseURL = latestConfig?.projectServiceBaseURL ?? projectServiceBaseURL
          const nextProjectDir = input.projectDir ?? projectDir
          if (!nextProjectDir) throw new Error('Project directory is not configured for this Desktop project.')
          if (!latestProjectServiceBaseURL) throw new Error('Project Service endpoint is not available in Desktop runtime config.')
          return postProjectService(latestProjectServiceBaseURL, PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT, {
            projectDir: nextProjectDir,
            kind: input.kind,
            ...(input.input !== undefined ? { input: input.input } : {}),
          })
        },
        sourceCommand: async (input) => {
          const latestConfig = await refreshRuntimeConfigSnapshot()
          const latestProjectServiceBaseURL = latestConfig?.projectServiceBaseURL ?? projectServiceBaseURL
          const nextProjectDir = input.projectDir ?? projectDir
          if (!nextProjectDir) throw new Error('Project directory is not configured for this Desktop project.')
          if (!latestProjectServiceBaseURL) throw new Error('Project Service endpoint is not available in Desktop runtime config.')
          const decisionStore = desktopProjectDecisionStoreConfig({
            projectUid: project?.project_uid,
            title: project?.name,
            dataServiceBaseURL: latestConfig?.apiBaseURL ?? runtimeConfig?.apiBaseURL,
            owner,
          })
          return postProjectService(latestProjectServiceBaseURL, PROJECT_SERVICE_SOURCE_COMMAND_ENDPOINT, {
            projectDir: nextProjectDir,
            command: input.command,
            ...(input.input !== undefined ? { input: input.input } : {}),
            ...(decisionStore ? { decisionStore } : {}),
          })
        },
        gitStatus: async () => {
          if (!projectDir) throw new Error('Project directory is not configured for this Desktop project.')
          const result = await readElectronApi()?.getProjectGitWorkspaceStatus?.({
            projectDir,
            ...(project && project.ID > 0 ? { projectId: project.ID } : {}),
          })
          if (!result) throw new Error('Desktop project Git status API is not available.')
          return result
        },
        gitAction: async (input) => {
          if (!projectDir) throw new Error('Project directory is not configured for this Desktop project.')
          const result = await runDesktopGitAction(input.action, {
            projectDir,
            ...(project && project.ID > 0 ? { projectId: project.ID } : {}),
            ...(input.remoteURL ? { remoteURL: input.remoteURL } : {}),
          })
          if (!result) throw new Error('Desktop project Git action API is not available.')
          return result
        },
        listDataSpaces: async () => {
          const owner = workspaceOwnerContext({ currentUser, currentOrgID, orgMemberships })
          const scopeKind = owner.orgId !== undefined ? 'org' : 'user'
          const scopeId = owner.orgId ?? owner.userId
          const response = await api.get<{ items: Array<Record<string, unknown>> }>('/project-data/spaces', {
            params: { scope_kind: scopeKind },
          })
          return {
            scopeKind,
            scopeId,
            items: response.data.items,
          }
        },
        readWorkspaceMetadata: async () => {
          if (!project || project.ID <= 0) return undefined
          const response = await api.get<Record<string, unknown>>(`/projects/${project.ID}/workspace`)
          return {
            ...response.data,
            gitRemoteUrl: resolveBackendGitRemoteURL(readString(response.data.gitRemoteUrl)),
          }
        },
      },
    },
  }), [
    currentOrgID,
    currentUser,
    orgMemberships,
    owner,
    project,
    projectDir,
    projectId,
    projectServiceBaseURL,
    runtimeConfig?.apiBaseURL,
    runtimeConfig?.canvasServiceBaseURL,
    workspaceRoot,
  ])
}

function desktopProjectDecisionStoreConfig(input: {
  projectUid?: string
  title?: string
  dataServiceBaseURL?: string
  owner: ReturnType<typeof workspaceOwnerContext>
}): Record<string, unknown> | undefined {
  const projectUid = input.projectUid?.trim()
  const baseUrl = input.dataServiceBaseURL?.trim()
  if (!projectUid || !baseUrl) return undefined
  const scopeKind = input.owner.orgId !== undefined ? 'org' : 'user'
  const scopeId = input.owner.orgId ?? input.owner.userId
  if (scopeId === undefined) return undefined
  return {
    kind: 'scoped-project-data',
    baseUrl,
    projectUid,
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    scopeKind,
    scopeId,
  }
}

export function useDesktopProjectReadModel() {
  const runtime = useProjectSurfaceRuntime()
  const projectDir = runtime.project.projectDir
  const projectServiceBaseURL = runtime.services.projectServiceBaseURL

  const query = useQuery({
    queryKey: [
      'desktop-project-surface',
      'read-model',
      runtime.project.projectId,
      projectDir,
      projectServiceBaseURL,
    ],
    queryFn: () => runtime.gateways.project.readModel(),
    enabled: Boolean(projectDir && projectServiceBaseURL),
  })
  const status: ProjectSurfaceReadModelStatus = query.isLoading
    ? 'loading'
    : query.isError
      ? 'error'
      : query.data
        ? 'ready'
        : 'idle'

  return {
    ...query,
    readModelStatus: status,
    error: query.error instanceof Error ? query.error : undefined,
  }
}

export function desktopProjectSurfaceHref(
  route: ProjectSurfaceRouteKey,
  projectId: string,
  params?: ProjectSurfaceRouteParams,
): string {
  const pathname = desktopProjectSurfacePath(route, projectId)
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue
    query.set(key, String(value))
  }
  const search = query.toString()
  return search ? `${pathname}?${search}` : pathname
}

export function desktopProjectSurfacePath(route: ProjectSurfaceRouteKey, projectId: string): string {
  if (route === 'overview') return ROUTES.project.home
  if (route === 'settings') return ROUTES.project.settings
  if (route === 'scripts') return ROUTES.project.scripts
  if (route === 'standards') return ROUTES.project.standards
  if (route === 'content') return ROUTES.project.content
  if (route === 'contentCanvas') return ROUTES.project.contentCanvas
  if (route === 'contentPreview') return ROUTES.project.contentPreview
  return projectSurfacePath(route, projectId)
}

async function runDesktopGitAction(
  action: ProjectSurfaceGitAction,
  input: { projectDir: string; projectId?: number | string; remoteURL?: string },
) {
  const electronApi = readElectronApi()
  if (action === 'status') return electronApi?.getProjectGitWorkspaceStatus?.(input)
  if (action === 'init') return electronApi?.initProjectGitWorkspace?.(input)
  if (action === 'commit') return electronApi?.commitProjectGitWorkspace?.(input)
  if (action === 'pull') return electronApi?.pullProjectGitWorkspace?.(input)
  return electronApi?.pushProjectGitWorkspace?.(input)
}

async function postProjectService(
  baseURL: string,
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseURL.replace(/\/+$/, '')}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = readString(recordValue(payload)?.message)
      ?? readString(recordValue(payload)?.error)
      ?? `Project Service request failed with HTTP ${response.status}.`
    throw new Error(message)
  }
  return recordValue(payload) ?? {}
}

function resolveBackendGitRemoteURL(value: string | undefined): string | undefined {
  const remoteURL = value?.trim()
  if (!remoteURL) return undefined
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(remoteURL) || remoteURL.startsWith('file://')) return remoteURL
  if (!remoteURL.startsWith('/')) return remoteURL
  return `${getAPIBaseURL()}${remoteURL}`
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
