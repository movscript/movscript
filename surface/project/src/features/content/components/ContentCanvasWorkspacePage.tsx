import { useEffect, useMemo } from 'react'

import { SettingCreateDialog, StructureCreateDialog } from './ContentCanvasCreateNodeDialog'
import { useContentCanvasPaneLayout } from './contentCanvasWorkspaceLayout'
import {
  InspectorPanel,
  StructurePanel,
} from './ContentCanvasWorkspacePanels'
import { ContentCanvasPreviewPanel } from './ContentCanvasPreviewPanel'
import { ContentPromptCanvasPanel } from './ContentPromptCanvasPanel'
import { useContentCanvasWorkspaceController } from './useContentCanvasWorkspaceController'
import './ContentCanvasWorkspacePage.css'

type ContentCanvasWorkspaceMode = 'canvas' | 'preview'

export function ContentCanvasPage() {
  return <ContentCanvasWorkspacePage mode="canvas" />
}

export function ContentCanvasPreviewPage() {
  return <ContentCanvasWorkspacePage mode="preview" />
}

export default function ContentCanvasWorkspacePage({
  mode = 'preview',
}: {
  mode?: ContentCanvasWorkspaceMode
}) {
  const controller = useContentCanvasWorkspaceController({ workspaceMode: mode })
  const { setWorkspaceTab, viewModel, workspaceTab } = controller
  const activeTab = mode ?? controller.workspaceTab
  const paneLayout = useContentCanvasPaneLayout({
    timelineVisible: false,
  })
  const workspaceNodes = useMemo(
    () => viewModel.graph.nodes.filter((node) => (
      node.kind !== 'selection'
      && node.kind !== 'actor'
      && node.kind !== 'work_item'
      && node.kind !== 'group'
    )),
    [viewModel.graph.nodes],
  )
  const showStructurePanel = activeTab === 'preview'
  const showInspectorPanel = activeTab === 'preview'

  useEffect(() => {
    if (workspaceTab !== mode) setWorkspaceTab(mode)
  }, [mode, setWorkspaceTab, workspaceTab])

  return (
    <section
      className="content-canvas-workspace-page"
      data-main-node={activeTab}
      data-workspace-mode={activeTab}
      data-workspace-tab={activeTab}
      data-testid="content-canvas-workspace-page"
      style={paneLayout.style}
    >
      {showStructurePanel ? (
        <StructurePanel
          isCreatingSetting={Boolean(controller.pendingCanvasAction?.startsWith('root-setting'))}
          isCreatingStructure={Boolean(controller.pendingCanvasAction?.startsWith('structure-'))}
          onCreateSetting={controller.openSettingCreateDialog}
          onCreateProduction={controller.openProductionCreateDialog}
          onCreateStructureChild={controller.openStructureChildCreateDialog}
          paneLayout={paneLayout}
          scope={viewModel.previewScope}
          tree={viewModel.previewTree}
          viewKind={viewModel.previewScope.kind}
          onSelectStructureNode={controller.selectStructureNode}
        />
      ) : null}

      {activeTab === 'preview' ? (
        <ContentCanvasPreviewPanel
          activeNode={viewModel.activeCanvasNode}
          candidateSelections={controller.candidateSelections}
          graphIndex={viewModel.graphIndex}
          nodes={workspaceNodes}
          previewScope={viewModel.previewScope}
        />
      ) : (
        <ContentPromptCanvasPanel
          activeCanvasDocument={controller.activeCreativeCanvasDocument}
          candidateSelections={controller.candidateSelections}
          canvasDocuments={controller.creativeCanvasDocuments}
          canvasGroups={controller.creativeCanvasGroups}
          canvasNodeIds={controller.creativeCanvasNodeIds}
          draftAssetPrompts={controller.draftAssetPrompts}
          draftExpressionPrompts={controller.draftExpressionPrompts}
          edges={viewModel.graph.edges}
          focusRequest={controller.creativeCanvasFocusRequest}
          focusedNodeId={controller.activeCanvasNodeId}
          manualPositions={controller.creativeCanvasNodePositions}
          namespaceVocabulary={controller.namespaceVocabulary}
          savedViewport={controller.creativeCanvasViewport}
          savePending={controller.creativeCanvasSavePending}
          hasUnsavedChanges={controller.creativeCanvasHasUnsavedChanges}
          nodes={workspaceNodes}
          onAddNodeToCanvas={controller.addNodeToCreativeCanvas}
          onCandidateCreate={controller.createCandidateForNode}
          onCandidatePreflight={controller.preflightCandidateForNode}
          onCandidatePromptPreview={controller.previewCandidatePromptForNode}
          onCandidateResourceSelect={controller.createResourceCandidateForNode}
          onCandidateRemove={controller.removeCandidate}
          onCandidateSelect={controller.selectCandidate}
          onCandidateNodeSelect={controller.selectCandidateNode}
          onCandidateUpload={controller.uploadCandidateForNode}
          onCanvasDeselect={controller.clearCanvasSelection}
          onClearManualPositions={controller.clearCreativeCanvasManualPositions}
          onClearManualPositionsForNodes={controller.clearCreativeCanvasManualPositionsForNodes}
          onCreateChild={controller.openCreativeCanvasCreateChild}
          onCreateCanvas={controller.createFreeCreativeCanvasDocument}
          onCreateGroup={controller.createCreativeCanvasGroup}
          onCreateNode={controller.createCreativeCanvasNode}
          onDeleteNode={controller.deleteCreativeCanvasNode}
          onExpressionPromptChange={controller.changeExpressionPromptDraft}
          onGenerationReferenceAppend={controller.appendGenerationReferenceDraft}
          onNodePositionsCommit={controller.commitCreativeCanvasNodePositions}
          onViewportCommit={controller.commitCreativeCanvasViewport}
          onPromptChange={controller.changeAssetPromptDraft}
          onPromptCommit={controller.commitPromptDraft}
          onReferencePoolCommit={controller.commitPromptReferencePoolDraft}
          onRemoveNodeFromCanvas={controller.removeNodeFromCreativeCanvas}
          onRemoveGroupsFromCanvas={controller.removeGroupsFromCreativeCanvas}
          onRemoveNodesFromCanvas={controller.removeNodesFromCreativeCanvas}
          onStructuredPromptCommit={controller.commitStructuredPromptDraft}
          onResourceOpen={controller.openResourceNode}
          onRenameCanvas={controller.renameFreeCreativeCanvasDocument}
          onSaveCanvas={controller.saveCreativeCanvasDocuments}
          onSelectNode={controller.selectNode}
        />
      )}

      {showInspectorPanel ? (
        <InspectorPanel
          activeSetting={viewModel.activeSetting}
          candidateSelections={controller.candidateSelections}
          draftAssetPrompts={controller.draftAssetPrompts}
          draftExpressionPrompts={controller.draftExpressionPrompts}
          createSelection={controller.createSelection}
          namespaceVocabulary={controller.namespaceVocabulary}
          nodes={workspaceNodes}
          paneLayout={paneLayout}
          promptReferenceNodes={viewModel.scenePromptReferenceNodes}
          selection={viewModel.inspectorSelection}
          onCandidateCreate={controller.createCandidateForNode}
          onCandidatePreflight={controller.preflightCandidateForNode}
          onCandidatePromptPreview={controller.previewCandidatePromptForNode}
          onCandidateResourceSelect={controller.createResourceCandidateForNode}
          onCandidateSelect={controller.selectCandidate}
          onCandidateUpload={controller.uploadCandidateForNode}
          onCreateAsset={controller.createAssetForState}
          onCreateExpressionUnit={controller.createExpressionUnitForScene}
          onCreateKeyframe={controller.createKeyframeForOwner}
          onCreateState={controller.createStateForSetting}
          onCreateStoryboard={controller.createStoryboardForOwner}
          onExpressionPromptChange={controller.changeExpressionPromptDraft}
          onExpressionUnitSave={controller.saveExpressionUnit}
          onGenerationReferenceAppend={controller.appendGenerationReferenceDraft}
          onPromptChange={controller.changeAssetPromptDraft}
          onPromptCommit={controller.commitPromptDraft}
          onReferencePoolCommit={controller.commitPromptReferencePoolDraft}
          onStructuredPromptCommit={controller.commitStructuredPromptDraft}
          onSelectNode={controller.selectNode}
        />
      ) : null}

      <StructureCreateDialog
        state={controller.structureCreateDialog}
        isBusy={Boolean(controller.pendingCanvasAction?.startsWith('structure-'))}
        namespaceVocabulary={controller.namespaceVocabulary}
        onClose={controller.closeStructureCreateDialog}
        onSubmit={controller.submitStructureCreateDialog}
      />

      <SettingCreateDialog
        state={controller.settingCreateDialog}
        isBusy={Boolean(controller.pendingCanvasAction?.startsWith('root-setting'))}
        namespaceVocabulary={controller.namespaceVocabulary}
        onClose={controller.closeSettingCreateDialog}
        onSubmit={controller.submitSettingCreateDialog}
      />

    </section>
  )
}
