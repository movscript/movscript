import { type ReactNode, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { projectSurfacePath } from '@movscript/project-surface/routes'
import type { MovScriptContextEnvelope } from '@movscript/shared'
import { movScriptContextProjectCwd, movScriptContextProjectKey } from '@movscript/shared'
import {
  ProjectSurfaceProvider,
  useProjectSurfaceRuntime,
} from '@movscript/project-surface/react'
import type { ProjectSurfaceReadModelStatus } from '@movscript/project-surface/react'
import {
  createHostedProjectSurfaceRuntime,
  projectSurfaceContextCommandEnvelope,
  type ProjectSurfaceGitAction,
  type ProjectSurfaceRouteKey,
  type ProjectSurfaceRouteParams,
  type ProjectSurfaceRuntime,
  unwrapProjectSurfaceGatewayResult,
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
const PROJECT_SERVICE_HOME_READ_MODEL_ENDPOINT = '/v1/project/home/read-model'
const PROJECT_SERVICE_STANDARDS_READ_MODEL_ENDPOINT = '/v1/project/standards/read-model'
const PROJECT_SERVICE_SCRIPTS_READ_MODEL_ENDPOINT = '/v1/project/scripts/read-model'
const PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT = '/v1/project/resources/view'
const PROJECT_SERVICE_CANDIDATES_VIEW_ENDPOINT = '/v1/project/candidates/view'
const PROJECT_SERVICE_STANDARDS_UPSERT_ENDPOINT = '/v1/project/standards/upsert'
const PROJECT_SERVICE_SCRIPT_SOURCE_READ_ENDPOINT = '/v1/project/scripts/source/read'
const PROJECT_SERVICE_SCRIPT_UPSERT_ENDPOINT = '/v1/project/scripts/upsert'
const PROJECT_SERVICE_SCRIPT_VERSION_SNAPSHOT_ENDPOINT = '/v1/project/scripts/versions/snapshot'
const PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_LIST_ENDPOINT = '/v1/project/productions/editing-workspaces/list'
const PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_CREATE_ENDPOINT = '/v1/project/productions/editing-workspaces/create'
const PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_OPEN_ENDPOINT = '/v1/project/productions/editing-workspaces/open'
const PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_DELETE_ENDPOINT = '/v1/project/productions/editing-workspaces/delete'
const PROJECT_SERVICE_PRODUCTION_EDITING_RESOURCES_REFRESH_ENDPOINT = '/v1/project/productions/editing-resources/refresh'
const EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT = '/v1/editing/project/command'
const MEDIA_PIPELINE_TASK_CREATE_ENDPOINT = '/v1/media-pipeline/task/create'
const DAEMON_CONTEXT_SESSIONS_ENDPOINT = '/v1/context/sessions'
const REMOTION_STUDIO_SESSION_OPEN_ENDPOINT = '/v1/remotion-studio/sessions/open'
const REMOTION_STUDIO_SESSION_GET_ENDPOINT = '/v1/remotion-studio/sessions/get'
const REMOTION_STUDIO_SESSION_LOGS_ENDPOINT = '/v1/remotion-studio/sessions/logs'
const REMOTION_STUDIO_SESSION_STOP_ENDPOINT = '/v1/remotion-studio/sessions/stop'

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
  const backendProjectId = project && Number.isInteger(project.ID) && project.ID > 0 ? project.ID : undefined
  const projectKey = String(project?.project_uid ?? backendProjectId ?? 'current-project')
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
  const daemonGatewayBaseURL = readDesktopDaemonGatewayBaseURL(runtimeConfig)
  const contextQuery = useQuery({
    queryKey: [
      'desktop-project-surface',
      'context',
      daemonGatewayBaseURL,
      projectKey,
      projectDir,
      project?.project_uid,
      project?.name,
      owner.userId,
      owner.orgId,
    ],
    queryFn: async () => {
      const latestConfig = await refreshRuntimeConfigSnapshot()
      const gatewayBaseURL = readDesktopDaemonGatewayBaseURL(latestConfig ?? runtimeConfig)
      if (!gatewayBaseURL) throw new Error('Daemon gateway endpoint is not available in Desktop runtime config.')
      return await postDaemonGateway(
        gatewayBaseURL,
        DAEMON_CONTEXT_SESSIONS_ENDPOINT,
        {
          projectKey,
          routeProjectKey: projectKey,
          projectId: projectKey,
          ...(backendProjectId !== undefined ? { backendProjectId, backend_project_id: backendProjectId } : {}),
          ...(projectDir ? { projectDir } : {}),
          ...(project?.project_uid ? { projectUid: project.project_uid } : {}),
          ...(project?.name ? { projectTitle: project.name } : {}),
          capabilities: {
            localFileAccess: Boolean(projectDir),
            fileImport: Boolean(projectDir),
            mediaPreview: Boolean(projectDir),
          },
          principal: desktopPrincipalHint(owner),
        },
      ) as unknown as MovScriptContextEnvelope
    },
    enabled: Boolean(daemonGatewayBaseURL),
    staleTime: 5_000,
  })
	  const contextEnvelope = contextQuery.data
	  const contextProjectDir = movScriptContextProjectCwd(contextEnvelope)
	  const contextProjectKey = movScriptContextProjectKey(contextEnvelope) ?? projectKey
	  const contextProjectUid = contextEnvelope?.session?.project?.uid ?? project?.project_uid

  return useMemo(() => {
    const postProjectWorkspaceOperation = async (
      endpoint: string,
      input: { projectDir?: string; projectUid?: string; input?: unknown } = {},
    ): Promise<unknown> => {
      const latestConfig = await refreshRuntimeConfigSnapshot()
      const daemonGatewayBaseURL = readDesktopDaemonGatewayBaseURL(latestConfig ?? runtimeConfig)
      const nextProjectDir = input.projectDir ?? contextProjectDir
      if (!nextProjectDir) throw new Error('Project directory is not configured for this Desktop project.')
      if (!daemonGatewayBaseURL) throw new Error('Daemon gateway endpoint is not available in Desktop runtime config.')
      const decisionStore = desktopProjectDecisionStoreConfig({
        projectUid: input.projectUid ?? contextProjectUid,
        title: project?.name,
        baseURL: daemonGatewayBaseURL,
        context: contextEnvelope,
        owner,
      })
      const payload = await postDaemonGateway(
        daemonGatewayBaseURL,
        endpoint,
        {
          projectDir: nextProjectDir,
          ...projectSurfaceContextCommandEnvelope(contextEnvelope),
          ...(recordValue(input.input) ?? {}),
          ...(decisionStore ? { decisionStore } : {}),
        },
      )
      return unwrapProjectSurfaceGatewayResult(payload)
    }

    const runProductionEditingOpenAction = async (
      openResult: unknown,
      input: { projectId?: string | number; projectDir?: string; projectUid?: string; input?: unknown } = {},
    ): Promise<unknown> => {
      const resultRecord = recordValue(openResult)
      const openAction = recordValue(resultRecord?.open_action)
      const openActionKind = readString(openAction?.kind)
      if (
        openActionKind !== 'desktop_route'
        && openActionKind !== 'media_pipeline_task_request'
        && openActionKind !== 'remotion_studio_session'
      ) return openResult
      const latestConfig = await refreshRuntimeConfigSnapshot()
      const daemonGatewayBaseURL = readDesktopDaemonGatewayBaseURL(latestConfig ?? runtimeConfig)
      if (!daemonGatewayBaseURL) throw new Error('Daemon gateway endpoint is not available in Desktop runtime config.')
      if (openActionKind === 'desktop_route') {
        const mediaEditingProject = recordValue(resultRecord?.mediaEditingProject ?? resultRecord?.media_editing_project)
        if (!mediaEditingProject) return openResult
        const saved = await postDaemonGateway(
          daemonGatewayBaseURL,
          EDITING_SERVICE_PROJECT_COMMAND_ENDPOINT,
          {
            command: 'saveProject',
            input: { editingProject: mediaEditingProject },
          },
        )
        return {
          ...resultRecord,
          open_action_result: recordValue(saved.result) ?? saved,
          editing_project_saved: true,
        }
      }
      if (openActionKind === 'remotion_studio_session') {
        const sessionResult = await postDaemonGateway(
          daemonGatewayBaseURL,
          REMOTION_STUDIO_SESSION_OPEN_ENDPOINT,
          {
            openAction,
            open_action: openAction,
            projectId: String(input.projectId ?? contextProjectKey),
            project_id: String(input.projectId ?? contextProjectKey),
          },
        )
        return {
          ...resultRecord,
          open_action_result: sessionResult,
          remotionStudioSession: sessionResult,
          remotion_studio_session: sessionResult,
        }
      }
      const projectDirectory = readString(openAction?.projectDirectory ?? openAction?.project_directory)
      if (!projectDirectory) throw new Error('Remotion open action requires projectDirectory.')
      const taskType = readString(openAction?.taskType ?? openAction?.task_type) ?? 'backend_project_preview'
      const backend = readString(openAction?.backend) ?? 'remotion'
      const previewCommand = rendererCommandValue(openAction?.previewCommand ?? openAction?.preview_command)
      const taskResult = await postDaemonGateway(
        daemonGatewayBaseURL,
        MEDIA_PIPELINE_TASK_CREATE_ENDPOINT,
        {
          request: {
	            projectId: String(input.projectId ?? contextProjectKey),
            taskType,
            task_type: taskType,
            backend,
            projectDirectory,
            project_directory: projectDirectory,
            ...(previewCommand ? { previewCommand, preview_command: previewCommand } : {}),
          },
        },
      )
      const task = recordValue(taskResult.task)
      return {
        ...resultRecord,
        open_action_result: taskResult,
        task,
        media_pipeline_task: task,
        preview_started: true,
      }
    }

    const postRemotionStudioSessionOperation = async (endpoint: string, input: Record<string, unknown> = {}) => {
      const latestConfig = await refreshRuntimeConfigSnapshot()
      const daemonGatewayBaseURL = readDesktopDaemonGatewayBaseURL(latestConfig ?? runtimeConfig)
      if (!daemonGatewayBaseURL) throw new Error('Daemon gateway endpoint is not available in Desktop runtime config.')
      return postDaemonGateway(daemonGatewayBaseURL, endpoint, input)
    }

    return createHostedProjectSurfaceRuntime({
      context: contextEnvelope,
	      project: {
	        projectId: contextProjectKey,
        location: contextProjectDir ? 'local' : 'remote',
        ...(contextProjectDir ? { projectDir: contextProjectDir } : {}),
        ...(contextProjectUid ? { projectUid: contextProjectUid } : {}),
        ...(project?.name ? { title: project.name } : {}),
      },
      diagnostics: {
        endpoints: {
          ...(readDesktopDaemonGatewayBaseURL(runtimeConfig) ? { gateway: readDesktopDaemonGatewayBaseURL(runtimeConfig) } : {}),
        },
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
	      href: (route, params, runtimeProject) => desktopProjectSurfaceHref(route, runtimeProject.projectId, params),
      openHref: (href) => {
        window.location.assign(href)
      },
      openExternal: (url) => {
        window.open(url, '_blank', 'noopener,noreferrer')
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
            const daemonGatewayBaseURL = readDesktopDaemonGatewayBaseURL(latestConfig ?? runtimeConfig)
            if (!contextProjectDir) throw new Error('Daemon context does not expose a local project workspace for this Desktop project.')
            if (!daemonGatewayBaseURL) throw new Error('Daemon gateway endpoint is not available in Desktop runtime config.')
            const decisionStore = desktopProjectDecisionStoreConfig({
              projectUid: contextProjectUid,
              title: project?.name,
              baseURL: daemonGatewayBaseURL,
              context: contextEnvelope,
              owner,
            })
            return postDaemonGateway(
              daemonGatewayBaseURL,
              PROJECT_SERVICE_READ_MODEL_ENDPOINT,
              {
                projectDir: contextProjectDir,
                includeSource: false,
                includeInspection: false,
                ...projectSurfaceContextCommandEnvelope(contextEnvelope),
                ...(decisionStore ? { decisionStore } : {}),
              },
            )
          },
          homeReadModel: async (input = {}) => {
            const latestConfig = await refreshRuntimeConfigSnapshot()
            const daemonGatewayBaseURL = readDesktopDaemonGatewayBaseURL(latestConfig ?? runtimeConfig)
            const nextProjectDir = input.projectDir ?? contextProjectDir
            const nextProjectUid = input.projectUid ?? contextProjectUid
            if (!nextProjectDir) throw new Error('Daemon context does not expose a local project workspace for this Desktop project.')
            if (!daemonGatewayBaseURL) throw new Error('Daemon gateway endpoint is not available in Desktop runtime config.')
            const decisionStore = desktopProjectDecisionStoreConfig({
              projectUid: nextProjectUid,
              title: project?.name,
              baseURL: daemonGatewayBaseURL,
              context: contextEnvelope,
              owner,
            })
            return postDaemonGateway(
              daemonGatewayBaseURL,
              PROJECT_SERVICE_HOME_READ_MODEL_ENDPOINT,
              {
                projectDir: nextProjectDir,
	                projectKey: input.projectId ?? contextProjectKey,
	                projectId: input.projectId ?? contextProjectKey,
                ...(nextProjectUid ? { projectUid: nextProjectUid } : {}),
                ...projectSurfaceContextCommandEnvelope(contextEnvelope),
                ...(decisionStore ? { decisionStore } : {}),
              },
            )
          },
          standardsReadModel: async (input = {}) => {
            const latestConfig = await refreshRuntimeConfigSnapshot()
            const daemonGatewayBaseURL = readDesktopDaemonGatewayBaseURL(latestConfig ?? runtimeConfig)
            const nextProjectDir = input.projectDir ?? contextProjectDir
            const nextProjectUid = input.projectUid ?? contextProjectUid
            if (!nextProjectDir) throw new Error('Daemon context does not expose a local project workspace for this Desktop project.')
            if (!daemonGatewayBaseURL) throw new Error('Daemon gateway endpoint is not available in Desktop runtime config.')
            const decisionStore = desktopProjectDecisionStoreConfig({
              projectUid: nextProjectUid,
              title: project?.name,
              baseURL: daemonGatewayBaseURL,
              context: contextEnvelope,
              owner,
            })
            return postDaemonGateway(
              daemonGatewayBaseURL,
              PROJECT_SERVICE_STANDARDS_READ_MODEL_ENDPOINT,
              {
                projectDir: nextProjectDir,
	                projectKey: input.projectId ?? contextProjectKey,
	                projectId: input.projectId ?? contextProjectKey,
                ...(nextProjectUid ? { projectUid: nextProjectUid } : {}),
                ...projectSurfaceContextCommandEnvelope(contextEnvelope),
                ...(decisionStore ? { decisionStore } : {}),
              },
            )
          },
          scriptsReadModel: async (input = {}) => {
            const latestConfig = await refreshRuntimeConfigSnapshot()
            const daemonGatewayBaseURL = readDesktopDaemonGatewayBaseURL(latestConfig ?? runtimeConfig)
            const nextProjectDir = input.projectDir ?? contextProjectDir
            const nextProjectUid = input.projectUid ?? contextProjectUid
            if (!nextProjectDir) throw new Error('Daemon context does not expose a local project workspace for this Desktop project.')
            if (!daemonGatewayBaseURL) throw new Error('Daemon gateway endpoint is not available in Desktop runtime config.')
            const decisionStore = desktopProjectDecisionStoreConfig({
              projectUid: nextProjectUid,
              title: project?.name,
              baseURL: daemonGatewayBaseURL,
              context: contextEnvelope,
              owner,
            })
            return postDaemonGateway(
              daemonGatewayBaseURL,
              PROJECT_SERVICE_SCRIPTS_READ_MODEL_ENDPOINT,
              {
                projectDir: nextProjectDir,
	                projectKey: input.projectId ?? contextProjectKey,
	                projectId: input.projectId ?? contextProjectKey,
                ...(nextProjectUid ? { projectUid: nextProjectUid } : {}),
                ...projectSurfaceContextCommandEnvelope(contextEnvelope),
                ...(decisionStore ? { decisionStore } : {}),
              },
            )
          },
          resourceView: async (input) => {
          const latestConfig = await refreshRuntimeConfigSnapshot()
          const daemonGatewayBaseURL = readDesktopDaemonGatewayBaseURL(latestConfig ?? runtimeConfig)
          const nextProjectDir = contextProjectDir
          if (!nextProjectDir) throw new Error('Project directory is not configured for this Desktop project.')
          if (!daemonGatewayBaseURL) throw new Error('Daemon gateway endpoint is not available in Desktop runtime config.')
          return postDaemonGateway(
            daemonGatewayBaseURL,
            PROJECT_SERVICE_RESOURCE_VIEW_ENDPOINT,
            {
              projectDir: nextProjectDir,
              kind: input.kind,
              ...projectSurfaceContextCommandEnvelope(contextEnvelope),
              ...(input.input !== undefined ? { input: input.input } : {}),
            },
          )
          },
          candidateView: async (input) => {
          const latestConfig = await refreshRuntimeConfigSnapshot()
          const daemonGatewayBaseURL = readDesktopDaemonGatewayBaseURL(latestConfig ?? runtimeConfig)
          const nextProjectDir = input.projectDir ?? contextProjectDir
          if (!nextProjectDir) throw new Error('Project directory is not configured for this Desktop project.')
          if (!daemonGatewayBaseURL) throw new Error('Daemon gateway endpoint is not available in Desktop runtime config.')
          const decisionStore = desktopProjectDecisionStoreConfig({
            projectUid: input.projectUid ?? contextProjectUid,
            title: project?.name,
            baseURL: daemonGatewayBaseURL,
            context: contextEnvelope,
            owner,
          })
          return postDaemonGateway(
            daemonGatewayBaseURL,
            PROJECT_SERVICE_CANDIDATES_VIEW_ENDPOINT,
            {
              projectDir: nextProjectDir,
              contentUnitIds: input.contentUnitIds,
              ...(input.projectUid ?? contextProjectUid ? { projectUid: input.projectUid ?? contextProjectUid } : {}),
              ...projectSurfaceContextCommandEnvelope(contextEnvelope),
              ...(recordValue(input.input) ?? {}),
              ...(decisionStore ? { decisionStore } : {}),
            },
          )
          },
          upsertProjectStandards: (input) => postProjectWorkspaceOperation(PROJECT_SERVICE_STANDARDS_UPSERT_ENDPOINT, input),
          readScriptSource: (input) => postProjectWorkspaceOperation(PROJECT_SERVICE_SCRIPT_SOURCE_READ_ENDPOINT, input),
          upsertScript: (input) => postProjectWorkspaceOperation(PROJECT_SERVICE_SCRIPT_UPSERT_ENDPOINT, input),
          snapshotScriptVersionFromMarkdown: (input) => postProjectWorkspaceOperation(PROJECT_SERVICE_SCRIPT_VERSION_SNAPSHOT_ENDPOINT, input),
          listProductionEditingWorkspaces: (input) => postProjectWorkspaceOperation(PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_LIST_ENDPOINT, input),
          createProductionEditingWorkspace: (input) => postProjectWorkspaceOperation(PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_CREATE_ENDPOINT, input),
          refreshProductionEditingResources: (input) => postProjectWorkspaceOperation(PROJECT_SERVICE_PRODUCTION_EDITING_RESOURCES_REFRESH_ENDPOINT, input),
          deleteProductionEditingWorkspace: (input) => postProjectWorkspaceOperation(PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_DELETE_ENDPOINT, input),
          openProductionEditingWorkspace: async (input) => {
          const openResult = await postProjectWorkspaceOperation(PROJECT_SERVICE_PRODUCTION_EDITING_WORKSPACES_OPEN_ENDPOINT, input)
          return runProductionEditingOpenAction(openResult, input)
          },
          gitStatus: async () => {
          if (!contextProjectDir) throw new Error('Daemon context does not expose a local project workspace for this Desktop project.')
          const result = await readElectronApi()?.getProjectGitWorkspaceStatus?.({
            projectDir: contextProjectDir,
            ...(project && project.ID > 0 ? { projectId: project.ID } : {}),
          })
          if (!result) throw new Error('Desktop project Git status API is not available.')
          return result
          },
          gitAction: async (input) => {
          if (!contextProjectDir) throw new Error('Daemon context does not expose a local project workspace for this Desktop project.')
          const result = await runDesktopGitAction(input.action, {
            projectDir: contextProjectDir,
            ...(project && project.ID > 0 ? { projectId: project.ID } : {}),
            ...(input.remoteURL ? { remoteURL: input.remoteURL } : {}),
          })
          if (!result) throw new Error('Desktop project Git action API is not available.')
          return result
          },
          listDataSpaces: async () => {
          const scope = desktopDataScopeFromContext(contextEnvelope)
            ?? desktopDataScopeFromOwner(workspaceOwnerContext({ currentUser, currentOrgID, orgMemberships }))
          const scopeKind = scope.scopeKind
          const scopeId = scope.scopeId
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
        remotionStudio: {
          open: (input) => postRemotionStudioSessionOperation(REMOTION_STUDIO_SESSION_OPEN_ENDPOINT, input),
          get: (input) => postRemotionStudioSessionOperation(REMOTION_STUDIO_SESSION_GET_ENDPOINT, input),
          logs: (input) => postRemotionStudioSessionOperation(REMOTION_STUDIO_SESSION_LOGS_ENDPOINT, input),
          stop: (input) => postRemotionStudioSessionOperation(REMOTION_STUDIO_SESSION_STOP_ENDPOINT, input),
        },
      },
    })
  }, [
    contextEnvelope,
    contextProjectDir,
    contextProjectKey,
    contextProjectUid,
    currentOrgID,
    currentUser,
    orgMemberships,
    owner,
    project,
    projectKey,
    runtimeConfig?.gatewayBaseURL,
    runtimeConfig?.apiBaseURL,
    workspaceRoot,
  ])
}

function desktopProjectDecisionStoreConfig(input: {
  projectUid?: string
  title?: string
  baseURL?: string
  context?: MovScriptContextEnvelope
  owner: ReturnType<typeof workspaceOwnerContext>
}): Record<string, unknown> | undefined {
  const projectUid = input.projectUid?.trim()
  const baseUrl = input.baseURL?.trim()
  if (!projectUid || !baseUrl) return undefined
  const contextScope = desktopDataScopeFromContext(input.context)
  const scopeKind = contextScope?.scopeKind ?? (input.owner.orgId !== undefined ? 'org' : 'user')
  const scopeId = contextScope?.scopeId ?? input.owner.orgId ?? input.owner.userId
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

function desktopPrincipalHint(owner: ReturnType<typeof workspaceOwnerContext>): Record<string, unknown> {
  if (owner.orgId !== undefined) {
    return { scopeKind: 'org', scopeId: owner.orgId, userId: String(owner.orgId) }
  }
  if (owner.userId !== undefined) {
    return { scopeKind: 'user', scopeId: owner.userId, userId: String(owner.userId) }
  }
  return {}
}

function desktopDataScopeFromContext(context: MovScriptContextEnvelope | undefined): { scopeKind: 'user' | 'org'; scopeId: string | number } | undefined {
  const principal = context?.principal
  if (!principal) return undefined
  if (principal.scopeKind === 'org' && principal.scopeId !== undefined) return { scopeKind: 'org', scopeId: principal.scopeId }
  const scopeId = principal.scopeId ?? principal.userId
  return scopeId !== undefined ? { scopeKind: 'user', scopeId } : undefined
}

function desktopDataScopeFromOwner(owner: ReturnType<typeof workspaceOwnerContext>): { scopeKind: 'user' | 'org'; scopeId: string | number | undefined } {
  return owner.orgId !== undefined
    ? { scopeKind: 'org', scopeId: owner.orgId }
    : { scopeKind: 'user', scopeId: owner.userId }
}

export function useDesktopProjectReadModel() {
  const runtime = useProjectSurfaceRuntime()
  const projectDir = runtime.project.projectDir
  const daemonGatewayBaseURL = readDesktopDaemonGatewayBaseURL(getRuntimeConfigSnapshot())

  const query = useQuery({
    queryKey: [
      'desktop-project-surface',
      'read-model',
      runtime.project.projectId,
      projectDir,
      daemonGatewayBaseURL,
    ],
    queryFn: () => runtime.gateways.project.readModel(),
    enabled: Boolean(projectDir && daemonGatewayBaseURL),
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
  projectKey: string,
  params?: ProjectSurfaceRouteParams,
): string {
  const pathname = desktopProjectSurfacePath(route, projectKey)
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue
    query.set(key, String(value))
  }
  const search = query.toString()
  return search ? `${pathname}?${search}` : pathname
}

export function desktopProjectSurfacePath(route: ProjectSurfaceRouteKey, projectKey: string): string {
  if (route === 'overview') return ROUTES.project.home
  if (route === 'settings') return ROUTES.project.settings
  if (route === 'scripts') return ROUTES.project.scripts
  if (route === 'standards') return ROUTES.project.standards
  if (route === 'content') return ROUTES.project.content
  if (route === 'contentCanvas') return ROUTES.project.contentCanvas
  if (route === 'contentPreview') return ROUTES.project.contentPreview
  if (route === 'remotionStudio') return ROUTES.project.remotionStudio
  if (route === 'settingPreview') return ROUTES.project.settingPreview
  return projectSurfacePath(route, projectKey)
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

async function postDaemonGateway(
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
      ?? `Daemon gateway request failed with HTTP ${response.status}.`
    throw new Error(message)
  }
  return recordValue(payload) ?? {}
}

function readDesktopDaemonGatewayBaseURL(
  config: {
    runtimeConnection?: { gatewayBaseURL?: string }
    runtime?: { gateway?: { baseURL?: string } }
    gatewayBaseURL?: string
    apiBaseURL?: string
  } | null | undefined,
): string | undefined {
  return config?.runtimeConnection?.gatewayBaseURL
    ?? config?.runtime?.gateway?.baseURL
    ?? config?.gatewayBaseURL
    ?? config?.apiBaseURL
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

function rendererCommandValue(value: unknown): string | string[] | undefined {
  if (typeof value === 'string') return value.trim() ? value.trim() : undefined
  if (!Array.isArray(value)) return undefined
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  return items.length > 0 ? items : undefined
}
