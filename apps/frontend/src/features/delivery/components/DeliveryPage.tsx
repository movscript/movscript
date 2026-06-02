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
} from '@/shared/infrastructure/api/deliveryEntities'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import {
  ProductionDeliveryCenterBadge,
  ProductionDeliveryCenterEmptyState,
  ProductionDeliveryCenterHeaderAction,
  ProductionDeliveryCenterLayout,
  ProductionDeliveryCenterMetric,
  ProductionDeliveryCenterMetricGrid,
  ProductionDeliveryCenterModeCard,
  ProductionDeliveryCenterModeStack,
  ProductionDeliveryCenterPageLayout,
  ProductionDeliveryCenterPanel,
  ProductionDeliveryCenterRow,
  ProductionDeliveryCenterSection,
  ProductionDeliveryCenterSideRail,
  ProductionDeliveryCenterStatusBadge,
  ProductionDeliveryCenterTextBlock,
  ProductionDeliveryCenterTextStack,
  ProjectSurfaceHeader,
} from '@movscript/ui'
import { deliveryWorkbenchStatusRecipe } from '@/features/delivery/presentation/deliverySemanticUi'
import { ROUTES, withRouteParams } from '@/routes/projectRoutes'

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

export default function DeliveryPage() {
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
    <ProductionDeliveryCenterPageLayout>
        <ProjectSurfaceHeader
          icon={Truck}
          title="交付"
          description="交付中心追踪每个制作的交付版本、素材包、轻量成片和导出记录；具体成片预览、片段微调与放行检查进入交付工作台完成。"
          meta={<ProductionDeliveryCenterBadge variant="outline">{rows.length} 个制作</ProductionDeliveryCenterBadge>}
          actions={(
            <ProductionDeliveryCenterHeaderAction onClick={() => centerQuery.refetch()} loading={centerQuery.isFetching}>
              <RefreshCcw size={14} />
              刷新
            </ProductionDeliveryCenterHeaderAction>
          )}
        />

        <ProductionDeliveryCenterMetricGrid>
          <ProductionDeliveryCenterMetric icon={Boxes} label="制作" value={aggregate.productions} detail="当前项目制作单元" tone="info" />
          <ProductionDeliveryCenterMetric icon={Film} label="交付版本" value={aggregate.versions} detail="DeliveryVersion" tone="info" />
          <ProductionDeliveryCenterMetric icon={Download} label="已导出" value={aggregate.exported} detail="成功导出记录" tone="success" />
          <ProductionDeliveryCenterMetric icon={ShieldCheck} label="阻塞项" value={aggregate.blockers} detail="缺素材资源或未批准" tone="warning" />
          <ProductionDeliveryCenterMetric icon={CheckCircle2} label="平均就绪" value={`${aggregate.avg}%`} detail="版本放行准备度" tone="info" />
        </ProductionDeliveryCenterMetricGrid>

        <ProductionDeliveryCenterLayout>
          <ProductionDeliveryCenterSection
            title="制作交付状态"
            description="按 Production 汇总交付对象，进入工作台后处理装配、检查和导出。"
            action={<ProductionDeliveryCenterBadge variant="outline">{rows.length} 个制作</ProductionDeliveryCenterBadge>}
          >
            {centerQuery.isLoading ? (
              <ProductionDeliveryCenterEmptyState icon={RefreshCcw} title="正在加载" detail="读取交付版本和导出记录" />
            ) : rows.length === 0 ? (
              <ProductionDeliveryCenterEmptyState icon={Truck} title="暂无交付对象" detail="先创建制作，然后进入交付工作台查看交付版本和成片状态" />
            ) : (
              rows.map((row) => <DeliveryProductionRow key={row.production.ID} row={row} />)
            )}
          </ProductionDeliveryCenterSection>

          <ProductionDeliveryCenterSideRail>
            <ProductionDeliveryCenterPanel title="交付形态" icon={PackageCheck} iconAccent="lime">
              <ProductionDeliveryCenterModeStack>
                <ProductionDeliveryCenterModeCard
                  icon={Archive}
                  title="素材包交付"
                  detail="锁定 RawResource、素材清单和版本记录，交给专业剪辑软件继续工作。"
                />
                <ProductionDeliveryCenterModeCard
                  icon={Video}
                  title="轻量成片交付"
                  detail="在交付工作台查看成片总览，并微调排序、替换采用资源和检查版导出。"
                />
              </ProductionDeliveryCenterModeStack>
            </ProductionDeliveryCenterPanel>

            <ProductionDeliveryCenterPanel title="边界" icon={ShieldCheck} iconTone="success">
              <ProductionDeliveryCenterTextStack>
                <ProductionDeliveryCenterTextBlock>交付中心：项目级版本、导出和状态追踪。</ProductionDeliveryCenterTextBlock>
                <ProductionDeliveryCenterTextBlock>交付工作台：某个制作的成片总览、预览、轻量剪辑微调和放行门禁。</ProductionDeliveryCenterTextBlock>
                <ProductionDeliveryCenterTextBlock>专业剪辑：复杂多轨、调色、混音和特效工程仍建议外部完成。</ProductionDeliveryCenterTextBlock>
              </ProductionDeliveryCenterTextStack>
            </ProductionDeliveryCenterPanel>
          </ProductionDeliveryCenterSideRail>
        </ProductionDeliveryCenterLayout>
    </ProductionDeliveryCenterPageLayout>
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
    <ProductionDeliveryCenterRow
      mode={row.mode}
      title={row.production.name || `制作 #${row.production.ID}`}
      description={row.production.description || '暂无制作说明'}
      versionCount={row.versions.length}
      itemCount={row.items.length}
      status={(
        <ProductionDeliveryCenterStatusBadge
          {...deliveryWorkbenchStatusRecipe(latestVersion?.status ?? 'workspace')}
          label={deliveryStatusLabel(latestVersion?.status ?? 'workspace')}
        />
      )}
      exportStatus={latestExport ? exportStatusLabel(latestExport.status) : '未导出'}
      readiness={row.readiness}
      action={(
        <Link to={withRouteParams(ROUTES.project.deliveryWorkbench, { productionId: row.production.ID })}>
          工作台
          <ArrowRight size={14} />
        </Link>
      )}
    />
  )
}

function deliveryStatusLabel(status: string) {
  const labels: Record<string, string> = {
    workspace: '工作区',
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
