import React, { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { FolderArchive } from 'lucide-react'
import { Button } from '@movscript/ui/primitives'
import {
  recordValue,
  type AgentSurfaceSnapshot,
} from '@movscript/project-surface/data'
import type { MovScriptContextEnvelope } from '@movscript/shared'
import { movScriptContextProjectCwd, movScriptContextProjectId } from '@movscript/shared'
import type { MovScriptNormalizedFocus } from '@movscript/domain'
import {
  ProjectSurfaceProvider,
  ProjectSurfaceRouteView,
} from '@movscript/project-surface/react'
import { ContentCanvasWorkspacePage, ProjectOverviewPage } from '@movscript/project-surface/pages'
import { useProjectStore } from '../host-runtime/infrastructure/session/projectStore'
import {
  rememberLocalProject,
  useLocalProjectRecentsStore,
} from '../host-runtime/infrastructure/session/localProjectRecentsStore.js'
import { ensureLocalProjectContentAPI } from '../adapters/localContentSurfaceHostApi.js'
import { LocalSurfaceAppChrome } from '../shell/LocalSurfaceAppChrome.js'
import {
  createLocalHostProjectSurfaceRuntime,
  type ProjectReadModelResponse,
} from './localProjectSurfaceRuntime.js'
import {
  hrefWithSearch,
  projectRouteContext,
} from '../routes/localRouteLinks.js'
import { ROUTES } from '../routes/projectRoutes.js'
import { projectReadModelToStatusSnapshot } from './projectStatusSnapshot.js'

type ProjectReadModelState =
  | { status: 'idle'; snapshot?: undefined; readModel?: undefined; error?: undefined }
  | { status: 'loading'; snapshot?: undefined; readModel?: undefined; error?: undefined }
  | { status: 'ready'; snapshot: AgentSurfaceSnapshot; readModel: ProjectReadModelResponse; error?: undefined }
  | { status: 'error'; snapshot?: undefined; readModel?: undefined; error: Error }

type DaemonContextState =
  | { status: 'idle'; envelope?: undefined; error?: undefined }
  | { status: 'loading'; envelope?: undefined; error?: undefined }
  | { status: 'ready'; envelope: MovScriptContextEnvelope; error?: undefined }
  | { status: 'error'; envelope?: undefined; error: Error }

export function ProjectSurfaceHostRoute() {
  const location = useLocation()
  const query = useMemo(() => new URLSearchParams(location.search), [location.search])
  const routeContext = useMemo(() => projectRouteContext(location.pathname, query), [location.pathname, query])
  const recentProjects = useLocalProjectRecentsStore((state) => state.projects)
  const fallbackProjectHref = useMemo(() => {
    if (routeContext.projectDir) return undefined
    const fallback = fallbackProjectForRoute(routeContext.projectId, recentProjects)
    if (!fallback) return undefined
    const projectDir = projectDirForRecentProject(fallback)
    if (!projectDir) return undefined
    const nextQuery = new URLSearchParams(query)
    nextQuery.set('projectDir', projectDir)
    if (!nextQuery.get('projectId') && routeContext.projectId !== 'local-project') {
      nextQuery.set('projectId', routeContext.projectId)
    }
    if (fallback.name && !nextQuery.get('projectName')) nextQuery.set('projectName', fallback.name)
    return hrefWithSearch(location.pathname, nextQuery)
  }, [location.pathname, query, recentProjects, routeContext.projectDir, routeContext.projectId])
  const title = routeContext.projectDir
    ? routeContext.projectDir.split('/').filter(Boolean).pop() ?? routeContext.projectDir
    : 'Project Home'
  if (fallbackProjectHref) return <Navigate to={fallbackProjectHref} replace />
  return (
    <LocalSurfaceAppChrome title={title} description={routeContext.projectDir || 'Project Home'} query={query}>
      {routeContext.projectDir ? (
        <ProjectSurfaceHostView query={query} routeContext={routeContext} />
      ) : (
        <section className="surface-host-empty-route">
          <div className="surface-host-empty-route__icon"><FolderArchive size={22} /></div>
          <h1>Open a recent project</h1>
          <p>Project Home in the local editor is driven by projectDir or projectPath.</p>
          <div className="surface-host-empty-route__actions">
            <Button asChild size="sm" variant="outline">
              <Link to={hrefWithSearch(ROUTES.root, query)}>Back to App Home</Link>
            </Button>
          </div>
        </section>
      )}
    </LocalSurfaceAppChrome>
  )
}

function fallbackProjectForRoute(
  projectId: string,
  recentProjects: ReturnType<typeof useLocalProjectRecentsStore.getState>['projects'],
) {
  const numericProjectId = Number(projectId)
  if (Number.isInteger(numericProjectId) && numericProjectId > 0) {
    const match = recentProjects.find((project) => project.ID === numericProjectId && projectDirForRecentProject(project))
    if (match) return match
  }
  return projectId === 'local-project' && recentProjects.length === 1
    ? recentProjects.find((project) => projectDirForRecentProject(project))
    : undefined
}

function projectDirForRecentProject(project: { workspace_path?: string; project_path?: string }): string | undefined {
  return (project.workspace_path || project.project_path)?.trim() || undefined
}

function ProjectSurfaceHostView({
  query,
  routeContext,
}: {
  query: URLSearchParams
  routeContext: ReturnType<typeof projectRouteContext>
}) {
  const mcpApiBaseURL = query.get('mcpApiBaseURL') ?? ''
  const daemonContext = useDaemonContextSession({ query, routeContext })
  const contextEnvelope = daemonContext.status === 'ready' ? daemonContext.envelope : undefined
  const contextProjectDir = movScriptContextProjectCwd(contextEnvelope)
  const contextProjectId = movScriptContextProjectId(contextEnvelope) ?? routeContext.projectId
  const projectSurfaceRuntime = useMemo(() => createLocalHostProjectSurfaceRuntime({
    projectId: contextProjectId,
    projectDir: contextProjectDir,
    projectUid: contextEnvelope?.session?.project?.uid ?? query.get('projectUid') ?? query.get('project_uid') ?? undefined,
    productionId: routeContext.productionId,
    mcpApiBaseURL,
    search: query,
    context: contextEnvelope,
  }), [
    contextEnvelope,
    contextProjectDir,
    contextProjectId,
    query,
    routeContext.productionId,
    mcpApiBaseURL,
  ])
  const projectReadModel = useProjectReadModel({
    runtime: projectSurfaceRuntime,
    productionId: routeContext.productionId,
    domainFocus: routeContext.domainFocus,
  })

  useEffect(() => {
    if (!contextProjectDir) return
    ensureLocalProjectContentAPI({
      projectId: contextProjectId,
      projectDir: contextProjectDir,
      projectUid: contextEnvelope?.session?.project?.uid ?? query.get('projectUid') ?? query.get('project_uid') ?? undefined,
    })
  }, [contextEnvelope, contextProjectDir, contextProjectId, query])

  useEffect(() => {
    const projectPath = contextProjectDir || undefined
    if (!projectPath) return
    const numericProjectId = localNumericProjectId(contextProjectId, projectPath)
    const projectName = query.get('projectName')
      ?? query.get('project_name')
      ?? contextEnvelope?.session?.project?.title
      ?? projectPath.split('/').filter(Boolean).pop()
      ?? `Project ${numericProjectId}`
    const projectUid = contextEnvelope?.session?.project?.uid ?? query.get('projectUid') ?? query.get('project_uid') ?? undefined
    const now = new Date().toISOString()
    const project = {
      ID: numericProjectId,
      name: projectName,
      description: '',
      owner_id: 1,
      ...(projectUid ? { project_uid: projectUid } : {}),
      workspace_path: projectPath,
      project_path: projectPath,
      local: true,
      CreatedAt: now,
      UpdatedAt: now,
    }
    useProjectStore.getState().setCurrent(project)
    rememberLocalProject(project)
  }, [contextEnvelope, contextProjectDir, contextProjectId, query])

  let content: React.ReactNode
  if (daemonContext.status === 'loading' || daemonContext.status === 'idle') {
    content = <ProjectSurfaceContextStatus title="Preparing project session" />
  } else if (daemonContext.status === 'error') {
    content = <ProjectSurfaceContextStatus title="Project session unavailable" error={daemonContext.error} />
  } else if (routeContext.route?.key === 'contentCanvas') {
    content = <ContentCanvasWorkspacePage mode="canvas" />
  } else if (
    routeContext.route?.key === 'content'
    || routeContext.route?.key === 'contentPreview'
    || routeContext.route?.key === 'settingPreview'
  ) {
    content = <ContentCanvasWorkspacePage mode="preview" />
  } else if (routeContext.route?.key === 'overview') {
    content = <ProjectOverviewPage />
  } else if (routeContext.route) {
    content = (
      <ProjectSurfaceRouteView
        route={routeContext.route}
        params={query}
        productionId={routeContext.productionId}
        readModelStatus={projectReadModel.status}
        readModel={projectReadModel.readModel}
        snapshot={projectReadModel.snapshot}
        error={projectReadModel.status === 'error' ? projectReadModel.error : undefined}
      />
    )
  } else {
    content = <InvalidProjectSurfaceRoute query={query} />
  }

  return (
    <ProjectSurfaceProvider runtime={projectSurfaceRuntime}>
      {content}
    </ProjectSurfaceProvider>
  )
}

function useDaemonContextSession({
  query,
  routeContext,
}: {
  query: URLSearchParams
  routeContext: ReturnType<typeof projectRouteContext>
}): DaemonContextState {
  const [state, setState] = useState<DaemonContextState>({ status: 'idle' })

  useEffect(() => {
    const projectDir = routeContext.projectDir?.trim()
    if (!projectDir) {
      setState({ status: 'idle' })
      return
    }

    let cancelled = false
    setState({ status: 'loading' })
    fetch('/v1/context/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: routeContext.projectId,
        projectDir,
        projectUid: query.get('projectUid') ?? query.get('project_uid') ?? undefined,
        projectTitle: query.get('projectName') ?? query.get('project_name') ?? undefined,
        capabilities: {
          localFileAccess: true,
          fileImport: true,
          mediaPreview: true,
        },
      }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          const record = recordValue(payload)
          const message = typeof record?.message === 'string'
            ? record.message
            : typeof record?.error === 'string'
              ? record.error
              : `Daemon context request failed with HTTP ${response.status}.`
          throw new Error(message)
        }
        if (!cancelled) setState({ status: 'ready', envelope: payload as MovScriptContextEnvelope })
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) })
      })

    return () => {
      cancelled = true
    }
  }, [query, routeContext.projectDir, routeContext.projectId])

  return state
}

function ProjectSurfaceContextStatus({ title, error }: { title: string; error?: Error }) {
  return (
    <section className="surface-host-empty-route">
      <div className="surface-host-empty-route__icon"><FolderArchive size={22} /></div>
      <h1>{title}</h1>
      {error ? <p>{error.message}</p> : <p>Opening project...</p>}
    </section>
  )
}

function InvalidProjectSurfaceRoute({ query }: { query: URLSearchParams }) {
  return (
    <section className="surface-host-empty-route">
      <div className="surface-host-empty-route__icon"><FolderArchive size={22} /></div>
      <h1>Project surface route not found</h1>
      <p>Open projects through /studio/:projectId/overview or another explicit Project Surface route.</p>
      <div className="surface-host-empty-route__actions">
        <Button asChild size="sm" variant="outline">
          <Link to={hrefWithSearch(ROUTES.root, query)}>Back to App Home</Link>
        </Button>
      </div>
    </section>
  )
}

function localNumericProjectId(projectId: string, projectDir: string): number {
  const numeric = Number(projectId)
  if (Number.isInteger(numeric) && numeric > 0) return numeric
  let hash = 0
  for (let index = 0; index < projectDir.length; index += 1) {
    hash = (hash * 31 + projectDir.charCodeAt(index)) >>> 0
  }
  return Math.max(1, hash % 2_000_000_000)
}

function useProjectReadModel({
  runtime,
  productionId,
  domainFocus,
}: {
  runtime: ReturnType<typeof createLocalHostProjectSurfaceRuntime>
  productionId?: string
  domainFocus?: MovScriptNormalizedFocus
}): ProjectReadModelState {
  const [state, setState] = useState<ProjectReadModelState>({ status: 'idle' })

  useEffect(() => {
    const projectDir = runtime.project.projectDir ?? ''
    const projectId = runtime.project.projectId
    if (!projectDir) {
      setState({ status: 'error', error: new Error('Open this surface with projectDir or projectPath.') })
      return
    }

    let cancelled = false
    setState({ status: 'loading' })
    runtime.gateways.project.readModel()
      .then((readModel) => {
        if (cancelled) return
        const response = recordValue(readModel) as ProjectReadModelResponse
        setState({
          status: 'ready',
          readModel: response,
          snapshot: projectReadModelToStatusSnapshot({
            readModel: response,
            projectId,
            projectDir,
            productionId,
            domainFocus,
          }),
        })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({ status: 'error', error: error instanceof Error ? error : new Error(String(error)) })
      })

    return () => {
      cancelled = true
    }
  }, [runtime, productionId, domainFocus])

  return state
}
