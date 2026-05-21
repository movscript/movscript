import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  Download,
  FileVideo,
  ListChecks,
  Pencil,
  Plus,
  ShieldCheck,
  X,
  XCircle,
  Video,
  type LucideIcon,
} from 'lucide-react'

import {
  listContentUnits,
  listDeliveryTimelineItems,
  listDeliveryVersions,
  listExportRecords,
  listPreviewTimelineItems,
  listPreviewTimelines,
  listProductions,
  type DeliveryTimelineItem,
  type DeliveryVersion,
  type Production,
} from '@/api/deliveryEntities'
import { ContentWorkspaceLayout } from '@/components/layout/ContentWorkspaceLayout'
import { DeliveryTimelineTrack } from '@/components/workbench/DeliveryTimelineTrack'
import { DeliveryExportPanel, DeliveryItemEditor, EmptyDeliveryTimeline } from '@/components/workbench/DeliveryWorkbenchPanels'
import { ProjectWorkbenchShell } from '@/components/workbench/WorkbenchChrome'
import {
  WorkbenchEmptyState,
  WorkbenchEntityCard,
  WorkbenchKeyValue,
  WorkbenchMetric,
  WorkbenchStatusBadge,
} from '@/components/workbench/WorkbenchPrimitives'
import { MediaViewer } from '@/components/shared/MediaViewer'
import { ResourceLibraryPicker, type ResourceTypeFilter } from '@/components/shared/ResourceLibraryPicker'
import { ContentFilterBar } from '@/pages/contents/components/ContentFilterBar'
import {
  buildDeliveryContentUnitMap,
  buildDeliveryGateChecks,
  buildDeliveryReadiness,
  deliveryResourcePageCount,
  deliveryStatusLabel,
  deliveryVersionFilterLabel,
  filterDeliveryVersions,
  parsePositiveDeliveryNumber,
  pickBestDeliveryPreviewTimeline,
  selectDeliveryResource,
  sortDeliveryContentUnits,
  sortDeliveryPreviewTimelineItems,
  sortDeliveryTimelineItems,
  sumDeliveryTimelineDuration,
  type DeliveryVersionFilter,
} from '@/lib/deliveryWorkbenchModel'
import {
  buildCreateDeliveryTimelineItemMutationOptions,
  buildCreateDeliveryVersionFromProductionTimelineMutationOptions,
  buildCreateExportRecordMutationOptions,
  buildRemoveDeliveryTimelineItemMutationOptions,
  buildSeedDeliveryVersionFromProductionTimelineMutationOptions,
  buildUpdateDeliveryTimelineItemMutationOptions,
} from '@/lib/deliveryWorkbenchMutationController'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import type { PaginatedResponse, RawResource } from '@/types'
import { Badge, Button, Label, Progress as ProgressBar } from '@movscript/ui'

const statusTone: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  checking: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  approved: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  exported: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  archived: 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
  confirmed: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  needs_asset: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  missing: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  locked: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  pending: 'bg-muted text-muted-foreground',
  running: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  succeeded: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  failed: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
}

export default function DeliveryWorkbenchPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filter, setFilter] = useState<DeliveryVersionFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [editingItem, setEditingItem] = useState(false)
  const [resourceSearch, setResourceSearch] = useState('')
  const [resourceType, setResourceType] = useState<ResourceTypeFilter>('video')
  const [resourcePage, setResourcePage] = useState(1)
  const selectedProductionId = parsePositiveDeliveryNumber(searchParams.get('productionId'))

  const versionsQuery = useQuery({
    queryKey: ['semantic-delivery-versions', projectId, selectedProductionId],
    queryFn: () => listDeliveryVersions(projectId!, selectedProductionId),
    enabled: !!projectId,
  })
  const versions = versionsQuery.data ?? []
  const selectedVersion = versions.find((item) => item.ID === selectedVersionId) ?? null

  const productionsQuery = useQuery({
    queryKey: ['semantic-productions', projectId],
    queryFn: () => listProductions(projectId!),
    enabled: !!projectId,
  })
  const productions = productionsQuery.data ?? []
  const selectedProduction = selectedProductionId
    ? productions.find((item) => item.ID === selectedProductionId) ?? null
    : null

  const itemsQuery = useQuery({
    queryKey: ['semantic-delivery-timeline-items', projectId, selectedVersionId],
    queryFn: () => listDeliveryTimelineItems(projectId!, selectedVersionId),
    enabled: !!projectId && !!selectedVersionId,
  })
  const timelineItems = useMemo(
    () => sortDeliveryTimelineItems(itemsQuery.data ?? []),
    [itemsQuery.data],
  )

  const exportsQuery = useQuery({
    queryKey: ['semantic-export-records', projectId, selectedVersionId],
    queryFn: () => listExportRecords(projectId!, selectedVersionId),
    enabled: !!projectId && !!selectedVersionId,
  })
  const exportRecords = exportsQuery.data ?? []

  const previewTimelinesQuery = useQuery({
    queryKey: ['semantic-preview-timelines', projectId, selectedProductionId],
    queryFn: () => listPreviewTimelines(projectId!, selectedProductionId),
    enabled: !!projectId,
  })
  const previewTimelines = previewTimelinesQuery.data ?? []
  const sourcePreviewTimelineId = selectedVersion?.preview_timeline_id
    ?? selectedProduction?.preview_timeline_id
    ?? pickBestDeliveryPreviewTimeline(previewTimelines)?.ID
    ?? null

  const previewTimelineItemsQuery = useQuery({
    queryKey: ['semantic-preview-timeline-items', projectId, sourcePreviewTimelineId],
    queryFn: () => listPreviewTimelineItems(projectId!, sourcePreviewTimelineId),
    enabled: !!projectId && !!sourcePreviewTimelineId,
  })

  const contentUnitsQuery = useQuery({
    queryKey: ['semantic-content-units', projectId, selectedProductionId],
    queryFn: () => listContentUnits(projectId!, selectedProductionId),
    enabled: !!projectId,
  })

  const resourcePageSize = 6
  const resourcesQuery = useQuery<PaginatedResponse<RawResource>>({
    queryKey: ['resources', 'semantic-final-library', resourceType, resourceSearch, resourcePage],
    queryFn: () =>
      api.get('/resources', {
        params: {
          page: resourcePage,
          page_size: resourcePageSize,
          type: resourceType === 'all' ? 'image,video,audio,text,file' : resourceType,
          q: resourceSearch.trim() || undefined,
        },
      }).then((r) => r.data),
    enabled: !!projectId,
  })

  useEffect(() => {
    if (!selectedVersionId && versions.length > 0) {
      setSelectedVersionId((versions.find((item) => item.is_primary) ?? versions[0]).ID)
    }
  }, [selectedVersionId, versions])

  useEffect(() => {
    if (selectedVersionId && !versions.some((item) => item.ID === selectedVersionId)) {
      setSelectedVersionId(versions[0]?.ID ?? null)
    }
  }, [selectedVersionId, versions])

  useEffect(() => {
    setSelectedVersionId(null)
    setSelectedItemId(null)
    setEditingItem(false)
  }, [selectedProductionId])

  useEffect(() => {
    setSelectedItemId(timelineItems[0]?.ID ?? null)
    setEditingItem(false)
  }, [selectedVersionId])

  useEffect(() => {
    setEditingItem(false)
  }, [selectedItemId])

  const visibleVersions = useMemo(
    () => filterDeliveryVersions(versions, filter, search),
    [filter, search, versions],
  )

  const selectedItem = timelineItems.find((item) => item.ID === selectedItemId) ?? null
  const resources = resourcesQuery.data?.items ?? []
  const resourceTotal = resourcesQuery.data?.total ?? 0
  const resourcePageCount = deliveryResourcePageCount(resourceTotal, resourcePageSize)
  const selectedResource = selectDeliveryResource(resources, selectedItem)
  const versionReadiness = buildDeliveryReadiness(timelineItems)
  const sourceContentUnits = useMemo(
    () => sortDeliveryContentUnits(contentUnitsQuery.data ?? []),
    [contentUnitsQuery.data],
  )
  const sourcePreviewTimelineItems = useMemo(
    () => sortDeliveryPreviewTimelineItems(previewTimelineItemsQuery.data ?? []),
    [previewTimelineItemsQuery.data],
  )
  const sourceTimelineCount = sourcePreviewTimelineItems.length || sourceContentUnits.length
  const contentUnitById = useMemo(() => buildDeliveryContentUnitMap(sourceContentUnits), [sourceContentUnits])

  const gateChecks = useMemo(
    () => buildDeliveryGateChecks({ timelineItems, versionReadiness, selectedVersion }),
    [timelineItems, versionReadiness, selectedVersion],
  )

  const versionKey = ['semantic-delivery-versions', projectId, selectedProductionId]
  const itemsKey = ['semantic-delivery-timeline-items', projectId, selectedVersionId]
  const exportsKey = ['semantic-export-records', projectId, selectedVersionId]

  const mutationBase = {
    projectId,
    queryClient: qc,
  }

  const createVersionFromProductionTimeline = useMutation(buildCreateDeliveryVersionFromProductionTimelineMutationOptions({
    ...mutationBase,
    selectedProductionId,
    sourcePreviewTimelineId,
    versions,
    sourcePreviewTimelineItems,
    sourceContentUnits,
    versionKey,
    setSelectedVersionId,
    setSelectedItemId,
  }))

  const seedSelectedVersionFromProductionTimeline = useMutation(buildSeedDeliveryVersionFromProductionTimelineMutationOptions({
    ...mutationBase,
    selectedVersionId,
    sourcePreviewTimelineItems,
    sourceContentUnits,
    itemsKey,
  }))

  const createItem = useMutation(buildCreateDeliveryTimelineItemMutationOptions({
    ...mutationBase,
    selectedVersionId,
    timelineItems,
    itemsKey,
    setSelectedItemId,
    setEditingItem,
  }))

  const updateItem = useMutation(buildUpdateDeliveryTimelineItemMutationOptions({
    ...mutationBase,
    selectedVersionId,
    itemsKey,
  }))

  const removeItem = useMutation(buildRemoveDeliveryTimelineItemMutationOptions({
    ...mutationBase,
    itemsKey,
    setSelectedItemId,
  }))

  const createExport = useMutation(buildCreateExportRecordMutationOptions({
    ...mutationBase,
    selectedVersionId,
    exportsKey,
  }))

  function refreshAll() {
    versionsQuery.refetch()
    itemsQuery.refetch()
    exportsQuery.refetch()
    previewTimelinesQuery.refetch()
    previewTimelineItemsQuery.refetch()
    contentUnitsQuery.refetch()
    productionsQuery.refetch()
  }

  function selectProduction(productionId: number | null) {
    const next = new URLSearchParams(searchParams)
    if (productionId) next.set('productionId', String(productionId))
    else next.delete('productionId')
    setSearchParams(next, { replace: true })
  }

  function patchSelectedItem(payload: Partial<DeliveryTimelineItem>) {
    if (!selectedItem) return
    updateItem.mutate({ id: selectedItem.ID, payload })
  }

  function patchTimelineItem(id: number, payload: Partial<DeliveryTimelineItem>) {
    updateItem.mutate({ id, payload })
  }

  return (
    <ProjectWorkbenchShell
      workbenchId="delivery"
      projectName={project?.name}
      kicker={selectedProduction ? `${selectedProduction.name || `制作 #${selectedProduction.ID}`} · 交付` : '交付'}
      title="交付工作台"
      description="总览制作下的交付版本、成片时间线、资源覆盖、审核状态和导出记录；允许在交付层微调片段顺序、时长和资源采用，不回写剧本结构。"
      badges={selectedProduction ? (
        <Badge variant="secondary" className="type-tiny">
          当前制作：{selectedProduction.status || '未标记状态'}
        </Badge>
      ) : (
        <Badge variant="outline" className="type-tiny">全部制作</Badge>
      )}
      onRefresh={refreshAll}
      refreshing={versionsQuery.isFetching || itemsQuery.isFetching}
      refreshLabel="刷新"
      actions={(
        <>
          <ProductionScopeSelect
            productions={productions}
            value={selectedProductionId}
            loading={productionsQuery.isLoading}
            onChange={selectProduction}
          />
          <Button size="sm" className="gap-1.5" disabled={!selectedVersionId} onClick={() => createItem.mutate()} loading={createItem.isPending}>
            <Plus size={15} />
            添加片段
          </Button>
          {!selectedVersionId && sourceTimelineCount > 0 ? (
            <Button size="sm" className="gap-1.5" onClick={() => createVersionFromProductionTimeline.mutate()} loading={createVersionFromProductionTimeline.isPending}>
              <Plus size={15} />
              创建交付版
            </Button>
          ) : null}
        </>
      )}
    >
      <ContentWorkspaceLayout
        className="min-h-0 flex-1"
        overview={(
        <div className="space-y-3">
          <section className="grid grid-cols-4 gap-3">
            <ReadinessCard icon={FileVideo} label="交付版本" value={versions.length} detail={`${versions.filter((item) => ['approved', 'exported'].includes(item.status)).length} 个可导出`} tone="text-indigo-600" />
            <ReadinessCard icon={ListChecks} label="时间线片段" value={timelineItems.length} detail={`${formatDuration(sumDeliveryTimelineDuration(timelineItems))} 总时长`} tone="text-sky-600" />
            <ReadinessCard icon={AlertTriangle} label="缺失内容" value={versionReadiness.missingCount + versionReadiness.noResourceCount} detail="missing / needs_asset / 无资源" tone="text-amber-600" />
            <ReadinessCard icon={Download} label="导出记录" value={exportRecords.length} detail={exportRecords[0]?.status ? exportStatusLabel(exportRecords[0].status) : '尚未导出'} tone="text-emerald-600" />
          </section>
          {selectedVersion && (
            <section className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(300px,340px)]">
              <VersionSummaryCard version={selectedVersion} items={timelineItems} readiness={versionReadiness} />
              <GateCheckPanel checks={gateChecks} />
            </section>
          )}
        </div>
      )}
      filters={(
        <ContentFilterBar
          query={search}
          onQueryChange={setSearch}
          queryPlaceholder="搜索版本"
          filters={[{
            id: 'status',
            label: '状态',
            value: filter,
            onChange: (value) => setFilter(value as DeliveryVersionFilter),
            options: (['all', 'draft', 'checking', 'approved', 'exported'] as const).map((item) => ({
              value: item,
              label: deliveryVersionFilterLabel(item),
              count: item === 'all' ? versions.length : versions.filter((version) => version.status === item).length,
            })),
          }]}
          resultCount={visibleVersions.length}
          totalCount={versions.length}
        />
      )}
      list={(
        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="type-body font-semibold tracking-normal">版本列表</h2>
              <p className="mt-1 type-label text-muted-foreground">搜索、筛选并选择要查看的交付版本。</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <SummaryTile label="版本" value={versions.length} />
            <SummaryTile label="可导出" value={versions.filter((item) => ['approved', 'exported'].includes(item.status)).length} />
          </div>
        </div>

        <div className="max-h-[700px] overflow-auto p-3">
          {versionsQuery.isLoading ? (
            <EmptyBlock icon={Clock3} title="正在加载" detail="读取交付版本" />
          ) : visibleVersions.length === 0 ? (
            <EmptyBlock icon={FileVideo} title="暂无版本" detail="当前范围还没有可查看的交付版本" />
          ) : (
            <div className="space-y-2">
              {visibleVersions.map((version) => (
                <VersionCard
                  key={version.ID}
                  version={version}
                  selected={version.ID === selectedVersionId}
                  itemCount={version.ID === selectedVersionId ? timelineItems.length : undefined}
                  onClick={() => setSelectedVersionId(version.ID)}
                />
              ))}
            </div>
          )}
        </div>
      </section>
      )}
      detail={(
        selectedVersion ? (
          <>
            <section className="rounded-lg border border-border bg-card">
              <div className="border-b border-border p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <StatusPill status={selectedVersion.status ?? 'draft'} />
                  {selectedVersion.is_primary && <span className="rounded bg-primary/10 px-2 py-1 type-label text-primary">主版本</span>}
                  {selectedVersion.production_id && <span className="rounded bg-muted px-2 py-1 type-label text-muted-foreground">制作 #{selectedVersion.production_id}</span>}
                  {selectedVersion.preview_timeline_id && <span className="rounded bg-muted px-2 py-1 type-label text-muted-foreground">预览 #{selectedVersion.preview_timeline_id}</span>}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="type-body font-semibold">版本详情</h2>
                </div>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                <ReadOnlyField label="版本名称" value={selectedVersion.name || `Delivery #${selectedVersion.ID}`} strong />
                <ReadOnlyField label="状态" value={deliveryStatusLabel(selectedVersion.status)} />
                <ReadOnlyField label="关联制作" value={productionLabel(selectedVersion.production_id, productions)} />
                <ReadOnlyField label="关联预览时间线" value={selectedVersion.preview_timeline_id ? `Preview #${selectedVersion.preview_timeline_id}` : '未关联'} />
                <ReadOnlyField label="版本说明" value={selectedVersion.description || '未填写版本说明'} className="sm:col-span-2" />
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card">
              <div className="border-b border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="type-body font-semibold">片段详情</h2>
                    <p className="mt-1 type-label text-muted-foreground">在交付层微调顺序、时长、资源采用和审核状态。</p>
                  </div>
                  {selectedItem ? (
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => setEditingItem((value) => !value)} disabled={updateItem.isPending}>
                      {editingItem ? <X size={14} /> : <Pencil size={14} />}
                      {editingItem ? '结束编辑' : '编辑'}
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="p-4">
                {selectedItem ? (
                  <DeliveryItemEditor
                    item={selectedItem}
                    contentUnits={contentUnitsQuery.data ?? []}
                    editing={editingItem}
                    onChange={patchSelectedItem}
                    onDelete={() => removeItem.mutate(selectedItem.ID)}
                    deleting={removeItem.isPending}
                  />
                ) : (
                  <EmptyBlock icon={Video} title="未选择片段" detail="从时间线选择一个片段进行编辑" />
                )}
              </div>
            </section>
          </>
        ) : (
          <section className="rounded-lg border border-border bg-card">
            <EmptyBlock
              icon={FileVideo}
              title="暂无交付版本"
              detail={sourceTimelineCount > 0 ? '内容工作区已有预览/制作时间线，可以从顶部创建第一版交付装配。' : '当前范围还没有可查看的交付版本'}
            />
          </section>
        )
      )}
      preview={(
        selectedItem ? (
          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border p-4">
              <h2 className="type-body font-semibold">成片预览</h2>
              <p className="mt-1 type-label text-muted-foreground">预览当前片段资源，并可在交付层替换采用版本。</p>
            </div>
            <div className="space-y-4 p-4">
                  <div>
                    <Label className="mb-2 block type-label font-medium text-muted-foreground">成片资源</Label>
                    {selectedResource ? (
                      <MediaViewer resource={selectedResource} fit="contain" className="mb-3 aspect-video w-full" />
                    ) : (
                      <div className="mb-3 flex aspect-video w-full items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Video size={28} />
                      </div>
                    )}
                    <ResourceLibraryPicker
                      resources={resources}
                      selectedResource={selectedResource}
                      search={resourceSearch}
                      type={resourceType}
                      page={resourcePage}
                      pageCount={resourcePageCount}
                      total={resourceTotal}
                      isLoading={resourcesQuery.isLoading || updateItem.isPending}
                      typeOptions={['video', 'image', 'audio']}
                      onSearch={(next) => {
                        setResourceSearch(next)
                        setResourcePage(1)
                      }}
                      onType={(next) => {
                        setResourceType(next)
                        setResourcePage(1)
                      }}
                      onPage={setResourcePage}
                      onSelect={(resource) => patchSelectedItem({ resource_id: resource.ID, kind: resource.type, status: 'locked' })}
                      onClear={() => patchSelectedItem({ resource_id: null, status: 'missing' })}
                    />
                  </div>
                  <DeliveryExportPanel exportRecords={exportRecords} onCreate={() => createExport.mutate()} creating={createExport.isPending} />
                </div>
          </section>
        ) : (
          <section className="rounded-lg border border-border bg-card">
            <EmptyBlock icon={Video} title="未选择片段" detail="从底部时间线选择一个片段查看预览" />
          </section>
        )
      )}
      upstream={<div />}
      downstream={<div />}
      bottom={(
        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border p-4">
            <div>
              <h2 className="type-body font-semibold">成片时间线</h2>
              <p className="mt-1 type-label text-muted-foreground">按 DeliveryTimelineItem 组织正式交付片段，不回写剧本结构。</p>
            </div>
            <StatusPill status={versionReadiness.ready ? 'approved' : 'checking'} label={versionReadiness.ready ? '可导出' : '待补齐'} />
          </div>

          {itemsQuery.isLoading ? (
            <EmptyBlock icon={Clock3} title="正在加载" detail="读取成片时间线" />
          ) : timelineItems.length === 0 ? (
            <EmptyDeliveryTimeline
              sourceCount={sourceTimelineCount}
              sourceLabel={sourcePreviewTimelineItems.length > 0 ? '预览片段' : '制作项'}
              canSeed={!!selectedVersionId && sourceTimelineCount > 0}
              loading={seedSelectedVersionFromProductionTimeline.isPending}
              onSeed={() => seedSelectedVersionFromProductionTimeline.mutate()}
            />
          ) : (
            <DeliveryTimelineTrack
              items={timelineItems}
              contentUnitById={contentUnitById}
              selectedId={selectedItemId}
              onSelect={setSelectedItemId}
              onPatchItem={patchTimelineItem}
            />
          )}
        </section>
      )}
      />
    </ProjectWorkbenchShell>
  )
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return <WorkbenchMetric label={label} value={value} compact />
}

function ProductionScopeSelect({
  productions,
  value,
  loading,
  onChange,
}: {
  productions: Production[]
  value: number | null
  loading: boolean
  onChange: (value: number | null) => void
}) {
  return (
    <label className="flex items-center gap-2 type-label text-muted-foreground">
      <span>制作范围</span>
      <select
        className="ms-input h-8 min-w-48 bg-background type-label"
        value={value ?? ''}
        disabled={loading}
        onChange={(event) => onChange(parsePositiveDeliveryNumber(event.target.value))}
      >
        <option value="">全部制作</option>
        {productions.map((production) => (
          <option key={production.ID} value={production.ID}>
            {production.name || `制作 #${production.ID}`}
          </option>
        ))}
      </select>
    </label>
  )
}

type GateCheckStatus = 'passed' | 'warning' | 'blocked'

const gateMeta: Record<GateCheckStatus, { className: string; icon: LucideIcon }> = {
  passed: { className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', icon: CheckCircle2 },
  warning: { className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', icon: AlertTriangle },
  blocked: { className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300', icon: XCircle },
}

function VersionSummaryCard({
  version,
  items,
  readiness: r,
}: {
  version: DeliveryVersion
  items: DeliveryTimelineItem[]
  readiness: ReturnType<typeof buildDeliveryReadiness>
}) {
  const lockedCount = r.lockedCount
  const total = items.length
  const completion = total > 0 ? Math.round((lockedCount / total) * 100) : 0
  const warningCount = items.filter((i) => !['locked', 'approved'].includes(i.status)).length

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BadgeCheck size={16} className={warningCount > 0 ? 'text-amber-600' : 'text-emerald-600'} />
            <h2 className="type-body font-semibold text-foreground">{version.name || `Delivery #${version.ID}`}</h2>
            <Badge className={cn('type-tiny', statusTone[version.status] ?? 'bg-muted text-muted-foreground')}>
              {deliveryStatusLabel(version.status)}
            </Badge>
            {version.is_primary && (
              <Badge className="type-tiny bg-primary/10 text-primary">主版本</Badge>
            )}
          </div>
          <p className="mt-2 type-body text-muted-foreground line-clamp-2">
            {version.description || '未填写版本说明'}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-right shrink-0">
          <div>
            <p className={cn('type-title font-semibold tabular-nums', warningCount > 0 ? 'text-amber-600' : 'text-emerald-600')}>{completion}%</p>
            <p className="mt-1 type-label text-muted-foreground">完成度</p>
          </div>
          <div>
            <p className="type-title font-semibold tabular-nums">{formatDuration(sumDeliveryTimelineDuration(items))}</p>
            <p className="mt-1 type-label text-muted-foreground">总时长</p>
          </div>
          <div>
            <p className={cn('type-title font-semibold tabular-nums', warningCount > 0 ? 'text-amber-600' : 'text-foreground')}>{warningCount}</p>
            <p className="mt-1 type-label text-muted-foreground">待处理</p>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between type-label text-muted-foreground">
          <span>成片片段锁定进度</span>
          <span>{lockedCount}/{total}</span>
        </div>
        <ProgressBar value={completion} className="h-1.5" />
      </div>
    </div>
  )
}

function GateCheckPanel({ checks }: { checks: ReadonlyArray<{ id: string; label: string; description: string; status: GateCheckStatus; count: string }> }) {
  const warningCount = checks.filter((c) => c.status !== 'passed').length
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-emerald-600" />
          <h2 className="type-body font-semibold text-foreground">导出门禁</h2>
        </div>
        <Badge variant="secondary" className="type-tiny">
          {warningCount > 0 ? `需处理 ${warningCount} 项` : '全部通过'}
        </Badge>
      </div>
      <div className="mt-4 space-y-2">
        {checks.map((check) => {
          const meta = gateMeta[check.status]
          const Icon = meta.icon
          return (
            <div key={check.id} className="flex items-start gap-3 rounded-md border border-border bg-background p-3">
              <div className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md', meta.className)}>
                <Icon size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate type-body font-medium text-foreground">{check.label}</p>
                  <span className="shrink-0 type-label font-medium text-muted-foreground">{check.count}</span>
                </div>
                <p className="mt-1 type-label leading-relaxed text-muted-foreground">{check.description}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function VersionCard({ version, selected, itemCount, onClick }: { version: DeliveryVersion; selected: boolean; itemCount?: number; onClick: () => void }) {
  return (
    <WorkbenchEntityCard
      onClick={onClick}
      active={selected}
      title={version.name || `Delivery #${version.ID}`}
      description={version.description || '未填写版本说明'}
      status={<StatusPill status={version.status} />}
      meta={(
        <>
          <span className="type-caption text-muted-foreground">{version.is_primary ? '主版本' : `#${version.ID}`}</span>
          <span className="type-caption text-muted-foreground">{itemCount === undefined ? formatDuration(version.duration_sec) : `${itemCount} 个片段`}</span>
        </>
      )}
    />
  )
}

function ReadinessCard({ icon: Icon, label, value, detail, tone }: { icon: LucideIcon; label: string; value: number; detail: string; tone: string }) {
  return <WorkbenchMetric icon={Icon} label={label} value={value} detail={detail} tone={deliveryMetricTone(tone)} />
}

function ReadOnlyField({ label, value, strong, className }: { label: string; value: string; strong?: boolean; className?: string }) {
  return <WorkbenchKeyValue label={label} value={value} strong={strong} className={className} />
}

function EmptyBlock({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return <WorkbenchEmptyState icon={Icon} title={title} description={detail} />
}

function StatusPill({ status, label }: { status: string; label?: string }) {
  return <WorkbenchStatusBadge tone={deliveryStatusTone(status)} label={label ?? deliveryStatusLabel(status)} />
}

function deliveryStatusTone(status: string) {
  if (['approved', 'exported', 'locked', 'succeeded'].includes(status)) return 'success'
  if (['checking', 'needs_asset', 'pending', 'running'].includes(status)) return 'warning'
  if (['confirmed'].includes(status)) return 'info'
  if (['missing', 'failed', 'blocked'].includes(status)) return 'danger'
  return 'neutral'
}

function deliveryMetricTone(toneClass: string) {
  if (toneClass.includes('emerald')) return 'success'
  if (toneClass.includes('amber')) return 'warning'
  if (toneClass.includes('rose')) return 'danger'
  if (toneClass.includes('sky') || toneClass.includes('indigo')) return 'info'
  return 'neutral'
}

function formatDuration(seconds?: number) {
  const value = Math.max(0, Math.round(seconds ?? 0))
  const min = Math.floor(value / 60)
  const sec = value % 60
  return `${min}:${String(sec).padStart(2, '0')}`
}

function productionLabel(productionId: number | null | undefined, productions: Production[]) {
  if (!productionId) return '未关联'
  const production = productions.find((item) => item.ID === productionId)
  return production?.name || `制作 #${productionId}`
}

function exportStatusLabel(status: string) {
  return deliveryStatusLabel(status)
}
