import { ContentWorkbenchScenePreview } from '@/features/content/components/ContentWorkbenchScenePreview'
import { UnitProductionTrack } from '@/features/content/components/ContentWorkbenchUnitTrack'
import type {
  ContentGenerationMomentRow,
  ContentWorkbenchRecord,
} from '@/features/content/domain/contentWorkbenchModel'
import { numberOf } from '@/features/content/domain/contentWorkbenchRecordUtils'
import type { ContentWorkbenchDropPosition } from '@/features/content/domain/contentWorkbenchTimeline'
import type { Job } from '@/types'
import {
  ProductionSceneEditorSection,
  WorkbenchEmptyState,
} from '@movscript/ui'

export function ProductionShotPlanPanel({
  row,
  selectedUnit,
  jobs,
  projectId,
  queryKey,
  isReordering,
  onSelectUnit,
  onCreateUnit,
  onAiSuggest,
  onOpenUnitEditor,
  onSelectFirstMoment,
  onReorderUnit,
  onMoveUnitOnTimeline,
}: {
  row: ContentGenerationMomentRow | null
  selectedUnit: ContentWorkbenchRecord | null
  jobs: Job[]
  projectId?: number
  queryKey?: readonly unknown[]
  isReordering?: boolean
  onSelectUnit: (unitId: number | null) => void
  onCreateUnit: () => void
  onAiSuggest: () => void
  onOpenUnitEditor: (unitId: number) => void
  onSelectFirstMoment: () => void
  onReorderUnit: (draggedUnitId: number, targetUnitId: number, position: ContentWorkbenchDropPosition) => void
  onMoveUnitOnTimeline: (unitId: number, startSec: number) => void
}) {
  const selectedUnitKeyframes = row && selectedUnit
    ? row.keyframes.filter((keyframe) => Number(keyframe.content_unit_id) === selectedUnit.ID)
    : []
  const selectedProductionIds = new Set(row?.productionIds ?? [])
  const previewItemCount = row?.previewTimelineItems.filter((item) => (
    selectedProductionIds.has(numberOf(item.production_id)) ||
    numberOf(item.scene_moment_id) === row.moment.ID ||
    (selectedUnit?.ID ? numberOf(item.content_unit_id) === selectedUnit.ID : false)
  )).length ?? 0
  const runningJobCount = jobs.filter((job) => job.status === 'pending' || job.status === 'running').length

  return (
    <ProductionSceneEditorSection>
      <div className="production-shot-plan-panel" data-testid="production-shot-plan-panel">
        {!row ? (
          <WorkbenchEmptyState compact title="尚未选择情节" description="从左侧编排结构选择一个情节后，可以继续拆分镜头和调整时间轴。" />
        ) : (
          <>
            <ContentWorkbenchScenePreview
              row={row}
              selectedUnit={selectedUnit}
              keyframes={selectedUnitKeyframes}
              previewItemCount={previewItemCount}
              runningJobCount={runningJobCount}
            />
            <UnitProductionTrack
              row={row}
              selectedUnitId={selectedUnit?.ID}
              showInlineEditor={false}
              onSelectUnit={onSelectUnit}
              onOpenUnitEditor={onOpenUnitEditor}
              onCreateUnit={onCreateUnit}
              onAiSuggest={onAiSuggest}
              onSelectFirstMoment={onSelectFirstMoment}
              onReorderUnit={onReorderUnit}
              onMoveUnitOnTimeline={onMoveUnitOnTimeline}
              projectId={projectId}
              queryKey={queryKey}
              jobs={jobs}
              isReordering={isReordering}
            />
          </>
        )}
      </div>
    </ProductionSceneEditorSection>
  )
}
