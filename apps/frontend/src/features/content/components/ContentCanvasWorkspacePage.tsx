import { useMemo } from 'react'

import { SettingCreateDialog, StructureCreateDialog } from './ContentCanvasCreateNodeDialog'
import { useContentCanvasPaneLayout, useContentCanvasRadialLayout } from './contentCanvasWorkspaceLayout'
import {
  CanvasStagePanel,
  InspectorPanel,
  SettingCatalogPanel,
  StructurePanel,
  TimelinePanel,
  selectionKindForContentNode,
} from './ContentCanvasWorkspacePanels'
import { useContentCanvasWorkspaceController } from './useContentCanvasWorkspaceController'
import './ContentCanvasWorkspacePage.css'

export default function ContentCanvasWorkspacePage() {
  const paneLayout = useContentCanvasPaneLayout()
  const controller = useContentCanvasWorkspaceController()
  const { viewModel } = controller
  const radialLayout = useContentCanvasRadialLayout({
    projectId: controller.projectId,
    mode: controller.canvasMode,
    mainNodeId: controller.canvasMode === 'scene_moment' ? viewModel.activeScene?.id : viewModel.activeSetting?.id,
  })
  const laidOutSceneRelationNodes = useMemo(
    () => radialLayout.applyNodePositions(viewModel.sceneRelationNodes),
    [radialLayout, viewModel.sceneRelationNodes],
  )
  const laidOutSceneMainNode = useMemo(
    () => radialLayout.applyNodePositions([viewModel.sceneMainNode])[0] ?? viewModel.sceneMainNode,
    [radialLayout, viewModel.sceneMainNode],
  )
  const laidOutSettingRelationNodes = useMemo(
    () => radialLayout.applyNodePositions(viewModel.settingRelationNodes),
    [radialLayout, viewModel.settingRelationNodes],
  )
  const laidOutSettingMainNode = useMemo(
    () => viewModel.settingMainNode ? radialLayout.applyNodePositions([viewModel.settingMainNode])[0] : null,
    [radialLayout, viewModel.settingMainNode],
  )

  return (
    <section
      className="content-canvas-workspace-page"
      data-main-node={controller.canvasMode}
      data-testid="content-canvas-workspace-page"
      style={paneLayout.style}
    >
      <SettingCatalogPanel
        activeKind={controller.activeKind}
        filteredSettings={viewModel.filteredSettings}
        isLoading={controller.projectQuery.isLoading}
        pendingCanvasAction={controller.pendingCanvasAction}
        projectId={controller.projectId}
        settingNodesCount={viewModel.settingNodes.length}
        settingQuery={controller.settingQuery}
        onActiveKindChange={controller.setActiveKind}
        onCreateSetting={controller.openSettingCreateDialog}
        onQueryChange={controller.setSettingQuery}
        onSelectSetting={controller.selectSetting}
        resizeHandleProps={paneLayout.settingCatalog.resizeHandleProps}
      />

      <StructurePanel
        isCreatingStructure={Boolean(controller.pendingCanvasAction?.startsWith('structure-'))}
        onCreateProduction={controller.openProductionCreateDialog}
        onCreateStructureChild={controller.openStructureChildCreateDialog}
        paneLayout={paneLayout}
        tree={viewModel.tree}
        onSelectStructureNode={controller.selectStructureNode}
      />

      <CanvasStagePanel
        activeScene={viewModel.activeScene}
        activeSetting={viewModel.activeSetting}
        canvasMode={controller.canvasMode}
        candidateSelections={controller.candidateSelections}
        groupedSettingIds={viewModel.sceneSettingGroupIds}
        radialLayout={radialLayout}
        sceneCanvasActions={controller.sceneCanvasActions}
        sceneMainNode={laidOutSceneMainNode}
        sceneRelationNodes={laidOutSceneRelationNodes}
        sceneSettingGroups={viewModel.sceneSettingGroups}
        selected={viewModel.inspectorSelection}
        settingCanvasActions={controller.settingCanvasActions}
        settingMainNode={laidOutSettingMainNode}
        settingRelationNodes={laidOutSettingRelationNodes}
        onDropSetting={(settingId, position) => {
          const setting = viewModel.graphIndex.nodeById.get(settingId)
          if (!setting || setting.kind !== 'setting') return
          controller.addSettingToActiveScene(setting, position)
        }}
        onGetNodeContextActions={controller.nodeContextActions}
        onModeChange={(mode) => {
          controller.setCanvasMode(mode)
          if (mode === 'scene_moment' && viewModel.activeScene) controller.selectNode('scene_moment', viewModel.activeScene.id)
          if (mode === 'setting' && viewModel.activeSetting) controller.selectNode('setting', viewModel.activeSetting.id)
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
        graphIndex={viewModel.graphIndex}
        paneLayout={paneLayout}
        referenceAssets={viewModel.sceneSettingAssets}
        selection={viewModel.inspectorSelection}
        onCandidateSelect={controller.selectCandidate}
        onCreateAsset={controller.createAssetForState}
        onCreateExpressionUnit={controller.createExpressionUnitForScene}
        onCreateKeyframe={controller.createKeyframeForShot}
        onCreateState={controller.createStateForSetting}
        onExpressionPromptChange={controller.changeExpressionPromptDraft}
        onPromptChange={controller.changeAssetPromptDraft}
        onPromptCommit={controller.commitPromptDraft}
        onSelectNode={controller.selectNode}
      />

      <TimelinePanel
        emptyText={viewModel.timelineEmptyText}
        items={viewModel.timelineItems}
        resizeHandleProps={paneLayout.timeline.resizeHandleProps}
        title={viewModel.timelineTitle}
      />

      <StructureCreateDialog
        state={controller.structureCreateDialog}
        isBusy={Boolean(controller.pendingCanvasAction?.startsWith('structure-'))}
        onClose={controller.closeStructureCreateDialog}
        onSubmit={controller.submitStructureCreateDialog}
      />

      <SettingCreateDialog
        state={controller.settingCreateDialog}
        isBusy={controller.pendingCanvasAction === 'root-setting'}
        onClose={controller.closeSettingCreateDialog}
        onSubmit={controller.submitSettingCreateDialog}
      />
    </section>
  )
}
