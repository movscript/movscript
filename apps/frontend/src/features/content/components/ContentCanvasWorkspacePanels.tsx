import { PanelResizeHandle } from '@movscript/ui/layout'
import { Film, Plus, Search, Star } from 'lucide-react'

import type { ContentCanvasCreateNodeInput } from '../application/contentCanvasCommands'
import type { ContentCanvasNodePosition } from '../application/contentCanvasViewState'
import type { ContentCanvasCandidate, ContentCanvasNode } from '../domain/contentCanvasTypes'
import {
  CONTENT_CANVAS_SETTING_DRAG_TYPE,
  type CandidateSelections,
  type CanvasMode,
  type InspectorSelection,
  type RadialNode,
  type SceneSettingGroup,
  type SettingKind,
  type StarCanvasAction,
  type TimelineTrack,
  type TreeNodeData,
} from './contentCanvasWorkspaceTypes'
import {
  contentStatusLabel,
  iconForContentNode,
  selectedSelectionId,
} from './contentCanvasWorkspaceModel'
import { ContentCanvasResizeHandle, type useContentCanvasPaneLayout, type useContentCanvasRadialLayout } from './contentCanvasWorkspaceLayout'
import { ContentCanvasStarCanvas } from './ContentCanvasStarCanvas'
import { NodeInspector, SceneTimeline, TreeNode } from './ContentCanvasWorkspaceDetails'

export function SettingCatalogPanel({
  activeKind,
  filteredSettings,
  isLoading,
  pendingCanvasAction,
  projectId,
  settingNodesCount,
  settingQuery,
  onActiveKindChange,
  onCreateSetting,
  onQueryChange,
  onSelectSetting,
  resizeHandleProps,
}: {
  activeKind: SettingKind | 'all'
  filteredSettings: ContentCanvasNode[]
  isLoading: boolean
  pendingCanvasAction: string | null
  projectId: number | undefined
  settingNodesCount: number
  settingQuery: string
  onActiveKindChange: (kind: SettingKind | 'all') => void
  onCreateSetting: () => void
  onQueryChange: (query: string) => void
  onSelectSetting: (setting: ContentCanvasNode) => void
  resizeHandleProps: ReturnType<typeof useContentCanvasPaneLayout>['settingCatalog']['resizeHandleProps']
}) {
  return (
    <header className="content-canvas-workspace-top">
      <div className="content-canvas-workspace-top__filter">
        <label className="content-canvas-workspace-search">
          <Search size={15} aria-hidden="true" />
          <input
            value={settingQuery}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="筛选 Setting 名称、状态、作用域"
            aria-label="筛选顶部 Setting 节点"
          />
        </label>
        <div className="content-canvas-workspace-chips" aria-label="Setting 节点筛选">
          {SETTING_FILTERS.map((filter) => (
            <button
              key={filter.kind}
              type="button"
              data-active={activeKind === filter.kind ? 'true' : undefined}
              onClick={() => onActiveKindChange(filter.kind)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <span className="content-canvas-workspace-count">{filteredSettings.length}/{settingNodesCount} Setting</span>
        <button
          type="button"
          className="content-canvas-workspace-add-setting"
          disabled={!projectId || pendingCanvasAction === 'root-setting'}
          onClick={onCreateSetting}
        >
          <Plus size={13} aria-hidden="true" />
          Setting
        </button>
      </div>

      <div className="content-canvas-catalog" aria-label="Setting 节点卡片网格">
        {isLoading ? (
          <div className="content-canvas-catalog-empty">正在读取项目数据...</div>
        ) : filteredSettings.length ? filteredSettings.map((item) => (
          <SettingCatalogCard key={item.id} item={item} onSelect={onSelectSetting} />
        )) : (
          <div className="content-canvas-catalog-empty">当前项目暂无 Setting 节点</div>
        )}
      </div>
      <ContentCanvasResizeHandle
        className="content-canvas-resize-handle content-canvas-resize-handle--top"
        resizeHandleProps={resizeHandleProps}
      />
    </header>
  )
}

function SettingCatalogCard({ item, onSelect }: { item: ContentCanvasNode; onSelect: (setting: ContentCanvasNode) => void }) {
  const Icon = iconForContentNode(item)
  return (
    <button
      type="button"
      className="content-canvas-catalog-card"
      data-status={item.status}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'copy'
        event.dataTransfer.setData(CONTENT_CANVAS_SETTING_DRAG_TYPE, item.id)
        event.dataTransfer.setData('text/plain', item.title)
      }}
      onClick={() => onSelect(item)}
      aria-label={`${item.title} Setting 节点`}
    >
      <span className="content-canvas-catalog-card__icon">
        <Icon size={16} aria-hidden="true" />
      </span>
      <span className="content-canvas-catalog-card__copy">
        <strong>{item.title}</strong>
        <small>{item.summary || item.subtitle}</small>
      </span>
      <span className="content-canvas-catalog-card__status">{contentStatusLabel(item.status)}</span>
      <span className="content-canvas-catalog-card__code">SET</span>
      <span className="content-canvas-catalog-card__scope">{item.subtitle}</span>
    </button>
  )
}

export function StructurePanel({
  isCreatingStructure,
  onCreateProduction,
  onCreateStructureChild,
  paneLayout,
  tree,
  onSelectStructureNode,
}: {
  isCreatingStructure: boolean
  onCreateProduction: () => void
  onCreateStructureChild: (node: TreeNodeData) => void
  paneLayout: ReturnType<typeof useContentCanvasPaneLayout>
  tree: TreeNodeData[]
  onSelectStructureNode: (node: TreeNodeData) => void
}) {
  return (
    <aside className="content-canvas-workspace-sidebar" aria-label="Production Segment Scene Moment 层级">
      <div className="content-canvas-workspace-sidebar__header">
        <div>
          <strong>结构层级</strong>
          <span>Production / Segment / Scene Moment</span>
        </div>
        <button
          type="button"
          title="添加 Production"
          aria-label="添加 Production"
          disabled={isCreatingStructure}
          onClick={onCreateProduction}
        >
          <Plus size={15} aria-hidden="true" />
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
        {!tree.length && <div className="content-canvas-tree-empty">当前项目暂无 Production / Segment / Scene Moment</div>}
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
  activeScene,
  activeSetting,
  canvasMode,
  candidateSelections,
  groupedSettingIds,
  radialLayout,
  sceneCanvasActions,
  sceneMainNode,
  sceneRelationNodes,
  sceneSettingGroups,
  selected,
  settingCanvasActions,
  settingMainNode,
  settingRelationNodes,
  onDropSetting,
  onGetNodeContextActions,
  onModeChange,
  onMoveSettingGroup,
  onSelectNode,
  onSelectSettingGroupNode,
}: {
  activeScene: ContentCanvasNode | null
  activeSetting: ContentCanvasNode | null
  canvasMode: CanvasMode
  candidateSelections: CandidateSelections
  groupedSettingIds: Set<string>
  radialLayout: ReturnType<typeof useContentCanvasRadialLayout>
  sceneCanvasActions: StarCanvasAction[]
  sceneMainNode: RadialNode
  sceneRelationNodes: RadialNode[]
  sceneSettingGroups: SceneSettingGroup[]
  selected: InspectorSelection
  settingCanvasActions: StarCanvasAction[]
  settingMainNode: RadialNode | null
  settingRelationNodes: RadialNode[]
  onDropSetting: (settingId: string, position: ContentCanvasNodePosition) => void
  onGetNodeContextActions: (node: ContentCanvasNode) => StarCanvasAction[]
  onModeChange: (mode: CanvasMode) => void
  onMoveSettingGroup: (group: SceneSettingGroup, position: ContentCanvasNodePosition) => void
  onSelectNode: (kind: InspectorSelection['kind'], nodeId: string) => void
  onSelectSettingGroupNode: (node: ContentCanvasNode) => void
}) {
  const selectedNodeId = selectedSelectionId(selected)
  const hasPreviewTarget = Boolean(activeScene || activeSetting)
  return (
    <main className="content-canvas-workspace-canvas" aria-label="无限画布">
      <div className="content-canvas-workspace-canvas__toolbar">
        <span>{canvasMode === 'scene_moment' ? 'Scene Moment 主节点画布' : 'Setting 主节点画布'}</span>
        <div className="content-canvas-workspace-canvas__switch" aria-label="切换主节点类型">
          <button type="button" data-active={canvasMode === 'scene_moment' ? 'true' : undefined} onClick={() => onModeChange('scene_moment')}>
            <Film size={13} aria-hidden="true" />
            Scene
          </button>
          <button type="button" data-active={canvasMode === 'setting' ? 'true' : undefined} onClick={() => onModeChange('setting')}>
            <Star size={13} aria-hidden="true" />
            Setting
          </button>
        </div>
      </div>
      {!hasPreviewTarget ? (
        <div className="content-canvas-workspace-canvas__empty">
          <strong>无预览</strong>
          <span>请选择设定、情节。</span>
        </div>
      ) : canvasMode === 'scene_moment' ? (
        <ContentCanvasStarCanvas
          main={sceneMainNode}
          nodes={sceneRelationNodes}
          actions={sceneCanvasActions}
          selectedNodeId={selectedNodeId}
          emptyText={sceneMainNode.source ? '这个 Scene Moment 暂无表达单元 / Shot / Keyframe / Storyboard 关系' : '当前项目暂无 Scene Moment'}
          onSelect={(node) => onSelectNode(node.id === sceneMainNode.id ? 'scene_moment' : 'other', node.id)}
          onNodePositionCommit={radialLayout.commitNodePosition}
          onResetLayout={radialLayout.reset}
          candidateSelections={candidateSelections}
          settingGroups={sceneSettingGroups}
          groupedSettingIds={groupedSettingIds}
          onDropSetting={onDropSetting}
          getNodeContextActions={onGetNodeContextActions}
          onSettingGroupPositionCommit={onMoveSettingGroup}
          onSelectSettingGroupNode={onSelectSettingGroupNode}
        />
      ) : settingMainNode && activeSetting ? (
        <ContentCanvasStarCanvas
          main={settingMainNode}
          nodes={settingRelationNodes}
          actions={settingCanvasActions}
          selectedNodeId={selectedNodeId}
          emptyText="这个 Setting 暂无 State / Asset 关系"
          onSelect={(node) => {
            if (node.id === activeSetting.id) onSelectNode('setting', activeSetting.id)
            else if (node.variant === 'state') onSelectNode('state', node.id)
            else if (node.variant === 'asset') onSelectNode('asset', node.id)
            else onSelectNode('other', node.id)
          }}
          onNodePositionCommit={radialLayout.commitNodePosition}
          onResetLayout={radialLayout.reset}
          candidateSelections={candidateSelections}
          getNodeContextActions={onGetNodeContextActions}
        />
      ) : (
        <div className="content-canvas-star content-canvas-star--empty">当前项目暂无 Setting</div>
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
  graphIndex,
  paneLayout,
  referenceAssets,
  selection,
  onCandidateSelect,
  onCreateAsset,
  onCreateExpressionUnit,
  onCreateKeyframe,
  onCreateState,
  onExpressionPromptChange,
  onPromptChange,
  onPromptCommit,
  onSelectNode,
}: {
  activeSetting: ContentCanvasNode | null
  candidateSelections: CandidateSelections
  createSelection: Extract<InspectorSelection, { kind: 'create_expression_unit' | 'create_state' | 'create_asset' | 'create_keyframe' }> | null
  draftAssetPrompts: Record<string, string>
  draftExpressionPrompts: Record<string, string>
  graphIndex: { connectedByNodeId: Map<string, ContentCanvasNode[]>; childNodesByHierarchy: Map<string, ContentCanvasNode[]>; nodeById: Map<string, ContentCanvasNode> }
  paneLayout: ReturnType<typeof useContentCanvasPaneLayout>
  referenceAssets: ContentCanvasNode[]
  selection: InspectorSelection
  onCandidateSelect: (node: ContentCanvasNode | undefined, candidate: ContentCanvasCandidate) => void
  onCreateAsset: (state: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => void
  onCreateExpressionUnit: (scene: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => void
  onCreateKeyframe: (shot: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => void
  onCreateState: (setting: ContentCanvasNode, input: ContentCanvasCreateNodeInput) => void
  onExpressionPromptChange: (nodeId: string, prompt: string) => void
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
        childNodesByHierarchy={graphIndex.childNodesByHierarchy}
        nodes={Array.from(graphIndex.nodeById.values())}
        referenceAssets={referenceAssets}
        onCreateAsset={onCreateAsset}
        onCreateExpressionUnit={onCreateExpressionUnit}
        onCreateKeyframe={onCreateKeyframe}
        onCreateState={onCreateState}
        onPromptChange={onPromptChange}
        onPromptCommit={onPromptCommit}
        onExpressionPromptChange={onExpressionPromptChange}
        onCandidateSelect={onCandidateSelect}
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

const SETTING_FILTERS: Array<{ kind: SettingKind | 'all'; label: string }> = [
  { kind: 'all', label: '全部' },
  { kind: 'character', label: '角色' },
  { kind: 'location', label: '场景' },
  { kind: 'prop', label: '道具' },
  { kind: 'visual_style', label: '视觉' },
]
