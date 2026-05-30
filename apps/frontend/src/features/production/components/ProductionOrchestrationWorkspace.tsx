import { useEffect, useState } from 'react'

import type { SemanticEntityPayload } from '@/shared/infrastructure/api/semanticEntities'
import {
  InlineSceneMomentEditor,
  ProductionWritingExpressionsPanel,
  SceneMomentSettingsEditor,
} from '@/features/production/components/ProductionSceneWriting'
import { ProductionShotPlanPanel } from '@/features/production/components/ProductionShotPlanPanel'
import {
  ProductionStructureWorkspaceLayout,
} from '@/features/production/components/ProductionOrchestrationStructure'
import type {
  ContentGenerationMomentRow,
  ContentWorkbenchRecord,
} from '@/features/content/domain/contentWorkbenchModel'
import type { ContentWorkbenchDropPosition } from '@/features/content/domain/contentWorkbenchTimeline'
import type { Job } from '@/types'
import type {
  AssetSlotRecord,
  CreativeReferenceRecord,
  SceneMomentRecord,
  ScriptBlockRecord,
  SegmentRecord,
  WritingExpressionRecord,
} from '@/features/production/domain/productionOrchestrationData'
import {
  buildProductionOrchestrationWorkspaceView,
  type ProductionOrchestrationDropPosition,
  type ProductionWorkspaceLookup,
} from '@/features/production/domain/productionOrchestrationWorkspaceModel'
import type {
  ProductionWritingExpressionEditTarget,
  ProductionWritingExpressionSavePayload,
} from '@/features/production/domain/productionWritingExpressions'
import {
  OverlapPaneRevealButton,
  ProductionOrchestrationDetailContent,
  ProductionOrchestrationDetailPane,
  ProductionOrchestrationNavigatorPane,
  ProductionOrchestrationPaneGroup,
  ProductionOrchestrationWorkspaceShell,
  ProductionSceneEditorSection,
  usePersistentOverlapPaneController,
} from '@movscript/ui'

const PRODUCTION_ORCHESTRATION_DETAIL_PANE_WIDTH_STORAGE_KEY = 'movscript.productionOrchestration.detailPaneWidth'

export function ProductionOrchestrationWorkspace({
  scriptSourceText,
  creativeReferences,
  assetSlots,
  segments,
  sceneMoments,
  writingExpressions,
  scriptBlocks,
  projectId,
  selectedMomentId,
  shotPlanRow,
  selectedContentUnit,
  shotPlanJobs,
  shotPlanQueryKey,
  isReorderingShotPlan,
  isBindingSceneMomentScriptBlock,
  lookup,
  onCreateSegment,
  onCreateSceneMoment,
  onSelectSceneMoment,
  onReorderSegment,
  onReorderSceneMoment,
  onSelectContentUnit,
  onCreateContentUnit,
  onAiSuggestShotPlan,
  onOpenContentUnitEditor,
  onSelectFirstSceneMomentForShotPlan,
  onReorderContentUnit,
  onMoveContentUnitOnTimeline,
  onSaveSegment,
  onDeleteSegment,
  onBindSceneMomentScriptBlock,
  onCreateAndBindSceneMomentScriptBlock,
  onSaveSceneMoment,
  onDeleteSceneMoment,
  onLinkReferenceToSceneMoment,
  onUnlinkReferenceFromSceneMoment,
  onSaveExpressionLine,
  onDeleteExpressionLine,
  onAddExpressionLine,
  canDeleteFallbackContentUnits = false,
  isSavingSegment,
  isReorderingStructure,
  isDeletingSegment,
  isSavingSceneMoment,
  isDeletingSceneMoment,
  isLinkingSceneMomentReference,
  isDeletingSceneMomentReference,
  isSavingExpressionLine,
  allowCreateAndBindSceneMomentScriptBlock = true,
}: {
  scriptSourceText: string
  creativeReferences: CreativeReferenceRecord[]
  assetSlots: AssetSlotRecord[]
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  writingExpressions: WritingExpressionRecord[]
  scriptBlocks: ScriptBlockRecord[]
  projectId?: number
  selectedMomentId: number | null
  shotPlanRow: ContentGenerationMomentRow | null
  selectedContentUnit: ContentWorkbenchRecord | null
  shotPlanJobs: Job[]
  shotPlanQueryKey?: readonly unknown[]
  isReorderingShotPlan?: boolean
  isBindingSceneMomentScriptBlock: boolean
  lookup: ProductionWorkspaceLookup
  onCreateSegment: () => void
  onCreateSceneMoment: (segmentId: number) => void
  onSelectSceneMoment: (momentId: number) => void
  onReorderSegment: (draggedSegmentId: number, targetSegmentId: number, position: ProductionOrchestrationDropPosition) => void
  onReorderSceneMoment: (draggedMomentId: number, targetSegmentId: number, targetMomentId: number | null, position: ProductionOrchestrationDropPosition) => void
  onSelectContentUnit: (unitId: number | null) => void
  onCreateContentUnit: () => void
  onAiSuggestShotPlan: () => void
  onOpenContentUnitEditor: (unitId: number) => void
  onSelectFirstSceneMomentForShotPlan: () => void
  onReorderContentUnit: (draggedUnitId: number, targetUnitId: number, position: ContentWorkbenchDropPosition) => void
  onMoveContentUnitOnTimeline: (unitId: number, startSec: number) => void
  onSaveSegment: (segmentId: number, payload: SemanticEntityPayload) => void
  onDeleteSegment: (segmentId: number) => void
  onBindSceneMomentScriptBlock: (momentId: number, scriptBlockId: number | null) => void
  onCreateAndBindSceneMomentScriptBlock: (momentId: number, startLine: number, endLine: number) => void
  onSaveSceneMoment: (momentId: number, payload: SemanticEntityPayload) => void
  onDeleteSceneMoment: (momentId: number) => void
  onLinkReferenceToSceneMoment: (momentId: number, referenceId: number, role: string) => void
  onUnlinkReferenceFromSceneMoment: (usageId: number) => void
  onSaveExpressionLine: (target: ProductionWritingExpressionEditTarget, payload: ProductionWritingExpressionSavePayload) => void
  onDeleteExpressionLine: (target: ProductionWritingExpressionEditTarget) => void
  onAddExpressionLine: (momentId: number, order: number, scriptBlockId?: number | null) => void
  canDeleteFallbackContentUnits?: boolean
  isSavingSegment: boolean
  isReorderingStructure: boolean
  isDeletingSegment: boolean
  isSavingSceneMoment: boolean
  isDeletingSceneMoment: boolean
  isLinkingSceneMomentReference: boolean
  isDeletingSceneMomentReference: boolean
  isSavingExpressionLine: boolean
  allowCreateAndBindSceneMomentScriptBlock?: boolean
}) {
  const [editingSegmentId, setEditingSegmentId] = useState<number | null>(null)
  const detailPane = usePersistentOverlapPaneController({
    storageKey: PRODUCTION_ORCHESTRATION_DETAIL_PANE_WIDTH_STORAGE_KEY,
    defaultSize: 760,
    minSize: 520,
    maxSize: (containerRect) => Math.max(560, Math.min(containerRect.width - 280, 1040)),
    resizeEdge: 'left',
    collapseMode: 'after-min',
    expandMode: 'after-max',
    ariaLabel: '调整创作编排详情面板宽度',
  })
  const view = buildProductionOrchestrationWorkspaceView({
    segments,
    sceneMoments,
    writingExpressions,
    scriptBlocks,
    selectedMomentId,
    lookup,
  })
  const hasSelectedMoment = Boolean(view.selectedMoment)
  const detailPaneLayoutProps = hasSelectedMoment
    ? detailPane.groupProps
    : {
        ...detailPane.groupProps,
        'data-overlap-pane-collapsed': 'true' as const,
        'data-overlap-pane-expanded': undefined,
      }

  useEffect(() => {
    if (editingSegmentId && !segments.some((segment) => segment.ID === editingSegmentId)) {
      setEditingSegmentId(null)
    }
  }, [editingSegmentId, segments])

  return (
    <ProductionOrchestrationWorkspaceShell>
      <ProductionOrchestrationPaneGroup
        {...detailPaneLayoutProps}
      >
        <ProductionOrchestrationNavigatorPane>
          <ProductionStructureWorkspaceLayout
            segments={view.segmentNavigatorItems}
            editingSegmentId={editingSegmentId}
            isSavingSegment={isSavingSegment}
            isReorderingStructure={isReorderingStructure}
            isDeletingSegment={isDeletingSegment}
            onCreateSegment={onCreateSegment}
            onCreateSceneMoment={onCreateSceneMoment}
            onEditingSegmentChange={setEditingSegmentId}
            onSaveSegment={onSaveSegment}
            onDeleteSegment={onDeleteSegment}
            onSelectSceneMoment={onSelectSceneMoment}
            onReorderSegment={onReorderSegment}
            onReorderSceneMoment={onReorderSceneMoment}
          />
        </ProductionOrchestrationNavigatorPane>
        {hasSelectedMoment && !detailPane.collapsed ? (
          <ProductionOrchestrationDetailPane
            overlapState={detailPane.overlapState}
            resizeHandleProps={detailPane.resizeHandleProps}
            resizeHandleSide="left"
          >
            <ProductionOrchestrationDetailContent>
              <ProductionSceneEditorSection>
                <SceneMomentSettingsEditor
                  moment={view.selectedMoment}
                  creativeReferences={creativeReferences}
                  assetSlots={assetSlots}
                  lookup={lookup}
                  isSaving={isLinkingSceneMomentReference || isDeletingSceneMomentReference}
                  onLinkReference={onLinkReferenceToSceneMoment}
                  onUnlinkReference={onUnlinkReferenceFromSceneMoment}
                />
                <InlineSceneMomentEditor
                  moment={view.selectedMoment}
                  momentBlock={view.selectedMomentScriptBlock}
                  scriptBlocks={scriptBlocks}
                  scriptSourceText={scriptSourceText}
                  isSaving={isSavingSceneMoment}
                  isDeleting={isDeletingSceneMoment}
                  isBindingScriptBlock={isBindingSceneMomentScriptBlock}
                  allowCreateAndBindMomentScriptBlock={allowCreateAndBindSceneMomentScriptBlock}
                  onSave={onSaveSceneMoment}
                  onDelete={onDeleteSceneMoment}
                  onBindMomentScriptBlock={onBindSceneMomentScriptBlock}
                  onCreateAndBindMomentScriptBlock={onCreateAndBindSceneMomentScriptBlock}
                />
              </ProductionSceneEditorSection>

              <ProductionWritingExpressionsPanel
                selectedMoment={view.selectedMoment}
                selectedMomentScriptBlock={view.selectedMomentScriptBlock}
                expressionLines={view.expressionLines}
                creativeReferences={creativeReferences}
                lookup={lookup}
                isSavingExpressionLine={isSavingExpressionLine}
                canDeleteFallbackContentUnits={canDeleteFallbackContentUnits}
                onAddExpressionLine={onAddExpressionLine}
                onSaveExpressionLine={onSaveExpressionLine}
                onDeleteExpressionLine={onDeleteExpressionLine}
              />
              <ProductionShotPlanPanel
                row={shotPlanRow}
                selectedUnit={selectedContentUnit}
                jobs={shotPlanJobs}
                projectId={projectId}
                queryKey={shotPlanQueryKey}
                isReordering={isReorderingShotPlan}
                onSelectUnit={onSelectContentUnit}
                onCreateUnit={onCreateContentUnit}
                onAiSuggest={onAiSuggestShotPlan}
                onOpenUnitEditor={onOpenContentUnitEditor}
                onSelectFirstMoment={onSelectFirstSceneMomentForShotPlan}
                onReorderUnit={onReorderContentUnit}
                onMoveUnitOnTimeline={onMoveContentUnitOnTimeline}
              />
            </ProductionOrchestrationDetailContent>
          </ProductionOrchestrationDetailPane>
        ) : null}
        {hasSelectedMoment && detailPane.collapsed ? (
          <OverlapPaneRevealButton
            action="show"
            label="显示情节详情"
            onClick={detailPane.show}
          />
        ) : null}
        {hasSelectedMoment && detailPane.expanded ? (
          <OverlapPaneRevealButton
            action="restore"
            label="还原情节详情"
            onClick={detailPane.restore}
          />
        ) : null}
      </ProductionOrchestrationPaneGroup>
    </ProductionOrchestrationWorkspaceShell>
  )
}
