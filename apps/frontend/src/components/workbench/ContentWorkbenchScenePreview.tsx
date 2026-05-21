import { Film } from 'lucide-react'

import { AuthedImage } from '@/components/shared/AuthedImage'
import { WorkbenchPanel } from '@/components/workbench/WorkbenchPanel'
import { WorkbenchThumbnail } from '@/components/workbench/WorkbenchPrimitives'
import { trackKindLabel } from '@/lib/contentWorkbenchLabels'
import { byOrder, firstText, numberOf, titleOfRecord } from '@/lib/contentWorkbenchRecordUtils'
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
}: {
  row: ContentWorkbenchScenePreviewRow | null
  selectedUnit: ContentWorkbenchScenePreviewRecord | null
  keyframes: ContentWorkbenchScenePreviewRecord[]
  previewItemCount: number
  runningJobCount: number
}) {
  const primaryKeyframe = keyframes.find((keyframe) => numberOf(keyframe.resource_id) > 0) ?? keyframes[0]
  const unitTitle = selectedUnit ? titleOfRecord(selectedUnit) : '未选择制作项'
  const unitKind = selectedUnit ? trackKindLabel(String(selectedUnit.kind || 'shot')) : '待选择'
  const promptText = selectedUnit ? firstText(selectedUnit.prompt, selectedUnit.description, '暂无基础提示词') : '先在时间轴中选择一个制作项。'
  const sortedUnits = row?.units.slice().sort(byOrder) ?? []
  const selectedIndex = row && selectedUnit
    ? sortedUnits.findIndex((unit) => unit.ID === selectedUnit.ID)
    : -1

  return (
    <WorkbenchPanel
      title="情节预览"
      icon={Film}
      className="rounded-none border-0 bg-transparent"
      bodyClassName="p-0 pt-2.5"
      action={(
        <div className="flex items-center gap-1.5">
          <Badge variant={previewItemCount > 0 ? 'secondary' : 'outline'}>{previewItemCount > 0 ? `${previewItemCount} 段预览` : '未挂载预览'}</Badge>
          {runningJobCount > 0 ? <Badge variant="secondary">{runningJobCount} 个任务中</Badge> : null}
        </div>
      )}
    >
      <div className="min-w-0" data-testid="content-workbench-scene-preview">
        <WorkbenchThumbnail ratio="banner" className="min-h-[220px]">
          {primaryKeyframe?.resource_id ? (
            <AuthedImage
              src={resourceFileUrl(numberOf(primaryKeyframe.resource_id))}
              alt={titleOfRecord(primaryKeyframe)}
            />
          ) : (
            <div className="flex h-full w-full flex-col justify-between bg-[radial-gradient(circle_at_26%_24%,hsl(var(--muted-foreground)/0.18),transparent_32%),linear-gradient(135deg,hsl(var(--muted)),hsl(var(--background)))] p-4">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Preview</Badge>
                <span className="type-label text-muted-foreground">{row ? titleOfRecord(row.moment) : '等待情节'}</span>
              </div>
              <div className="max-w-[640px]">
                <p className="type-title font-semibold text-foreground">{unitTitle}</p>
                <p className="mt-2 line-clamp-3 type-body leading-6 text-muted-foreground">{promptText}</p>
              </div>
            </div>
          )}
          <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="bg-background/90 shadow-sm">{unitKind}</Badge>
            {selectedIndex >= 0 ? <Badge variant="outline" className="bg-background/90 shadow-sm">Shot {String(selectedIndex + 1).padStart(2, '0')}</Badge> : null}
          </div>
          <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="bg-background/90 shadow-sm">{row ? `${sortedUnits.length} 个制作项` : '等待情节'}</Badge>
          </div>
        </WorkbenchThumbnail>
      </div>
    </WorkbenchPanel>
  )
}

function resourceFileUrl(resourceId?: number | null) {
  return resourceId ? `/api/v1/resources/${resourceId}/file` : ''
}
