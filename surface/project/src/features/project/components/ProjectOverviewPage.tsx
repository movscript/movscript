import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Blocks, Clapperboard, FilePlus2, FileText, FolderKanban, GitBranch, ImageOff, MonitorPlay, Plus, Settings } from 'lucide-react'
import { AppContentLayout } from '@movscript/ui/layout'
import { AppPager } from '@movscript/ui/business/app'
import {
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
import { resolveResourceFileUrl } from '@movscript/resource-surface/resource-media'
import {
  readSurfaceHostApi,
  surfaceRoutePath,
  surfaceWorkspaceOwnerContext,
  type Script,
} from '@movscript/shared'

import {
  emptyProjectOverviewData,
  loadProjectOverviewData,
  type ProjectOverviewCandidateView,
  type ProjectOverviewData,
  type ProjectOverviewRecord,
} from '../application/projectOverviewData'
import { projectOverviewKeys } from '../application/projectQueries'
import { useSurfaceHostState } from '../application/surfaceHostStateHooks'
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

const PROJECT_HOME_CARD_PAGE_SIZE = 3
const PROJECT_HOME_CANVAS_PAGE_SIZE = 8
const PROJECT_HOME_SETTING_PAGE_SIZE = 24
const PROJECT_HOME_FILTER_ALL = '__all'
const PROJECT_HOME_ROW_PAGE_SIZE_OPTIONS = [3, 5, 8, 12]
const PROJECT_HOME_CANVAS_PAGE_SIZE_OPTIONS = [4, 8, 12, 16]
const PROJECT_HOME_SETTING_PAGE_SIZE_OPTIONS = [6, 12, 18, 24]

interface ProjectHomePluginSummary {
  id: string
  title: string
  kind: string
  description: string
}

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
  media: ProjectHomeSettingMedia
}

type ProjectHomeSettingMediaState = 'selected' | 'candidate' | 'missing'

interface ProjectHomeSettingMedia {
  state: ProjectHomeSettingMediaState
  label: string
  imageUrl?: string
  contentUnitId?: string
  candidateId?: string
  resourceId?: string
}

interface ProjectHomeCandidatePreview {
  id: string
  resourceId?: string
  mediaKind: 'image' | 'video' | 'audio' | 'text' | 'unknown'
  mediaUrl?: string
}

interface ProjectHomeSettingCandidateContext {
  contentUnitId: string
  contentUnit?: Record<string, unknown>
  candidates: ProjectHomeCandidatePreview[]
  selectedCandidateId?: string
  selectedResourceId?: string
  selectedCandidate?: ProjectHomeCandidatePreview
  haystack: string
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
  const location = useLocation()
  const queryClient = useQueryClient()
  const currentProject = useSurfaceHostState((state) => state.currentProject)
  const currentUser = useSurfaceHostState((state) => state.currentUser)
  const currentOrgID = useSurfaceHostState((state) => state.currentOrgID)
  const orgMemberships = useSurfaceHostState((state) => state.orgMemberships)
  const projectId = currentProject?.ID
  const projectDir = currentProject?.workspace_path ?? currentProject?.project_path
  const currentProjectRecord = currentProject as unknown as Record<string, unknown> | undefined
  const projectUid = stringValue(currentProjectRecord?.project_uid ?? currentProjectRecord?.projectUid ?? currentProjectRecord?.uid)
  const projectServiceBaseURL = useMemo(
    () => projectHomeProjectServiceBaseURLFromSearch(location.search),
    [location.search],
  )
  const enabled = Number.isInteger(projectId) && Number(projectId) > 0
  const workspaceContext = useMemo(
    () => projectDir
      ? { projectDir, ...(projectUid ? { projectUid } : {}), ...(projectServiceBaseURL ? { projectServiceBaseURL } : {}) }
      : surfaceWorkspaceOwnerContext({ currentUser, currentOrgID, orgMemberships }),
    [currentOrgID, currentUser, orgMemberships, projectDir, projectServiceBaseURL, projectUid],
  )
  const { data = emptyProjectOverviewData, error, isFetching } = useQuery({
    queryKey: [
      ...projectOverviewKeys.detail(projectId),
      projectDir ?? 'remote',
      projectUid ?? 'project-uidless',
      projectServiceBaseURL ?? 'project-service-proxy',
    ],
    queryFn: () => loadProjectOverviewData(projectId as number, workspaceContext),
    enabled,
  })
  const scriptsQuery = useQuery<Script[]>({
    queryKey: scriptKeys.projectScripts(projectId, workspaceContext),
    queryFn: () => listWorkspaceScripts(projectId as number, workspaceContext),
    enabled,
  })
  const productions = useMemo(() => projectHomeProductionSummaries(data), [data])
  const settings = useMemo(() => projectHomeSettingSummaries(data), [data])
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
        void queryClient.invalidateQueries({
          queryKey: [
            ...projectOverviewKeys.detail(projectId),
            projectDir ?? 'remote',
            projectUid ?? 'project-uidless',
            projectServiceBaseURL ?? 'project-service-proxy',
          ],
        })
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
    <AppContentLayout variant="contained" width="wide" contentClassName="project-overview-content">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 type-label text-destructive">
          {error instanceof Error ? error.message : String(error)}
        </div>
      ) : null}

      <div className="project-overview-shell">
        <section className="project-overview-summary" aria-label="项目总览">
          <div className="project-overview-summary__main">
            <div className="project-overview-summary__head">
              <div className="project-overview-summary__copy">
                <p className="project-overview-summary__kicker">项目总览</p>
                <h1 className="project-overview-summary__title">{currentProject.name || '项目首页'}</h1>
              </div>
              {projectId ? (
                <Button asChild type="button" size="sm" variant="outline" className="project-overview-summary__settings">
                  <Link to={surfaceRoutePath('project.settings', { projectId })}>
                    <Settings size={14} />
                    项目设定
                  </Link>
                </Button>
              ) : null}
            </div>
            <div className="project-overview-fields" aria-label="项目字段">
              <ProjectOverviewFieldChip label="project_id" value={projectId ?? 'unknown'} />
              <ProjectOverviewFieldChip label="aspect_ratio" value={projectHomeFieldValue(currentProject.aspect_ratio)} />
              <ProjectOverviewFieldChip label="visual_style" value={projectHomeFieldValue(currentProject.visual_style ?? currentProject.project_style)} />
            </div>
          </div>
          <ProjectOverviewPluginList projectName={currentProject.name || '项目'} />
        </section>

        <div className="project-home-card-groups">
          <div className="project-home-card-column project-home-card-column--left">
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
              projectName={currentProject.name || '项目'}
            />
          </div>

          <div className="project-home-card-column project-home-card-column--right">
            <ProjectOverviewCanvasList
              canvases={canvasDocuments}
              canvasRoute={canvasRoute}
              onCreateCanvas={createCanvasFromHome}
              projectName={currentProject.name || '项目'}
            />

            <ProjectOverviewScriptList
              scripts={scripts}
              loading={scriptsQuery.isLoading || isFetching}
              isCreating={createScript.isPending}
              canCreate={Boolean(projectId)}
              onCreateScript={() => createScript.mutate()}
            />
          </div>
        </div>
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

function ProjectOverviewFieldChip({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div className="project-overview-field-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ProjectOverviewPluginList({ projectName }: { projectName: string }) {
  const plugins = useMemo<ProjectHomePluginSummary[]>(() => [
    {
      id: 'project_standards',
      title: '项目规范',
      kind: 'project_standards',
      description: '统一画幅、镜头语言、视觉风格和生成约束。',
    },
  ], [])
  const listView = useProjectHomeCardList(plugins, {
    pageSize: 99,
    searchText: (plugin) => projectHomeSearchParts(plugin.id, plugin.title, plugin.kind, plugin.description),
    filterValue: (plugin) => plugin.kind,
    filterLabel: projectHomePluginFilterLabel,
  })

  return (
    <aside className="project-overview-plugin-panel" aria-label="项目插件">
      <div className="project-overview-plugin-panel__header">
        <div className="project-overview-plugin-panel__title">
          <span className="project-overview-plugin-panel__icon" aria-hidden="true">
            <Blocks size={15} />
          </span>
          <div>
            <h2>项目插件</h2>
          </div>
        </div>
        <div className="project-overview-plugin-panel__controls">
          <ProjectHomeCardListToolbar
            label="项目插件"
            filter={listView.filter}
            filterOptions={listView.filterOptions}
            allFilterLabel="全部类型"
            onFilter={listView.onFilterChange}
          />
        </div>
      </div>
      <div className="project-overview-plugin-list">
        {listView.pageItems.map((plugin) => (
          <ProjectBuiltInStandardsPluginCard
            key={plugin.id}
            breadcrumb={`${projectName} / 项目插件 / ${plugin.title}`}
          />
        ))}
      </div>
    </aside>
  )
}

function projectHomePluginFilterLabel(value: string): string {
  if (value === 'project_standards') return '项目规范'
  return value
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
  onPageSizeChange: (value: number) => void
  onQueryChange: (value: string) => void
  pageItems: T[]
  pageSizeOptions: number[]
  query: string
}

interface ProjectHomeCardListConfig<T> {
  filterLabel?: (value: string) => string
  filterValue?: (item: T) => string | undefined
  pageSize?: number
  pageSizeOptions?: number[]
  searchText: (item: T) => string
}

function ProjectHomeCardListToolbar({
  allFilterLabel,
  filter,
  filterOptions,
  label,
  onFilter,
}: {
  allFilterLabel: string
  filter: string
  filterOptions: ProjectHomeFilterOption[]
  label: string
  onFilter: (value: string) => void
}) {
  if (!filterOptions.length) return null
  return (
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

function ProjectHomeCardListPageSizeSelect({
  label,
  onPageSize,
  pageSize,
  pageSizeOptions,
}: {
  label: string
  onPageSize: (value: number) => void
  pageSize: number
  pageSizeOptions: number[]
}) {
  if (!pageSizeOptions.length) return null
  return (
    <NativeSelect
      controlSize="sm"
      className="project-home-card-group__page-size"
      value={String(pageSize)}
      aria-label={`${label}每页数量`}
      onChange={(event) => onPageSize(Number(event.target.value))}
    >
      {pageSizeOptions.map((option) => (
        <option key={option} value={option}>每页 {option}</option>
      ))}
    </NativeSelect>
  )
}

function useProjectHomeCardList<T>(
  items: T[],
  {
    filterLabel,
    filterValue,
    pageSize = PROJECT_HOME_CARD_PAGE_SIZE,
    pageSizeOptions,
    searchText,
  }: ProjectHomeCardListConfig<T>,
): ProjectHomeCardListView<T> {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState(PROJECT_HOME_FILTER_ALL)
  const [requestedPage, setRequestedPage] = useState(1)
  const normalizedPageSizeOptions = useMemo(() => (
    Array.from(new Set([pageSize, ...(pageSizeOptions ?? PROJECT_HOME_ROW_PAGE_SIZE_OPTIONS)]))
      .filter((value) => Number.isInteger(value) && value > 0)
      .sort((left, right) => left - right)
  ), [pageSize, pageSizeOptions])
  const [requestedPageSize, setRequestedPageSize] = useState(pageSize)
  const activePageSize = normalizedPageSizeOptions.includes(requestedPageSize)
    ? requestedPageSize
    : pageSize

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
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / activePageSize))
  const page = Math.min(Math.max(1, requestedPage), pageCount)
  const pageItems = filteredItems.slice((page - 1) * activePageSize, page * activePageSize)
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
  const onPageSizeChange = useCallback((value: number) => {
    if (!Number.isInteger(value) || value <= 0) return
    setRequestedPageSize(value)
    setRequestedPage(1)
  }, [])

  return {
    filter: activeFilter,
    filterOptions,
    filteredTotal: filteredItems.length,
    onFilterChange,
    onPageChange,
    onPageSizeChange,
    onQueryChange,
    page,
    pageCount,
    pageItemCount: pageItems.length,
    pageItems,
    pageSize: activePageSize,
    pageSizeOptions: normalizedPageSizeOptions,
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
    pageSizeOptions: PROJECT_HOME_ROW_PAGE_SIZE_OPTIONS,
    searchText: projectHomeScriptSearchText,
    filterValue: projectHomeScriptFilterValue,
  })
  const hasScripts = scripts.length > 0

  return (
    <ProjectHomeCardGroup
      icon={FileText}
      variant="library"
      layout="rows"
      title="创作手记"
      count={scripts.length}
      countLabel="份"
      footer={!loading && hasScripts ? (
        <ProjectHomeCardListPager view={listView} unit="份" />
      ) : undefined}
      action={(
        <>
          {hasScripts ? (
            <ProjectHomeCardListToolbar
              label="手记"
              filter={listView.filter}
              filterOptions={listView.filterOptions}
              allFilterLabel="全部类型"
              onFilter={listView.onFilterChange}
            />
          ) : null}
          <ProjectHomeCardListPageSizeSelect
            label="手记"
            pageSize={listView.pageSize}
            pageSizeOptions={listView.pageSizeOptions}
            onPageSize={listView.onPageSizeChange}
          />
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
        </>
      )}
    >
      {loading && scripts.length === 0 ? (
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
    pageSizeOptions: PROJECT_HOME_ROW_PAGE_SIZE_OPTIONS,
    searchText: projectHomeProductionSearchText,
    filterValue: projectHomeProductionFilterValue,
  })
  const hasProductions = productions.length > 0

  return (
    <ProjectHomeCardGroup
      icon={Clapperboard}
      variant="pipeline"
      layout="rows"
      title="制作"
      count={productions.length}
      countLabel="个"
      footer={hasProductions ? (
        <ProjectHomeCardListPager view={listView} unit="个" />
      ) : undefined}
      action={(
        <>
          {hasProductions ? (
            <ProjectHomeCardListToolbar
              label="制作"
              filter={listView.filter}
              filterOptions={listView.filterOptions}
              allFilterLabel="全部类型"
              onFilter={listView.onFilterChange}
            />
          ) : null}
          <ProjectHomeCardListPageSizeSelect
            label="制作"
            pageSize={listView.pageSize}
            pageSizeOptions={listView.pageSizeOptions}
            onPageSize={listView.onPageSizeChange}
          />
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
        </>
      )}
    >
      {productions.length ? listView.filteredTotal === 0 ? (
        <ProjectHomeCardGroupEmpty>没有匹配的制作。</ProjectHomeCardGroupEmpty>
      ) : listView.pageItems.map((production) => (
        <article key={`${production.source}:${production.id}`} className="project-home-production-row">
          <div className="project-home-production-row__type">
            <strong>{production.title}</strong>
            <span>type: {production.kind || 'production'}</span>
          </div>
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
  projectName,
}: {
  settings: ProjectHomeSettingSummary[]
  settingPreviewRoute: (setting: ProjectHomeSettingSummary) => string
  projectName: string
}) {
  const listView = useProjectHomeCardList(settings, {
    pageSize: PROJECT_HOME_SETTING_PAGE_SIZE,
    pageSizeOptions: PROJECT_HOME_SETTING_PAGE_SIZE_OPTIONS,
    searchText: projectHomeSettingSearchText,
    filterValue: projectHomeSettingFilterValue,
  })
  const hasSettings = settings.length > 0

  return (
    <ProjectHomeCardGroup
      icon={MonitorPlay}
      variant="reference"
      layout="compact-grid"
      title="设定预览"
      count={settings.length}
      countLabel="个"
      action={(
        <>
          {hasSettings ? (
            <ProjectHomeCardListToolbar
              label="设定"
              filter={listView.filter}
              filterOptions={listView.filterOptions}
              allFilterLabel="全部类型"
              onFilter={listView.onFilterChange}
            />
          ) : null}
          <ProjectHomeCardListPageSizeSelect
            label="设定"
            pageSize={listView.pageSize}
            pageSizeOptions={listView.pageSizeOptions}
            onPageSize={listView.onPageSizeChange}
          />
        </>
      )}
      footer={hasSettings ? (
        <ProjectHomeCardListPager view={listView} unit="个" />
      ) : undefined}
    >
      {settings.length ? listView.filteredTotal === 0 ? (
        <ProjectHomeCardGroupEmpty>没有匹配的设定。</ProjectHomeCardGroupEmpty>
      ) : listView.pageItems.map((setting) => (
        <Link
          key={setting.id}
          to={settingPreviewRoute(setting)}
          className="project-home-setting-card"
          data-state={setting.media.state}
        >
          {setting.media.imageUrl ? (
            <img className="project-home-setting-card__image" src={setting.media.imageUrl} alt={`${setting.title} 设定预览`} />
          ) : (
            <span className="project-home-setting-card__placeholder" aria-hidden="true">
              <ImageOff size={18} />
            </span>
          )}
          <span className="project-home-setting-card__state">{setting.media.label}</span>
          <div className="project-home-setting-card__body">
            <span className="project-home-setting-card__breadcrumb">{projectName} / 设定 / {setting.title}</span>
            <div className="project-home-setting-card__copy">
              <strong>{setting.title}</strong>
              <span>{setting.kind}</span>
            </div>
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
  projectName,
}: {
  canvases: ContentCanvasDocument[]
  canvasRoute: (canvasId?: string) => string
  onCreateCanvas: () => void
  projectName: string
}) {
  const listView = useProjectHomeCardList(canvases, {
    pageSize: PROJECT_HOME_CANVAS_PAGE_SIZE,
    pageSizeOptions: PROJECT_HOME_CANVAS_PAGE_SIZE_OPTIONS,
    searchText: projectHomeCanvasSearchText,
    filterValue: projectHomeCanvasFilterValue,
    filterLabel: projectHomeCanvasFilterLabel,
  })
  const hasCanvases = canvases.length > 0

  return (
    <ProjectHomeCardGroup
      icon={GitBranch}
      variant="canvas"
      title="内容画布"
      count={canvases.length}
      countLabel="张"
      action={(
        <>
          {hasCanvases ? (
            <ProjectHomeCardListToolbar
              label="内容画布"
              filter={listView.filter}
              filterOptions={listView.filterOptions}
              allFilterLabel="全部作用域"
              onFilter={listView.onFilterChange}
            />
          ) : null}
          <ProjectHomeCardListPageSizeSelect
            label="内容画布"
            pageSize={listView.pageSize}
            pageSizeOptions={listView.pageSizeOptions}
            onPageSize={listView.onPageSizeChange}
          />
        </>
      )}
      footer={hasCanvases ? (
        <ProjectHomeCardListPager view={listView} unit="张" />
      ) : undefined}
    >
      <button type="button" className="project-home-canvas-create-card" onClick={onCreateCanvas}>
        <span className="project-home-canvas-create-card__icon">
          <Plus size={16} />
        </span>
        <strong>新建内容画布</strong>
      </button>
      {canvases.length ? listView.filteredTotal === 0 ? (
        <ProjectHomeCardGroupEmpty>没有匹配的内容画布。</ProjectHomeCardGroupEmpty>
      ) : listView.pageItems.map((canvas) => {
        return (
          <Link key={canvas.id} to={canvasRoute(canvas.id)} className="project-home-canvas-card">
            <div className="project-home-canvas-card__top">
              <div className="project-home-canvas-card__title">
                <strong>{canvas.title}</strong>
                <span>{projectHomeCanvasBreadcrumb(projectName, canvas)}</span>
              </div>
            </div>
            <div className="project-home-canvas-card__foot">
              <span className="project-home-canvas-card__action">
                打开
                <GitBranch size={13} />
              </span>
            </div>
          </Link>
        )
      }) : (
        null
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

function projectHomeFieldValue(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return stringValue(value) ?? '未设置'
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
  return projectHomeSearchParts(setting.title, setting.id, setting.kind, setting.media.label)
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

function projectHomeCanvasBreadcrumb(projectName: string, canvas: ContentCanvasDocument): string {
  const scope = contentCanvasDocumentScope(canvas)
  if (scope.kind === 'production') {
    return `${projectName} / 制作 / ${scope.productionTitle || scope.productionId || canvas.title}`
  }
  return `${projectName} / 全局内容`
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

function projectHomeSettingSummaries(data: ProjectOverviewData): ProjectHomeSettingSummary[] {
  const settings = projectHomeRecordArray(data.settings)
  const candidateContexts = projectHomeSettingCandidateContexts(data.candidateView, projectHomeRecordArray(data.contentUnits))
  const assetSettingIds = projectHomeAssetSettingIdMap(projectHomeRecordArray(data.assetSlots))
  return settings
    .map((record) => {
      const id = stringValue(record.id) ?? numberIdValue(record.ID)
      if (!id) return undefined
      const imageUrl = projectHomeSettingImageUrl(record)
      return {
        id,
        title: stringValue(record.title ?? record.name ?? record.label) ?? `设定 ${id}`,
        kind: stringValue(record.kind) ?? 'setting',
        media: projectHomeSettingMedia(record, candidateContexts, imageUrl, assetSettingIds),
      }
    })
    .filter((record): record is ProjectHomeSettingSummary => Boolean(record))
    .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN') || left.id.localeCompare(right.id, 'zh-CN'))
}

function projectHomeRecordArray(value: unknown): ProjectOverviewRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord) as ProjectOverviewRecord[]
  if (!isRecord(value)) return []
  const candidates = [
    value.items,
    value.records,
    value.data,
    value.settings,
    value.assets,
    value.contentUnits,
    value.content_units,
  ]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter(isRecord) as ProjectOverviewRecord[]
  }
  return []
}

function projectHomeSettingCandidateContexts(
  candidateView: ProjectOverviewCandidateView | undefined,
  contentUnits: ProjectOverviewRecord[],
): ProjectHomeSettingCandidateContext[] {
  const contexts = candidateView?.contexts
  if (!Array.isArray(contexts)) return []
  const contentUnitById = new Map<string, ProjectOverviewRecord>()
  for (const unit of contentUnits) {
    const id = stringValue(unit.id ?? unit.content_unit_id ?? unit.contentUnitId) ?? numberIdValue(unit.ID)
    if (id) contentUnitById.set(id, unit)
  }
  return contexts
    .filter(isRecord)
    .map((context) => projectHomeSettingCandidateContext(context, contentUnitById))
    .filter((context): context is ProjectHomeSettingCandidateContext => Boolean(context))
}

function projectHomeSettingCandidateContext(
  context: Record<string, unknown>,
  contentUnitById: Map<string, ProjectOverviewRecord>,
): ProjectHomeSettingCandidateContext | undefined {
  const contextUnit = recordValue(context.content_unit ?? context.contentUnit ?? context.unit)
  const contentUnitId = projectHomeCandidateContextContentUnitId(context, contextUnit, contentUnitById)
  if (!contentUnitId) return undefined
  const contentUnit = contentUnitById.get(contentUnitId) ?? contextUnit
  const candidates = projectHomeCandidateRecords(context).map(projectHomeCandidatePreview).filter((candidate): candidate is ProjectHomeCandidatePreview => Boolean(candidate))
  const selection = context.selection
    ?? context.selected
    ?? context.selected_candidate
    ?? context.selectedCandidate
    ?? context.selection_record
    ?? context.selectionRecord
  const selectedCandidateId = projectHomeSelectedCandidateId(selection)
    ?? stringValue(context.selected_candidate_id ?? context.selectedCandidateId)
  const selectedResourceId = projectHomeSelectedResourceId(selection)
    ?? stringValue(context.selected_resource_id ?? context.selectedResourceId)
  const selectedCandidate = projectHomeSelectedCandidatePreview(
    candidates,
    selection,
    selectedCandidateId,
    selectedResourceId,
  )
  return {
    contentUnitId,
    ...(Object.keys(contentUnit).length ? { contentUnit } : {}),
    candidates,
    ...(selectedCandidateId ? { selectedCandidateId } : {}),
    ...(selectedResourceId ? { selectedResourceId } : {}),
    ...(selectedCandidate ? { selectedCandidate } : {}),
    haystack: projectHomeCandidateContextHaystack(contentUnitId, contentUnit, context),
  }
}

function projectHomeSettingMedia(
  record: ProjectOverviewRecord,
  contexts: ProjectHomeSettingCandidateContext[],
  explicitImageUrl: string | undefined,
  assetSettingIds: Map<string, string>,
): ProjectHomeSettingMedia {
  const context = contexts.find((candidateContext) => projectHomeCandidateContextMatchesSetting(candidateContext, record, assetSettingIds))
  const selected = context?.selectedCandidate
  if (context && selected?.mediaUrl) {
    return {
      state: 'selected',
      label: '已选择',
      imageUrl: selected.mediaUrl,
      contentUnitId: context.contentUnitId,
      candidateId: selected.id,
      ...(selected.resourceId ? { resourceId: selected.resourceId } : {}),
    }
  }
  if (explicitImageUrl) {
    return {
      state: 'selected',
      label: '已选择',
      imageUrl: explicitImageUrl,
      ...(context?.contentUnitId ? { contentUnitId: context.contentUnitId } : {}),
    }
  }
  const candidate = context?.candidates.find((item) => item.mediaUrl && (item.mediaKind === 'image' || item.mediaKind === 'unknown'))
  if (context && candidate?.mediaUrl) {
    return {
      state: 'candidate',
      label: '候选',
      imageUrl: candidate.mediaUrl,
      contentUnitId: context.contentUnitId,
      candidateId: candidate.id,
      ...(candidate.resourceId ? { resourceId: candidate.resourceId } : {}),
    }
  }
  return {
    state: 'missing',
    label: '去画布生成',
    ...(context?.contentUnitId ? { contentUnitId: context.contentUnitId } : {}),
  }
}

function projectHomeCandidateContextMatchesSetting(
  context: ProjectHomeSettingCandidateContext,
  record: ProjectOverviewRecord,
  assetSettingIds: Map<string, string>,
): boolean {
  const settingId = stringValue(record.id) ?? numberIdValue(record.ID)
  if (!settingId) return false
  const normalizedId = settingId.toLowerCase()
  const unit = context.contentUnit ?? {}
  const directRefs = [
    unit.setting_ref,
    unit.settingRef,
    unit.setting_id,
    unit.settingId,
    unit.target_ref,
    unit.targetRef,
    unit.asset_ref,
    unit.assetRef,
  ].map((value) => stringValue(value)?.toLowerCase()).filter(Boolean)
  if (directRefs.includes(normalizedId)) return true
  const assetRef = stringValue(unit.asset_ref ?? unit.assetRef ?? (stringValue(unit.target_kind ?? unit.targetKind) === 'asset' ? unit.target_ref ?? unit.targetRef : undefined))
  const assetSettingId = assetRef ? assetSettingIds.get(assetRef.toLowerCase()) : undefined
  if (assetSettingId === normalizedId) return true
  const targetKind = stringValue(unit.target_kind ?? unit.targetKind ?? unit.content_unit_type ?? unit.contentUnitType)?.toLowerCase() ?? ''
  const canUseTargetText = targetKind.includes('setting') || targetKind.includes('asset') || targetKind.includes('character') || targetKind.includes('location')
  const haystack = context.haystack.toLowerCase()
  return haystack.includes(`settings/${normalizedId}/`)
    || haystack.includes(`setting:${normalizedId}`)
    || haystack.includes(`setting/${normalizedId}`)
    || (canUseTargetText && haystack.includes(normalizedId))
    || context.contentUnitId.toLowerCase().includes(normalizedId)
}

function projectHomeCandidateContextContentUnitId(
  context: Record<string, unknown>,
  contextUnit: Record<string, unknown>,
  contentUnitById: Map<string, ProjectOverviewRecord>,
): string | undefined {
  const candidates = [
    context.content_unit_id,
    context.contentUnitId,
    context.target_ref,
    context.targetRef,
    contextUnit.id,
    contextUnit.content_unit_id,
    contextUnit.contentUnitId,
    context.id,
  ].map((value) => stringValue(value)).filter((value): value is string => Boolean(value))
  for (const candidate of candidates) {
    const normalized = projectHomeNormalizeContentUnitId(candidate)
    if (contentUnitById.has(normalized)) return normalized
    if (contentUnitById.has(candidate)) return candidate
  }
  return candidates.map(projectHomeNormalizeContentUnitId).find(Boolean)
}

function projectHomeNormalizeContentUnitId(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('content_unit:')) return trimmed.slice('content_unit:'.length)
  const parts = trimmed.split('/').filter(Boolean)
  if (parts.length >= 2 && parts[0] === 'content_units') return parts[parts.length - 1] ?? trimmed
  return trimmed
}

function projectHomeAssetSettingIdMap(records: ProjectOverviewRecord[]): Map<string, string> {
  const result = new Map<string, string>()
  for (const record of records) {
    const settingId = stringValue(record.setting_id ?? record.settingId) ?? projectHomeSettingIdFromPath(stringValue(record.path ?? record.__workspace_path))
    if (!settingId) continue
    const keys = [
      record.id,
      record.slot,
      record.asset_ref,
      record.assetRef,
      record.target_ref,
      record.targetRef,
      numberIdValue(record.ID),
    ]
    for (const key of keys) {
      const normalized = stringValue(key)?.toLowerCase()
      if (normalized) result.set(normalized, settingId.toLowerCase())
    }
  }
  return result
}

function projectHomeProjectServiceBaseURLFromSearch(search: string): string | undefined {
  const query = new URLSearchParams(search)
  return normalizeProjectHomeBaseURL(
    query.get('projectServiceBaseURL')
      ?? query.get('projectServiceBaseUrl')
      ?? query.get('projectServiceURL')
      ?? query.get('projectServiceUrl'),
  )
}

function normalizeProjectHomeBaseURL(value: string | null): string | undefined {
  const normalized = value?.trim().replace(/\/+$/, '')
  if (!normalized) return undefined
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) return undefined
  return normalized
}

function projectHomeSettingIdFromPath(path: string | undefined): string | undefined {
  if (!path) return undefined
  const match = path.match(/(?:^|\/)settings\/([^/]+)\//)
  return match?.[1]
}

function projectHomeCandidateRecords(record: Record<string, unknown>): Record<string, unknown>[] {
  const candidates = record.candidates
    ?? record.candidate_records
    ?? record.candidateRecords
    ?? record.content_unit_candidates
    ?? record.contentUnitCandidates
    ?? record.items
    ?? record.records
  return Array.isArray(candidates) ? candidates.filter(isRecord) : []
}

function projectHomeCandidatePreview(record: Record<string, unknown>, index: number): ProjectHomeCandidatePreview | undefined {
  const output = projectHomeFirstCandidateOutput(record)
  const resourceId = stringValue(
    output?.resource_id
    ?? output?.resourceId
    ?? record.resource_id
    ?? record.resourceId,
  )
  const explicitUrl = stringValue(
    output?.url
    ?? output?.resource_url
    ?? output?.resourceUrl
    ?? output?.preview_url
    ?? output?.previewUrl
    ?? output?.thumbnail_url
    ?? output?.thumbnailUrl
    ?? record.url
    ?? record.resource_url
    ?? record.resourceUrl
    ?? record.preview_url
    ?? record.previewUrl
    ?? record.thumbnail_url
    ?? record.thumbnailUrl,
  )
  const mediaKind = projectHomeCandidatePreviewKind(
    output?.kind
    ?? output?.type
    ?? output?.media_type
    ?? output?.mime_type
    ?? output?.mimeType
    ?? record.output_kind
    ?? record.outputKind
    ?? record.kind
    ?? record.type
    ?? record.media_type
    ?? record.mime_type
    ?? record.mimeType,
  )
  const id = stringValue(record.id ?? record.candidate_id ?? record.candidateId) ?? `candidate-${index + 1}`
  const mediaUrl = resolveResourceFileUrl(resourceId, explicitUrl)
  if (!mediaUrl && !resourceId) return undefined
  return {
    id,
    ...(resourceId ? { resourceId } : {}),
    mediaKind,
    ...(mediaUrl ? { mediaUrl } : {}),
  }
}

function projectHomeFirstCandidateOutput(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const outputs = Array.isArray(record.outputs) ? record.outputs.filter(isRecord) : []
  return outputs.find((output) => output.resource_id || output.resourceId || output.url || output.resource_url || output.resourceUrl)
    ?? outputs[0]
}

function projectHomeCandidatePreviewKind(value: unknown): ProjectHomeCandidatePreview['mediaKind'] {
  const kind = stringValue(value)?.toLowerCase() ?? ''
  if (kind.startsWith('image/') || kind === 'image' || kind === 'storyboard' || kind.includes('png') || kind.includes('jpeg') || kind.includes('jpg') || kind.includes('webp')) return 'image'
  if (kind.startsWith('video/') || kind === 'video' || kind.includes('mp4') || kind.includes('mpegurl')) return 'video'
  if (kind.startsWith('audio/') || kind === 'audio' || kind === 'voiceover' || kind === 'music') return 'audio'
  if (kind.startsWith('text/') || kind === 'text' || kind === 'subtitle' || kind === 'metadata') return 'text'
  return 'unknown'
}

function projectHomeSelectedCandidatePreview(
  candidates: ProjectHomeCandidatePreview[],
  selection: unknown,
  selectedCandidateId: string | undefined,
  selectedResourceId: string | undefined,
): ProjectHomeCandidatePreview | undefined {
  const explicitSelection = isRecord(selection) ? projectHomeCandidatePreview(selection, 0) : undefined
  if (explicitSelection?.mediaUrl) return explicitSelection
  if (selectedCandidateId) {
    const candidate = candidates.find((item) => item.id === selectedCandidateId)
    if (candidate) return candidate
  }
  if (selectedResourceId) {
    const resolvedUrl = resolveResourceFileUrl(selectedResourceId)
    return candidates.find((item) => item.resourceId === selectedResourceId) ?? {
      id: selectedCandidateId ?? selectedResourceId,
      resourceId: selectedResourceId,
      mediaKind: 'image',
      ...(resolvedUrl ? { mediaUrl: resolvedUrl } : {}),
    }
  }
  return undefined
}

function projectHomeSelectedCandidateId(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (!isRecord(value)) return undefined
  return stringValue(
    value.candidate_id
    ?? value.candidateId
    ?? value.selected_candidate_id
    ?? value.selectedCandidateId
    ?? value.id,
  )
}

function projectHomeSelectedResourceId(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  return stringValue(
    value.resource_id
    ?? value.resourceId
    ?? value.selected_resource_id
    ?? value.selectedResourceId,
  )
}

function projectHomeCandidateContextHaystack(
  contentUnitId: string,
  contentUnit: Record<string, unknown>,
  context: Record<string, unknown>,
): string {
  return [
    contentUnitId,
    contentUnit.id,
    contentUnit.title,
    contentUnit.path,
    contentUnit.__workspace_path,
    contentUnit.content_unit_type,
    contentUnit.contentUnitType,
    contentUnit.target_kind,
    contentUnit.targetKind,
    contentUnit.target_ref,
    contentUnit.targetRef,
    contentUnit.setting_ref,
    contentUnit.settingRef,
    contentUnit.setting_id,
    contentUnit.settingId,
    contentUnit.asset_ref,
    contentUnit.assetRef,
    context.path,
    context.title,
  ].map((part) => stringValue(part)).filter(Boolean).join(' ')
}

function projectHomeSettingImageUrl(record: ProjectOverviewRecord): string | undefined {
  return stringValue(
    record.image_url
    ?? record.imageUrl
    ?? record.preview_url
    ?? record.previewUrl
    ?? record.thumbnail_url
    ?? record.thumbnailUrl
    ?? record.cover_url
    ?? record.coverUrl
    ?? record.avatar_url
    ?? record.avatarUrl
  )
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

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function numberIdValue(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined
}
