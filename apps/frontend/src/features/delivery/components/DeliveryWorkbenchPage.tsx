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
} from '@/shared/infrastructure/api/deliveryEntities'
import { DeliveryTimelineTrack } from '@/features/delivery/components/DeliveryTimelineTrack'
import {
  DeliveryItemEditor,
  DeliveryOverviewPanel,
  DeliveryResourceAdoptionPanel,
  DeliveryVersionDetailPanel,
  EmptyDeliveryTimeline,
} from '@/features/delivery/components/DeliveryWorkbenchPanels'
import { useProjectWorkbenchShellProps } from '@/features/project-workbenches/application/useProjectWorkbenchShellProps'
import {
  ProductionDeliveryScopeSelect,
  ProductionDeliveryVersionCard,
  ProductionDeliveryVersionCardMeta,
  ProductionDeliveryVersionListStack,
  ProductionDeliveryVersionListSection,
  ProductionDeliveryVersionListSummaryGrid,
  ProductionDeliveryVersionListViewport,
  ProductionDeliveryWorkbenchActionButton,
  ProductionDeliveryWorkbenchBadge,
  ProductionDeliveryWorkbenchEmptyState,
  ProductionDeliveryWorkbenchLayout,
  ProductionDeliveryWorkbenchMetric,
  ProductionDeliveryWorkbenchSection,
  ProductionDeliveryWorkbenchStatusBadge,
  WorkbenchProjectBody,
  WorkbenchProjectShell,
} from '@movscript/ui'
import { ContentFilterBar } from '@/features/content/presentation/ContentFilterBar'
import {
  buildDeliveryContentUnitMap,
  buildDeliveryGateChecks,
  buildDeliveryReadiness,
  deliveryStatusLabel,
  deliveryVersionFilterLabel,
  parsePositiveDeliveryNumber,
  pickBestDeliveryPreviewTimeline,
  sortDeliveryContentUnits,
  sortDeliveryPreviewTimelineItems,
  sortDeliveryTimelineItems,
  type DeliveryVersionFilter,
} from '@/features/delivery/domain/deliveryWorkbenchModel'
import { deliveryWorkbenchStatusRecipe } from '@/features/delivery/presentation/deliverySemanticUi'
import { formatDeliveryDuration } from '@/features/delivery/domain/deliveryWorkbenchOverviewModel'
import {
  readDeliveryWorkbenchProductionId,
  useDeliveryWorkbenchTimelineSelectionController,
  useDeliveryWorkbenchVersionController,
} from '@/features/delivery/application/deliveryWorkbenchPageController'
import { useDeliveryWorkbenchResourceLibrary } from '@/features/delivery/application/deliveryWorkbenchResourceLibrary'
import {
  buildCreateDeliveryTimelineItemMutationOptions,
  buildCreateDeliveryVersionFromProductionTimelineMutationOptions,
  buildCreateExportRecordMutationOptions,
  buildRemoveDeliveryTimelineItemMutationOptions,
  buildSeedDeliveryVersionFromProductionTimelineMutationOptions,
  buildUpdateDeliveryTimelineItemMutationOptions,
} from '@/features/delivery/application/deliveryWorkbenchMutationController'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import { ROUTES } from '@/routes/projectRoutes'

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
  } = useDeliveryWorkbenchVersionController({
    projectId,
    route: ROUTES.project.deliveryWorkbench,
    searchParams,
    setSearchParams,
    versions,
  })

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
  } = useDeliveryWorkbenchTimelineSelectionController({
    projectId,
    route: ROUTES.project.deliveryWorkbench,
    selectedProductionId,
    selectedVersionId,
    timelineItems,
  })
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

  const workbenchShellProps = useProjectWorkbenchShellProps({
    workbenchId: 'delivery',
    projectName: project?.name,
    kicker: selectedProduction ? `${selectedProduction.name || `制作 #${selectedProduction.ID}`} · 交付` : '交付',
    title: '交付工作台',
    description: '总览制作下的交付版本、成片时间线、资源覆盖、审核状态和导出记录；允许在交付层微调片段顺序、时长和资源采用，不回写剧本结构。',
    badges: selectedProduction ? (
      <ProductionDeliveryWorkbenchBadge>
        当前制作：{selectedProduction.status || '未标记状态'}
      </ProductionDeliveryWorkbenchBadge>
    ) : (
      <ProductionDeliveryWorkbenchBadge variant="outline">全部制作</ProductionDeliveryWorkbenchBadge>
    ),
    onRefresh: refreshAll,
    refreshing: versionsQuery.isFetching || itemsQuery.isFetching,
    refreshLabel: '刷新',
    actions: (
      <>
        <ProductionScopeSelect
          productions={productions}
          value={selectedProductionId}
          loading={productionsQuery.isLoading}
          onChange={selectProduction}
        />
        <ProductionDeliveryWorkbenchActionButton size="sm" disabled={!selectedVersionId} onClick={() => createItem.mutate()} loading={createItem.isPending}>
          <Plus size={14} />
          添加片段
        </ProductionDeliveryWorkbenchActionButton>
        {!selectedVersionId && sourceTimelineCount > 0 ? (
          <ProductionDeliveryWorkbenchActionButton size="sm" onClick={() => createVersionFromProductionTimeline.mutate()} loading={createVersionFromProductionTimeline.isPending}>
            <Plus size={14} />
            创建交付版
          </ProductionDeliveryWorkbenchActionButton>
        ) : null}
      </>
    ),
  })

  return (
    <WorkbenchProjectShell {...workbenchShellProps}>
      <WorkbenchProjectBody padding="none" scroll="hidden">
        <ProductionDeliveryWorkbenchLayout
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
            options: (['all', 'workspace', 'checking', 'approved', 'exported'] as const).map((item) => ({
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
        <ProductionDeliveryVersionListSection
          title="版本列表"
          description="搜索、筛选并选择要查看的交付版本。"
        >
          <ProductionDeliveryVersionListSummaryGrid>
            <SummaryTile label="版本" value={versions.length} />
            <SummaryTile label="可导出" value={versions.filter((item) => ['approved', 'exported'].includes(item.status)).length} />
          </ProductionDeliveryVersionListSummaryGrid>

          <ProductionDeliveryVersionListViewport>
            {versionsQuery.isLoading ? (
              <ProductionDeliveryWorkbenchEmptyState icon={Clock3} title="正在加载" description="读取交付版本" />
            ) : visibleVersions.length === 0 ? (
              <ProductionDeliveryWorkbenchEmptyState icon={FileVideo} title="暂无版本" description="当前范围还没有可查看的交付版本" />
            ) : (
              <ProductionDeliveryVersionListStack>
                {visibleVersions.map((version) => (
                  <VersionCard
                    key={version.ID}
                    version={version}
                    selected={version.ID === selectedVersionId}
                    itemCount={version.ID === selectedVersionId ? timelineItems.length : undefined}
                    onClick={() => setSelectedVersionId(version.ID)}
                  />
                ))}
              </ProductionDeliveryVersionListStack>
            )}
          </ProductionDeliveryVersionListViewport>
        </ProductionDeliveryVersionListSection>
      )}
      detail={(
        selectedVersion ? (
          <>
            <DeliveryVersionDetailPanel version={selectedVersion} productions={productions} />

            <ProductionDeliveryWorkbenchSection
              title="片段详情"
              description="在交付层微调顺序、时长、资源采用和审核状态。"
              action={selectedItem ? (
                <ProductionDeliveryWorkbenchActionButton size="sm" variant="outline" onClick={() => setEditingItem((value) => !value)} disabled={updateItem.isPending}>
                  {editingItem ? <X size={14} /> : <Pencil size={14} />}
                  {editingItem ? '结束编辑' : '编辑'}
                </ProductionDeliveryWorkbenchActionButton>
              ) : null}
            >
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
                <ProductionDeliveryWorkbenchEmptyState icon={Video} title="未选择片段" description="从时间线选择一个片段进行编辑" />
              )}
            </ProductionDeliveryWorkbenchSection>
          </>
        ) : (
          <ProductionDeliveryWorkbenchSection>
            <ProductionDeliveryWorkbenchEmptyState
              icon={FileVideo}
              title="暂无交付版本"
              description={sourceTimelineCount > 0 ? '内容工作区已有预览/制作时间线，可以从顶部创建第一版交付装配。' : '当前范围还没有可查看的交付版本'}
            />
          </ProductionDeliveryWorkbenchSection>
        )
      )}
      preview={(
        selectedItem ? (
          <ProductionDeliveryWorkbenchSection
            title="成片预览"
            description="预览当前片段资源，并可在交付层替换采用版本。"
          >
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
          </ProductionDeliveryWorkbenchSection>
        ) : (
          <ProductionDeliveryWorkbenchSection>
            <ProductionDeliveryWorkbenchEmptyState icon={Video} title="未选择片段" description="从底部时间线选择一个片段查看预览" />
          </ProductionDeliveryWorkbenchSection>
        )
      )}
      upstream={null}
      downstream={null}
      bottom={(
        <ProductionDeliveryWorkbenchSection
          title="成片时间线"
          description="按 DeliveryTimelineItem 组织正式交付片段，不回写剧本结构。"
          action={<StatusPill status={versionReadiness.ready ? 'approved' : 'checking'} label={versionReadiness.ready ? '可导出' : '待补齐'} />}
        >
          {itemsQuery.isLoading ? (
            <ProductionDeliveryWorkbenchEmptyState icon={Clock3} title="正在加载" description="读取成片时间线" />
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
        </ProductionDeliveryWorkbenchSection>
      )}
        />
      </WorkbenchProjectBody>
    </WorkbenchProjectShell>
  )
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return <ProductionDeliveryWorkbenchMetric label={label} value={value} compact />
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
    <ProductionDeliveryScopeSelect
      label="制作范围"
      controlSize="sm"
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
    </ProductionDeliveryScopeSelect>
  )
}

function VersionCard({ version, selected, itemCount, onClick }: { version: DeliveryVersion; selected: boolean; itemCount?: number; onClick: () => void }) {
  return (
    <ProductionDeliveryVersionCard
      onClick={onClick}
      active={selected}
      title={version.name || `Delivery #${version.ID}`}
      description={version.description || '未填写版本说明'}
      status={<StatusPill status={version.status} />}
      meta={(
        <>
          <ProductionDeliveryVersionCardMeta>{version.is_primary ? '主版本' : `#${version.ID}`}</ProductionDeliveryVersionCardMeta>
          <ProductionDeliveryVersionCardMeta>{itemCount === undefined ? formatDeliveryDuration(version.duration_sec) : `${itemCount} 个片段`}</ProductionDeliveryVersionCardMeta>
        </>
      )}
    />
  )
}

function StatusPill({ status, label }: { status: string; label?: string }) {
  return <ProductionDeliveryWorkbenchStatusBadge {...deliveryWorkbenchStatusRecipe(status)} label={label ?? deliveryStatusLabel(status)} />
}
