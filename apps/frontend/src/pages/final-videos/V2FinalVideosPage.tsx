import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  FileVideo,
  Film,
  ListChecks,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
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
  resourceFromId,
  updateDeliveryTimelineItem,
  updateDeliveryVersion,
  type V2ContentUnit,
  type V2DeliveryTimelineItem,
  type V2DeliveryVersion,
  type V2ExportRecord,
} from '@/api/v2Delivery'
import { MediaViewer } from '@/components/shared/MediaViewer'
import { ResourceLibraryPicker, type ResourceTypeFilter } from '@/components/shared/ResourceLibraryPicker'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import type { PaginatedResponse, RawResource } from '@/types'
import { Button, Input, Label, Textarea } from '@movscript/ui'

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

export default function V2FinalVideosPage() {
  const project = useProjectStore((s) => s.current)
  const projectId = project?.ID
  const qc = useQueryClient()
  const [filter, setFilter] = useState<VersionFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [resourceSearch, setResourceSearch] = useState('')
  const [resourceType, setResourceType] = useState<ResourceTypeFilter>('video')
  const [resourcePage, setResourcePage] = useState(1)

  const versionsQuery = useQuery({
    queryKey: ['v2-delivery-versions', projectId],
    queryFn: () => listDeliveryVersions(projectId!),
    enabled: !!projectId,
  })
  const versions = versionsQuery.data ?? []
  const selectedVersion = versions.find((item) => item.ID === selectedVersionId) ?? null

  const itemsQuery = useQuery({
    queryKey: ['v2-delivery-timeline-items', projectId, selectedVersionId],
    queryFn: () => listDeliveryTimelineItems(projectId!, selectedVersionId),
    enabled: !!projectId && !!selectedVersionId,
  })
  const timelineItems = useMemo(
    () => [...(itemsQuery.data ?? [])].sort((a, b) => a.order - b.order || a.ID - b.ID),
    [itemsQuery.data],
  )

  const exportsQuery = useQuery({
    queryKey: ['v2-export-records', projectId, selectedVersionId],
    queryFn: () => listExportRecords(projectId!, selectedVersionId),
    enabled: !!projectId && !!selectedVersionId,
  })
  const exportRecords = exportsQuery.data ?? []

  const previewTimelinesQuery = useQuery({
    queryKey: ['v2-preview-timelines', projectId],
    queryFn: () => listPreviewTimelines(projectId!),
    enabled: !!projectId,
  })
  const contentUnitsQuery = useQuery({
    queryKey: ['v2-content-units', projectId],
    queryFn: () => listContentUnits(projectId!),
    enabled: !!projectId,
  })

  const resourcePageSize = 6
  const resourcesQuery = useQuery<PaginatedResponse<RawResource>>({
    queryKey: ['resources', 'v2-final-library', resourceType, resourceSearch, resourcePage],
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
    setSelectedItemId(timelineItems[0]?.ID ?? null)
  }, [selectedVersionId])

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

  const versionKey = ['v2-delivery-versions', projectId]
  const itemsKey = ['v2-delivery-timeline-items', projectId, selectedVersionId]
  const exportsKey = ['v2-export-records', projectId, selectedVersionId]

  const createVersion = useMutation({
    mutationFn: () => createDeliveryVersion(projectId!, {
      name: `交付版本 ${versions.length + 1}`,
      status: 'draft',
      is_primary: versions.length === 0,
    }),
    onSuccess: (version) => {
      qc.invalidateQueries({ queryKey: versionKey })
      setSelectedVersionId(version.ID)
    },
  })

  const updateVersion = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<V2DeliveryVersion> }) => updateDeliveryVersion(projectId!, id, payload),
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
    },
  })

  const updateItem = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<V2DeliveryTimelineItem> }) => updateDeliveryTimelineItem(projectId!, id, {
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
  }

  function patchSelectedVersion(payload: Partial<V2DeliveryVersion>) {
    if (!selectedVersion) return
    updateVersion.mutate({ id: selectedVersion.ID, payload })
  }

  function patchSelectedItem(payload: Partial<V2DeliveryTimelineItem>) {
    if (!selectedItem) return
    updateItem.mutate({ id: selectedItem.ID, payload })
  }

  return (
    <div className="flex h-full overflow-hidden bg-background text-foreground">
      <aside className="flex w-80 shrink-0 flex-col border-r border-border bg-card">
        <div className="border-b border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Film size={14} />
                <span>{project?.name ?? '当前项目'}</span>
              </div>
              <h1 className="mt-2 text-xl font-semibold tracking-normal">成片库</h1>
            </div>
            <Button size="icon" className="h-8 w-8" onClick={() => createVersion.mutate()} loading={createVersion.isPending}>
              <Plus size={15} />
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <SummaryTile label="版本" value={versions.length} />
            <SummaryTile label="可导出" value={versions.filter((item) => ['approved', 'exported'].includes(item.status)).length} />
          </div>
          <div className="relative mt-3">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 pl-9" placeholder="搜索版本" />
          </div>
          <div className="mt-3 flex rounded-md border border-border bg-background p-0.5">
            {(['all', 'draft', 'checking', 'approved', 'exported'] as const).map((item) => (
              <button
                key={item}
                className={cn(
                  'min-w-0 flex-1 rounded px-2 py-1.5 text-xs transition-colors',
                  filter === item ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted/70',
                )}
                onClick={() => setFilter(item)}
              >
                {versionFilterLabel(item)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3">
          {versionsQuery.isLoading ? (
            <EmptyBlock icon={Clock3} title="正在加载" detail="读取 V2 交付版本" />
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
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b border-border bg-background px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StatusPill status={selectedVersion?.status ?? 'draft'} />
              {selectedVersion?.is_primary && <span className="rounded bg-primary/10 px-2 py-1 text-xs text-primary">主版本</span>}
              {selectedVersion?.preview_timeline_id && <span className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">预演 #{selectedVersion.preview_timeline_id}</span>}
            </div>
            {selectedVersion ? (
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px]">
                <Input
                  value={selectedVersion.name}
                  onChange={(event) => patchSelectedVersion({ name: event.target.value })}
                  className="h-10 text-base font-semibold"
                />
                <select
                  className="ms-input h-10"
                  value={selectedVersion.status}
                  onChange={(event) => patchSelectedVersion({ status: event.target.value })}
                >
                  {['draft', 'checking', 'approved', 'exported', 'archived'].map((status) => <option key={status} value={status}>{deliveryStatusLabel(status)}</option>)}
                </select>
              </div>
            ) : (
              <h2 className="text-lg font-semibold">还没有交付版本</h2>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={refreshAll} loading={versionsQuery.isFetching || itemsQuery.isFetching}>
              <RefreshCcw size={15} />
              刷新
            </Button>
            <Button className="gap-2" disabled={!selectedVersionId} onClick={() => createItem.mutate()} loading={createItem.isPending}>
              <Plus size={15} />
              添加片段
            </Button>
          </div>
        </div>

        {selectedVersion ? (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_380px] overflow-hidden">
            <section className="min-w-0 overflow-auto p-5">
              <div className="grid grid-cols-4 gap-3">
                <ReadinessCard icon={ListChecks} label="时间线片段" value={timelineItems.length} detail={`${formatDuration(sumDuration(timelineItems))} 总时长`} tone="text-sky-600" />
                <ReadinessCard icon={AlertTriangle} label="缺失内容" value={versionReadiness.missingCount + versionReadiness.noResourceCount} detail="missing / needs_asset / 无资源" tone="text-amber-600" />
                <ReadinessCard icon={CheckCircle2} label="已锁定" value={versionReadiness.lockedCount} detail="locked / approved" tone="text-emerald-600" />
                <ReadinessCard icon={Download} label="导出记录" value={exportRecords.length} detail={exportRecords[0]?.status ? exportStatusLabel(exportRecords[0].status) : '尚未导出'} tone="text-indigo-600" />
              </div>

              <div className="mt-5 rounded-lg border border-border bg-card">
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
                    <EmptyBlock icon={Video} title="暂无片段" detail="添加片段后，为每个内容单元锁定成片资源" />
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
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-border bg-card p-4">
                  <Label className="mb-2 block text-xs font-medium text-muted-foreground">关联预演时间线</Label>
                  <select
                    className="ms-input h-9 w-full"
                    value={selectedVersion.preview_timeline_id ?? ''}
                    onChange={(event) => patchSelectedVersion({ preview_timeline_id: numberOrNull(event.target.value) })}
                  >
                    <option value="">未关联</option>
                    {(previewTimelinesQuery.data ?? []).map((timeline) => (
                      <option key={timeline.ID} value={timeline.ID}>{timeline.name || `Preview #${timeline.ID}`}</option>
                    ))}
                  </select>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <Label className="mb-2 block text-xs font-medium text-muted-foreground">版本说明</Label>
                  <Textarea
                    value={selectedVersion.description ?? ''}
                    onChange={(event) => patchSelectedVersion({ description: event.target.value })}
                    className="min-h-20"
                    placeholder="记录交付范围、平台要求或审核口径"
                  />
                </div>
              </div>
            </section>

            <aside className="min-w-0 overflow-auto border-l border-border bg-card">
              <div className="border-b border-border p-4">
                <h2 className="text-sm font-semibold">片段检查</h2>
                <p className="mt-1 text-xs text-muted-foreground">片段只维护交付态资源、审核状态和导出信息。</p>
              </div>
              {selectedItem ? (
                <div className="space-y-4 p-4">
                  <ItemEditor
                    item={selectedItem}
                    contentUnits={contentUnitsQuery.data ?? []}
                    onChange={patchSelectedItem}
                    onDelete={() => removeItem.mutate(selectedItem.ID)}
                    deleting={removeItem.isPending}
                  />
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
              ) : (
                <EmptyBlock icon={Video} title="未选择片段" detail="从左侧时间线选择一个片段进行检查" />
              )}
            </aside>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyBlock icon={FileVideo} title="暂无交付版本" detail="点击左侧加号创建第一版成片库" />
          </div>
        )}
      </main>
    </div>
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

function VersionCard({ version, selected, itemCount, onClick }: { version: V2DeliveryVersion; selected: boolean; itemCount?: number; onClick: () => void }) {
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

function TimelineStrip({ items, selectedId, onSelect }: { items: V2DeliveryTimelineItem[]; selectedId: number | null; onSelect: (id: number) => void }) {
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
  item: V2DeliveryTimelineItem
  contentUnit?: V2ContentUnit
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
          {contentUnit ? `${contentUnit.kind} · CU#${contentUnit.ID}` : item.content_unit_id ? `CU#${item.content_unit_id}` : '未绑定内容单元'}
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
  onChange,
  onDelete,
  deleting,
}: {
  item: V2DeliveryTimelineItem
  contentUnits: V2ContentUnit[]
  onChange: (payload: Partial<V2DeliveryTimelineItem>) => void
  onDelete: () => void
  deleting: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="顺序">
          <Input type="number" value={item.order ?? 0} onChange={(event) => onChange({ order: numberValue(event.target.value) })} />
        </Field>
        <Field label="类型">
          <select className="ms-input h-9 w-full" value={item.kind} onChange={(event) => onChange({ kind: event.target.value })}>
            {['video', 'image', 'audio', 'caption', 'gap', 'note'].map((kind) => <option key={kind} value={kind}>{kind}</option>)}
          </select>
        </Field>
      </div>
      <Field label="标签">
        <Input value={item.label ?? ''} onChange={(event) => onChange({ label: event.target.value })} />
      </Field>
      <Field label="内容单元">
        <select className="ms-input h-9 w-full" value={item.content_unit_id ?? ''} onChange={(event) => onChange({ content_unit_id: numberOrNull(event.target.value) })}>
          <option value="">未绑定</option>
          {contentUnits.map((unit) => <option key={unit.ID} value={unit.ID}>{unit.title || `ContentUnit #${unit.ID}`}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="开始秒">
          <Input type="number" value={item.start_sec ?? 0} onChange={(event) => onChange({ start_sec: numberValue(event.target.value) })} />
        </Field>
        <Field label="时长秒">
          <Input type="number" value={item.duration_sec ?? 0} onChange={(event) => onChange({ duration_sec: numberValue(event.target.value) })} />
        </Field>
      </div>
      <Field label="状态">
        <select className="ms-input h-9 w-full" value={item.status} onChange={(event) => onChange({ status: event.target.value })}>
          {['draft', 'confirmed', 'needs_asset', 'missing', 'locked', 'approved'].map((status) => <option key={status} value={status}>{timelineStatusLabel(status)}</option>)}
        </select>
      </Field>
      <Button variant="outline" className="w-full gap-2 text-destructive hover:text-destructive" onClick={onDelete} loading={deleting}>
        <Trash2 size={14} />
        删除片段
      </Button>
    </div>
  )
}

function ExportPanel({ exportRecords, onCreate, creating }: { exportRecords: V2ExportRecord[]; onCreate: () => void; creating: boolean }) {
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

function readiness(items: V2DeliveryTimelineItem[]) {
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

function sumDuration(items: V2DeliveryTimelineItem[]) {
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

function numberOrNull(value: string): number | null {
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
    needs_asset: '缺素材',
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
