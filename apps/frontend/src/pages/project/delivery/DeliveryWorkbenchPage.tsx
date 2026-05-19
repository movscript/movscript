import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  FileVideo,
  Film,
  ListChecks,
  Pencil,
  Plus,
  RefreshCcw,
  Route,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
  Video,
  type LucideIcon,
} from 'lucide-react'

import {
  createDeliveryTimelineItem,
  createDeliveryVersion,
  createExportRecord,
  deleteDeliveryTimelineItem,
  listContentUnits,
  listDeliveryTimelineItems,
  listDeliveryVersions,
  listExportRecords,
  listPreviewTimelineItems,
  listPreviewTimelines,
  listProductions,
  resourceFromId,
  updateDeliveryTimelineItem,
  type ContentUnit,
  type DeliveryTimelineItem,
  type DeliveryVersion,
  type ExportRecord,
  type PreviewTimelineItem,
  type Production,
} from '@/api/deliveryEntities'
import { ContentWorkspaceLayout } from '@/components/layout/ContentWorkspaceLayout'
import { MediaViewer } from '@/components/shared/MediaViewer'
import { ResourceLibraryPicker, type ResourceTypeFilter } from '@/components/shared/ResourceLibraryPicker'
import { ContentFilterBar } from '@/pages/contents/components/ContentFilterBar'
import { buildContentWorkbenchUnitTrack } from '@/lib/contentWorkbenchUnitTrack'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import type { PaginatedResponse, RawResource } from '@/types'
import { Badge, Button, Input, Label, Progress as ProgressBar } from '@movscript/ui'

type VersionFilter = 'all' | 'draft' | 'checking' | 'approved' | 'exported'

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
  const [filter, setFilter] = useState<VersionFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [editingItem, setEditingItem] = useState(false)
  const [resourceSearch, setResourceSearch] = useState('')
  const [resourceType, setResourceType] = useState<ResourceTypeFilter>('video')
  const [resourcePage, setResourcePage] = useState(1)
  const selectedProductionId = numberOrNull(searchParams.get('productionId'))

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
    () => [...(itemsQuery.data ?? [])].sort((a, b) => a.order - b.order || a.ID - b.ID),
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
    ?? bestPreviewTimeline(previewTimelines)?.ID
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

  const visibleVersions = useMemo(() => {
    const q = search.trim().toLowerCase()
    return versions.filter((item) => {
      const matchesFilter = filter === 'all' || item.status === filter
      const haystack = `${item.name} ${item.description ?? ''} ${item.status} ${item.ID}`.toLowerCase()
      return matchesFilter && (!q || haystack.includes(q))
    })
  }, [filter, search, versions])

  const selectedItem = timelineItems.find((item) => item.ID === selectedItemId) ?? null
  const resources = resourcesQuery.data?.items ?? []
  const resourceTotal = resourcesQuery.data?.total ?? 0
  const resourcePageCount = Math.max(1, Math.ceil(resourceTotal / resourcePageSize))
  const selectedResource = selectedItem?.resource_id
    ? resources.find((item) => item.ID === selectedItem.resource_id) ?? resourceFromId(selectedItem.resource_id, resourceTypeForTimelineKind(selectedItem.kind), selectedItem.label || `Resource #${selectedItem.resource_id}`)
    : null
  const versionReadiness = readiness(timelineItems)
  const sourceContentUnits = useMemo(
    () => [...(contentUnitsQuery.data ?? [])].sort((a, b) => a.order - b.order || a.ID - b.ID),
    [contentUnitsQuery.data],
  )
  const sourcePreviewTimelineItems = useMemo(
    () => [...(previewTimelineItemsQuery.data ?? [])].sort((a, b) => a.order - b.order || a.ID - b.ID),
    [previewTimelineItemsQuery.data],
  )
  const sourceTimelineCount = sourcePreviewTimelineItems.length || sourceContentUnits.length
  const contentUnitById = new Map(sourceContentUnits.map((item) => [item.ID, item]))

  const gateChecks = useMemo(() => {
    const total = timelineItems.length
    const unlinked = timelineItems.filter((i) => !i.content_unit_id).length
    const timelineOk = total > 0 && unlinked === 0
    const assetOk = versionReadiness.missingCount === 0 && versionReadiness.noResourceCount === 0
    const versionOk = selectedVersion ? ['approved', 'exported'].includes(selectedVersion.status) : false
    const exportOk = timelineOk && assetOk && versionOk
    return [
      {
        id: 'timeline',
        label: '时间线完整性',
        description: total === 0
          ? '尚未添加任何片段。'
          : unlinked > 0
            ? `${unlinked} 个片段未绑定制作项。`
            : `全部 ${total} 个片段已绑定制作项。`,
        status: timelineOk ? 'passed' : 'warning',
        count: `${total - unlinked}/${total}`,
      },
      {
        id: 'assets',
        label: '素材完整性',
        description: assetOk
          ? '全部媒体片段已锁定资源。'
          : `${versionReadiness.missingCount + versionReadiness.noResourceCount} 个片段缺少成片资源。`,
        status: assetOk ? 'passed' : 'warning',
        count: assetOk ? '全部就绪' : `${versionReadiness.missingCount + versionReadiness.noResourceCount} 项`,
      },
      {
        id: 'version',
        label: '版本审核',
        description: versionOk
          ? '版本已批准，可以导出。'
          : `当前版本状态为「${deliveryStatusLabel(selectedVersion?.status ?? 'draft')}」，需推进到「已批准」。`,
        status: versionOk ? 'passed' : 'warning',
        count: selectedVersion ? deliveryStatusLabel(selectedVersion.status) : '未选择',
      },
      {
        id: 'export',
        label: '导出条件',
        description: exportOk ? '全部门禁通过，可以创建导出记录。' : '需先满足以上条件才能导出。',
        status: exportOk ? 'passed' : (timelineOk && assetOk ? 'warning' : 'blocked'),
        count: exportOk ? '可导出' : '未就绪',
      },
    ] as const
  }, [timelineItems, versionReadiness, selectedVersion])

  const versionKey = ['semantic-delivery-versions', projectId, selectedProductionId]
  const itemsKey = ['semantic-delivery-timeline-items', projectId, selectedVersionId]
  const exportsKey = ['semantic-export-records', projectId, selectedVersionId]

  async function createTimelineItemsFromSource(deliveryVersionId: number) {
    if (sourcePreviewTimelineItems.length > 0) {
      for (const [index, item] of sourcePreviewTimelineItems.entries()) {
        await createDeliveryTimelineItem(projectId!, {
          delivery_version_id: deliveryVersionId,
          content_unit_id: nullableNumber(item.content_unit_id),
          segment_id: nullableNumber(item.segment_id),
          scene_moment_id: nullableNumber(item.scene_moment_id),
          keyframe_id: nullableNumber(item.keyframe_id),
          kind: deliveryKindFromPreviewItem(item.kind),
          order: item.order || index + 1,
          start_sec: Number.isFinite(item.start_sec) ? item.start_sec : index * 3,
          duration_sec: Math.max(0.5, Number(item.duration_sec) || 3),
          label: item.label || `预览片段 ${index + 1}`,
          status: deliveryStatusFromPreviewItem(item),
          metadata_json: item.metadata_json,
        })
      }
      return
    }
    let cursor = 0
    const units = sourceContentUnits.length > 0 ? sourceContentUnits : []
    for (const [index, unit] of units.entries()) {
      const duration = Math.max(0.5, Number(unit.duration_sec) || 3)
      await createDeliveryTimelineItem(projectId!, {
        delivery_version_id: deliveryVersionId,
        content_unit_id: unit.ID,
        kind: deliveryKindFromContentUnit(unit.kind),
        order: index + 1,
        start_sec: cursor,
        duration_sec: duration,
        label: unit.title || `制作项 #${unit.ID}`,
        status: 'missing',
      })
      cursor += duration
    }
  }

  const createVersionFromProductionTimeline = useMutation({
    mutationFn: async () => {
      const version = await createDeliveryVersion(projectId!, {
        production_id: selectedProductionId,
        preview_timeline_id: sourcePreviewTimelineId,
        name: `交付版本 ${versions.length + 1}`,
        status: 'draft',
        is_primary: versions.length === 0,
        duration_sec: sumSourceTimelineDuration(sourcePreviewTimelineItems, sourceContentUnits),
      })
      await createTimelineItemsFromSource(version.ID)
      return version
    },
    onSuccess: (version) => {
      qc.invalidateQueries({ queryKey: versionKey })
      qc.invalidateQueries({ queryKey: ['semantic-delivery-timeline-items', projectId, version.ID] })
      setSelectedVersionId(version.ID)
      setSelectedItemId(null)
    },
  })

  const seedSelectedVersionFromProductionTimeline = useMutation({
    mutationFn: async () => {
      if (!selectedVersionId) return
      await createTimelineItemsFromSource(selectedVersionId)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: itemsKey }),
  })

  const createItem = useMutation({
    mutationFn: () => {
      const last = timelineItems[timelineItems.length - 1]
      const nextStart = last ? last.start_sec + last.duration_sec : 0
      return createDeliveryTimelineItem(projectId!, {
        delivery_version_id: selectedVersionId!,
        kind: 'video',
        order: last ? last.order + 1 : 1,
        start_sec: nextStart,
        duration_sec: 3,
        label: `成片片段 ${timelineItems.length + 1}`,
        status: 'missing',
      })
    },
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: itemsKey })
      setSelectedItemId(item.ID)
      setEditingItem(true)
    },
  })

  const updateItem = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<DeliveryTimelineItem> }) => updateDeliveryTimelineItem(projectId!, id, {
      ...payload,
      delivery_version_id: selectedVersionId!,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: itemsKey }),
  })

  const removeItem = useMutation({
    mutationFn: (id: number) => deleteDeliveryTimelineItem(projectId!, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: itemsKey })
      setSelectedItemId(null)
    },
  })

  const createExport = useMutation({
    mutationFn: () => createExportRecord(projectId!, {
      delivery_version_id: selectedVersionId!,
      status: 'pending',
      format: 'mp4',
      preset: '1080p',
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: exportsKey }),
  })

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
    <ContentWorkspaceLayout
      header={(
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Film size={14} />
              <span>{project?.name ?? '当前项目'}</span>
              <ChevronRight size={13} />
              {selectedProduction ? (
                <>
                  <span>{selectedProduction.name || `制作 #${selectedProduction.ID}`}</span>
                  <ChevronRight size={13} />
                </>
              ) : null}
              <span>交付</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal">交付工作台</h1>
            <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
              总览制作下的交付版本、成片时间线、资源覆盖、审核状态和导出记录；允许在交付层微调片段顺序、时长和资源采用，不回写剧本结构。
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ProductionScopeSelect
                productions={productions}
                value={selectedProductionId}
                loading={productionsQuery.isLoading}
                onChange={selectProduction}
              />
              {selectedProduction ? (
                <Badge variant="secondary" className="text-[10px]">
                  当前制作：{selectedProduction.status || '未标记状态'}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">全部制作</Badge>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={refreshAll} loading={versionsQuery.isFetching || itemsQuery.isFetching}>
              <RefreshCcw size={15} />
              刷新
            </Button>
            <Button className="gap-2" disabled={!selectedVersionId} onClick={() => createItem.mutate()} loading={createItem.isPending}>
              <Plus size={15} />
              添加交付片段
            </Button>
            {!selectedVersionId && sourceTimelineCount > 0 ? (
              <Button className="gap-2" onClick={() => createVersionFromProductionTimeline.mutate()} loading={createVersionFromProductionTimeline.isPending}>
                <Plus size={15} />
                从预览时间线创建交付版
              </Button>
            ) : null}
          </div>
        </header>
      )}
      overview={(
        <div className="space-y-3">
          <section className="grid grid-cols-4 gap-3">
            <ReadinessCard icon={FileVideo} label="交付版本" value={versions.length} detail={`${versions.filter((item) => ['approved', 'exported'].includes(item.status)).length} 个可导出`} tone="text-indigo-600" />
            <ReadinessCard icon={ListChecks} label="时间线片段" value={timelineItems.length} detail={`${formatDuration(sumDuration(timelineItems))} 总时长`} tone="text-sky-600" />
            <ReadinessCard icon={AlertTriangle} label="缺失内容" value={versionReadiness.missingCount + versionReadiness.noResourceCount} detail="missing / needs_asset / 无资源" tone="text-amber-600" />
            <ReadinessCard icon={Download} label="导出记录" value={exportRecords.length} detail={exportRecords[0]?.status ? exportStatusLabel(exportRecords[0].status) : '尚未导出'} tone="text-emerald-600" />
          </section>
          {selectedVersion && (
            <section className="grid grid-cols-[minmax(0,1fr)_340px] gap-4">
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
            onChange: (value) => setFilter(value as VersionFilter),
            options: (['all', 'draft', 'checking', 'approved', 'exported'] as const).map((item) => ({
              value: item,
              label: versionFilterLabel(item),
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
              <h2 className="text-sm font-semibold tracking-normal">版本列表</h2>
              <p className="mt-1 text-xs text-muted-foreground">搜索、筛选并选择要查看的交付版本。</p>
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
                  {selectedVersion.is_primary && <span className="rounded bg-primary/10 px-2 py-1 text-xs text-primary">主版本</span>}
                  {selectedVersion.production_id && <span className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">制作 #{selectedVersion.production_id}</span>}
                  {selectedVersion.preview_timeline_id && <span className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">预览 #{selectedVersion.preview_timeline_id}</span>}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">版本详情</h2>
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
                    <h2 className="text-sm font-semibold">片段详情</h2>
                    <p className="mt-1 text-xs text-muted-foreground">在交付层微调顺序、时长、资源采用和审核状态。</p>
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
                  <ItemEditor
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
              <h2 className="text-sm font-semibold">成片预览</h2>
              <p className="mt-1 text-xs text-muted-foreground">预览当前片段资源，并可在交付层替换采用版本。</p>
            </div>
            <div className="space-y-4 p-4">
                  <div>
                    <Label className="mb-2 block text-xs font-medium text-muted-foreground">成片资源</Label>
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
                  <ExportPanel exportRecords={exportRecords} onCreate={() => createExport.mutate()} creating={createExport.isPending} />
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
              <h2 className="text-sm font-semibold">成片时间线</h2>
              <p className="mt-1 text-xs text-muted-foreground">按 DeliveryTimelineItem 组织正式交付片段，不回写剧本结构。</p>
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
  )
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
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
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>制作范围</span>
      <select
        className="ms-input h-8 min-w-48 bg-background text-xs"
        value={value ?? ''}
        disabled={loading}
        onChange={(event) => onChange(numberOrNull(event.target.value))}
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
  readiness: ReturnType<typeof readiness>
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
            <h2 className="text-sm font-semibold text-foreground">{version.name || `Delivery #${version.ID}`}</h2>
            <Badge className={cn('text-[10px]', statusTone[version.status] ?? 'bg-muted text-muted-foreground')}>
              {deliveryStatusLabel(version.status)}
            </Badge>
            {version.is_primary && (
              <Badge className="text-[10px] bg-primary/10 text-primary">主版本</Badge>
            )}
          </div>
          <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
            {version.description || '未填写版本说明'}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-right shrink-0">
          <div>
            <p className={cn('text-xl font-semibold tabular-nums', warningCount > 0 ? 'text-amber-600' : 'text-emerald-600')}>{completion}%</p>
            <p className="mt-1 text-xs text-muted-foreground">完成度</p>
          </div>
          <div>
            <p className="text-xl font-semibold tabular-nums">{formatDuration(sumDuration(items))}</p>
            <p className="mt-1 text-xs text-muted-foreground">总时长</p>
          </div>
          <div>
            <p className={cn('text-xl font-semibold tabular-nums', warningCount > 0 ? 'text-amber-600' : 'text-foreground')}>{warningCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">待处理</p>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
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
          <h2 className="text-sm font-semibold text-foreground">导出门禁</h2>
        </div>
        <Badge variant="secondary" className="text-[10px]">
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
                  <p className="truncate text-sm font-medium text-foreground">{check.label}</p>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">{check.count}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{check.description}</p>
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
    <button
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-muted/50',
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{version.name || `Delivery #${version.ID}`}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{version.description || '未填写版本说明'}</p>
        </div>
        <StatusPill status={version.status} />
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{version.is_primary ? '主版本' : `#${version.ID}`}</span>
        <span>{itemCount === undefined ? formatDuration(version.duration_sec) : `${itemCount} 个片段`}</span>
      </div>
    </button>
  )
}

function ReadinessCard({ icon: Icon, label, value, detail, tone }: { icon: LucideIcon; label: string; value: number; detail: string; tone: string }) {
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

function DeliveryTimelineTrack({
  items,
  contentUnitById,
  selectedId,
  onSelect,
  onPatchItem,
}: {
  items: DeliveryTimelineItem[]
  contentUnitById: Map<number, ContentUnit>
  selectedId: number | null
  onSelect: (id: number) => void
  onPatchItem: (id: number, payload: Partial<DeliveryTimelineItem>) => void
}) {
  const [timelineZoom, setTimelineZoom] = useState(1)
  const [resizing, setResizing] = useState<{
    id: number
    startClientX: number
    startDurationSec: number
    nextDurationSec: number
    pxPerSec: number
  } | null>(null)
  useEffect(() => {
    if (!resizing) return
    const activeResize = resizing
    function handlePointerMove(event: PointerEvent) {
      const deltaSec = (event.clientX - activeResize.startClientX) / activeResize.pxPerSec
      const nextDurationSec = Math.max(0.5, Math.round((activeResize.startDurationSec + deltaSec) * 10) / 10)
      setResizing((current) => current && current.id === activeResize.id ? { ...current, nextDurationSec } : current)
    }
    function handlePointerUp() {
      onPatchItem(activeResize.id, { duration_sec: activeResize.nextDurationSec })
      setResizing(null)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [onPatchItem, resizing])

  const focusedItems = items.filter((item) => deliveryTimelineVisualKind(item) !== null)
  const summary = buildContentWorkbenchUnitTrack(focusedItems.map((item) => {
    const contentUnit = item.content_unit_id ? contentUnitById.get(item.content_unit_id) : undefined
    const kind = deliveryTimelineVisualKind(item) ?? 'video'
    const requiresResource = ['video', 'image', 'audio'].includes(kind)
    const missingResource = requiresResource && !item.resource_id
    const missingStatus = ['missing', 'needs_asset'].includes(String(item.status ?? ''))
    return {
      id: item.ID,
      title: item.label || contentUnit?.title || `片段 ${item.ID}`,
      kind,
      startSec: item.start_sec,
      durationSec: item.duration_sec,
      status: item.status,
      summary: contentUnit ? contentUnit.title : item.metadata_json,
      sceneMomentTitle: item.scene_moment_id ? `#${item.scene_moment_id}` : '',
      segmentTitle: item.segment_id ? `#${item.segment_id}` : '',
      keyframeTitles: item.keyframe_id ? [`关键帧 #${item.keyframe_id}`] : [],
      missingAssetTitles: missingResource || missingStatus ? ['成片资源未锁定'] : [],
      requiresKeyframe: false,
      timeSource: 'preview' as const,
      hasPrompt: true,
      assetSlotCount: item.resource_id ? 1 : 0,
      missingSlotCount: missingResource || missingStatus ? 1 : 0,
      keyframeCount: item.keyframe_id ? 1 : 0,
      selected: selectedId === item.ID,
    }
  }))
  const timelineItems = summary.items
  const timelineOriginSec = deliveryTimelineOriginSec(timelineItems)
  const timelineContentDurationSec = Math.max(1, summary.items.reduce((max, item) => Math.max(max, item.endSec - timelineOriginSec), 0))
  const pxPerSec = deliveryTimelinePxPerSec(timelineZoom)
  const rulerWidth = deliveryTimelineRulerWidth(timelineItems, timelineOriginSec, pxPerSec)
  const canvasWidth = rulerWidth + 124
  const timelineDurationSec = rulerWidth / pxPerSec
  const ticks = buildDeliveryTimeTicks(timelineDurationSec, pxPerSec)
  const selectedItem = timelineItems.find((item) => item.selected) ?? timelineItems[0] ?? null
  const selectedStartSec = selectedItem ? deliveryLocalTimelineSec(selectedItem.startSec, timelineOriginSec) : 0
  const lanes = Array.from(new Set(timelineItems.map((item) => String(item.kind || 'video'))))
    .sort((a, b) => deliveryTimelineKindRank(a) - deliveryTimelineKindRank(b) || deliveryKindLabel(a).localeCompare(deliveryKindLabel(b), 'zh-Hans-CN'))
    .map((kind) => ({
      key: kind,
      label: deliveryKindLabel(kind),
      detail: deliveryLaneDetail(kind),
      items: timelineItems.filter((item) => String(item.kind || 'video') === kind),
    }))

  return (
    <div className="border-t border-border p-3" data-testid="delivery-timeline-track">
      <div className="rounded-md border border-border bg-background p-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Route size={15} className="text-muted-foreground" />
              成片时间线
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              复用内容工作区的制作项时间轴样式；成片预剪辑只关注视频 shot 和关键帧，拖拽视频块右侧可调整最终导出时长。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{summary.total} 视频/关键帧</span>
            <span className="text-border">/</span>
            <span>{formatTrackDuration(summary.durationSec)}</span>
            <span className="text-border">/</span>
            <span className={summary.blockedCount > 0 ? 'text-amber-700 dark:text-amber-300' : undefined}>{summary.blockedCount} 待补齐</span>
          </div>
        </div>

        <div className="mt-2.5 overflow-x-auto pb-1">
          <div className="flex min-w-max gap-2">
            {timelineItems.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid="delivery-timeline-card"
                onClick={() => onSelect(Number(item.id))}
                className={cn(
                  'w-[172px] shrink-0 rounded-md border px-2 py-1.5 text-left transition-colors',
                  item.selected
                    ? 'border-primary/60 bg-primary/5'
                    : item.tone === 'blocked'
                      ? 'border-amber-200 bg-amber-50/60 hover:border-primary/50 hover:bg-primary/5 dark:border-amber-900/60 dark:bg-amber-950/20'
                      : 'border-border bg-card hover:border-primary/50 hover:bg-primary/5',
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">{String(item.order).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.title}</span>
                </div>
                <span className="mt-1 block truncate text-[11px] text-muted-foreground">{deliveryKindLabel(item.kind)} · {item.labels.slice(0, 2).join(' · ')}</span>
                <span className={cn('mt-1 block truncate text-[11px]', item.blockers.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300')}>
                  {item.blockers[0] || '交付输入可用'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-md border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-2.5 py-2">
            <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
              <Clock3 size={15} className="shrink-0 text-muted-foreground" />
              <span className="truncate">成片时间轴</span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <div className="flex items-center overflow-hidden rounded-md border border-border bg-background">
                <button type="button" className="h-7 px-2 text-xs text-muted-foreground hover:bg-primary/5 hover:text-foreground" onClick={() => setTimelineZoom((value) => Math.max(0.05, Math.round((value / 1.25) * 1000) / 1000))} aria-label="缩小时间轴">-</button>
                <span className="border-x border-border px-2 text-[11px] tabular-nums text-muted-foreground">{Math.round(timelineZoom * 100)}%</span>
                <button type="button" className="h-7 px-2 text-xs text-muted-foreground hover:bg-primary/5 hover:text-foreground" onClick={() => setTimelineZoom((value) => Math.round((value * 1.25) * 1000) / 1000)} aria-label="放大时间轴">+</button>
                <button type="button" className="h-7 border-l border-border px-2 text-[11px] text-muted-foreground hover:bg-primary/5 hover:text-foreground" onClick={() => setTimelineZoom(1)} aria-label="重置时间轴缩放">1:1</button>
              </div>
              {selectedItem ? <Badge variant="secondary">播放头 {formatTrackClock(selectedStartSec)}</Badge> : null}
              <Badge variant="outline">{formatTrackDuration(timelineContentDurationSec)}</Badge>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div style={{ minWidth: canvasWidth }}>
              <div className="border-b border-border bg-background px-2.5 py-2.5">
                <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
                  <div className="text-[11px] font-medium text-muted-foreground">时间尺</div>
                  <div className="relative h-8 rounded bg-muted/40">
                    {selectedItem ? (
                      <div className="absolute top-0 z-10 h-full border-l-2 border-primary" style={{ left: trackTimelinePx(selectedStartSec, pxPerSec) }}>
                        <span className="ml-1 mt-1 block rounded bg-primary px-1 py-0.5 text-[10px] leading-none text-primary-foreground shadow-sm">{formatTrackClock(selectedStartSec)}</span>
                      </div>
                    ) : null}
                    {ticks.map((tick) => (
                      <div key={tick.seconds} className="absolute top-0 h-full border-l border-border/80 pl-1" style={{ left: trackTimelinePx(tick.seconds, pxPerSec) }}>
                        <span className="absolute bottom-0 text-[10px] leading-4 text-muted-foreground">{tick.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-2 space-y-1.5">
                  {lanes.map((lane) => (
                    <div key={lane.key} className="grid grid-cols-[112px_minmax(0,1fr)] gap-2">
                      <div className="min-w-0 rounded bg-muted/30 px-2 py-1.5">
                        <p className="truncate text-[11px] font-medium text-foreground">{lane.label}</p>
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{lane.detail}</p>
                      </div>
                      <div className="relative h-[46px] rounded border border-border bg-muted/20" data-testid="delivery-timeline-lane" data-lane-kind={lane.key}>
                        {selectedItem ? <span aria-hidden="true" className="pointer-events-none absolute top-0 z-10 h-full border-l-2 border-primary/70" style={{ left: trackTimelinePx(selectedStartSec, pxPerSec) }} /> : null}
                        {ticks.map((tick) => (
                          <span key={`${lane.key}-${tick.seconds}`} className="pointer-events-none absolute top-0 h-full border-l border-border/50" style={{ left: trackTimelinePx(tick.seconds, pxPerSec) }} />
                        ))}
                        {lane.items.map((item) => {
                          const isVideo = item.kind === 'video'
                          const previewDuration = resizing?.id === Number(item.id) ? resizing.nextDurationSec : item.durationSec
                          return (
                          <button
                            key={`${lane.key}-${item.id}`}
                            type="button"
                            data-testid="delivery-timeline-block"
                            onClick={() => onSelect(Number(item.id))}
                            className={cn(
                              'absolute top-1 h-9 min-w-0 overflow-hidden rounded border px-1.5 py-1 text-left text-[11px] shadow-sm transition-colors hover:border-primary/60 hover:bg-primary/5',
                              item.selected ? 'border-primary/70 bg-primary/10' : item.tone === 'blocked' ? 'border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/20' : 'border-border bg-card',
                            )}
                            style={{
                              left: trackTimelinePx(deliveryLocalTimelineSec(item.startSec, timelineOriginSec), pxPerSec),
                              width: trackTimelineWidthPx(previewDuration, pxPerSec),
                            }}
                          >
                            <span className="block truncate font-medium text-foreground">{String(item.order).padStart(2, '0')} {item.title}</span>
                            <span className={cn('block truncate text-[10px]', item.tone === 'blocked' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
                              {item.blockers[0] || formatTrackTimeRange(deliveryLocalTimelineSec(item.startSec, timelineOriginSec), deliveryLocalTimelineSec(item.startSec, timelineOriginSec) + previewDuration, previewDuration)}
                            </span>
                            {isVideo ? (
                              <span
                                role="separator"
                                aria-orientation="vertical"
                                aria-label="拖拽调整 shot 时长"
                                title="拖拽调整 shot 时长"
                                onPointerDown={(event) => {
                                  event.preventDefault()
                                  event.stopPropagation()
                                  onSelect(Number(item.id))
                                  setResizing({
                                    id: Number(item.id),
                                    startClientX: event.clientX,
                                    startDurationSec: item.durationSec,
                                    nextDurationSec: item.durationSec,
                                    pxPerSec,
                                  })
                                }}
                                className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r bg-primary/0 hover:bg-primary/30"
                              />
                            ) : null}
                          </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-[64px_96px_104px_minmax(220px,1fr)_160px_104px] gap-2 border-b border-border bg-muted/30 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground">
                <span>顺序</span>
                <span>时间</span>
                <span>类型</span>
                <span>内容</span>
                <span>关键帧 / 缺口</span>
                <span className="text-right">状态</span>
              </div>
              {summary.items.map((item) => (
                <button
                  key={`schedule-${item.id}`}
                  type="button"
                  data-testid="delivery-schedule-row"
                  onClick={() => onSelect(Number(item.id))}
                  className={cn(
                    'grid w-full grid-cols-[64px_96px_104px_minmax(220px,1fr)_160px_104px] gap-2 border-b border-border/70 px-2.5 py-2 text-left text-xs transition-colors last:border-b-0 hover:bg-primary/5',
                    item.selected ? 'bg-primary/5' : 'bg-background',
                  )}
                >
                  <span className="tabular-nums text-muted-foreground">{String(item.order).padStart(2, '0')}</span>
                  <span className="tabular-nums text-muted-foreground">{formatTrackTimeRange(deliveryLocalTimelineSec(item.startSec, timelineOriginSec), deliveryLocalTimelineSec(item.endSec, timelineOriginSec), item.durationSec)}</span>
                  <span className="truncate text-foreground">{deliveryKindLabel(item.kind)}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{item.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{item.summary || '交付片段'}</span>
                  </span>
                  <span className={cn('truncate', item.missingAssetTitles.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground')}>
                    {item.keyframeTitles[0] || item.missingAssetTitles[0] || '资源已挂载或无需资源'}
                  </span>
                  <span className="flex justify-end overflow-hidden">
                    <Badge variant={item.tone === 'blocked' ? 'warning' : item.tone === 'ready' ? 'success' : item.tone === 'running' ? 'secondary' : 'outline'} className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[10px]">
                      {item.blockers.length > 0 ? item.blockers[0] : timelineStatusLabel(items.find((entry) => String(entry.ID) === item.id)?.status ?? 'confirmed')}
                    </Badge>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ItemEditor({
  item,
  contentUnits,
  editing,
  onChange,
  onDelete,
  deleting,
}: {
  item: DeliveryTimelineItem
  contentUnits: ContentUnit[]
  editing: boolean
  onChange: (payload: Partial<DeliveryTimelineItem>) => void
  onDelete: () => void
  deleting: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="顺序">
          <Input disabled={!editing} type="number" value={item.order ?? 0} onChange={(event) => onChange({ order: numberValue(event.target.value) })} />
        </Field>
        <Field label="类型">
          <select disabled={!editing} className="ms-input h-9 w-full" value={item.kind} onChange={(event) => onChange({ kind: event.target.value })}>
            {['video', 'image', 'audio', 'caption', 'gap', 'note'].map((kind) => <option key={kind} value={kind}>{kind}</option>)}
          </select>
        </Field>
      </div>
      <Field label="标签">
        <Input disabled={!editing} value={item.label ?? ''} onChange={(event) => onChange({ label: event.target.value })} />
      </Field>
      <Field label="制作项">
        <select disabled={!editing} className="ms-input h-9 w-full" value={item.content_unit_id ?? ''} onChange={(event) => onChange({ content_unit_id: numberOrNull(event.target.value) })}>
          <option value="">未绑定</option>
          {contentUnits.map((unit) => <option key={unit.ID} value={unit.ID}>{unit.title || `制作项 #${unit.ID}`}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="开始秒">
          <Input disabled={!editing} type="number" value={item.start_sec ?? 0} onChange={(event) => onChange({ start_sec: numberValue(event.target.value) })} />
        </Field>
        <Field label="时长秒">
          <Input disabled={!editing} type="number" value={item.duration_sec ?? 0} onChange={(event) => onChange({ duration_sec: numberValue(event.target.value) })} />
        </Field>
      </div>
      <Field label="状态">
        <select disabled={!editing} className="ms-input h-9 w-full" value={item.status} onChange={(event) => onChange({ status: event.target.value })}>
          {['draft', 'confirmed', 'needs_asset', 'missing', 'locked', 'approved'].map((status) => <option key={status} value={status}>{timelineStatusLabel(status)}</option>)}
        </select>
      </Field>
      <Button variant="outline" className="w-full gap-2 text-destructive hover:text-destructive" onClick={onDelete} loading={deleting} disabled={!editing}>
        <Trash2 size={14} />
        删除片段
      </Button>
    </div>
  )
}

function ExportPanel({ exportRecords, onCreate, creating }: { exportRecords: ExportRecord[]; onCreate: () => void; creating: boolean }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Label className="text-xs font-medium text-muted-foreground">导出记录</Label>
        <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={onCreate} loading={creating}>
          <Plus size={13} />
          新建
        </Button>
      </div>
      {exportRecords.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">尚未创建导出记录</p>
      ) : (
        <div className="space-y-2">
          {exportRecords.map((record) => (
            <div key={record.ID} className="rounded-md bg-muted/50 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">{record.format || 'mp4'} · {record.preset || 'default'}</p>
                <StatusPill status={record.status} />
              </div>
              {record.error && <p className="mt-1 line-clamp-2 text-[11px] text-destructive">{record.error}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function ReadOnlyField({ label, value, strong, className }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className={cn('rounded-md border border-border bg-background p-3', className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 break-words text-sm leading-6 text-foreground', strong && 'font-semibold')}>{value}</p>
    </div>
  )
}

function EmptyBlock({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-muted-foreground">
      <Icon size={30} className="opacity-40" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-xs text-xs leading-relaxed">{detail}</p>
    </div>
  )
}

function EmptyDeliveryTimeline({
  sourceCount,
  sourceLabel,
  canSeed,
  loading,
  onSeed,
}: {
  sourceCount: number
  sourceLabel: string
  canSeed: boolean
  loading: boolean
  onSeed: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-10 text-center text-muted-foreground">
      <Video size={30} className="opacity-40" />
      <p className="text-sm font-medium text-foreground">暂无交付片段</p>
      <p className="max-w-sm text-xs leading-relaxed">
        {sourceCount > 0
          ? `内容工作区已有 ${sourceCount} 个${sourceLabel}，可以先带入交付时间线，再微调剪辑顺序、时长和采用资源。`
          : '添加交付片段后，可以微调剪辑顺序、时长和采用资源。'}
      </p>
      {canSeed ? (
        <Button size="sm" className="gap-2" onClick={onSeed} loading={loading}>
          <Plus size={14} />
          带入制作时间线
        </Button>
      ) : null}
    </div>
  )
}

function StatusPill({ status, label }: { status: string; label?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded px-2 py-1 text-[11px] font-medium', statusTone[status] ?? 'bg-muted text-muted-foreground')}>
      {label ?? deliveryStatusLabel(status)}
    </span>
  )
}

function readiness(items: DeliveryTimelineItem[]) {
  const missingCount = items.filter((item) => ['missing', 'needs_asset'].includes(item.status)).length
  const noResourceCount = items.filter((item) => ['video', 'image', 'audio'].includes(item.kind) && !item.resource_id).length
  const lockedCount = items.filter((item) => ['locked', 'approved'].includes(item.status)).length
  const unapprovedCount = items.filter((item) => !['locked', 'approved'].includes(item.status)).length
  return {
    missingCount,
    noResourceCount,
    lockedCount,
    ready: items.length > 0 && missingCount === 0 && noResourceCount === 0 && unapprovedCount === 0,
  }
}

function sumDuration(items: DeliveryTimelineItem[]) {
  return items.reduce((total, item) => total + (Number.isFinite(item.duration_sec) ? item.duration_sec : 0), 0)
}

function formatDuration(seconds?: number) {
  const value = Math.max(0, Math.round(seconds ?? 0))
  const min = Math.floor(value / 60)
  const sec = value % 60
  return `${min}:${String(sec).padStart(2, '0')}`
}

function formatTrackDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '未设时长'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`
}

function formatTrackTimeRange(startSec: number, endSec: number, durationSec: number) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return '未设'
  return `${formatTrackClock(startSec)}-${formatTrackClock(endSec)}`
}

function formatTrackClock(seconds: number) {
  const rounded = Math.max(0, Math.round(Number(seconds) || 0))
  const minutes = Math.floor(rounded / 60)
  const rest = rounded % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

function buildDeliveryTimeTicks(durationSec: number, pxPerSec: number) {
  const duration = Math.max(1, Math.ceil(Number(durationSec) || 1))
  const targetLabelGapPx = 72
  const interval = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((step) => step * pxPerSec >= targetLabelGapPx) ?? 900
  const tickCount = Math.ceil(duration / interval)
  return Array.from({ length: tickCount + 1 }, (_, index) => {
    const seconds = index * interval
    return { seconds, label: formatTrackClock(seconds) }
  })
}

function deliveryTimelinePxPerSec(zoom: number) {
  return Math.max(1.8, 36 * Math.max(0.05, Number(zoom) || 1))
}

function deliveryTimelineRulerWidth(items: Array<{ endSec: number; durationSec: number }>, originSec: number, pxPerSec: number) {
  const maxEndSec = items.reduce((max, item) => Math.max(max, deliveryLocalTimelineSec(item.endSec, originSec)), 0)
  const longestItemSec = items.reduce((max, item) => Math.max(max, Number(item.durationSec) || 0), 0)
  const visibleSeconds = Math.max(30, maxEndSec + Math.max(20, longestItemSec * 2))
  return Math.max(1200, Math.round(visibleSeconds * pxPerSec))
}

function trackTimelinePx(seconds: number, pxPerSec: number) {
  return Math.round(Math.max(0, Number(seconds) || 0) * pxPerSec)
}

function trackTimelineWidthPx(durationSec: number, pxPerSec: number) {
  return Math.max(18, Math.round(Math.max(0.1, Number(durationSec) || 0.1) * pxPerSec))
}

function deliveryTimelineOriginSec(items: Array<{ startSec: number }>) {
  const starts = items
    .map((item) => Number(item.startSec))
    .filter((value) => Number.isFinite(value) && value > 0)
  if (starts.length === 0) return 0
  return Math.round(Math.min(...starts) * 10) / 10
}

function deliveryLocalTimelineSec(seconds: number, originSec: number) {
  return Math.max(0, Math.round(((Number(seconds) || 0) - originSec) * 10) / 10)
}

function deliveryTimelineVisualKind(item: DeliveryTimelineItem): 'video' | 'keyframe' | null {
  const kind = String(item.kind ?? '').toLowerCase()
  if (kind === 'video' || kind === 'shot') return 'video'
  if (kind === 'image' || kind === 'keyframe' || kind === 'still') return 'keyframe'
  return null
}

function deliveryTimelineKindRank(kind: string) {
  if (kind === 'video') return 0
  if (kind === 'keyframe') return 1
  return 10
}

function deliveryKindLabel(kind: string) {
  if (kind === 'video') return '视频 Shot'
  if (kind === 'keyframe') return '关键帧'
  if (kind === 'caption') return '字幕'
  if (kind === 'audio') return '音频'
  if (kind === 'gap') return '空隙'
  return kind || '片段'
}

function deliveryLaneDetail(kind: string) {
  if (kind === 'video') return '可缩拉时长 · 最终导出依据'
  if (kind === 'keyframe') return '画面锚点 · 参考帧'
  return '交付片段'
}

function numberValue(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function nullableNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function bestPreviewTimeline(items: Array<{ ID: number; is_primary?: boolean; status?: string }>) {
  return items.slice().sort((a, b) => previewTimelineRank(a) - previewTimelineRank(b) || a.ID - b.ID)[0]
}

function previewTimelineRank(item: { is_primary?: boolean; status?: string }) {
  const status = String(item.status ?? '').toLowerCase()
  if (item.is_primary) return 0
  if (status === 'confirmed') return 1
  if (status === 'playable') return 2
  if (status === 'draft') return 3
  return 4
}

function deliveryKindFromPreviewItem(kind?: string) {
  const value = String(kind ?? '').toLowerCase()
  if (value === 'subtitle') return 'caption'
  return deliveryKindFromContentUnit(value)
}

function deliveryKindFromContentUnit(kind?: string) {
  const value = String(kind ?? '').toLowerCase()
  if (['video', 'image', 'audio', 'caption', 'gap', 'note'].includes(value)) return value
  if (value.includes('audio') || value.includes('voice') || value.includes('sound')) return 'audio'
  if (value.includes('subtitle') || value.includes('caption')) return 'caption'
  if (value.includes('image') || value.includes('still') || value.includes('keyframe')) return 'image'
  if (value.includes('transition')) return 'gap'
  return 'video'
}

function deliveryStatusFromPreviewItem(item: PreviewTimelineItem) {
  const status = String(item.status ?? '').toLowerCase()
  if (['missing', 'needs_asset', 'locked', 'approved'].includes(status)) return status
  const kind = deliveryKindFromPreviewItem(item.kind)
  if (kind === 'caption' || kind === 'gap' || kind === 'note') return 'confirmed'
  return status === 'accepted' || status === 'confirmed' || status === 'playable' ? 'confirmed' : 'needs_asset'
}

function sumSourceTimelineDuration(previewItems: PreviewTimelineItem[], units: ContentUnit[]) {
  if (previewItems.length > 0) {
    return previewItems.reduce((sum, item) => sum + (Number.isFinite(item.duration_sec) ? item.duration_sec : 0), 0)
  }
  return units.reduce((sum, unit) => sum + (Number.isFinite(unit.duration_sec) ? unit.duration_sec : 0), 0)
}

function resourceTypeForTimelineKind(kind: string): RawResource['type'] {
  if (kind === 'image') return 'image'
  if (kind === 'audio') return 'audio'
  if (kind === 'caption' || kind === 'note') return 'text'
  return 'video'
}

function numberOrNull(value: string | null | undefined): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function productionLabel(productionId: number | null | undefined, productions: Production[]) {
  if (!productionId) return '未关联'
  const production = productions.find((item) => item.ID === productionId)
  return production?.name || `制作 #${productionId}`
}

function versionFilterLabel(value: VersionFilter) {
  if (value === 'all') return '全部'
  return deliveryStatusLabel(value)
}

function deliveryStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: '草稿',
    checking: '检查中',
    approved: '已批准',
    exported: '已导出',
    archived: '已归档',
    confirmed: '已确认',
    needs_asset: '缺素材资源',
    missing: '缺失',
    locked: '已锁定',
    pending: '待导出',
    running: '导出中',
    succeeded: '成功',
    failed: '失败',
  }
  return labels[status] ?? status
}

function timelineStatusLabel(status: string) {
  return deliveryStatusLabel(status)
}

function exportStatusLabel(status: string) {
  return deliveryStatusLabel(status)
}
