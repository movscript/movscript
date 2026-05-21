import type { ReactNode } from 'react'
import { Plus, Trash2, Video } from 'lucide-react'

import type { ContentUnit, DeliveryTimelineItem, ExportRecord } from '@/api/deliveryEntities'
import { WorkbenchStatusBadge } from '@/components/workbench/WorkbenchPrimitives'
import { deliveryStatusLabel, parsePositiveDeliveryNumber } from '@/lib/deliveryWorkbenchModel'
import { Button, Input, Label } from '@movscript/ui'

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
          <Plus size={13} />
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
                <WorkbenchStatusBadge tone={deliveryPanelStatusTone(record.status)} label={deliveryStatusLabel(record.status)} />
              </div>
              {record.error && <p className="mt-1 line-clamp-2 type-caption text-destructive">{record.error}</p>}
            </div>
          ))}
        </div>
      )}
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
      <Video size={30} className="opacity-40" />
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

function deliveryPanelStatusTone(status: string) {
  if (['approved', 'exported', 'locked', 'succeeded'].includes(status)) return 'success'
  if (['checking', 'needs_asset', 'pending', 'running'].includes(status)) return 'warning'
  if (['confirmed'].includes(status)) return 'info'
  if (['missing', 'failed', 'blocked'].includes(status)) return 'danger'
  return 'neutral'
}

function numberValue(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
