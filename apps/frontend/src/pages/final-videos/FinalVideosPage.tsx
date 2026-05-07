import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Archive,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Download,
  Film,
  PackageCheck,
  RefreshCcw,
  ShieldCheck,
  Truck,
  Video,
  type LucideIcon,
} from 'lucide-react'

import {
  listDeliveryTimelineItems,
  listDeliveryVersions,
  listExportRecords,
  listProductions,
  type DeliveryTimelineItem,
  type DeliveryVersion,
  type ExportRecord,
  type Production,
} from '@/api/deliveryEntities'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { Badge, Button, Progress } from '@movscript/ui'

type DeliveryMode = 'package' | 'assembly'

interface DeliveryCenterRow {
  production: Production
  versions: DeliveryVersion[]
  items: DeliveryTimelineItem[]
  exports: ExportRecord[]
  mode: DeliveryMode
  readiness: number
  blockers: number
}

const statusTone: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  checking: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  approved: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  exported: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  failed: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  succeeded: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
}

export default function FinalVideosPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID

  const centerQuery = useQuery({
    queryKey: ['delivery-center', projectId],
    queryFn: () => loadDeliveryCenter(projectId!),
    enabled: !!projectId,
  })

  const rows = centerQuery.data ?? []
  const aggregate = useMemo(() => {
    const versions = rows.reduce((sum, row) => sum + row.versions.length, 0)
    const exported = rows.reduce((sum, row) => sum + row.exports.filter((item) => item.status === 'succeeded').length, 0)
    const blockers = rows.reduce((sum, row) => sum + row.blockers, 0)
    const avg = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.readiness, 0) / rows.length) : 0
    return { productions: rows.length, versions, exported, blockers, avg }
  }, [rows])

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="min-w-[1180px] space-y-4 p-5">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Truck size={14} />
              <span>{project?.name ?? '当前项目'}</span>
              <ArrowRight size={13} />
              <span>交付中心</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal">交付</h1>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-muted-foreground">
              交付中心追踪每个制作的交付版本、素材包、轻量成片和导出记录；具体剪辑装配与放行检查进入交付工作台完成。
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={() => centerQuery.refetch()} loading={centerQuery.isFetching}>
            <RefreshCcw size={15} />
            刷新
          </Button>
        </header>

        <section className="grid grid-cols-5 gap-3">
          <MetricCard icon={Boxes} label="制作" value={aggregate.productions} detail="当前项目制作单元" tone="text-orange-600" />
          <MetricCard icon={Film} label="交付版本" value={aggregate.versions} detail="DeliveryVersion" tone="text-lime-600" />
          <MetricCard icon={Download} label="已导出" value={aggregate.exported} detail="成功导出记录" tone="text-emerald-600" />
          <MetricCard icon={ShieldCheck} label="阻塞项" value={aggregate.blockers} detail="缺素材或未批准" tone="text-amber-600" />
          <MetricCard icon={CheckCircle2} label="平均就绪" value={`${aggregate.avg}%`} detail="版本放行准备度" tone="text-sky-600" />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border p-4">
              <div>
                <h2 className="text-sm font-semibold">制作交付状态</h2>
                <p className="mt-1 text-xs text-muted-foreground">按 Production 汇总交付对象，进入工作台后处理装配、检查和导出。</p>
              </div>
              <Badge variant="outline">{rows.length} 个制作</Badge>
            </div>
            <div className="divide-y divide-border">
              {centerQuery.isLoading ? (
                <EmptyState icon={RefreshCcw} title="正在加载" detail="读取交付版本和导出记录" />
              ) : rows.length === 0 ? (
                <EmptyState icon={Truck} title="暂无交付对象" detail="先创建制作，然后进入交付工作台创建交付版本" />
              ) : (
                rows.map((row) => <DeliveryProductionRow key={row.production.ID} row={row} />)
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <section className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <PackageCheck size={16} className="text-lime-600" />
                <h2 className="text-sm font-semibold">交付形态</h2>
              </div>
              <div className="mt-4 space-y-3">
                <ModeCard
                  icon={Archive}
                  title="素材包交付"
                  detail="锁定 RawResource、素材清单和版本记录，交给专业剪辑软件继续工作。"
                />
                <ModeCard
                  icon={Video}
                  title="轻量成片交付"
                  detail="在交付工作台完成排序、替换、基础时间线和检查版导出。"
                />
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-600" />
                <h2 className="text-sm font-semibold">边界</h2>
              </div>
              <div className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
                <p>交付中心：项目级版本、导出和状态追踪。</p>
                <p>交付工作台：某个制作的剪辑装配、资源锁定和放行门禁。</p>
                <p>专业剪辑：复杂多轨、调色、混音和特效工程仍建议外部完成。</p>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </div>
  )
}

async function loadDeliveryCenter(projectId: number): Promise<DeliveryCenterRow[]> {
  const [productions, versions, items, exports] = await Promise.all([
    listProductions(projectId),
    listDeliveryVersions(projectId),
    listDeliveryTimelineItems(projectId),
    listExportRecords(projectId),
  ])
  const itemsByVersion = groupBy(items, (item) => item.delivery_version_id)
  const exportsByVersion = groupBy(exports, (item) => item.delivery_version_id)

  return productions.map((production) => {
    const scopedVersions = versions.filter((version) => version.production_id === production.ID)
    const scopedItems = scopedVersions.flatMap((version) => itemsByVersion.get(version.ID) ?? [])
    const scopedExports = scopedVersions.flatMap((version) => exportsByVersion.get(version.ID) ?? [])
    const locked = scopedItems.filter((item) => item.resource_id && ['locked', 'approved'].includes(item.status)).length
    const blockers = scopedItems.filter((item) => !item.resource_id || ['missing', 'needs_asset'].includes(item.status)).length
    const approved = scopedVersions.some((version) => ['approved', 'exported'].includes(version.status))
    const readiness = scopedItems.length > 0 ? Math.round((locked / scopedItems.length) * 80 + (approved ? 20 : 0)) : scopedVersions.length > 0 ? 20 : 0
    return {
      production,
      versions: scopedVersions,
      items: scopedItems,
      exports: scopedExports,
      mode: inferDeliveryMode(scopedVersions, scopedItems),
      readiness,
      blockers,
    }
  })
}

function groupBy<T>(items: T[], keyOf: (item: T) => number) {
  const map = new Map<number, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    map.set(key, [...(map.get(key) ?? []), item])
  }
  return map
}

function inferDeliveryMode(versions: DeliveryVersion[], items: DeliveryTimelineItem[]): DeliveryMode {
  const text = versions.map((version) => version.metadata_json ?? '').join(' ').toLowerCase()
  if (text.includes('package')) return 'package'
  return items.length > 0 ? 'assembly' : 'package'
}

function DeliveryProductionRow({ row }: { row: DeliveryCenterRow }) {
  const latestVersion = row.versions[0]
  const latestExport = row.exports[0]
  return (
    <article className="grid grid-cols-[minmax(0,1.2fr)_120px_130px_130px_150px] items-center gap-4 p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">{row.production.name || `制作 #${row.production.ID}`}</p>
          <Badge className={cn('text-[10px]', row.mode === 'assembly' ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'bg-lime-500/10 text-lime-700 dark:text-lime-300')}>
            {row.mode === 'assembly' ? '轻量成片' : '素材包'}
          </Badge>
        </div>
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{row.production.description || '暂无制作说明'}</p>
      </div>
      <div>
        <p className="text-sm font-medium">{row.versions.length}</p>
        <p className="mt-1 text-xs text-muted-foreground">交付版本</p>
      </div>
      <div>
        <p className="text-sm font-medium">{row.items.length}</p>
        <p className="mt-1 text-xs text-muted-foreground">时间线项</p>
      </div>
      <div>
        <Badge className={cn('text-[10px]', statusTone[latestVersion?.status ?? 'draft'] ?? 'bg-muted text-muted-foreground')}>
          {deliveryStatusLabel(latestVersion?.status ?? 'draft')}
        </Badge>
        <p className="mt-1 truncate text-xs text-muted-foreground">{latestExport ? exportStatusLabel(latestExport.status) : '未导出'}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>就绪</span>
            <span>{row.readiness}%</span>
          </div>
          <Progress value={row.readiness} className="h-1.5" />
        </div>
        <Button size="sm" className="h-8 shrink-0 gap-1.5" asChild>
          <Link to={`/delivery/workbench?productionId=${row.production.ID}`}>
            工作台
            <ArrowRight size={13} />
          </Link>
        </Button>
      </div>
    </article>
  )
}

function MetricCard({ icon: Icon, label, value, detail, tone }: { icon: LucideIcon; label: string; value: number | string; detail: string; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <Icon size={17} className={tone} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function ModeCard({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-muted-foreground" />
        <p className="text-sm font-medium">{title}</p>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  )
}

function EmptyState({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <Icon size={26} className="text-muted-foreground" />
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function deliveryStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: '草稿',
    checking: '检查中',
    approved: '已批准',
    exported: '已导出',
    archived: '已归档',
  }
  return labels[status] ?? status
}

function exportStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: '导出待处理',
    running: '导出中',
    succeeded: '导出成功',
    failed: '导出失败',
  }
  return labels[status] ?? status
}
