import { PanelResizeHandle } from '@movscript/ui/layout'
import { Braces, GitBranch, Plus, Search, SlidersHorizontal } from 'lucide-react'

import type { ContentCanvasCreateNodeInput, ContentCanvasExpressionUnitEditorInput } from '../application/contentCanvasCommands'
import type { ContentCanvasUploadedResource } from '../application/contentCanvasWorkspaceGateway'
import type { ContentCanvasNodePosition } from '../application/contentCanvasViewState'
import type { ContentCanvasCandidate, ContentCanvasNode } from '../domain/contentCanvasTypes'
import {
  type CandidateSelections,
  type CanvasMode,
  type InspectorSelection,
  type RadialNode,
  type SceneSettingGroup,
  type StarCanvasAction,
  type TimelineTrack,
  type TreeNodeData,
} from './contentCanvasWorkspaceTypes'
import { selectedSelectionId } from './contentCanvasWorkspaceModel'
import { ContentCanvasResizeHandle, type useContentCanvasPaneLayout, type useContentCanvasRadialLayout } from './contentCanvasWorkspaceLayout'
import { ContentCanvasStarCanvas } from './ContentCanvasStarCanvas'
import { NodeInspector } from './ContentCanvasWorkspaceDetails'
import type { ContentCanvasCandidateGenerationOptions, ContentCanvasCandidatePromptPreview } from './ContentCanvasInspectorParts'
import { SceneTimeline, TreeNode } from './ContentCanvasWorkspaceOutline'

export function StructurePanel({
  isCreatingSetting,
  isCreatingStructure,
  onCreateSetting,
  onCreateProduction,
  onCreateStructureChild,
  paneLayout,
  tree,
  onSelectStructureNode,
}: {
  isCreatingSetting: boolean
  isCreatingStructure: boolean
  onCreateSetting: () => void
  onCreateProduction: () => void
  onCreateStructureChild: (node: TreeNodeData) => void
  paneLayout: ReturnType<typeof useContentCanvasPaneLayout>
  tree: TreeNodeData[]
  onSelectStructureNode: (node: TreeNodeData) => void
}) {
  return (
    <aside className="content-canvas-workspace-sidebar" aria-label="内容命名空间结构层级">
      <div className="content-canvas-workspace-sidebar__header">
        <div>
          <strong>结构层级</strong>
          <span>业务节点命名空间</span>
        </div>
      </div>
      <div className="content-canvas-workspace-sidebar__actions">
        <button
          type="button"
          title="添加 Production"
          aria-label="添加 Production"
          disabled={isCreatingStructure}
          onClick={onCreateProduction}
        >
          <Plus size={15} aria-hidden="true" />
          Production
        </button>
        <button
          type="button"
          title="添加 Setting"
          aria-label="添加 Setting"
          disabled={isCreatingSetting}
          onClick={onCreateSetting}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          Setting
        </button>
      </div>
      <label className="content-canvas-workspace-sidebar__search">
        <Search size={14} aria-hidden="true" />
        <input aria-label="搜索结构层级" placeholder="搜索结构节点" />
      </label>
      <div className="content-canvas-workspace-tree">
        {tree.length ? tree.map((node) => (
          <TreeNode
            key={node.id ?? node.title}
            node={node}
            onCreateChild={onCreateStructureChild}
            onSelectStructureNode={onSelectStructureNode}
          />
        )) : null}
        {!tree.length && <div className="content-canvas-tree-empty">当前项目暂无结构节点</div>}
      </div>
      <PanelResizeHandle
        className="content-canvas-resize-handle content-canvas-resize-handle--left"
        side="right"
        {...paneLayout.structure.resizeHandleProps}
      />
    </aside>
  )
}

export function CanvasStagePanel({
  canvasMainNode,
  canvasMode,
  candidateSelections,
  groupedSettingIds,
  promptRelationNodes,
  radialLayout,
  structureRelationNodes,
  sceneSettingGroups,
  selected,
  onDropSetting,
  onGetNodeContextActions,
  onModeChange,
  onMoveSettingGroup,
  onSelectNode,
  onSelectSettingGroupNode,
}: {
  canvasMainNode: RadialNode
  canvasMode: CanvasMode
  candidateSelections: CandidateSelections
  groupedSettingIds: Set<string>
  promptRelationNodes: RadialNode[]
  radialLayout: ReturnType<typeof useContentCanvasRadialLayout>
  structureRelationNodes: RadialNode[]
  sceneSettingGroups: SceneSettingGroup[]
  selected: InspectorSelection
  onDropSetting: (settingId: string, position: ContentCanvasNodePosition) => void
  onGetNodeContextActions: (node: ContentCanvasNode) => StarCanvasAction[]
  onModeChange: (mode: CanvasMode) => void
  onMoveSettingGroup: (group: SceneSettingGroup, position: ContentCanvasNodePosition) => void
  onSelectNode: (kind: InspectorSelection['kind'], nodeId: string) => void
  onSelectSettingGroupNode: (node: ContentCanvasNode) => void
}) {
  const selectedNodeId = selectedSelectionId(selected)
  const hasPreviewTarget = Boolean(canvasMainNode.source)
  const activeNodes = canvasMode === 'structure' ? structureRelationNodes : promptRelationNodes
  const activeActions = canvasMode === 'structure' && canvasMainNode.source ? onGetNodeContextActions(canvasMainNode.source) : []
  const canShowSceneSettingGroups = canvasMode === 'structure' && canvasMainNode.source?.kind === 'scene_moment'
  const visibleSettingGroups = canShowSceneSettingGroups ? sceneSettingGroups : []
  return (
    <main className="content-canvas-workspace-canvas" aria-label="无限画布">
      <div className="content-canvas-workspace-canvas__toolbar">
        <span>{canvasMode === 'structure' ? '命名空间结构画布' : '提示词依赖画布'}</span>
        <div className="content-canvas-workspace-canvas__switch" aria-label="切换画布视图">
          <button type="button" data-active={canvasMode === 'structure' ? 'true' : undefined} onClick={() => onModeChange('structure')}>
            <GitBranch size={13} aria-hidden="true" />
            结构
          </button>
          <button type="button" data-active={canvasMode === 'prompt' ? 'true' : undefined} onClick={() => onModeChange('prompt')}>
            <Braces size={13} aria-hidden="true" />
            提示词
          </button>
        </div>
      </div>
      {!hasPreviewTarget ? (
        <div className="content-canvas-workspace-canvas__empty">
          <strong>无预览</strong>
          <span>请从左侧结构或顶部全局库选择一个节点。</span>
        </div>
      ) : (
        <ContentCanvasStarCanvas
          main={canvasMainNode}
          nodes={activeNodes}
          actions={activeActions}
          selectedNodeId={selectedNodeId}
          emptyText={canvasMode === 'structure' ? '这个节点暂无命名空间子节点' : '这个节点的提示词暂无引用结构'}
          onSelect={(node) => onSelectNode(selectionKindForContentNode(node.source ?? canvasMainNode.source!), node.id)}
          onNodePositionCommit={radialLayout.commitNodePosition}
          onResetLayout={radialLayout.reset}
          candidateSelections={candidateSelections}
          settingGroups={visibleSettingGroups}
          groupedSettingIds={groupedSettingIds}
          onDropSetting={canShowSceneSettingGroups ? onDropSetting : undefined}
          getNodeContextActions={onGetNodeContextActions}
          onSettingGroupPositionCommit={onMoveSettingGroup}
          onSelectSettingGroupNode={onSelectSettingGroupNode}
        />
      )}
    </main>
  )
}

export function InspectorPanel({
  activeSetting,
  candidateSelections,
  createSelection,
  draftAssetPrompts,
  draftExpressionPrompts,
  paneLayout,
  promptReferenceNodes,
  selection,
  onCandidateSelect,
  onCandidateCreate,
  onCandidatePromptPreview,
  onCandidateResourceSelect,
  onCandidateUpload,
  onCreateAsset,
  onCreateExpressionUnit,
  onCreateKeyframe,
  onCreateState,
  onCreateStoryboard,
  onExpressionPromptChange,
  onExpressionUnitSave,
  onPromptChange,
  onPromptCommit,
  onSelectNode,
}: {
  activeSetting: ContentCanvasNode | null
  candidateSelections: CandidateSelections
  createSelection: Extract<InspectorSelection, { kind: 'create_expression_unit' | 'create_keyframe' | 'create_storyboard' | 'create_state' | 'create_asset' }> | null
  draftAssetPrompts: Record<string, string>
  draftExpressionPrompts: Record<string, string>
  paneLayout: ReturnType<typeof useContentCanvasPaneLayout>
  promptReferenceNodes: ContentCanvasNode[]
  selection: InspectorSelection
  onCandidateSelect: (node: ContentCanvasNode | undefined, candidate: ContentCanvasCandidate) => void
  onCandidateCreate: (node: ContentCanvasNode | undefined, options?: ContentCanvasCandidateGenerationOptions) => void
  onCandidatePromptPreview: (node: ContentCanvasNode | undefined) => Promise<ContentCanvasCandidatePromptPreview>
  onCandidateResourceSelect: (node: ContentCanvasNode | undefined, resource: ContentCanvasUploadedResource) => void
  onCandidateUpload: (node: ContentCanvasNode | undefined, file: File) => void
  onCreateAsset: (state: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => void
  onCreateExpressionUnit: (scene: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => void
  onCreateKeyframe: (owner: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => void
  onCreateState: (setting: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => void
  onCreateStoryboard: (owner: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => void
  onExpressionPromptChange: (nodeId: string, prompt: string) => void
  onExpressionUnitSave: (node: ContentCanvasNode, input: ContentCanvasExpressionUnitEditorInput) => void
  onPromptChange: (assetId: string, prompt: string) => void
  onPromptCommit: (node: ContentCanvasNode | undefined, prompt: string) => void
  onSelectNode: (kind: InspectorSelection['kind'], nodeId: string) => void
}) {
  return (
    <aside className="content-canvas-workspace-inspector" aria-label="右侧节点信息区域">
      <PanelResizeHandle
        className="content-canvas-resize-handle content-canvas-resize-handle--right"
        side="left"
        {...paneLayout.inspector.resizeHandleProps}
      />
      <NodeInspector
        selection={createSelection ?? selection}
        activeSetting={activeSetting}
        assetPrompts={draftAssetPrompts}
        expressionPrompts={draftExpressionPrompts}
        candidateSelections={candidateSelections}
        nodes={promptReferenceNodes}
        promptReferenceNodes={promptReferenceNodes}
        onCreateAsset={onCreateAsset}
        onCreateExpressionUnit={onCreateExpressionUnit}
        onCreateKeyframe={onCreateKeyframe}
        onCreateState={onCreateState}
        onCreateStoryboard={onCreateStoryboard}
        onPromptChange={onPromptChange}
        onPromptCommit={onPromptCommit}
        onExpressionPromptChange={onExpressionPromptChange}
        onExpressionUnitSave={onExpressionUnitSave}
        onCandidateCreate={onCandidateCreate}
        onCandidatePromptPreview={onCandidatePromptPreview}
        onCandidateResourceSelect={onCandidateResourceSelect}
        onCandidateSelect={onCandidateSelect}
        onCandidateUpload={onCandidateUpload}
        onSelectNode={onSelectNode}
      />
    </aside>
  )
}

export function TimelinePanel({
  emptyText,
  items,
  resizeHandleProps,
  title,
}: {
  emptyText: string
  items: TimelineTrack[]
  resizeHandleProps: ReturnType<typeof useContentCanvasPaneLayout>['timeline']['resizeHandleProps']
  title: string
}) {
  return (
    <section className="content-canvas-workspace-timeline" aria-label="底部剪辑时间线区域">
      <ContentCanvasResizeHandle
        className="content-canvas-resize-handle content-canvas-resize-handle--bottom"
        resizeHandleProps={resizeHandleProps}
      />
      <SceneTimeline emptyText={emptyText} items={items} title={title} />
    </section>
  )
}

export function selectionKindForContentNode(node: ContentCanvasNode): InspectorSelection['kind'] {
  if (node.kind === 'setting') return 'setting'
  if (node.kind === 'state') return 'state'
  if (node.kind === 'asset') return 'asset'
  if (node.kind === 'scene_moment') return 'scene_moment'
  return 'other'
}
