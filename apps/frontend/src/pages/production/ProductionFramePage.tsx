import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  Clock3,
  FileText,
  Film,
  GitBranch,
  Layers3,
  ListChecks,
  PackageCheck,
  Play,
  Plus,
  Route,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Video,
  Wand2,
} from 'lucide-react'

import { listV2Entities, v2EntityConfig, type V2EntityRecord } from '@/api/v2Entities'
import { V2EntityCrudDialog } from '@/components/shared/V2EntityCrudDialog'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { Badge, Button, Progress } from '@movscript/ui'

type ProductionStatus = 'planning' | 'previewing' | 'materializing' | 'producing' | 'reviewing' | 'delivered'
type UnitStatus = 'done' | 'active' | 'waiting' | 'blocked'

interface ProductionArea {
  key: string
  title: string
  description: string
  icon: LucideIcon
  count: number
  progress: number
  status: UnitStatus
  href: string
}

interface ProductionUnit {
  id: string
  title: string
  summary: string
  timeRange: string
  duration: number
  status: UnitStatus
  assets: string
  content: string
}

interface ProductionRecord {
  dbId: number
  id: string
  name: string
  status: ProductionStatus
  source: string
  owner: string
  progress: number
  updatedAt: string
  description: string
  preview: {
    title: string
    status: UnitStatus
    progress: number
    savedAt: string
    confirmedAt?: string
  }
  stats: {
    structures: number
    sceneMoments: number
    references: number
    assets: number
    contents: number
    finals: number
  }
  areas: ProductionArea[]
  units: ProductionUnit[]
  blockers: string[]
  nextActions: string[]
}

type ProductionBackendRecord = V2EntityRecord & {
  script_version_id?: number
  preview_timeline_id?: number
  name?: string
  description?: string
  status?: string
  source_type?: string
  owner_label?: string
  progress?: number
}

type ProductionData = {
  productions: ProductionBackendRecord[]
  contentUnits: V2EntityRecord[]
  assetSlots: V2EntityRecord[]
  keyframes: V2EntityRecord[]
  previewTimelines: V2EntityRecord[]
  deliveryVersions: V2EntityRecord[]
}

const statusMeta: Record<ProductionStatus, { label: string; badge: string; dot: string }> = {
  planning: { label: '筹备中', badge: 'bg-slate-500/10 text-slate-700 dark:text-slate-300', dot: 'bg-slate-500' },
  previewing: { label: '预演中', badge: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300', dot: 'bg-cyan-500' },
  materializing: { label: '资料推演', badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  producing: { label: '制作中', badge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300', dot: 'bg-indigo-500' },
  reviewing: { label: '审片中', badge: 'bg-rose-500/10 text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' },
  delivered: { label: '已成片', badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
}

const unitMeta: Record<UnitStatus, { label: string; badge: string; dot: string }> = {
  done: { label: '已完成', badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  active: { label: '进行中', badge: 'bg-blue-500/10 text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  waiting: { label: '待处理', badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  blocked: { label: '阻塞', badge: 'bg-rose-500/10 text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' },
}

export default function ProductionFramePage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const [selectedId, setSelectedId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const productionQueryKey = ['production-frame-v2', projectId] as const
  const { data: productionData } = useQuery<ProductionData>({
    queryKey: productionQueryKey,
    queryFn: () => loadProductionData(projectId!),
    enabled: !!projectId,
    refetchInterval: 60_000,
  })

  const productions = useMemo(() => buildProductionRecords(productionData), [productionData])
  const selected = productions.find((item) => item.id === selectedId) ?? productions[0]

  useEffect(() => {
    if (selectedId && !productions.some((item) => item.id === selectedId)) setSelectedId('')
  }, [productions, selectedId])

  const aggregate = useMemo(() => {
    const active = productions.filter((item) => item.status !== 'delivered').length
    const delivered = productions.filter((item) => item.status === 'delivered').length
    const blocked = productions.filter((item) => item.blockers.length > 0).length
    const avg = productions.length ? Math.round(productions.reduce((sum, item) => sum + item.progress, 0) / productions.length) : 0
    return { active, delivered, blocked, avg }
  }, [productions])

  return (
    <div className="h-full overflow-hidden bg-background">
      <div className="flex h-full min-w-[1200px] flex-col">
        <header className="border-b border-border bg-card px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Boxes size={14} />
                <span>{project?.name ?? '当前项目'}</span>
                <ChevronRight size={13} />
                <span>制作</span>
                <Badge variant="outline">Production</Badge>
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">制作</h1>
              <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">
                一个项目可以包含多个制作。每个制作承载一次从剧本到成片的完整创作单元，并统一挂载预演进度、制作结构、情节、创作资料、素材需求、内容和成片。
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" className="gap-2" asChild>
                <Link to="/preview-progress">
                  <ListChecks size={15} />
                  预演进度
                </Link>
              </Button>
              <Button variant="outline" className="gap-2" asChild>
                <Link to="/project-preview">
                  <Route size={15} />
                  制作编排
                </Link>
              </Button>
              <Button variant="outline" className="gap-2" asChild>
                <Link to="/project-preview">
                  <Plus size={15} />
                  从剧本创建制作
                </Link>
              </Button>
              <Button className="gap-2" onClick={() => setCreateOpen(true)}>
                <Plus size={15} />
                直接创建制作
              </Button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Boxes size={16} className="text-muted-foreground" />
                    <h2 className="text-sm font-semibold text-foreground">制作</h2>
                  </div>
                  <Badge variant="outline">{productions.length} 个制作</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <Metric label="进行中" value={aggregate.active} />
                  <Metric label="已成片" value={aggregate.delivered} />
                  <Metric label="阻塞制作" value={aggregate.blocked} />
                  <Metric label="平均进度" value={`${aggregate.avg}%`} />
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={16} className="text-muted-foreground" />
                      <h2 className="text-sm font-semibold text-foreground">当前制作预演进度</h2>
                    </div>
                    <p className="mt-2 truncate text-sm font-medium text-foreground">{selected?.name ?? '暂无制作'}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{selected?.source ?? '直接创建或从制作编排生成制作后开始统计'}</p>
                  </div>
                  <Badge variant={!selected || selected.blockers.length > 0 ? 'warning' : 'success'}>
                    {!selected ? '未创建' : selected.blockers.length > 0 ? '有阻塞' : '可推进'}
                  </Badge>
                </div>
                <div className="mt-4 flex items-end gap-3">
                  <p className="text-3xl font-semibold tabular-nums text-foreground">{selected?.progress ?? 0}%</p>
                  <div className="min-w-0 flex-1 pb-2">
                    <Progress value={selected?.progress ?? 0} className="h-2" />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border border-border bg-background p-2">
                    <p className="text-muted-foreground">预演</p>
                    <p className="mt-1 font-medium text-foreground">{selected ? unitMeta[selected.preview.status].label : '待处理'}</p>
                  </div>
                  <div className="rounded-md border border-border bg-background p-2">
                    <p className="text-muted-foreground">成片</p>
                    <p className="mt-1 font-medium text-foreground">{selected?.stats.finals ?? 0} 版</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Clapperboard size={16} className="text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">项目制作</h2>
                </div>
                <Badge variant="outline">{productions.length}</Badge>
              </div>
              <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
                {productions.length > 0 ? productions.map((production) => (
                  <ProductionListCard
                    key={production.id}
                    production={production}
                    active={production.id === selected.id}
                    onSelect={() => setSelectedId(production.id)}
                  />
                )) : (
                  <div className="col-span-full rounded-md border border-dashed border-border bg-background p-8 text-center">
                    <p className="text-sm font-medium text-foreground">暂无制作</p>
                    <p className="mt-1 text-xs text-muted-foreground">可以直接裸创建制作，也可以先完成制作编排后再从剧本创建。</p>
                    <Button className="mt-4 gap-2" onClick={() => setCreateOpen(true)}>
                      <Plus size={15} />
                      直接创建制作
                    </Button>
                  </div>
                )}
              </div>
            </section>

            {selected ? <main className="min-w-0">
              <div className="space-y-4">
              <section className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className={cn('text-[11px]', statusMeta[selected.status].badge)}>
                        {statusMeta[selected.status].label}
                      </Badge>
                      <Badge variant="outline">{selected.id}</Badge>
                      <Badge variant="secondary">来源：{selected.source}</Badge>
                    </div>
                    <h2 className="mt-3 text-xl font-semibold text-foreground">{selected.name}</h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{selected.description}</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-6">
                  <StatCard icon={GitBranch} label="结构" value={selected.stats.structures} />
                  <StatCard icon={Route} label="情节" value={selected.stats.sceneMoments} />
                  <StatCard icon={Sparkles} label="资料" value={selected.stats.references} />
                  <StatCard icon={PackageCheck} label="素材" value={selected.stats.assets} />
                  <StatCard icon={Film} label="内容" value={selected.stats.contents} />
                  <StatCard icon={Video} label="成片" value={selected.stats.finals} />
                </div>
              </section>

              <section className="rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-foreground">制作结构</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">制作是核心主体，其他对象围绕它建立关联和推演关系。</p>
                  </div>
                  <Badge variant="outline">核心关系</Badge>
                </div>
                <div className="grid gap-3 p-4 md:grid-cols-5">
                  {[
                    { icon: FileText, title: '剧本', detail: '创建来源', value: selected.source },
                    { icon: Layers3, title: '结构', detail: '片段 / 分镜行', value: `${selected.stats.structures} 项` },
                    { icon: Route, title: '情节', detail: '时间地点条件', value: `${selected.stats.sceneMoments} 项` },
                    { icon: PackageCheck, title: '素材', detail: '推演出的需求', value: `${selected.stats.assets} 项` },
                    { icon: Video, title: '成片', detail: '交付输出', value: `${selected.stats.finals} 版` },
                  ].map((item, index) => {
                    const Icon = item.icon
                    return (
                      <div key={item.title} className="relative rounded-md border border-border bg-background p-3">
                        {index < 4 ? <ArrowRight className="absolute -right-5 top-1/2 hidden -translate-y-1/2 text-muted-foreground md:block" size={16} /> : null}
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <Icon size={15} />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{item.detail}</p>
                          </div>
                        </div>
                        <p className="mt-3 truncate text-xs font-medium text-foreground">{item.value}</p>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-foreground">推演对象</h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">从制作结构推导出情节、资料、素材、内容与成片。</p>
                    </div>
                  </div>
                  <div className="grid gap-3 p-4 md:grid-cols-2">
                    {selected.areas.map((area) => (
                      <AreaCard key={area.key} area={area} />
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ListChecks size={15} className="text-muted-foreground" />
                      <h2 className="text-sm font-semibold text-foreground">挂载预演</h2>
                    </div>
                    <UnitStatusBadge status={selected.preview.status} />
                  </div>
                  <div className="p-4">
                    <p className="text-sm font-medium text-foreground">{selected.preview.title}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      预演进度挂在制作下面，作为进入素材推演、内容生产和成片门禁的来源。
                    </p>
                    <Progress value={selected.preview.progress} className="mt-4 h-2" />
                    <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                      <p>最近保存：{selected.preview.savedAt ? formatDateTime(selected.preview.savedAt) : '暂无'}</p>
                      <p>确认时间：{selected.preview.confirmedAt ? formatDateTime(selected.preview.confirmedAt) : '暂无'}</p>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" className="gap-2" asChild>
                        <Link to="/workbench/production-plan">
                          <Play size={14} />
                          项目预演
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2" asChild>
                        <Link to="/preview-progress">
                          <ListChecks size={14} />
                          进度
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ScrollText size={15} className="text-muted-foreground" />
                    <h2 className="text-sm font-semibold text-foreground">内容单元</h2>
                  </div>
                  <p className="text-xs text-muted-foreground">预演确认后转为制作下的正式内容结构</p>
                </div>
                <div className="divide-y divide-border">
                  {selected.units.map((unit) => (
                    <ProductionUnitRow key={unit.id} unit={unit} />
                  ))}
                </div>
              </section>
              </div>
            </main> : null}

            {selected ? <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_220px]">
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">预演门禁</h2>
                </div>
                <Badge variant={selected.blockers.length > 0 ? 'warning' : 'success'}>
                  {selected.blockers.length > 0 ? '有阻塞' : '可推进'}
                </Badge>
              </div>
              <div className="mt-4 space-y-2">
                {selected.blockers.length > 0 ? selected.blockers.map((item) => (
                  <GateRow key={item} icon={AlertTriangle} text={item} tone="blocked" />
                )) : (
                  <GateRow icon={CheckCircle2} text="预演、结构和资料状态允许继续推进。" tone="ready" />
                )}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <Wand2 size={15} className="text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">下一步</h2>
              </div>
              <div className="space-y-2 p-4">
                {selected.nextActions.map((item, index) => (
                  <div key={item} className="flex gap-3 rounded-md border border-border bg-background p-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                    <p className="text-sm leading-5 text-foreground">{item}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <Clock3 size={15} className="text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">最近动态</h2>
              </div>
              <div className="space-y-3 p-4">
                {[
                  ['预演', selected.preview.status === 'done' ? '预演已确认，可作为制作输入。' : '预演仍需确认后才能稳定推演。'],
                  ['结构', `${selected.stats.structures} 个结构对象已挂在制作下。`],
                  ['素材', `${selected.stats.assets} 个素材需求等待候选或锁定。`],
                  ['成片', selected.stats.finals > 0 ? '已有成片版本进入交付检查。' : '尚未生成成片版本。'],
                ].map(([label, text]) => (
                  <div key={label} className="flex gap-3">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">{label}</p>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="gap-2" asChild>
                <Link to="/assets">
                  <PackageCheck size={15} />
                  素材
                </Link>
              </Button>
              <Button variant="outline" className="gap-2" asChild>
                <Link to="/final-videos">
                  <Video size={15} />
                  成片
                </Link>
              </Button>
            </div>
            </section> : null}
          </div>
        </div>
      </div>
      <V2EntityCrudDialog
        open={createOpen}
        mode="create"
        projectId={projectId}
        config={v2EntityConfig('productions')}
        defaults={{ source_type: 'direct', status: 'planning', owner_label: '导演组', progress: 0 }}
        queryKey={productionQueryKey}
        title="直接创建制作"
        onOpenChange={setCreateOpen}
        onSaved={(record) => setSelectedId(`PRD-${record.ID}`)}
      />
    </div>
  )
}

function ProductionListCard({ production, active, onSelect }: { production: ProductionRecord; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-colors',
        active ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/50',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('h-2.5 w-2.5 rounded-full', statusMeta[production.status].dot)} />
            <p className="truncate text-sm font-semibold text-foreground">{production.name}</p>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{production.source}</p>
        </div>
        <Badge variant="secondary" className={cn('text-[10px]', statusMeta[production.status].badge)}>
          {statusMeta[production.status].label}
        </Badge>
      </div>
      <p className="mt-3 line-clamp-2 text-xs leading-5 text-muted-foreground">{production.description}</p>
      <div className="mt-3 flex items-center gap-2">
        <Progress value={production.progress} className="h-1.5 flex-1" />
        <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{production.progress}%</span>
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{production.owner}</span>
        <span>{production.updatedAt}</span>
      </div>
    </button>
  )
}

function AreaCard({ area }: { area: ProductionArea }) {
  const Icon = area.icon
  return (
    <Link to={area.href} className="rounded-md border border-border bg-background p-3 transition-colors hover:bg-muted/40">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon size={15} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{area.title}</p>
            <p className="truncate text-xs text-muted-foreground">{area.description}</p>
          </div>
        </div>
        <UnitStatusBadge status={area.status} />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <p className="w-12 shrink-0 text-lg font-semibold tabular-nums text-foreground">{area.count}</p>
        <Progress value={area.progress} className="h-1.5 flex-1" />
      </div>
    </Link>
  )
}

function ProductionUnitRow({ unit }: { unit: ProductionUnit }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)_140px_140px_100px] items-center gap-3 px-4 py-3">
      <div>
        <p className="font-mono text-xs text-muted-foreground">{unit.id}</p>
        <p className="mt-1 text-xs text-muted-foreground">{unit.timeRange}</p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{unit.title}</p>
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{unit.summary}</p>
      </div>
      <p className="truncate text-xs text-muted-foreground">{unit.assets}</p>
      <p className="truncate text-xs text-muted-foreground">{unit.content}</p>
      <UnitStatusBadge status={unit.status} />
    </div>
  )
}

function UnitStatusBadge({ status }: { status: UnitStatus }) {
  return (
    <Badge variant="secondary" className={cn('shrink-0 text-[10px]', unitMeta[status].badge)}>
      {unitMeta[status].label}
    </Badge>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon size={14} />
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}

function GateRow({ icon: Icon, text, tone }: { icon: LucideIcon; text: string; tone: 'ready' | 'blocked' }) {
  return (
    <div className="flex gap-2 rounded-md border border-border bg-background p-3">
      <Icon size={15} className={cn('mt-0.5 shrink-0', tone === 'ready' ? 'text-emerald-600' : 'text-amber-600')} />
      <p className="text-sm leading-5 text-foreground">{text}</p>
    </div>
  )
}

function buildProductionRecords(data?: GetLatestProjectPreviewDraftResponse): ProductionRecord[] {
  const draft = data?.found ? data.draft : undefined
  const storyboardRows = draft?.draft.storyboard_rows ?? []
  const assetGaps = draft?.draft.preview_candidates?.asset_gaps ?? []
  const previewConfirmed = draft?.draft.preview_status === 'ready_for_production'
  const units = storyboardRows.length > 0 ? mapDraftRowsToUnits(storyboardRows, assetGaps) : fallbackUnits
  const blockedUnits = units.filter((unit) => unit.status === 'blocked').length
  const activeUnits = units.filter((unit) => unit.status === 'active').length
  const doneUnits = units.filter((unit) => unit.status === 'done').length
  const unitProgress = Math.round((doneUnits / Math.max(units.length, 1)) * 100)
  const previewProgress = previewConfirmed ? 100 : data?.found ? 72 : 0
  const sourceTitle = draft?.draft.script_version.title || '最近制作预演'

  const current: ProductionRecord = {
    id: 'PRD-001',
    name: sourceTitle,
    status: previewConfirmed ? (blockedUnits > 0 ? 'materializing' : 'producing') : 'previewing',
    source: draft?.draft.script_version.title || '制作预演草稿',
    owner: '导演组',
    progress: Math.round((previewProgress * 0.35) + (unitProgress * 0.4) + (blockedUnits > 0 ? 5 : 20)),
    updatedAt: draft?.saved_at ? formatShortDate(draft.saved_at) : '刚刚',
    description: '从最近一次制作预演创建的制作，用于承载结构、资料、素材需求、内容候选和成片版本。',
    preview: {
      title: sourceTitle,
      status: previewConfirmed ? 'done' : data?.found ? 'active' : 'waiting',
      progress: previewProgress,
      savedAt: draft?.saved_at ?? '',
      confirmedAt: draft?.draft.confirmed_at ?? '',
    },
    stats: {
      structures: Math.max(storyboardRows.length, units.length),
      sceneMoments: Math.max(Math.ceil(units.length * 0.75), 1),
      references: Math.max(4, units.length + 2),
      assets: Math.max(assetGaps.length, units.length + blockedUnits),
      contents: units.length,
      finals: previewConfirmed && blockedUnits === 0 ? 1 : 0,
    },
    areas: buildAreas({
      previewProgress,
      structureCount: Math.max(storyboardRows.length, units.length),
      sceneMomentCount: Math.max(Math.ceil(units.length * 0.75), 1),
      referenceCount: Math.max(4, units.length + 2),
      assetCount: Math.max(assetGaps.length, units.length + blockedUnits),
      contentCount: units.length,
      finalCount: previewConfirmed && blockedUnits === 0 ? 1 : 0,
      blockedUnits,
      activeUnits,
      previewConfirmed,
    }),
    units,
    blockers: [
      ...(previewConfirmed ? [] : ['预演尚未确认，不能稳定进入正式制作。']),
      ...(blockedUnits > 0 ? [`${blockedUnits} 个内容单元仍有素材或资料缺口。`] : []),
    ],
    nextActions: previewConfirmed
      ? blockedUnits > 0
        ? ['先补齐阻塞内容单元的素材需求。', '锁定关键创作资料和资料状态。', '再进入内容候选生成与选片。']
        : ['生成正式内容候选。', '选择可进入成片时间线的版本。', '创建第一版成片并进入交付检查。']
      : ['回到制作预演确认结构、关键帧和素材缺口。', '确认后把预演进度挂载到当前制作。', '再推演素材需求和内容单元。'],
  }

  return [current, ...fallbackProductions]
}

function buildAreas(input: {
  previewProgress: number
  structureCount: number
  sceneMomentCount: number
  referenceCount: number
  assetCount: number
  contentCount: number
  finalCount: number
  blockedUnits: number
  activeUnits: number
  previewConfirmed: boolean
}): ProductionArea[] {
  return [
    {
      key: 'structure',
      title: '制作结构',
      description: '片段、分镜行、内容单元骨架',
      icon: GitBranch,
      count: input.structureCount,
      progress: input.previewProgress,
      status: input.previewConfirmed ? 'done' : 'active',
      href: '/v2-entities',
    },
    {
      key: 'sceneMoments',
      title: '情节',
      description: '时间、地点、条件和动作',
      icon: Route,
      count: input.sceneMomentCount,
      progress: input.previewConfirmed ? 82 : 48,
      status: input.previewConfirmed ? 'active' : 'waiting',
      href: '/scene-moments',
    },
    {
      key: 'references',
      title: '创作资料',
      description: '人物、场景、道具、风格规则',
      icon: Sparkles,
      count: input.referenceCount,
      progress: input.previewConfirmed ? 76 : 42,
      status: input.previewConfirmed ? 'active' : 'waiting',
      href: '/creative-references',
    },
    {
      key: 'assets',
      title: '素材需求',
      description: '从结构和资料推演出的素材位',
      icon: PackageCheck,
      count: input.assetCount,
      progress: input.blockedUnits > 0 ? 38 : input.previewConfirmed ? 68 : 20,
      status: input.blockedUnits > 0 ? 'blocked' : input.previewConfirmed ? 'active' : 'waiting',
      href: '/assets',
    },
    {
      key: 'content',
      title: '内容',
      description: '正式候选、返工、锁定片段',
      icon: Film,
      count: input.contentCount,
      progress: input.activeUnits > 0 ? 44 : input.previewConfirmed ? 30 : 0,
      status: input.previewConfirmed ? 'active' : 'waiting',
      href: '/workbench/production',
    },
    {
      key: 'final',
      title: '成片',
      description: '时间线、版本和交付输出',
      icon: Video,
      count: input.finalCount,
      progress: input.finalCount > 0 ? 72 : 0,
      status: input.finalCount > 0 ? 'active' : 'waiting',
      href: '/final-videos',
    },
  ]
}

function mapDraftRowsToUnits(rows: ProjectPreviewStoryboardRow[], assetGaps: Array<{ storyboard_row_client_id: string; name: string; status: string }>): ProductionUnit[] {
  let cursor = 0
  return rows.map((row, index) => {
    const start = cursor
    const end = cursor + row.duration_seconds
    cursor = end
    const gaps = assetGaps.filter((gap) => gap.storyboard_row_client_id === row.client_id)
    const blocked = gaps.some((gap) => gap.status === 'missing' || gap.status === 'accepted')
    const status: UnitStatus = blocked ? 'blocked' : index === 0 ? 'active' : index < 3 ? 'waiting' : 'done'
    return {
      id: `CU-${String(index + 1).padStart(3, '0')}`,
      title: row.title || `内容单元 ${index + 1}`,
      summary: row.body || '从预演分镜继承的内容单元。',
      timeRange: `${formatTime(start)}-${formatTime(end)}`,
      duration: row.duration_seconds,
      status,
      assets: blocked ? `${gaps.length} 个缺口` : '素材可推演',
      content: status === 'done' ? '已有锁定版本' : status === 'active' ? '候选生成中' : '待生成',
    }
  })
}

const fallbackUnits: ProductionUnit[] = [
  {
    id: 'CU-001',
    title: '雨夜巷口对峙',
    summary: '林夏攥着湿透旧伞，与顾言保持距离，纸条线索即将暴露。',
    timeRange: '00:00-00:08',
    duration: 8,
    status: 'done',
    assets: '4/4 已锁定',
    content: '主版本已锁定',
  },
  {
    id: 'CU-002',
    title: '旧伞纸条暴露',
    summary: '伞骨夹层滑出纸条，道具从气氛物转为剧情证据。',
    timeRange: '00:08-00:14',
    duration: 6,
    status: 'blocked',
    assets: '2 个缺口',
    content: '候选需返工',
  },
  {
    id: 'CU-003',
    title: '顾言低声追问',
    summary: '顾言压低声音追问旧伞来历，林夏把纸条攥进掌心。',
    timeRange: '00:14-00:22',
    duration: 8,
    status: 'active',
    assets: '3/3 已就绪',
    content: '待选片',
  },
]

const fallbackProductions: ProductionRecord[] = [
  {
    id: 'PRD-002',
    name: '第二集开场制作',
    status: 'planning',
    source: '第二集剧本 v1',
    owner: '编导组',
    progress: 18,
    updatedAt: '昨天',
    description: '用于展示一个项目可同时拥有多个制作，当前还处于剧本理解和预演准备阶段。',
    preview: { title: '第二集开场预演', status: 'waiting', progress: 12, savedAt: '' },
    stats: { structures: 3, sceneMoments: 2, references: 5, assets: 0, contents: 0, finals: 0 },
    areas: buildAreas({
      previewProgress: 12,
      structureCount: 3,
      sceneMomentCount: 2,
      referenceCount: 5,
      assetCount: 0,
      contentCount: 0,
      finalCount: 0,
      blockedUnits: 0,
      activeUnits: 0,
      previewConfirmed: false,
    }),
    units: [],
    blockers: ['尚未生成可确认的预演。'],
    nextActions: ['完成剧本理解确认。', '生成预演草稿并确认结构。', '从预演推演制作资料和素材需求。'],
  },
  {
    id: 'PRD-003',
    name: '品牌口播 15 秒制作',
    status: 'delivered',
    source: '品牌短片脚本 v3',
    owner: '交付组',
    progress: 100,
    updatedAt: '4 天前',
    description: '已完成的短制作样例，用于体现成片版本仍然归属于制作主体。',
    preview: { title: '品牌口播预演', status: 'done', progress: 100, savedAt: '2026-05-01T10:30:00+08:00', confirmedAt: '2026-05-01T11:20:00+08:00' },
    stats: { structures: 5, sceneMoments: 3, references: 8, assets: 11, contents: 5, finals: 2 },
    areas: [
      { key: 'structure', title: '制作结构', description: '结构已锁定', icon: GitBranch, count: 5, progress: 100, status: 'done', href: '/v2-entities' },
      { key: 'sceneMoments', title: '情节', description: '情节已确认', icon: Route, count: 3, progress: 100, status: 'done', href: '/scene-moments' },
      { key: 'references', title: '创作资料', description: '资料已锁定', icon: Sparkles, count: 8, progress: 100, status: 'done', href: '/creative-references' },
      { key: 'assets', title: '素材需求', description: '素材已采用', icon: PackageCheck, count: 11, progress: 100, status: 'done', href: '/assets' },
      { key: 'content', title: '内容', description: '内容已锁定', icon: Film, count: 5, progress: 100, status: 'done', href: '/workbench/production' },
      { key: 'final', title: '成片', description: '版本已交付', icon: Video, count: 2, progress: 100, status: 'done', href: '/final-videos' },
    ],
    units: [
      { id: 'CU-001', title: '产品亮相', summary: '产品与品牌主视觉入场。', timeRange: '00:00-00:04', duration: 4, status: 'done', assets: '已采用', content: '已锁定' },
      { id: 'CU-002', title: '利益点展示', summary: '强调核心卖点并配合口播。', timeRange: '00:04-00:11', duration: 7, status: 'done', assets: '已采用', content: '已锁定' },
      { id: 'CU-003', title: '收束 CTA', summary: '品牌口号与行动引导。', timeRange: '00:11-00:15', duration: 4, status: 'done', assets: '已采用', content: '已锁定' },
    ],
    blockers: [],
    nextActions: ['复核交付文件命名。', '归档成片版本和生成记录。', '同步客户确认记录。'],
  },
]

function formatTime(seconds: number) {
  const minute = Math.floor(seconds / 60)
  const second = seconds % 60
  return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
}

function formatShortDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
