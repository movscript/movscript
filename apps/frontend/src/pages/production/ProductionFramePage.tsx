import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  Boxes,
  ChevronRight,
  Clapperboard,
  Clock3,
  Film,
  GitBranch,
  ListChecks,
  PackageCheck,
  Play,
  Plus,
  Route,
  ScrollText,
  Sparkles,
  Video,
  Wand2,
} from 'lucide-react'

import { listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/api/semanticEntities'
import { SemanticEntityCrudDialog } from '@/components/shared/SemanticEntityCrudDialog'
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
    segments: number
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

type ProductionBackendRecord = SemanticEntityRecord & {
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
  segments: SemanticEntityRecord[]
  sceneMoments: SemanticEntityRecord[]
  creativeReferences: SemanticEntityRecord[]
  creativeReferenceUsages: SemanticEntityRecord[]
  contentUnits: SemanticEntityRecord[]
  assetSlots: SemanticEntityRecord[]
  keyframes: SemanticEntityRecord[]
  previewTimelines: SemanticEntityRecord[]
  deliveryVersions: SemanticEntityRecord[]
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
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const projectId = project?.ID
  const [selectedId, setSelectedId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const productionQueryKey = ['production-frame', projectId] as const
  const { data: productionData } = useQuery<ProductionData>({
    queryKey: productionQueryKey,
    queryFn: () => loadProductionData(projectId!),
    enabled: !!projectId,
    refetchInterval: 60_000,
  })

  const productions = useMemo(() => buildProductionRecords(productionData), [productionData])
  const routeProductionId = Number(searchParams.get('productionId'))
  const routeSelected = routeProductionId ? productions.find((item) => item.dbId === routeProductionId) : undefined
  const explicitSelected = routeSelected ?? productions.find((item) => item.id === selectedId)
  const selected = explicitSelected ?? productions[0]
  const selectedProductionId = selected?.dbId

  useEffect(() => {
    if (selectedId && !productions.some((item) => item.id === selectedId)) setSelectedId('')
  }, [productions, selectedId])

  useEffect(() => {
    const productionId = Number(searchParams.get('productionId'))
    if (!productionId || productions.length === 0) return
    const production = productions.find((item) => item.dbId === productionId)
    if (production) setSelectedId(production.id)
  }, [productions, searchParams])

  useEffect(() => {
    if (!selectedProductionId || !explicitSelected) return
    const current = Number(searchParams.get('productionId'))
    if (current === selectedProductionId) return
    const next = new URLSearchParams(searchParams)
    next.set('productionId', String(selectedProductionId))
    next.delete('created')
    setSearchParams(next, { replace: true })
  }, [explicitSelected, searchParams, selectedProductionId, setSearchParams])

  const aggregate = useMemo(() => {
    const active = productions.filter((item) => item.status !== 'delivered').length
    const delivered = productions.filter((item) => item.status === 'delivered').length
    const blocked = productions.filter((item) => item.blockers.length > 0).length
    const avg = productions.length ? Math.round(productions.reduce((sum, item) => sum + item.progress, 0) / productions.length) : 0
    return { active, delivered, blocked, avg }
  }, [productions])

  function selectProduction(production: ProductionRecord) {
    setSelectedId(production.id)
    const next = new URLSearchParams(searchParams)
    next.set('productionId', String(production.dbId))
    next.delete('created')
    setSearchParams(next, { replace: true })
  }

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
                一个项目可以包含多个制作。每个制作承载一次从剧本到成片的完整创作单元，并统一挂载剧本段落、情景、设定资料、素材需求、制作项和成片。
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" className="gap-2" asChild>
                <Link to="/scripts">
                  <Plus size={15} />
                  去剧本创建
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
                      <ListChecks size={16} className="text-muted-foreground" />
                      <h2 className="text-sm font-semibold text-foreground">当前制作预演</h2>
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
                    active={production.id === selected?.id}
                    onSelect={() => selectProduction(production)}
                  />
                )) : (
                  <div className="col-span-full rounded-md border border-dashed border-border bg-background p-8 text-center">
                    <p className="text-sm font-medium text-foreground">暂无制作</p>
                    <p className="mt-1 text-xs text-muted-foreground">可以直接裸创建制作，也可以先完成制作编排后再从剧本创建。</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <Button variant="outline" className="gap-2" asChild>
                        <Link to="/production-orchestrate">
                          <Route size={15} />
                          制作编排
                        </Link>
                      </Button>
                      <Button className="gap-2" onClick={() => setCreateOpen(true)}>
                        <Plus size={15} />
                        直接创建制作
                      </Button>
                    </div>
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
                  <StatCard icon={GitBranch} label="剧本段落" value={selected.stats.segments} />
                  <StatCard icon={Route} label="情景" value={selected.stats.sceneMoments} />
                  <StatCard icon={Sparkles} label="设定资料" value={selected.stats.references} />
                  <StatCard icon={PackageCheck} label="素材需求" value={selected.stats.assets} />
                  <StatCard icon={Film} label="制作项" value={selected.stats.contents} />
                  <StatCard icon={Video} label="成片" value={selected.stats.finals} />
                </div>
              </section>

              <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="rounded-lg border border-border bg-card">
                  <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-foreground">推演对象</h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">从剧本段落推导出情景、设定资料、素材需求、制作项与成片。</p>
                    </div>
                  </div>
                  <div className="grid gap-3 p-4 md:grid-cols-2">
                    {selected.areas.map((area) => (
                      <AreaCard key={area.key} area={area} production={selected} />
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
                      预演挂在制作下面，用于追踪剧本段落、关键帧、素材和内容准备情况。
                    </p>
                    <Progress value={selected.preview.progress} className="mt-4 h-2" />
                    <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                      <p>最近保存：{selected.preview.savedAt ? formatDateTime(selected.preview.savedAt) : '暂无'}</p>
                      <p>确认时间：{selected.preview.confirmedAt ? formatDateTime(selected.preview.confirmedAt) : '暂无'}</p>
                    </div>
                    <div className="mt-4">
                      <Button variant="outline" size="sm" className="gap-2" asChild>
                        <Link to={productionPlaybackHref(selected)}>
                          <Play size={14} />
                          项目预演
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
                    <h2 className="text-sm font-semibold text-foreground">制作项</h2>
                  </div>
                  <p className="text-xs text-muted-foreground">可从预演生成，也可以直接维护制作下的内容结构</p>
                </div>
                <div className="divide-y divide-border">
                  {selected.units.map((unit) => (
                    <ProductionUnitRow key={unit.id} unit={unit} />
                  ))}
                </div>
              </section>
              </div>
            </main> : null}

            {selected ? <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px]">
            <section className="rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <Wand2 size={15} className="text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">下一步</h2>
              </div>
              <div className="space-y-2 p-4">
                {selected.nextActions.map((item, index) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => navigate(productionNextActionHref(item, selected))}
                    className="flex w-full gap-3 rounded-md border border-border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                    <p className="text-sm leading-5 text-foreground">{item}</p>
                  </button>
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
                  ['预演', selected.preview.status === 'done' ? '已有确认记录，可作为制作输入。' : '可继续挂载或更新预演记录。'],
                  ['剧本段落', `${selected.stats.segments} 个剧本段落已挂在制作下。`],
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
                <Link to="/asset-slots">
                  <PackageCheck size={15} />
                  素材
                </Link>
              </Button>
              <Button variant="outline" className="gap-2" asChild>
                <Link to={deliveryWorkbenchHref(selected)}>
                  <Video size={15} />
                  成片
                </Link>
              </Button>
            </div>
            </section> : null}
          </div>
        </div>
      </div>
      <SemanticEntityCrudDialog
        open={createOpen}
        mode="create"
        projectId={projectId}
        config={semanticEntityConfig('productions')}
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
    <article
      className={cn(
        'w-full rounded-lg border p-3 transition-colors',
        active ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-primary/50',
      )}
    >
      <button type="button" onClick={onSelect} className="block w-full text-left">
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
      <div className="mt-3 border-t border-border pt-3">
        <Button size="sm" variant={active ? 'secondary' : 'outline'} className="h-8 w-full gap-2 text-xs" asChild>
          <Link to={`/production-orchestrate?productionId=${production.dbId}`}>
            <Route size={14} />
            制作编排
          </Link>
        </Button>
      </div>
    </article>
  )
}

function AreaCard({ area, production }: { area: ProductionArea; production: ProductionRecord }) {
  const Icon = area.icon
  const href = productionAreaHref(area, production)
  return (
    <Link to={href} className="rounded-md border border-border bg-background p-3 transition-colors hover:bg-muted/40">
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

async function loadProductionData(projectId: number): Promise<ProductionData> {
  const [
    productions,
    segments,
    sceneMoments,
    creativeReferences,
    creativeReferenceUsages,
    contentUnits,
    assetSlots,
    keyframes,
    previewTimelines,
    deliveryVersions,
  ] = await Promise.all([
    listSemanticEntities(projectId, semanticEntityConfig('productions')),
    listSemanticEntities(projectId, semanticEntityConfig('segments')),
    listSemanticEntities(projectId, semanticEntityConfig('sceneMoments')),
    listSemanticEntities(projectId, semanticEntityConfig('creativeReferences')),
    listSemanticEntities(projectId, semanticEntityConfig('creativeReferenceUsages')),
    listSemanticEntities(projectId, semanticEntityConfig('contentUnits')),
    listSemanticEntities(projectId, semanticEntityConfig('assetSlots')),
    listSemanticEntities(projectId, semanticEntityConfig('keyframes')),
    listSemanticEntities(projectId, semanticEntityConfig('previewTimelines')),
    listSemanticEntities(projectId, semanticEntityConfig('deliveryVersions')),
  ])
  return {
    productions: productions as ProductionBackendRecord[],
    segments,
    sceneMoments,
    creativeReferences,
    creativeReferenceUsages,
    contentUnits,
    assetSlots,
    keyframes,
    previewTimelines,
    deliveryVersions,
  }
}

function buildProductionRecords(data?: ProductionData): ProductionRecord[] {
  if (!data?.productions.length) return []
  return data.productions.map((production) => {
    const productionId = production.ID
    const relatedSegmentIds = relatedSegmentIdsForProduction(production, data)
    const relatedSceneMomentIds = relatedSceneMomentIdsForProduction(relatedSegmentIds, productionId, data)
    const relatedContentUnits = contentUnitsForProduction(relatedSegmentIds, relatedSceneMomentIds, productionId, data)
    const relatedContentUnitIds = new Set(relatedContentUnits.map((item) => item.ID))
    const assetSlots = assetSlotsForProduction(relatedSegmentIds, relatedSceneMomentIds, relatedContentUnitIds, productionId, data)
    const keyframes = keyframesForProduction(relatedSceneMomentIds, relatedContentUnitIds, productionId, data)
    const previewTimelines = recordsForProduction(data.previewTimelines, productionId)
    const deliveryVersions = recordsForProduction(data.deliveryVersions, productionId)
    const units = mapContentUnitsToProductionUnits(relatedContentUnits, assetSlots)
    const relatedReferenceIds = relatedReferenceIdsForProduction(relatedSegmentIds, relatedSceneMomentIds, relatedContentUnitIds, assetSlots, data)
    const relatedSegmentCount = relatedSegmentIds.size
    const relatedSceneMomentCount = relatedSceneMomentIds.size
    const relatedReferenceCount = relatedReferenceIds.size
    const blockedUnits = units.filter((unit) => unit.status === 'blocked').length
    const activeUnits = units.filter((unit) => unit.status === 'active').length
    const doneUnits = units.filter((unit) => unit.status === 'done').length
    const unitProgress = Math.round((doneUnits / Math.max(units.length, 1)) * 100)
    const previewConfirmed = previewTimelines.some((item) => item.status === 'confirmed')
    const previewProgress = previewConfirmed ? 100 : previewTimelines.length > 0 ? 65 : 0
    const storedProgress = Number(production.progress ?? 0)
    const progress = storedProgress > 0 ? clampProgress(storedProgress) : Math.round((previewProgress * 0.3) + (unitProgress * 0.45) + (deliveryVersions.length > 0 ? 20 : 0))

    return {
      dbId: productionId,
      id: `PRD-${productionId}`,
      name: production.name || `制作 ${productionId}`,
      status: normalizeProductionStatus(production.status, previewConfirmed, deliveryVersions),
      source: sourceLabel(production),
      owner: production.owner_label || '导演组',
      progress: clampProgress(progress),
      updatedAt: production.UpdatedAt ? formatShortDate(production.UpdatedAt) : '',
      description: production.description || '直接创建的制作。可以继续挂载预演、制作项、素材需求和成片版本。',
      preview: {
        title: previewTimelines[0]?.name as string || '未挂载预演',
        status: previewConfirmed ? 'done' : previewTimelines.length > 0 ? 'active' : 'waiting',
        progress: previewProgress,
        savedAt: String(previewTimelines[0]?.UpdatedAt ?? ''),
      },
      stats: {
        segments: relatedSegmentCount,
        sceneMoments: relatedSceneMomentCount,
        references: relatedReferenceCount,
        assets: assetSlots.length,
        contents: units.length,
        finals: deliveryVersions.length,
      },
      areas: buildAreas({
        previewProgress,
        segmentCount: relatedSegmentCount,
        sceneMomentCount: relatedSceneMomentCount,
        referenceCount: relatedReferenceCount,
        assetCount: assetSlots.length,
        contentCount: units.length,
        finalCount: deliveryVersions.length,
        blockedUnits,
        activeUnits,
      }),
      units,
      blockers: [
        ...(blockedUnits > 0 ? [`${blockedUnits} 个制作项仍有素材或资料缺口。`] : []),
        ...(units.length === 0 ? ['当前制作还没有制作项。'] : []),
      ],
      nextActions: nextActionsForProduction({ blockedUnits, units: units.length, deliveryVersions: deliveryVersions.length, keyframes: keyframes.length }),
    }
  })
}

function buildAreas(input: {
  previewProgress: number
  segmentCount: number
  sceneMomentCount: number
  referenceCount: number
  assetCount: number
  contentCount: number
  finalCount: number
  blockedUnits: number
  activeUnits: number
}): ProductionArea[] {
  return [
    {
      key: 'segments',
      title: '剧本段落',
      description: '叙事和制作块',
      icon: GitBranch,
      count: input.segmentCount,
      progress: input.previewProgress,
      status: input.segmentCount > 0 ? 'active' : 'waiting',
      href: '/segments',
    },
    {
      key: 'sceneMoments',
      title: '情景',
      description: '时间、地点、条件和动作',
      icon: Route,
      count: input.sceneMomentCount,
      progress: input.sceneMomentCount > 0 ? 60 : 0,
      status: input.sceneMomentCount > 0 ? 'active' : 'waiting',
      href: '/scene-moments',
    },
    {
      key: 'references',
      title: '设定资料',
      description: '人物、场景、道具、风格规则',
      icon: Sparkles,
      count: input.referenceCount,
      progress: input.referenceCount > 0 ? 60 : 0,
      status: input.referenceCount > 0 ? 'active' : 'waiting',
      href: '/creative-references',
    },
    {
      key: 'assets',
      title: '素材需求',
      description: '从剧本段落和设定资料推演出的素材需求',
      icon: PackageCheck,
      count: input.assetCount,
      progress: input.blockedUnits > 0 ? 38 : input.assetCount > 0 ? 68 : 0,
      status: input.blockedUnits > 0 ? 'blocked' : input.assetCount > 0 ? 'active' : 'waiting',
      href: '/asset-slots',
    },
    {
      key: 'content',
      title: '制作项',
      description: '正式候选、返工和锁定目标',
      icon: Film,
      count: input.contentCount,
      progress: input.activeUnits > 0 ? 44 : input.contentCount > 0 ? 30 : 0,
      status: input.contentCount > 0 ? 'active' : 'waiting',
      href: '/contents',
    },
    {
      key: 'final',
      title: '成片',
      description: '时间线、版本和交付输出',
      icon: Video,
      count: input.finalCount,
      progress: input.finalCount > 0 ? 72 : 0,
      status: input.finalCount > 0 ? 'active' : 'waiting',
      href: '/delivery',
    },
  ]
}

function mapContentUnitsToProductionUnits(rows: SemanticEntityRecord[], assetSlots: SemanticEntityRecord[]): ProductionUnit[] {
  let cursor = 0
  return rows.map((row, index) => {
    const duration = Number(row.duration_sec ?? 0)
    const start = cursor
    const end = cursor + duration
    cursor = end
    const slots = assetSlots.filter((slot) => slot.owner_type === 'content_unit' && Number(slot.owner_id) === row.ID)
    const blocked = slots.some((slot) => slot.status === 'missing')
    const status = contentUnitStatus(row.status, blocked)
    return {
      id: `CU-${String(index + 1).padStart(3, '0')}`,
      title: String(row.title || `制作项 ${index + 1}`),
      summary: String(row.description || row.prompt || '制作下的正式制作项。'),
      timeRange: `${formatTime(start)}-${formatTime(end)}`,
      duration,
      status,
      assets: slots.length > 0 ? `${slots.filter((slot) => slot.status === 'locked').length}/${slots.length} 已锁定` : '暂无素材需求',
      content: cameraPlanSummary(row) || (status === 'done' ? '已锁定' : status === 'active' ? '制作中' : status === 'blocked' ? '有阻塞' : '待生成'),
    }
  })
}

function cameraPlanSummary(row: SemanticEntityRecord) {
  return [
    row.shot_size,
    row.camera_angle,
    row.camera_motion,
    row.motion_intensity,
    row.camera_speed,
    row.lens,
    row.focal_length,
  ].map((value) => String(value ?? '').trim()).filter(Boolean).join(' · ')
}

function formatTime(seconds: number) {
  const minute = Math.floor(seconds / 60)
  const second = Math.round(seconds % 60)
  return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
}

function recordsForProduction(records: SemanticEntityRecord[], productionId: number) {
  return records.filter((item) => Number(item.production_id) === productionId)
}

function relatedSegmentIdsForProduction(production: ProductionBackendRecord, data: ProductionData) {
  const productionId = production.ID
  const ids = new Set<number>()
  for (const segment of data.segments) {
    if (Number(segment.production_id) === productionId) ids.add(segment.ID)
    if (production.script_version_id && Number(segment.script_version_id) === Number(production.script_version_id)) ids.add(segment.ID)
  }
  for (const unit of data.contentUnits.filter((item) => Number(item.production_id) === productionId)) {
    addRecordId(ids, unit.segment_id)
    const sceneMoment = data.sceneMoments.find((item) => item.ID === Number(unit.scene_moment_id))
    addRecordId(ids, sceneMoment?.segment_id)
  }
  for (const slot of data.assetSlots.filter((item) => Number(item.production_id) === productionId)) {
    if (slot.owner_type === 'segment') addRecordId(ids, slot.owner_id)
    if (slot.owner_type === 'scene_moment') {
      const sceneMoment = data.sceneMoments.find((item) => item.ID === Number(slot.owner_id))
      addRecordId(ids, sceneMoment?.segment_id)
    }
    if (slot.owner_type === 'content_unit') {
      const unit = data.contentUnits.find((item) => item.ID === Number(slot.owner_id))
      addRecordId(ids, unit?.segment_id)
      const sceneMoment = data.sceneMoments.find((item) => item.ID === Number(unit?.scene_moment_id))
      addRecordId(ids, sceneMoment?.segment_id)
    }
  }
  return ids
}

function relatedSceneMomentIdsForProduction(segmentIds: Set<number>, productionId: number, data: ProductionData) {
  const ids = new Set<number>()
  for (const moment of data.sceneMoments) {
    if (segmentIds.has(Number(moment.segment_id))) ids.add(moment.ID)
  }
  for (const unit of recordsForProduction(data.contentUnits, productionId)) {
    addRecordId(ids, unit.scene_moment_id)
  }
  for (const slot of recordsForProduction(data.assetSlots, productionId)) {
    if (slot.owner_type === 'scene_moment') addRecordId(ids, slot.owner_id)
    if (slot.owner_type === 'content_unit') {
      const unit = data.contentUnits.find((item) => item.ID === Number(slot.owner_id))
      addRecordId(ids, unit?.scene_moment_id)
    }
  }
  return ids
}

function contentUnitsForProduction(segmentIds: Set<number>, sceneMomentIds: Set<number>, productionId: number, data: ProductionData) {
  return data.contentUnits.filter((unit) => (
    Number(unit.production_id) === productionId ||
    segmentIds.has(Number(unit.segment_id)) ||
    sceneMomentIds.has(Number(unit.scene_moment_id))
  ))
}

function assetSlotsForProduction(segmentIds: Set<number>, sceneMomentIds: Set<number>, contentUnitIds: Set<number>, productionId: number, data: ProductionData) {
  return data.assetSlots.filter((slot) => (
    Number(slot.production_id) === productionId ||
    (slot.owner_type === 'segment' && segmentIds.has(Number(slot.owner_id))) ||
    (slot.owner_type === 'scene_moment' && sceneMomentIds.has(Number(slot.owner_id))) ||
    (slot.owner_type === 'content_unit' && contentUnitIds.has(Number(slot.owner_id)))
  ))
}

function keyframesForProduction(sceneMomentIds: Set<number>, contentUnitIds: Set<number>, productionId: number, data: ProductionData) {
  return data.keyframes.filter((keyframe) => (
    Number(keyframe.production_id) === productionId ||
    sceneMomentIds.has(Number(keyframe.scene_moment_id)) ||
    contentUnitIds.has(Number(keyframe.content_unit_id))
  ))
}

function relatedReferenceIdsForProduction(segmentIds: Set<number>, sceneMomentIds: Set<number>, contentUnitIds: Set<number>, assetSlots: SemanticEntityRecord[], data: ProductionData) {
  const ids = new Set<number>()
  for (const usage of data.creativeReferenceUsages) {
    if (
      (usage.owner_type === 'segment' && segmentIds.has(Number(usage.owner_id))) ||
      (usage.owner_type === 'scene_moment' && sceneMomentIds.has(Number(usage.owner_id))) ||
      (usage.owner_type === 'content_unit' && contentUnitIds.has(Number(usage.owner_id)))
    ) {
      addRecordId(ids, usage.creative_reference_id)
    }
  }
  for (const slot of assetSlots) {
    addRecordId(ids, slot.creative_reference_id)
  }
  return new Set([...ids].filter((id) => data.creativeReferences.some((reference) => reference.ID === id)))
}

function addRecordId(target: Set<number>, value: unknown) {
  const id = Number(value)
  if (Number.isFinite(id) && id > 0) target.add(id)
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeProductionStatus(status: unknown, previewConfirmed: boolean, deliveryVersions: SemanticEntityRecord[]): ProductionStatus {
  const value = String(status ?? '')
  if (value in statusMeta) return value as ProductionStatus
  if (deliveryVersions.some((item) => item.status === 'exported' || item.status === 'approved')) return 'reviewing'
  return previewConfirmed ? 'producing' : 'planning'
}

function sourceLabel(production: ProductionBackendRecord) {
  if (production.source_type === 'script' && production.script_version_id) return `剧本版本 #${production.script_version_id}`
  if (production.source_type === 'brief') return '简介创建'
  if (production.source_type === 'preview' && production.preview_timeline_id) return `预演 #${production.preview_timeline_id}`
  if (production.source_type === 'import') return '导入创建'
  return '直接创建'
}

function contentUnitStatus(status: unknown, blocked: boolean): UnitStatus {
  if (blocked) return 'blocked'
  if (status === 'locked') return 'done'
  if (status === 'in_production') return 'active'
  if (status === 'confirmed') return 'active'
  return 'waiting'
}

function nextActionsForProduction(input: { blockedUnits: number; units: number; deliveryVersions: number; keyframes: number }) {
  if (input.units === 0) return ['创建或导入制作项。', '为制作项补充素材需求。', '建立预演时间线或直接开始制作项生成。']
  if (input.blockedUnits > 0) return ['先补齐阻塞制作项的素材需求。', '锁定关键设定资料和素材。', '再进入内容候选生成与选片。']
  if (input.deliveryVersions === 0) return ['生成正式内容候选。', '选择可进入成片时间线的版本。', '创建第一版成片并进入交付检查。']
  return ['复核成片版本。', '归档生成记录和审核意见。', '准备导出或交付。']
}

function productionNextActionHref(action: string, production: ProductionRecord) {
  const lower = action.toLowerCase()
  if (action.includes('素材') || action.includes('资料')) return `/asset-slots?production_id=${production.dbId}`
  if (action.includes('预演') || action.includes('时间线')) return '/segments'
  if (action.includes('内容') || action.includes('候选') || action.includes('选片')) return `/contents?production_id=${production.dbId}`
  if (action.includes('成片') || action.includes('交付') || action.includes('导出') || action.includes('审核')) return deliveryHref(production)
  if (lower.includes('archive') || action.includes('归档')) return deliveryHref(production)
  const area = production.areas.find((item) => item.status === 'blocked') ?? production.areas.find((item) => item.status === 'waiting' || item.status === 'active')
  return area ? productionAreaHref(area, production) : `/contents?production_id=${production.dbId}`
}

function productionAreaHref(area: ProductionArea, production: ProductionRecord) {
  if (area.key === 'final') return deliveryWorkbenchHref(production)
  if (area.key === 'content') return `/contents?production_id=${production.dbId}`
  if (area.key === 'assets') return `/asset-slots?production_id=${production.dbId}`
  return area.href
}

function deliveryHref(production: ProductionRecord) {
  return deliveryWorkbenchHref(production)
}

function deliveryWorkbenchHref(production: ProductionRecord) {
  const params = new URLSearchParams({ productionId: String(production.dbId) })
  return `/delivery/workbench?${params.toString()}`
}

function productionPlaybackHref(production: ProductionRecord) {
  const params = new URLSearchParams({
    productionId: String(production.dbId),
  })
  return `/workbench/production-plan?${params.toString()}`
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
