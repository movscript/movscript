import { Clock3, Film } from 'lucide-react'

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
  Badge,
  ProductionOrchestrationDetailSectionHeader,
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
    <>
      <ProductionSceneEditorSection className="production-orchestration-detail-stage">
        <ProductionOrchestrationDetailSectionHeader
          icon={Film}
          title="情节预览"
          description="查看当前情节的预览挂载、选中镜头和生成提示。"
          actions={row ? (
            <>
              <Badge variant={previewItemCount > 0 ? 'soft' : 'outline'}>{previewItemCount > 0 ? `${previewItemCount} 段预览` : '未挂载预览'}</Badge>
              {runningJobCount > 0 ? <Badge>{runningJobCount} 个任务中</Badge> : null}
            </>
          ) : null}
        />
        <div className="production-shot-plan-panel" data-testid="production-shot-plan-panel">
          {!row ? (
            <WorkbenchEmptyState compact title="尚未选择情节" description="从左侧编排结构选择一个情节后，可以继续拆分镜头和调整时间轴。" />
          ) : (
            <ContentWorkbenchScenePreview
              row={row}
              selectedUnit={selectedUnit}
              keyframes={selectedUnitKeyframes}
              previewItemCount={previewItemCount}
              runningJobCount={runningJobCount}
              showHeader={false}
            />
          )}
        </div>
      </ProductionSceneEditorSection>
      <ProductionSceneEditorSection className="production-orchestration-detail-stage">
        <ProductionOrchestrationDetailSectionHeader
          icon={Clock3}
          title="时间轴"
          description="按镜头类型筛选、调整镜头顺序，并管理当前情节的时间位置。"
        />
        <div className="production-shot-plan-panel" data-testid="production-shot-timeline-panel">
          <UnitProductionTrack
            row={row}
            selectedUnitId={selectedUnit?.ID}
            showInlineEditor={false}
            showSceneBrief={false}
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
        </div>
      </ProductionSceneEditorSection>
    </>
  )
}
