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
  listPreviewTimelines,
  listProductions,
  resourceFromId,
  updateDeliveryTimelineItem,
  updateDeliveryVersion,
  type ContentUnit,
  type DeliveryTimelineItem,
  type DeliveryVersion,
  type ExportRecord,
  type Production,
} from '@/api/deliveryEntities'
import { ContentWorkspaceLayout } from '@/components/layout/ContentWorkspaceLayout'
import { MediaViewer } from '@/components/shared/MediaViewer'
import { ResourceLibraryPicker, type ResourceTypeFilter } from '@/components/shared/ResourceLibraryPicker'
import { ContentFilterBar } from '@/pages/contents/components/ContentFilterBar'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import type { PaginatedResponse, RawResource } from '@/types'
import { Badge, Button, Input, Label, Progress as ProgressBar, Textarea } from '@movscript/ui'

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

export default function FinalVideosWorkspacePage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [filter, setFilter] = useState<VersionFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [editingVersion, setEditingVersion] = useState(false)
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
    setEditingVersion(false)
    setEditingItem(false)
  }, [selectedProductionId])

  useEffect(() => {
    setSelectedItemId(timelineItems[0]?.ID ?? null)
    setEditingItem(false)
  }, [selectedVersionId])

  useEffect(() => {
    setEditingVersion(false)
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
    ? resources.find((item) => item.ID === selectedItem.resource_id) ?? resourceFromId(selectedItem.resource_id, resourceType === 'all' ? 'video' : resourceType)
    : null
  const versionReadiness = readiness(timelineItems)
  const contentUnitById = new Map((contentUnitsQuery.data ?? []).map((item) => [item.ID, item]))

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

  const createVersion = useMutation({
    mutationFn: () => createDeliveryVersion(projectId!, {
      production_id: selectedProductionId,
      name: `交付版本 ${versions.length + 1}`,
      status: 'draft',
      is_primary: versions.length === 0,
    }),
    onSuccess: (version) => {
      qc.invalidateQueries({ queryKey: versionKey })
      setSelectedVersionId(version.ID)
      setEditingVersion(true)
    },
  })

  const updateVersion = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<DeliveryVersion> }) => updateDeliveryVersion(projectId!, id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: versionKey }),
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
    contentUnitsQuery.refetch()
    productionsQuery.refetch()
  }

  function selectProduction(productionId: number | null) {
    const next = new URLSearchParams(searchParams)
    if (productionId) next.set('productionId', String(productionId))
    else next.delete('productionId')
    setSearchParams(next, { replace: true })
  }

  function patchSelectedVersion(payload: Partial<DeliveryVersion>) {
    if (!selectedVersion) return
    updateVersion.mutate({ id: selectedVersion.ID, payload })
  }

  function patchSelectedItem(payload: Partial<DeliveryTimelineItem>) {
    if (!selectedItem) return
    updateItem.mutate({ id: selectedItem.ID, payload })
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
              维护制作下的交付版本、时间线片段、资源锁定、审核状态和导出记录。只记录交付结果，不回写剧本结构或素材事实。
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
            <Button variant="outline" className="gap-2" onClick={() => createVersion.mutate()} loading={createVersion.isPending}>
              <Plus size={15} />
              新建版本
            </Button>
            <Button className="gap-2" disabled={!selectedVersionId} onClick={() => createItem.mutate()} loading={createItem.isPending}>
              <Plus size={15} />
              添加片段
            </Button>
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
              <p className="mt-1 text-xs text-muted-foreground">搜索、筛选并选择要编辑的交付版本。</p>
            </div>
            <Button size="icon" className="h-8 w-8" onClick={() => createVersion.mutate()} loading={createVersion.isPending}>
              <Plus size={15} />
            </Button>
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
            <EmptyBlock icon={FileVideo} title="暂无版本" detail="创建交付版本后开始组织成片时间线" />
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
                  {selectedVersion.preview_timeline_id && <span className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">预演 #{selectedVersion.preview_timeline_id}</span>}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">版本详情</h2>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => setEditingVersion((value) => !value)} disabled={updateVersion.isPending}>
                    {editingVersion ? <X size={14} /> : <Pencil size={14} />}
                    {editingVersion ? '结束编辑' : '编辑'}
                  </Button>
                </div>
              </div>
              <div className="space-y-3 p-4">
                <Field label="版本名称">
                <Input
                  value={selectedVersion.name}
                  disabled={!editingVersion}
                  onChange={(event) => patchSelectedVersion({ name: event.target.value })}
                  className="h-10 text-base font-semibold"
                />
                </Field>
                <Field label="状态">
                <select
                  className="ms-input h-10"
                  value={selectedVersion.status}
                  disabled={!editingVersion}
                  onChange={(event) => patchSelectedVersion({ status: event.target.value })}
                >
                  {['draft', 'checking', 'approved', 'exported', 'archived'].map((status) => <option key={status} value={status}>{deliveryStatusLabel(status)}</option>)}
                </select>
                </Field>
                <Field label="关联制作">
                  <select
                    className="ms-input h-9 w-full"
                    value={selectedVersion.production_id ?? ''}
                    disabled={!editingVersion}
                    onChange={(event) => patchSelectedVersion({ production_id: numberOrNull(event.target.value) })}
                  >
                    <option value="">未关联</option>
                    {productions.map((production) => (
                      <option key={production.ID} value={production.ID}>{production.name || `制作 #${production.ID}`}</option>
                    ))}
                  </select>
                </Field>
                <Field label="关联预演时间线">
                  <select
                    className="ms-input h-9 w-full"
                    value={selectedVersion.preview_timeline_id ?? ''}
                    disabled={!editingVersion}
                    onChange={(event) => patchSelectedVersion({ preview_timeline_id: numberOrNull(event.target.value) })}
                  >
                    <option value="">未关联</option>
                    {(previewTimelinesQuery.data ?? []).map((timeline) => (
                      <option key={timeline.ID} value={timeline.ID}>{timeline.name || `Preview #${timeline.ID}`}</option>
                    ))}
                  </select>
                </Field>
                <Field label="版本说明">
                  <Textarea
                    value={selectedVersion.description ?? ''}
                    disabled={!editingVersion}
                    onChange={(event) => patchSelectedVersion({ description: event.target.value })}
                    className="min-h-20"
                    placeholder="记录交付范围、平台要求或审核口径"
                  />
                </Field>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card">
              <div className="border-b border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">片段详情</h2>
                    <p className="mt-1 text-xs text-muted-foreground">直接维护交付态资源、审核状态和时间信息。</p>
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
            <EmptyBlock icon={FileVideo} title="暂无交付版本" detail="点击新建版本创建第一版成片库" />
          </section>
        )
      )}
      preview={(
        selectedItem ? (
          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border p-4">
              <h2 className="text-sm font-semibold">成片预览</h2>
              <p className="mt-1 text-xs text-muted-foreground">预览和锁定当前片段使用的资源。</p>
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

          <TimelineStrip items={timelineItems} selectedId={selectedItemId} onSelect={setSelectedItemId} />

          <div className="divide-y divide-border">
            {itemsQuery.isLoading ? (
              <EmptyBlock icon={Clock3} title="正在加载" detail="读取成片时间线" />
            ) : timelineItems.length === 0 ? (
              <EmptyBlock icon={Video} title="暂无片段" detail="添加片段后，为每个制作项锁定成片资源" />
            ) : (
              timelineItems.map((item) => (
                <TimelineRow
                  key={item.ID}
                  item={item}
                  contentUnit={item.content_unit_id ? contentUnitById.get(item.content_unit_id) : undefined}
                  selected={item.ID === selectedItemId}
                  onClick={() => setSelectedItemId(item.ID)}
                />
              ))
            )}
          </div>
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

function TimelineStrip({ items, selectedId, onSelect }: { items: DeliveryTimelineItem[]; selectedId: number | null; onSelect: (id: number) => void }) {
  if (items.length === 0) return null
  const total = Math.max(sumDuration(items), 1)
  return (
    <div className="border-b border-border p-4">
      <div className="flex h-12 overflow-hidden rounded-md border border-border bg-muted">
        {items.map((item) => {
          const width = `${Math.max(5, (Math.max(item.duration_sec, 0.5) / total) * 100)}%`
          return (
            <button
              key={item.ID}
              style={{ width }}
              className={cn(
                'min-w-8 border-r border-background px-1 text-left text-[10px] transition-colors last:border-r-0',
                item.status === 'missing' || item.status === 'needs_asset' ? 'bg-amber-500/20 hover:bg-amber-500/30' :
                  item.status === 'approved' || item.status === 'locked' ? 'bg-emerald-500/20 hover:bg-emerald-500/30' :
                    'bg-sky-500/15 hover:bg-sky-500/25',
                selectedId === item.ID && 'ring-2 ring-inset ring-primary',
              )}
              onClick={() => onSelect(item.ID)}
              title={item.label || `#${item.ID}`}
            >
              <span className="line-clamp-2">{item.label || item.kind}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TimelineRow({
  item,
  contentUnit,
  selected,
  onClick,
}: {
  item: DeliveryTimelineItem
  contentUnit?: ContentUnit
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      className={cn('grid w-full grid-cols-[56px_minmax(0,1fr)_110px_110px_100px] items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted/50', selected && 'bg-primary/5')}
      onClick={onClick}
    >
      <span className="text-xs text-muted-foreground">#{item.order || item.ID}</span>
      <div className="min-w-0">
        <p className="truncate font-medium">{item.label || contentUnit?.title || `片段 ${item.ID}`}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {contentUnit ? `${contentUnit.kind} · CU#${contentUnit.ID}` : item.content_unit_id ? `CU#${item.content_unit_id}` : '未绑定制作项'}
        </p>
      </div>
      <span className="text-xs text-muted-foreground">{item.kind}</span>
      <span className="text-xs text-muted-foreground">{formatDuration(item.start_sec)} / {formatDuration(item.duration_sec)}</span>
      <StatusPill status={item.status} />
    </button>
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
          {contentUnits.map((unit) => <option key={unit.ID} value={unit.ID}>{unit.title || `ContentUnit #${unit.ID}`}</option>)}
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

function EmptyBlock({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-muted-foreground">
      <Icon size={30} className="opacity-40" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="max-w-xs text-xs leading-relaxed">{detail}</p>
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

function numberValue(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function numberOrNull(value: string | null | undefined): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
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
