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
  onEditSegment,
  onCreateSegment,
  onCreateSceneMoment,
  onSelectSceneMoment,
  onBindSceneMomentScriptBlock,
  onCreateAndBindSceneMomentScriptBlock,
  onSaveSceneMoment,
  onLinkReferenceToSceneMoment,
  onUnlinkReferenceFromSceneMoment,
  onSaveExpressionLine,
  onDeleteExpressionLine,
  onAddExpressionLine,
  isSavingSceneMoment,
  isLinkingSceneMomentReference,
  isDeletingSceneMomentReference,
  isSavingExpressionLine,
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
  onEditSegment: (record: SemanticEntityRecord) => void
  onCreateSegment: () => void
  onCreateSceneMoment: (segmentId: number) => void
  onSelectSceneMoment: (momentId: number) => void
  onBindSceneMomentScriptBlock: (momentId: number, scriptBlockId: number | null) => void
  onCreateAndBindSceneMomentScriptBlock: (momentId: number, startLine: number, endLine: number) => void
  onSaveSceneMoment: (momentId: number, payload: SemanticEntityPayload) => void
  onLinkReferenceToSceneMoment: (momentId: number, referenceId: number, role: string) => void
  onUnlinkReferenceFromSceneMoment: (usageId: number) => void
  onSaveExpressionLine: (target: ProductionWritingExpressionEditTarget, payload: ProductionWritingExpressionSavePayload) => void
  onDeleteExpressionLine: (target: ProductionWritingExpressionEditTarget) => void
  onAddExpressionLine: (momentId: number, order: number, scriptBlockId?: number | null) => void
  isSavingSceneMoment: boolean
  isLinkingSceneMomentReference: boolean
  isDeletingSceneMomentReference: boolean
  isSavingExpressionLine: boolean
}) {
  const view = buildProductionOrchestrationWorkspaceView({
    segments,
    sceneMoments,
    writingExpressions,
    scriptBlocks,
    selectedMomentId,
    lookup,
  })

  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <ProductionStructureWorkspaceLayout
        segments={view.segmentNavigatorItems}
        onCreateSegment={onCreateSegment}
        onCreateSceneMoment={onCreateSceneMoment}
        onEditSegment={onEditSegment}
        onSelectSceneMoment={onSelectSceneMoment}
      >
        <ProductionSelectedSegmentSummary
          selectedSegmentTitle={view.selectedSegment ? productionOrchestrationRecordTitle(view.selectedSegment) : '未选择编排段'}
          selectedSegmentSummary={view.selectedSegment ? String(view.selectedSegment.summary ?? view.selectedSegment.content ?? '这一段还没有说明编排功能。') : '选择情节后，这里会显示它所属编排段的节奏任务。'}
          momentCount={view.selectedSegmentMoments.length}
          lineCount={view.selectedSegmentLineCount}
          selectedSegmentId={view.selectedSegment?.ID ?? null}
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
            isBindingScriptBlock={isBindingSceneMomentScriptBlock}
            onSave={onSaveSceneMoment}
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
          onAddExpressionLine={onAddExpressionLine}
          onSaveExpressionLine={onSaveExpressionLine}
          onDeleteExpressionLine={onDeleteExpressionLine}
        />
      </ProductionStructureWorkspaceLayout>
    </div>
  )
}
