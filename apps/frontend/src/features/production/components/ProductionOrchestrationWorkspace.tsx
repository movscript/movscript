import { useEffect, useState } from 'react'

import type { SemanticEntityPayload, SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import {
  InlineSceneMomentEditor,
  ProductionWritingExpressionsPanel,
  SceneMomentSettingsEditor,
} from '@/features/production/components/ProductionSceneWriting'
import {
  ProductionSceneEditorHeader,
  ProductionSelectedSegmentSummary,
  ProductionStructureWorkspaceLayout,
} from '@/features/production/components/ProductionOrchestrationStructure'
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
  productionOrchestrationRecordTitle,
  type ProductionWorkspaceLookup,
} from '@/features/production/domain/productionOrchestrationWorkspaceModel'
import type {
  ProductionWritingExpressionEditTarget,
  ProductionWritingExpressionSavePayload,
} from '@/features/production/domain/productionWritingExpressions'
import {
  ProductionOrchestrationWorkspaceShell,
  ProductionSceneEditorSection,
} from '@movscript/ui'

export function ProductionOrchestrationWorkspace({
  scriptSourceText,
  creativeReferences,
  assetSlots,
  segments,
  sceneMoments,
  writingExpressions,
  scriptBlocks,
  selectedMomentId,
  isBindingSceneMomentScriptBlock,
  lookup,
  onCreateSegment,
  onCreateSceneMoment,
  onSelectSceneMoment,
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
  selectedMomentId: number | null
  isBindingSceneMomentScriptBlock: boolean
  lookup: ProductionWorkspaceLookup
  onCreateSegment: () => void
  onCreateSceneMoment: (segmentId: number) => void
  onSelectSceneMoment: (momentId: number) => void
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
  isDeletingSegment: boolean
  isSavingSceneMoment: boolean
  isDeletingSceneMoment: boolean
  isLinkingSceneMomentReference: boolean
  isDeletingSceneMomentReference: boolean
  isSavingExpressionLine: boolean
  allowCreateAndBindSceneMomentScriptBlock?: boolean
}) {
  const [editingSegmentId, setEditingSegmentId] = useState<number | null>(null)
  const view = buildProductionOrchestrationWorkspaceView({
    segments,
    sceneMoments,
    writingExpressions,
    scriptBlocks,
    selectedMomentId,
    lookup,
  })

  useEffect(() => {
    if (editingSegmentId && view.selectedSegment?.ID !== editingSegmentId) {
      setEditingSegmentId(null)
    }
  }, [editingSegmentId, view.selectedSegment?.ID])

  return (
    <ProductionOrchestrationWorkspaceShell>
      <ProductionStructureWorkspaceLayout
        segments={view.segmentNavigatorItems}
        onCreateSegment={onCreateSegment}
        onCreateSceneMoment={onCreateSceneMoment}
        onEditSegment={(record: SemanticEntityRecord) => setEditingSegmentId(record.ID)}
        onSelectSceneMoment={onSelectSceneMoment}
      >
        <ProductionSelectedSegmentSummary
          selectedSegment={view.selectedSegment}
          momentCount={view.selectedSegmentMoments.length}
          lineCount={view.selectedSegmentLineCount}
          isSaving={isSavingSegment}
          isDeleting={isDeletingSegment}
          editing={Boolean(view.selectedSegment && editingSegmentId === view.selectedSegment.ID)}
          onEditingChange={(editing) => setEditingSegmentId(editing && view.selectedSegment ? view.selectedSegment.ID : null)}
          onSaveSegment={onSaveSegment}
          onDeleteSegment={onDeleteSegment}
          onCreateSceneMoment={onCreateSceneMoment}
        />

        <ProductionSceneEditorSection>
          <ProductionSceneEditorHeader
            title={view.selectedMoment ? productionOrchestrationRecordTitle(view.selectedMoment) : '选择一个情节开始写'}
            selectedSegmentTitle={view.selectedSegment ? productionOrchestrationRecordTitle(view.selectedSegment) : '未选择'}
            dramaticTask={view.selectedMoment?.description || view.selectedMoment?.action_text || view.selectedSegment?.summary || '待补'}
            writingProgressLabel={view.writingProgressLabel}
          />
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
      </ProductionStructureWorkspaceLayout>
    </ProductionOrchestrationWorkspaceShell>
  )
}
