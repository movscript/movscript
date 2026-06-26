import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Blocks, FilePlus2, FileText, FolderKanban, GitBranch, LayoutDashboard, Plus, Settings } from 'lucide-react'
import { AppContentLayout, ProjectSurfaceHeader } from '@movscript/ui/layout'
import { Button } from '@movscript/ui/primitives'
import { toast } from '@movscript/ui/toast'
import {
  surfaceRoutePath,
  surfaceWorkspaceOwnerContext,
  type Script,
} from '@movscript/shared'

import {
  emptyProjectOverviewData,
  loadProjectOverviewData,
} from '../application/projectOverviewData'
import { projectOverviewKeys } from '../application/projectQueries'
import { useSurfaceHostState } from '../application/surfaceHostStateHooks'
import { buildProjectOverviewModel } from '../presentation/projectOverviewModel'
import {
  ProjectBuiltInStandardsPluginCard,
  ProjectOverviewScriptCard,
  ProjectOverviewWorkbenchCard,
} from './ProjectOverviewCards'
import {
  ProjectListPageLayout,
  ProjectPageActionButton,
  ProjectPageEmptyState,
} from './ProjectPageUi'
import { scriptKeys } from '../../scripts/application/scriptQueryKeys'
import {
  createWorkspaceScript,
  listWorkspaceScripts,
} from '../../scripts/application/scriptWorkspaceRepository'
import {
  invalidateScriptMutationResult,
  scriptCreatedResult,
} from '../../scripts/application/scriptMutationInvalidation'
import {
  contentCanvasDocumentNodeIds,
  createContentCanvasDocument,
  ensureContentCanvasDocumentsState,
  readContentCanvasDocumentsState,
  subscribeContentCanvasDocumentsState,
  type ContentCanvasDocument,
} from '../../content/application/contentCanvasDocuments'

export default function ProjectOverviewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentProject = useSurfaceHostState((state) => state.currentProject)
  const currentUser = useSurfaceHostState((state) => state.currentUser)
  const currentOrgID = useSurfaceHostState((state) => state.currentOrgID)
  const orgMemberships = useSurfaceHostState((state) => state.orgMemberships)
  const projectId = currentProject?.ID
  const projectDir = currentProject?.workspace_path ?? currentProject?.project_path
  const enabled = Number.isInteger(projectId) && Number(projectId) > 0
  const { data = emptyProjectOverviewData, error, isFetching } = useQuery({
    queryKey: [...projectOverviewKeys.detail(projectId), projectDir ?? 'remote'],
    queryFn: () => loadProjectOverviewData(projectId as number),
    enabled,
  })
  const workspaceContext = useMemo(
    () => projectDir
      ? { projectDir }
      : surfaceWorkspaceOwnerContext({ currentUser, currentOrgID, orgMemberships }),
    [currentOrgID, currentUser, orgMemberships, projectDir],
  )
  const scriptsQuery = useQuery<Script[]>({
    queryKey: scriptKeys.projectScripts(projectId, workspaceContext),
    queryFn: () => listWorkspaceScripts(projectId as number, workspaceContext),
    enabled,
  })
  const model = useMemo(() => buildProjectOverviewModel({
    data,
    project: currentProject,
  }), [currentProject, data])
  const standardsLane = model.lanes.find((lane) => lane.definition.id === 'project_standards')
  const homeEntryLanes = model.homeEntryLanes.filter((lane) => (
    lane.definition.id !== 'project_standards'
    && lane.definition.id !== 'content_canvas'
  ))
  const scripts = useMemo(() => (
    (scriptsQuery.data ?? []).slice().sort((left, right) => (
      (left.order || 0) - (right.order || 0) || left.ID - right.ID
    ))
  ), [scriptsQuery.data])
  const [canvasDocumentsVersion, setCanvasDocumentsVersion] = useState(0)
  useEffect(() => {
    if (!projectId) return undefined
    ensureContentCanvasDocumentsState(projectId)
    setCanvasDocumentsVersion((version) => version + 1)
    return subscribeContentCanvasDocumentsState(projectId, () => {
      setCanvasDocumentsVersion((version) => version + 1)
    })
  }, [projectId])
  const canvasDocumentsState = useMemo(() => {
    void canvasDocumentsVersion
    return readContentCanvasDocumentsState(projectId)
  }, [canvasDocumentsVersion, projectId])
  const canvasDocuments = useMemo(() => (
    Object.values(canvasDocumentsState?.documents ?? {}).sort((left, right) => (
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      || left.title.localeCompare(right.title, 'zh-CN')
    ))
  ), [canvasDocumentsState?.documents])
  const canvasRoute = useCallback((canvasId?: string) => {
    if (!projectId) return '#'
    const base = surfaceRoutePath('project.contentCanvas', { projectId })
    return canvasId ? `${base}?canvasId=${encodeURIComponent(canvasId)}` : base
  }, [projectId])
  const createCanvasFromHome = useCallback(() => {
    if (!projectId) return
    const next = createContentCanvasDocument(projectId)
    const canvasId = next?.activeCanvasId
    if (!canvasId) return
    toast.success('画布已创建')
    navigate(canvasRoute(canvasId))
  }, [canvasRoute, navigate, projectId])
  const createScript = useMutation({
    mutationFn: () => {
      if (!projectId) throw new Error('请选择项目')
      const scriptNumber = scripts.length + 1
      return createWorkspaceScript(projectId, {
        title: `新手记 ${scriptNumber}`,
        script_type: 'uncategorized',
        content: '',
        raw_source: '',
        summary: '',
      }, workspaceContext)
    },
    onSuccess: (created) => {
      invalidateScriptMutationResult(queryClient, scriptCreatedResult({ projectId, changedIds: [created.ID] }))
      toast.success('手记已创建')
      navigate(surfaceRoutePath('project.scripts', { script_id: created.ID }))
    },
    onError: () => toast.error('创建手记失败，请重试'),
  })

  if (!currentProject) {
    return (
      <ProjectListPageLayout>
        <ProjectPageEmptyState
          icon={FolderKanban}
          title="还没有打开项目"
          detail="先从项目首页选择一个项目，再进入项目 Home。"
          action={(
            <ProjectPageActionButton asChild>
              <Link to="/projects">打开项目首页</Link>
            </ProjectPageActionButton>
          )}
        />
      </ProjectListPageLayout>
    )
  }

  return (
    <AppContentLayout variant="contained" width="wide" contentClassName="space-y-5 py-5">
      <ProjectSurfaceHeader
        icon={LayoutDashboard}
        title={currentProject.name || '项目首页'}
        actions={(
          <Button asChild type="button" size="icon" variant="ghost" title="Project Settings" aria-label="Project Settings">
            <Link to={surfaceRoutePath('project.settings')}>
              <Settings size={16} />
            </Link>
          </Button>
        )}
      />

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 type-label text-destructive">
          {error instanceof Error ? error.message : String(error)}
        </div>
      ) : null}

      <section className="rounded-lg border border-border bg-background p-4">
        <div className="mb-4 flex items-center gap-2 type-body font-semibold text-foreground">
          <Blocks size={16} className="text-muted-foreground" />
          项目插件
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <ProjectBuiltInStandardsPluginCard lane={standardsLane} />
          <div className="rounded-md border border-border bg-muted/20 p-4 type-label text-muted-foreground">
            暂无其他项目插件。项目规范已作为内建能力可用。
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-background p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 type-body font-semibold text-foreground">
              <FileText size={16} className="text-muted-foreground" />
              手记列表
            </div>
            <p className="mt-1 type-label text-muted-foreground">
              从一份手记进入编辑、版本管理和后续编排上下文。
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-2"
            disabled={createScript.isPending || !projectId}
            onClick={() => createScript.mutate()}
          >
            <FilePlus2 size={14} />
            {createScript.isPending ? '创建中' : '添加手记'}
          </Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {scriptsQuery.isLoading || isFetching ? (
            <div className="rounded-md border border-border bg-muted/20 p-4 type-label text-muted-foreground">正在读取手记...</div>
          ) : scripts.length === 0 ? (
            <div className="rounded-md border border-border bg-muted/20 p-4 type-label text-muted-foreground">
              当前项目还没有手记。点击添加手记后会直接进入这份创作手记。
            </div>
          ) : scripts.map((script) => (
            <ProjectOverviewScriptCard key={script.ID} script={script} />
          ))}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <ProjectOverviewCanvasList
          canvases={canvasDocuments}
          canvasRoute={canvasRoute}
          onCreateCanvas={createCanvasFromHome}
        />
        {homeEntryLanes.map((lane) => (
          <ProjectOverviewWorkbenchCard key={lane.definition.id} lane={lane} />
        ))}
      </section>
    </AppContentLayout>
  )
}

function ProjectOverviewCanvasList({
  canvases,
  canvasRoute,
  onCreateCanvas,
}: {
  canvases: ContentCanvasDocument[]
  canvasRoute: (canvasId?: string) => string
  onCreateCanvas: () => void
}) {
  return (
    <section className="flex min-h-[220px] flex-col rounded-lg border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted text-foreground">
          <GitBranch size={17} />
        </span>
        <Button type="button" size="sm" variant="outline" className="gap-2" onClick={onCreateCanvas}>
          <Plus size={14} />
          新建画布
        </Button>
      </div>
      <div className="mt-4 min-w-0">
        <h2 className="type-body font-semibold text-foreground">创作画布</h2>
        <p className="mt-1 line-clamp-2 type-label leading-5 text-muted-foreground">
          多张自由画布共享同一批节点数据，每张画布只保存自己的布局和视角。
        </p>
      </div>
      <div className="mt-4 grid flex-1 content-start gap-2">
        {canvases.length ? canvases.map((canvas) => (
          <Button key={canvas.id} asChild variant="ghost" className="h-auto justify-start rounded-md border border-border bg-muted/10 p-0 text-left hover:bg-muted/30">
            <Link to={canvasRoute(canvas.id)} className="flex w-full items-center justify-between gap-3 p-3">
              <span className="min-w-0">
                <strong className="block truncate type-label text-foreground">{canvas.title}</strong>
                <small className="block truncate type-caption text-muted-foreground">{formatCanvasUpdatedAt(canvas.updatedAt)}</small>
              </span>
              <span className="shrink-0 rounded-md border border-border bg-background px-2 py-1 type-caption text-muted-foreground">
                {contentCanvasDocumentNodeIds(canvas).length} 节点
              </span>
            </Link>
          </Button>
        )) : (
          <div className="rounded-md border border-border bg-muted/20 p-4 type-label text-muted-foreground">
            还没有画布。新建后会进入空白自由画布。
          </div>
        )}
      </div>
    </section>
  )
}

function formatCanvasUpdatedAt(value: string): string {
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return '刚刚更新'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time))
}
