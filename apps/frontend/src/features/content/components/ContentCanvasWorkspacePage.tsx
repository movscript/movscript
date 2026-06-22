import { useMemo } from 'react'
import { GitBranch, MonitorPlay } from 'lucide-react'

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

export default function ContentCanvasWorkspacePage() {
  const controller = useContentCanvasWorkspaceController()
  const { viewModel } = controller
  const activeTab = controller.workspaceTab
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

  return (
    <section
      className="content-canvas-workspace-page"
      data-main-node={activeTab}
      data-workspace-tab={activeTab}
      data-testid="content-canvas-workspace-page"
      style={paneLayout.style}
    >
      <div className="content-canvas-workspace-tabs" role="tablist" aria-label="创作工作区" data-active-tab={activeTab}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'preview'}
          data-active={activeTab === 'preview' ? 'true' : undefined}
          title="预览候选与生产结果"
          aria-label="预览候选与生产结果"
          onClick={() => controller.setWorkspaceTab('preview')}
        >
          <MonitorPlay size={14} aria-hidden="true" />
          预览
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'canvas'}
          data-active={activeTab === 'canvas' ? 'true' : undefined}
          title="编辑依赖图谱与提示词"
          aria-label="编辑依赖图谱与提示词"
          onClick={() => controller.setWorkspaceTab('canvas')}
        >
          <GitBranch size={14} aria-hidden="true" />
          画布
        </button>
      </div>

      <StructurePanel
        isCreatingSetting={Boolean(controller.pendingCanvasAction?.startsWith('root-setting'))}
        isCreatingStructure={Boolean(controller.pendingCanvasAction?.startsWith('structure-'))}
        onCreateSetting={controller.openSettingCreateDialog}
        onCreateProduction={controller.openProductionCreateDialog}
        onCreateStructureChild={controller.openStructureChildCreateDialog}
        paneLayout={paneLayout}
        tree={viewModel.tree}
        onSelectStructureNode={controller.selectStructureNode}
      />

      {activeTab === 'preview' ? (
        <ContentCanvasPreviewPanel
          activeNode={viewModel.activeCanvasNode}
          candidateSelections={controller.candidateSelections}
          graphIndex={viewModel.graphIndex}
          nodes={workspaceNodes}
        />
      ) : (
        <ContentPromptCanvasPanel
          candidateSelections={controller.candidateSelections}
          draftAssetPrompts={controller.draftAssetPrompts}
          draftExpressionPrompts={controller.draftExpressionPrompts}
          edges={viewModel.graph.edges}
          focusRequest={controller.creativeCanvasFocusRequest}
          focusedNodeId={viewModel.activeCanvasNode?.id ?? null}
          manualPositions={controller.creativeCanvasNodePositions}
          savedViewport={controller.creativeCanvasViewport}
          nodes={workspaceNodes}
          onCandidateCreate={controller.createCandidateForNode}
          onCandidatePromptPreview={controller.previewCandidatePromptForNode}
          onCandidateResourceSelect={controller.createResourceCandidateForNode}
          onCandidateSelect={controller.selectCandidate}
          onCandidateNodeSelect={controller.selectCandidateNode}
          onCandidateUpload={controller.uploadCandidateForNode}
          onClearManualPositions={controller.clearCreativeCanvasManualPositions}
          onClearManualPositionsForNodes={controller.clearCreativeCanvasManualPositionsForNodes}
          onCreateChild={controller.openCreativeCanvasCreateChild}
          onDeleteNode={controller.deleteCreativeCanvasNode}
          onExpressionPromptChange={controller.changeExpressionPromptDraft}
          onNodePositionsCommit={controller.commitCreativeCanvasNodePositions}
          onViewportCommit={controller.commitCreativeCanvasViewport}
          onPromptChange={controller.changeAssetPromptDraft}
          onPromptCommit={controller.commitPromptDraft}
          onResourceOpen={controller.openResourceNode}
          onSelectNode={controller.selectNode}
        />
      )}

      <InspectorPanel
        activeSetting={viewModel.activeSetting}
        candidateSelections={controller.candidateSelections}
        draftAssetPrompts={controller.draftAssetPrompts}
        draftExpressionPrompts={controller.draftExpressionPrompts}
        createSelection={controller.createSelection}
        paneLayout={paneLayout}
        promptReferenceNodes={viewModel.scenePromptReferenceNodes}
        selection={viewModel.inspectorSelection}
        onCandidateCreate={controller.createCandidateForNode}
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
        onPromptChange={controller.changeAssetPromptDraft}
        onPromptCommit={controller.commitPromptDraft}
        onSelectNode={controller.selectNode}
      />

      <StructureCreateDialog
        state={controller.structureCreateDialog}
        isBusy={Boolean(controller.pendingCanvasAction?.startsWith('structure-'))}
        onClose={controller.closeStructureCreateDialog}
        onSubmit={controller.submitStructureCreateDialog}
      />

      <SettingCreateDialog
        state={controller.settingCreateDialog}
        isBusy={Boolean(controller.pendingCanvasAction?.startsWith('root-setting'))}
        onClose={controller.closeSettingCreateDialog}
        onSubmit={controller.submitSettingCreateDialog}
      />

    </section>
  )
}
