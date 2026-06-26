import { PanelResizeHandle } from '@movscript/ui/layout'
import { Plus, Search, SlidersHorizontal } from 'lucide-react'

import type { ContentCanvasCreateNodeInput, ContentCanvasExpressionUnitEditorInput } from '../application/contentCanvasCommands'
import type { ContentCanvasUploadedResource } from '../application/contentCanvasWorkspaceGateway'
import type { ContentCanvasCandidate, ContentCanvasNode } from '../domain/contentCanvasTypes'
import {
  type CandidateSelections,
  type ContentCanvasNodePosition,
  type InspectorSelection,
  type TimelineTrack,
  type TreeNodeData,
} from './contentCanvasWorkspaceTypes'
import { ContentCanvasResizeHandle, type useContentCanvasPaneLayout } from './contentCanvasWorkspaceLayout'
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
  onStructuredPromptCommit,
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
  onCandidateResourceSelect: (node: ContentCanvasNode | undefined, resource: ContentCanvasUploadedResource, position?: ContentCanvasNodePosition) => void
  onCandidateUpload: (node: ContentCanvasNode | undefined, file: File) => void
  onCreateAsset: (state: ContentCanvasNode, input: ContentCanvasCreateNodeInput, position?: ContentCanvasNodePosition) => void
  onCreateExpressionUnit: (scene: ContentCanvasNode, input: ContentCanvasCreateNodeInput, position?: ContentCanvasNodePosition) => void
  onCreateKeyframe: (owner: ContentCanvasNode, input: ContentCanvasCreateNodeInput, position?: ContentCanvasNodePosition) => void
  onCreateState: (setting: ContentCanvasNode, input: ContentCanvasCreateNodeInput, position?: ContentCanvasNodePosition) => void
  onCreateStoryboard: (owner: ContentCanvasNode, input: ContentCanvasCreateNodeInput, position?: ContentCanvasNodePosition) => void
  onExpressionPromptChange: (nodeId: string, prompt: string) => void
  onExpressionUnitSave: (node: ContentCanvasNode, input: ContentCanvasExpressionUnitEditorInput) => void
  onPromptChange: (assetId: string, prompt: string) => void
  onPromptCommit: (node: ContentCanvasNode | undefined, prompt: string) => void
  onStructuredPromptCommit: (node: ContentCanvasNode | undefined, structured: Record<string, unknown>) => void
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
        onStructuredPromptCommit={onStructuredPromptCommit}
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
