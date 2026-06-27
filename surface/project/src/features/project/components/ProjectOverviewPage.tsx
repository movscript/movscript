import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Blocks, Clapperboard, FilePlus2, FileText, FolderKanban, GitBranch, LayoutDashboard, MonitorPlay, Plus, Search, Settings } from 'lucide-react'
import { AppContentLayout, ProjectSurfaceHeader } from '@movscript/ui/layout'
import { AppPager } from '@movscript/ui/business/app'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  NativeSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@movscript/ui/primitives'
import { toast } from '@movscript/ui/toast'
import {
  readSurfaceHostApi,
  surfaceRoutePath,
  surfaceWorkspaceOwnerContext,
  type Script,
} from '@movscript/shared'

import {
  emptyProjectOverviewData,
  loadProjectOverviewData,
  type ProjectOverviewData,
  type ProjectOverviewRecord,
} from '../application/projectOverviewData'
import { projectOverviewKeys } from '../application/projectQueries'
import { useSurfaceHostState } from '../application/surfaceHostStateHooks'
import { buildProjectOverviewModel, projectOverviewLaneLabel } from '../presentation/projectOverviewModel'
import {
  ProjectBuiltInStandardsPluginCard,
  ProjectOverviewScriptCard,
} from './ProjectOverviewCards'
import {
  ProjectHomeCardGroup,
  ProjectHomeCardGroupEmpty,
} from './ProjectHomeCardGroup'
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
  contentCanvasDocumentScope,
  contentCanvasDocumentNodeIds,
  createContentCanvasDocument,
  ensureContentCanvasDocumentsState,
  readContentCanvasDocumentsState,
  subscribeContentCanvasDocumentsState,
  type ContentCanvasDocument,
} from '../../content/application/contentCanvasDocuments'
import {
  CONTENT_CANVAS_TIMELINE_PROFILE_OPTIONS,
  DEFAULT_CONTENT_CANVAS_TIMELINE_PROFILE,
  contentCanvasParseTimelineNamespaces,
  contentCanvasTimelineProfileInitialNamespaceKinds,
  contentCanvasTimelineProfileNamespaces,
  contentCanvasTimelineProfileOption,
  contentCanvasTimelineProfileProductionType,
  contentCanvasTimelineProfileRootKind,
  contentCanvasTimelineRootDefaultPreviewKind,
  type ContentCanvasTimelineProfileId,
} from '../../content/domain/contentCanvasTimelineProfiles'

const PROJECT_HOME_CARD_PAGE_SIZE = 6
const PROJECT_HOME_FILTER_ALL = '__all'

interface ProjectHomeProductionSummary {
  id: string
  title: string
  kind: string
  path?: string
  previewEntityKind?: 'production' | 'segment'
  previewId?: string
  previewKind?: string
  previewPath?: string
  previewTitle?: string
  source: 'timeline' | 'legacy'
}

interface ProjectHomeSettingSummary {
  id: string
  title: string
  kind: string
}

interface ProjectHomeProductionCreateInput {
  id: string
  title: string
  timelineProfile: ContentCanvasTimelineProfileId
  productionType?: string
  timelineNamespaces?: string[]
}

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
  const workspaceContext = useMemo(
    () => projectDir
      ? { projectDir }
      : surfaceWorkspaceOwnerContext({ currentUser, currentOrgID, orgMemberships }),
    [currentOrgID, currentUser, orgMemberships, projectDir],
  )
  const { data = emptyProjectOverviewData, error, isFetching } = useQuery({
    queryKey: [...projectOverviewKeys.detail(projectId), projectDir ?? 'remote'],
    queryFn: () => loadProjectOverviewData(projectId as number, workspaceContext),
    enabled,
  })
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
  const productions = useMemo(() => projectHomeProductionSummaries(data), [data])
  const settings = useMemo(() => projectHomeSettingSummaries(data.settings), [data.settings])
  const [productionDialogOpen, setProductionDialogOpen] = useState(false)
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
  const productionPreviewRoute = useCallback((production: ProjectHomeProductionSummary) => (
    projectId ? projectHomeProductionPreviewPath(projectId, production) : '#'
  ), [projectId])
  const settingPreviewRoute = useCallback((setting: ProjectHomeSettingSummary) => (
    projectId ? projectHomeSettingPreviewPath(projectId, setting) : '#'
  ), [projectId])
  const createCanvasFromHome = useCallback(() => {
    if (!projectId) return
    const next = createContentCanvasDocument(projectId, { scope: { kind: 'global' } })
    const canvasId = next?.activeCanvasId
    if (!canvasId) return
    toast.success('全局内容画布已创建')
    navigate(canvasRoute(canvasId))
  }, [canvasRoute, navigate, projectId])
  const createCanvasForProduction = useCallback((production: ProjectHomeProductionSummary) => {
    if (!projectId) return
    const next = createContentCanvasDocument(projectId, {
      title: `${production.title} 内容画布`,
      scope: {
        kind: 'production',
        productionId: production.id,
        productionTitle: production.title,
        productionNodeId: `production:${production.id}`,
        ...(production.path ? { productionPath: production.path } : {}),
      },
    })
    const canvasId = next?.activeCanvasId
    if (!canvasId) return
    toast.success('制作内容画布已创建')
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
  const createProduction = useMutation({
    mutationFn: async (input: ProjectHomeProductionCreateInput) => {
      if (!projectId) throw new Error('请选择项目')
      const created = await createProjectHomeProduction(projectId, workspaceContext, input)
      return created
    },
    onSuccess: (production) => {
      if (projectId) {
        void queryClient.invalidateQueries({ queryKey: [...projectOverviewKeys.detail(projectId), projectDir ?? 'remote'] })
      }
      toast.success('制作已创建')
      setProductionDialogOpen(false)
      if (projectId) navigate(projectHomeProductionPreviewPath(projectId, production))
    },
    onError: () => toast.error('创建制作失败，请重试'),
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

      <div className="project-home-card-groups">
        <ProjectOverviewPluginList lane={standardsLane} />

        <ProjectOverviewScriptList
          scripts={scripts}
          loading={scriptsQuery.isLoading || isFetching}
          isCreating={createScript.isPending}
          canCreate={Boolean(projectId)}
          onCreateScript={() => createScript.mutate()}
        />

        <ProjectOverviewCanvasList
          canvases={canvasDocuments}
          canvasRoute={canvasRoute}
          onCreateCanvas={createCanvasFromHome}
        />

        <ProjectOverviewProductionList
          productions={productions}
          productionPreviewRoute={productionPreviewRoute}
          isCreating={createProduction.isPending}
          onCreateCanvas={createCanvasForProduction}
          onCreateClick={() => setProductionDialogOpen(true)}
        />

        <ProjectOverviewSettingPreviewList
          settings={settings}
          settingPreviewRoute={settingPreviewRoute}
        />
      </div>

      <ProjectOverviewProductionDialog
        open={productionDialogOpen}
        isBusy={createProduction.isPending}
        onOpenChange={setProductionDialogOpen}
        onSubmit={(input) => createProduction.mutate(input)}
      />
    </AppContentLayout>
  )
}

function ProjectOverviewPluginList({
  lane,
}: {
  lane?: ReturnType<typeof buildProjectOverviewModel>['lanes'][number]
}) {
  return (
    <ProjectHomeCardGroup
      icon={Blocks}
      variant="anchor"
      eyebrow="入口锚点"
      title="项目插件"
      description="项目级能力先以入口锚点组织；当前可用的是项目规范，后续插件会沿用这个区域扩展。"
      count={1}
      countLabel="个"
      facts={[
        { label: '内建能力', value: '项目规范' },
        { label: '状态', value: lane ? projectOverviewLaneLabel(lane.state) : '可用' },
        { label: '准备度', value: lane ? `${lane.progress}%` : '待读取' },
      ]}
    >
      <ProjectBuiltInStandardsPluginCard lane={lane} />
      <ProjectHomeCardGroupEmpty>
        其他项目级插件会在这里出现；当前先保留一个清晰的扩展位。
      </ProjectHomeCardGroupEmpty>
    </ProjectHomeCardGroup>
  )
}

interface ProjectHomeFilterOption {
  label: string
  value: string
}

interface ProjectHomeCardListPagination {
  filteredTotal: number
  onPageChange: (page: number) => void
  page: number
  pageCount: number
  pageItemCount: number
  pageSize: number
  total: number
}

interface ProjectHomeCardListView<T> extends ProjectHomeCardListPagination {
  filter: string
  filterOptions: ProjectHomeFilterOption[]
  onFilterChange: (value: string) => void
  onQueryChange: (value: string) => void
  pageItems: T[]
  query: string
}

interface ProjectHomeCardListConfig<T> {
  filterLabel?: (value: string) => string
  filterValue?: (item: T) => string | undefined
  pageSize?: number
  searchText: (item: T) => string
}

function ProjectHomeCardListToolbar({
  allFilterLabel,
  filter,
  filterOptions,
  label,
  search,
  searchPlaceholder,
  onFilter,
  onSearch,
}: {
  allFilterLabel: string
  filter: string
  filterOptions: ProjectHomeFilterOption[]
  label: string
  search: string
  searchPlaceholder: string
  onFilter: (value: string) => void
  onSearch: (value: string) => void
}) {
  return (
    <>
      <div className="project-home-card-group__search">
        <Search className="project-home-card-group__search-icon" size={14} aria-hidden="true" />
        <Input
          controlSize="sm"
          className="project-home-card-group__search-input"
          value={search}
          placeholder={searchPlaceholder}
          aria-label={`${label}筛选`}
          onChange={(event) => onSearch(event.target.value)}
        />
      </div>
      {filterOptions.length ? (
        <NativeSelect
          controlSize="sm"
          className="project-home-card-group__filter"
          value={filter}
          aria-label={`${label}类型筛选`}
          onChange={(event) => onFilter(event.target.value)}
        >
          <option value={PROJECT_HOME_FILTER_ALL}>{allFilterLabel}</option>
          {filterOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </NativeSelect>
      ) : null}
    </>
  )
}

function ProjectHomeCardListPager({
  unit,
  view,
}: {
  unit: string
  view: ProjectHomeCardListPagination
}) {
  if (view.total === 0) return null
  return (
    <AppPager
      className="project-home-card-group__pager"
      page={view.page}
      pageCount={view.pageCount}
      summary={projectHomeCardListPageSummary(view, unit)}
      previousLabel="上一页"
      nextLabel="下一页"
      onPage={view.onPageChange}
    />
  )
}

function useProjectHomeCardList<T>(
  items: T[],
  {
    filterLabel,
    filterValue,
    pageSize = PROJECT_HOME_CARD_PAGE_SIZE,
    searchText,
  }: ProjectHomeCardListConfig<T>,
): ProjectHomeCardListView<T> {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState(PROJECT_HOME_FILTER_ALL)
  const [requestedPage, setRequestedPage] = useState(1)

  const filterOptions = useMemo(() => {
    if (!filterValue) return []
    const options = new Map<string, string>()
    for (const item of items) {
      const value = filterValue(item)?.trim()
      if (!value) continue
      options.set(value, filterLabel?.(value) ?? value)
    }
    return Array.from(options.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'))
  }, [filterLabel, filterValue, items])
  const activeFilter = filterOptions.some((option) => option.value === filter)
    ? filter
    : PROJECT_HOME_FILTER_ALL
  const normalizedQuery = normalizeProjectHomeSearchText(query)
  const filteredItems = useMemo(() => (
    items.filter((item) => {
      const itemText = normalizeProjectHomeSearchText(searchText(item))
      const itemFilter = filterValue?.(item)?.trim()
      const matchesQuery = !normalizedQuery || itemText.includes(normalizedQuery)
      const matchesFilter = activeFilter === PROJECT_HOME_FILTER_ALL || itemFilter === activeFilter
      return matchesQuery && matchesFilter
    })
  ), [activeFilter, filterValue, items, normalizedQuery, searchText])
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize))
  const page = Math.min(Math.max(1, requestedPage), pageCount)
  const pageItems = filteredItems.slice((page - 1) * pageSize, page * pageSize)
  const onQueryChange = useCallback((value: string) => {
    setQuery(value)
    setRequestedPage(1)
  }, [])
  const onFilterChange = useCallback((value: string) => {
    setFilter(value)
    setRequestedPage(1)
  }, [])
  const onPageChange = useCallback((value: number) => {
    setRequestedPage(value)
  }, [])

  return {
    filter: activeFilter,
    filterOptions,
    filteredTotal: filteredItems.length,
    onFilterChange,
    onPageChange,
    onQueryChange,
    page,
    pageCount,
    pageItemCount: pageItems.length,
    pageItems,
    pageSize,
    query,
    total: items.length,
  }
}

function ProjectOverviewScriptList({
  scripts,
  loading,
  isCreating,
  canCreate,
  onCreateScript,
}: {
  scripts: Script[]
  loading: boolean
  isCreating: boolean
  canCreate: boolean
  onCreateScript: () => void
}) {
  const listView = useProjectHomeCardList(scripts, {
    pageSize: PROJECT_HOME_CARD_PAGE_SIZE,
    searchText: projectHomeScriptSearchText,
    filterValue: projectHomeScriptFilterValue,
  })
  const hasScripts = scripts.length > 0

  return (
    <ProjectHomeCardGroup
      icon={FileText}
      variant="library"
      layout="compact-grid"
      eyebrow="资料库"
      title="创作手记"
      description="项目里的文本源、创作记录和版本入口，适合从内容出发继续拆解。"
      count={scripts.length}
      countLabel="份"
      facts={[
        { label: '当前手记', value: `${scripts.length} 份` },
        { label: '类型', value: listView.filterOptions.length ? `${listView.filterOptions.length} 类` : '未分类' },
        { label: '分页', value: `每页 ${listView.pageSize} 份` },
      ]}
      toolbar={hasScripts ? (
        <ProjectHomeCardListToolbar
          label="手记"
          search={listView.query}
          searchPlaceholder="筛选手记"
          filter={listView.filter}
          filterOptions={listView.filterOptions}
          allFilterLabel="全部类型"
          onSearch={listView.onQueryChange}
          onFilter={listView.onFilterChange}
        />
      ) : undefined}
      footer={!loading && hasScripts ? (
        <ProjectHomeCardListPager view={listView} unit="份" />
      ) : undefined}
      action={(
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-2"
          disabled={isCreating || !canCreate}
          onClick={onCreateScript}
        >
          <FilePlus2 size={14} />
          {isCreating ? '创建中' : '添加手记'}
        </Button>
      )}
    >
      {loading ? (
        <ProjectHomeCardGroupEmpty>正在读取手记...</ProjectHomeCardGroupEmpty>
      ) : scripts.length === 0 ? (
        <ProjectHomeCardGroupEmpty>
          还没有创作手记。添加后会直接进入这份手记的编辑工作台。
        </ProjectHomeCardGroupEmpty>
      ) : listView.filteredTotal === 0 ? (
        <ProjectHomeCardGroupEmpty>没有匹配的手记。</ProjectHomeCardGroupEmpty>
      ) : listView.pageItems.map((script) => (
        <ProjectOverviewScriptCard key={script.ID} script={script} />
      ))}
    </ProjectHomeCardGroup>
  )
}

function ProjectOverviewProductionList({
  productions,
  productionPreviewRoute,
  isCreating,
  onCreateCanvas,
  onCreateClick,
}: {
  productions: ProjectHomeProductionSummary[]
  productionPreviewRoute: (production: ProjectHomeProductionSummary) => string
  isCreating: boolean
  onCreateCanvas: (production: ProjectHomeProductionSummary) => void
  onCreateClick: () => void
}) {
  const listView = useProjectHomeCardList(productions, {
    pageSize: PROJECT_HOME_CARD_PAGE_SIZE,
    searchText: projectHomeProductionSearchText,
    filterValue: projectHomeProductionFilterValue,
  })
  const hasProductions = productions.length > 0
  const timelineProductionCount = productions.filter((production) => production.source === 'timeline').length

  return (
    <ProjectHomeCardGroup
      icon={Clapperboard}
      variant="pipeline"
      layout="rows"
      eyebrow="制作链路"
      title="制作"
      description="每个制作对应一套可预览的时间线或成片上下文，也可以从这里新建专属内容画布。"
      count={productions.length}
      countLabel="个"
      facts={[
        { label: '制作数量', value: `${productions.length} 个` },
        { label: '类型', value: listView.filterOptions.length ? `${listView.filterOptions.length} 类` : '未分类' },
        { label: '时间线来源', value: `${timelineProductionCount} 个` },
      ]}
      toolbar={hasProductions ? (
        <ProjectHomeCardListToolbar
          label="制作"
          search={listView.query}
          searchPlaceholder="筛选制作"
          filter={listView.filter}
          filterOptions={listView.filterOptions}
          allFilterLabel="全部类型"
          onSearch={listView.onQueryChange}
          onFilter={listView.onFilterChange}
        />
      ) : undefined}
      footer={hasProductions ? (
        <ProjectHomeCardListPager view={listView} unit="个" />
      ) : undefined}
      action={(
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-2"
          disabled={isCreating}
          onClick={onCreateClick}
        >
          <Plus size={14} />
          创建制作
        </Button>
      )}
    >
      {productions.length ? listView.filteredTotal === 0 ? (
        <ProjectHomeCardGroupEmpty>没有匹配的制作。</ProjectHomeCardGroupEmpty>
      ) : listView.pageItems.map((production) => (
        <article key={`${production.source}:${production.id}`} className="project-home-card project-home-card--production">
          <div className="project-home-card__header">
            <span className="project-home-card__icon">
              <Clapperboard size={17} />
            </span>
            <Badge variant="outline">{production.kind}</Badge>
          </div>
          <div className="project-home-card__body">
            <h3 className="project-home-card__title">{production.title}</h3>
            <p className="project-home-card__meta">
              {production.path ?? `production:${production.id}`}
            </p>
            <p className="project-home-card__description">
              {production.previewTitle ? `默认预览：${production.previewTitle}` : '从制作预览进入时间线检查。'}
            </p>
            <div className="project-home-card__rail" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="project-home-card__signal-grid">
              <span className="project-home-card__signal">
                <span className="project-home-card__signal-label">来源</span>
                <span className="project-home-card__signal-value">{production.source === 'timeline' ? '时间线' : '旧结构'}</span>
              </span>
              <span className="project-home-card__signal">
                <span className="project-home-card__signal-label">预览</span>
                <span className="project-home-card__signal-value">{production.previewKind ?? 'production'}</span>
              </span>
            </div>
          </div>
          <div className="project-home-card__actions">
            <Button asChild size="sm" className="gap-2">
              <Link to={productionPreviewRoute(production)}>
                <MonitorPlay size={14} />
                预览
              </Link>
            </Button>
            <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => onCreateCanvas(production)}>
              <GitBranch size={14} />
              新建画布
            </Button>
          </div>
        </article>
      )) : (
        <ProjectHomeCardGroupEmpty>
          还没有制作。创建后会生成制作入口，并能进入对应的时间线预览。
        </ProjectHomeCardGroupEmpty>
      )}
    </ProjectHomeCardGroup>
  )
}

function ProjectOverviewSettingPreviewList({
  settings,
  settingPreviewRoute,
}: {
  settings: ProjectHomeSettingSummary[]
  settingPreviewRoute: (setting: ProjectHomeSettingSummary) => string
}) {
  const listView = useProjectHomeCardList(settings, {
    pageSize: PROJECT_HOME_CARD_PAGE_SIZE,
    searchText: projectHomeSettingSearchText,
    filterValue: projectHomeSettingFilterValue,
  })
  const hasSettings = settings.length > 0

  return (
    <ProjectHomeCardGroup
      icon={MonitorPlay}
      variant="reference"
      layout="compact-grid"
      eyebrow="参考预览"
      title="设定预览"
      description="设定命名空间的独立预览入口，用于检查角色、地点、道具等素材状态。"
      count={settings.length}
      countLabel="个"
      facts={[
        { label: '设定数量', value: `${settings.length} 个` },
        { label: '类型', value: listView.filterOptions.length ? `${listView.filterOptions.length} 类` : '未分类' },
        { label: '用途', value: '素材检查' },
      ]}
      toolbar={hasSettings ? (
        <ProjectHomeCardListToolbar
          label="设定"
          search={listView.query}
          searchPlaceholder="筛选设定"
          filter={listView.filter}
          filterOptions={listView.filterOptions}
          allFilterLabel="全部类型"
          onSearch={listView.onQueryChange}
          onFilter={listView.onFilterChange}
        />
      ) : undefined}
      footer={hasSettings ? (
        <ProjectHomeCardListPager view={listView} unit="个" />
      ) : undefined}
    >
      {settings.length ? listView.filteredTotal === 0 ? (
        <ProjectHomeCardGroupEmpty>没有匹配的设定。</ProjectHomeCardGroupEmpty>
      ) : listView.pageItems.map((setting) => (
        <Link key={setting.id} to={settingPreviewRoute(setting)} className="project-home-card project-home-card--button project-home-card--setting">
          <div className="project-home-card__header">
            <span className="project-home-card__icon">
              <MonitorPlay size={15} />
            </span>
            <Badge variant="outline">{setting.kind}</Badge>
          </div>
          <div className="project-home-card__body">
            <h3 className="project-home-card__title">{setting.title}</h3>
            <p className="project-home-card__meta">setting:{setting.id}</p>
            <p className="project-home-card__description">进入设定预览，检查素材状态和资产槽。</p>
            <div className="project-home-card__signal-grid">
              <span className="project-home-card__signal">
                <span className="project-home-card__signal-label">类型</span>
                <span className="project-home-card__signal-value">{setting.kind}</span>
              </span>
              <span className="project-home-card__signal">
                <span className="project-home-card__signal-label">入口</span>
                <span className="project-home-card__signal-value">预览</span>
              </span>
            </div>
          </div>
          <div className="project-home-card__footer">
            <span>设定预览</span>
            <span className="project-home-card__footer-action">
              打开
              <MonitorPlay size={13} />
            </span>
          </div>
        </Link>
      )) : (
        <ProjectHomeCardGroupEmpty>
          还没有设定。设定出现后会在这里提供独立预览入口。
        </ProjectHomeCardGroupEmpty>
      )}
    </ProjectHomeCardGroup>
  )
}

function ProjectOverviewProductionDialog({
  open,
  isBusy,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  isBusy: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: ProjectHomeProductionCreateInput) => void
}) {
  const [id, setId] = useState('')
  const [title, setTitle] = useState('')
  const [timelineProfile, setTimelineProfile] = useState<ContentCanvasTimelineProfileId>(DEFAULT_CONTENT_CANVAS_TIMELINE_PROFILE)
  const [customProductionType, setCustomProductionType] = useState('')
  const [customTimelineNamespaces, setCustomTimelineNamespaces] = useState('')
  const needsCustomTimelineNamespaces = timelineProfile === 'custom'
  const customTimelineNamespaceValues = contentCanvasParseTimelineNamespaces(customTimelineNamespaces)
  const selectedTimelineProfile = contentCanvasTimelineProfileOption(timelineProfile)
  const canSubmit = Boolean(
    id.trim()
    && title.trim()
    && timelineProfile.trim()
    && (!needsCustomTimelineNamespaces || (customProductionType.trim() && customTimelineNamespaceValues.length > 0))
    && !isBusy,
  )

  useEffect(() => {
    if (!open) {
      setId('')
      setTitle('')
      setTimelineProfile(DEFAULT_CONTENT_CANVAS_TIMELINE_PROFILE)
      setCustomProductionType('')
      setCustomTimelineNamespaces('')
    }
  }, [open])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    onSubmit({
      id: id.trim(),
      title: title.trim(),
      timelineProfile,
      ...(needsCustomTimelineNamespaces ? { productionType: customProductionType.trim() } : {}),
      ...(needsCustomTimelineNamespaces ? { timelineNamespaces: customTimelineNamespaceValues } : {}),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>创建制作</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <Label className="grid gap-2" htmlFor="project-home-production-id">
            <span>ID</span>
            <Input
              id="project-home-production-id"
              autoFocus
              value={id}
              placeholder="pilot"
              onChange={(event) => setId(event.target.value)}
            />
          </Label>
          <Label className="grid gap-2" htmlFor="project-home-production-title">
            <span>标题</span>
            <Input
              id="project-home-production-title"
              value={title}
              placeholder="第一支短片"
              onChange={(event) => setTitle(event.target.value)}
            />
          </Label>
          <div className="grid gap-2">
            <Label htmlFor="project-home-production-profile">制作类型</Label>
            <Select value={timelineProfile} onValueChange={(value) => setTimelineProfile(value as ContentCanvasTimelineProfileId)}>
              <SelectTrigger id="project-home-production-profile">
                <SelectValue placeholder="选择制作类型" />
              </SelectTrigger>
              <SelectContent>
                {CONTENT_CANVAS_TIMELINE_PROFILE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="type-caption text-muted-foreground">{selectedTimelineProfile.description}</p>
          </div>
          {needsCustomTimelineNamespaces ? (
            <>
              <Label className="grid gap-2" htmlFor="project-home-production-type">
                <span>自定义类型</span>
                <Input
                  id="project-home-production-type"
                  value={customProductionType}
                  placeholder="music_video"
                  onChange={(event) => setCustomProductionType(event.target.value)}
                />
              </Label>
              <Label className="grid gap-2" htmlFor="project-home-production-timeline-namespaces">
                <span>内部时间层级</span>
                <Input
                  id="project-home-production-timeline-namespaces"
                  value={customTimelineNamespaces}
                  placeholder="act, sequence, beat"
                  onChange={(event) => setCustomTimelineNamespaces(event.target.value)}
                />
              </Label>
            </>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={isBusy} onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" className="gap-2" disabled={!canSubmit}>
              <Plus size={14} />
              {isBusy ? '创建中' : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  const listView = useProjectHomeCardList(canvases, {
    pageSize: PROJECT_HOME_CARD_PAGE_SIZE,
    searchText: projectHomeCanvasSearchText,
    filterValue: projectHomeCanvasFilterValue,
    filterLabel: projectHomeCanvasFilterLabel,
  })
  const hasCanvases = canvases.length > 0
  const canvasNodeCount = canvases.reduce((sum, canvas) => sum + contentCanvasDocumentNodeIds(canvas).length, 0)

  return (
    <ProjectHomeCardGroup
      icon={GitBranch}
      variant="canvas"
      eyebrow="工作台"
      title="内容画布"
      description="内容画布保存节点引用、布局和视角；全局画布与制作画布分开展示。"
      count={canvases.length}
      countLabel="张"
      facts={[
        { label: '画布数量', value: `${canvases.length} 张` },
        { label: '节点引用', value: `${canvasNodeCount} 个` },
        { label: '作用域', value: listView.filterOptions.length ? `${listView.filterOptions.length} 类` : '全局' },
      ]}
      toolbar={hasCanvases ? (
        <ProjectHomeCardListToolbar
          label="内容画布"
          search={listView.query}
          searchPlaceholder="筛选内容画布"
          filter={listView.filter}
          filterOptions={listView.filterOptions}
          allFilterLabel="全部作用域"
          onSearch={listView.onQueryChange}
          onFilter={listView.onFilterChange}
        />
      ) : undefined}
      footer={hasCanvases ? (
        <ProjectHomeCardListPager view={listView} unit="张" />
      ) : undefined}
      action={(
        <Button type="button" size="sm" variant="outline" className="gap-2" onClick={onCreateCanvas}>
          <Plus size={14} />
          新建画布
        </Button>
      )}
    >
      {canvases.length ? listView.filteredTotal === 0 ? (
        <ProjectHomeCardGroupEmpty>没有匹配的内容画布。</ProjectHomeCardGroupEmpty>
      ) : listView.pageItems.map((canvas) => {
        const nodeCount = contentCanvasDocumentNodeIds(canvas).length
        return (
          <Link key={canvas.id} to={canvasRoute(canvas.id)} className="project-home-card project-home-card--button project-home-card--canvas">
            <div className="project-home-card__header">
              <span className="project-home-card__icon">
                <GitBranch size={15} />
              </span>
              <Badge variant="outline">{projectHomeCanvasScopeLabel(canvas)}</Badge>
            </div>
            <div className="project-home-card__body">
              <h3 className="project-home-card__title">{canvas.title}</h3>
              <p className="project-home-card__meta">{nodeCount} 节点 · {formatCanvasUpdatedAt(canvas.updatedAt)}</p>
              <p className="project-home-card__description">
                {nodeCount > 0 ? '继续整理创作节点和布局视角。' : '空画布，可直接开始组织创作节点。'}
              </p>
              <div className="project-home-card__signal-grid">
                <span className="project-home-card__signal">
                  <span className="project-home-card__signal-label">节点</span>
                  <span className="project-home-card__signal-value">{nodeCount}</span>
                </span>
                <span className="project-home-card__signal">
                  <span className="project-home-card__signal-label">更新</span>
                  <span className="project-home-card__signal-value">{formatCanvasUpdatedAt(canvas.updatedAt)}</span>
                </span>
              </div>
              <div className="project-home-card__scope-row">
                <span>{projectHomeCanvasScopeKindLabel(canvas)}</span>
                <span>{canvas.id}</span>
              </div>
            </div>
            <div className="project-home-card__footer">
              <span>{projectHomeCanvasScopeKindLabel(canvas)}</span>
              <span className="project-home-card__footer-action">
                打开内容画布
                <GitBranch size={13} />
              </span>
            </div>
          </Link>
        )
      }) : (
        <ProjectHomeCardGroupEmpty>
          还没有内容画布。新建后会进入空白画布，并保存到当前项目文件中。
        </ProjectHomeCardGroupEmpty>
      )}
    </ProjectHomeCardGroup>
  )
}

function projectHomeCardListPageSummary(view: ProjectHomeCardListPagination, unit: string): string {
  if (view.filteredTotal === 0) return `0 ${unit}`
  const start = (view.page - 1) * view.pageSize + 1
  const end = start + view.pageItemCount - 1
  const totalText = view.filteredTotal === view.total
    ? `${view.filteredTotal} ${unit}`
    : `${view.filteredTotal}/${view.total} ${unit}`
  return `${start}-${end} / ${totalText}`
}

function projectHomeSearchParts(...parts: unknown[]): string {
  return parts
    .filter((part) => part !== undefined && part !== null)
    .map((part) => String(part))
    .join(' ')
}

function normalizeProjectHomeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN')
}

function projectHomeScriptSearchText(script: Script): string {
  return projectHomeSearchParts(
    script.title,
    script.script_type,
    script.summary,
    script.description,
    script.plot_summary,
  )
}

function projectHomeScriptFilterValue(script: Script): string {
  return script.script_type?.trim() || '手记'
}

function projectHomeProductionSearchText(production: ProjectHomeProductionSummary): string {
  return projectHomeSearchParts(
    production.title,
    production.id,
    production.kind,
    production.path,
    production.previewTitle,
    production.previewPath,
    production.source,
  )
}

function projectHomeProductionFilterValue(production: ProjectHomeProductionSummary): string {
  return production.kind.trim() || 'production'
}

function projectHomeSettingSearchText(setting: ProjectHomeSettingSummary): string {
  return projectHomeSearchParts(setting.title, setting.id, setting.kind)
}

function projectHomeSettingFilterValue(setting: ProjectHomeSettingSummary): string {
  return setting.kind.trim() || 'setting'
}

function projectHomeCanvasSearchText(canvas: ContentCanvasDocument): string {
  const scope = contentCanvasDocumentScope(canvas)
  return projectHomeSearchParts(
    canvas.title,
    canvas.id,
    canvas.updatedAt,
    contentCanvasDocumentNodeIds(canvas).length,
    scope.kind,
    scope.kind === 'production' ? scope.productionId : undefined,
    scope.kind === 'production' ? scope.productionTitle : undefined,
  )
}

function projectHomeCanvasFilterValue(canvas: ContentCanvasDocument): string {
  const scope = contentCanvasDocumentScope(canvas)
  return scope.kind === 'production' ? 'production' : 'global'
}

function projectHomeCanvasFilterLabel(value: string): string {
  if (value === 'production') return '制作内容画布'
  if (value === 'global') return '全局内容画布'
  return value
}

function projectHomeCanvasScopeKindLabel(canvas: ContentCanvasDocument): string {
  return projectHomeCanvasFilterLabel(projectHomeCanvasFilterValue(canvas))
}

function projectHomeCanvasScopeLabel(canvas: ContentCanvasDocument): string {
  const scope = contentCanvasDocumentScope(canvas)
  if (scope.kind === 'production') return scope.productionTitle ? `制作 · ${scope.productionTitle}` : `制作 · ${scope.productionId}`
  return '全局内容画布'
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

function projectHomeProductionSummaries(data: ProjectOverviewData): ProjectHomeProductionSummary[] {
  const summaries = new Map<string, ProjectHomeProductionSummary & { order?: number }>()
  const timelineRecords = projectTimelineNamespaceRecords(data)
  for (const record of timelineRecords) {
    if (!isRootProductionTimelineNamespace(record)) continue
    const id = stringValue(record.id)
    if (!id) continue
    const kind = stringValue(record.production_type ?? record.productionType ?? record.timeline_profile ?? record.timelineProfile ?? record.kind) ?? 'production'
    const previewRecord = projectHomeDefaultPreviewNamespace(record, timelineRecords)
    const previewEntityKind = projectHomeTimelineEntityKind(previewRecord)
    const previewId = stringValue(previewRecord.id)
    const previewKind = stringValue(previewRecord.kind)
    summaries.set(id, {
      id,
      title: stringValue(record.title) ?? id,
      kind,
      path: stringValue(record.path),
      ...(previewEntityKind ? { previewEntityKind } : {}),
      ...(previewId ? { previewId } : {}),
      ...(previewKind ? { previewKind } : {}),
      ...(stringValue(previewRecord.path) ? { previewPath: stringValue(previewRecord.path) } : {}),
      ...(stringValue(previewRecord.title) ? { previewTitle: stringValue(previewRecord.title) } : {}),
      order: numberValue(record.order),
      source: 'timeline',
    })
  }
  for (const record of data.productions) {
    const id = stringValue(record.id) ?? numberIdValue(record.ID)
    if (!id || summaries.has(id)) continue
    summaries.set(id, {
      id,
      title: stringValue(record.title ?? record.name ?? record.label) ?? `制作 ${id}`,
      kind: stringValue(record.production_type ?? record.productionType ?? record.timeline_profile ?? record.timelineProfile ?? record.kind) ?? 'production',
      previewEntityKind: 'production',
      previewId: id,
      previewKind: stringValue(record.kind) ?? 'production',
      order: numberValue(record.order),
      source: 'legacy',
    })
  }
  return Array.from(summaries.values()).sort((left, right) => (
    (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER)
    || left.title.localeCompare(right.title, 'zh-CN')
    || left.id.localeCompare(right.id, 'zh-CN')
  ))
}

function projectHomeSettingSummaries(records: ProjectOverviewRecord[]): ProjectHomeSettingSummary[] {
  return records
    .map((record) => {
      const id = stringValue(record.id) ?? numberIdValue(record.ID)
      if (!id) return undefined
      return {
        id,
        title: stringValue(record.title ?? record.name ?? record.label) ?? `设定 ${id}`,
        kind: stringValue(record.kind) ?? 'setting',
      }
    })
    .filter((record): record is ProjectHomeSettingSummary => Boolean(record))
    .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN') || left.id.localeCompare(right.id, 'zh-CN'))
}

function projectTimelineNamespaceRecords(data: ProjectOverviewData): Record<string, unknown>[] {
  const records = data.projectTimelineStatus?.timeline_namespaces
  return Array.isArray(records) ? records.filter(isRecord) : []
}

function isRootProductionTimelineNamespace(record: Record<string, unknown>): boolean {
  const entityKind = stringValue(record.entity_kind ?? record.entityKind)
  const path = stringValue(record.path)
  const parent = isRecord(record.parent) ? record.parent : undefined
  return entityKind === 'production'
    || path?.endsWith('/production.json') === true
    || (!parent && stringValue(record.kind) === 'production')
}

function projectHomeProductionPreviewPath(projectId: number, production: ProjectHomeProductionSummary): string {
  const targetRef = `timeline_assembly:production:${production.id}`
  const previewNodeId = `production:${production.id}`
  return surfaceRoutePath('project.contentPreview', {
    projectId,
    tab: 'preview',
    canvasNode: previewNodeId,
    node: previewNodeId,
    kind: 'other',
    productionId: production.id,
    scopeKind: 'production',
    scopeRef: production.id,
    targetCategory: 'timeline_assembly',
    targetKind: 'timeline_assembly',
    targetRef,
    timeline_assembly_ref: targetRef,
  })
}

function projectHomeSettingPreviewPath(projectId: number, setting: ProjectHomeSettingSummary): string {
  return surfaceRoutePath('project.settingPreview', {
    projectId,
    tab: 'preview',
    canvasNode: `setting:${setting.id}`,
    node: `setting:${setting.id}`,
    kind: 'setting',
    settingKind: setting.kind,
    targetCategory: 'setting_namespace',
    targetKind: 'setting',
    targetRef: `setting:${setting.id}`,
  })
}

async function createProjectHomeProduction(
  projectId: number,
  workspaceContext: object,
  input: ProjectHomeProductionCreateInput,
): Promise<ProjectHomeProductionSummary> {
  const api = readSurfaceHostApi()
  if (!api?.writeMovScriptEngineHierarchyNode) throw new Error('当前环境不支持写入制作层级')
  const timelineProfile = input.timelineProfile || DEFAULT_CONTENT_CANVAS_TIMELINE_PROFILE
  const nodes = projectHomeProductionInitialTimelineNodes(projectId, input, timelineProfile)
  const rootNode = nodes[0]
  if (!rootNode) throw new Error('制作类型模板为空')
  for (const node of nodes) {
    await api.writeMovScriptEngineHierarchyNode({
      ...workspaceContext,
      projectId,
      expectedWorkspaceVersions: { [node.targetPath]: null },
      targetPath: node.targetPath,
      record: node.record,
    })
  }
  return {
    id: rootNode.id,
    title: rootNode.title,
    kind: rootNode.namespaceKind,
    path: rootNode.targetPath,
    previewEntityKind: rootNode.entityKind,
    previewId: rootNode.id,
    previewKind: rootNode.namespaceKind,
    previewPath: rootNode.targetPath,
    previewTitle: rootNode.title,
    source: 'timeline',
  }
}

function projectHomeDefaultPreviewNamespace(
  root: Record<string, unknown>,
  timelineRecords: Record<string, unknown>[],
): Record<string, unknown> {
  const defaultPreviewKind = contentCanvasTimelineRootDefaultPreviewKind(stringValue(root.kind))
  if (stringValue(root.kind) === defaultPreviewKind) return root
  return projectHomeTimelineDescendants(root, timelineRecords)
    .find((record) => stringValue(record.kind) === defaultPreviewKind)
    ?? root
}

function projectHomeTimelineDescendants(
  root: Record<string, unknown>,
  timelineRecords: Record<string, unknown>[],
): Record<string, unknown>[] {
  const descendants: Record<string, unknown>[] = []
  const visit = (parent: Record<string, unknown>) => {
    for (const record of timelineRecords) {
      const parentRef = isRecord(record.parent) ? record.parent : undefined
      if (!parentRef || !projectHomeTimelineRefMatchesRecord(parentRef, parent)) continue
      descendants.push(record)
      visit(record)
    }
  }
  visit(root)
  return descendants
}

function projectHomeTimelineRefMatchesRecord(ref: Record<string, unknown>, record: Record<string, unknown>): boolean {
  const refPath = stringValue(ref.path)
  const recordPath = stringValue(record.path)
  if (refPath && recordPath && refPath === recordPath) return true
  const refId = stringValue(ref.id)
  const recordId = stringValue(record.id)
  const refKind = stringValue(ref.kind)
  const recordKind = stringValue(record.kind)
  return Boolean(refId && recordId && refId === recordId && (!refKind || !recordKind || refKind === recordKind))
}

function projectHomeTimelineEntityKind(record: Record<string, unknown>): 'production' | 'segment' | undefined {
  const entityKind = stringValue(record.entity_kind ?? record.entityKind)
  if (entityKind === 'production' || entityKind === 'segment') return entityKind
  const path = stringValue(record.path)
  if (path?.endsWith('/production.json')) return 'production'
  if (path?.endsWith('/segment.json')) return 'segment'
  return undefined
}

interface ProjectHomeInitialTimelineNode {
  entityKind: 'production' | 'segment'
  id: string
  namespaceKind: string
  record: Record<string, unknown>
  targetPath: string
  title: string
}

function projectHomeProductionInitialTimelineNodes(
  projectId: number,
  input: ProjectHomeProductionCreateInput,
  timelineProfile: ContentCanvasTimelineProfileId,
): ProjectHomeInitialTimelineNode[] {
  const namespaceKinds = contentCanvasTimelineProfileInitialNamespaceKinds(timelineProfile)
  const productionType = input.productionType?.trim() || contentCanvasTimelineProfileProductionType(timelineProfile)
  const timelineNamespaces = input.timelineNamespaces?.length
    ? input.timelineNamespaces
    : contentCanvasTimelineProfileNamespaces(timelineProfile || productionType)
  const baseId = safeProjectHomeToken(input.id)
  const orderBase = Date.now()
  const nodeInputs = namespaceKinds.map((namespaceKind, index) => ({
    entityKind: index === 0 ? 'production' as const : 'segment' as const,
    id: index === 0 ? input.id : projectHomeDefaultChildNamespaceId(input.id, namespaceKind),
    namespaceKind,
    title: index === 0 ? input.title : projectHomeDefaultChildNamespaceTitle(input.title, namespaceKind),
  }))
  return nodeInputs.map((node, index) => {
    const targetPath = index === 0
      ? `timeline/${baseId}/production.json`
      : projectHomeTimelineChildPath(nodeInputs.slice(0, index + 1))
    return {
      ...node,
      targetPath,
      record: pruneUndefinedRecord({
        schema: `movscript.${node.entityKind}.v1`,
        kind: node.entityKind,
        id: node.id,
        title: node.title,
        project_id: projectId,
        namespace_kind: node.namespaceKind,
        production_type: index === 0 ? productionType : undefined,
        timeline_profile: index === 0 ? productionType : undefined,
        timeline_namespaces: index === 0 && timelineNamespaces.length ? timelineNamespaces : undefined,
        order: orderBase + index,
      }),
    }
  })
}

function projectHomeTimelineChildPath(nodes: Array<{ id: string; entityKind: 'production' | 'segment' }>): string {
  const [root, ...children] = nodes
  if (!root) return 'timeline/production/production.json'
  let currentDir = `timeline/${safeProjectHomeToken(root.id)}`
  for (const child of children) {
    currentDir = `${currentDir}/segments/${safeProjectHomeToken(child.id)}`
  }
  return `${currentDir}/segment.json`
}

function projectHomeDefaultChildNamespaceId(rootId: string, namespaceKind: string): string {
  const safeRootId = safeProjectHomeToken(rootId)
  if (namespaceKind === 'season') return `${safeRootId}_s01`
  if (namespaceKind === 'episode') return `${safeRootId}_e01`
  if (namespaceKind === 'module') return `${safeRootId}_m01`
  if (namespaceKind === 'lesson') return `${safeRootId}_l01`
  return `${safeRootId}_${safeProjectHomeToken(namespaceKind)}_01`
}

function projectHomeDefaultChildNamespaceTitle(rootTitle: string, namespaceKind: string): string {
  if (namespaceKind === 'season') return `${rootTitle} 第一季`
  if (namespaceKind === 'episode') return `${rootTitle} 第 1 集`
  if (namespaceKind === 'module') return `${rootTitle} 模块 1`
  if (namespaceKind === 'lesson') return `${rootTitle} 第 1 课`
  return `${rootTitle} ${namespaceKind}`
}

function pruneUndefinedRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined))
}

function safeProjectHomeToken(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'production'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function numberIdValue(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined
}
