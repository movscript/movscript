import { PanelResizeHandle } from '@movscript/ui/layout'
import { Plus, Search, SlidersHorizontal } from 'lucide-react'
import type { GenerationBackendPreflightResult } from '@movscript/core/generation'

import type { ContentCanvasCreateNodeInput, ContentCanvasExpressionUnitEditorInput } from '../application/contentCanvasCommands'
import type { ContentCanvasUploadedResource } from '../application/contentCanvasWorkspaceGateway'
import type { ContentCanvasCandidate, ContentCanvasNode } from '../domain/contentCanvasTypes'
import {
  type CandidateSelections,
  type ContentCanvasPreviewScope,
  type ContentCanvasNodePosition,
  type InspectorSelection,
  type TimelineTrack,
  type TreeNodeData,
} from './contentCanvasWorkspaceTypes'
import { ContentCanvasResizeHandle, type useContentCanvasPaneLayout } from './contentCanvasWorkspaceLayout'
import { NodeInspector } from './ContentCanvasWorkspaceDetails'
import type { ContentCanvasCandidateGenerationOptions, ContentCanvasCandidatePromptPreview } from './ContentCanvasInspectorParts'
import type { ContentCanvasNamespaceVocabularyOptions } from './contentCanvasNamespaceVocabularyModel'
import { SceneTimeline, TreeNode } from './ContentCanvasWorkspaceOutline'

export function StructurePanel({
  isCreatingSetting,
  isCreatingStructure,
  onCreateSetting,
  onCreateProduction,
  onCreateStructureChild,
  paneLayout,
  scope,
  tree,
  viewKind = 'mixed',
  onSelectStructureNode,
}: {
  isCreatingSetting: boolean
  isCreatingStructure: boolean
  onCreateSetting: () => void
  onCreateProduction: () => void
  onCreateStructureChild: (node: TreeNodeData) => void
  paneLayout: ReturnType<typeof useContentCanvasPaneLayout>
  scope?: ContentCanvasPreviewScope
  tree: TreeNodeData[]
  viewKind?: ContentCanvasPreviewScope['kind']
  onSelectStructureNode: (node: TreeNodeData) => void
}) {
  const copy = structurePanelCopy(viewKind)
  const scopeRoot = scope?.kind === 'mixed' ? null : scope?.rootNode
  return (
    <aside className="content-canvas-workspace-sidebar" aria-label="内容命名空间结构层级">
      <div className="content-canvas-workspace-sidebar__header">
        <div>
          <strong>{copy.title}</strong>
          <span>{scopeRoot ? `${scopeRoot.title} · ${scopeRoot.subtitle}` : copy.subtitle}</span>
        </div>
      </div>
      <div className="content-canvas-workspace-sidebar__actions">
        {copy.showProductionAction ? (
          <button
            type="button"
            title="添加时间线层级"
            aria-label="添加时间线层级"
            disabled={isCreatingStructure}
            onClick={onCreateProduction}
          >
            <Plus size={15} aria-hidden="true" />
            时间线层级
          </button>
        ) : null}
        {copy.showSettingAction ? (
          <button
            type="button"
            title="添加设定层级"
            aria-label="添加设定层级"
            disabled={isCreatingSetting}
            onClick={onCreateSetting}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            设定层级
          </button>
        ) : null}
      </div>
      <label className="content-canvas-workspace-sidebar__search">
        <Search size={14} aria-hidden="true" />
        <input aria-label={copy.searchLabel} placeholder={copy.searchPlaceholder} />
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
        {!tree.length && <div className="content-canvas-tree-empty">{copy.emptyText}</div>}
      </div>
      <PanelResizeHandle
        className="content-canvas-resize-handle content-canvas-resize-handle--left"
        side="right"
        {...paneLayout.structure.resizeHandleProps}
      />
    </aside>
  )
}

function structurePanelCopy(kind: ContentCanvasPreviewScope['kind']) {
  if (kind === 'production') {
    return {
      title: 'Production 预览',
      subtitle: '当前制作内结构',
      searchLabel: '搜索制作结构',
      searchPlaceholder: '搜索当前 production',
      emptyText: '当前 production 暂无结构节点',
      showProductionAction: false,
      showSettingAction: false,
    }
  }
  if (kind === 'setting') {
    return {
      title: '设定预览',
      subtitle: '状态与素材槽',
      searchLabel: '搜索设定结构',
      searchPlaceholder: '搜索 setting / state / asset',
      emptyText: '当前项目暂无设定资产',
      showProductionAction: false,
      showSettingAction: false,
    }
  }
  return {
    title: '结构层级',
    subtitle: '业务节点命名空间',
    searchLabel: '搜索结构层级',
    searchPlaceholder: '搜索结构节点',
    emptyText: '当前项目暂无结构节点',
    showProductionAction: true,
    showSettingAction: true,
  }
}

export function InspectorPanel({
  activeSetting,
  candidateSelections,
  createSelection,
  draftAssetPrompts,
  draftExpressionPrompts,
  namespaceVocabulary,
  nodes,
  paneLayout,
  promptReferenceNodes,
  selection,
  onCandidateSelect,
  onCandidateCreate,
  onCandidatePreflight,
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
  onGenerationReferenceAppend,
  onPromptChange,
  onPromptCommit,
  onReferencePoolCommit,
  onStructuredPromptCommit,
  onSelectNode,
}: {
  activeSetting: ContentCanvasNode | null
  candidateSelections: CandidateSelections
  createSelection: Extract<InspectorSelection, { kind: 'create_expression_unit' | 'create_keyframe' | 'create_storyboard' | 'create_state' | 'create_asset' }> | null
  draftAssetPrompts: Record<string, string>
  draftExpressionPrompts: Record<string, string>
  namespaceVocabulary: ContentCanvasNamespaceVocabularyOptions
  nodes: ContentCanvasNode[]
  paneLayout: ReturnType<typeof useContentCanvasPaneLayout>
  promptReferenceNodes: ContentCanvasNode[]
  selection: InspectorSelection
  onCandidateSelect: (node: ContentCanvasNode | undefined, candidate: ContentCanvasCandidate) => void
  onCandidateCreate: (node: ContentCanvasNode | undefined, options?: ContentCanvasCandidateGenerationOptions) => void
  onCandidatePreflight: (node: ContentCanvasNode | undefined, options?: Partial<ContentCanvasCandidateGenerationOptions>) => Promise<GenerationBackendPreflightResult>
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
  onGenerationReferenceAppend: (targetNode: ContentCanvasNode | undefined, sourceNode: ContentCanvasNode | undefined, options?: { role?: string; mediaType?: string }) => void
  onPromptChange: (assetId: string, prompt: string) => void
  onPromptCommit: (node: ContentCanvasNode | undefined, prompt: string) => void
  onReferencePoolCommit: (node: ContentCanvasNode | undefined, prompt: string, generationReferences: Array<Record<string, unknown>>) => void
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
        namespaceVocabulary={namespaceVocabulary}
        assetPrompts={draftAssetPrompts}
        expressionPrompts={draftExpressionPrompts}
        candidateSelections={candidateSelections}
        nodes={nodes}
        promptReferenceNodes={promptReferenceNodes}
        onCreateAsset={onCreateAsset}
        onCreateExpressionUnit={onCreateExpressionUnit}
        onCreateKeyframe={onCreateKeyframe}
        onCreateState={onCreateState}
        onCreateStoryboard={onCreateStoryboard}
        onPromptChange={onPromptChange}
        onPromptCommit={onPromptCommit}
        onReferencePoolCommit={onReferencePoolCommit}
        onStructuredPromptCommit={onStructuredPromptCommit}
        onExpressionPromptChange={onExpressionPromptChange}
        onExpressionUnitSave={onExpressionUnitSave}
        onGenerationReferenceAppend={onGenerationReferenceAppend}
        onCandidateCreate={onCandidateCreate}
        onCandidatePreflight={onCandidatePreflight}
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
