import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  PanOnScrollMode,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
  type Viewport,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { GitBranch, LocateFixed, Move, Search, Sparkles, Star } from 'lucide-react'

import { ResourceFileImage, ResourceFileVideo } from '@movscript/resource-surface/resource-media-components'

import {
  creativeCanvasActionsForNode,
  type CreativeCanvasAction,
} from '../application/contentCreativeCanvasActions'
import {
  buildCreativeCanvasGraph,
  type CreativeCanvasNode,
} from '../application/contentCreativeCanvasModel'
import {
  layoutCreativeCanvas,
} from '../application/contentCreativeCanvasLayout'
import type { ContentCanvasUploadedResource } from '../application/contentCanvasWorkspaceGateway'
import type { ContentCanvasCandidate, ContentCanvasEdge, ContentCanvasNode } from '../domain/contentCanvasTypes'
import {
  GenerationCandidateDialog,
  type ContentCanvasCandidateGenerationOptions,
  type ContentCanvasCandidatePromptPreview,
} from './ContentCanvasInspectorParts'
import { ContentCanvasPromptEditor } from './ContentCanvasPromptEditor'
import { contentCanvasGenerationTargetForNode } from './contentCanvasWorkspaceGenerationModel'
import {
  appendContentNodeReferenceToPrompt,
  iconForContentNode,
  mediaKindForNode,
  mediaKindLabel,
  nodeCandidateBadge,
  promptFromContentNode,
} from './contentCanvasWorkspaceModel'
import {
  expressionUnitKindShortLabel,
  expressionUnitKindValue,
} from './contentCanvasWorkspaceDisplayModel'
import type { CandidateSelections, InspectorSelection } from './contentCanvasWorkspaceTypes'

type CreativeFlowNodeData = {
  item: CreativeCanvasNode
  candidateSelections: CandidateSelections
  candidateBadge: string
  candidatePreviews: CreativeFlowNodeCandidatePreview[]
  nodes: ContentCanvasNode[]
  prompt: string
  onContextMenu: (event: MouseEvent, node: ContentCanvasNode) => void
  onPromptCommit: (node: ContentCanvasNode, prompt: string) => void
  onPromptDraftChange: (node: ContentCanvasNode, prompt: string) => void
  onCandidatePreviewOpen: (preview: CreativeFlowNodeCandidatePreview) => void
  onSelectNode: (kind: InspectorSelection['kind'], nodeId: string) => void
}

type CreativeFlowNodeCandidatePreview = {
  key: string
  id: string
  title: string
  status: string
  resourceId?: number
  resourceKind?: string
  selected?: boolean
  candidateCount?: number
}

type CreativeCanvasContextMenuState = {
  x: number
  y: number
  node: ContentCanvasNode
  actions: CreativeCanvasAction[]
}

const CREATIVE_CANVAS_MINIMAP_NODE_LIMIT = 120

const nodeTypes = {
  contentPrompt: memo(ContentPromptFlowNode, areCreativeFlowNodePropsEqual),
}

export function ContentPromptCanvasPanel({
  candidateSelections,
  draftAssetPrompts,
  draftExpressionPrompts,
  edges,
  focusRequest,
  focusedNodeId,
  manualPositions: persistedManualPositions,
  savedViewport,
  nodes,
  onCandidateCreate,
  onCandidatePromptPreview,
  onCandidateResourceSelect,
  onCandidateSelect,
  onCandidateNodeSelect,
  onCandidateUpload,
  onClearManualPositions,
  onClearManualPositionsForNodes,
  onCreateChild,
  onDeleteNode,
  onExpressionPromptChange,
  onNodePositionsCommit,
  onViewportCommit,
  onPromptChange,
  onPromptCommit,
  onResourceOpen,
  onSelectNode,
}: {
  candidateSelections: CandidateSelections
  draftAssetPrompts: Record<string, string>
  draftExpressionPrompts: Record<string, string>
  edges: ContentCanvasEdge[]
  focusRequest?: { nodeId: string; requestId: number } | null
  focusedNodeId?: string | null
  manualPositions?: Record<string, { x: number; y: number }>
  savedViewport?: Viewport
  nodes: ContentCanvasNode[]
  onCandidateCreate: (node: ContentCanvasNode | undefined, options?: ContentCanvasCandidateGenerationOptions) => void
  onCandidatePromptPreview: (node: ContentCanvasNode | undefined) => Promise<ContentCanvasCandidatePromptPreview>
  onCandidateResourceSelect: (node: ContentCanvasNode | undefined, resource: ContentCanvasUploadedResource) => void
  onCandidateSelect: (node: ContentCanvasNode | undefined, candidate: ContentCanvasCandidate) => void
  onCandidateNodeSelect: (node: ContentCanvasNode) => void
  onCandidateUpload: (node: ContentCanvasNode | undefined, file: File) => void
  onClearManualPositions: () => void
  onClearManualPositionsForNodes: (nodeIds: string[]) => void
  onCreateChild: (node: ContentCanvasNode, childKind: Extract<CreativeCanvasAction, { kind: 'create_child' }>['childKind']) => void
  onDeleteNode: (node: ContentCanvasNode) => void
  onExpressionPromptChange: (nodeId: string, prompt: string) => void
  onNodePositionsCommit: (nodePositions: Record<string, { x: number; y: number }>) => void
  onViewportCommit: (viewport: Viewport) => void
  onPromptChange: (assetId: string, prompt: string) => void
  onPromptCommit: (node: ContentCanvasNode | undefined, prompt: string) => void
  onResourceOpen: (node: ContentCanvasNode) => void
  onSelectNode: (kind: InspectorSelection['kind'], nodeId: string) => void
}) {
  void onCandidatePromptPreview
  void onCandidateResourceSelect
  void onCandidateSelect
  void onCandidateUpload
  void onClearManualPositions
  void onClearManualPositionsForNodes
  const creativeGraph = useMemo(
    () => buildCreativeCanvasGraph({ nodes, edges }),
    [edges, nodes],
  )
  const [manualPositions, setManualPositions] = useState<Record<string, { x: number; y: number }>>(persistedManualPositions ?? {})
  const [contextMenu, setContextMenu] = useState<CreativeCanvasContextMenuState | null>(null)
  const [generationNode, setGenerationNode] = useState<ContentCanvasNode | null>(null)
  const [candidatePreviewDialog, setCandidatePreviewDialog] = useState<CreativeFlowNodeCandidatePreview | null>(null)
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<Node<CreativeFlowNodeData>, Edge> | null>(null)
  const consumedFocusRequestIdRef = useRef<number | null>(null)
  useEffect(() => {
    setManualPositions(persistedManualPositions ?? {})
  }, [persistedManualPositions])
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const promptByNodeId = useMemo(() => {
    const output: Record<string, string> = {}
    for (const node of nodes) output[node.id] = promptDraftForNode(node, draftAssetPrompts, draftExpressionPrompts)
    return output
  }, [draftAssetPrompts, draftExpressionPrompts, nodes])
  const openNodeContextMenu = useCallback((event: MouseEvent, node: ContentCanvasNode) => {
    event.preventDefault()
    const actions = creativeCanvasActionsForNode(node)
    setContextMenu({ x: event.clientX, y: event.clientY, node, actions })
  }, [])
  const updatePromptDraft = useCallback((node: ContentCanvasNode, prompt: string) => {
    if (node.kind === 'asset') onPromptChange(node.id, prompt)
    else onExpressionPromptChange(node.id, prompt)
  }, [onExpressionPromptChange, onPromptChange])
  const commitPromptFromNode = useCallback((node: ContentCanvasNode, prompt: string) => {
    onPromptCommit(node, prompt)
  }, [onPromptCommit])
  const initialFlowNodes = useMemo<Node<CreativeFlowNodeData>[]>(() => creativeGraph.nodes.map((item) => ({
    id: item.id,
    type: 'contentPrompt',
    position: manualPositions[item.id] ?? item.position,
    selected: item.id === focusedNodeId,
    data: {
      item,
      candidateSelections,
      candidateBadge: nodeCandidateBadge(item.source, candidateSelections) || '可生成',
      candidatePreviews: candidatePreviewsForNode(item.source, candidateSelections),
      nodes,
      prompt: promptByNodeId[item.id] ?? '',
      onContextMenu: openNodeContextMenu,
      onCandidatePreviewOpen: setCandidatePreviewDialog,
      onPromptCommit: commitPromptFromNode,
      onPromptDraftChange: updatePromptDraft,
      onSelectNode,
    },
  })), [candidateSelections, commitPromptFromNode, creativeGraph.nodes, focusedNodeId, manualPositions, nodes, onSelectNode, openNodeContextMenu, promptByNodeId, updatePromptDraft])
  const initialFlowEdges = useMemo<Edge[]>(() => creativeGraph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edgeLabel(edge.sourceEdge),
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    style: { strokeWidth: edge.sourceEdge.kind === 'sequence' ? 1 : 1.6 },
    data: { kind: edge.sourceEdge.kind, relation: edge.sourceEdge.relation },
  })), [creativeGraph.edges])
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(initialFlowNodes)
  const [flowEdges, setFlowEdges] = useEdgesState(initialFlowEdges)

  useEffect(() => {
    setFlowNodes(initialFlowNodes)
  }, [initialFlowNodes, setFlowNodes])

  useEffect(() => {
    setFlowEdges(initialFlowEdges)
  }, [initialFlowEdges, setFlowEdges])

  useEffect(() => {
    if (!flowInstance || !focusRequest) return
    if (consumedFocusRequestIdRef.current === focusRequest.requestId) return
    const focusedNode = flowNodes.find((node) => node.id === focusRequest.nodeId)
    if (!focusedNode) return
    consumedFocusRequestIdRef.current = focusRequest.requestId
    const size = creativeCanvasNodeViewportSize(focusedNode.data.item)
    void flowInstance.setCenter(
      focusedNode.position.x + size.width / 2,
      focusedNode.position.y + size.height / 2,
      {
        duration: 320,
        zoom: Math.max(flowInstance.getZoom(), 0.72),
      },
    )
  }, [flowInstance, flowNodes, focusRequest])

  const editablePromptNodeIds = useMemo(
    () => new Set(creativeGraph.nodes.filter((node) => isCreativePromptEditableNode(node)).map((node) => node.id)),
    [creativeGraph.nodes],
  )
  const handleConnect = useCallback((connection: Connection) => {
    const source = connection.source ? nodeById.get(connection.source) : undefined
    const target = connection.target ? nodeById.get(connection.target) : undefined
    if (!source || !target || source.id === target.id) return
    if (!editablePromptNodeIds.has(target.id)) return
    const currentPrompt = promptByNodeId[target.id] ?? ''
    const nextPrompt = appendContentNodeReferenceToPrompt(currentPrompt, source)
    updatePromptDraft(target, nextPrompt)
    onPromptCommit(target, nextPrompt)
  }, [editablePromptNodeIds, nodeById, onPromptCommit, promptByNodeId, updatePromptDraft])

  const runContextMenuAction = useCallback((action: CreativeCanvasAction, node: ContentCanvasNode) => {
    setContextMenu(null)
    if (action.kind === 'create_child') {
      onCreateChild(node, action.childKind)
      return
    }
    if (action.kind === 'generate_candidate') {
      setGenerationNode(node)
      return
    }
    if (action.kind === 'upload_candidate') {
      onSelectNode(selectionKindForPromptNode(node), node.id)
      return
    }
    if (action.kind === 'select_candidate' && node.kind === 'candidate') {
      onCandidateNodeSelect(node)
      return
    }
    if (action.kind === 'open_resource') {
      onResourceOpen(node)
      return
    }
    if (action.kind === 'delete_node') {
      onDeleteNode(node)
      return
    }
  }, [onCandidateCreate, onCandidateNodeSelect, onCreateChild, onDeleteNode, onResourceOpen, onSelectNode])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (isTextEditingTarget(event.target)) return
      const selectedNode = flowNodes.find((node) => node.selected)
      const sourceNode = selectedNode ? nodeById.get(selectedNode.id) : undefined
      if (!sourceNode) return
      event.preventDefault()
      onDeleteNode(sourceNode)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [flowNodes, nodeById, onDeleteNode])

  const relayoutCanvas = useCallback(() => {
    const nextPositions = layoutCreativeCanvas({
      graph: creativeGraph,
      measuredNodeSizes: creativeCanvasMeasuredNodeSizes(flowNodes),
    }).positions
    setManualPositions(nextPositions)
    setFlowNodes((currentNodes) => currentNodes.map((node) => ({
      ...node,
      position: nextPositions[node.id] ?? node.position,
    })))
    onNodePositionsCommit(nextPositions)
    window.requestAnimationFrame(() => {
      void flowInstance?.fitView({ padding: 0.2, duration: 320 })
    })
  }, [creativeGraph, flowInstance, flowNodes, onNodePositionsCommit, setFlowNodes])

  const generatableCount = creativeGraph.nodes.filter((node) => node.canGenerate).length
  const showMiniMap = creativeGraph.nodes.length <= CREATIVE_CANVAS_MINIMAP_NODE_LIMIT

  return (
    <main className="content-prompt-canvas-panel" aria-label="提示词无限画布" onClick={() => setContextMenu(null)}>
      <div className="content-prompt-canvas-panel__toolbar">
        <span>
          <GitBranch size={14} aria-hidden="true" />
          无限画布
        </span>
        <em>{creativeGraph.nodes.length} 个创作节点，{generatableCount} 个可生成节点</em>
        <button
          type="button"
          className="content-prompt-canvas-panel__layout-button"
          onClick={relayoutCanvas}
          title="按 DAG 整理画布"
          aria-label="按 DAG 整理画布"
        >
          <LocateFixed size={14} aria-hidden="true" />
          <span>整理画布</span>
        </button>
      </div>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onConnect={handleConnect}
        onInit={setFlowInstance}
        defaultViewport={savedViewport}
        onNodesChange={onNodesChange}
        onMoveEnd={(_event, viewport) => onViewportCommit(viewport)}
        onNodeClick={(_event, node) => {
          const sourceNode = nodeById.get(node.id)
          if (!sourceNode) return
          onSelectNode(selectionKindForPromptNode(sourceNode), sourceNode.id)
        }}
        deleteKeyCode={null}
        selectionOnDrag
        panOnDrag={[1, 2]}
        zoomOnScroll={false}
        zoomOnPinch
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        onNodeDragStop={(_event, node, draggedNodes) => {
          const movedNodes = draggedNodes.length ? draggedNodes : [node]
          const movedPositions = flowPositionsByNodeId(movedNodes)
          const visiblePositions = {
            ...flowPositionsByNodeId(flowNodes),
            ...movedPositions,
          }
          setManualPositions((current) => ({ ...current, ...visiblePositions }))
          onNodePositionsCommit(visiblePositions)
        }}
        fitView={!savedViewport}
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.18}
        maxZoom={1.7}
        onlyRenderVisibleElements
        defaultEdgeOptions={{
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
          style: { strokeWidth: 1.6 },
        }}
      >
        <Background gap={28} size={1} />
        <Controls position="bottom-left" />
        {showMiniMap ? <MiniMap position="bottom-right" pannable zoomable nodeStrokeWidth={2} /> : null}
      </ReactFlow>
      {!creativeGraph.nodes.length ? (
        <div className="content-prompt-canvas-panel__empty">
          <strong>暂无创作节点</strong>
          <span>从左侧结构创建 Scene Moment、Asset、Keyframe 或 Storyboard 后，这里会展示 DAG 创作依赖。</span>
        </div>
      ) : null}
      {contextMenu ? (
        <div
          className="content-prompt-canvas-context-menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <strong>{contextMenu.node.title}</strong>
          {contextMenu.actions.map((action) => (
            <button
              key={contextMenuActionKey(action)}
              type="button"
              role="menuitem"
              data-action-kind={action.kind}
              onClick={() => runContextMenuAction(action, contextMenu.node)}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
      {generationNode ? (
        <GenerationCandidateDialog
          mediaKind={mediaKindForNode(generationNode) === 'video' ? 'video' : 'image'}
          prompt={promptByNodeId[generationNode.id] ?? promptFromContentNode(generationNode) ?? ''}
          loadCompiledPrompt={() => onCandidatePromptPreview(generationNode)}
          onClose={() => setGenerationNode(null)}
          onSubmit={(options) => {
            onCandidateCreate(generationNode, options)
            setGenerationNode(null)
          }}
        />
      ) : null}
      {candidatePreviewDialog ? (
        <ContentPromptCandidatePreviewDialog
          preview={candidatePreviewDialog}
          onClose={() => setCandidatePreviewDialog(null)}
        />
      ) : null}
    </main>
  )
}

function ContentPromptFlowNode({ data, selected }: NodeProps<Node<CreativeFlowNodeData>>) {
  const node = data.item.source
  const Icon = iconForContentNode(node)
  const display = creativeFlowNodeDisplay(node, data.item.role)
  return (
    <article
      className="content-prompt-flow-node"
      data-selected={selected ? 'true' : undefined}
      data-kind={node.kind}
      data-expression-kind={node.kind === 'expression_unit' ? expressionUnitKindValue(node) : undefined}
      data-role={data.item.role}
      data-weight={data.item.weight}
      onContextMenu={(event) => data.onContextMenu(event, node)}
      onClick={() => data.onSelectNode(selectionKindForPromptNode(node), node.id)}
    >
      <Handle type="target" position={Position.Left} />
      <div className="content-prompt-flow-node__header">
        <span className="content-prompt-flow-node__icon">
          <Icon size={15} aria-hidden="true" />
        </span>
        <span>
          <strong>{node.title}</strong>
          <small>{display.subtitle}</small>
        </span>
        <span className="content-prompt-flow-node__drag">
          <Move size={12} aria-hidden="true" />
        </span>
      </div>
      {node.kind !== 'resource' ? (
        <div className="content-prompt-flow-node__body">
          <button
            type="button"
            className="content-prompt-flow-node__role nodrag"
            onClick={() => data.onSelectNode(selectionKindForPromptNode(node), node.id)}
          >
            {display.badge}
          </button>
          {isCreativePromptEditableNode(data.item) ? (
            <ContentCanvasPromptEditor
              ariaLabel={`${node.title} 提示词`}
              candidateSelections={data.candidateSelections}
              nodes={data.nodes}
              ownerNode={node}
              value={data.prompt}
              onChange={(prompt) => data.onPromptDraftChange(node, prompt)}
              onBlur={(prompt) => data.onPromptCommit(node, prompt)}
              onSelectNode={(referenceNode) => data.onSelectNode(selectionKindForPromptNode(referenceNode), referenceNode.id)}
            />
          ) : (
            <span>{node.summary || data.prompt || '暂无说明'}</span>
          )}
        </div>
      ) : null}
      <div className="content-prompt-flow-node__meta">
        {data.item.canGenerate ? (
          <span>
            <Sparkles size={11} aria-hidden="true" />
            {data.candidateBadge}
          </span>
        ) : null}
        {node.metrics.slice(0, 2).map((metric) => <span key={metric}>{metric}</span>)}
      </div>
      {data.candidatePreviews.length ? (
        <div className="content-prompt-flow-node__candidate-list">
          {data.candidatePreviews.map((preview) => (
            <ContentPromptFlowNodeCandidatePreview
              key={preview.key}
              preview={preview}
              variant={node.kind === 'resource' ? 'resource' : 'candidate'}
              onOpen={() => data.onCandidatePreviewOpen(preview)}
            />
          ))}
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </article>
  )
}

function ContentPromptFlowNodeCandidatePreview({
  preview,
  variant,
  onOpen,
}: {
  preview: CreativeFlowNodeCandidatePreview
  variant: 'candidate' | 'resource'
  onOpen: () => void
}) {
  const mediaKind = candidatePreviewMediaKind(preview)
  const canPreview = preview.resourceId !== undefined && mediaKind !== 'file'
  return (
    <div
      className="content-prompt-flow-node__candidate nodrag"
      data-has-media={canPreview ? 'true' : undefined}
      data-media-kind={mediaKind}
      data-preview-kind={variant}
    >
      {canPreview ? (
        <span className="content-prompt-flow-node__candidate-thumb">
          {preview.resourceId !== undefined && mediaKind === 'image' ? (
            <ResourceFileImage resourceId={preview.resourceId} alt={preview.title || preview.id} loading="lazy" thumbnailMaxSize={96} />
          ) : null}
          {preview.resourceId !== undefined && mediaKind === 'video' ? (
            <ResourceFileVideo resourceId={preview.resourceId} muted playsInline preload="metadata" />
          ) : null}
          <button
            type="button"
            className="content-prompt-flow-node__candidate-zoom"
            onClick={onOpen}
            aria-label={`查看候选 ${preview.title || preview.id}`}
          >
            <Search size={14} aria-hidden="true" />
          </button>
        </span>
      ) : null}
      {variant !== 'resource' ? (
        <span>
          <strong>{preview.title || preview.id}</strong>
          <small>{previewStatusLabel(preview)}</small>
        </span>
      ) : null}
      {variant !== 'resource' && preview.selected ? (
        <span className="content-prompt-flow-node__candidate-selected-icon" title="当前选中" aria-label="当前选中">
          <Star size={13} aria-hidden="true" fill="currentColor" />
        </span>
      ) : null}
    </div>
  )
}

function ContentPromptCandidatePreviewDialog({
  preview,
  onClose,
}: {
  preview: CreativeFlowNodeCandidatePreview
  onClose: () => void
}) {
  const mediaKind = candidatePreviewMediaKind(preview)
  const dialog = (
    <div
      className="content-prompt-candidate-preview-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={preview.title || preview.id}
    >
      <button
        type="button"
        className="content-prompt-candidate-preview-dialog__backdrop"
        aria-label="关闭候选预览"
        onClick={onClose}
      />
      <div className="content-prompt-candidate-preview-dialog__panel">
        <div className="content-prompt-candidate-preview-dialog__header">
          <span>
            <strong>{preview.title || preview.id}</strong>
            <small>{preview.status}</small>
          </span>
          <button type="button" onClick={onClose}>关闭</button>
        </div>
        <div className="content-prompt-candidate-preview-dialog__body" data-media-kind={mediaKind}>
          {preview.resourceId !== undefined && mediaKind === 'image' ? (
            <ResourceFileImage resourceId={preview.resourceId} alt={preview.title || preview.id} />
          ) : null}
          {preview.resourceId !== undefined && mediaKind === 'video' ? (
            <ResourceFileVideo resourceId={preview.resourceId} controls autoPlay playsInline preload="metadata" />
          ) : null}
        </div>
      </div>
    </div>
  )
  if (typeof document === 'undefined') return dialog
  return createPortal(dialog, document.body)
}

function areCreativeFlowNodePropsEqual(
  previous: NodeProps<Node<CreativeFlowNodeData>>,
  next: NodeProps<Node<CreativeFlowNodeData>>,
): boolean {
  return previous.id === next.id
    && previous.selected === next.selected
    && previous.dragging === next.dragging
    && previous.data.item === next.data.item
    && previous.data.nodes === next.data.nodes
    && previous.data.prompt === next.data.prompt
    && previous.data.candidateSelections === next.data.candidateSelections
    && previous.data.candidateBadge === next.data.candidateBadge
    && creativeFlowNodeCandidatePreviewsKey(previous.data.candidatePreviews) === creativeFlowNodeCandidatePreviewsKey(next.data.candidatePreviews)
    && previous.data.onContextMenu === next.data.onContextMenu
    && previous.data.onCandidatePreviewOpen === next.data.onCandidatePreviewOpen
    && previous.data.onPromptCommit === next.data.onPromptCommit
    && previous.data.onPromptDraftChange === next.data.onPromptDraftChange
    && previous.data.onSelectNode === next.data.onSelectNode
}

function promptDraftForNode(
  node: ContentCanvasNode,
  draftAssetPrompts: Record<string, string>,
  draftExpressionPrompts: Record<string, string>,
) {
  const target = contentCanvasGenerationTargetForNode(node)
  const targetPrompt = promptFromContentNode(target?.node) ?? promptFromContentNode(node) ?? ''
  return node.kind === 'asset'
    ? draftAssetPrompts[node.id] ?? targetPrompt
    : draftExpressionPrompts[node.id] ?? targetPrompt
}

function candidatePreviewsForNode(
  node: ContentCanvasNode,
  candidateSelections: CandidateSelections,
): CreativeFlowNodeCandidatePreview[] {
  if (node.kind === 'resource') {
    const preview = resourcePreviewForNode(node)
    return preview ? [preview] : []
  }
  const target = contentCanvasGenerationTargetForNode(node)
  if (!target?.candidates.length) return []
  const explicitSelectionId = explicitCandidateSelectionIdForNode(node, target.node, candidateSelections)
  const repeatedIds = repeatedCandidateIds(target.candidates)
  return target.candidates.map((candidate, index) => ({
    key: candidatePreviewKey(candidate, index),
    id: candidate.id,
    title: candidate.title || candidate.id,
    status: candidate.selected ? '当前候选' : candidate.status ?? '候选',
    ...(candidate.resourceId !== undefined ? { resourceId: candidate.resourceId } : {}),
    resourceKind: candidate.resourceKind ?? mediaKindForNode(target.node),
    selected: candidate.selected || (explicitSelectionId === candidate.id && !repeatedIds.has(candidate.id)),
    candidateCount: target.candidates.length,
  }))
}

function resourcePreviewForNode(node: ContentCanvasNode): CreativeFlowNodeCandidatePreview | null {
  const resourceId = numericRecordField(node.record.resourceId) ?? numericRecordField(node.record.resource_id) ?? numericRecordField(node.entityKey)
  if (resourceId === undefined) return null
  return {
    key: `resource:${resourceId}`,
    id: `resource:${resourceId}`,
    title: node.title || `Resource ${resourceId}`,
    status: node.record.source === 'prompt_reference' ? 'Raw Resource' : node.subtitle || '资源',
    resourceId,
    resourceKind: resourceKindForNodeRecord(node.record) ?? 'image',
  }
}

function creativeFlowNodeCandidatePreviewsKey(previews: CreativeFlowNodeCandidatePreview[]): string {
  return previews.map((preview) => [
    preview.key,
    preview.id,
    preview.title,
    preview.status,
    preview.resourceId ?? '',
    preview.resourceKind ?? '',
    preview.selected ? 'selected' : '',
    preview.candidateCount ?? '',
  ].join(':')).join('|')
}

function previewStatusLabel(preview: CreativeFlowNodeCandidatePreview): string {
  const count = preview.candidateCount && preview.candidateCount > 1 ? ` · ${preview.candidateCount} 候选` : ''
  return `${preview.status}${count}`
}

function explicitCandidateSelectionIdForNode(
  sourceNode: ContentCanvasNode,
  contentUnitNode: ContentCanvasNode,
  candidateSelections: CandidateSelections,
): string | undefined {
  return [
    contentUnitNode.id,
    contentUnitNode.entityKey,
    sourceNode.id,
    sourceNode.entityKey,
    sourceNode.generationTask?.nodeId,
    sourceNode.generationTask?.id,
  ]
    .map((key) => key ? candidateSelections[key] : undefined)
    .find((candidateId): candidateId is string => Boolean(candidateId))
}

function candidatePreviewKey(candidate: ContentCanvasCandidate, index: number): string {
  return [
    candidate.id,
    candidate.resourceId ?? '',
    candidate.artifactRef ?? '',
    candidate.inputHash ?? '',
    candidate.source ?? '',
    index,
  ].join(':')
}

function repeatedCandidateIds(candidates: ContentCanvasCandidate[]): Set<string> {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) repeated.add(candidate.id)
    seen.add(candidate.id)
  }
  return repeated
}

function candidatePreviewMediaKind(preview: CreativeFlowNodeCandidatePreview): 'image' | 'video' | 'file' {
  const resourceKind = `${preview.resourceKind ?? ''}`.toLowerCase()
  if (resourceKind.includes('video') || resourceKind.includes('movie') || resourceKind.includes('mp4')) return 'video'
  if (resourceKind.includes('image') || resourceKind.includes('board') || resourceKind.includes('keyframe') || resourceKind.includes('png') || resourceKind.includes('jpg') || resourceKind.includes('jpeg')) return 'image'
  return 'file'
}

function resourceKindForNodeRecord(record: Record<string, unknown>): string | undefined {
  return stringRecordField(record.resourceKind)
    ?? stringRecordField(record.resource_kind)
    ?? stringRecordField(record.resourceType)
    ?? stringRecordField(record.resource_type)
    ?? stringRecordField(record.mime_type)
    ?? stringRecordField(record.mimeType)
    ?? stringRecordField(record.resourceMimeType)
}

function numericRecordField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim())
  return undefined
}

function stringRecordField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function flowPositionsByNodeId(nodes: Node<CreativeFlowNodeData>[]): Record<string, { x: number; y: number }> {
  return Object.fromEntries(nodes.map((node) => [node.id, node.position]))
}

function isCreativePromptEditableNode(node: CreativeCanvasNode): boolean {
  return node.canGenerate && node.role !== 'resource'
}

function edgeLabel(edge: ContentCanvasEdge): string | undefined {
  if (edge.kind === 'sequence') return '顺序'
  return edge.label
}

function roleLabel(role: CreativeCanvasNode['role']): string {
  if (role === 'structure') return '结构'
  if (role === 'generation') return '创作片段'
  if (role === 'candidate') return '候选'
  if (role === 'resource') return '资源'
  if (role === 'issue') return '工作项'
  return '创作'
}

function creativeFlowNodeDisplay(node: ContentCanvasNode, role: CreativeCanvasNode['role']): { badge: string; subtitle: string } {
  if (node.kind === 'expression_unit') {
    const expressionKind = expressionUnitKindValue(node)
    const expressionLabel = expressionUnitKindShortLabel(expressionKind)
    const mediaLabel = mediaKindLabel(mediaKindForNode(node))
    return {
      badge: expressionLabel,
      subtitle: [expressionLabel, mediaLabel, node.subtitle && node.subtitle !== expressionKind ? node.subtitle : undefined]
        .filter(Boolean)
        .join(' · '),
    }
  }
  return {
    badge: roleLabel(role),
    subtitle: `${node.kind} · ${node.subtitle}`,
  }
}

function creativeCanvasMeasuredNodeSizes(nodes: Node<CreativeFlowNodeData>[]): Record<string, { width: number; height: number }> {
  const sizes: Record<string, { width: number; height: number }> = {}
  for (const node of nodes) {
    const measured = (node as { measured?: { width?: number; height?: number }; width?: number; height?: number }).measured
    const width = measured?.width ?? (node as { width?: number }).width
    const height = measured?.height ?? (node as { height?: number }).height
    if (typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0) {
      sizes[node.id] = { width, height }
    }
  }
  return sizes
}

function creativeCanvasNodeViewportSize(node: CreativeCanvasNode): { width: number; height: number } {
  if (node.weight === 'compact') return { width: 260, height: 180 }
  if (node.weight === 'normal') return { width: 340, height: 280 }
  return { width: 360, height: 300 }
}

function selectionKindForPromptNode(node: ContentCanvasNode): InspectorSelection['kind'] {
  if (node.kind === 'scene_moment') return 'scene_moment'
  if (node.kind === 'setting') return 'setting'
  if (node.kind === 'state') return 'state'
  if (node.kind === 'asset') return 'asset'
  return 'other'
}

function contextMenuActionKey(action: CreativeCanvasAction): string {
  if (action.kind === 'create_child') return `${action.kind}:${action.childKind}`
  if (action.kind === 'select_candidate') return `${action.kind}:${action.candidateId}`
  return action.kind
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tagName = target.tagName.toLowerCase()
  return tagName === 'input'
    || tagName === 'textarea'
    || tagName === 'select'
    || target.isContentEditable
    || Boolean(target.closest('[contenteditable="true"]'))
}
