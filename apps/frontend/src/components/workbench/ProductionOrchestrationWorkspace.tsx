import { useEffect, useState } from 'react'

import type { SemanticEntityPayload, SemanticEntityRecord } from '@/api/semanticEntities'
import {
  InlineSceneMomentEditor,
  ProductionWritingExpressionsPanel,
  SceneMomentSettingsEditor,
} from '@/components/workbench/ProductionSceneWriting'
import {
  ProductionSceneEditorHeader,
  ProductionSelectedSegmentSummary,
  ProductionStructureWorkspaceLayout,
} from '@/components/workbench/ProductionOrchestrationStructure'
import type {
  AssetSlotRecord,
  CreativeReferenceRecord,
  SceneMomentRecord,
  ScriptBlockRecord,
  SegmentRecord,
  WritingExpressionRecord,
} from '@/lib/productionOrchestrationData'
import {
  buildProductionOrchestrationWorkspaceView,
  productionOrchestrationRecordTitle,
  type ProductionWorkspaceLookup,
} from '@/lib/productionOrchestrationWorkspaceModel'
import type {
  ProductionWritingExpressionEditTarget,
  ProductionWritingExpressionSavePayload,
} from '@/lib/productionWritingExpressions'

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
    <div className="flex h-full min-h-0 flex-col p-4">
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

        <section className="border-b border-border pb-3">
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
        </section>

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
    </div>
  )
}
