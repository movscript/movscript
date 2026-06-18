import { useMemo, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  Boxes,
  Clapperboard,
  FilePlus2,
  FileText,
  FolderOpen,
  HardDrive,
  Home,
  LayoutTemplate,
  PackageSearch,
  PenLine,
  ScanSearch,
  type LucideIcon,
} from 'lucide-react'
import {
  AgentBrowserBadge,
  AgentBrowserContentFlow,
  AgentBrowserContentGroup,
  AgentBrowserContentGroupCopy,
  AgentBrowserContentGroupDescription,
  AgentBrowserContentGroupHeader,
  AgentBrowserContentGroupIcon,
  AgentBrowserContentGroupIndex,
  AgentBrowserContentGroupItems,
  AgentBrowserContentGroupOverflow,
  AgentBrowserContentGroupState,
  AgentBrowserContentGroupTitle,
  AgentBrowserContentGroupTitleRow,
  AgentBrowserContentItem,
  AgentBrowserContentItemCopy,
  AgentBrowserContentItemDescription,
  AgentBrowserContentItemMeta,
  AgentBrowserContentItemTitle,
  AgentBrowserContentMatrix,
  AgentBrowserContentSummary,
  AgentBrowserContentSummaryGrid,
  AgentBrowserContentSummaryMain,
  AgentBrowserContentToolbar,
  AgentBrowserContentToolButton,
  AgentBrowserKeyValue,
  AgentBrowserProjectDescription,
  AgentBrowserProjectEmpty,
  AgentBrowserProjectHeader,
  AgentBrowserProjectHeaderCopy,
  AgentBrowserProjectMetaLabel,
  AgentBrowserProjectNavigationPage,
  AgentBrowserProjectTitle,
} from '@/features/agent/components/AgentBrowserInternalPageUi'
import { useUserStore } from '@/shared/infrastructure/session/userStore'
import { workspaceOwnerContext } from '@/shared/infrastructure/session/workspaceOwnerContext'
import { listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import { isActiveSemanticEntityRecord } from '@/shared/domain/semanticEntityVisibility'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'
import { createWorkspaceScript, listWorkspaceScripts } from '@/features/scripts/application/scriptWorkspaceRepository'
import { scriptKeys } from '@/features/scripts/application/scriptQueryKeys'
import { agentBrowserKeys } from '@/features/agent/application/agentQueryKeys'
import type { Project, Script } from '@/types'
import { toast } from '@/shared/ui/toastStore'

interface ProjectNavigationGroup {
  key: string
  title: string
  description: string
  icon: LucideIcon
  tone: 'plan' | 'script' | 'asset' | 'production' | 'content'
  items: ProjectNavigationLink[]
  loading: boolean
  action?: ReactNode
}

interface ProjectNavigationLink {
  id: string
  title: string
  description: string
  to?: string
  onClick?: () => void
  status?: string
}

export function ProjectHomeBrowserPage({
  project,
  onOpenProjectStandards,
  onOpenResourceLibrary,
  onOpenExternalResourceLibrary,
  onOpenCanvasList,
  onOpenEditingProjects,
}: {
  project: Project | null
  onOpenProjectStandards: () => void
  onOpenResourceLibrary: () => void
  onOpenExternalResourceLibrary: () => void
  onOpenCanvasList: () => void
  onOpenEditingProjects: () => void
}) {
  const projectId = project?.ID
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUser = useUserStore((state) => state.currentUser)
  const currentOrgID = useUserStore((state) => state.currentOrgID)
  const orgMemberships = useUserStore((state) => state.orgMemberships)
  const workspaceContext = useMemo(
    () => workspaceOwnerContext({ currentUser, currentOrgID, orgMemberships }),
    [currentOrgID, currentUser?.ID, orgMemberships],
  )
  const scriptsQuery = useQuery<Script[]>({ queryKey: agentBrowserKeys.navigationScripts(projectId, workspaceContext.userId, workspaceContext.orgId), queryFn: () => listWorkspaceScripts(projectId!, workspaceContext), enabled: !!projectId })
  const referencesQuery = useQuery<SemanticEntityRecord[]>({ queryKey: agentBrowserKeys.navigationEntity(projectId, 'settings'), queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('settings')), enabled: !!projectId })
  const assetSlotsQuery = useQuery<SemanticEntityRecord[]>({ queryKey: agentBrowserKeys.navigationEntity(projectId, 'assetSlots'), queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('assetSlots')), enabled: !!projectId })
  const productionsQuery = useQuery<SemanticEntityRecord[]>({ queryKey: agentBrowserKeys.navigationEntity(projectId, 'productions'), queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('productions')), enabled: !!projectId })
  const sceneMomentsQuery = useQuery<SemanticEntityRecord[]>({ queryKey: agentBrowserKeys.navigationEntity(projectId, 'sceneMoments'), queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('sceneMoments')), enabled: !!projectId })
  const contentUnitsQuery = useQuery<SemanticEntityRecord[]>({ queryKey: agentBrowserKeys.navigationEntity(projectId, 'contentUnits'), queryFn: () => listSemanticEntities(projectId!, semanticEntityConfig('contentUnits')), enabled: !!projectId })
  const createScript = useMutation({
    mutationFn: () => {
      if (!projectId) throw new Error('请选择项目')
      const scriptNumber = (scriptsQuery.data?.length ?? 0) + 1
      return createWorkspaceScript(projectId, {
        title: `新剧本 ${scriptNumber}`,
        script_type: 'uncategorized',
        content: '',
        raw_source: '',
        summary: '',
      }, workspaceContext)
    },
    onSuccess: (created) => {
      if (!projectId) return
      void queryClient.invalidateQueries({
        queryKey: agentBrowserKeys.navigationScripts(projectId, workspaceContext.userId, workspaceContext.orgId),
      })
      void queryClient.invalidateQueries({ queryKey: scriptKeys.projectScriptScope(projectId) })
      toast.success('剧本已创建')
      navigate(withRouteParams(ROUTES.project.scripts, { script_id: created.ID }))
    },
    onError: () => toast.error('创建剧本失败，请重试'),
  })

  if (!project) {
    return (
      <AgentBrowserProjectEmpty
        icon={<FolderOpen size={21} />}
        title="内容导航"
        description="当前还没有选中的项目。选择项目后可从这里进入剧本、设定、素材、制作、情节和内容。"
      />
    )
  }

  const groups: ProjectNavigationGroup[] = [
    {
      key: 'standards',
      title: '项目规范',
      description: '项目级画幅、视觉风格、镜头语言、节奏和负面约束。',
      icon: Home,
      tone: 'plan',
      loading: false,
      items: [{
        id: String(project.ID),
        title: '项目规范',
        description: firstText(
          recordField(project, 'visual_style'),
          recordField(project, 'project_style'),
          project.description,
          '查看和维护会话项目规范',
        ),
        status: firstText(recordField(project, 'aspect_ratio'), '规范'),
        onClick: onOpenProjectStandards,
      }],
    },
    {
      key: 'scripts',
      title: '剧本列表',
      description: '剧本文本、分块和后续编排引用。',
      icon: FileText,
      tone: 'script',
      loading: scriptsQuery.isLoading,
      action: (
        <AgentBrowserContentToolButton
          icon={<FilePlus2 size={13} />}
          disabled={createScript.isPending}
          onClick={() => createScript.mutate()}
        >
          {createScript.isPending ? '创建中' : '新建剧本'}
        </AgentBrowserContentToolButton>
      ),
      items: (scriptsQuery.data ?? [])
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0) || a.ID - b.ID)
        .map((script) => ({
          id: String(script.ID),
          title: script.title || `剧本 #${script.ID}`,
          description: firstText(script.summary, script.description, script.script_type, '暂无摘要'),
          status: script.script_type,
          to: withRouteParams(ROUTES.project.scripts, { script_id: script.ID }),
        })),
    },
    {
      key: 'references',
      title: '设定列表',
      description: '角色、世界观、风格和可复用创作约束。',
      icon: PenLine,
      tone: 'plan',
      loading: referencesQuery.isLoading,
      items: visibleRecords(referencesQuery.data).map((record, recordIndex) => ({
        id: recordStableId(record, 'reference', recordIndex),
        title: titleOfRecord(record, '设定'),
        description: firstText(record.description, record.content, record.kind, '暂无描述'),
        status: stringField(record.status ?? record.kind),
        to: ROUTES.project.scripts,
      })),
    },
    {
      key: 'assets',
      title: '素材列表',
      description: '素材需求、候选资源和锁定状态。',
      icon: PackageSearch,
      tone: 'asset',
      loading: assetSlotsQuery.isLoading,
      items: visibleRecords(assetSlotsQuery.data).map((record, recordIndex) => ({
        id: recordStableId(record, 'asset', recordIndex),
        title: titleOfRecord(record, '素材'),
        description: firstText(record.description, record.prompt_hint, record.kind, '暂无描述'),
        status: stringField(record.status ?? record.kind),
        onClick: onOpenResourceLibrary,
      })),
    },
    {
      key: 'productions',
      title: '制作列表',
      description: '制作方案、制作任务和整体进度。',
      icon: Clapperboard,
      tone: 'production',
      loading: productionsQuery.isLoading,
      items: visibleRecords(productionsQuery.data).map((record, recordIndex) => ({
        id: recordStableId(record, 'production', recordIndex),
        title: titleOfRecord(record, '制作'),
        description: firstText(record.description, record.summary, record.kind, '暂无描述'),
        status: stringField(record.status),
        to: withRouteParams(ROUTES.project.scripts, { productionId: recordRouteId(record) }),
      })),
    },
    {
      key: 'moments',
      title: '情节列表',
      description: '编排段、情节点和上下游引用关系。',
      icon: Boxes,
      tone: 'production',
      loading: sceneMomentsQuery.isLoading,
      items: visibleRecords(sceneMomentsQuery.data).map((record, recordIndex) => ({
        id: recordStableId(record, 'moment', recordIndex),
        title: titleOfRecord(record, '情节'),
        description: firstText(record.description, record.action_text, record.location_text, record.mood, '暂无描述'),
        status: stringField(record.status),
        onClick: onOpenCanvasList,
      })),
    },
    {
      key: 'content',
      title: '内容列表',
      description: '内容单元、关键帧、生成上下文和预览挂载。',
      icon: LayoutTemplate,
      tone: 'content',
      loading: contentUnitsQuery.isLoading,
      items: visibleRecords(contentUnitsQuery.data).map((record, recordIndex) => ({
        id: recordStableId(record, 'content', recordIndex),
        title: titleOfRecord(record, '内容'),
        description: firstText(record.description, record.prompt, record.visual_intent, record.kind, '暂无描述'),
        status: stringField(record.status ?? record.kind),
        onClick: onOpenCanvasList,
      })),
    },
  ]
  const topGroups = groups.slice(0, 4)
  const productionGroups = groups.slice(4)
  const totalItems = groups.reduce((sum, group) => sum + group.items.length, 0)
  const loadingGroups = groups.filter((group) => group.loading).length
  const rows = groups.map((group): [string, string | number] => [
    group.title.replace('列表', ''),
    group.loading ? '...' : group.items.length,
  ])

  return (
    <AgentBrowserProjectNavigationPage>
      <AgentBrowserProjectHeader>
        <AgentBrowserProjectHeaderCopy>
          <AgentBrowserProjectMetaLabel icon={<Home size={14} />}>
            内部页面
          </AgentBrowserProjectMetaLabel>
          <AgentBrowserProjectTitle>内容导航</AgentBrowserProjectTitle>
          <AgentBrowserProjectDescription>
            {project.name}
          </AgentBrowserProjectDescription>
        </AgentBrowserProjectHeaderCopy>
        <AgentBrowserContentToolbar aria-label="常用内容入口">
          <AgentBrowserContentToolButton icon={<PenLine size={13} />} onClick={onOpenProjectStandards}>
            规范
          </AgentBrowserContentToolButton>
          <AgentBrowserContentToolButton icon={<HardDrive size={13} />} onClick={onOpenResourceLibrary}>
            资源库
          </AgentBrowserContentToolButton>
          <AgentBrowserContentToolButton icon={<ScanSearch size={13} />} onClick={onOpenExternalResourceLibrary}>
            外部资源
          </AgentBrowserContentToolButton>
          <AgentBrowserContentToolButton icon={<LayoutTemplate size={13} />} onClick={onOpenCanvasList}>
            画布
          </AgentBrowserContentToolButton>
          <AgentBrowserContentToolButton icon={<Clapperboard size={13} />} onClick={onOpenEditingProjects}>
            剪辑
          </AgentBrowserContentToolButton>
        </AgentBrowserContentToolbar>
      </AgentBrowserProjectHeader>
      <AgentBrowserContentSummary aria-label="会话项目内容概览">
        <AgentBrowserContentSummaryMain label="内容对象" value={totalItems} />
        <AgentBrowserContentSummaryGrid>
          {rows.map(([label, value]) => (
            <AgentBrowserKeyValue key={label} label={label} value={value} strong />
          ))}
        </AgentBrowserContentSummaryGrid>
        {loadingGroups > 0 ? (
          <AgentBrowserBadge>{loadingGroups} 项读取中</AgentBrowserBadge>
        ) : null}
      </AgentBrowserContentSummary>

      <AgentBrowserContentMatrix aria-label="核心内容入口">
        {topGroups.map((group, index) => (
          <ProjectNavigationGroupSection key={group.key} group={group} index={index} variant="featured" />
        ))}
      </AgentBrowserContentMatrix>

      <AgentBrowserContentFlow aria-label="生产链路内容">
        {productionGroups.map((group, index) => (
          <ProjectNavigationGroupSection key={group.key} group={group} index={index + topGroups.length} variant="lane" />
        ))}
      </AgentBrowserContentFlow>
    </AgentBrowserProjectNavigationPage>
  )
}

function ProjectNavigationGroupSection({
  group,
  index,
  variant,
}: {
  group: ProjectNavigationGroup
  index: number
  variant: 'featured' | 'lane'
}) {
  const Icon = group.icon
  const previewItems = group.items.slice(0, variant === 'featured' ? 3 : 4)

  return (
    <AgentBrowserContentGroup tone={group.tone} variant={variant}>
      <AgentBrowserContentGroupHeader>
        <AgentBrowserContentGroupIcon>
          <Icon size={17} />
        </AgentBrowserContentGroupIcon>
        <AgentBrowserContentGroupCopy>
          <AgentBrowserContentGroupTitleRow>
            <AgentBrowserContentGroupIndex>{String(index + 1).padStart(2, '0')}</AgentBrowserContentGroupIndex>
            <AgentBrowserContentGroupTitle>{group.title}</AgentBrowserContentGroupTitle>
          </AgentBrowserContentGroupTitleRow>
          <AgentBrowserContentGroupDescription>{group.description}</AgentBrowserContentGroupDescription>
        </AgentBrowserContentGroupCopy>
        {group.action}
        <AgentBrowserBadge>{group.loading ? '读取中' : `${group.items.length}`}</AgentBrowserBadge>
      </AgentBrowserContentGroupHeader>
      <AgentBrowserContentGroupItems>
        {group.loading ? (
          <AgentBrowserContentGroupState>正在读取会话项目数据...</AgentBrowserContentGroupState>
        ) : group.items.length === 0 ? (
          <AgentBrowserContentGroupState>暂无数据</AgentBrowserContentGroupState>
        ) : (
          previewItems.map((item) => (
            item.to ? (
              <AgentBrowserContentItem asChild key={`${group.key}-${item.id}`}>
                <Link
                  to={item.to}
                >
                  <ProjectNavigationItemContent item={item} />
                </Link>
              </AgentBrowserContentItem>
            ) : (
              <AgentBrowserContentItem
                key={`${group.key}-${item.id}`}
                onClick={item.onClick}
              >
                <ProjectNavigationItemContent item={item} />
              </AgentBrowserContentItem>
            )
          ))
        )}
        {!group.loading && group.items.length > previewItems.length ? (
          <AgentBrowserContentGroupOverflow>
            另有 {group.items.length - previewItems.length} 项
          </AgentBrowserContentGroupOverflow>
        ) : null}
      </AgentBrowserContentGroupItems>
    </AgentBrowserContentGroup>
  )
}

function ProjectNavigationItemContent({ item }: { item: ProjectNavigationLink }) {
  return (
    <>
      <AgentBrowserContentItemCopy>
        <AgentBrowserContentItemTitle>{item.title}</AgentBrowserContentItemTitle>
        <AgentBrowserContentItemDescription>{item.description}</AgentBrowserContentItemDescription>
      </AgentBrowserContentItemCopy>
      <AgentBrowserContentItemMeta>
        {item.status ? <span>{item.status}</span> : null}
        <ArrowRight size={14} />
      </AgentBrowserContentItemMeta>
    </>
  )
}

function visibleRecords(records?: SemanticEntityRecord[]) {
  return (records ?? [])
    .filter(isActiveSemanticEntityRecord)
    .slice()
    .sort(compareRecordOrder)
}

function compareRecordOrder(a: SemanticEntityRecord, b: SemanticEntityRecord) {
  const orderDelta = (numberField(a.order) ?? recordNumericId(a) ?? 0) - (numberField(b.order) ?? recordNumericId(b) ?? 0)
  if (orderDelta !== 0) return orderDelta
  return recordSortKey(a).localeCompare(recordSortKey(b))
}

function titleOfRecord(record: SemanticEntityRecord, fallback: string) {
  return firstText(record.title, record.name, record.label, `${fallback} #${recordDisplayId(record)}`)
}

function recordRouteId(record: SemanticEntityRecord) {
  return numberField(record.ID) ?? numberField(record.id) ?? stringField(record.id)
}

function recordNumericId(record: SemanticEntityRecord) {
  return numberField(record.ID) ?? numberField(record.id)
}

function recordDisplayId(record: SemanticEntityRecord) {
  return firstText(record.ID, record.id, record.title, record.name, record.label, '未编号')
}

function recordStableId(record: SemanticEntityRecord, fallback: string, index: number) {
  return firstText(record.ID, record.id, record.uuid, record.key, record.path, `${fallback}-${index}`)
}

function recordSortKey(record: SemanticEntityRecord) {
  return firstText(record.ID, record.id, record.title, record.name, record.label)
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberField(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined
}

function recordField(record: unknown, key: string) {
  if (!record || typeof record !== 'object') return undefined
  return (record as Record<string, unknown>)[key]
}
