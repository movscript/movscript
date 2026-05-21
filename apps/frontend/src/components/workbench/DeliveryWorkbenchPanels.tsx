import type { ReactNode } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Download,
  FileVideo,
  ListChecks,
  Plus,
  ShieldCheck,
  Trash2,
  Video,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

import type { ContentUnit, DeliveryTimelineItem, DeliveryVersion, ExportRecord, Production } from '@/api/deliveryEntities'
import { MediaViewer } from '@/components/shared/MediaViewer'
import { ResourceLibraryPicker } from '@/components/shared/ResourceLibraryPicker'
import {
  WorkbenchKeyValue,
  WorkbenchMetric,
  WorkbenchStatusBadge,
} from '@/components/workbench/WorkbenchPrimitives'
import type { DeliveryGateCheck, DeliveryReadiness } from '@/lib/deliveryWorkbenchModel'
import {
  buildDeliveryOverviewMetrics,
  buildDeliveryVersionDetailFields,
  buildDeliveryVersionSummary,
  type DeliveryOverviewMetricId,
} from '@/lib/deliveryWorkbenchOverviewModel'
import type { DeliveryResourceLibraryState, DeliveryResourceTypeFilter } from '@/lib/deliveryWorkbenchResourceLibrary'
import { deliveryStatusLabel, deliveryWorkbenchStatusTone, parsePositiveDeliveryNumber } from '@/lib/deliveryWorkbenchModel'
import { cn } from '@/lib/utils'
import type { RawResource } from '@/types'
import { Badge, Button, Input, Label, Progress as ProgressBar } from '@movscript/ui'

const deliveryMetricIcons: Record<DeliveryOverviewMetricId, LucideIcon> = {
  versions: FileVideo,
  items: ListChecks,
  missing: AlertTriangle,
  exports: Download,
}

type GateCheckStatus = 'passed' | 'warning' | 'blocked'

const gateMeta: Record<GateCheckStatus, { className: string; icon: LucideIcon }> = {
  passed: { className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', icon: CheckCircle2 },
  warning: { className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', icon: AlertTriangle },
  blocked: { className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300', icon: XCircle },
}

export function DeliveryOverviewPanel({
  versions,
  timelineItems,
  versionReadiness,
  selectedVersion,
  exportRecords,
  gateChecks,
}: {
  versions: DeliveryVersion[]
  timelineItems: DeliveryTimelineItem[]
  versionReadiness: DeliveryReadiness
  selectedVersion: DeliveryVersion | null
  exportRecords: ExportRecord[]
  gateChecks: DeliveryGateCheck[]
}) {
  const metrics = buildDeliveryOverviewMetrics({
    versions,
    timelineItems,
    versionReadiness,
    exportRecords,
  })

  return (
    <div className="space-y-3">
      <section className="grid grid-cols-4 gap-3">
        {metrics.map((metric) => {
          const Icon = deliveryMetricIcons[metric.id]
          return (
            <WorkbenchMetric
              key={metric.id}
              icon={Icon}
              label={metric.label}
              value={metric.value}
              detail={metric.detail}
              tone={metric.tone}
            />
          )
        })}
      </section>
      {selectedVersion && (
        <section className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(300px,340px)]">
          <DeliveryVersionSummaryCard version={selectedVersion} items={timelineItems} readiness={versionReadiness} />
          <DeliveryGateCheckPanel checks={gateChecks} />
        </section>
      )}
    </div>
  )
}

export function DeliveryVersionDetailPanel({
  version,
  productions,
}: {
  version: DeliveryVersion
  productions: Production[]
}) {
  const fields = buildDeliveryVersionDetailFields(version, productions)
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <WorkbenchStatusBadge tone={deliveryWorkbenchStatusTone(version.status ?? 'draft')} label={deliveryStatusLabel(version.status ?? 'draft')} />
          {version.is_primary && <span className="rounded bg-primary/10 px-2 py-1 type-label text-primary">主版本</span>}
          {version.production_id && <span className="rounded bg-muted px-2 py-1 type-label text-muted-foreground">制作 #{version.production_id}</span>}
          {version.preview_timeline_id && <span className="rounded bg-muted px-2 py-1 type-label text-muted-foreground">预览 #{version.preview_timeline_id}</span>}
        </div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="type-body font-semibold">版本详情</h2>
        </div>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        {fields.map((field) => (
          <WorkbenchKeyValue
            key={field.id}
            label={field.label}
            value={field.value}
            strong={field.strong}
            className={field.className}
          />
        ))}
      </div>
    </section>
  )
}

function DeliveryVersionSummaryCard({
  version,
  items,
  readiness,
}: {
  version: DeliveryVersion
  items: DeliveryTimelineItem[]
  readiness: DeliveryReadiness
}) {
  const summary = buildDeliveryVersionSummary({ version, items, readiness })
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BadgeCheck size={16} className={summary.warningCount > 0 ? 'text-amber-600' : 'text-emerald-600'} />
            <h2 className="type-body font-semibold text-foreground">{summary.title}</h2>
            <WorkbenchStatusBadge tone={deliveryWorkbenchStatusTone(summary.status)} label={deliveryStatusLabel(summary.status)} />
            {summary.isPrimary && (
              <Badge className="type-tiny bg-primary/10 text-primary">主版本</Badge>
            )}
          </div>
          <p className="mt-2 type-body text-muted-foreground line-clamp-2">
            {summary.description}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-right shrink-0">
          <div>
            <p className={cn('type-title font-semibold tabular-nums', summary.warningCount > 0 ? 'text-amber-600' : 'text-emerald-600')}>{summary.completion}%</p>
            <p className="mt-1 type-label text-muted-foreground">完成度</p>
          </div>
          <div>
            <p className="type-title font-semibold tabular-nums">{summary.totalDurationLabel}</p>
            <p className="mt-1 type-label text-muted-foreground">总时长</p>
          </div>
          <div>
            <p className={cn('type-title font-semibold tabular-nums', summary.warningCount > 0 ? 'text-amber-600' : 'text-foreground')}>{summary.warningCount}</p>
            <p className="mt-1 type-label text-muted-foreground">待处理</p>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between type-label text-muted-foreground">
          <span>成片片段锁定进度</span>
          <span>{summary.lockedCount}/{summary.total}</span>
        </div>
        <ProgressBar value={summary.completion} className="h-1.5" />
      </div>
    </div>
  )
}

function DeliveryGateCheckPanel({ checks }: { checks: DeliveryGateCheck[] }) {
  const warningCount = checks.filter((check) => check.status !== 'passed').length
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

export function DeliveryItemEditor({
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
        <select disabled={!editing} className="ms-input h-9 w-full" value={item.content_unit_id ?? ''} onChange={(event) => onChange({ content_unit_id: parsePositiveDeliveryNumber(event.target.value) })}>
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
          {['draft', 'confirmed', 'needs_asset', 'missing', 'locked', 'approved'].map((status) => <option key={status} value={status}>{deliveryStatusLabel(status)}</option>)}
        </select>
      </Field>
      <Button variant="outline" className="w-full gap-2 text-destructive hover:text-destructive" onClick={onDelete} loading={deleting} disabled={!editing}>
        <Trash2 size={14} />
        删除片段
      </Button>
    </div>
  )
}

export function DeliveryExportPanel({ exportRecords, onCreate, creating }: { exportRecords: ExportRecord[]; onCreate: () => void; creating: boolean }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Label className="type-label font-medium text-muted-foreground">导出记录</Label>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onCreate} loading={creating}>
          <Plus size={14} />
          新建
        </Button>
      </div>
      {exportRecords.length === 0 ? (
        <p className="py-4 text-center type-label text-muted-foreground">尚未创建导出记录</p>
      ) : (
        <div className="space-y-2">
          {exportRecords.map((record) => (
            <div key={record.ID} className="rounded-md bg-muted/50 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="type-label font-medium">{record.format || 'mp4'} · {record.preset || 'default'}</p>
                <WorkbenchStatusBadge tone={deliveryWorkbenchStatusTone(record.status)} label={deliveryStatusLabel(record.status)} />
              </div>
              {record.error && <p className="mt-1 line-clamp-2 type-caption text-destructive">{record.error}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function DeliveryResourceAdoptionPanel({
  selectedResource,
  resources,
  state,
  pageCount,
  total,
  isLoading,
  updating,
  exportRecords,
  creatingExport,
  onSearch,
  onType,
  onPage,
  onAdoptResource,
  onClearResource,
  onCreateExport,
}: {
  selectedResource: RawResource | null
  resources: RawResource[]
  state: DeliveryResourceLibraryState
  pageCount: number
  total: number
  isLoading: boolean
  updating: boolean
  exportRecords: ExportRecord[]
  creatingExport: boolean
  onSearch: (value: string) => void
  onType: (value: DeliveryResourceTypeFilter) => void
  onPage: (page: number) => void
  onAdoptResource: (resource: RawResource) => void
  onClearResource: () => void
  onCreateExport: () => void
}) {
  return (
    <div className="space-y-4 p-4">
      <div>
        <Label className="mb-2 block type-label font-medium text-muted-foreground">成片资源</Label>
        {selectedResource ? (
          <MediaViewer resource={selectedResource} fit="contain" className="mb-3 aspect-video w-full" />
        ) : (
          <div className="mb-3 flex aspect-video w-full items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Video size={24} />
          </div>
        )}
        <ResourceLibraryPicker
          resources={resources}
          selectedResource={selectedResource}
          search={state.search}
          type={state.type}
          page={state.page}
          pageCount={pageCount}
          total={total}
          isLoading={isLoading || updating}
          typeOptions={['video', 'image', 'audio']}
          onSearch={onSearch}
          onType={onType}
          onPage={onPage}
          onSelect={onAdoptResource}
          onClear={onClearResource}
        />
      </div>
      <DeliveryExportPanel exportRecords={exportRecords} onCreate={onCreateExport} creating={creatingExport} />
    </div>
  )
}

export function EmptyDeliveryTimeline({
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
      <Video size={24} className="opacity-40" />
      <p className="type-body font-medium text-foreground">暂无交付片段</p>
      <p className="max-w-sm type-label leading-relaxed">
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label className="mb-1 block type-label font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function numberValue(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
