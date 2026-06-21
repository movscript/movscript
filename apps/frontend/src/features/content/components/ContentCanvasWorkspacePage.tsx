import { useMemo } from 'react'

import { SettingCreateDialog, StructureCreateDialog } from './ContentCanvasCreateNodeDialog'
import { useContentCanvasPaneLayout, useContentCanvasRadialLayout } from './contentCanvasWorkspaceLayout'
import {
  CanvasStagePanel,
  InspectorPanel,
  StructurePanel,
  TimelinePanel,
  selectionKindForContentNode,
} from './ContentCanvasWorkspacePanels'
import { useContentCanvasWorkspaceController } from './useContentCanvasWorkspaceController'
import './ContentCanvasWorkspacePage.css'

export default function ContentCanvasWorkspacePage() {
  const controller = useContentCanvasWorkspaceController()
  const { viewModel } = controller
  const paneLayout = useContentCanvasPaneLayout({
    timelineVisible: viewModel.showTimelinePanel,
  })
  const radialLayout = useContentCanvasRadialLayout({
    projectId: controller.projectId,
    mode: controller.canvasMode,
    mainNodeId: viewModel.activeCanvasNode?.id,
  })
  const laidOutStructureRelationNodes = useMemo(
    () => radialLayout.applyNodePositions(viewModel.structureRelationNodes),
    [radialLayout, viewModel.structureRelationNodes],
  )
  const laidOutPromptRelationNodes = useMemo(
    () => radialLayout.applyNodePositions(viewModel.promptRelationNodes),
    [radialLayout, viewModel.promptRelationNodes],
  )
  const laidOutCanvasMainNode = useMemo(
    () => radialLayout.applyNodePositions([viewModel.canvasMainNode])[0] ?? viewModel.canvasMainNode,
    [radialLayout, viewModel.canvasMainNode],
  )

  return (
    <section
      className="content-canvas-workspace-page"
      data-main-node={controller.canvasMode}
      data-testid="content-canvas-workspace-page"
      style={paneLayout.style}
    >
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

      <CanvasStagePanel
        canvasMode={controller.canvasMode}
        candidateSelections={controller.candidateSelections}
        groupedSettingIds={viewModel.sceneSettingGroupIds}
        radialLayout={radialLayout}
        canvasMainNode={laidOutCanvasMainNode}
        promptRelationNodes={laidOutPromptRelationNodes}
        structureRelationNodes={laidOutStructureRelationNodes}
        sceneSettingGroups={viewModel.sceneSettingGroups}
        selected={viewModel.inspectorSelection}
        onDropSetting={(settingId, position) => {
          const setting = viewModel.graphIndex.nodeById.get(settingId)
          if (!setting || setting.kind !== 'setting') return
          controller.addSettingToActiveScene(setting, position)
        }}
        onGetNodeContextActions={controller.nodeContextActions}
        onModeChange={(mode) => {
          controller.setCanvasMode(mode)
        }}
        onMoveSettingGroup={controller.moveSceneSettingGroup}
        onSelectNode={controller.selectNode}
        onSelectSettingGroupNode={(node) => controller.selectNode(selectionKindForContentNode(node), node.id)}
      />

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

      {viewModel.showTimelinePanel ? (
        <TimelinePanel
          emptyText={viewModel.timelineEmptyText}
          items={viewModel.timelineItems}
          resizeHandleProps={paneLayout.timeline.resizeHandleProps}
          title={viewModel.timelineTitle}
        />
      ) : null}

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
