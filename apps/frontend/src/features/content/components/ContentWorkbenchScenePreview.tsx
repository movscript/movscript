import { Film } from 'lucide-react'

import { ResourceFileImage } from '@/shared/ui/ResourceFileImage'
import { WorkbenchScenePreviewPanel } from '@movscript/ui'
import { trackKindLabel } from '@/features/content/domain/contentWorkbenchLabels'
import { byOrder, firstText, numberOf, titleOfRecord } from '@/features/content/domain/contentWorkbenchRecordUtils'

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
  showHeader = true,
}: {
  row: ContentWorkbenchScenePreviewRow | null
  selectedUnit: ContentWorkbenchScenePreviewRecord | null
  keyframes: ContentWorkbenchScenePreviewRecord[]
  previewItemCount: number
  runningJobCount: number
  showHeader?: boolean
}) {
  const primaryKeyframe = keyframes.find((keyframe) => numberOf(keyframe.resource_id) > 0) ?? keyframes[0]
  const unitTitle = selectedUnit ? titleOfRecord(selectedUnit) : '未选择制作项'
  const unitKind = selectedUnit ? trackKindLabel(String(selectedUnit.kind || 'shot')) : '待选择'
  const promptText = selectedUnit ? firstText(selectedUnit.prompt, selectedUnit.description, '暂无基础提示词') : '先在时间轴中选择一个制作项。'
  const sortedUnits = row?.units.slice().sort(byOrder) ?? []
  const selectedIndex = row && selectedUnit
    ? sortedUnits.findIndex((unit) => unit.ID === selectedUnit.ID)
    : -1
  const primaryResourceId = numberOf(primaryKeyframe?.resource_id)

  return (
    <WorkbenchScenePreviewPanel
      title="情节预览"
      icon={Film}
      previewBadgeLabel={previewItemCount > 0 ? `${previewItemCount} 段预览` : '未挂载预览'}
      previewMounted={previewItemCount > 0}
      runningJobLabel={runningJobCount > 0 ? `${runningJobCount} 个任务中` : undefined}
      media={primaryResourceId > 0 ? (
        <ResourceFileImage
          resourceId={primaryResourceId}
          alt={titleOfRecord(primaryKeyframe)}
        />
      ) : undefined}
      fallbackKicker={row ? titleOfRecord(row.moment) : '等待情节'}
      unitTitle={unitTitle}
      promptText={promptText}
      unitKindLabel={unitKind}
      shotLabel={selectedIndex >= 0 ? `Shot ${String(selectedIndex + 1).padStart(2, '0')}` : undefined}
      unitCountLabel={row ? `${sortedUnits.length} 个制作项` : '等待情节'}
      showHeader={showHeader}
    />
  )
}
