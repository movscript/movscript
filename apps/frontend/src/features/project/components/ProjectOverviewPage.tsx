import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  CheckCircle2,
  Database,
  LayoutDashboard,
} from 'lucide-react'
import {
  AppDashboardDividerBlock,
  AppDashboardEntry,
  AppDashboardHeroGrid,
  AppDashboardLane,
  AppDashboardLaneSummary,
  AppDashboardMetaCell,
  AppDashboardMetric,
  AppDashboardRegion,
  AppDashboardSection,
  AppDashboardSplit,
  Badge,
  StatusBadge,
  Button,
  ProjectOverviewBodyCopy,
  ProjectOverviewEntryContent,
  ProjectOverviewEntryDetail,
  ProjectOverviewEntryStack,
  ProjectOverviewEntryTitle,
  ProjectOverviewLaneActions,
  ProjectOverviewLaneContent,
  ProjectOverviewLaneGrid,
  ProjectOverviewLaneHeader,
  ProjectOverviewLaneProgress,
  ProjectOverviewMetaGrid,
  ProjectOverviewMetricGrid,
  ProjectOverviewPageLayout,
  ProjectOverviewPanelHeader,
  ProjectOverviewStatusHeader,
  ProjectOverviewTitleGroup,
  ProjectOverviewTitleRow,
  Progress,
} from '@movscript/ui'

import { listSemanticEntities, semanticEntityConfig, type SemanticEntityKind, type SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import { ProjectSurfaceHeader } from '@movscript/ui'
import { isGeneratedKeyframeCandidateRecord } from '@/features/agent/domain/agentGeneratedResourceBinding'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { getProjectWorkbenchDefinition, projectWorkbenchDefinitions, type ProjectWorkbenchId } from '@/features/project-workbenches/domain/projectWorkbenchRegistry'
import { ROUTES } from '@/routes/projectRoutes'
import {
  projectBlockedSummaryRecipe,
  projectLaneStateRecipe,
  projectPriorityRecipe,
  projectReadinessRecipe,
} from '@/features/project/presentation/projectSemanticUi'

type LaneState = 'ready' | 'active' | 'blocked' | 'empty'

type HomeRecord = SemanticEntityRecord & {
  description?: string
  summary?: string
  priority?: string
  progress?: number
}

interface ProjectHomeData {
  scriptVersions: HomeRecord[]
  segments: HomeRecord[]
  sceneMoments: HomeRecord[]
  productions: HomeRecord[]
  storyboardScripts: HomeRecord[]
  previewTimelines: HomeRecord[]
  settings: HomeRecord[]
  settingUsages: HomeRecord[]
  creativeRelationships: HomeRecord[]
  assetSlots: HomeRecord[]
  assetSlotCandidates: HomeRecord[]
  contentUnits: HomeRecord[]
  keyframes: HomeRecord[]
}

interface WorkLane {
  key: ProjectWorkbenchId
  title: string
  description: string
  primaryLabel: string
  primaryValue: number
  secondary: string
  progress: number
  state: LaneState
  href: string
  workbenchHref: string
  icon: LucideIcon
}

interface FocusItem {
  key: string
  title: string
  area: string
  href: string
  priority: 'high' | 'medium' | 'low'
  detail: string
}

const emptyHomeData: ProjectHomeData = {
  scriptVersions: [],
  segments: [],
  sceneMoments: [],
  productions: [],
  storyboardScripts: [],
  previewTimelines: [],
  settings: [],
  settingUsages: [],
  creativeRelationships: [],
  assetSlots: [],
  assetSlotCandidates: [],
  contentUnits: [],
  keyframes: [],
}

function percentage(value: number, total: number) {
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)))
}

function formatDate(value?: string) {
  if (!value) return '未记录'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return '未记录'
  }
}

function numberOf(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function hasLockedResource(record: HomeRecord) {
  const lock = record.lock
  return Boolean(
    (lock && typeof lock === 'object')
    || record.locked_asset_slot_id
    || record.locked_resource_id
    || record.resource_id,
  )
}

function hasMeaningfulText(record: HomeRecord, keys: string[]) {
  return keys.some((key) => {
    const value = record[key]
    return typeof value === 'string' && value.trim().length > 0
  })
}

function stateLabel(state: LaneState) {
  if (state === 'ready') return '稳定'
  if (state === 'active') return '推进中'
  if (state === 'blocked') return '待处理'
  return '未开始'
}

function nextLaneActionLabel(lane?: WorkLane) {
  if (!lane) return '进入工作台'
  if (lane.key === 'project_standards') return '进入项目规范'
  if (lane.key === 'orchestration_production') return '进入剧本工作台'
  if (lane.key === 'content_orchestration') return '进入内容编辑'
  return `进入${lane.title}`
}

function priorityLabel(priority: FocusItem['priority']) {
  if (priority === 'high') return '高'
  if (priority === 'medium') return '中'
  return '低'
}

function titleOf(record: HomeRecord, fallback: string) {
  return String(record.title ?? record.name ?? record.label ?? fallback)
}

async function safeListSemanticEntities(projectId: number, kind: SemanticEntityKind): Promise<HomeRecord[]> {
  try {
    return await listSemanticEntities(projectId, semanticEntityConfig(kind)) as HomeRecord[]
  } catch (error) {
    console.warn(`Failed to load project home entity: ${kind}`, error)
    return []
  }
}

async function loadProjectHomeData(projectId: number): Promise<ProjectHomeData> {
  const [
    scriptVersions,
    segments,
    sceneMoments,
    productions,
    storyboardScripts,
    previewTimelines,
    settings,
    settingUsages,
    creativeRelationships,
    assetSlots,
    assetSlotCandidates,
    contentUnits,
    keyframes,
  ] = await Promise.all([
    safeListSemanticEntities(projectId, 'scriptVersions'),
    safeListSemanticEntities(projectId, 'segments'),
    safeListSemanticEntities(projectId, 'sceneMoments'),
    safeListSemanticEntities(projectId, 'productions'),
    safeListSemanticEntities(projectId, 'storyboardScripts'),
    safeListSemanticEntities(projectId, 'previewTimelines'),
    safeListSemanticEntities(projectId, 'settings'),
    safeListSemanticEntities(projectId, 'settingUsages'),
    safeListSemanticEntities(projectId, 'creativeRelationships'),
    safeListSemanticEntities(projectId, 'assetSlots'),
    safeListSemanticEntities(projectId, 'assetSlotCandidates'),
    safeListSemanticEntities(projectId, 'contentUnits'),
    safeListSemanticEntities(projectId, 'keyframes'),
  ])

  return {
    scriptVersions,
    segments,
    sceneMoments,
    productions,
    storyboardScripts,
    previewTimelines,
    settings,
    settingUsages,
    creativeRelationships,
    assetSlots,
    assetSlotCandidates,
    contentUnits,
    keyframes: keyframes.filter((keyframe) => !isGeneratedKeyframeCandidateRecord(keyframe)),
  } as ProjectHomeData
}

function WorkLanePanel({ lane }: { lane: WorkLane }) {
  const Icon = lane.icon
  const laneUi = projectLaneStateRecipe(lane.state)

  return (
    <AppDashboardLane tone={laneUi.intent}>
      <ProjectOverviewLaneHeader>
        <Icon size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
        <StatusBadge {...laneUi}>{stateLabel(lane.state)}</StatusBadge>
      </ProjectOverviewLaneHeader>
      <ProjectOverviewLaneContent>
        <h2 className="type-body font-semibold text-foreground">{lane.title}</h2>
        <p className="mt-1 line-clamp-2 type-label leading-5 text-muted-foreground">{lane.description}</p>
        <AppDashboardLaneSummary>
          <div className="flex items-center justify-between gap-3 type-label">
            <span className="truncate text-muted-foreground">{lane.primaryLabel}</span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">{lane.primaryValue}</span>
          </div>
          <p className="mt-1 truncate type-label text-muted-foreground">{lane.secondary}</p>
        </AppDashboardLaneSummary>
      </ProjectOverviewLaneContent>
      <ProjectOverviewLaneProgress>
        <div className="flex items-center justify-between gap-3 type-label">
          <span className="text-muted-foreground">准备度</span>
          <span className="font-medium tabular-nums text-foreground">{lane.progress}%</span>
        </div>
        <Progress value={lane.progress} className="h-1.5" />
      </ProjectOverviewLaneProgress>
      <ProjectOverviewLaneActions>
        <Button asChild variant="outline" size="sm">
          <Link to={lane.href}>查看状态</Link>
        </Button>
        <Button asChild size="sm">
          <Link to={lane.workbenchHref}>{nextLaneActionLabel(lane)}</Link>
        </Button>
      </ProjectOverviewLaneActions>
    </AppDashboardLane>
  )
}

function FocusRow({ item }: { item: FocusItem }) {
  const priorityUi = projectPriorityRecipe(item.priority)
  return (
    <AppDashboardEntry asChild tone={priorityUi.intent}>
      <Link to={item.href}>
        <StatusBadge {...priorityUi} className="w-12 justify-center">
          {priorityLabel(item.priority)}
        </StatusBadge>
        <ProjectOverviewEntryContent>
          <ProjectOverviewEntryTitle>{item.title}</ProjectOverviewEntryTitle>
          <ProjectOverviewEntryDetail>{item.area} · {item.detail}</ProjectOverviewEntryDetail>
        </ProjectOverviewEntryContent>
        <ArrowRight size={14} className="shrink-0 text-muted-foreground" />
      </Link>
    </AppDashboardEntry>
  )
}

function SurfaceLink({
  title,
  detail,
  href,
  icon: Icon,
}: {
  title: string
  detail: string
  href: string
  icon: LucideIcon
}) {
  return (
    <AppDashboardEntry asChild>
      <Link to={href}>
        <Icon size={14} className="shrink-0 text-muted-foreground" />
        <ProjectOverviewEntryContent>
          <ProjectOverviewEntryTitle>{title}</ProjectOverviewEntryTitle>
          <ProjectOverviewEntryDetail>{detail}</ProjectOverviewEntryDetail>
        </ProjectOverviewEntryContent>
        <ArrowRight size={14} className="shrink-0 text-muted-foreground" />
      </Link>
    </AppDashboardEntry>
  )
}

function WorkbenchMetricIcon({ workbenchId }: { workbenchId: ProjectWorkbenchId }) {
  const Icon = getProjectWorkbenchDefinition(workbenchId).icon
  return <Icon size={16} />
}

export default function ProjectOverviewPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID

  const { data = emptyHomeData, isFetching } = useQuery({
    queryKey: ['project-overview', projectId],
    queryFn: () => loadProjectHomeData(projectId!),
    enabled: !!projectId,
  })

  const counts = useMemo(() => {
    const readyScripts = data.scriptVersions.length
    const readySegments = data.segments.length
    const readyMoments = data.sceneMoments.length
    const activeProductions = data.productions.length
    const productionProgress = data.productions.length
      ? Math.round(data.productions.reduce((sum, item) => sum + numberOf(item.progress), 0) / data.productions.length)
      : 0
    const readyReferences = data.settings.filter((item) => hasMeaningfulText(item, ['description', 'content', 'summary'])).length
    const readyRelationships = data.creativeRelationships.length
    const missingAssets = data.assetSlots.filter((item) => !hasLockedResource(item)).length
    const candidateAssets = data.assetSlotCandidates.length
    const lockedAssets = data.assetSlots.filter(hasLockedResource).length
    const readyContents = data.contentUnits.filter((item) => hasMeaningfulText(item, ['description', 'prompt', 'title'])).length
    const lockedContents = data.contentUnits.filter(hasLockedResource).length
    const readyKeyframes = data.keyframes.filter((item) => hasMeaningfulText(item, ['description', 'prompt', 'title'])).length

    return {
      readyScripts,
      readySegments,
      readyMoments,
      activeProductions,
      productionProgress,
      readyReferences,
      readyRelationships,
      missingAssets,
      candidateAssets,
      lockedAssets,
      readyContents,
      lockedContents,
      readyKeyframes,
    }
  }, [data])

  const lanes = useMemo<WorkLane[]>(() => {
    const standards = getProjectWorkbenchDefinition('project_standards')
    const creative = getProjectWorkbenchDefinition('orchestration_production')

    const standardsTotal = 5
    const standardsDone = [
      project?.aspect_ratio,
      project?.visual_style,
      project?.project_style,
      data.scriptVersions.length > 0,
      data.productions.length > 0 || data.settings.length > 0,
    ].filter(Boolean).length
    const standardsProgress = percentage(standardsDone, standardsTotal)

    const contentTotal = data.contentUnits.length + data.keyframes.length
    const contentDone = counts.readyContents + counts.readyKeyframes
    const planTotal = data.productions.length + data.segments.length + data.sceneMoments.length + data.storyboardScripts.length + data.previewTimelines.length + contentTotal
    const planDone = data.productions.length + data.storyboardScripts.length + data.previewTimelines.length + contentDone
    const planProgress = planTotal > 0 ? Math.max(counts.productionProgress, percentage(planDone, planTotal)) : 0

    return [
      {
        key: 'project_standards',
        title: standards.title,
        description: standards.purpose,
        primaryLabel: '项目规范',
        primaryValue: standardsDone,
        secondary: `${data.scriptVersions.length} 个剧本版本，${data.settings.length} 个设定资料可继承规范`,
        progress: standardsProgress,
        state: standardsProgress >= 70 ? 'ready' : standardsProgress > 0 ? 'active' : 'empty',
        href: standards.route,
        workbenchHref: standards.route,
        icon: standards.icon,
      },
      {
        key: 'orchestration_production',
        title: creative.title,
        description: creative.purpose,
        primaryLabel: '制作/情景/镜头',
        primaryValue: planTotal,
        secondary: `${counts.activeProductions} 个创作方案，${counts.readyMoments} 个情景，${counts.readyContents} 个镜头可推进`,
        progress: planProgress,
        state: data.productions.length === 0 ? (data.scriptVersions.length > 0 ? 'blocked' : 'empty') : planProgress >= 70 ? 'ready' : 'active',
        href: creative.route,
        workbenchHref: creative.route,
        icon: creative.icon,
      },
    ]
  }, [counts, data, project?.aspect_ratio, project?.project_style, project?.visual_style])

  const focusItems = useMemo<FocusItem[]>(() => {
    const items: FocusItem[] = []

    if (data.scriptVersions.length === 0) {
      items.push({
        key: 'script',
        title: '补齐创作来源',
        area: '剧本工作台',
        href: ROUTES.project.scripts,
        priority: 'high',
        detail: '没有剧本来源时，制作、情景拆解和素材约束都缺少依据',
      })
    }

    if (data.scriptVersions.length > 0 && data.productions.length === 0) {
      items.push({
        key: 'production',
        title: '创建第一个创作方案',
        area: '剧本工作台',
        href: ROUTES.project.scripts,
        priority: 'high',
        detail: '当前流程以制作方案为主轴，需要先建立生产单元',
      })
    }

    for (const slot of data.assetSlots.filter((item) => !hasLockedResource(item)).slice(0, 3)) {
      items.push({
        key: `asset:${slot.ID}`,
        title: titleOf(slot, `素材需求 #${slot.ID}`),
        area: '内容编辑',
        href: ROUTES.project.sourceWorkspace,
        priority: ['critical', 'high'].includes(String(slot.priority ?? '')) ? 'high' : 'medium',
        detail: String(slot.description ?? '素材需求缺口会影响画面锚点和视频生产'),
      })
    }

    if (data.productions.length > 0 && data.contentUnits.length === 0) {
      items.push({
        key: 'content',
        title: '拆解或确认制作项',
        area: '内容编辑',
        href: ROUTES.project.sourceWorkspace,
        priority: 'medium',
        detail: '制作创建后，需要先在内容编辑中拆出可执行镜头',
      })
    }

    if (items.length > 0) return items.slice(0, 5)
    return [
      {
        key: 'preview',
        title: '检查预览挂载',
        area: '内容编辑',
        href: ROUTES.project.sourceWorkspace,
        priority: 'low',
        detail: '没有明显阻塞时，优先确认下一批可执行内容',
      },
    ]
  }, [data])

  const readiness = lanes.length > 0 ? Math.round(lanes.reduce((sum, lane) => sum + lane.progress, 0) / lanes.length) : 0
  const blockedCount = lanes.filter((lane) => lane.state === 'blocked').length
  const nextLane = lanes.find((lane) => lane.state === 'blocked') ?? lanes.find((lane) => lane.state === 'active') ?? lanes[0]
  const updatedAt = project?.UpdatedAt ?? [...Object.values(data).flat()].sort((a, b) => String(b.UpdatedAt ?? '').localeCompare(String(a.UpdatedAt ?? '')))[0]?.UpdatedAt

  return (
    <ProjectOverviewPageLayout>
        <ProjectSurfaceHeader
          icon={LayoutDashboard}
          title={project?.name ?? '项目总览'}
          description={project?.description || '项目总览按工作台组织当前进度：项目规范、前期准备、剧本工作台和内容编辑。镜头方案、时间轴和镜头列表在内容编辑中推进。'}
          meta={(
            <>
              <StatusBadge {...projectBlockedSummaryRecipe(blockedCount)}>
                {blockedCount > 0 ? `${blockedCount} 个事项待处理` : '可继续推进'}
              </StatusBadge>
              {isFetching ? <Badge variant="outline">同步中</Badge> : null}
            </>
          )}
          actions={(
            <>
            <Button asChild variant="outline" className="gap-2">
              <Link to={ROUTES.projects}>
                <Database size={14} />
                切换项目
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link to={ROUTES.project.scripts}>
                <LayoutDashboard size={14} />
                剧本工作台
              </Link>
            </Button>
            </>
          )}
        />

        <AppDashboardHeroGrid>
          <AppDashboardRegion primary>
            <ProjectOverviewStatusHeader>
              <ProjectOverviewTitleGroup>
                <ProjectOverviewTitleRow>
                  <CheckCircle2 size={16} className="text-muted-foreground" />
                  <h2 className="type-body font-semibold text-foreground">项目生产状态</h2>
                </ProjectOverviewTitleRow>
                <ProjectOverviewBodyCopy>按当前语义对象估算，不替代具体页面里的审核状态。</ProjectOverviewBodyCopy>
              </ProjectOverviewTitleGroup>
              <StatusBadge {...projectReadinessRecipe(readiness)}>{readiness}%</StatusBadge>
            </ProjectOverviewStatusHeader>

            <ProjectOverviewMetricGrid>
              <AppDashboardMetric label="创作方案" value={data.productions.length} detail={`${counts.readySegments} 个编排段`} icon={<WorkbenchMetricIcon workbenchId="orchestration_production" />} />
              <AppDashboardMetric label="镜头" value={data.contentUnits.length} detail={`${counts.readyContents} 个可推进`} icon={<WorkbenchMetricIcon workbenchId="orchestration_production" />} />
              <AppDashboardMetric label="素材需求" value={data.assetSlots.length} detail={`${counts.missingAssets} 个未锁定`} icon={<WorkbenchMetricIcon workbenchId="content_orchestration" />} />
            </ProjectOverviewMetricGrid>

          </AppDashboardRegion>

          <AppDashboardRegion>
            <ProjectOverviewStatusHeader>
              <div>
                <h2 className="type-body font-semibold text-foreground">下一步</h2>
                <ProjectOverviewBodyCopy>按阻塞和素材需求缺口排序。</ProjectOverviewBodyCopy>
              </div>
              <StatusBadge {...projectLaneStateRecipe(nextLane?.state ?? 'empty')}>{stateLabel(nextLane?.state ?? 'empty')}</StatusBadge>
            </ProjectOverviewStatusHeader>

            <AppDashboardDividerBlock>
              <p className="type-label text-muted-foreground">当前建议入口</p>
              <p className="mt-1 type-title font-semibold text-foreground">{nextLane?.title ?? '暂无建议'}</p>
              <p className="mt-2 line-clamp-2 type-label leading-5 text-muted-foreground">{nextLane?.description ?? '项目对象准备完成后会显示下一步入口。'}</p>
              <Progress value={nextLane?.progress ?? 0} className="mt-4 h-1.5" />
              <Button asChild size="sm" className="mt-4 w-full justify-center gap-2">
                <Link to={nextLane?.workbenchHref ?? ROUTES.project.scripts}>
                  {nextLaneActionLabel(nextLane)} <ArrowRight size={14} />
                </Link>
              </Button>
            </AppDashboardDividerBlock>

            <ProjectOverviewMetaGrid>
              <AppDashboardMetaCell>
                <p className="text-muted-foreground">更新时间</p>
                <p className="mt-1 font-medium text-foreground">{formatDate(updatedAt)}</p>
              </AppDashboardMetaCell>
            </ProjectOverviewMetaGrid>
          </AppDashboardRegion>
        </AppDashboardHeroGrid>

        <AppDashboardSection>
          <ProjectOverviewPanelHeader>
            <div>
              <h2 className="type-title font-semibold text-foreground">工作台状态</h2>
              <p className="mt-1 type-body text-muted-foreground">总览只呈现 5 个工作台的推进状态；编排段、情景、制作项和素材需求作为对应工作台内的对象指标。</p>
            </div>
          </ProjectOverviewPanelHeader>
          <ProjectOverviewLaneGrid>
            {lanes.map((lane) => <WorkLanePanel key={lane.key} lane={lane} />)}
          </ProjectOverviewLaneGrid>
        </AppDashboardSection>

        <AppDashboardSplit>
          <AppDashboardRegion>
            <ProjectOverviewPanelHeader>
              <div>
                <h2 className="type-title font-semibold text-foreground">优先处理</h2>
                <p className="mt-1 type-body text-muted-foreground">只列会影响制作推进的事项。</p>
              </div>
            </ProjectOverviewPanelHeader>
            <ProjectOverviewEntryStack>
              {focusItems.map((item) => <FocusRow key={item.key} item={item} />)}
            </ProjectOverviewEntryStack>
          </AppDashboardRegion>

          <AppDashboardRegion>
            <h2 className="type-title font-semibold text-foreground">工作台入口</h2>
            <p className="mt-1 type-body text-muted-foreground">当前项目只暴露 3 个工作台入口：剧本、内容工作台和项目规范。</p>
            <ProjectOverviewEntryStack className="mt-4">
              {projectWorkbenchDefinitions.map((item) => {
                const Icon = item.icon
                return (
                  <SurfaceLink
                    key={item.id}
                    title={item.title}
                    detail={item.decision}
                    href={item.route}
                    icon={Icon}
                  />
                )
              })}
            </ProjectOverviewEntryStack>
          </AppDashboardRegion>
        </AppDashboardSplit>
    </ProjectOverviewPageLayout>
  )
}
