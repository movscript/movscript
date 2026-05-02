import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileText,
  LayoutDashboard,
  ListChecks,
  PackageCheck,
  Sparkles,
  Video,
} from 'lucide-react'
import { Badge, Button, Card, Progress } from '@movscript/ui'

import { getLatestProjectPreviewDraft, type GetLatestProjectPreviewDraftResponse } from '@/api/projectPreview'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { projectSurfaces, workbenchSurfaces, type StageKey } from '@/pages/project-workspace/structure'

type StageState = 'ready' | 'active' | 'blocked'
type V2Record = Record<string, unknown> & {
  ID: number
  title?: string
  name?: string
  description?: string
  status?: string
  priority?: string
}

interface SurfaceMetric {
  key: StageKey
  count: number
  progress: number
  state: StageState
  note: string
}

interface FocusItem {
  key: string
  title: string
  area: string
  href: string
  priority: 'high' | 'medium' | 'low'
  detail: string
}

function percentage(value: number, total: number) {
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)))
}

function formatDate(value?: string) {
  if (!value) return '-'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return '-'
  }
}

async function listV2Records(projectId: number, path: string) {
  const { data } = await api.get<V2Record[] | { items?: V2Record[] }>(`/projects/${projectId}/v2/${path}`)
  return Array.isArray(data) ? data : data.items ?? []
}

function stateLabel(state: StageState) {
  if (state === 'ready') return '可用'
  if (state === 'active') return '进行中'
  return '待补齐'
}

function stateVariant(state: StageState) {
  if (state === 'ready') return 'success' as const
  if (state === 'active') return 'secondary' as const
  return 'warning' as const
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

function MetricTile({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: string | number
  hint: string
  icon: typeof FileText
}) {
  return (
    <Card className="rounded-lg border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon size={17} />
        </span>
      </div>
    </Card>
  )
}

function SurfaceCard({ metric }: { metric: SurfaceMetric }) {
  const surface = projectSurfaces.find((item) => item.key === metric.key)!
  const workbench = workbenchSurfaces.find((item) => {
    if (metric.key === 'script') return item.value === 'script'
    if (metric.key === 'creative') return item.value === 'creative'
    if (metric.key === 'relations') return item.value === 'reference-relations'
    if (metric.key === 'assets') return item.value === 'assets'
    if (metric.key === 'plan') return item.value === 'preview'
    if (metric.key === 'production') return item.value === 'production'
    if (metric.key === 'delivery') return item.value === 'delivery'
    return false
  })
  const Icon = surface.icon

  return (
    <Card className="flex min-h-[214px] flex-col rounded-lg border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon size={17} />
        </span>
        <Badge variant={stateVariant(metric.state)}>{stateLabel(metric.state)}</Badge>
      </div>
      <div className="mt-4 min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-foreground">{surface.title}</h2>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{surface.purpose}</p>
        <p className="mt-3 text-xs text-muted-foreground">{surface.owns}</p>
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="truncate text-muted-foreground">{metric.note}</span>
          <span className="shrink-0 font-medium tabular-nums text-foreground">{metric.count}</span>
        </div>
        <Progress value={metric.progress} className="h-1.5" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to={surface.href}>管理</Link>
        </Button>
        <Button asChild size="sm" disabled={!workbench}>
          <Link to={workbench?.href ?? surface.href}>处理</Link>
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

export default function ProjectHomeV2Page() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID

  const { data: latestDraft } = useQuery<GetLatestProjectPreviewDraftResponse>({
    queryKey: ['project-preview-draft', projectId],
    queryFn: () => getLatestProjectPreviewDraft(projectId!),
    enabled: !!projectId,
  })
  const { data: scriptVersions = [] } = useQuery({
    queryKey: ['v2', projectId, 'script-versions'],
    queryFn: () => listV2Records(projectId!, 'script-versions'),
    enabled: !!projectId,
  })
  const { data: creativeReferences = [] } = useQuery({
    queryKey: ['v2', projectId, 'creative-references'],
    queryFn: () => listV2Records(projectId!, 'creative-references'),
    enabled: !!projectId,
  })
  const { data: assetSlots = [] } = useQuery({
    queryKey: ['v2', projectId, 'asset-slots'],
    queryFn: () => listV2Records(projectId!, 'asset-slots'),
    enabled: !!projectId,
  })
  const { data: contentUnits = [] } = useQuery({
    queryKey: ['v2', projectId, 'content-units'],
    queryFn: () => listV2Records(projectId!, 'content-units'),
    enabled: !!projectId,
  })
  const { data: keyframes = [] } = useQuery({
    queryKey: ['v2', projectId, 'keyframes'],
    queryFn: () => listV2Records(projectId!, 'keyframes'),
    enabled: !!projectId,
  })
  const { data: deliveryVersions = [] } = useQuery({
    queryKey: ['v2', projectId, 'delivery-versions'],
    queryFn: () => listV2Records(projectId!, 'delivery-versions'),
    enabled: !!projectId,
  })
  const { data: workItems = [] } = useQuery({
    queryKey: ['v2', projectId, 'work-items'],
    queryFn: () => listV2Records(projectId!, 'work-items'),
    enabled: !!projectId,
  })

  const draft = latestDraft?.draft?.draft
  const storyboardRows = draft?.storyboard_rows ?? []
  const previewCandidates = draft?.preview_candidates
  const scriptCount = Math.max(scriptVersions.length, draft?.source_text?.trim() ? 1 : 0)
  const referenceCount = creativeReferences.length
  const assetSlotCount = assetSlots.length || previewCandidates?.asset_gaps.length || 0
  const missingAssetSlots = assetSlots.filter((slot) => String(slot.status ?? '') === 'missing').length
  const lockedAssetSlots = assetSlots.filter((slot) => ['locked', 'accepted', 'resolved'].includes(String(slot.status ?? ''))).length
  const contentUnitCount = contentUnits.length || storyboardRows.length
  const confirmedContentUnits = contentUnits.filter((unit) => ['confirmed', 'in_production', 'locked'].includes(String(unit.status ?? ''))).length
  const keyframeCount = keyframes.length || previewCandidates?.keyframe_candidates.length || 0
  const acceptedKeyframes = keyframes.filter((frame) => ['accepted', 'attached'].includes(String(frame.status ?? ''))).length
  const deliveryReady = deliveryVersions.filter((version) => ['approved', 'exported'].includes(String(version.status ?? ''))).length

  const metrics = useMemo<SurfaceMetric[]>(() => {
    const scriptProgress = scriptCount > 0 ? 100 : 0
    const creativeProgress = referenceCount > 0 ? 100 : scriptCount > 0 ? 35 : 0
    const relationProgress = referenceCount > 1 ? 60 : 0
    const assetProgress = assetSlotCount > 0 ? percentage(lockedAssetSlots, assetSlotCount) : 0
    const planProgress = contentUnitCount > 0 ? 100 : storyboardRows.length > 0 ? 70 : scriptCount > 0 ? 30 : 0
    const productionProgress = contentUnitCount > 0 ? percentage(Math.max(confirmedContentUnits, acceptedKeyframes), contentUnitCount) : 0
    const deliveryProgress = deliveryVersions.length > 0 ? percentage(deliveryReady, deliveryVersions.length) : 0

    return [
      { key: 'script', count: scriptCount, progress: scriptProgress, state: scriptCount > 0 ? 'ready' : 'active', note: '剧本版本' },
      { key: 'creative', count: referenceCount, progress: creativeProgress, state: referenceCount > 0 ? 'ready' : scriptCount > 0 ? 'active' : 'blocked', note: '资料卡' },
      { key: 'relations', count: Math.max(0, referenceCount - 1), progress: relationProgress, state: relationProgress > 0 ? 'active' : referenceCount > 1 ? 'active' : 'blocked', note: '关系线索' },
      { key: 'assets', count: assetSlotCount, progress: assetProgress, state: assetSlotCount > 0 && missingAssetSlots === 0 ? 'ready' : scriptCount > 0 ? 'active' : 'blocked', note: '素材位' },
      { key: 'plan', count: contentUnitCount, progress: planProgress, state: contentUnitCount > 0 ? 'ready' : scriptCount > 0 ? 'active' : 'blocked', note: '分镜/片段' },
      { key: 'production', count: keyframeCount, progress: productionProgress, state: productionProgress > 0 ? 'active' : assetProgress > 0 || planProgress > 0 ? 'active' : 'blocked', note: '关键帧/生产对象' },
      { key: 'delivery', count: deliveryVersions.length, progress: deliveryProgress, state: deliveryReady > 0 ? 'ready' : productionProgress > 0 ? 'active' : 'blocked', note: '交付版本' },
    ]
  }, [acceptedKeyframes, assetSlotCount, confirmedContentUnits, contentUnitCount, deliveryReady, deliveryVersions.length, keyframeCount, lockedAssetSlots, missingAssetSlots, referenceCount, scriptCount, storyboardRows.length])

  const focusItems = useMemo<FocusItem[]>(() => {
    const items: FocusItem[] = []

    if (!draft?.source_text?.trim() && scriptVersions.length === 0) {
      items.push({
        key: 'source',
        title: '导入或确认剧本来源',
        area: '理解确认工作台',
        href: '/workbench/script',
        priority: 'high',
        detail: '没有剧本，后续资料、预演和生产都无法稳定推进',
      })
    }

    for (const slot of assetSlots.filter((item) => String(item.status ?? '') === 'missing').slice(0, 3)) {
      items.push({
        key: `asset:${slot.ID}`,
        title: String(slot.name ?? slot.title ?? `素材位 #${slot.ID}`),
        area: '素材生成工作台',
        href: '/workbench/assets',
        priority: String(slot.priority ?? '') === 'high' || String(slot.priority ?? '') === 'critical' ? 'high' : 'medium',
        detail: String(slot.description ?? '素材缺口会阻塞关键帧和视频生产'),
      })
    }

    for (const workItem of workItems.filter((item) => ['blocked', 'review'].includes(String(item.status ?? ''))).slice(0, 2)) {
      items.push({
        key: `work:${workItem.ID}`,
        title: String(workItem.title ?? workItem.name ?? `任务 #${workItem.ID}`),
        area: '生产协作',
        href: '/collaboration',
        priority: String(workItem.status ?? '') === 'blocked' ? 'high' : 'medium',
        detail: String(workItem.description ?? itemStatusText(workItem.status)),
      })
    }

    if (items.length > 0) return items.slice(0, 5)
    return [
      {
        key: 'preview',
        title: '检查预演和生产方案',
        area: '项目预演工作台',
        href: '/workbench/production-plan',
        priority: 'low',
        detail: '没有高优先级阻塞时，优先确认下一批可生产片段',
      },
      {
        key: 'delivery',
        title: '查看交付前检查项',
        area: '交付门禁工作台',
        href: '/workbench/delivery',
        priority: 'low',
        detail: '提前发现声音、字幕、版权和完整性风险',
      },
    ]
  }, [assetSlots, draft?.source_text, scriptVersions.length, workItems])

  const activeMetric = metrics.find((item) => item.state === 'active') ?? metrics.find((item) => item.state === 'blocked') ?? metrics[0]
  const activeSurface = projectSurfaces.find((item) => item.key === activeMetric?.key) ?? projectSurfaces[0]
  const readiness = metrics.length > 0 ? Math.round(metrics.reduce((sum, item) => sum + item.progress, 0) / metrics.length) : 0
  const blockedCount = metrics.filter((item) => item.state === 'blocked').length

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-6 p-6">
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="rounded-lg border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <LayoutDashboard size={17} />
                  </span>
                  <Badge variant="outline">项目驾驶舱</Badge>
                  <Badge variant={blockedCount > 0 ? 'warning' : 'success'}>
                    {blockedCount > 0 ? `${blockedCount} 个阶段待补齐` : '阶段可推进'}
                  </Badge>
                </div>
                <h1 className="mt-4 truncate text-2xl font-semibold text-foreground">{project?.name}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {project?.description || '这里不处理具体生成动作，只用于看项目对象、阶段状态和下一步入口。具体判断和生产动作进入工作台完成。'}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button asChild variant="outline" className="gap-2">
                  <Link to="/projects">切换项目</Link>
                </Button>
                <Button asChild className="gap-2">
                  <Link to={activeSurface.href}>
                    进入当前阶段 <ArrowRight size={15} />
                  </Link>
                </Button>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile label="项目完整度" value={`${readiness}%`} hint="按阶段平均估算" icon={CheckCircle2} />
              <MetricTile label="剧本/资料" value={`${scriptCount}/${referenceCount}`} hint="来源与创作约束" icon={Sparkles} />
              <MetricTile label="素材/片段" value={`${assetSlotCount}/${contentUnitCount}`} hint="素材位与生产单元" icon={PackageCheck} />
              <MetricTile label="生产/交付" value={`${acceptedKeyframes}/${deliveryReady}`} hint="已采纳关键帧与交付版本" icon={Video} />
            </div>
          </Card>

          <Card className="rounded-lg border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">现在应该看哪里</h2>
                <p className="mt-1 text-xs text-muted-foreground">项目页负责定位，工作台负责处理。</p>
              </div>
              <Badge variant={stateVariant(activeMetric?.state ?? 'active')}>{stateLabel(activeMetric?.state ?? 'active')}</Badge>
            </div>
            <div className="mt-5 rounded-md border border-border bg-background p-4">
              <p className="text-xs text-muted-foreground">当前阶段</p>
              <p className="mt-1 text-base font-semibold text-foreground">{activeSurface.title}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{activeSurface.purpose}</p>
              <Progress value={activeMetric?.progress ?? 0} className="mt-4 h-1.5" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-md bg-muted/40 p-3">
                <p className="text-muted-foreground">更新时间</p>
                <p className="mt-1 font-medium text-foreground">{formatDate(project?.UpdatedAt)}</p>
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
              <h2 className="text-base font-semibold text-foreground">项目分类</h2>
              <p className="mt-1 text-sm text-muted-foreground">管理页面承载对象和状态，处理动作进入对应工作台。</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => <SurfaceCard key={metric.key} metric={metric} />)}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Card className="rounded-lg border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">优先处理</h2>
                <p className="mt-1 text-sm text-muted-foreground">只列会影响下一阶段推进的事项。</p>
              </div>
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link to="/collaboration">
                  <ListChecks size={14} /> 任务
                </Link>
              </Button>
            </div>
            <div className="space-y-2">
              {focusItems.map((item) => <FocusRow key={item.key} item={item} />)}
            </div>
          </Card>

          <Card className="rounded-lg border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">工作台入口</h2>
            <p className="mt-1 text-sm text-muted-foreground">每个入口只处理一种决策场景。</p>
            <div className="mt-4 grid gap-2">
              {workbenchSurfaces.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.value}
                    to={item.href}
                    className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5 text-sm transition-colors hover:bg-muted/40"
                  >
                    <Icon size={15} className="shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{item.title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.decision}</p>
                    </div>
                    <ArrowRight size={14} className="shrink-0 text-muted-foreground" />
                  </Link>
                )
              })}
            </div>
          </Card>
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
