import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  Clock3,
  FileVideo,
  Pencil,
  Plus,
  X,
  Video,
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
import {
  DeliveryItemEditor,
  DeliveryOverviewPanel,
  DeliveryResourceAdoptionPanel,
  DeliveryVersionDetailPanel,
  EmptyDeliveryTimeline,
} from '@/components/workbench/DeliveryWorkbenchPanels'
import { ProjectWorkbenchShell } from '@/components/workbench/WorkbenchChrome'
import {
  WorkbenchEmptyState,
  WorkbenchEntityCard,
  WorkbenchMetric,
  WorkbenchStatusBadge,
} from '@/components/workbench/WorkbenchPrimitives'
import { ContentFilterBar } from '@/pages/contents/components/ContentFilterBar'
import {
  buildDeliveryContentUnitMap,
  buildDeliveryGateChecks,
  buildDeliveryReadiness,
  deliveryStatusLabel,
  deliveryVersionFilterLabel,
  deliveryWorkbenchStatusTone,
  parsePositiveDeliveryNumber,
  pickBestDeliveryPreviewTimeline,
  sortDeliveryContentUnits,
  sortDeliveryPreviewTimelineItems,
  sortDeliveryTimelineItems,
  type DeliveryVersionFilter,
} from '@/lib/deliveryWorkbenchModel'
import { formatDeliveryDuration } from '@/lib/deliveryWorkbenchOverviewModel'
import {
  readDeliveryWorkbenchProductionId,
  useDeliveryWorkbenchTimelineSelectionController,
  useDeliveryWorkbenchVersionController,
} from '@/lib/deliveryWorkbenchPageController'
import { useDeliveryWorkbenchResourceLibrary } from '@/lib/deliveryWorkbenchResourceLibrary'
import {
  buildCreateDeliveryTimelineItemMutationOptions,
  buildCreateDeliveryVersionFromProductionTimelineMutationOptions,
  buildCreateExportRecordMutationOptions,
  buildRemoveDeliveryTimelineItemMutationOptions,
  buildSeedDeliveryVersionFromProductionTimelineMutationOptions,
  buildUpdateDeliveryTimelineItemMutationOptions,
} from '@/lib/deliveryWorkbenchMutationController'
import { useProjectStore } from '@/store/projectStore'
import { Badge, Button } from '@movscript/ui'

export default function DeliveryWorkbenchPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedProductionId = readDeliveryWorkbenchProductionId(searchParams)

  const versionsQuery = useQuery({
    queryKey: ['semantic-delivery-versions', projectId, selectedProductionId],
    queryFn: () => listDeliveryVersions(projectId!, selectedProductionId),
    enabled: !!projectId,
  })
  const versions = versionsQuery.data ?? []
  const {
    filter,
    search,
    selectedVersionId,
    selectedVersion,
    visibleVersions,
    setFilter,
    setSearch,
    setSelectedVersionId,
    selectProduction,
  } = useDeliveryWorkbenchVersionController({ searchParams, setSearchParams, versions })

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

  const {
    selectedItemId,
    selectedItem,
    editingItem,
    setSelectedItemId,
    setEditingItem,
  } = useDeliveryWorkbenchTimelineSelectionController({ selectedVersionId, timelineItems })
  const resourceLibrary = useDeliveryWorkbenchResourceLibrary({ projectId, selectedItem })
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
            <Plus size={14} />
            添加片段
          </Button>
          {!selectedVersionId && sourceTimelineCount > 0 ? (
            <Button size="sm" className="gap-1.5" onClick={() => createVersionFromProductionTimeline.mutate()} loading={createVersionFromProductionTimeline.isPending}>
              <Plus size={14} />
              创建交付版
            </Button>
          ) : null}
        </>
      )}
    >
      <ContentWorkspaceLayout
        className="min-h-0 flex-1"
        overview={(
          <DeliveryOverviewPanel
            versions={versions}
            timelineItems={timelineItems}
            versionReadiness={versionReadiness}
            selectedVersion={selectedVersion}
            exportRecords={exportRecords}
            gateChecks={gateChecks}
          />
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
            <WorkbenchEmptyState icon={Clock3} title="正在加载" description="读取交付版本" />
          ) : visibleVersions.length === 0 ? (
            <WorkbenchEmptyState icon={FileVideo} title="暂无版本" description="当前范围还没有可查看的交付版本" />
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
            <DeliveryVersionDetailPanel version={selectedVersion} productions={productions} />

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
                  <WorkbenchEmptyState icon={Video} title="未选择片段" description="从时间线选择一个片段进行编辑" />
                )}
              </div>
            </section>
          </>
        ) : (
          <section className="rounded-lg border border-border bg-card">
            <WorkbenchEmptyState
              icon={FileVideo}
              title="暂无交付版本"
              description={sourceTimelineCount > 0 ? '内容工作区已有预览/制作时间线，可以从顶部创建第一版交付装配。' : '当前范围还没有可查看的交付版本'}
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
            <DeliveryResourceAdoptionPanel
              selectedResource={resourceLibrary.selectedResource}
              resources={resourceLibrary.resources}
              state={resourceLibrary.state}
              pageCount={resourceLibrary.pageCount}
              total={resourceLibrary.total}
              isLoading={resourceLibrary.isLoading}
              updating={updateItem.isPending}
              exportRecords={exportRecords}
              creatingExport={createExport.isPending}
              onSearch={resourceLibrary.setSearch}
              onType={resourceLibrary.setType}
              onPage={resourceLibrary.setPage}
              onAdoptResource={(resource) => patchSelectedItem({ resource_id: resource.ID, kind: resource.type, status: 'locked' })}
              onClearResource={() => patchSelectedItem({ resource_id: null, status: 'missing' })}
              onCreateExport={() => createExport.mutate()}
            />
          </section>
        ) : (
          <section className="rounded-lg border border-border bg-card">
            <WorkbenchEmptyState icon={Video} title="未选择片段" description="从底部时间线选择一个片段查看预览" />
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
            <WorkbenchEmptyState icon={Clock3} title="正在加载" description="读取成片时间线" />
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
          <span className="type-caption text-muted-foreground">{itemCount === undefined ? formatDeliveryDuration(version.duration_sec) : `${itemCount} 个片段`}</span>
        </>
      )}
    />
  )
}

function StatusPill({ status, label }: { status: string; label?: string }) {
  return <WorkbenchStatusBadge tone={deliveryWorkbenchStatusTone(status)} label={label ?? deliveryStatusLabel(status)} />
}
