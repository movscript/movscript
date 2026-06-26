import { memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react'
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
import { ChevronRight, FileText, FolderOpen, GitBranch, Image as ImageIcon, Link2, LocateFixed, Move, Music, Plus, Search, Sparkles, Star, Video, X } from 'lucide-react'

import { generationParamDefaults } from '@movscript/core/generation'
import { readResourceDragPayload, resourceDropAcceptsPayload } from '@movscript/resource-surface/resource-interaction'
import { ResourceFileImage, ResourceFileVideo } from '@movscript/resource-surface/resource-media-components'
import type { PublicModel } from '@movscript/shared'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Label } from '@movscript/ui/primitives'

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
import type { ContentCanvasDocument } from '../application/contentCanvasDocuments'
import type { ContentCanvasCreateNodeInput } from '../application/contentCanvasCommands'
import type { ContentCanvasUploadedResource } from '../application/contentCanvasWorkspaceGateway'
import type { ContentCanvasCandidate, ContentCanvasEdge, ContentCanvasNode } from '../domain/contentCanvasTypes'
import {
  type ContentCanvasCandidateGenerationOptions,
  type ContentCanvasCandidatePromptPreview,
} from './ContentCanvasInspectorParts'
import { ContentCanvasGenerationParamControls } from './ContentCanvasGenerationParamControls'
import { ContentCanvasModelSelector } from './ContentCanvasModelSelector'
import { ContentCanvasPromptEditor } from './ContentCanvasPromptEditor'
import { ContentCanvasResourceCandidatePicker } from './ContentCanvasResourceCandidatePicker'
import {
  contentCanvasFirstSegmentIdForProduction,
  contentCanvasSegmentsForProduction,
} from './contentPromptCanvasQuickCreateModel'
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
import type { CandidateSelections, ContentCanvasNodePosition, InspectorSelection } from './contentCanvasWorkspaceTypes'

type CreativeFlowNodeData = {
  item: CreativeCanvasNode
  candidateSelections: CandidateSelections
  candidateBadge: string
  candidatePreviews: CreativeFlowNodeCandidatePreview[]
  nodes: ContentCanvasNode[]
  prompt: string
  referenceTargetNodeId?: string | null
  onContextMenu: (event: ReactMouseEvent, node: ContentCanvasNode) => void
  onPromptCommit: (node: ContentCanvasNode, prompt: string) => void
  onPromptDraftChange: (node: ContentCanvasNode, prompt: string) => void
  onStructuredPromptCommit: (node: ContentCanvasNode, structured: Record<string, unknown>) => void
  onCandidatePreviewOpen: (preview: CreativeFlowNodeCandidatePreview) => void
  onGenerateWithOptions: (node: ContentCanvasNode, options: ContentCanvasCandidateGenerationOptions) => void
  onReferenceToActivePrompt: (node: ContentCanvasNode) => void
  onReferenceDrop: (targetNode: ContentCanvasNode, sourceNodeId: string) => void
  onResourceDrop: (targetNode: ContentCanvasNode, resource: ContentCanvasUploadedResource, position?: ContentCanvasNodePosition) => void
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

type CreativeCanvasChildKind = Extract<CreativeCanvasAction, { kind: 'create_child' }>['childKind']
type CreativeCanvasDirectKind =
  | 'task_video'
  | 'task_image'
  | 'task_audio'
  | 'task_text'
  | 'scene_moment'
  | 'keyframe'
  | 'storyboard'
  | 'asset_image'
  | 'asset_video'
  | 'asset_audio'

type CreativeCanvasQuickAddOption =
  | {
    kind: 'child'
    childKind: CreativeCanvasChildKind
    label: string
    parentNode: ContentCanvasNode
  }
  | {
    kind: 'direct'
    nodeKind: CreativeCanvasDirectKind
    label: string
  }

type CreativeCanvasQuickAddMediaKind = 'image' | 'video' | 'audio' | 'text'

type CreativeCanvasQuickAddGroup = {
  mediaKind: CreativeCanvasQuickAddMediaKind
  label: string
  primaryOption: CreativeCanvasQuickAddOption
  semanticOptions: CreativeCanvasQuickAddOption[]
}

type CreativeCanvasQuickAddMenuState = {
  x: number
  y: number
  position: ContentCanvasNodePosition
  inferredParentTitle?: string
  groups: CreativeCanvasQuickAddGroup[]
}

type CreativeCanvasQuickCreateDialogState = {
  option: CreativeCanvasQuickAddOption
  position: ContentCanvasNodePosition
}

type DragResourcePayloadResource = {
  ID: number
  name?: string
  type?: string
  mime_type?: string
  mimeType?: string
}

const CREATIVE_CANVAS_MINIMAP_NODE_LIMIT = 120
const CONTENT_PROMPT_REFERENCE_DRAG_MIME = 'application/x-movscript-content-reference'

const nodeTypes = {
  contentPrompt: memo(ContentPromptFlowNode, areCreativeFlowNodePropsEqual),
}

export function ContentPromptCanvasPanel({
  activeCanvasDocument,
  candidateSelections,
  canvasDocuments,
  canvasNodeIds,
  draftAssetPrompts,
  draftExpressionPrompts,
  edges,
  focusRequest,
  focusedNodeId,
  manualPositions: persistedManualPositions,
  savedViewport,
  nodes,
  onAddNodeToCanvas,
  onCandidateCreate,
  onCandidatePromptPreview,
  onCandidateResourceSelect,
  onCandidateSelect,
  onCandidateNodeSelect,
  onCandidateUpload,
  onClearManualPositions,
  onClearManualPositionsForNodes,
  onCreateChild,
  onCreateCanvas,
  onCreateNode,
  onDeleteNode,
  onExpressionPromptChange,
  onNodePositionsCommit,
  onViewportCommit,
  onPromptChange,
  onPromptCommit,
  onRemoveNodeFromCanvas,
  onStructuredPromptCommit,
  onResourceOpen,
  onSelectCanvas,
  onSelectNode,
}: {
  activeCanvasDocument?: ContentCanvasDocument
  candidateSelections: CandidateSelections
  canvasDocuments: ContentCanvasDocument[]
  canvasNodeIds: string[]
  draftAssetPrompts: Record<string, string>
  draftExpressionPrompts: Record<string, string>
  edges: ContentCanvasEdge[]
  focusRequest?: { nodeId: string; requestId: number } | null
  focusedNodeId?: string | null
  manualPositions?: Record<string, { x: number; y: number }>
  savedViewport?: Viewport
  nodes: ContentCanvasNode[]
  onAddNodeToCanvas: (nodeId: string, position?: ContentCanvasNodePosition) => void
  onCandidateCreate: (node: ContentCanvasNode | undefined, options?: ContentCanvasCandidateGenerationOptions) => void
  onCandidatePromptPreview: (node: ContentCanvasNode | undefined) => Promise<ContentCanvasCandidatePromptPreview>
  onCandidateResourceSelect: (node: ContentCanvasNode | undefined, resource: ContentCanvasUploadedResource, position?: ContentCanvasNodePosition) => void
  onCandidateSelect: (node: ContentCanvasNode | undefined, candidate: ContentCanvasCandidate) => void
  onCandidateNodeSelect: (node: ContentCanvasNode) => void
  onCandidateUpload: (node: ContentCanvasNode | undefined, file: File) => void
  onClearManualPositions: () => void
  onClearManualPositionsForNodes: (nodeIds: string[]) => void
  onCreateChild: (node: ContentCanvasNode, childKind: CreativeCanvasChildKind, position?: ContentCanvasNodePosition, input?: ContentCanvasCreateNodeInput) => void
  onCreateCanvas: () => void
  onCreateNode: (nodeKind: CreativeCanvasDirectKind, position: ContentCanvasNodePosition, input?: ContentCanvasCreateNodeInput) => void
  onDeleteNode: (node: ContentCanvasNode) => void
  onExpressionPromptChange: (nodeId: string, prompt: string) => void
  onNodePositionsCommit: (nodePositions: Record<string, { x: number; y: number }>) => void
  onViewportCommit: (viewport: Viewport) => void
  onPromptChange: (assetId: string, prompt: string) => void
  onPromptCommit: (node: ContentCanvasNode | undefined, prompt: string) => void
  onRemoveNodeFromCanvas: (nodeId: string) => void
  onStructuredPromptCommit: (node: ContentCanvasNode | undefined, structured: Record<string, unknown>) => void
  onResourceOpen: (node: ContentCanvasNode) => void
  onSelectCanvas: (canvasId: string) => void
  onSelectNode: (kind: InspectorSelection['kind'], nodeId: string) => void
}) {
  void onCandidatePromptPreview
  void onCandidateSelect
  void onCandidateUpload
  void onClearManualPositions
  void onClearManualPositionsForNodes
  const creativeGraph = useMemo(
    () => buildCreativeCanvasGraph({ nodes, edges }, { nodeIds: canvasNodeIds }),
    [canvasNodeIds, edges, nodes],
  )
  const [manualPositions, setManualPositions] = useState<Record<string, { x: number; y: number }>>(persistedManualPositions ?? {})
  const [contextMenu, setContextMenu] = useState<CreativeCanvasContextMenuState | null>(null)
  const [quickAddMenu, setQuickAddMenu] = useState<CreativeCanvasQuickAddMenuState | null>(null)
  const [quickCreateDialog, setQuickCreateDialog] = useState<CreativeCanvasQuickCreateDialogState | null>(null)
  const [candidatePreviewDialog, setCandidatePreviewDialog] = useState<CreativeFlowNodeCandidatePreview | null>(null)
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false)
  const [nodeLibraryOpen, setNodeLibraryOpen] = useState(false)
  const [nodeLibraryQuery, setNodeLibraryQuery] = useState('')
  const [assetLibraryNotice, setAssetLibraryNotice] = useState<string | null>(null)
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<Node<CreativeFlowNodeData>, Edge> | null>(null)
  const consumedFocusRequestIdRef = useRef<number | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    setManualPositions(persistedManualPositions ?? {})
  }, [persistedManualPositions])
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const canvasNodeIdSet = useMemo(() => new Set(canvasNodeIds), [canvasNodeIds])
  const nodeLibraryNodes = useMemo(
    () => contentCanvasNodeLibraryNodes(nodes, nodeLibraryQuery),
    [nodeLibraryQuery, nodes],
  )
  const assetLibraryNodes = useMemo(
    () => nodes
      .filter((node) => node.kind === 'asset')
      .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN')),
    [nodes],
  )
  const promptByNodeId = useMemo(() => {
    const output: Record<string, string> = {}
    for (const node of nodes) output[node.id] = promptDraftForNode(node, draftAssetPrompts, draftExpressionPrompts)
    return output
  }, [draftAssetPrompts, draftExpressionPrompts, nodes])
  const openNodeContextMenu = useCallback((event: ReactMouseEvent, node: ContentCanvasNode) => {
    event.preventDefault()
    const actions = creativeCanvasActionsForNode(node)
    setContextMenu({ x: event.clientX, y: event.clientY, node, actions })
    setQuickAddMenu(null)
  }, [])
  const updatePromptDraft = useCallback((node: ContentCanvasNode, prompt: string) => {
    if (node.kind === 'asset') onPromptChange(node.id, prompt)
    else onExpressionPromptChange(node.id, prompt)
  }, [onExpressionPromptChange, onPromptChange])
  const commitPromptFromNode = useCallback((node: ContentCanvasNode, prompt: string) => {
    onPromptCommit(node, prompt)
  }, [onPromptCommit])
  const activePromptReferenceTargetId = useMemo(() => {
    if (!focusedNodeId) return null
    const target = creativeGraph.nodes.find((node) => node.id === focusedNodeId)
    return target && isCreativePromptEditableNode(target) ? target.id : null
  }, [creativeGraph.nodes, focusedNodeId])
  const activeAssetTarget = useMemo(() => {
    if (!focusedNodeId) return null
    const sourceNode = nodeById.get(focusedNodeId)
    const generationTarget = contentCanvasGenerationTargetForNode(sourceNode)
    return sourceNode && generationTarget ? { sourceNode, generationTarget } : null
  }, [focusedNodeId, nodeById])
  const selectAssetLibraryResource = useCallback((resource: ContentCanvasUploadedResource) => {
    if (!activeAssetTarget) {
      setAssetLibraryNotice('先选择一个可生成节点，再把资源加入候选。')
      return
    }
    onCandidateResourceSelect(activeAssetTarget.sourceNode, resource)
    setAssetLibraryNotice(`已加入 ${activeAssetTarget.generationTarget.label} 的候选。`)
  }, [activeAssetTarget, onCandidateResourceSelect])
  const createResourceCandidateFromDrop = useCallback((
    targetNode: ContentCanvasNode,
    resource: ContentCanvasUploadedResource,
    position?: ContentCanvasNodePosition,
  ) => {
    onCandidateResourceSelect(targetNode, resource, position)
  }, [onCandidateResourceSelect])
  useEffect(() => {
    if (activeAssetTarget) setAssetLibraryNotice(null)
  }, [activeAssetTarget?.sourceNode.id])
  const appendReferenceToActivePrompt = useCallback((sourceNode: ContentCanvasNode) => {
    if (!activePromptReferenceTargetId || activePromptReferenceTargetId === sourceNode.id) return
    const target = nodeById.get(activePromptReferenceTargetId)
    if (!target) return
    const currentPrompt = promptByNodeId[target.id] ?? ''
    const nextPrompt = appendContentNodeReferenceToPrompt(currentPrompt, sourceNode)
    updatePromptDraft(target, nextPrompt)
    onPromptCommit(target, nextPrompt)
  }, [activePromptReferenceTargetId, nodeById, onPromptCommit, promptByNodeId, updatePromptDraft])
  const appendReferenceToPromptTarget = useCallback((targetNode: ContentCanvasNode, sourceNodeId: string) => {
    if (targetNode.id === sourceNodeId) return
    const sourceNode = nodeById.get(sourceNodeId)
    if (!sourceNode) return
    const currentPrompt = promptByNodeId[targetNode.id] ?? ''
    const nextPrompt = appendContentNodeReferenceToPrompt(currentPrompt, sourceNode)
    updatePromptDraft(targetNode, nextPrompt)
    onPromptCommit(targetNode, nextPrompt)
  }, [nodeById, onPromptCommit, promptByNodeId, updatePromptDraft])
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
      referenceTargetNodeId: activePromptReferenceTargetId,
      onContextMenu: openNodeContextMenu,
      onCandidatePreviewOpen: setCandidatePreviewDialog,
      onGenerateWithOptions: (node, options) => onCandidateCreate(node, options),
      onReferenceToActivePrompt: appendReferenceToActivePrompt,
      onReferenceDrop: appendReferenceToPromptTarget,
      onResourceDrop: createResourceCandidateFromDrop,
      onPromptCommit: commitPromptFromNode,
      onPromptDraftChange: updatePromptDraft,
      onStructuredPromptCommit,
      onSelectNode,
    },
  })), [activePromptReferenceTargetId, appendReferenceToActivePrompt, appendReferenceToPromptTarget, candidateSelections, commitPromptFromNode, createResourceCandidateFromDrop, creativeGraph.nodes, focusedNodeId, manualPositions, nodes, onCandidateCreate, onSelectNode, onStructuredPromptCommit, openNodeContextMenu, promptByNodeId, updatePromptDraft])
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

  const openQuickAddMenuAtClientPoint = useCallback((clientX: number, clientY: number) => {
    const position = flowInstance?.screenToFlowPosition({ x: clientX, y: clientY }) ?? { x: 0, y: 0 }
    const quickAdd = creativeCanvasQuickAddOptionsForPosition({
      flowNodes,
      focusedNodeId,
      nodeById,
      position,
    })
    setContextMenu(null)
    setQuickAddMenu({
      x: clientX,
      y: clientY,
      position,
      inferredParentTitle: quickAdd.inferredParent?.title,
      groups: quickAdd.groups,
    })
  }, [flowInstance, flowNodes, focusedNodeId, nodeById])

  const openQuickAddMenu = useCallback((event: ReactMouseEvent | globalThis.MouseEvent) => {
    event.preventDefault()
    openQuickAddMenuAtClientPoint(event.clientX, event.clientY)
  }, [openQuickAddMenuAtClientPoint])

  const openQuickAddMenuFromToolbar = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const panelBounds = event.currentTarget.closest('.content-prompt-canvas-panel')?.getBoundingClientRect()
    const clientX = panelBounds ? panelBounds.left + panelBounds.width / 2 : window.innerWidth / 2
    const clientY = panelBounds ? panelBounds.top + panelBounds.height / 2 : window.innerHeight / 2
    openQuickAddMenuAtClientPoint(clientX, clientY)
  }, [openQuickAddMenuAtClientPoint])

  const positionForCanvasLibraryInsert = useCallback((): ContentCanvasNodePosition => {
    const bounds = panelRef.current?.getBoundingClientRect()
    const clientX = bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2
    const clientY = bounds ? bounds.top + bounds.height / 2 : window.innerHeight / 2
    return flowInstance?.screenToFlowPosition({ x: clientX, y: clientY }) ?? { x: 0, y: 0 }
  }, [flowInstance])

  const addLibraryNodeToCanvas = useCallback((node: ContentCanvasNode) => {
    onAddNodeToCanvas(node.id, positionForCanvasLibraryInsert())
  }, [onAddNodeToCanvas, positionForCanvasLibraryInsert])

  const useAssetLibraryNode = useCallback((node: ContentCanvasNode) => {
    if (activePromptReferenceTargetId && activePromptReferenceTargetId !== node.id) {
      appendReferenceToActivePrompt(node)
      return
    }
    addLibraryNodeToCanvas(node)
  }, [activePromptReferenceTargetId, addLibraryNodeToCanvas, appendReferenceToActivePrompt])

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
    setQuickAddMenu(null)
    if (action.kind === 'create_child') {
      onCreateChild(node, action.childKind)
      return
    }
    if (action.kind === 'generate_candidate') {
      onSelectNode(selectionKindForPromptNode(node), node.id)
      setQuickAddMenu(null)
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
    if (action.kind === 'remove_from_canvas') {
      onRemoveNodeFromCanvas(node.id)
      return
    }
    if (action.kind === 'delete_node') {
      onDeleteNode(node)
      return
    }
  }, [onCandidateNodeSelect, onCreateChild, onDeleteNode, onRemoveNodeFromCanvas, onResourceOpen, onSelectNode])

  const runQuickAddOption = useCallback((option: CreativeCanvasQuickAddOption, position: ContentCanvasNodePosition) => {
    setContextMenu(null)
    setQuickAddMenu(null)
    setQuickCreateDialog({ option, position })
  }, [])

  const submitQuickCreateDialog = useCallback((input: ContentCanvasCreateNodeInput) => {
    const state = quickCreateDialog
    if (!state) return
    setQuickCreateDialog(null)
    if (state.option.kind === 'direct') {
      onCreateNode(state.option.nodeKind, state.position, input)
      return
    }
    onCreateChild(state.option.parentNode, state.option.childKind, state.position, input)
  }, [onCreateChild, onCreateNode, quickCreateDialog])

  const closeQuickCreateDialog = useCallback(() => {
    setQuickCreateDialog(null)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (isTextEditingTarget(event.target)) return
      const selectedNode = flowNodes.find((node) => node.selected)
      const sourceNode = selectedNode ? nodeById.get(selectedNode.id) : undefined
      if (!sourceNode) return
      event.preventDefault()
      onRemoveNodeFromCanvas(sourceNode.id)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [flowNodes, nodeById, onRemoveNodeFromCanvas])

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

  const handleCanvasResourceDragOver = useCallback((event: ReactDragEvent) => {
    if (!resourceDropAcceptsPayload(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleCanvasResourceDrop = useCallback((event: ReactDragEvent) => {
    if (!resourceDropAcceptsPayload(event.dataTransfer)) return
    const resource = contentCanvasUploadedResourceFromDropEvent(event)
    if (!resource) return
    event.preventDefault()
    setContextMenu(null)
    setQuickAddMenu(null)
    const position = flowInstance?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? { x: 0, y: 0 }
    const targetNode = creativeCanvasResourceTargetForPosition({
      flowNodes,
      focusedNodeId,
      nodeById,
      position,
    })
    if (!targetNode) {
      setAssetLibraryOpen(true)
      setAssetLibraryNotice('先创建或选择一个可生成节点，再把资源拖入画布。')
      return
    }
    onCandidateResourceSelect(targetNode, resource, position)
    const targetLabel = contentCanvasGenerationTargetForNode(targetNode)?.label ?? targetNode.title
    setAssetLibraryNotice(`已加入 ${targetLabel} 的候选。`)
  }, [flowInstance, flowNodes, focusedNodeId, nodeById, onCandidateResourceSelect])

  const generatableCount = creativeGraph.nodes.filter((node) => node.canGenerate).length
  const showMiniMap = creativeGraph.nodes.length <= CREATIVE_CANVAS_MINIMAP_NODE_LIMIT

  return (
    <main
      ref={panelRef}
      className="content-prompt-canvas-panel"
      aria-label="提示词无限画布"
      onClick={() => {
        setContextMenu(null)
        setQuickAddMenu(null)
      }}
    >
      <div className="content-prompt-canvas-panel__toolbar">
        <span>
          <GitBranch size={14} aria-hidden="true" />
          {activeCanvasDocument?.title ?? '自由画布'}
        </span>
        <select
          className="content-prompt-canvas-panel__canvas-select"
          value={activeCanvasDocument?.id ?? ''}
          onChange={(event) => onSelectCanvas(event.target.value)}
          aria-label="选择画布"
        >
          {canvasDocuments.map((document) => (
            <option key={document.id} value={document.id}>{document.title}</option>
          ))}
        </select>
        <em>{creativeGraph.nodes.length} 个创作节点，{generatableCount} 个可生成节点</em>
        <button
          type="button"
          onClick={onCreateCanvas}
          title="新建自由画布"
          aria-label="新建自由画布"
        >
          <Plus size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={openQuickAddMenuFromToolbar}
          title="添加节点"
          aria-label="添加节点"
        >
          <Plus size={14} aria-hidden="true" />
        </button>
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
      <div className="content-prompt-canvas-panel__side-rail" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="content-prompt-canvas-panel__rail-button"
          data-active={nodeLibraryOpen ? 'true' : undefined}
          onClick={() => {
            setNodeLibraryOpen((current) => {
              if (!current) setAssetLibraryOpen(false)
              return !current
            })
          }}
          title="项目节点"
          aria-label="打开项目节点"
        >
          <Search size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="content-prompt-canvas-panel__rail-button"
          onClick={openQuickAddMenuFromToolbar}
          title="添加节点"
          aria-label="添加节点"
        >
          <Plus size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="content-prompt-canvas-panel__rail-button"
          data-active={assetLibraryOpen ? 'true' : undefined}
          onClick={() => {
            setAssetLibraryOpen((current) => {
              if (!current) setNodeLibraryOpen(false)
              return !current
            })
          }}
          title="资产库"
          aria-label="打开资产库"
        >
          <FolderOpen size={15} aria-hidden="true" />
        </button>
      </div>
      {nodeLibraryOpen ? (
        <aside
          className="content-prompt-canvas-node-drawer"
          aria-label="项目节点库"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="content-prompt-canvas-node-drawer__header">
            <span>
              <strong>项目节点</strong>
              <small>加入当前画布，不复制节点数据</small>
            </span>
            <button
              type="button"
              onClick={() => setNodeLibraryOpen(false)}
              aria-label="关闭项目节点"
              title="关闭项目节点"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <label className="content-prompt-canvas-node-drawer__search">
            <Search size={13} aria-hidden="true" />
            <input
              value={nodeLibraryQuery}
              onChange={(event) => setNodeLibraryQuery(event.target.value)}
              placeholder="搜索节点"
            />
          </label>
          <div className="content-prompt-canvas-node-drawer__list">
            {nodeLibraryNodes.length ? nodeLibraryNodes.map((node) => {
              const alreadyAdded = canvasNodeIdSet.has(node.id)
              const Icon = iconForContentNode(node)
              return (
                <button
                  key={node.id}
                  type="button"
                  className="content-prompt-canvas-node-drawer__row"
                  data-added={alreadyAdded ? 'true' : undefined}
                  disabled={alreadyAdded}
                  onClick={() => addLibraryNodeToCanvas(node)}
                >
                  <span className="content-prompt-canvas-node-drawer__icon">
                    <Icon size={14} aria-hidden="true" />
                  </span>
                  <span className="content-prompt-canvas-node-drawer__copy">
                    <strong>{node.title}</strong>
                    <small>{contentCanvasNodeLibraryLabel(node)}</small>
                  </span>
                  <span className="content-prompt-canvas-node-drawer__action">
                    {alreadyAdded ? '已加入' : '加入'}
                  </span>
                </button>
              )
            }) : (
              <p className="content-prompt-canvas-node-drawer__empty">没有匹配节点</p>
            )}
          </div>
        </aside>
      ) : null}
      {assetLibraryOpen ? (
        <aside
          className="content-prompt-canvas-asset-drawer"
          aria-label="画布资产库"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="content-prompt-canvas-asset-drawer__header">
            <span>
              <strong>资产库</strong>
              <small>{activeAssetTarget ? `目标：${activeAssetTarget.generationTarget.label}` : '选择画布节点后可加入候选'}</small>
            </span>
            <button
              type="button"
              onClick={() => setAssetLibraryOpen(false)}
              aria-label="关闭资产库"
              title="关闭资产库"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          {assetLibraryNotice ? (
            <p className="content-prompt-canvas-asset-drawer__notice">{assetLibraryNotice}</p>
          ) : null}
          {assetLibraryNodes.length ? (
            <div className="content-prompt-canvas-node-drawer__list">
              {assetLibraryNodes.map((node) => {
                const alreadyAdded = canvasNodeIdSet.has(node.id)
                const Icon = iconForContentNode(node)
                return (
                  <button
                    key={node.id}
                    type="button"
                    className="content-prompt-canvas-node-drawer__row"
                    data-added={alreadyAdded ? 'true' : undefined}
                    disabled={alreadyAdded && !(activePromptReferenceTargetId && activePromptReferenceTargetId !== node.id)}
                    onClick={() => useAssetLibraryNode(node)}
                  >
                    <span className="content-prompt-canvas-node-drawer__icon">
                      <Icon size={14} aria-hidden="true" />
                    </span>
                    <span className="content-prompt-canvas-node-drawer__copy">
                      <strong>{node.title}</strong>
                      <small>{contentCanvasNodeLibraryLabel(node)}</small>
                    </span>
                    <span className="content-prompt-canvas-node-drawer__action">
                      {activePromptReferenceTargetId && activePromptReferenceTargetId !== node.id ? '引用' : alreadyAdded ? '已加入' : '加入'}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : null}
          <ContentCanvasResourceCandidatePicker
            mediaKind={mediaKindForNode(activeAssetTarget?.generationTarget.node)}
            onSelect={selectAssetLibraryResource}
          />
        </aside>
      ) : null}
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
          setQuickAddMenu(null)
          onSelectNode(selectionKindForPromptNode(sourceNode), sourceNode.id)
        }}
        onPaneClick={() => {
          setContextMenu(null)
          setQuickAddMenu(null)
        }}
        onPaneContextMenu={openQuickAddMenu}
        onDragOver={handleCanvasResourceDragOver}
        onDrop={handleCanvasResourceDrop}
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
          <span>右击创建任务，或从项目节点加入已有创作对象。</span>
        </div>
      ) : null}
      {quickAddMenu ? (
        <div
          className="content-prompt-canvas-quick-add-menu"
          role="menu"
          style={{ left: quickAddMenu.x, top: quickAddMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <strong>添加节点</strong>
          {quickAddMenu.inferredParentTitle ? <small>添加到 {quickAddMenu.inferredParentTitle}</small> : null}
          {quickAddMenu.groups.map((group) => (
            <div
              key={group.mediaKind}
              className="content-prompt-canvas-quick-add-menu__group"
              data-has-submenu={group.semanticOptions.length ? 'true' : 'false'}
              role="none"
            >
              <button
                className="content-prompt-canvas-quick-add-menu__primary"
                type="button"
                role="menuitem"
                data-option-kind={group.primaryOption.kind}
                onClick={() => runQuickAddOption(group.primaryOption, quickAddMenu.position)}
              >
                {quickAddMediaIcon(group.mediaKind)}
                <span>{group.label}</span>
              </button>
              {group.semanticOptions.length ? (
                <>
                  <ChevronRight
                    className="content-prompt-canvas-quick-add-menu__chevron"
                    size={14}
                    aria-hidden="true"
                  />
                  <div className="content-prompt-canvas-quick-add-menu__submenu" role="menu">
                    {group.semanticOptions.map((option) => (
                      <button
                        key={quickAddOptionKey(option)}
                        type="button"
                        role="menuitem"
                        data-option-kind={option.kind}
                        onClick={() => runQuickAddOption(option, quickAddMenu.position)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <ContentPromptCanvasQuickCreateDialog
        nodes={nodes}
        state={quickCreateDialog}
        onClose={closeQuickCreateDialog}
        onSubmit={submitQuickCreateDialog}
      />
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
  const editablePrompt = isCreativePromptEditableNode(data.item)
  const generationTarget = contentCanvasGenerationTargetForNode(node)
  const generationMediaKind = mediaKindForNode(generationTarget?.node ?? node)
  const canGenerateWithModel = generationMediaKind === 'image' || generationMediaKind === 'video'
  const expanded = Boolean(selected)
  const currentPreview = currentCandidatePreview(data.candidatePreviews)
  return (
    <article
      className="content-prompt-flow-node"
      data-selected={selected ? 'true' : undefined}
      data-expanded={expanded ? 'true' : undefined}
      data-kind={node.kind}
      data-expression-kind={node.kind === 'expression_unit' ? expressionUnitKindValue(node) : undefined}
      data-role={data.item.role}
      data-weight={data.item.weight}
      data-reference-drop-target={editablePrompt ? 'true' : undefined}
      onContextMenu={(event) => data.onContextMenu(event, node)}
      onClick={() => data.onSelectNode(selectionKindForPromptNode(node), node.id)}
      onDragOver={(event) => {
        const acceptsPromptReference = editablePrompt && event.dataTransfer.types.includes(CONTENT_PROMPT_REFERENCE_DRAG_MIME)
        const acceptsResourceCandidate = data.item.canGenerate && resourceDropAcceptsPayload(event.dataTransfer)
        if (!acceptsPromptReference && !acceptsResourceCandidate) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(event) => {
        if (data.item.canGenerate && resourceDropAcceptsPayload(event.dataTransfer)) {
          const resource = contentCanvasUploadedResourceFromDropEvent(event)
          if (!resource) return
          event.preventDefault()
          event.stopPropagation()
          data.onResourceDrop(node, resource)
          return
        }
        if (!editablePrompt) return
        const sourceNodeId = event.dataTransfer.getData(CONTENT_PROMPT_REFERENCE_DRAG_MIME)
        if (!sourceNodeId) return
        event.preventDefault()
        event.stopPropagation()
        data.onReferenceDrop(node, sourceNodeId)
      }}
    >
      <Handle type="target" position={Position.Left} />
      <section className="content-prompt-flow-node__preview-card">
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
          <div className="content-prompt-flow-node__media">
            {expanded ? (
              <div className="content-prompt-flow-node__state-grid">
                <section className="content-prompt-flow-node__state-panel">
                  <header>
                    <span>当前状态</span>
                    <button
                      type="button"
                      className="content-prompt-flow-node__role nodrag"
                      onClick={() => data.onSelectNode(selectionKindForPromptNode(node), node.id)}
                    >
                      {display.badge}
                    </button>
                  </header>
                  <ContentPromptFlowNodeCurrentState
                    mediaKind={generationMediaKind}
                    node={node}
                    preview={currentPreview}
                    onOpen={() => currentPreview ? data.onCandidatePreviewOpen(currentPreview) : undefined}
                  />
                </section>
                <section className="content-prompt-flow-node__candidate-panel">
                  <header>
                    <span>候选</span>
                    <em>{data.candidatePreviews.length}</em>
                  </header>
                  {data.candidatePreviews.length ? (
                    <div className="content-prompt-flow-node__candidate-list">
                      {data.candidatePreviews.map((preview) => (
                        <ContentPromptFlowNodeCandidatePreview
                          key={preview.key}
                          preview={preview}
                          variant={node.kind === 'resource' ? 'resource' : 'candidate'}
                          canReference={Boolean(data.referenceTargetNodeId && data.referenceTargetNodeId !== node.id)}
                          sourceNode={node}
                          onOpen={() => data.onCandidatePreviewOpen(preview)}
                          onReference={() => data.onReferenceToActivePrompt(node)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="content-prompt-flow-node__candidate-empty">暂无候选</div>
                  )}
                </section>
              </div>
            ) : (
              <ContentPromptFlowNodeCurrentState
                compact
                mediaKind={generationMediaKind}
                node={node}
                preview={currentPreview}
                onOpen={() => currentPreview ? data.onCandidatePreviewOpen(currentPreview) : undefined}
              />
            )}
          </div>
        ) : null}
        <div className="content-prompt-flow-node__meta">
          {data.item.canGenerate && canGenerateWithModel && !expanded ? (
            <button
              type="button"
              className="content-prompt-flow-node__generate nodrag"
              onClick={(event) => {
                event.stopPropagation()
                data.onSelectNode(selectionKindForPromptNode(node), node.id)
              }}
            >
              <Sparkles size={11} aria-hidden="true" />
              {data.candidateBadge}
            </button>
          ) : null}
          {node.metrics.slice(0, 2).map((metric) => <span key={metric}>{metric}</span>)}
        </div>
      </section>
      {node.kind !== 'resource' && expanded ? (
        <section className="content-prompt-flow-node__prompt-panel">
          {editablePrompt ? (
            <ContentCanvasPromptEditor
              ariaLabel={`${node.title} 提示词`}
              candidateSelections={data.candidateSelections}
              nodes={data.nodes}
              ownerNode={node}
              structured={structuredPromptFromNode(node)}
              value={data.prompt}
              onChange={(prompt) => data.onPromptDraftChange(node, prompt)}
              onBlur={(prompt) => data.onPromptCommit(node, prompt)}
              onStructuredCommit={(structured) => data.onStructuredPromptCommit(node, structured)}
              onSelectNode={(referenceNode) => data.onSelectNode(selectionKindForPromptNode(referenceNode), referenceNode.id)}
            />
          ) : null}
          {data.item.canGenerate ? (
            <ContentPromptFlowNodeGenerationPanel
              node={generationTarget?.node ?? node}
              onSubmit={(options) => data.onGenerateWithOptions(node, options)}
            />
          ) : null}
        </section>
      ) : null}
      <Handle type="source" position={Position.Right} />
    </article>
  )
}

function ContentPromptCanvasQuickCreateDialog({
  nodes,
  state,
  onClose,
  onSubmit,
}: {
  nodes: ContentCanvasNode[]
  state: CreativeCanvasQuickCreateDialogState | null
  onClose: () => void
  onSubmit: (input: ContentCanvasCreateNodeInput) => void
}) {
  const [id, setId] = useState('')
  const [title, setTitle] = useState('')
  const [productionMode, setProductionMode] = useState<'existing' | 'new'>('new')
  const [segmentMode, setSegmentMode] = useState<'existing' | 'new'>('new')
  const [selectedProductionId, setSelectedProductionId] = useState('')
  const [selectedSegmentId, setSelectedSegmentId] = useState('')
  const [newProductionId, setNewProductionId] = useState('')
  const [newProductionTitle, setNewProductionTitle] = useState('')
  const [newSegmentId, setNewSegmentId] = useState('')
  const [newSegmentTitle, setNewSegmentTitle] = useState('')
  const [settingMode, setSettingMode] = useState<'existing' | 'new'>('new')
  const [stateMode, setStateMode] = useState<'existing' | 'new'>('new')
  const [selectedSettingId, setSelectedSettingId] = useState('')
  const [selectedStateId, setSelectedStateId] = useState('')
  const [selectedVisualOwnerId, setSelectedVisualOwnerId] = useState('')
  const [newSettingId, setNewSettingId] = useState('')
  const [newSettingTitle, setNewSettingTitle] = useState('')
  const [newStateId, setNewStateId] = useState('')
  const [newStateTitle, setNewStateTitle] = useState('')
  const copy = quickCreateDialogCopy(state)
  const productions = useMemo(() => nodes.filter((node) => node.kind === 'production'), [nodes])
  const segments = useMemo(() => nodes.filter((node) => node.kind === 'segment'), [nodes])
  const segmentsForProduction = useMemo(() => (
    contentCanvasSegmentsForProduction(segments, selectedProductionId, productions)
  ), [productions, selectedProductionId, segments])
  const settings = useMemo(() => nodes.filter((node) => node.kind === 'setting'), [nodes])
  const states = useMemo(() => nodes.filter((node) => node.kind === 'state'), [nodes])
  const visualOwners = useMemo(() => nodes.filter((node) => node.kind === 'scene_moment' || node.kind === 'expression_unit'), [nodes])
  const statesForSetting = useMemo(() => (
    selectedSettingId
      ? states.filter((node) => stateNodeBelongsToSetting(node, selectedSettingId))
      : states
  ), [selectedSettingId, states])
  const needsProductionSegment = quickCreateDialogNeedsProductionSegment(state)
  const needsMount = quickCreateDialogNeedsSettingStateMount(state)
  const needsVisualOwner = quickCreateDialogNeedsVisualOwner(state)
  const canSubmit = Boolean(id.trim() && title.trim() && (!needsVisualOwner || selectedVisualOwnerId))

  useEffect(() => {
    if (!state) {
      setId('')
      setTitle('')
      setProductionMode('new')
      setSegmentMode('new')
      setSelectedProductionId('')
      setSelectedSegmentId('')
      setNewProductionId('')
      setNewProductionTitle('')
      setNewSegmentId('')
      setNewSegmentTitle('')
      setSettingMode('new')
      setStateMode('new')
      setSelectedSettingId('')
      setSelectedStateId('')
      setSelectedVisualOwnerId('')
      setNewSettingId('')
      setNewSettingTitle('')
      setNewStateId('')
      setNewStateTitle('')
      return
    }
    const firstProductionId = productions[0]?.entityKey ?? ''
    const firstSegmentId = contentCanvasFirstSegmentIdForProduction(segments, firstProductionId, productions)
    setProductionMode(firstProductionId ? 'existing' : 'new')
    setSegmentMode(firstSegmentId ? 'existing' : 'new')
    setSelectedProductionId(firstProductionId)
    setSelectedSegmentId(firstSegmentId)
    const firstSettingId = settings[0]?.entityKey ?? ''
    const firstStateId = states[0]?.entityKey ?? ''
    setSettingMode(firstSettingId ? 'existing' : 'new')
    setStateMode(firstStateId ? 'existing' : 'new')
    setSelectedSettingId(firstSettingId)
    setSelectedStateId(firstStateId)
    setSelectedVisualOwnerId(visualOwners[0]?.id ?? '')
  }, [productions, segments, settings, state, states, visualOwners])

  useEffect(() => {
    if (!state || !needsProductionSegment || productionMode !== 'existing' || segmentMode !== 'existing') return
    const currentSegmentIsAvailable = segmentsForProduction.some((segment) => segment.entityKey === selectedSegmentId)
    if (currentSegmentIsAvailable) return
    const nextSegmentId = segmentsForProduction[0]?.entityKey ?? ''
    if (nextSegmentId) {
      setSelectedSegmentId(nextSegmentId)
      return
    }
    setSegmentMode('new')
    setSelectedSegmentId('')
  }, [needsProductionSegment, productionMode, segmentMode, segmentsForProduction, selectedSegmentId, state])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    onSubmit({
      id: id.trim(),
      title: title.trim(),
      ...quickCreateProductionInput({
        id: id.trim(),
        needsProductionSegment,
        newProductionId,
        newProductionTitle,
        newSegmentId,
        newSegmentTitle,
        productionMode,
        segmentMode,
        selectedProductionId,
        selectedSegmentId,
        title: title.trim(),
      }),
      ...(needsVisualOwner ? { targetOwnerNodeId: selectedVisualOwnerId } : {}),
      ...quickCreateMountInput({
        id: id.trim(),
        needsMount,
        newSettingId,
        newSettingTitle,
        newStateId,
        newStateTitle,
        selectedSettingId,
        selectedStateId,
        settingMode,
        stateMode,
        title: title.trim(),
      }),
    })
    setId('')
    setTitle('')
  }

  function resetAndClose() {
    setId('')
    setTitle('')
    setNewProductionId('')
    setNewProductionTitle('')
    setNewSegmentId('')
    setNewSegmentTitle('')
    setNewSettingId('')
    setNewSettingTitle('')
    setNewStateId('')
    setNewStateTitle('')
    setSelectedVisualOwnerId('')
    onClose()
  }

  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => {
      if (open) return
      resetAndClose()
    }}>
      <DialogContent className="content-canvas-create-dialog">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
        </DialogHeader>
        <form className="content-canvas-create-dialog__form" onSubmit={handleSubmit}>
          <Label className="content-canvas-create-dialog__field" htmlFor="content-prompt-canvas-quick-create-id">
            <span>ID</span>
            <Input
              id="content-prompt-canvas-quick-create-id"
              autoFocus
              value={id}
              placeholder={copy.idPlaceholder}
              onChange={(event) => setId(event.target.value)}
            />
          </Label>
          <Label className="content-canvas-create-dialog__field" htmlFor="content-prompt-canvas-quick-create-title">
            <span>标题</span>
            <Input
              id="content-prompt-canvas-quick-create-title"
              value={title}
              placeholder={copy.titlePlaceholder}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Label>
          {needsProductionSegment ? (
            <div className="content-canvas-create-dialog__field">
              <Label htmlFor="content-prompt-canvas-quick-create-production">挂载制作</Label>
              <select
                id="content-prompt-canvas-quick-create-production"
                className="content-canvas-create-dialog__select"
                value={productionMode === 'existing' ? selectedProductionId : '__new__'}
                onChange={(event) => {
                  if (event.target.value === '__new__') {
                    setProductionMode('new')
                    setSegmentMode('new')
                    setSelectedProductionId('')
                    setSelectedSegmentId('')
                    return
                  }
                  const nextProductionId = event.target.value
                  const nextSegmentId = contentCanvasFirstSegmentIdForProduction(segments, nextProductionId, productions)
                  setProductionMode('existing')
                  setSelectedProductionId(nextProductionId)
                  setSegmentMode(nextSegmentId ? 'existing' : 'new')
                  setSelectedSegmentId(nextSegmentId)
                }}
              >
                {productions.map((production) => (
                  <option key={production.id} value={production.entityKey}>{production.title}</option>
                ))}
                <option value="__new__">新建制作</option>
              </select>
              {productionMode === 'new' ? (
                <div className="content-canvas-create-dialog__grid">
                  <Input
                    value={newProductionId}
                    placeholder={`${id || 'node'}_production`}
                    onChange={(event) => setNewProductionId(event.target.value)}
                  />
                  <Input
                    value={newProductionTitle}
                    placeholder={`${title || '节点'} 制作`}
                    onChange={(event) => setNewProductionTitle(event.target.value)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          {needsProductionSegment ? (
            <div className="content-canvas-create-dialog__field">
              <Label htmlFor="content-prompt-canvas-quick-create-segment">挂载段落</Label>
              <select
                id="content-prompt-canvas-quick-create-segment"
                className="content-canvas-create-dialog__select"
                value={segmentMode === 'existing' ? selectedSegmentId : '__new__'}
                onChange={(event) => {
                  if (event.target.value === '__new__') {
                    setSegmentMode('new')
                    setSelectedSegmentId('')
                    return
                  }
                  setSegmentMode('existing')
                  setSelectedSegmentId(event.target.value)
                }}
                disabled={productionMode === 'new'}
              >
                {segmentsForProduction.map((segment) => (
                  <option key={segment.id} value={segment.entityKey}>{segment.title}</option>
                ))}
                <option value="__new__">新建段落</option>
              </select>
              {segmentMode === 'new' || productionMode === 'new' ? (
                <div className="content-canvas-create-dialog__grid">
                  <Input
                    value={newSegmentId}
                    placeholder={`${id || 'node'}_segment`}
                    onChange={(event) => setNewSegmentId(event.target.value)}
                  />
                  <Input
                    value={newSegmentTitle}
                    placeholder={`${title || '节点'} 段落`}
                    onChange={(event) => setNewSegmentTitle(event.target.value)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          {needsVisualOwner ? (
            <div className="content-canvas-create-dialog__field">
              <Label htmlFor="content-prompt-canvas-quick-create-visual-owner">挂载对象</Label>
              <select
                id="content-prompt-canvas-quick-create-visual-owner"
                className="content-canvas-create-dialog__select"
                value={selectedVisualOwnerId}
                onChange={(event) => setSelectedVisualOwnerId(event.target.value)}
                disabled={!visualOwners.length}
              >
                {visualOwners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.kind === 'scene_moment' ? '情节' : '表达'} · {owner.title}
                  </option>
                ))}
                {!visualOwners.length ? <option value="">暂无情节或表达</option> : null}
              </select>
            </div>
          ) : null}
          {needsMount ? (
            <div className="content-canvas-create-dialog__field">
              <Label htmlFor="content-prompt-canvas-quick-create-setting">挂载设定</Label>
              <select
                id="content-prompt-canvas-quick-create-setting"
                className="content-canvas-create-dialog__select"
                value={settingMode === 'existing' ? selectedSettingId : '__new__'}
                onChange={(event) => {
                  if (event.target.value === '__new__') {
                    setSettingMode('new')
                    setStateMode('new')
                    return
                  }
                  setSettingMode('existing')
                  setSelectedSettingId(event.target.value)
                }}
              >
                {settings.map((setting) => (
                  <option key={setting.id} value={setting.entityKey}>{setting.title}</option>
                ))}
                <option value="__new__">新建设定</option>
              </select>
              {settingMode === 'new' ? (
                <div className="content-canvas-create-dialog__grid">
                  <Input
                    value={newSettingId}
                    placeholder={`${id || 'node'}_setting`}
                    onChange={(event) => setNewSettingId(event.target.value)}
                  />
                  <Input
                    value={newSettingTitle}
                    placeholder={`${title || '节点'} 设定`}
                    onChange={(event) => setNewSettingTitle(event.target.value)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          {needsMount ? (
            <div className="content-canvas-create-dialog__field">
              <Label htmlFor="content-prompt-canvas-quick-create-state">挂载状态</Label>
              <select
                id="content-prompt-canvas-quick-create-state"
                className="content-canvas-create-dialog__select"
                value={stateMode === 'existing' ? selectedStateId : '__new__'}
                onChange={(event) => {
                  if (event.target.value === '__new__') {
                    setStateMode('new')
                    return
                  }
                  setStateMode('existing')
                  setSelectedStateId(event.target.value)
                }}
                disabled={settingMode === 'new'}
              >
                {statesForSetting.map((stateNode) => (
                  <option key={stateNode.id} value={stateNode.entityKey}>{stateNode.title}</option>
                ))}
                <option value="__new__">新建状态</option>
              </select>
              {stateMode === 'new' || settingMode === 'new' ? (
                <div className="content-canvas-create-dialog__grid">
                  <Input
                    value={newStateId}
                    placeholder={`${id || 'node'}_state`}
                    onChange={(event) => setNewStateId(event.target.value)}
                  />
                  <Input
                    value={newStateTitle}
                    placeholder={`${title || '节点'} 状态`}
                    onChange={(event) => setNewStateTitle(event.target.value)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter className="content-canvas-create-dialog__footer">
            <button type="button" className="content-canvas-create-dialog__button" onClick={resetAndClose}>
              取消
            </button>
            <button type="submit" className="content-canvas-create-dialog__button content-canvas-create-dialog__button--primary" disabled={!canSubmit}>
              <Plus size={13} aria-hidden="true" />
              创建
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ContentPromptFlowNodeGenerationPanel({
  node,
  onSubmit,
}: {
  node: ContentCanvasNode
  onSubmit: (options: ContentCanvasCandidateGenerationOptions) => void
}) {
  const mediaKind = mediaKindForNode(node)
  const capability = mediaKind === 'video' ? 'video' : mediaKind === 'image' ? 'image' : null
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<PublicModel | null>(null)
  const [params, setParams] = useState<Record<string, string | number | boolean>>({})
  const supportedParams = selectedModel?.supported_params ?? []

  useEffect(() => {
    if (!selectedModel) {
      setParams({})
      return
    }
    setParams(generationParamDefaults(selectedModel))
  }, [selectedModel?.model_def_id, selectedModel?.model_id])

  if (!capability) return null

  return (
    <form
      className="content-prompt-flow-node__generation nodrag"
      onClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault()
        if (!selectedModelId) return
        onSubmit({
          modelId: selectedModelId,
          params,
          supportedParams,
        })
      }}
    >
      <header className="content-prompt-flow-node__generation-header">
        <span>
          <Sparkles size={12} aria-hidden="true" />
          生成候选
        </span>
        <small>{mediaKindLabel(mediaKind)}</small>
      </header>
      <div className="content-prompt-flow-node__generation-controls">
        <label>
          <span>模型</span>
          <ContentCanvasModelSelector
            capability={capability}
            className="content-prompt-flow-node__generation-model"
            value={selectedModelId}
            onChange={setSelectedModelId}
            onModelChange={setSelectedModel}
          />
        </label>
        {supportedParams.length ? (
          <ContentCanvasGenerationParamControls
            params={supportedParams}
            values={params}
            onChange={(key, value) => setParams((current) => ({ ...current, [key]: value }))}
            className="content-prompt-flow-node__generation-params"
          />
        ) : (
          <small>使用模型默认参数</small>
        )}
        <button type="submit" disabled={!selectedModelId}>
          <Sparkles size={11} aria-hidden="true" />
          生成
        </button>
      </div>
    </form>
  )
}

function ContentPromptFlowNodeCurrentState({
  compact,
  mediaKind,
  node,
  preview,
  onOpen,
}: {
  compact?: boolean
  mediaKind: ReturnType<typeof mediaKindForNode>
  node: ContentCanvasNode
  preview?: CreativeFlowNodeCandidatePreview
  onOpen: () => void
}) {
  const previewKind = preview ? candidatePreviewMediaKind(preview) : mediaKindForCurrentState(mediaKind)
  const canPreview = preview?.resourceId !== undefined && previewKind !== 'file'
  const Icon = iconForContentNode(node)
  return (
    <button
      type="button"
      className="content-prompt-flow-node__current nodrag"
      data-compact={compact ? 'true' : undefined}
      data-has-media={canPreview ? 'true' : undefined}
      data-media-kind={previewKind}
      onClick={(event) => {
        event.stopPropagation()
        if (canPreview) onOpen()
      }}
      disabled={!canPreview}
      aria-label={preview?.title ?? node.title}
    >
      {preview?.resourceId !== undefined && previewKind === 'image' ? (
        <ResourceFileImage resourceId={preview.resourceId} alt={preview.title || preview.id} loading="lazy" thumbnailMaxSize={compact ? 256 : 384} />
      ) : null}
      {preview?.resourceId !== undefined && previewKind === 'video' ? (
        <ResourceFileVideo resourceId={preview.resourceId} muted playsInline preload="metadata" />
      ) : null}
      {!canPreview ? (
        <span>
          <Icon size={compact ? 24 : 30} aria-hidden="true" />
          <strong>{mediaKindLabel(mediaKind)}</strong>
        </span>
      ) : null}
      <em>{preview?.selected ? '已选择' : preview ? preview.status : '待生成'}</em>
    </button>
  )
}

function ContentPromptFlowNodeCandidatePreview({
  preview,
  variant,
  canReference,
  sourceNode,
  onOpen,
  onReference,
}: {
  preview: CreativeFlowNodeCandidatePreview
  variant: 'candidate' | 'resource'
  canReference: boolean
  sourceNode: ContentCanvasNode
  onOpen: () => void
  onReference: () => void
}) {
  const mediaKind = candidatePreviewMediaKind(preview)
  const canPreview = preview.resourceId !== undefined && mediaKind !== 'file'
  const referenceButton = canReference ? (
    <button
      type="button"
      className="content-prompt-flow-node__candidate-reference"
      onClick={(event) => {
        event.stopPropagation()
        onReference()
      }}
      aria-label={`引用 ${preview.title || preview.id} 到当前提示词`}
      title="引用到当前提示词"
    >
      <Link2 size={12} aria-hidden="true" />
    </button>
  ) : null
  return (
    <div
      className="content-prompt-flow-node__candidate nodrag"
      data-has-media={canPreview ? 'true' : undefined}
      data-media-kind={mediaKind}
      data-preview-kind={variant}
      draggable
      onDragStart={(event) => {
        event.stopPropagation()
        event.dataTransfer.effectAllowed = 'copy'
        event.dataTransfer.setData(CONTENT_PROMPT_REFERENCE_DRAG_MIME, sourceNode.id)
        event.dataTransfer.setData('text/plain', sourceNode.title || preview.title || preview.id)
      }}
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
            onClick={(event) => {
              event.stopPropagation()
              onOpen()
            }}
            aria-label={`查看候选 ${preview.title || preview.id}`}
          >
            <Search size={14} aria-hidden="true" />
          </button>
          {referenceButton}
        </span>
      ) : referenceButton}
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
    && previous.data.referenceTargetNodeId === next.data.referenceTargetNodeId
    && previous.data.candidateSelections === next.data.candidateSelections
    && previous.data.candidateBadge === next.data.candidateBadge
    && creativeFlowNodeCandidatePreviewsKey(previous.data.candidatePreviews) === creativeFlowNodeCandidatePreviewsKey(next.data.candidatePreviews)
    && previous.data.onContextMenu === next.data.onContextMenu
    && previous.data.onCandidatePreviewOpen === next.data.onCandidatePreviewOpen
    && previous.data.onGenerateWithOptions === next.data.onGenerateWithOptions
    && previous.data.onReferenceToActivePrompt === next.data.onReferenceToActivePrompt
    && previous.data.onReferenceDrop === next.data.onReferenceDrop
    && previous.data.onResourceDrop === next.data.onResourceDrop
    && previous.data.onPromptCommit === next.data.onPromptCommit
    && previous.data.onPromptDraftChange === next.data.onPromptDraftChange
    && previous.data.onStructuredPromptCommit === next.data.onStructuredPromptCommit
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

function structuredPromptFromNode(node: ContentCanvasNode | undefined): Record<string, unknown> | undefined {
  const editPrompt = node?.record.edit_prompt ?? node?.record.editPrompt
  if (!editPrompt || typeof editPrompt !== 'object' || Array.isArray(editPrompt)) return undefined
  const structured = (editPrompt as Record<string, unknown>).structured
  return structured && typeof structured === 'object' && !Array.isArray(structured)
    ? structured as Record<string, unknown>
    : undefined
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

function currentCandidatePreview(previews: CreativeFlowNodeCandidatePreview[]): CreativeFlowNodeCandidatePreview | undefined {
  return previews.find((preview) => preview.selected) ?? previews[0]
}

function candidatePreviewMediaKind(preview: CreativeFlowNodeCandidatePreview): 'image' | 'video' | 'file' {
  const resourceKind = `${preview.resourceKind ?? ''}`.toLowerCase()
  if (resourceKind.includes('video') || resourceKind.includes('movie') || resourceKind.includes('mp4')) return 'video'
  if (resourceKind.includes('image') || resourceKind.includes('board') || resourceKind.includes('keyframe') || resourceKind.includes('png') || resourceKind.includes('jpg') || resourceKind.includes('jpeg')) return 'image'
  return 'file'
}

function mediaKindForCurrentState(kind: ReturnType<typeof mediaKindForNode>): 'image' | 'video' | 'file' {
  if (kind === 'video' || kind === 'scene') return 'video'
  if (kind === 'image' || kind === 'board' || kind === 'keyframe') return 'image'
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

function contentCanvasUploadedResourceFromDropEvent(event: ReactDragEvent): ContentCanvasUploadedResource | null {
  const payload = readResourceDragPayload<DragResourcePayloadResource>(event.dataTransfer)
  if (!payload) return null
  const resource = payload.resource
  const mimeType = stringRecordField(resource?.mime_type) ?? stringRecordField(resource?.mimeType)
  return {
    id: payload.resourceId,
    name: stringRecordField(resource?.name) ?? `Resource ${payload.resourceId}`,
    type: contentCanvasUploadedResourceType(resource?.type),
    ...(mimeType ? { mimeType } : {}),
  }
}

function contentCanvasUploadedResourceType(value: unknown): ContentCanvasUploadedResource['type'] {
  if (value === 'image' || value === 'video' || value === 'audio' || value === 'text' || value === 'file') return value
  return 'file'
}

function flowPositionsByNodeId(nodes: Node<CreativeFlowNodeData>[]): Record<string, { x: number; y: number }> {
  return Object.fromEntries(nodes.map((node) => [node.id, node.position]))
}

function isCreativePromptEditableNode(node: CreativeCanvasNode): boolean {
  return node.canGenerate && node.role !== 'resource'
}

function contentCanvasNodeLibraryNodes(nodes: ContentCanvasNode[], query: string): ContentCanvasNode[] {
  const needle = query.trim().toLowerCase()
  return nodes
    .filter(contentCanvasNodeCanJoinFreeCanvas)
    .filter((node) => {
      if (!needle) return true
      return [
        node.id,
        node.entityKey,
        node.kind,
        node.title,
        node.subtitle,
        node.summary,
      ].join(' ').toLowerCase().includes(needle)
    })
    .sort((left, right) => (
      contentCanvasNodeLibraryRank(left) - contentCanvasNodeLibraryRank(right)
      || left.title.localeCompare(right.title, 'zh-CN')
    ))
}

function contentCanvasNodeCanJoinFreeCanvas(node: ContentCanvasNode): boolean {
  if (node.kind === 'content_unit') return contentCanvasNodeIsNakedGenerationTask(node)
  return node.kind !== 'production'
    && node.kind !== 'segment'
    && node.kind !== 'setting'
    && node.kind !== 'state'
    && node.kind !== 'selection'
    && node.kind !== 'candidate'
    && node.kind !== 'actor'
    && node.kind !== 'work_item'
    && node.kind !== 'group'
}

function contentCanvasNodeIsNakedGenerationTask(node: ContentCanvasNode): boolean {
  return node.kind === 'content_unit'
    && String(node.record.model_intent && typeof node.record.model_intent === 'object' && !Array.isArray(node.record.model_intent)
      ? (node.record.model_intent as Record<string, unknown>).source
      : '').trim() === 'content_canvas_naked_task'
}

function contentCanvasNodeLibraryRank(node: ContentCanvasNode): number {
  if (node.kind === 'content_unit') return 0
  if (node.kind === 'scene_moment') return 0
  if (node.kind === 'expression_unit') return 1
  if (node.kind === 'keyframe' || node.kind === 'storyboard') return 2
  if (node.kind === 'resource') return 4
  if (node.kind === 'setting' || node.kind === 'state' || node.kind === 'asset') return 5
  return 9
}

function contentCanvasNodeLibraryLabel(node: ContentCanvasNode): string {
  const display = creativeFlowNodeDisplay(node, creativeCanvasNodeRoleForLibrary(node))
  return `${display.badge} · ${display.subtitle}`
}

function creativeCanvasNodeRoleForLibrary(node: ContentCanvasNode): CreativeCanvasNode['role'] {
  if (node.kind === 'project' || node.kind === 'production' || node.kind === 'segment') return 'structure'
  if (node.kind === 'content_unit') return 'generation'
  if (node.kind === 'candidate') return 'candidate'
  if (node.kind === 'resource') return 'resource'
  if (node.kind === 'work_item') return 'issue'
  return 'creative'
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

function creativeCanvasQuickAddOptionsForPosition({
  flowNodes,
  focusedNodeId,
  nodeById,
  position,
}: {
  flowNodes: Node<CreativeFlowNodeData>[]
  focusedNodeId?: string | null
  nodeById: Map<string, ContentCanvasNode>
  position: ContentCanvasNodePosition
}): { inferredParent?: ContentCanvasNode; groups: CreativeCanvasQuickAddGroup[] } {
  const inferredParent = inferredCreativeCanvasQuickAddParent({
    flowNodes,
    focusedNodeId,
    nodeById,
    position,
  })
  const childOptionsByKind = creativeCanvasQuickAddChildOptionsByKind(inferredParent)
  const imageAssetOption = childOptionsByKind.get('asset') ?? directQuickAddOption('asset_image', '资产')
  const sceneMomentOption = childOptionsByKind.get('scene_moment') ?? directQuickAddOption('scene_moment', '情节')
  return {
    inferredParent,
    groups: [
      {
        mediaKind: 'image',
        label: '图片',
        primaryOption: directQuickAddOption('task_image', '图片'),
        semanticOptions: compactQuickAddOptions([
          imageAssetOption,
          childOptionsByKind.get('keyframe') ?? directQuickAddOption('keyframe', '关键帧'),
          childOptionsByKind.get('storyboard') ?? directQuickAddOption('storyboard', '故事板'),
        ]),
      },
      {
        mediaKind: 'video',
        label: '视频',
        primaryOption: directQuickAddOption('task_video', '视频'),
        semanticOptions: [
          sceneMomentOption,
          directQuickAddOption('asset_video', '资产'),
        ],
      },
      {
        mediaKind: 'audio',
        label: '音频',
        primaryOption: directQuickAddOption('task_audio', '音频'),
        semanticOptions: [
          directQuickAddOption('asset_audio', '资产'),
        ],
      },
      {
        mediaKind: 'text',
        label: '文本',
        primaryOption: directQuickAddOption('task_text', '文本'),
        semanticOptions: compactQuickAddOptions([
          childOptionsByKind.get('expression_unit'),
        ]),
      },
    ],
  }
}

function creativeCanvasQuickAddChildOptionsByKind(
  inferredParent: ContentCanvasNode | undefined,
): Map<CreativeCanvasChildKind, CreativeCanvasQuickAddOption> {
  const options = new Map<CreativeCanvasChildKind, CreativeCanvasQuickAddOption>()
  if (!inferredParent) return options
  for (const action of creativeCanvasActionsForNode(inferredParent)) {
    if (action.kind !== 'create_child') continue
    options.set(action.childKind, {
      kind: 'child',
      childKind: action.childKind,
      label: creativeCanvasQuickAddChildLabel(action.childKind),
      parentNode: inferredParent,
    })
  }
  return options
}

function directQuickAddOption(
  nodeKind: CreativeCanvasDirectKind,
  label: string,
): CreativeCanvasQuickAddOption {
  return { kind: 'direct', nodeKind, label }
}

function compactQuickAddOptions(
  options: Array<CreativeCanvasQuickAddOption | undefined>,
): CreativeCanvasQuickAddOption[] {
  return options.filter((option): option is CreativeCanvasQuickAddOption => Boolean(option))
}

function inferredCreativeCanvasQuickAddParent({
  flowNodes,
  focusedNodeId,
  nodeById,
  position,
}: {
  flowNodes: Node<CreativeFlowNodeData>[]
  focusedNodeId?: string | null
  nodeById: Map<string, ContentCanvasNode>
  position: ContentCanvasNodePosition
}): ContentCanvasNode | undefined {
  const selectedNode = flowNodes.find((node) => node.selected)
  const selectedSource = selectedNode ? nodeById.get(selectedNode.id) : undefined
  if (contentCanvasNodeCanCreateChild(selectedSource)) return selectedSource
  const focusedSource = focusedNodeId ? nodeById.get(focusedNodeId) : undefined
  if (contentCanvasNodeCanCreateChild(focusedSource)) return focusedSource
  return [...flowNodes]
    .filter((node) => contentCanvasNodeCanCreateChild(nodeById.get(node.id)))
    .sort((left, right) => (
      creativeCanvasFlowNodeDistanceToPosition(left, position) - creativeCanvasFlowNodeDistanceToPosition(right, position)
    ))[0]
    ?.data.item.source
}

function contentCanvasNodeCanCreateChild(node: ContentCanvasNode | undefined): node is ContentCanvasNode {
  return Boolean(creativeCanvasActionsForNode(node).some((action) => action.kind === 'create_child'))
}

function creativeCanvasResourceTargetForPosition({
  flowNodes,
  focusedNodeId,
  nodeById,
  position,
}: {
  flowNodes: Node<CreativeFlowNodeData>[]
  focusedNodeId?: string | null
  nodeById: Map<string, ContentCanvasNode>
  position: ContentCanvasNodePosition
}): ContentCanvasNode | undefined {
  const selectedNode = flowNodes.find((node) => node.selected)
  const selectedSource = selectedNode ? nodeById.get(selectedNode.id) : undefined
  if (contentCanvasNodeCanReceiveResourceCandidate(selectedSource)) return selectedSource
  const focusedSource = focusedNodeId ? nodeById.get(focusedNodeId) : undefined
  if (contentCanvasNodeCanReceiveResourceCandidate(focusedSource)) return focusedSource
  return [...flowNodes]
    .filter((node) => contentCanvasNodeCanReceiveResourceCandidate(nodeById.get(node.id)))
    .sort((left, right) => (
      creativeCanvasFlowNodeDistanceToPosition(left, position) - creativeCanvasFlowNodeDistanceToPosition(right, position)
    ))[0]
    ?.data.item.source
}

function contentCanvasNodeCanReceiveResourceCandidate(node: ContentCanvasNode | undefined): node is ContentCanvasNode {
  return Boolean(contentCanvasGenerationTargetForNode(node))
}

function creativeCanvasFlowNodeDistanceToPosition(
  node: Node<CreativeFlowNodeData>,
  position: ContentCanvasNodePosition,
): number {
  const size = creativeCanvasNodeViewportSize(node.data.item)
  const centerX = node.position.x + size.width / 2
  const centerY = node.position.y + size.height / 2
  return (centerX - position.x) ** 2 + (centerY - position.y) ** 2
}

function creativeCanvasQuickAddChildLabel(childKind: CreativeCanvasChildKind): string {
  if (childKind === 'segment') return '段落'
  if (childKind === 'scene_moment') return '情节'
  if (childKind === 'expression_unit') return '表达'
  if (childKind === 'keyframe') return '关键帧'
  if (childKind === 'storyboard') return '故事板'
  if (childKind === 'asset') return '资产'
  if (childKind === 'state') return '状态'
  return '节点'
}

function quickAddMediaIcon(mediaKind: CreativeCanvasQuickAddMediaKind) {
  if (mediaKind === 'video') return <Video size={14} aria-hidden="true" />
  if (mediaKind === 'audio') return <Music size={14} aria-hidden="true" />
  if (mediaKind === 'text') return <FileText size={14} aria-hidden="true" />
  return <ImageIcon size={14} aria-hidden="true" />
}

function quickAddOptionKey(option: CreativeCanvasQuickAddOption): string {
  if (option.kind === 'direct') return `direct:${option.nodeKind}`
  return `child:${option.parentNode.id}:${option.childKind}`
}

function quickCreateDialogCopy(state: CreativeCanvasQuickCreateDialogState | null): {
  title: string
  idPlaceholder: string
  titlePlaceholder: string
} {
  const option = state?.option
  if (!option) {
    return {
      title: '创建节点',
      idPlaceholder: 'node_001',
      titlePlaceholder: '节点标题',
    }
  }
  if (option.kind === 'direct') {
    if (option.nodeKind === 'task_video') {
      return {
        title: '创建视频任务',
        idPlaceholder: 'video_task_001',
        titlePlaceholder: '视频任务标题',
      }
    }
    if (option.nodeKind === 'task_image') {
      return {
        title: '创建图片任务',
        idPlaceholder: 'image_task_001',
        titlePlaceholder: '图片任务标题',
      }
    }
    if (option.nodeKind === 'task_text') {
      return {
        title: '创建文本任务',
        idPlaceholder: 'text_task_001',
        titlePlaceholder: '文本任务标题',
      }
    }
    if (option.nodeKind === 'task_audio') {
      return {
        title: '创建音频任务',
        idPlaceholder: 'audio_task_001',
        titlePlaceholder: '音频任务标题',
      }
    }
    if (option.nodeKind === 'scene_moment') {
      return {
        title: '创建情节视频节点',
        idPlaceholder: 'scene_001',
        titlePlaceholder: '情节标题',
      }
    }
    if (option.nodeKind === 'keyframe') {
      return {
        title: '创建关键帧',
        idPlaceholder: 'keyframe_001',
        titlePlaceholder: '关键帧标题',
      }
    }
    if (option.nodeKind === 'storyboard') {
      return {
        title: '创建故事板',
        idPlaceholder: 'storyboard_001',
        titlePlaceholder: '故事板标题',
      }
    }
    if (option.nodeKind === 'asset_video') {
      return {
        title: '创建资产视频节点',
        idPlaceholder: 'asset_video_001',
        titlePlaceholder: '资产视频标题',
      }
    }
    if (option.nodeKind === 'asset_audio') {
      return {
        title: '创建资产音频节点',
        idPlaceholder: 'asset_audio_001',
        titlePlaceholder: '资产音频标题',
      }
    }
    return {
      title: '创建资产图片节点',
      idPlaceholder: 'asset_001',
      titlePlaceholder: '资产图片标题',
    }
  }
  const parentTitle = option.parentNode.title
  if (option.childKind === 'segment') {
    return {
      title: `创建段落节点 · ${parentTitle}`,
      idPlaceholder: 'segment_001',
      titlePlaceholder: '段落标题',
    }
  }
  if (option.childKind === 'scene_moment') {
    return {
      title: `创建视频节点 · ${parentTitle}`,
      idPlaceholder: 'scene_001',
      titlePlaceholder: '情节标题',
    }
  }
  if (option.childKind === 'expression_unit') {
    return {
      title: `创建表达节点 · ${parentTitle}`,
      idPlaceholder: 'expression_001',
      titlePlaceholder: '表达标题',
    }
  }
  if (option.childKind === 'keyframe') {
    return {
      title: `创建图片节点 · ${parentTitle}`,
      idPlaceholder: 'keyframe_001',
      titlePlaceholder: '关键帧标题',
    }
  }
  if (option.childKind === 'storyboard') {
    return {
      title: `创建图片节点 · ${parentTitle}`,
      idPlaceholder: 'storyboard_001',
      titlePlaceholder: '故事版标题',
    }
  }
  if (option.childKind === 'asset') {
    return {
      title: `创建图片节点 · ${parentTitle}`,
      idPlaceholder: 'asset_001',
      titlePlaceholder: '资产标题',
    }
  }
  return {
    title: `创建状态节点 · ${parentTitle}`,
    idPlaceholder: 'state_001',
    titlePlaceholder: '状态标题',
  }
}

function quickCreateDialogNeedsProductionSegment(state: CreativeCanvasQuickCreateDialogState | null): boolean {
  return state?.option.kind === 'direct' && state.option.nodeKind === 'scene_moment'
}

function quickCreateDialogNeedsSettingStateMount(state: CreativeCanvasQuickCreateDialogState | null): boolean {
  return state?.option.kind === 'direct'
    && (state.option.nodeKind === 'scene_moment'
      || state.option.nodeKind === 'asset_image'
      || state.option.nodeKind === 'asset_video'
      || state.option.nodeKind === 'asset_audio')
}

function quickCreateDialogNeedsVisualOwner(state: CreativeCanvasQuickCreateDialogState | null): boolean {
  return state?.option.kind === 'direct'
    && (state.option.nodeKind === 'keyframe' || state.option.nodeKind === 'storyboard')
}

function quickCreateProductionInput(input: {
  id: string
  needsProductionSegment: boolean
  newProductionId: string
  newProductionTitle: string
  newSegmentId: string
  newSegmentTitle: string
  productionMode: 'existing' | 'new'
  segmentMode: 'existing' | 'new'
  selectedProductionId: string
  selectedSegmentId: string
  title: string
}): Partial<ContentCanvasCreateNodeInput> {
  if (!input.needsProductionSegment) return {}
  const createTargetProduction = input.productionMode === 'new'
  const createTargetSegment = createTargetProduction || input.segmentMode === 'new'
  return {
    createTargetProduction,
    createTargetSegment,
    targetProductionId: createTargetProduction
      ? input.newProductionId.trim() || `${input.id}_production`
      : input.selectedProductionId,
    targetProductionTitle: createTargetProduction
      ? input.newProductionTitle.trim() || `${input.title} 制作`
      : undefined,
    targetSegmentId: createTargetSegment
      ? input.newSegmentId.trim() || `${input.id}_segment`
      : input.selectedSegmentId,
    targetSegmentTitle: createTargetSegment
      ? input.newSegmentTitle.trim() || `${input.title} 段落`
      : undefined,
  }
}

function quickCreateMountInput(input: {
  id: string
  needsMount: boolean
  newSettingId: string
  newSettingTitle: string
  newStateId: string
  newStateTitle: string
  selectedSettingId: string
  selectedStateId: string
  settingMode: 'existing' | 'new'
  stateMode: 'existing' | 'new'
  title: string
}): Partial<ContentCanvasCreateNodeInput> {
  if (!input.needsMount) return {}
  const createTargetSetting = input.settingMode === 'new'
  const createTargetState = createTargetSetting || input.stateMode === 'new'
  return {
    createTargetSetting,
    createTargetState,
    targetSettingId: createTargetSetting
      ? input.newSettingId.trim() || `${input.id}_setting`
      : input.selectedSettingId,
    targetSettingTitle: createTargetSetting
      ? input.newSettingTitle.trim() || `${input.title} 设定`
      : undefined,
    targetSettingKind: 'other',
    targetStateId: createTargetState
      ? input.newStateId.trim() || `${input.id}_state`
      : input.selectedStateId,
    targetStateTitle: createTargetState
      ? input.newStateTitle.trim() || `${input.title} 状态`
      : undefined,
  }
}

function stateNodeBelongsToSetting(node: ContentCanvasNode, settingId: string): boolean {
  return stringRecordField(node.record.setting_id)
    === settingId
    || stringRecordField(node.record.settingId) === settingId
    || stringRecordField(node.record.setting_ref) === settingId
    || node.sourcePath.includes(`/settings/${settingId}/`)
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
