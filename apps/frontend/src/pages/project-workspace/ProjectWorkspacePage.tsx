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
  Film,
  GitBranch,
  Image,
  Layers3,
  PackageCheck,
  Radar,
  Route,
  Sparkles,
  Users,
  Video,
  Wand2,
} from 'lucide-react'
import { Badge, Button, Card, Progress } from '@movscript/ui'

import { listSemanticEntities, semanticEntityConfig, type SemanticEntityKind, type SemanticEntityRecord } from '@/api/semanticEntities'
import { useProjectStore } from '@/store/projectStore'

type WorkspaceRecord = SemanticEntityRecord & {
  description?: string
  summary?: string
  priority?: string
  progress?: number
  production_id?: number | null
  creative_reference_id?: number | null
  owner_type?: string
  owner_id?: number | null
  source_type?: string
  kind?: string
  role?: string
}

interface WorkspaceData {
  productions: WorkspaceRecord[]
  creativeReferences: WorkspaceRecord[]
  creativeRelationships: WorkspaceRecord[]
  creativeReferenceUsages: WorkspaceRecord[]
  assetSlots: WorkspaceRecord[]
  assetSlotCandidates: WorkspaceRecord[]
  segments: WorkspaceRecord[]
  sceneMoments: WorkspaceRecord[]
  contentUnits: WorkspaceRecord[]
  keyframes: WorkspaceRecord[]
  deliveryVersions: WorkspaceRecord[]
  workItems: WorkspaceRecord[]
}

interface StatCardProps {
  title: string
  value: string | number
  detail: string
  icon: LucideIcon
}

interface ActionItem {
  key: string
  title: string
  detail: string
  href: string
  priority: 'high' | 'medium' | 'low'
}

const emptyData: WorkspaceData = {
  productions: [],
  creativeReferences: [],
  creativeRelationships: [],
  creativeReferenceUsages: [],
  assetSlots: [],
  assetSlotCandidates: [],
  segments: [],
  sceneMoments: [],
  contentUnits: [],
  keyframes: [],
  deliveryVersions: [],
  workItems: [],
}

const referenceKinds = [
  { key: 'person', label: '人物', icon: Users },
  { key: 'place', label: '场景', icon: Clapperboard },
  { key: 'prop', label: '道具', icon: PackageCheck },
  { key: 'style', label: '风格', icon: Sparkles },
  { key: 'brand', label: '品牌', icon: Database },
  { key: 'world_rule', label: '规则', icon: GitBranch },
]

function textOf(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function numberOf(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function titleOf(record: WorkspaceRecord, fallback: string) {
  return textOf(record.title, textOf(record.name, textOf(record.label, fallback)))
}

function percentage(value: number, total: number) {
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)))
}

function statusCount(records: WorkspaceRecord[], statuses: string[]) {
  return records.filter((record) => statuses.includes(String(record.status ?? ''))).length
}

function priorityVariant(priority: ActionItem['priority']) {
  if (priority === 'high') return 'danger' as const
  if (priority === 'medium') return 'warning' as const
  return 'outline' as const
}

function priorityLabel(priority: ActionItem['priority']) {
  if (priority === 'high') return '高'
  if (priority === 'medium') return '中'
  return '低'
}

function statusVariant(status?: unknown) {
  const value = String(status ?? '')
  if (['delivered', 'locked', 'approved', 'exported', 'confirmed', 'active'].includes(value)) return 'success' as const
  if (['missing', 'blocked', 'review'].includes(value)) return 'warning' as const
  if (['producing', 'previewing', 'materializing', 'candidate', 'in_production'].includes(value)) return 'secondary' as const
  return 'outline' as const
}

function statusLabel(status?: unknown) {
  const value = String(status ?? '')
  const labels: Record<string, string> = {
    planning: '筹备',
    previewing: '预演',
    materializing: '素材化',
    producing: '制作中',
    reviewing: '审核',
    delivered: '已交付',
    archived: '归档',
    draft: '草稿',
    confirmed: '确认',
    locked: '锁定',
    missing: '缺口',
    candidate: '候选',
    review: '待审核',
    blocked: '阻塞',
  }
  return labels[value] ?? (value || '未设置')
}

async function safeList(projectId: number, kind: SemanticEntityKind): Promise<WorkspaceRecord[]> {
  try {
    return await listSemanticEntities(projectId, semanticEntityConfig(kind)) as WorkspaceRecord[]
  } catch (error) {
    console.warn(`Failed to load project workspace entity: ${kind}`, error)
    return []
  }
}

async function loadWorkspaceData(projectId: number): Promise<WorkspaceData> {
  const [
    productions,
    creativeReferences,
    creativeRelationships,
    creativeReferenceUsages,
    assetSlots,
    assetSlotCandidates,
    segments,
    sceneMoments,
    contentUnits,
    keyframes,
    deliveryVersions,
    workItems,
  ] = await Promise.all([
    safeList(projectId, 'productions'),
    safeList(projectId, 'creativeReferences'),
    safeList(projectId, 'creativeRelationships'),
    safeList(projectId, 'creativeReferenceUsages'),
    safeList(projectId, 'assetSlots'),
    safeList(projectId, 'assetSlotCandidates'),
    safeList(projectId, 'segments'),
    safeList(projectId, 'sceneMoments'),
    safeList(projectId, 'contentUnits'),
    safeList(projectId, 'keyframes'),
    safeList(projectId, 'deliveryVersions'),
    safeList(projectId, 'workItems'),
  ])

  return {
    productions,
    creativeReferences,
    creativeRelationships,
    creativeReferenceUsages,
    assetSlots,
    assetSlotCandidates,
    segments,
    sceneMoments,
    contentUnits,
    keyframes,
    deliveryVersions,
    workItems,
  }
}

function StatCard({ title, value, detail, icon: Icon }: StatCardProps) {
  return (
    <Card className="rounded-lg border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon size={17} />
        </span>
      </div>
    </Card>
  )
}

function ActionRow({ item }: { item: ActionItem }) {
  return (
    <Link
      to={item.href}
      className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5 transition-colors hover:bg-muted/40"
    >
      <Badge variant={priorityVariant(item.priority)} className="w-11 justify-center">
        {priorityLabel(item.priority)}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.detail}</p>
      </div>
      <ArrowRight size={14} className="shrink-0 text-muted-foreground" />
    </Link>
  )
}

export default function ProjectOrchestrationPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID

  const { data = emptyData, isFetching } = useQuery({
    queryKey: ['project-workspace', projectId],
    queryFn: () => loadWorkspaceData(projectId!),
    enabled: !!projectId,
  })

  const derived = useMemo(() => {
    const sharedReferences = data.creativeReferences.filter((item) => !['ignored', 'merged'].includes(String(item.status ?? '')))
    const lockedReferences = statusCount(sharedReferences, ['confirmed', 'locked'])
    const missingAssets = data.assetSlots.filter((item) => String(item.status ?? '') === 'missing')
    const lockedAssets = statusCount(data.assetSlots, ['locked', 'waived'])
    const sharedAssetSlots = data.assetSlots.filter((item) => !item.production_id)
    const productionAssetSlots = data.assetSlots.filter((item) => item.production_id)
    const confirmedContent = statusCount(data.contentUnits, ['confirmed', 'in_production', 'locked'])
    const acceptedKeyframes = statusCount(data.keyframes, ['accepted', 'attached'])
    const activeProductions = data.productions.filter((item) => !['delivered', 'archived'].includes(String(item.status ?? '')))
    const deliveryReady = statusCount(data.deliveryVersions, ['approved', 'exported'])
    const referenceReadiness = percentage(lockedReferences, sharedReferences.length)
    const assetReadiness = percentage(lockedAssets, data.assetSlots.length)
    const contentReadiness = percentage(confirmedContent + acceptedKeyframes, data.contentUnits.length + data.keyframes.length)
    const deliveryReadiness = percentage(deliveryReady, data.deliveryVersions.length)
    const workspaceReadiness = Math.round((referenceReadiness + assetReadiness + contentReadiness + deliveryReadiness) / 4)

    return {
      sharedReferences,
      lockedReferences,
      missingAssets,
      lockedAssets,
      sharedAssetSlots,
      productionAssetSlots,
      confirmedContent,
      acceptedKeyframes,
      activeProductions,
      deliveryReady,
      referenceReadiness,
      assetReadiness,
      contentReadiness,
      deliveryReadiness,
      workspaceReadiness,
    }
  }, [data])

  const referenceGroups = useMemo(() => {
    return referenceKinds.map((kind) => {
      const records = derived.sharedReferences.filter((item) => String(item.kind ?? '') === kind.key)
      const locked = statusCount(records, ['confirmed', 'locked'])
      const used = data.creativeReferenceUsages.filter((usage) =>
        records.some((record) => record.ID === numberOf(usage.creative_reference_id)),
      ).length
      return { ...kind, records, locked, used }
    })
  }, [data.creativeReferenceUsages, derived.sharedReferences])

  const actions = useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = []

    for (const asset of derived.missingAssets.slice(0, 3)) {
      items.push({
        key: `asset:${asset.ID}`,
        title: titleOf(asset, `素材需求缺口 #${asset.ID}`),
        detail: textOf(asset.description, '会影响后续关键帧或视频生成'),
        href: '/workbench/assets',
        priority: ['critical', 'high'].includes(String(asset.priority ?? '')) ? 'high' : 'medium',
      })
    }

    for (const task of data.workItems.filter((item) => ['blocked', 'review'].includes(String(item.status ?? ''))).slice(0, 3)) {
      items.push({
        key: `task:${task.ID}`,
        title: titleOf(task, `任务 #${task.ID}`),
        detail: textOf(task.description, statusLabel(task.status)),
        href: '/collaboration',
        priority: String(task.status ?? '') === 'blocked' ? 'high' : 'medium',
      })
    }

    if (derived.sharedReferences.length === 0) {
      items.push({
        key: 'references',
        title: '建立项目共享设定库',
        detail: '人物、场景、道具和风格应先沉淀到项目级',
        href: '/creative-references',
        priority: 'high',
      })
    }

    if (data.productions.length === 0) {
      items.push({
        key: 'production',
        title: '创建第一条制作线',
        detail: '制作线引用项目共享设定资料，不重复创建人物和场景',
        href: '/production',
        priority: derived.sharedReferences.length > 0 ? 'medium' : 'low',
      })
    }

    if (items.length > 0) return items.slice(0, 6)
    return [
      {
        key: 'next-preview',
        title: '检查制作预演',
        detail: '项目共享设定资料已具备，可以推进制作预演',
        href: '/workbench/production-plan',
        priority: 'low',
      },
    ]
  }, [data.productions.length, data.workItems, derived.missingAssets, derived.sharedReferences.length])

  const productionRows = useMemo(() => {
    return data.productions.map((production) => {
      const id = production.ID
      const assets = data.assetSlots.filter((item) => numberOf(item.production_id) === id)
      const missing = assets.filter((item) => String(item.status ?? '') === 'missing').length
      const contents = data.contentUnits.filter((item) => numberOf(item.production_id) === id)
      const keyframes = data.keyframes.filter((item) => numberOf(item.production_id) === id)
      const deliveries = data.deliveryVersions.filter((item) => numberOf(item.production_id) === id)
      const computedProgress = numberOf(production.progress) || percentage(
        statusCount(contents, ['confirmed', 'in_production', 'locked']) + statusCount(keyframes, ['accepted', 'attached']),
        contents.length + keyframes.length,
      )
      return { production, assets, missing, contents, keyframes, deliveries, progress: computedProgress }
    })
  }, [data.assetSlots, data.contentUnits, data.deliveryVersions, data.keyframes, data.productions])

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 p-5">
        <header className="grid gap-4 border-b border-border pb-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Layers3 size={14} />
              <span>{project?.name ?? '当前项目'}</span>
              <ChevronRight size={13} />
              <span>项目编排</span>
              <Badge variant={derived.missingAssets.length > 0 ? 'warning' : 'success'}>
                {derived.missingAssets.length > 0 ? `${derived.missingAssets.length} 个素材需求缺口` : '共享素材需求已就绪'}
              </Badge>
              {isFetching ? <Badge variant="outline">同步中</Badge> : null}
            </div>
            <h1 className="mt-2 truncate text-2xl font-semibold tracking-normal text-foreground">项目编排</h1>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">
              这里统一组织项目级人物、场景、道具、风格、素材需求和多条制作线。制作页面只处理某一次具体制作，项目编排负责共享资产和跨制作缺口。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="gap-2">
              <Link to="/creative-references">
                <Sparkles size={15} />
                设定资料
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/asset-slots">
                <PackageCheck size={15} />
                素材需求
              </Link>
            </Button>
            <Button asChild className="gap-2">
              <Link to="/production">
                制作线 <ArrowRight size={15} />
              </Link>
            </Button>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
          <StatCard title="共享设定" value={derived.sharedReferences.length} detail={`${derived.lockedReferences} 个已确认或锁定`} icon={Sparkles} />
          <StatCard title="共享素材需求" value={derived.sharedAssetSlots.length} detail={`${derived.lockedAssets} 个素材资源已锁定`} icon={PackageCheck} />
          <StatCard title="制作线" value={data.productions.length} detail={`${derived.activeProductions.length} 条仍在推进`} icon={Route} />
          <StatCard title="可生产内容" value={derived.confirmedContent + derived.acceptedKeyframes} detail={`${data.contentUnits.length} 个制作项，${data.keyframes.length} 个关键帧`} icon={Wand2} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)_380px]">
          <Card className="rounded-lg border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">项目共享库</h2>
                <p className="mt-1 text-sm text-muted-foreground">人物、场景、道具和风格在这里复用。</p>
              </div>
              <Badge variant={derived.referenceReadiness >= 70 ? 'success' : 'secondary'}>{derived.referenceReadiness}%</Badge>
            </div>
            <div className="space-y-2">
              {referenceGroups.map((group) => {
                const Icon = group.icon
                return (
                  <Link
                    key={group.key}
                    to="/creative-references"
                    className="block rounded-md border border-border bg-background px-3 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Icon size={15} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">{group.label}</p>
                          <span className="text-sm font-semibold tabular-nums text-foreground">{group.records.length}</span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {group.locked} 个确认，{group.used} 次被制作对象引用
                        </p>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </Card>

          <div className="flex min-w-0 flex-col gap-5">
            <Card className="rounded-lg border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">制作线总览</h2>
                  <p className="mt-1 text-sm text-muted-foreground">每条制作线使用项目共享库，不把人物、场景和素材重复建一份。</p>
                </div>
                <Button asChild size="sm" variant="outline" className="gap-2">
                  <Link to="/production-orchestrate">
                    <Route size={14} />
                    制作编排
                  </Link>
                </Button>
              </div>

              <div className="space-y-2">
                {productionRows.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border bg-background p-6 text-center">
                    <p className="text-sm font-medium text-foreground">还没有制作线</p>
                    <p className="mt-1 text-sm text-muted-foreground">先沉淀共享设定，再创建具体制作线。</p>
                    <Button asChild size="sm" className="mt-4">
                      <Link to="/production">创建制作线</Link>
                    </Button>
                  </div>
                ) : productionRows.map((row) => (
                  <Link
                    key={row.production.ID}
                    to="/production"
                    className="block rounded-md border border-border bg-background px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Film size={17} />
                      </span>
                      <div className="min-w-[180px] flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">{titleOf(row.production, `制作 #${row.production.ID}`)}</p>
                          <Badge variant={statusVariant(row.production.status)}>{statusLabel(row.production.status)}</Badge>
                        </div>
                        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                          {textOf(row.production.description, '暂无制作说明')}
                        </p>
                      </div>
                      <div className="grid min-w-[310px] flex-1 grid-cols-4 gap-2 text-center text-xs">
                        <div className="rounded-md bg-muted/40 px-2 py-2">
                          <p className="font-semibold tabular-nums text-foreground">{row.assets.length}</p>
                          <p className="mt-0.5 text-muted-foreground">素材</p>
                        </div>
                        <div className="rounded-md bg-muted/40 px-2 py-2">
                          <p className="font-semibold tabular-nums text-foreground">{row.missing}</p>
                          <p className="mt-0.5 text-muted-foreground">缺口</p>
                        </div>
                        <div className="rounded-md bg-muted/40 px-2 py-2">
                          <p className="font-semibold tabular-nums text-foreground">{row.contents.length}</p>
                          <p className="mt-0.5 text-muted-foreground">制作项</p>
                        </div>
                        <div className="rounded-md bg-muted/40 px-2 py-2">
                          <p className="font-semibold tabular-nums text-foreground">{row.deliveries.length}</p>
                          <p className="mt-0.5 text-muted-foreground">交付</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <Progress value={row.progress} className="h-1.5" />
                      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{row.progress}%</span>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>

            <Card className="rounded-lg border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">共享资产矩阵</h2>
                  <p className="mt-1 text-sm text-muted-foreground">区分项目级素材需求和制作专属素材需求。</p>
                </div>
                <Badge variant={derived.assetReadiness >= 70 ? 'success' : derived.missingAssets.length > 0 ? 'warning' : 'secondary'}>
                  {derived.assetReadiness}%
                </Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md border border-border bg-background p-4">
                  <Image size={16} className="text-muted-foreground" />
                  <p className="mt-3 text-xl font-semibold tabular-nums text-foreground">{derived.sharedAssetSlots.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">项目级素材需求</p>
                </div>
                <div className="rounded-md border border-border bg-background p-4">
                  <Boxes size={16} className="text-muted-foreground" />
                  <p className="mt-3 text-xl font-semibold tabular-nums text-foreground">{derived.productionAssetSlots.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">制作专属素材需求</p>
                </div>
                <div className="rounded-md border border-border bg-background p-4">
                  <CheckCircle2 size={16} className="text-muted-foreground" />
                  <p className="mt-3 text-xl font-semibold tabular-nums text-foreground">{data.assetSlotCandidates.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">候选素材</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <Card className="rounded-lg border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">下一步队列</h2>
                  <p className="mt-1 text-sm text-muted-foreground">优先展示跨制作会阻塞的问题。</p>
                </div>
                <Radar size={17} className="text-muted-foreground" />
              </div>
              <div className="space-y-2">
                {actions.map((item) => <ActionRow key={item.key} item={item} />)}
              </div>
            </Card>

            <Card className="rounded-lg border-border bg-card p-5 shadow-sm">
              <h2 className="text-base font-semibold text-foreground">项目闭环</h2>
              <p className="mt-1 text-sm text-muted-foreground">共享事实、制作执行和交付状态分开看。</p>
              <div className="mt-5 space-y-4">
                {[
                  { label: '设定资料约束', value: derived.referenceReadiness, icon: Sparkles },
                  { label: '素材准备', value: derived.assetReadiness, icon: PackageCheck },
                  { label: '内容制作', value: derived.contentReadiness, icon: Wand2 },
                  { label: '交付放行', value: derived.deliveryReadiness, icon: Video },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.label}>
                      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <Icon size={13} />
                          {item.label}
                        </span>
                        <span className="font-medium tabular-nums text-foreground">{item.value}%</span>
                      </div>
                      <Progress value={item.value} className="h-1.5" />
                    </div>
                  )
                })}
              </div>
              <div className="mt-5 rounded-md bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">综合就绪度</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{derived.workspaceReadiness}%</p>
              </div>
            </Card>
          </div>
        </section>
      </div>
    </div>
  )
}
