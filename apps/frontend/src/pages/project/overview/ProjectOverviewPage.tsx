import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  Database,
  FileText,
  Film,
  GitBranch,
  LayoutDashboard,
  ListChecks,
  PackageCheck,
  Route,
  ShieldCheck,
  Sparkles,
  Video,
  Wand2,
} from 'lucide-react'
import { Badge, Button, Card, Progress } from '@movscript/ui'

import { listSemanticEntities, semanticEntityConfig, type SemanticEntityKind, type SemanticEntityRecord } from '@/api/semanticEntities'
import { useProjectStore } from '@/store/projectStore'
import { workbenchSurfaces } from '@/pages/project/projectSurfaces'
import { ROUTES, mergeSearch } from '@/routes/projectRoutes'

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
  creativeReferences: HomeRecord[]
  creativeReferenceUsages: HomeRecord[]
  creativeRelationships: HomeRecord[]
  assetSlots: HomeRecord[]
  assetSlotCandidates: HomeRecord[]
  contentUnits: HomeRecord[]
  keyframes: HomeRecord[]
  deliveryVersions: HomeRecord[]
  workItems: HomeRecord[]
}

interface WorkLane {
  key: string
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
  creativeReferences: [],
  creativeReferenceUsages: [],
  creativeRelationships: [],
  assetSlots: [],
  assetSlotCandidates: [],
  contentUnits: [],
  keyframes: [],
  deliveryVersions: [],
  workItems: [],
}

const contentSurfaceLinks = [
  { title: '编排段', detail: '本集情绪、节奏和戏剧功能', href: ROUTES.project.segments, icon: Film },
  { title: '情景', detail: '时间、地点、条件和动作', href: ROUTES.project.sceneMoments, icon: Clapperboard },
  { title: '设定资料', detail: '人物、地点、道具和规则', href: mergeSearch(ROUTES.project.preProduction, '', { tab: 'settings' }), icon: Sparkles },
  { title: '素材需求', detail: '缺口、候选和锁定素材', href: mergeSearch(ROUTES.project.preProduction, '', { tab: 'assets' }), icon: PackageCheck },
  { title: '关系网络', detail: '设定资料关系和一致性约束', href: ROUTES.project.referenceRelations, icon: GitBranch },
  { title: '制作项', detail: '预演与生产的最小颗粒', href: ROUTES.project.contentUnits, icon: Boxes },
  { title: '交付中心', detail: '交付包、成片版本和导出记录', href: ROUTES.project.delivery, icon: Video },
]

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

function isStatus(record: HomeRecord, statuses: string[]) {
  return statuses.includes(String(record.status ?? ''))
}

function statusCount(records: HomeRecord[], statuses: string[]) {
  return records.filter((record) => isStatus(record, statuses)).length
}

function stateLabel(state: LaneState) {
  if (state === 'ready') return '稳定'
  if (state === 'active') return '推进中'
  if (state === 'blocked') return '待处理'
  return '未开始'
}

function stateVariant(state: LaneState) {
  if (state === 'ready') return 'success' as const
  if (state === 'active') return 'secondary' as const
  if (state === 'blocked') return 'warning' as const
  return 'outline' as const
}

function priorityVariant(priority: FocusItem['priority']) {
  if (priority === 'high') return 'danger' as const
  if (priority === 'medium') return 'warning' as const
  return 'outline' as const
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
    creativeReferences,
    creativeReferenceUsages,
    creativeRelationships,
    assetSlots,
    assetSlotCandidates,
    contentUnits,
    keyframes,
    deliveryVersions,
    workItems,
  ] = await Promise.all([
    safeListSemanticEntities(projectId, 'scriptVersions'),
    safeListSemanticEntities(projectId, 'segments'),
    safeListSemanticEntities(projectId, 'sceneMoments'),
    safeListSemanticEntities(projectId, 'productions'),
    safeListSemanticEntities(projectId, 'storyboardScripts'),
    safeListSemanticEntities(projectId, 'previewTimelines'),
    safeListSemanticEntities(projectId, 'creativeReferences'),
    safeListSemanticEntities(projectId, 'creativeReferenceUsages'),
    safeListSemanticEntities(projectId, 'creativeRelationships'),
    safeListSemanticEntities(projectId, 'assetSlots'),
    safeListSemanticEntities(projectId, 'assetSlotCandidates'),
    safeListSemanticEntities(projectId, 'contentUnits'),
    safeListSemanticEntities(projectId, 'keyframes'),
    safeListSemanticEntities(projectId, 'deliveryVersions'),
    safeListSemanticEntities(projectId, 'workItems'),
  ])

  return {
    scriptVersions,
    segments,
    sceneMoments,
    productions,
    storyboardScripts,
    previewTimelines,
    creativeReferences,
    creativeReferenceUsages,
    creativeRelationships,
    assetSlots,
    assetSlotCandidates,
    contentUnits,
    keyframes,
    deliveryVersions,
    workItems,
  } as ProjectHomeData
}

function StatBlock({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string
  value: string | number
  detail: string
  icon: LucideIcon
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon size={17} />
        </span>
      </div>
    </div>
  )
}

function PipelineStep({ lane, last = false }: { lane: WorkLane; last?: boolean }) {
  const Icon = lane.icon
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Link
        to={lane.href}
        className="group flex min-w-[136px] flex-1 items-center gap-2 rounded-md border border-border bg-background px-3 py-2 transition-colors hover:bg-muted/40"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
          <Icon size={14} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">{lane.title}</p>
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{lane.progress}%</p>
        </div>
      </Link>
      {!last ? <ChevronRight size={14} className="hidden shrink-0 text-muted-foreground xl:block" /> : null}
    </div>
  )
}

function LaneCard({ lane }: { lane: WorkLane }) {
  const Icon = lane.icon

  return (
    <Card className="flex min-h-[236px] flex-col rounded-lg border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon size={17} />
        </span>
        <Badge variant={stateVariant(lane.state)}>{stateLabel(lane.state)}</Badge>
      </div>
      <div className="mt-4 min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-foreground">{lane.title}</h2>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{lane.description}</p>
        <div className="mt-4 rounded-md bg-muted/40 px-3 py-2">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-muted-foreground">{lane.primaryLabel}</span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">{lane.primaryValue}</span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{lane.secondary}</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">准备度</span>
          <span className="font-medium tabular-nums text-foreground">{lane.progress}%</span>
        </div>
        <Progress value={lane.progress} className="h-1.5" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to={lane.href}>查看对象</Link>
        </Button>
        <Button asChild size="sm">
          <Link to={lane.workbenchHref}>进入处理</Link>
        </Button>
      </div>
    </Card>
  )
}

function FocusRow({ item }: { item: FocusItem }) {
  return (
    <Link
      to={item.href}
      className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5 transition-colors hover:bg-muted/40"
    >
      <Badge variant={priorityVariant(item.priority)} className="w-12 justify-center">
        {priorityLabel(item.priority)}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.area} · {item.detail}</p>
      </div>
      <ArrowRight size={15} className="shrink-0 text-muted-foreground" />
    </Link>
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
    <Link
      to={href}
      className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5 transition-colors hover:bg-muted/40"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <ArrowRight size={14} className="shrink-0 text-muted-foreground" />
    </Link>
  )
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
    const confirmedScripts = statusCount(data.scriptVersions, ['active'])
    const confirmedSegments = statusCount(data.segments, ['confirmed'])
    const confirmedMoments = statusCount(data.sceneMoments, ['confirmed'])
    const activeProductions = data.productions.filter((item) => !['delivered', 'archived'].includes(String(item.status ?? ''))).length
    const deliveredProductions = statusCount(data.productions, ['delivered'])
    const productionProgress = data.productions.length
      ? Math.round(data.productions.reduce((sum, item) => sum + numberOf(item.progress), 0) / data.productions.length)
      : 0
    const confirmedReferences = statusCount(data.creativeReferences, ['confirmed', 'locked', 'merged'])
    const confirmedRelationships = statusCount(data.creativeRelationships, ['confirmed', 'corrected'])
    const missingAssets = statusCount(data.assetSlots, ['missing'])
    const candidateAssets = statusCount(data.assetSlots, ['candidate']) + data.assetSlotCandidates.length
    const lockedAssets = statusCount(data.assetSlots, ['locked', 'waived'])
    const confirmedContents = statusCount(data.contentUnits, ['confirmed', 'in_production', 'locked'])
    const lockedContents = statusCount(data.contentUnits, ['locked'])
    const acceptedKeyframes = statusCount(data.keyframes, ['accepted', 'attached'])
    const approvedDeliveries = statusCount(data.deliveryVersions, ['approved', 'exported'])
    const blockedTasks = data.workItems.filter((item) => ['blocked', 'review'].includes(String(item.status ?? ''))).length

    return {
      confirmedScripts,
      confirmedSegments,
      confirmedMoments,
      activeProductions,
      deliveredProductions,
      productionProgress,
      confirmedReferences,
      confirmedRelationships,
      missingAssets,
      candidateAssets,
      lockedAssets,
      confirmedContents,
      lockedContents,
      acceptedKeyframes,
      approvedDeliveries,
      blockedTasks,
    }
  }, [data])

  const lanes = useMemo<WorkLane[]>(() => {
    const scriptTotal = data.scriptVersions.length + data.segments.length + data.sceneMoments.length
    const scriptDone = counts.confirmedScripts + counts.confirmedSegments + counts.confirmedMoments
    const scriptProgress = scriptTotal > 0 ? percentage(scriptDone, scriptTotal) : 0

    const planTotal = data.productions.length + data.storyboardScripts.length + data.previewTimelines.length
    const planDone = counts.deliveredProductions + statusCount(data.storyboardScripts, ['active', 'locked']) + statusCount(data.previewTimelines, ['playable', 'confirmed'])
    const planProgress = planTotal > 0 ? Math.max(counts.productionProgress, percentage(planDone, planTotal)) : 0

    const constraintTotal = data.creativeReferences.length + data.creativeRelationships.length
    const constraintDone = counts.confirmedReferences + counts.confirmedRelationships
    const constraintProgress = constraintTotal > 0 ? percentage(constraintDone, constraintTotal) : scriptProgress > 0 ? 25 : 0

    const assetProgress = data.assetSlots.length > 0 ? percentage(counts.lockedAssets, data.assetSlots.length) : 0
    const contentTotal = data.contentUnits.length + data.keyframes.length
    const contentDone = counts.confirmedContents + counts.acceptedKeyframes
    const contentProgress = contentTotal > 0 ? percentage(contentDone, contentTotal) : planProgress > 0 ? 20 : 0
    const deliveryProgress = data.deliveryVersions.length > 0 ? percentage(counts.approvedDeliveries, data.deliveryVersions.length) : 0

    return [
      {
        key: 'script',
        title: '剧本与情景',
        description: '从剧本版本沉淀编排段和情景，形成制作编排的叙事来源。',
        primaryLabel: '剧本/编排段/情景',
        primaryValue: scriptTotal,
        secondary: `${counts.confirmedSegments} 个编排段已确认，${counts.confirmedMoments} 个情景已确认`,
        progress: scriptProgress,
        state: scriptTotal === 0 ? 'empty' : scriptProgress >= 70 ? 'ready' : 'active',
        href: ROUTES.project.scripts,
        workbenchHref: ROUTES.project.scripts,
        icon: FileText,
      },
      {
        key: 'production',
        title: '制作编排',
        description: '项目现在以“制作”为主轴，承载从剧本到成片的一次完整生产单元。',
        primaryLabel: '制作/分镜/预演',
        primaryValue: planTotal,
        secondary: `${counts.activeProductions} 个制作进行中，${data.previewTimelines.length} 条预演时间线`,
        progress: planProgress,
        state: data.productions.length === 0 ? (scriptTotal > 0 ? 'blocked' : 'empty') : planProgress >= 70 ? 'ready' : 'active',
        href: ROUTES.project.production,
        workbenchHref: mergeSearch(ROUTES.project.contentUnitWorkbench, '', { focus: 'preview' }),
        icon: Route,
      },
      {
        key: 'constraints',
        title: '设定约束',
        description: '人物、地点、道具、风格与设定资料关系统一管理，避免下游生成解释分裂。',
        primaryLabel: '设定资料/关系/引用',
        primaryValue: constraintTotal + data.creativeReferenceUsages.length,
        secondary: `${counts.confirmedReferences} 个设定资料已确认，${counts.confirmedRelationships} 条关系已确认`,
        progress: constraintProgress,
        state: constraintTotal === 0 ? (scriptTotal > 0 ? 'active' : 'empty') : constraintProgress >= 70 ? 'ready' : 'active',
        href: mergeSearch(ROUTES.project.preProduction, '', { tab: 'settings' }),
        workbenchHref: ROUTES.project.preProduction,
        icon: ShieldCheck,
      },
      {
        key: 'assets',
        title: '素材需求',
        description: '素材需求负责表达缺口、候选和锁定素材，是画面锚点和视频生产前的输入门槛。',
        primaryLabel: '素材需求',
        primaryValue: data.assetSlots.length,
        secondary: `${counts.missingAssets} 个缺口，${counts.candidateAssets} 个候选，${counts.lockedAssets} 个已锁定`,
        progress: assetProgress,
        state: counts.missingAssets > 0 ? 'blocked' : data.assetSlots.length === 0 ? (planProgress > 0 ? 'active' : 'empty') : assetProgress >= 70 ? 'ready' : 'active',
        href: mergeSearch(ROUTES.project.preProduction, '', { tab: 'assets' }),
        workbenchHref: mergeSearch(ROUTES.project.preProduction, '', { tab: 'assets' }),
        icon: PackageCheck,
      },
      {
        key: 'content',
        title: '内容制作',
        description: '制作项收拢镜头关键帧、画面、语音和字幕，生产工作台只处理采用和返工决策。',
        primaryLabel: '制作项/画面锚点',
        primaryValue: contentTotal,
        secondary: `${counts.confirmedContents} 个内容可生产，${counts.acceptedKeyframes} 个画面锚点已采纳`,
        progress: contentProgress,
        state: contentTotal === 0 ? (planProgress > 0 ? 'active' : 'empty') : contentProgress >= 70 ? 'ready' : 'active',
        href: ROUTES.project.contentUnits,
        workbenchHref: ROUTES.project.contentUnitWorkbench,
        icon: Wand2,
      },
      {
        key: 'delivery',
        title: '成片交付',
        description: '交付版本、导出记录和检查状态从内容制作中分离出来，作为最终放行门禁。',
        primaryLabel: '交付版本',
        primaryValue: data.deliveryVersions.length,
        secondary: `${counts.approvedDeliveries} 个版本已放行，${counts.lockedContents} 个内容已锁定`,
        progress: deliveryProgress,
        state: data.deliveryVersions.length === 0 ? (counts.lockedContents > 0 ? 'active' : 'empty') : deliveryProgress >= 70 ? 'ready' : 'active',
        href: ROUTES.project.delivery,
        workbenchHref: ROUTES.project.deliveryWorkbench,
        icon: Video,
      },
    ]
  }, [counts, data])

  const focusItems = useMemo<FocusItem[]>(() => {
    const items: FocusItem[] = []

    if (data.scriptVersions.length === 0) {
      items.push({
        key: 'script',
        title: '建立或导入剧本版本',
        area: '剧本管理',
        href: ROUTES.project.scripts,
        priority: 'high',
        detail: '没有剧本版本时，编排段、情景、制作和素材都缺少来源',
      })
    }

    if (data.scriptVersions.length > 0 && data.productions.length === 0) {
      items.push({
        key: 'production',
        title: '创建第一个制作',
        area: '制作',
        href: ROUTES.project.production,
        priority: 'high',
        detail: '当前架构以制作为主轴，需要先建立生产单元',
      })
    }

    for (const task of data.workItems.filter((item) => ['blocked', 'review'].includes(String(item.status ?? ''))).slice(0, 2)) {
      items.push({
        key: `task:${task.ID}`,
        title: titleOf(task, `任务 #${task.ID}`),
        area: '生产协作',
        href: ROUTES.project.tasks,
        priority: String(task.status ?? '') === 'blocked' ? 'high' : 'medium',
        detail: String(task.description ?? itemStatusText(task.status)),
      })
    }

    for (const slot of data.assetSlots.filter((item) => String(item.status ?? '') === 'missing').slice(0, 3)) {
      items.push({
        key: `asset:${slot.ID}`,
        title: titleOf(slot, `素材需求 #${slot.ID}`),
        area: '素材工作台',
        href: mergeSearch(ROUTES.project.preProduction, '', { tab: 'assets' }),
        priority: ['critical', 'high'].includes(String(slot.priority ?? '')) ? 'high' : 'medium',
        detail: String(slot.description ?? '素材需求缺口会影响画面锚点和视频生产'),
      })
    }

    if (data.productions.length > 0 && data.contentUnits.length === 0) {
      items.push({
        key: 'content',
        title: '生成或确认制作项',
        area: '制作项',
        href: ROUTES.project.contentUnits,
        priority: 'medium',
        detail: '制作创建后，需要把预演拆成可执行的生产颗粒',
      })
    }

    if (items.length > 0) return items.slice(0, 5)
    return [
      {
        key: 'preview',
        title: '检查预演挂载',
        area: '内容编排',
        href: mergeSearch(ROUTES.project.contentUnitWorkbench, '', { focus: 'preview' }),
        priority: 'low',
        detail: '没有明显阻塞时，优先确认下一批可执行内容',
      },
      {
        key: 'delivery',
        title: '查看交付工作台',
        area: '交付工作台',
        href: ROUTES.project.deliveryWorkbench,
        priority: 'low',
        detail: '提前检查声音、字幕、版权和导出完整性',
      },
    ]
  }, [data])

  const readiness = lanes.length > 0 ? Math.round(lanes.reduce((sum, lane) => sum + lane.progress, 0) / lanes.length) : 0
  const blockedCount = lanes.filter((lane) => lane.state === 'blocked').length + counts.blockedTasks
  const nextLane = lanes.find((lane) => lane.state === 'blocked') ?? lanes.find((lane) => lane.state === 'active') ?? lanes[0]
  const updatedAt = project?.UpdatedAt ?? [...Object.values(data).flat()].sort((a, b) => String(b.UpdatedAt ?? '').localeCompare(String(a.UpdatedAt ?? '')))[0]?.UpdatedAt

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-5 p-5">
        <header className="flex flex-col gap-4 border-b border-border pb-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <LayoutDashboard size={14} />
              <span>{project?.name ?? '当前项目'}</span>
              <ChevronRight size={13} />
              <span>项目总览</span>
              <Badge variant={blockedCount > 0 ? 'warning' : 'success'}>
                {blockedCount > 0 ? `${blockedCount} 个事项待处理` : '可继续推进'}
              </Badge>
              {isFetching ? <Badge variant="outline">同步中</Badge> : null}
            </div>
            <h1 className="mt-2 truncate text-2xl font-semibold tracking-normal text-foreground">{project?.name}</h1>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">
              {project?.description || '总览只负责把当前项目的制作、内容对象和工作台入口放在一起，具体生成、确认和返工决策进入对应工作台完成。'}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild variant="outline" className="gap-2">
              <Link to={ROUTES.projects}>
                <Database size={15} />
                切换项目
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link to={ROUTES.project.production}>
                <Boxes size={15} />
                制作
              </Link>
            </Button>
            <Button asChild className="gap-2">
              <Link to={nextLane?.workbenchHref ?? ROUTES.project.contentUnitWorkbench}>
                进入下一步 <ArrowRight size={15} />
              </Link>
            </Button>
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
          <Card className="rounded-lg border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={17} className="text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">项目生产状态</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">按当前语义对象估算，不替代具体页面里的审核状态。</p>
              </div>
              <Badge variant={readiness >= 70 ? 'success' : readiness > 0 ? 'secondary' : 'outline'}>{readiness}%</Badge>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatBlock label="制作" value={data.productions.length} detail={`${counts.activeProductions} 个进行中`} icon={Boxes} />
              <StatBlock label="制作项" value={data.contentUnits.length} detail={`${counts.confirmedContents} 个可生产`} icon={Wand2} />
              <StatBlock label="素材需求" value={data.assetSlots.length} detail={`${counts.missingAssets} 个缺口`} icon={PackageCheck} />
              <StatBlock label="成片版本" value={data.deliveryVersions.length} detail={`${counts.approvedDeliveries} 个已放行`} icon={Video} />
            </div>

            <div className="mt-5 grid gap-2 xl:grid-cols-6">
              {lanes.map((lane, index) => (
                <PipelineStep key={lane.key} lane={lane} last={index === lanes.length - 1} />
              ))}
            </div>
          </Card>

          <Card className="rounded-lg border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">下一步</h2>
                <p className="mt-1 text-xs text-muted-foreground">按阻塞、任务和素材需求缺口排序。</p>
              </div>
              <Badge variant={stateVariant(nextLane?.state ?? 'empty')}>{stateLabel(nextLane?.state ?? 'empty')}</Badge>
            </div>

            <div className="mt-5 rounded-md border border-border bg-background p-4">
              <p className="text-xs text-muted-foreground">当前建议入口</p>
              <p className="mt-1 text-base font-semibold text-foreground">{nextLane?.title ?? '暂无建议'}</p>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{nextLane?.description ?? '项目对象准备完成后会显示下一步入口。'}</p>
              <Progress value={nextLane?.progress ?? 0} className="mt-4 h-1.5" />
              <Button asChild size="sm" className="mt-4 w-full justify-center gap-2">
                <Link to={nextLane?.workbenchHref ?? ROUTES.project.contentUnitWorkbench}>
                  处理下一步 <ArrowRight size={14} />
                </Link>
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-muted-foreground">更新时间</p>
                <p className="mt-1 font-medium text-foreground">{formatDate(updatedAt)}</p>
              </div>
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-muted-foreground">项目状态</p>
                <p className="mt-1 font-medium text-foreground">{project?.status || '未设置'}</p>
              </div>
            </div>
          </Card>
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">项目对象地图</h2>
              <p className="mt-1 text-sm text-muted-foreground">当前项目按制作主轴组织，内容区管理对象，工作台处理决策。</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {lanes.map((lane) => <LaneCard key={lane.key} lane={lane} />)}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
          <Card className="rounded-lg border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">优先处理</h2>
                <p className="mt-1 text-sm text-muted-foreground">只列会影响制作推进的事项。</p>
              </div>
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link to={ROUTES.project.tasks}>
                  <ListChecks size={14} />
                  任务
                </Link>
              </Button>
            </div>
            <div className="space-y-2">
              {focusItems.map((item) => <FocusRow key={item.key} item={item} />)}
            </div>
          </Card>

          <Card className="rounded-lg border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">内容区入口</h2>
            <p className="mt-1 text-sm text-muted-foreground">对象管理页面负责事实源和状态归档。</p>
            <div className="mt-4 grid gap-2">
              {contentSurfaceLinks.map((item) => <SurfaceLink key={item.href} {...item} />)}
            </div>
          </Card>
        </section>

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">工作台入口</h2>
              <p className="mt-1 text-sm text-muted-foreground">工作台面向确认、生成、采用、返工和交付门禁。</p>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {workbenchSurfaces.map((item) => {
              const Icon = item.icon
              return (
                <SurfaceLink
                  key={item.value}
                  title={item.title}
                  detail={item.decision}
                  href={item.href}
                  icon={Icon}
                />
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}

function itemStatusText(status: unknown) {
  const value = String(status ?? '')
  if (value === 'blocked') return '阻塞'
  if (value === 'review') return '待审核'
  return value || '待处理'
}
