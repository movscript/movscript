import { Film } from 'lucide-react'

import { AuthedImage } from '@/components/shared/AuthedImage'
import { WorkbenchPanel } from '@/components/workbench/WorkbenchPanel'
import { trackKindLabel } from '@/lib/contentWorkbenchLabels'
import { byOrder, firstText, formatDuration, numberOf, titleOfRecord } from '@/lib/contentWorkbenchRecordUtils'
import { cn } from '@/lib/utils'
import { Badge } from '@movscript/ui'

export type ContentWorkbenchScenePreviewRecord = {
  ID: number
  title?: unknown
  name?: unknown
  label?: unknown
  slot_key?: unknown
  kind?: unknown
  order?: number
  resource_id?: unknown
  duration_sec?: number
  prompt?: unknown
  description?: unknown
}

export type ContentWorkbenchScenePreviewRow = {
  moment: ContentWorkbenchScenePreviewRecord
  units: ContentWorkbenchScenePreviewRecord[]
}

export function ContentWorkbenchScenePreview({
  row,
  selectedUnit,
  keyframes,
  previewItemCount,
  runningJobCount,
  onSelectUnit,
}: {
  row: ContentWorkbenchScenePreviewRow | null
  selectedUnit: ContentWorkbenchScenePreviewRecord | null
  keyframes: ContentWorkbenchScenePreviewRecord[]
  previewItemCount: number
  runningJobCount: number
  onSelectUnit: (unitId: number | null) => void
}) {
  const primaryKeyframe = keyframes.find((keyframe) => numberOf(keyframe.resource_id) > 0) ?? keyframes[0]
  const unitTitle = selectedUnit ? titleOfRecord(selectedUnit) : '未选择制作项'
  const unitKind = selectedUnit ? trackKindLabel(String(selectedUnit.kind || 'shot')) : '待选择'
  const promptText = selectedUnit ? firstText(selectedUnit.prompt, selectedUnit.description, '暂无基础提示词') : '先在时间轴中选择一个制作项。'
  const visibleUnits = row?.units.slice().sort(byOrder).slice(0, 5) ?? []
  const selectedIndex = row && selectedUnit
    ? row.units.slice().sort(byOrder).findIndex((unit) => unit.ID === selectedUnit.ID)
    : -1

  return (
    <WorkbenchPanel
      title="情节预览"
      icon={Film}
      action={(
        <div className="flex items-center gap-1.5">
          <Badge variant={previewItemCount > 0 ? 'secondary' : 'outline'}>{previewItemCount > 0 ? `${previewItemCount} 段预览` : '未挂载预览'}</Badge>
          {runningJobCount > 0 ? <Badge variant="secondary">{runningJobCount} 个任务中</Badge> : null}
        </div>
      )}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_230px]" data-testid="content-workbench-scene-preview">
        <div className="min-w-0 overflow-hidden rounded-md border border-border bg-background">
          <div className="relative aspect-[16/8] min-h-[220px] overflow-hidden bg-muted">
            {primaryKeyframe?.resource_id ? (
              <AuthedImage
                src={resourceFileUrl(numberOf(primaryKeyframe.resource_id))}
                alt={titleOfRecord(primaryKeyframe)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col justify-between bg-[radial-gradient(circle_at_26%_24%,hsl(var(--muted-foreground)/0.18),transparent_32%),linear-gradient(135deg,hsl(var(--muted)),hsl(var(--background)))] p-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Preview</Badge>
                  <span className="text-xs text-muted-foreground">{row ? titleOfRecord(row.moment) : '等待情节'}</span>
                </div>
                <div className="max-w-[520px]">
                  <p className="text-xl font-semibold text-foreground">{unitTitle}</p>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{promptText}</p>
                </div>
              </div>
            )}
            <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="bg-background/90 shadow-sm">{unitKind}</Badge>
              {selectedIndex >= 0 ? <Badge variant="outline" className="bg-background/90 shadow-sm">Shot {String(selectedIndex + 1).padStart(2, '0')}</Badge> : null}
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-md border border-border bg-background">
          <div className="border-b border-border px-2.5 py-2">
            <p className="text-sm font-medium text-foreground">当前情节制作项</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{row ? `${row.units.length} 个制作项` : '等待选择情节'}</p>
          </div>
          <div className="max-h-[268px] space-y-1 overflow-auto p-2">
            {visibleUnits.length > 0 ? visibleUnits.map((unit, index) => {
              const selected = selectedUnit?.ID === unit.ID
              return (
                <button
                  key={unit.ID}
                  type="button"
                  className={cn(
                    'flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left transition-colors',
                    selected ? 'border-primary/60 bg-primary/5' : 'border-border bg-card hover:bg-primary/5',
                  )}
                  onClick={() => onSelectUnit(unit.ID)}
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] tabular-nums text-muted-foreground">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-foreground">{titleOfRecord(unit)}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{trackKindLabel(String(unit.kind || 'shot'))} · {formatDuration(unit.duration_sec)}</span>
                  </span>
                </button>
              )
            }) : (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">当前情节还没有制作项。</p>
            )}
          </div>
        </div>
      </div>
    </WorkbenchPanel>
  )
}

function resourceFileUrl(resourceId?: number | null) {
  return resourceId ? `/api/v1/resources/${resourceId}/file` : ''
}
