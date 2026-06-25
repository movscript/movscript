import React, { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { FolderArchive } from 'lucide-react'
import { Button } from '@movscript/ui/primitives'
import {
  arrayValue,
  recordValue,
  stringValue,
  type AgentSurfaceSnapshot,
} from '@movscript/project-surface/data'
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
  normalizeBaseURL,
  projectRouteContext,
} from '../routes/localRouteLinks.js'
import { ROUTES } from '../routes/projectRoutes.js'

type ProjectReadModelState =
  | { status: 'idle'; snapshot?: undefined; readModel?: undefined; error?: undefined }
  | { status: 'loading'; snapshot?: undefined; readModel?: undefined; error?: undefined }
  | { status: 'ready'; snapshot: AgentSurfaceSnapshot; readModel: ProjectReadModelResponse; error?: undefined }
  | { status: 'error'; snapshot?: undefined; readModel?: undefined; error: Error }

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
  const projectServiceBaseURL = normalizeBaseURL(
    query.get('projectServiceBaseURL')
      ?? query.get('projectServiceBaseUrl')
      ?? query.get('projectServiceURL')
      ?? query.get('projectServiceUrl'),
  )
  const projectSurfaceRuntime = useMemo(() => createLocalHostProjectSurfaceRuntime({
    projectId: routeContext.projectId,
    projectDir: routeContext.projectDir,
    projectUid: query.get('projectUid') ?? query.get('project_uid') ?? undefined,
    productionId: routeContext.productionId,
    mcpApiBaseURL,
    projectServiceBaseURL,
    search: query,
  }), [
    routeContext.projectId,
    routeContext.projectDir,
    query,
    routeContext.productionId,
    mcpApiBaseURL,
    projectServiceBaseURL,
  ])
  const projectReadModel = useProjectReadModel({
    runtime: projectSurfaceRuntime,
    productionId: routeContext.productionId,
  })

  useEffect(() => {
    ensureLocalProjectContentAPI({
      projectId: routeContext.projectId,
      projectDir: routeContext.projectDir,
      projectUid: query.get('projectUid') ?? query.get('project_uid') ?? undefined,
      projectServiceBaseURL,
    })
  }, [projectServiceBaseURL, query, routeContext.projectDir, routeContext.projectId])

  useEffect(() => {
    const projectPath = routeContext.projectDir || undefined
    if (!projectPath) return
    const numericProjectId = localNumericProjectId(routeContext.projectId, projectPath)
    const projectName = query.get('projectName')
      ?? query.get('project_name')
      ?? projectPath.split('/').filter(Boolean).pop()
      ?? `Project ${numericProjectId}`
    const now = new Date().toISOString()
    const project = {
      ID: numericProjectId,
      name: projectName,
      description: '',
      owner_id: 1,
      workspace_path: projectPath,
      project_path: projectPath,
      local: true,
      CreatedAt: now,
      UpdatedAt: now,
    }
    useProjectStore.getState().setCurrent(project)
    rememberLocalProject(project)
  }, [query, routeContext.projectDir, routeContext.projectId])

  let content: React.ReactNode
  if (routeContext.route?.key === 'content') {
    content = <ContentCanvasWorkspacePage />
  } else if (!routeContext.route || routeContext.route.key === 'overview') {
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
  }

  return (
    <ProjectSurfaceProvider runtime={projectSurfaceRuntime}>
      {content}
    </ProjectSurfaceProvider>
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
}: {
  runtime: ReturnType<typeof createLocalHostProjectSurfaceRuntime>
  productionId?: string
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
  }, [runtime, productionId])

  return state
}

function projectReadModelToStatusSnapshot({
  readModel,
  projectId,
  projectDir,
  productionId,
}: {
  readModel: ProjectReadModelResponse
  projectId: string
  projectDir: string
  productionId?: string
}): AgentSurfaceSnapshot {
  const model = recordValue(readModel.projectReadModel) ?? {}
  return {
    schema: 'movscript.agent_surface_snapshot.v1',
    status: 'ok',
    surface: 'project.status',
    generated_at: new Date().toISOString(),
    target: {
      project_id: projectId,
      project_dir: projectDir,
      ...(productionId ? { production_id: productionId } : {}),
    },
    data: {
      project_read_model: model,
      status_summary: projectReadModelToStatusSummary(model, {
        projectId,
        productionId,
      }),
    },
  }
}

function projectReadModelToStatusSummary(
  model: Record<string, unknown>,
  target: { projectId: string; productionId?: string },
): Record<string, unknown> {
  const overview = recordValue(model.overview)
  const workspace = recordValue(model.workspace) ?? recordValue(overview?.workspace)
  const productionSummary = recordValue(model.productionSummary ?? overview?.production)
  const contentSummary = recordValue(model.contentSummary ?? overview?.content)
  const readiness = recordValue(model.readiness ?? overview?.readiness)
  const contentUnits = readModelContentUnits(contentSummary, readiness)
  const productionItems = arrayValue(productionSummary?.items ?? productionSummary?.productions ?? productionSummary?.productionItems)
  const firstProduction = recordValue(productionItems[0])
  const productionId = target.productionId
    ?? stringValue(firstProduction?.production_id ?? firstProduction?.productionId ?? firstProduction?.id)
    ?? stringValue(workspace?.productionId ?? workspace?.production_id)
    ?? 'default'

  return {
    schema: 'movscript.production_status_summary.v1',
    project_id: target.projectId,
    productions: [
      {
        production_id: productionId,
        title: stringValue(firstProduction?.title ?? firstProduction?.name)
          ?? stringValue(workspace?.title)
          ?? target.projectId,
        content_units: contentUnits,
        blocking_refs: arrayValue(readiness?.blocking_refs ?? readiness?.blockingRefs),
        stale_status: stringValue(model.status ?? overview?.status) ?? 'unknown',
        job_status: stringValue(readiness?.job_status ?? readiness?.jobStatus) ?? 'not_tracked_in_project_read_model',
      },
    ],
  }
}

function readModelContentUnits(
  contentSummary: Record<string, unknown> | undefined,
  readiness: Record<string, unknown> | undefined,
): Record<string, unknown>[] {
  const items = arrayValue(
    contentSummary?.items
      ?? contentSummary?.content_units
      ?? contentSummary?.contentUnits
      ?? readiness?.content_units
      ?? readiness?.contentUnits,
  )
  return items.map((item, index) => readModelContentUnit(recordValue(item) ?? { value: item }, index))
}

function readModelContentUnit(unit: Record<string, unknown>, index: number): Record<string, unknown> {
  const contentUnitId = stringValue(unit.content_unit_id ?? unit.contentUnitId ?? unit.id ?? unit.uid)
    ?? `content-unit-${index + 1}`
  const candidateIds = arrayValue(unit.candidate_ids ?? unit.candidateIds ?? unit.candidates)
    .map((candidate) => stringValue(recordValue(candidate)?.id ?? recordValue(candidate)?.candidate_id ?? candidate))
    .filter((value): value is string => Boolean(value))
  const selectedCandidate = stringValue(
    unit.selected_candidate
      ?? unit.selectedCandidate
      ?? recordValue(unit.selection)?.candidate_id
      ?? recordValue(unit.selection)?.candidateId,
  )
  const selectedResource = stringValue(
    unit.selected_resource
      ?? unit.selectedResource
      ?? recordValue(unit.selection)?.resource_id
      ?? recordValue(unit.selection)?.resourceId,
  )
  const candidateCount = Number(unit.candidate_count ?? unit.candidateCount ?? candidateIds.length)

  return {
    content_unit_id: contentUnitId,
    title: stringValue(unit.title ?? unit.name) ?? contentUnitId,
    output_kind: stringValue(unit.output_kind ?? unit.outputKind ?? unit.kind ?? unit.type) ?? 'unknown',
    candidate_count: Number.isFinite(candidateCount) ? candidateCount : candidateIds.length,
    ...(selectedCandidate ? { selected_candidate: selectedCandidate } : {}),
    ...(selectedResource ? { selected_resource: selectedResource } : {}),
    blocking_refs: arrayValue(unit.blocking_refs ?? unit.blockingRefs),
    candidate_ids: candidateIds,
  }
}
