import { memo, useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type FormEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
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
import { ChevronLeft, ChevronRight, Clock3, FileText, FolderOpen, GitBranch, Image as ImageIcon, Info, Link2, LocateFixed, Move, Music, Pencil, Plus, RotateCcw, Save, Search, Sparkles, Star, Trash2, Video, X, type LucideIcon } from 'lucide-react'

import { generationParamDefaults, type GenerationIntentPayload } from '@movscript/core/generation'
import { allocateMovScriptEntityId } from '@movscript/domain'
import { readResourceDragPayload, resourceDropAcceptsPayload } from '@movscript/resource-surface/resource-interaction'
import { ResourceFileImage, ResourceFileVideo } from '@movscript/resource-surface/resource-media-components'
import type { PublicModel } from '@movscript/shared'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@movscript/ui/primitives'

import {
  contentCanvasNodeDisplayKind,
} from '../domain/contentCanvasDomainPolicy'
import {
  creativeCanvasActionsForNode,
  type CreativeCanvasAction,
} from '../application/contentCreativeCanvasActions'
import {
  buildCreativeCanvasGraph,
  creativeNodeFromContentNode,
  isCreativeCanvasVisibleNode,
  type CreativeCanvasNode,
} from '../application/contentCreativeCanvasModel'
import {
  layoutCreativeCanvas,
} from '../application/contentCreativeCanvasLayout'
import {
  contentCanvasDocumentTitleValidationMessage,
  contentCanvasDocumentScope,
  normalizeContentCanvasDocumentTitle,
  type ContentCanvasDocument,
  type ContentCanvasDocumentScope,
} from '../application/contentCanvasDocuments'
import type { ContentCanvasCreateNodeInput } from '../application/contentCanvasCommands'
import type { ContentCanvasUploadedResource } from '../application/contentCanvasWorkspaceGateway'
import type { ContentCanvasCandidate, ContentCanvasEdge, ContentCanvasNode, ContentCanvasNodeKind } from '../domain/contentCanvasTypes'
import {
  type ContentCanvasCandidateGenerationOptions,
  type ContentCanvasCandidatePromptPreview,
} from './ContentCanvasInspectorParts'
import { ContentCanvasGenerationParamControls } from './ContentCanvasGenerationParamControls'
import { ContentCanvasModelSelector } from './ContentCanvasModelSelector'
import { ContentCanvasPromptEditor } from './ContentCanvasPromptEditor'
import { ContentCanvasResourceCandidatePicker } from './ContentCanvasResourceCandidatePicker'
import {
  contentCanvasNodeBelongsToProductionScope,
  contentCanvasFirstSegmentIdForProduction,
  contentCanvasSegmentsForProduction,
} from './contentPromptCanvasQuickCreateModel'
import { contentCanvasGenerationTargetForNode } from './contentCanvasWorkspaceGenerationModel'
import {
  appendContentNodeReferenceToPrompt,
  candidateDecisionForNode,
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
import {
  contentCanvasChildSettingNamespaceKind,
  contentCanvasChildTimelineNamespaceKind,
  contentCanvasRootSettingNamespaceKind,
  type ContentCanvasNamespaceVocabularyOptions,
} from './contentCanvasNamespaceVocabularyModel'

type CreativeFlowNodeData = {
  item: CreativeCanvasNode
  focused: boolean
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
  onCandidateRemove: (node: ContentCanvasNode, candidate: ContentCanvasCandidate) => void
  onCandidateSelect: (node: ContentCanvasNode, candidate: ContentCanvasCandidate) => void
  onGenerateWithOptions: (node: ContentCanvasNode, options?: Partial<ContentCanvasCandidateGenerationOptions>) => void
  onReferenceToActivePrompt: (node: ContentCanvasNode) => void
  onReferenceDrop: (targetNode: ContentCanvasNode, sourceNodeId: string) => void
  onResourceDrop: (targetNode: ContentCanvasNode, resource: ContentCanvasUploadedResource, position?: ContentCanvasNodePosition) => void
  onCanvasDeselect: () => void
  onSelectNode: (kind: InspectorSelection['kind'], nodeId: string) => void
}

type CreativeFlowNodeCandidatePreview = {
  key: string
  id: string
  title: string
  status: string
  statusTone: 'ready' | 'running' | 'failed' | 'imported' | 'neutral'
  resourceId?: number
  resourceKind?: string
  candidate?: ContentCanvasCandidate
  failureReason?: string
  selected?: boolean
  selectable?: boolean
  retryable?: boolean
  removable?: boolean
  candidateCount?: number
}

type CreativeFlowCandidatePreviewDialogState = {
  preview: CreativeFlowNodeCandidatePreview
  sourceNode: ContentCanvasNode
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

type ContentCanvasNameDialogState =
  | { mode: 'create'; initialTitle: string }
  | { mode: 'rename'; canvasId: string; initialTitle: string }

type CreateReferenceMode = 'existing' | 'new'

type QuickCreatePlanItem = {
  label: string
  value: string
  tone?: 'context' | 'create' | 'use'
}

type ContentCanvasCreateSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

type DragResourcePayloadResource = {
  ID: number
  name?: string
  type?: string
  mime_type?: string
  mimeType?: string
}

type ContentPromptCanvasNodeDragPayload = {
  nodeId: string
}

const CREATIVE_CANVAS_MINIMAP_NODE_LIMIT = 120
const CONTENT_PROMPT_ASSET_LIBRARY_PAGE_SIZE = 9
const CONTENT_PROMPT_NODE_CANDIDATE_PAGE_SIZE = 3
const CONTENT_PROMPT_REFERENCE_DRAG_MIME = 'application/x-movscript-content-reference'
const CONTENT_PROMPT_CANVAS_NODE_DRAG_MIME = 'application/x-movscript-content-canvas-node'
const CONTENT_CANVAS_CREATE_SELECT_EMPTY_VALUE = '__empty__'

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
  namespaceVocabulary,
  savedViewport,
  savePending,
  hasUnsavedChanges,
  nodes,
  onAddNodeToCanvas,
  onCandidateCreate,
  onCandidatePromptPreview,
  onCandidateResourceSelect,
  onCandidateRemove,
  onCandidateSelect,
  onCandidateNodeSelect,
  onCandidateUpload,
  onCanvasDeselect,
  onClearManualPositions,
  onClearManualPositionsForNodes,
  onCreateAssembly,
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
  onRenameCanvas,
  onSaveCanvas,
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
  namespaceVocabulary: ContentCanvasNamespaceVocabularyOptions
  savedViewport?: Viewport
  savePending?: boolean
  hasUnsavedChanges?: boolean
  nodes: ContentCanvasNode[]
  onAddNodeToCanvas: (nodeId: string, position?: ContentCanvasNodePosition) => void
  onCandidateCreate: (node: ContentCanvasNode | undefined, options?: Partial<ContentCanvasCandidateGenerationOptions>) => void
  onCandidatePromptPreview: (node: ContentCanvasNode | undefined) => Promise<ContentCanvasCandidatePromptPreview>
  onCandidateResourceSelect: (node: ContentCanvasNode | undefined, resource: ContentCanvasUploadedResource, position?: ContentCanvasNodePosition) => void
  onCandidateRemove: (node: ContentCanvasNode | undefined, candidate: ContentCanvasCandidate) => void
  onCandidateSelect: (node: ContentCanvasNode | undefined, candidate: ContentCanvasCandidate) => void
  onCandidateNodeSelect: (node: ContentCanvasNode) => void
  onCandidateUpload: (node: ContentCanvasNode | undefined, file: File) => void
  onCanvasDeselect: () => void
  onClearManualPositions: () => void
  onClearManualPositionsForNodes: (nodeIds: string[]) => void
  onCreateAssembly: (node: ContentCanvasNode) => void
  onCreateChild: (node: ContentCanvasNode, childKind: CreativeCanvasChildKind, position?: ContentCanvasNodePosition, input?: ContentCanvasCreateNodeInput) => void
  onCreateCanvas: (title?: string) => void
  onCreateNode: (nodeKind: CreativeCanvasDirectKind, position: ContentCanvasNodePosition, input?: ContentCanvasCreateNodeInput) => void
  onDeleteNode: (node: ContentCanvasNode) => void
  onExpressionPromptChange: (nodeId: string, prompt: string) => void
  onNodePositionsCommit: (nodePositions: Record<string, { x: number; y: number }>) => void
  onViewportCommit: (viewport: Viewport) => void
  onPromptChange: (assetId: string, prompt: string) => void
  onPromptCommit: (node: ContentCanvasNode | undefined, prompt: string) => void
  onRemoveNodeFromCanvas: (nodeId: string) => void
  onRenameCanvas: (canvasId: string, title: string) => void
  onSaveCanvas: () => void
  onStructuredPromptCommit: (node: ContentCanvasNode | undefined, structured: Record<string, unknown>) => void
  onResourceOpen: (node: ContentCanvasNode) => void
  onSelectCanvas: (canvasId: string) => void
  onSelectNode: (kind: InspectorSelection['kind'], nodeId: string) => void
}) {
  void onCandidatePromptPreview
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
  const [canvasNameDialog, setCanvasNameDialog] = useState<ContentCanvasNameDialogState | null>(null)
  const [candidatePreviewDialog, setCandidatePreviewDialog] = useState<CreativeFlowCandidatePreviewDialogState | null>(null)
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false)
  const [assetLibraryPage, setAssetLibraryPage] = useState(1)
  const [nodeLibraryOpen, setNodeLibraryOpen] = useState(false)
  const [nodeLibraryQuery, setNodeLibraryQuery] = useState('')
  const [assetLibraryNotice, setAssetLibraryNotice] = useState<string | null>(null)
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<Node<CreativeFlowNodeData>, Edge> | null>(null)
  const consumedFocusRequestIdRef = useRef<number | null>(null)
  const focusFrameRef = useRef<number | null>(null)
  const suppressNextNodeClickRef = useRef(false)
  const panelRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    setManualPositions(persistedManualPositions ?? {})
  }, [persistedManualPositions])
  useEffect(() => () => {
    if (focusFrameRef.current !== null) window.cancelAnimationFrame(focusFrameRef.current)
  }, [])
  const activeCanvasScope = useMemo(
    () => contentCanvasDocumentScope(activeCanvasDocument),
    [activeCanvasDocument],
  )
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const canvasNodeIdSet = useMemo(() => new Set(canvasNodeIds), [canvasNodeIds])
  const nodeLibraryNodes = useMemo(
    () => contentCanvasNodeLibraryNodes(nodes, nodeLibraryQuery, activeCanvasScope),
    [activeCanvasScope, nodeLibraryQuery, nodes],
  )
  const assetLibraryNodes = useMemo(
    () => nodes
      .filter((node) => node.kind === 'asset')
      .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN')),
    [nodes],
  )
  const assetLibraryPageCount = Math.max(1, Math.ceil(assetLibraryNodes.length / CONTENT_PROMPT_ASSET_LIBRARY_PAGE_SIZE))
  const pagedAssetLibraryNodes = useMemo(
    () => assetLibraryNodes.slice(
      (assetLibraryPage - 1) * CONTENT_PROMPT_ASSET_LIBRARY_PAGE_SIZE,
      assetLibraryPage * CONTENT_PROMPT_ASSET_LIBRARY_PAGE_SIZE,
    ),
    [assetLibraryNodes, assetLibraryPage],
  )
  useEffect(() => {
    setAssetLibraryPage((current) => Math.min(Math.max(current, 1), assetLibraryPageCount))
  }, [assetLibraryPageCount])
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
  }, [activePromptReferenceTargetId, nodeById, promptByNodeId, updatePromptDraft])
  const appendReferenceToPromptTarget = useCallback((targetNode: ContentCanvasNode, sourceNodeId: string) => {
    if (targetNode.id === sourceNodeId) return
    const sourceNode = nodeById.get(sourceNodeId)
    if (!sourceNode) return
    const currentPrompt = promptByNodeId[targetNode.id] ?? ''
    const nextPrompt = appendContentNodeReferenceToPrompt(currentPrompt, sourceNode)
    updatePromptDraft(targetNode, nextPrompt)
  }, [nodeById, promptByNodeId, updatePromptDraft])
  const initialFlowNodes = useMemo<Node<CreativeFlowNodeData>[]>(() => creativeGraph.nodes.map((item) => ({
    id: item.id,
    type: 'contentPrompt',
    position: manualPositions[item.id] ?? item.position,
    selected: item.id === focusedNodeId,
    data: {
      item,
      focused: item.id === focusedNodeId,
      candidateSelections,
      candidateBadge: nodeCandidateBadge(item.source, candidateSelections) || '可生成',
      candidatePreviews: candidatePreviewsForNode(item.source, candidateSelections),
      nodes,
      prompt: promptByNodeId[item.id] ?? '',
      referenceTargetNodeId: activePromptReferenceTargetId,
      onContextMenu: openNodeContextMenu,
      onCandidatePreviewOpen: (preview) => setCandidatePreviewDialog({ preview, sourceNode: item.source }),
      onCandidateRemove: (node, candidate) => onCandidateRemove(node, candidate),
      onCandidateSelect: (node, candidate) => onCandidateSelect(node, candidate),
      onGenerateWithOptions: (node, options) => onCandidateCreate(node, options),
      onReferenceToActivePrompt: appendReferenceToActivePrompt,
      onReferenceDrop: appendReferenceToPromptTarget,
      onResourceDrop: createResourceCandidateFromDrop,
      onCanvasDeselect,
      onPromptCommit: commitPromptFromNode,
      onPromptDraftChange: updatePromptDraft,
      onStructuredPromptCommit,
      onSelectNode,
    },
  })), [activePromptReferenceTargetId, appendReferenceToActivePrompt, appendReferenceToPromptTarget, candidateSelections, commitPromptFromNode, createResourceCandidateFromDrop, creativeGraph.nodes, focusedNodeId, manualPositions, nodes, onCanvasDeselect, onCandidateCreate, onCandidateRemove, onCandidateSelect, onSelectNode, onStructuredPromptCommit, openNodeContextMenu, promptByNodeId, updatePromptDraft])
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

  const selectPromptCanvasNode = useCallback((nodeId: string) => {
    const sourceNode = nodeById.get(nodeId)
    if (!sourceNode) return
    setQuickAddMenu(null)
    onSelectNode(selectionKindForPromptNode(sourceNode), sourceNode.id)
  }, [nodeById, onSelectNode])

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

  const flowPositionForClientPoint = useCallback((clientX: number, clientY: number): ContentCanvasNodePosition => (
    flowInstance?.screenToFlowPosition({ x: clientX, y: clientY }) ?? { x: 0, y: 0 }
  ), [flowInstance])

  const positionForCanvasLibraryInsert = useCallback((): ContentCanvasNodePosition => {
    const bounds = panelRef.current?.getBoundingClientRect()
    const clientX = bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2
    const clientY = bounds ? bounds.top + bounds.height / 2 : window.innerHeight / 2
    return flowPositionForClientPoint(clientX, clientY)
  }, [flowPositionForClientPoint])

  const dropPositionForCanvasLibraryNode = useCallback((
    node: ContentCanvasNode,
    clientX: number,
    clientY: number,
  ): ContentCanvasNodePosition => {
    const pointer = flowPositionForClientPoint(clientX, clientY)
    const size = creativeCanvasContentNodeViewportSize(node)
    return {
      x: Math.round(pointer.x - size.width / 2),
      y: Math.round(pointer.y - size.height / 2),
    }
  }, [flowPositionForClientPoint])

  const addLibraryNodeToCanvasAtPosition = useCallback((node: ContentCanvasNode, position: ContentCanvasNodePosition) => {
    onAddNodeToCanvas(node.id, position)
  }, [onAddNodeToCanvas])

  const addLibraryNodeToCanvas = useCallback((node: ContentCanvasNode) => {
    addLibraryNodeToCanvasAtPosition(node, positionForCanvasLibraryInsert())
  }, [addLibraryNodeToCanvasAtPosition, positionForCanvasLibraryInsert])

  const startCanvasNodeDrag = useCallback((event: ReactDragEvent, node: ContentCanvasNode) => {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(CONTENT_PROMPT_CANVAS_NODE_DRAG_MIME, JSON.stringify({ nodeId: node.id } satisfies ContentPromptCanvasNodeDragPayload))
    event.dataTransfer.setData('text/plain', node.title || node.id)
  }, [])

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
    const centerX = focusedNode.position.x + size.width / 2
    const centerY = focusedNode.position.y + size.height / 2
    const zoom = Math.max(flowInstance.getZoom(), 0.72)
    void flowInstance.setCenter(centerX, centerY, { duration: 320, zoom })
    if (focusFrameRef.current !== null) window.cancelAnimationFrame(focusFrameRef.current)
    focusFrameRef.current = window.requestAnimationFrame(() => {
      focusFrameRef.current = null
      void flowInstance.setCenter(centerX, centerY, {
        duration: 180,
        zoom: Math.max(flowInstance.getZoom(), zoom),
      })
    })
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
  }, [editablePromptNodeIds, nodeById, promptByNodeId, updatePromptDraft])

  const positionForContextChildCreate = useCallback((node: ContentCanvasNode): ContentCanvasNodePosition => {
    const flowNode = flowNodes.find((item) => item.id === node.id)
    const nodePosition = flowNode?.position ?? node.position
    const nodeWidth = flowNode ? creativeCanvasNodeViewportSize(flowNode.data.item).width : 320
    return {
      x: nodePosition.x + nodeWidth + 48,
      y: nodePosition.y,
    }
  }, [flowNodes])

  const runContextMenuAction = useCallback((action: CreativeCanvasAction, node: ContentCanvasNode) => {
    setContextMenu(null)
    setQuickAddMenu(null)
    if (action.kind === 'create_child') {
      setQuickCreateDialog({
        option: {
          kind: 'child',
          childKind: action.childKind,
          label: creativeCanvasQuickAddChildLabel(action.childKind),
          parentNode: node,
        },
        position: positionForContextChildCreate(node),
      })
      return
    }
    if (action.kind === 'create_assembly') {
      onCreateAssembly(node)
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
  }, [onCandidateNodeSelect, onCreateAssembly, onDeleteNode, onRemoveNodeFromCanvas, onResourceOpen, onSelectNode, positionForContextChildCreate])

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
        ?? (focusedNodeId ? flowNodes.find((node) => node.id === focusedNodeId) : undefined)
      const sourceNode = selectedNode ? nodeById.get(selectedNode.id) : undefined
      if (!sourceNode) return
      event.preventDefault()
      onRemoveNodeFromCanvas(sourceNode.id)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [flowNodes, focusedNodeId, nodeById, onRemoveNodeFromCanvas])

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

  const handleCanvasDragOver = useCallback((event: ReactDragEvent) => {
    if (!resourceDropAcceptsPayload(event.dataTransfer) && !contentPromptCanvasNodeDropAcceptsPayload(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleCanvasDrop = useCallback((event: ReactDragEvent) => {
    const draggedNodeId = readContentPromptCanvasNodeDragPayload(event.dataTransfer)?.nodeId
    if (draggedNodeId) {
      const draggedNode = nodeById.get(draggedNodeId)
      if (!draggedNode) return
      event.preventDefault()
      event.stopPropagation()
      setContextMenu(null)
      setQuickAddMenu(null)
      addLibraryNodeToCanvasAtPosition(draggedNode, dropPositionForCanvasLibraryNode(draggedNode, event.clientX, event.clientY))
      return
    }
    if (!resourceDropAcceptsPayload(event.dataTransfer)) return
    const resource = contentCanvasUploadedResourceFromDropEvent(event)
    if (!resource) return
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    setQuickAddMenu(null)
    const position = flowPositionForClientPoint(event.clientX, event.clientY)
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
  }, [addLibraryNodeToCanvasAtPosition, dropPositionForCanvasLibraryNode, flowNodes, flowPositionForClientPoint, focusedNodeId, nodeById, onCandidateResourceSelect])

  const generatableCount = creativeGraph.nodes.filter((node) => node.canGenerate).length
  const showMiniMap = creativeGraph.nodes.length <= CREATIVE_CANVAS_MINIMAP_NODE_LIMIT
  const openCreateCanvasDialog = useCallback(() => {
    setCanvasNameDialog({
      mode: 'create',
      initialTitle: nextContentCanvasTitleSuggestion(canvasDocuments),
    })
  }, [canvasDocuments])
  const openRenameCanvasDialog = useCallback(() => {
    if (!activeCanvasDocument) return
    setCanvasNameDialog({
      mode: 'rename',
      canvasId: activeCanvasDocument.id,
      initialTitle: activeCanvasDocument.title,
    })
  }, [activeCanvasDocument])
  const submitCanvasNameDialog = useCallback((title: string) => {
    if (!canvasNameDialog) return
    if (canvasNameDialog.mode === 'create') {
      onCreateCanvas(title)
      return
    }
    onRenameCanvas(canvasNameDialog.canvasId, title)
  }, [canvasNameDialog, onCreateCanvas, onRenameCanvas])

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
          {activeCanvasDocument?.title ?? '自由内容画布'}
        </span>
        <em>{contentCanvasScopeLabel(activeCanvasScope)}</em>
        <select
          className="content-prompt-canvas-panel__canvas-select"
          value={activeCanvasDocument?.id ?? ''}
          onChange={(event) => onSelectCanvas(event.target.value)}
          aria-label="选择画布"
        >
          {canvasDocuments.map((document) => (
            <option key={document.id} value={document.id}>
              {document.title} · {contentCanvasScopeLabel(contentCanvasDocumentScope(document))}
            </option>
          ))}
        </select>
        <em>{creativeGraph.nodes.length} 个创作节点，{generatableCount} 个可生成节点</em>
        <button
          type="button"
          onClick={openCreateCanvasDialog}
          title="新建内容画布"
          aria-label="新建内容画布"
        >
          <Plus size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={!activeCanvasDocument}
          onClick={openRenameCanvasDialog}
          title="重命名内容画布"
          aria-label="重命名内容画布"
        >
          <Pencil size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="content-prompt-canvas-panel__save-button"
          data-dirty={hasUnsavedChanges ? 'true' : undefined}
          disabled={!activeCanvasDocument || savePending}
          onClick={onSaveCanvas}
          title={hasUnsavedChanges ? '保存内容画布' : '内容画布已保存'}
          aria-label="保存内容画布"
        >
          <Save size={14} aria-hidden="true" />
          <span>{savePending ? '保存中' : hasUnsavedChanges ? '保存画布' : '已保存'}</span>
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
      <ContentCanvasNameDialog
        documents={canvasDocuments}
        state={canvasNameDialog}
        onClose={() => setCanvasNameDialog(null)}
        onSubmit={submitCanvasNameDialog}
      />
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
                  draggable={!alreadyAdded}
                  onDragStart={(event) => startCanvasNodeDrag(event, node)}
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
            <>
              <div className="content-prompt-canvas-asset-drawer__grid">
                {pagedAssetLibraryNodes.map((node) => {
                  const alreadyAdded = canvasNodeIdSet.has(node.id)
                  const canReference = Boolean(activePromptReferenceTargetId && activePromptReferenceTargetId !== node.id)
                  return (
                    <ContentPromptCanvasAssetLibraryCard
                      key={node.id}
                      node={node}
                      candidateSelections={candidateSelections}
                      actionLabel={canReference ? '引用' : alreadyAdded ? '已加入' : '加入'}
                      disabled={alreadyAdded && !canReference}
                      onDragStart={(event) => startCanvasNodeDrag(event, node)}
                      onClick={() => useAssetLibraryNode(node)}
                    />
                  )
                })}
              </div>
              <ContentPromptCanvasAssetDrawerPager
                page={assetLibraryPage}
                pageCount={assetLibraryPageCount}
                total={assetLibraryNodes.length}
                onPage={setAssetLibraryPage}
              />
            </>
          ) : (
            <p className="content-prompt-canvas-node-drawer__empty">暂无资产</p>
          )}
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
          if (suppressNextNodeClickRef.current) {
            suppressNextNodeClickRef.current = false
            return
          }
          selectPromptCanvasNode(node.id)
        }}
        onNodeDragStart={() => {
          suppressNextNodeClickRef.current = true
        }}
        onPaneClick={() => {
          setContextMenu(null)
          setQuickAddMenu(null)
          onCanvasDeselect()
        }}
        onPaneContextMenu={openQuickAddMenu}
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
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
          window.setTimeout(() => {
            suppressNextNodeClickRef.current = false
          }, 0)
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
        activeCanvasScope={activeCanvasScope}
        namespaceVocabulary={namespaceVocabulary}
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
          preview={candidatePreviewDialog.preview}
          sourceNode={candidatePreviewDialog.sourceNode}
          onRemove={() => {
            const candidate = candidatePreviewDialog.preview.candidate
            if (candidate) onCandidateRemove(candidatePreviewDialog.sourceNode, candidate)
          }}
          onRetry={() => onCandidateCreate(candidatePreviewDialog.sourceNode, candidateRetryGenerationOptions(candidatePreviewDialog.preview))}
          onClose={() => setCandidatePreviewDialog(null)}
        />
      ) : null}
    </main>
  )
}

function ContentPromptCanvasAssetLibraryCard({
  actionLabel,
  candidateSelections,
  disabled,
  node,
  onClick,
  onDragStart,
}: {
  actionLabel: string
  candidateSelections: CandidateSelections
  disabled: boolean
  node: ContentCanvasNode
  onClick: () => void
  onDragStart: (event: ReactDragEvent) => void
}) {
  const preview = currentCandidatePreview(candidatePreviewsForNode(node, candidateSelections))
  const mediaKind = preview ? candidatePreviewMediaKind(preview) : mediaKindForCurrentState(mediaKindForNode(node))
  const canPreview = preview?.resourceId !== undefined && mediaKind !== 'file'
  const decision = candidateDecisionForNode(node, candidateSelections)
  const candidateCount = decision?.candidateCount ?? 0
  const stateLabel = candidateCount > 0
    ? decision?.label ?? '候选'
    : '无候选'
  const Icon = iconForContentNode(node)
  return (
    <button
      type="button"
      className="content-prompt-canvas-asset-card"
      data-state={candidateCount > 0 ? decision?.tone ?? 'ready' : 'empty'}
      disabled={disabled}
      draggable={!disabled}
      onDragStart={onDragStart}
      onClick={onClick}
    >
      <span className="content-prompt-canvas-asset-card__thumb" data-has-media={canPreview ? 'true' : undefined}>
        {preview?.resourceId !== undefined && mediaKind === 'image' ? (
          <ResourceFileImage resourceId={preview.resourceId} alt={preview.title || preview.id} loading="lazy" thumbnailMaxSize={192} />
        ) : null}
        {preview?.resourceId !== undefined && mediaKind === 'video' ? (
          <ResourceFileVideo resourceId={preview.resourceId} muted playsInline preload="metadata" />
        ) : null}
        {!canPreview ? (
          <span>
            <Icon size={22} aria-hidden="true" />
          </span>
        ) : null}
        <em>{stateLabel}</em>
      </span>
      <span className="content-prompt-canvas-asset-card__copy">
        <strong>{node.title}</strong>
        <small>{candidateCount ? `${candidateCount} 候选` : contentCanvasNodeLibraryLabel(node)}</small>
      </span>
      <span className="content-prompt-canvas-asset-card__action">{actionLabel}</span>
    </button>
  )
}

function ContentPromptCanvasAssetDrawerPager({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number
  pageCount: number
  total: number
  onPage: (page: number) => void
}) {
  return (
    <div className="content-prompt-canvas-asset-drawer__pager">
      <span>{total} 个资产 · {page}/{pageCount}</span>
      <div>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(Math.max(1, page - 1))}
          aria-label="上一页"
          title="上一页"
        >
          <ChevronLeft size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onPage(Math.min(pageCount, page + 1))}
          aria-label="下一页"
          title="下一页"
        >
          <ChevronRight size={13} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

function ContentPromptFlowNodeCandidatePager({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number
  pageCount: number
  total: number
  onPage: (page: number) => void
}) {
  return (
    <div
      className="content-prompt-flow-node__candidate-pager nodrag"
      role="group"
      aria-label={`${total} 个候选，第 ${page}/${pageCount} 页`}
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={(event) => {
          event.stopPropagation()
          onPage(Math.max(1, page - 1))
        }}
        aria-label="上一页候选"
        title="上一页候选"
      >
        <ChevronLeft size={12} aria-hidden="true" />
      </button>
      <span>{page}/{pageCount}</span>
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={(event) => {
          event.stopPropagation()
          onPage(Math.min(pageCount, page + 1))
        }}
        aria-label="下一页候选"
        title="下一页候选"
      >
        <ChevronRight size={12} aria-hidden="true" />
      </button>
    </div>
  )
}

function ContentCanvasNameDialog({
  documents,
  state,
  onClose,
  onSubmit,
}: {
  documents: ContentCanvasDocument[]
  state: ContentCanvasNameDialogState | null
  onClose: () => void
  onSubmit: (title: string) => void
}) {
  const [title, setTitle] = useState('')
  useEffect(() => {
    setTitle(state?.initialTitle ?? '')
  }, [state])
  const normalizedTitle = normalizeContentCanvasDocumentTitle(title)
  const currentCanvasId = state?.mode === 'rename' ? state.canvasId : undefined
  const validationMessage = state
    ? contentCanvasDocumentTitleValidationMessage(title, documents, currentCanvasId)
    : undefined
  const unchanged = state?.mode === 'rename'
    && normalizedTitle === normalizeContentCanvasDocumentTitle(state.initialTitle)
  const canSubmit = Boolean(state && !validationMessage && !unchanged)
  const titleInputId = state?.mode === 'rename'
    ? 'content-canvas-rename-title'
    : 'content-canvas-create-title'

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    onSubmit(normalizedTitle)
    onClose()
  }

  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => {
      if (!open) onClose()
    }}>
      <DialogContent className="content-canvas-create-dialog">
        <DialogHeader>
          <DialogTitle>{state?.mode === 'rename' ? '重命名内容画布' : '新建内容画布'}</DialogTitle>
        </DialogHeader>
        <form className="content-canvas-create-dialog__form" onSubmit={handleSubmit}>
          <Label className="content-canvas-create-dialog__field" htmlFor={titleInputId}>
            <span>名称</span>
            <Input
              id={titleInputId}
              autoFocus
              value={title}
              placeholder="例如：第一幕视觉候选"
              onChange={(event) => setTitle(event.target.value)}
            />
          </Label>
          {validationMessage ? (
            <p className="content-canvas-create-dialog__error">{validationMessage}</p>
          ) : null}
          <DialogFooter className="content-canvas-create-dialog__footer">
            <button type="button" className="content-canvas-create-dialog__button" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="content-canvas-create-dialog__button content-canvas-create-dialog__button--primary" disabled={!canSubmit}>
              {state?.mode === 'rename' ? '保存名称' : '创建画布'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ContentPromptFlowNode({ data }: NodeProps<Node<CreativeFlowNodeData>>) {
  const node = data.item.source
  const Icon = iconForContentNode(node)
  const display = creativeFlowNodeDisplay(node, data.item.role)
  const editablePrompt = isCreativePromptEditableNode(data.item)
  const generationTarget = contentCanvasGenerationTargetForNode(node)
  const generationMediaKind = mediaKindForNode(generationTarget?.node ?? node)
  const canGenerateWithModel = generationMediaKind === 'image' || generationMediaKind === 'video'
  const focused = data.focused
  const expanded = focused
  const currentPreview = currentCandidatePreview(data.candidatePreviews)
  const [candidatePage, setCandidatePage] = useState(1)
  const candidatePageCount = Math.max(1, Math.ceil(data.candidatePreviews.length / CONTENT_PROMPT_NODE_CANDIDATE_PAGE_SIZE))
  const safeCandidatePage = Math.min(Math.max(candidatePage, 1), candidatePageCount)
  const pagedCandidatePreviews = data.candidatePreviews.slice(
    (safeCandidatePage - 1) * CONTENT_PROMPT_NODE_CANDIDATE_PAGE_SIZE,
    safeCandidatePage * CONTENT_PROMPT_NODE_CANDIDATE_PAGE_SIZE,
  )
  useEffect(() => {
    setCandidatePage(1)
  }, [node.id])
  useEffect(() => {
    setCandidatePage((current) => Math.min(Math.max(current, 1), candidatePageCount))
  }, [candidatePageCount])
  return (
    <article
      className="content-prompt-flow-node"
      data-selected={focused ? 'true' : undefined}
      data-expanded={expanded ? 'true' : undefined}
      data-kind={node.kind}
      data-expression-kind={node.kind === 'expression_unit' ? expressionUnitKindValue(node) : undefined}
      data-role={data.item.role}
      data-weight={data.item.weight}
      data-reference-drop-target={editablePrompt ? 'true' : undefined}
      onClickCapture={(event) => {
        if (event.target !== event.currentTarget) return
        event.stopPropagation()
        data.onCanvasDeselect()
      }}
      onContextMenu={(event) => data.onContextMenu(event, node)}
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
        <div className="content-prompt-flow-node__media">
          {node.kind === 'resource' ? (
            <ContentPromptFlowNodeCurrentState
              compact={!expanded}
              mediaKind={generationMediaKind}
              node={node}
              preview={currentPreview}
              onOpen={() => currentPreview ? data.onCandidatePreviewOpen(currentPreview) : undefined}
            />
          ) : expanded ? (
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
                  {candidatePageCount > 1 ? (
                    <ContentPromptFlowNodeCandidatePager
                      page={safeCandidatePage}
                      pageCount={candidatePageCount}
                      total={data.candidatePreviews.length}
                      onPage={setCandidatePage}
                    />
                  ) : (
                    <em>{data.candidatePreviews.length}</em>
                  )}
                </header>
                {data.candidatePreviews.length ? (
                  <div className="content-prompt-flow-node__candidate-list nowheel" data-paged="true">
                    {pagedCandidatePreviews.map((preview) => (
                      <ContentPromptFlowNodeCandidatePreview
                        key={preview.key}
                        preview={preview}
                        variant={node.kind === 'resource' ? 'resource' : 'candidate'}
                        canReference={Boolean(data.referenceTargetNodeId && data.referenceTargetNodeId !== node.id)}
                        sourceNode={node}
                        onOpen={() => data.onCandidatePreviewOpen(preview)}
                        onReference={() => data.onReferenceToActivePrompt(node)}
                        onRemove={() => preview.candidate ? data.onCandidateRemove(node, preview.candidate) : undefined}
                        onRetry={() => data.onGenerateWithOptions(node, candidateRetryGenerationOptions(preview))}
                        onSelect={() => preview.candidate ? data.onCandidateSelect(node, preview.candidate) : undefined}
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
  activeCanvasScope,
  namespaceVocabulary,
  nodes,
  state,
  onClose,
  onSubmit,
}: {
  activeCanvasScope: ContentCanvasDocumentScope
  namespaceVocabulary: ContentCanvasNamespaceVocabularyOptions
  nodes: ContentCanvasNode[]
  state: CreativeCanvasQuickCreateDialogState | null
  onClose: () => void
  onSubmit: (input: ContentCanvasCreateNodeInput) => void
}) {
  const [id, setId] = useState('')
  const [hasManualId, setHasManualId] = useState(false)
  const [title, setTitle] = useState('')
  const [productionMode, setProductionMode] = useState<CreateReferenceMode>('new')
  const [segmentMode, setSegmentMode] = useState<CreateReferenceMode>('new')
  const [selectedProductionId, setSelectedProductionId] = useState('')
  const [selectedSegmentId, setSelectedSegmentId] = useState('')
  const [selectedTimelineNamespaceNodeId, setSelectedTimelineNamespaceNodeId] = useState('')
  const [selectedChildTimelineNamespaceKind, setSelectedChildTimelineNamespaceKind] = useState('')
  const [newProductionId, setNewProductionId] = useState('')
  const [newProductionTitle, setNewProductionTitle] = useState('')
  const [newSegmentId, setNewSegmentId] = useState('')
  const [newSegmentTitle, setNewSegmentTitle] = useState('')
  const [settingMode, setSettingMode] = useState<CreateReferenceMode>('new')
  const [stateMode, setStateMode] = useState<CreateReferenceMode>('new')
  const [selectedSettingId, setSelectedSettingId] = useState('')
  const [selectedStateId, setSelectedStateId] = useState('')
  const [selectedVisualOwnerId, setSelectedVisualOwnerId] = useState('')
  const [newSettingId, setNewSettingId] = useState('')
  const [newSettingTitle, setNewSettingTitle] = useState('')
  const [newStateId, setNewStateId] = useState('')
  const [newStateTitle, setNewStateTitle] = useState('')
  const initializedDialogKeyRef = useRef<string | null>(null)
  const copy = quickCreateDialogCopy(state)
  const dialogSessionKey = quickCreateDialogSessionKey(state)
  const entityKind = quickCreateDialogEntityKind(state)
  const idFallbackPrefix = quickCreateDialogIdPrefix(state, copy.idPlaceholder)
  const resolvedId = hasManualId
    ? id.trim()
    : allocateMovScriptEntityId({
      entityKind,
      title: title.trim() || copy.titlePlaceholder,
      fallbackPrefix: idFallbackPrefix,
      existingIds: quickCreateExistingEntityIds(nodes, entityKind),
    })
  const productions = useMemo(() => nodes.filter((node) => node.kind === 'production'), [nodes])
  const segments = useMemo(() => nodes.filter((node) => node.kind === 'segment'), [nodes])
  const scopedProductionId = activeCanvasScope.kind === 'production' ? activeCanvasScope.productionId : ''
  const scopedProductions = useMemo(() => (
    scopedProductionId
      ? productions.filter((production) => contentCanvasNodeBelongsToProductionScope(production, scopedProductionId, productions))
      : productions
  ), [productions, scopedProductionId])
  const effectiveProductionId = scopedProductionId || selectedProductionId
  const segmentsForProduction = useMemo(() => (
    contentCanvasSegmentsForProduction(segments, effectiveProductionId, productions)
  ), [effectiveProductionId, productions, segments])
  const settings = useMemo(() => nodes.filter((node) => node.kind === 'setting'), [nodes])
  const states = useMemo(() => nodes.filter((node) => node.kind === 'state'), [nodes])
  const timelineNamespaceParents = useMemo(() => (
    contentCanvasTimelineNamespaceParentsForSceneMoment(nodes, activeCanvasScope)
  ), [activeCanvasScope, nodes])
  const visualOwners = useMemo(() => nodes
    .filter((node) => node.kind === 'scene_moment' || node.kind === 'expression_unit')
    .filter((node) => !scopedProductionId || contentCanvasNodeBelongsToProductionScope(node, scopedProductionId, productions)),
  [nodes, productions, scopedProductionId])
  const statesForSetting = useMemo(() => (
    selectedSettingId
      ? states.filter((node) => stateNodeBelongsToSetting(node, selectedSettingId))
      : states
  ), [selectedSettingId, states])
  const needsTimelineNamespaceParent = quickCreateDialogNeedsTimelineNamespaceParent(state)
  const selectedTimelineNamespaceParent = timelineNamespaceParents.find((node) => node.id === selectedTimelineNamespaceNodeId)
    ?? timelineNamespaceParents[0]
  const childTimelineNamespaceKind = quickCreateChildTimelineNamespaceKind(state, namespaceVocabulary)
  const needsChildTimelineNamespaceKind = Boolean(childTimelineNamespaceKind)
  const needsProductionSegment = quickCreateDialogNeedsProductionSegment(state) && !needsTimelineNamespaceParent
  const needsMount = quickCreateDialogNeedsSettingStateMount(state)
  const needsVisualOwner = quickCreateDialogNeedsVisualOwner(state)
  const selectedProduction = scopedProductions.find((production) => production.entityKey === selectedProductionId)
    ?? productions.find((production) => production.entityKey === selectedProductionId)
  const selectedSegment = segmentsForProduction.find((segment) => segment.entityKey === selectedSegmentId)
    ?? segments.find((segment) => segment.entityKey === selectedSegmentId)
  const selectedSetting = settings.find((setting) => setting.entityKey === selectedSettingId)
  const selectedState = statesForSetting.find((stateNode) => stateNode.entityKey === selectedStateId)
    ?? states.find((stateNode) => stateNode.entityKey === selectedStateId)
  const selectedVisualOwner = visualOwners.find((owner) => owner.id === selectedVisualOwnerId)
  const planItems = quickCreateDialogPlanItems({
    childTimelineNamespaceKind,
    copy,
    id: resolvedId,
    needsChildTimelineNamespaceKind,
    needsMount,
    needsProductionSegment,
    needsTimelineNamespaceParent,
    needsVisualOwner,
    newProductionId,
    newProductionTitle,
    newSegmentId,
    newSegmentTitle,
    newSettingId,
    newSettingTitle,
    newStateId,
    newStateTitle,
    productionMode,
    segmentMode,
    selectedChildTimelineNamespaceKind,
    selectedProduction,
    selectedProductionId,
    selectedSegment,
    selectedSegmentId,
    selectedSetting,
    selectedSettingId,
    selectedState,
    selectedStateId,
    selectedTimelineNamespaceParent,
    selectedVisualOwner,
    selectedVisualOwnerId,
    settingMode,
    state,
    stateMode,
    title,
  })
  const canSubmit = Boolean(title.trim() && resolvedId
    && (!needsTimelineNamespaceParent || selectedTimelineNamespaceParent)
    && (!needsProductionSegment || (
      (productionMode !== 'existing' || selectedProductionId)
      && (segmentMode !== 'existing' || selectedSegmentId)
    ))
    && (!needsVisualOwner || selectedVisualOwnerId)
    && (!needsMount || (
      (settingMode !== 'existing' || selectedSettingId)
      && (stateMode !== 'existing' || selectedStateId)
    )))

  useEffect(() => {
    if (!state) {
      initializedDialogKeyRef.current = null
      setId('')
      setHasManualId(false)
      setTitle('')
      setProductionMode('new')
      setSegmentMode('new')
      setSelectedProductionId('')
      setSelectedSegmentId('')
      setSelectedTimelineNamespaceNodeId('')
      setSelectedChildTimelineNamespaceKind('')
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
    if (initializedDialogKeyRef.current === dialogSessionKey) return
    initializedDialogKeyRef.current = dialogSessionKey
    const firstProductionId = scopedProductionId || scopedProductions[0]?.entityKey || ''
    const firstSegmentId = contentCanvasFirstSegmentIdForProduction(segments, firstProductionId, productions)
    setProductionMode(firstProductionId ? 'existing' : 'new')
    setSegmentMode(firstSegmentId ? 'existing' : 'new')
    setSelectedProductionId(firstProductionId)
    setSelectedSegmentId(firstSegmentId)
    setSelectedTimelineNamespaceNodeId(timelineNamespaceParents[0]?.id ?? '')
    setSelectedChildTimelineNamespaceKind(childTimelineNamespaceKind ?? '')
    const firstSettingId = settings[0]?.entityKey ?? ''
    const firstStateId = states[0]?.entityKey ?? ''
    setSettingMode(firstSettingId ? 'existing' : 'new')
    setStateMode(firstStateId ? 'existing' : 'new')
    setSelectedSettingId(firstSettingId)
    setSelectedStateId(firstStateId)
    setSelectedVisualOwnerId(visualOwners[0]?.id ?? '')
  }, [childTimelineNamespaceKind, dialogSessionKey, productions, scopedProductionId, scopedProductions, segments, settings, state, states, timelineNamespaceParents, visualOwners])

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

  useEffect(() => {
    if (!state || !needsMount || settingMode !== 'existing' || stateMode !== 'existing') return
    const currentStateIsAvailable = statesForSetting.some((stateNode) => stateNode.entityKey === selectedStateId)
    if (currentStateIsAvailable) return
    const nextStateId = statesForSetting[0]?.entityKey ?? ''
    if (nextStateId) {
      setSelectedStateId(nextStateId)
      return
    }
    setStateMode('new')
    setSelectedStateId('')
  }, [needsMount, selectedStateId, settingMode, state, stateMode, statesForSetting])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    const explicitId = hasManualId ? id.trim() : ''
    onSubmit({
      id: explicitId,
      title: title.trim(),
      ...quickCreateTimelineNamespaceInput({
        needsTimelineNamespaceParent,
        selectedTimelineNamespaceParent,
      }),
      ...quickCreateChildTimelineNamespaceInput({
        needsChildTimelineNamespaceKind,
        selectedChildTimelineNamespaceKind: selectedChildTimelineNamespaceKind || childTimelineNamespaceKind || '',
      }),
      ...quickCreateProductionInput({
        id: resolvedId,
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
        id: resolvedId,
        needsMount,
        newSettingId,
        newSettingTitle,
        newStateId,
        newStateTitle,
        selectedSettingId,
        selectedStateId,
        settingMode,
        namespaceVocabulary,
        stateMode,
        title: title.trim(),
      }),
    })
    setId('')
    setHasManualId(false)
    setTitle('')
  }

  function resetAndClose() {
    setId('')
    setHasManualId(false)
    setTitle('')
    setNewProductionId('')
    setNewProductionTitle('')
    setNewSegmentId('')
    setNewSegmentTitle('')
    setSelectedTimelineNamespaceNodeId('')
    setSelectedChildTimelineNamespaceKind('')
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
          <ContentCanvasCreateDialogSection title="创建目标">
            <div className="content-canvas-create-dialog__field">
              <Label className="content-canvas-create-dialog__field" htmlFor="content-prompt-canvas-quick-create-title">
                <span>标题</span>
                <Input
                  id="content-prompt-canvas-quick-create-title"
                  autoFocus
                  value={title}
                  placeholder={copy.titlePlaceholder}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </Label>
              <details className="content-canvas-create-dialog__advanced">
                <summary>高级：自定义 ID</summary>
                <Label className="content-canvas-create-dialog__field" htmlFor="content-prompt-canvas-quick-create-id">
                  <span>ID</span>
                  <Input
                    id="content-prompt-canvas-quick-create-id"
                    value={hasManualId ? id : resolvedId}
                    placeholder={copy.idPlaceholder}
                    onChange={(event) => {
                      const nextId = event.target.value
                      setId(nextId)
                      setHasManualId(Boolean(nextId.trim()))
                    }}
                  />
                </Label>
              </details>
            </div>
          </ContentCanvasCreateDialogSection>
          {needsTimelineNamespaceParent ? (
            <ContentCanvasCreateDialogSection title="时间线">
              <div className="content-canvas-create-dialog__field">
                <Label htmlFor="content-prompt-canvas-quick-create-timeline-namespace">挂载时间线</Label>
                <ContentCanvasCreateSelect
                  id="content-prompt-canvas-quick-create-timeline-namespace"
                  value={selectedTimelineNamespaceParent?.id ?? ''}
                  placeholder="暂无可挂载时间线层级"
                  options={timelineNamespaceParents.map((namespaceNode) => ({
                    value: namespaceNode.id,
                    label: timelineNamespaceLabel(namespaceNode),
                  }))}
                  disabled={!timelineNamespaceParents.length}
                  onValueChange={setSelectedTimelineNamespaceNodeId}
                />
              </div>
            </ContentCanvasCreateDialogSection>
          ) : null}
          {needsChildTimelineNamespaceKind ? (
            <ContentCanvasCreateDialogSection title="时间线">
              <div className="content-canvas-create-dialog__field">
                <Label htmlFor="content-prompt-canvas-quick-create-child-namespace">子层级类型</Label>
                <ContentCanvasCreateSelect
                  id="content-prompt-canvas-quick-create-child-namespace"
                  value={selectedChildTimelineNamespaceKind || childTimelineNamespaceKind || ''}
                  placeholder="选择子层级类型"
                  options={namespaceVocabulary.timelineNamespaces.map((namespaceKind) => ({
                    value: namespaceKind,
                    label: namespaceKind,
                  }))}
                  onValueChange={setSelectedChildTimelineNamespaceKind}
                />
              </div>
            </ContentCanvasCreateDialogSection>
          ) : null}
          {needsProductionSegment ? (
            <ContentCanvasCreateDialogSection title="时间线">
              <div className="content-canvas-create-dialog__field">
                <span>挂载制作</span>
                <ContentCanvasCreateModeSwitch
                  value={productionMode}
                  existingLabel="使用已有"
                  newLabel="新建制作"
                  existingDisabled={!scopedProductions.length && !scopedProductionId}
                  newDisabled={Boolean(scopedProductionId)}
                  onChange={(nextMode) => {
                    if (nextMode === 'new') {
                      setProductionMode('new')
                      setSegmentMode('new')
                      setSelectedProductionId('')
                      setSelectedSegmentId('')
                      return
                    }
                    const nextProductionId = selectedProductionId || scopedProductionId || scopedProductions[0]?.entityKey || ''
                    const nextSegmentId = contentCanvasFirstSegmentIdForProduction(segments, nextProductionId, productions)
                    setProductionMode('existing')
                    setSelectedProductionId(nextProductionId)
                    setSegmentMode(nextSegmentId ? 'existing' : 'new')
                    setSelectedSegmentId(nextSegmentId)
                  }}
                />
                {productionMode === 'existing' ? (
                  <ContentCanvasCreateSelect
                    id="content-prompt-canvas-quick-create-production"
                    value={selectedProductionId}
                    placeholder={scopedProductionId ? contentCanvasScopeLabel(activeCanvasScope) : '选择制作'}
                    options={[
                      ...scopedProductions.map((production) => ({
                        value: production.entityKey,
                        label: production.title,
                      })),
                      ...(scopedProductionId && !scopedProductions.length
                        ? [{ value: scopedProductionId, label: contentCanvasScopeLabel(activeCanvasScope) }]
                        : []),
                    ]}
                    disabled={Boolean(scopedProductionId)}
                    onValueChange={(nextProductionId) => {
                      const nextSegmentId = contentCanvasFirstSegmentIdForProduction(segments, nextProductionId, productions)
                      setProductionMode('existing')
                      setSelectedProductionId(nextProductionId)
                      setSegmentMode(nextSegmentId ? 'existing' : 'new')
                      setSelectedSegmentId(nextSegmentId)
                    }}
                  />
                ) : null}
                {productionMode === 'new' ? (
                  <div className="content-canvas-create-dialog__grid">
                    <Input
                      value={newProductionId}
                      placeholder={`${resolvedId || 'node'}_production`}
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
              <div className="content-canvas-create-dialog__field">
                <span>挂载段落</span>
                <ContentCanvasCreateModeSwitch
                  value={productionMode === 'new' ? 'new' : segmentMode}
                  existingLabel="使用已有"
                  newLabel="新建段落"
                  existingDisabled={productionMode === 'new' || !segmentsForProduction.length}
                  onChange={(nextMode) => {
                    if (nextMode === 'new') {
                      setSegmentMode('new')
                      setSelectedSegmentId('')
                      return
                    }
                    setSegmentMode('existing')
                    setSelectedSegmentId(selectedSegmentId || segmentsForProduction[0]?.entityKey || '')
                  }}
                />
                {productionMode !== 'new' && segmentMode === 'existing' ? (
                  <ContentCanvasCreateSelect
                    id="content-prompt-canvas-quick-create-segment"
                    value={selectedSegmentId}
                    placeholder="选择段落"
                    options={segmentsForProduction.map((segment) => ({
                      value: segment.entityKey,
                      label: segment.title,
                    }))}
                    onValueChange={(nextSegmentId) => {
                      setSegmentMode('existing')
                      setSelectedSegmentId(nextSegmentId)
                    }}
                  />
                ) : null}
                {segmentMode === 'new' || productionMode === 'new' ? (
                  <div className="content-canvas-create-dialog__grid">
                    <Input
                      value={newSegmentId}
                      placeholder={`${resolvedId || 'node'}_segment`}
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
            </ContentCanvasCreateDialogSection>
          ) : null}
          {needsVisualOwner ? (
            <ContentCanvasCreateDialogSection title="归属">
              <div className="content-canvas-create-dialog__field">
                <Label htmlFor="content-prompt-canvas-quick-create-visual-owner">挂载对象</Label>
                <ContentCanvasCreateSelect
                  id="content-prompt-canvas-quick-create-visual-owner"
                  value={selectedVisualOwnerId}
                  placeholder={visualOwners.length ? '选择情节或表达' : '暂无情节或表达'}
                  options={visualOwners.map((owner) => ({
                    value: owner.id,
                    label: `${owner.kind === 'scene_moment' ? '情节' : '表达'} · ${owner.title}`,
                  }))}
                  disabled={!visualOwners.length}
                  onValueChange={setSelectedVisualOwnerId}
                />
              </div>
            </ContentCanvasCreateDialogSection>
          ) : null}
          {needsMount ? (
            <ContentCanvasCreateDialogSection title="归属">
              <div className="content-canvas-create-dialog__field">
                <span>挂载设定</span>
                <ContentCanvasCreateModeSwitch
                  value={settingMode}
                  existingLabel="使用已有"
                  newLabel="新建设定"
                  existingDisabled={!settings.length}
                  onChange={(nextMode) => {
                    if (nextMode === 'new') {
                      setSettingMode('new')
                      setStateMode('new')
                      setSelectedSettingId('')
                      setSelectedStateId('')
                      return
                    }
                    const nextSettingId = selectedSettingId || settings[0]?.entityKey || ''
                    const nextStates = nextSettingId
                      ? states.filter((stateNode) => stateNodeBelongsToSetting(stateNode, nextSettingId))
                      : states
                    const nextStateId = selectedStateId && nextStates.some((stateNode) => stateNode.entityKey === selectedStateId)
                      ? selectedStateId
                      : nextStates[0]?.entityKey || ''
                    setSettingMode('existing')
                    setSelectedSettingId(nextSettingId)
                    setStateMode(nextStateId ? 'existing' : 'new')
                    setSelectedStateId(nextStateId)
                  }}
                />
                {settingMode === 'existing' ? (
                  <ContentCanvasCreateSelect
                    id="content-prompt-canvas-quick-create-setting"
                    value={selectedSettingId}
                    placeholder="选择设定"
                    options={settings.map((setting) => ({
                      value: setting.entityKey,
                      label: setting.title,
                    }))}
                    onValueChange={(nextSettingId) => {
                      const nextStates = states.filter((stateNode) => stateNodeBelongsToSetting(stateNode, nextSettingId))
                      const nextStateId = nextStates[0]?.entityKey ?? ''
                      setSelectedSettingId(nextSettingId)
                      setStateMode(nextStateId ? 'existing' : 'new')
                      setSelectedStateId(nextStateId)
                    }}
                  />
                ) : null}
                {settingMode === 'new' ? (
                  <div className="content-canvas-create-dialog__grid">
                    <Input
                      value={newSettingId}
                      placeholder={`${resolvedId || 'node'}_setting`}
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
              <div className="content-canvas-create-dialog__field">
                <span>挂载状态</span>
                <ContentCanvasCreateModeSwitch
                  value={settingMode === 'new' ? 'new' : stateMode}
                  existingLabel="使用已有"
                  newLabel="新建状态"
                  existingDisabled={settingMode === 'new' || !statesForSetting.length}
                  onChange={(nextMode) => {
                    if (nextMode === 'new') {
                      setStateMode('new')
                      setSelectedStateId('')
                      return
                    }
                    setStateMode('existing')
                    setSelectedStateId(selectedStateId || statesForSetting[0]?.entityKey || '')
                  }}
                />
                {settingMode !== 'new' && stateMode === 'existing' ? (
                  <ContentCanvasCreateSelect
                    id="content-prompt-canvas-quick-create-state"
                    value={selectedStateId}
                    placeholder="选择状态"
                    options={statesForSetting.map((stateNode) => ({
                      value: stateNode.entityKey,
                      label: stateNode.title,
                    }))}
                    onValueChange={(nextStateId) => {
                      setStateMode('existing')
                      setSelectedStateId(nextStateId)
                    }}
                  />
                ) : null}
                {stateMode === 'new' || settingMode === 'new' ? (
                  <div className="content-canvas-create-dialog__grid">
                    <Input
                      value={newStateId}
                      placeholder={`${resolvedId || 'node'}_state`}
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
            </ContentCanvasCreateDialogSection>
          ) : null}
          <ContentPromptCanvasCreatePlanPreview items={planItems} />
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

function ContentCanvasCreateModeSwitch({
  existingDisabled = false,
  existingLabel,
  newDisabled = false,
  newLabel,
  value,
  onChange,
}: {
  existingDisabled?: boolean
  existingLabel: string
  newDisabled?: boolean
  newLabel: string
  value: CreateReferenceMode
  onChange: (value: CreateReferenceMode) => void
}) {
  return (
    <div className="content-canvas-create-dialog__mode-row" role="group">
      <button
        type="button"
        className="content-canvas-create-dialog__mode-button"
        data-active={value === 'existing'}
        disabled={existingDisabled}
        onClick={() => onChange('existing')}
      >
        {existingLabel}
      </button>
      <button
        type="button"
        className="content-canvas-create-dialog__mode-button"
        data-active={value === 'new'}
        disabled={newDisabled}
        onClick={() => onChange('new')}
      >
        {newLabel}
      </button>
    </div>
  )
}

function ContentCanvasCreateDialogSection({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <section className="content-canvas-create-dialog__section">
      <div className="content-canvas-create-dialog__section-title">{title}</div>
      <div className="content-canvas-create-dialog__section-body">
        {children}
      </div>
    </section>
  )
}

function ContentCanvasCreateSelect({
  disabled = false,
  id,
  options,
  placeholder,
  value,
  onValueChange,
}: {
  disabled?: boolean
  id: string
  options: ContentCanvasCreateSelectOption[]
  placeholder: string
  value: string
  onValueChange: (value: string) => void
}) {
  const hasOptions = options.length > 0
  return (
    <Select
      value={value || undefined}
      disabled={disabled || !hasOptions}
      onValueChange={onValueChange}
    >
      <SelectTrigger id={id} className="content-canvas-create-dialog__select">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="content-canvas-create-dialog__select-content">
        {hasOptions ? options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        )) : (
          <SelectItem value={CONTENT_CANVAS_CREATE_SELECT_EMPTY_VALUE} disabled>
            {placeholder}
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  )
}

function ContentPromptCanvasCreatePlanPreview({ items }: { items: QuickCreatePlanItem[] }) {
  if (!items.length) return null
  return (
    <section className="content-canvas-create-dialog__plan" aria-label="将要创建">
      <div className="content-canvas-create-dialog__plan-title">将要创建</div>
      <ul className="content-canvas-create-dialog__plan-list">
        {items.map((item) => (
          <li key={`${item.label}:${item.value}`} data-tone={item.tone ?? 'context'}>
            <span>{item.label}</span>
            <b>{item.value}</b>
          </li>
        ))}
      </ul>
    </section>
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
  const capability = mediaKind === 'video' ? 'video_generation' : mediaKind === 'image' ? 'image_generation' : null
  const operationOptions = contentCanvasGenerationOperationOptions(mediaKind)
  const [operation, setOperation] = useState(() => operationOptions[0]?.value ?? '')
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
  }, [selectedModel?.model_id])

  useEffect(() => {
    const nextOperation = operationOptions[0]?.value ?? ''
    if (!operationOptions.some((option) => option.value === operation)) setOperation(nextOperation)
  }, [operation, operationOptions])

  if (!capability || !operation) return null

  return (
    <form
      className="content-prompt-flow-node__generation nodrag"
      onClick={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault()
        if (!selectedModelId) return
        const generationIntent: GenerationIntentPayload = {
          capability,
          operation,
        }
        onSubmit({
          modelId: selectedModelId,
          params,
          supportedParams,
          generationIntent,
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
          <span>能力</span>
          <Select
            value={operation}
            onValueChange={(nextOperation) => {
              setOperation(nextOperation)
              setSelectedModelId(null)
              setSelectedModel(null)
            }}
          >
            <SelectTrigger className="content-prompt-flow-node__generation-model">
              <SelectValue placeholder="选择生成能力" />
            </SelectTrigger>
            <SelectContent>
              {operationOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label>
          <span>模型</span>
          <ContentCanvasModelSelector
            capability={capability}
            operation={operation}
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

function contentCanvasGenerationOperationOptions(mediaKind: string | null | undefined): Array<{ value: string; label: string }> {
  if (mediaKind === 'image') {
    return [
      { value: 'prompt_to_image', label: '文生图' },
      { value: 'image_to_image', label: '图生图 / 参考图生图' },
    ]
  }
  if (mediaKind === 'video') {
    return [
      { value: 'prompt_to_video', label: '文生视频' },
      { value: 'image_to_video', label: '图生视频' },
      { value: 'first_frame_to_video', label: '首帧生视频' },
      { value: 'first_last_frame_to_video', label: '首尾帧生视频' },
      { value: 'reference_to_video', label: '全能参考生视频' },
      { value: 'video_to_video', label: '视频参考生视频' },
    ]
  }
  return []
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
  onRemove,
  onRetry,
  onSelect,
}: {
  preview: CreativeFlowNodeCandidatePreview
  variant: 'candidate' | 'resource'
  canReference: boolean
  sourceNode: ContentCanvasNode
  onOpen: () => void
  onReference: () => void
  onRemove: () => void
  onRetry: () => void
  onSelect: () => void
}) {
  const mediaKind = candidatePreviewMediaKind(preview)
  const canPreview = preview.resourceId !== undefined && mediaKind !== 'file'
  const hasThumb = variant === 'candidate' || canPreview
  const PlaceholderIcon = candidatePreviewPlaceholderIcon(preview)
  const failureReason = preview.failureReason
  const detailButton = variant !== 'resource' ? (
    <button
      type="button"
      className="content-prompt-flow-node__candidate-detail"
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      aria-label={`查看候选 ${preview.title || preview.id} 详情`}
      title="查看详情"
    >
      <Info size={12} aria-hidden="true" />
    </button>
  ) : null
  const retryButton = variant !== 'resource' && preview.retryable ? (
    <button
      type="button"
      className="content-prompt-flow-node__candidate-retry"
      onClick={(event) => {
        event.stopPropagation()
        onRetry()
      }}
      aria-label={`重新生成候选 ${preview.title || preview.id}`}
      title="重新生成"
    >
      <RotateCcw size={12} aria-hidden="true" />
    </button>
  ) : null
  const removeButton = variant !== 'resource' && preview.removable ? (
    <button
      type="button"
      className="content-prompt-flow-node__candidate-remove"
      onClick={(event) => {
        event.stopPropagation()
        onRemove()
      }}
      aria-label={`移出候选 ${preview.title || preview.id}`}
      title="移出候选"
    >
      <Trash2 size={12} aria-hidden="true" />
    </button>
  ) : null
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
  const selectionButton = variant !== 'resource' ? (
    <button
      type="button"
      className="content-prompt-flow-node__candidate-select"
      onClick={(event) => {
        event.stopPropagation()
        if (!preview.selected && preview.selectable) onSelect()
      }}
      disabled={preview.selected || !preview.selectable}
      aria-label={preview.selected ? `已选择候选 ${preview.title || preview.id}` : `选择候选 ${preview.title || preview.id}`}
      title={preview.selected ? '已选择候选' : preview.selectable ? '选择候选' : '当前候选不可选择'}
    >
      <Star size={12} aria-hidden="true" fill={preview.selected ? 'currentColor' : 'none'} />
    </button>
  ) : null
  const actionButtons = variant !== 'resource' && (detailButton || retryButton || removeButton || referenceButton || selectionButton) ? (
    <span className="content-prompt-flow-node__candidate-actions">
      {detailButton}
      {retryButton}
      {removeButton}
      {referenceButton}
      {selectionButton}
    </span>
  ) : null
  return (
    <div
      className="content-prompt-flow-node__candidate nodrag"
      data-has-media={hasThumb ? 'true' : undefined}
      data-media-kind={mediaKind}
      data-preview-kind={variant}
      data-status={preview.statusTone}
      draggable
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onOpen()
      }}
      onDragStart={(event) => {
        event.stopPropagation()
        event.dataTransfer.effectAllowed = 'copy'
        event.dataTransfer.setData(CONTENT_PROMPT_REFERENCE_DRAG_MIME, sourceNode.id)
        event.dataTransfer.setData('text/plain', sourceNode.title || preview.title || preview.id)
      }}
    >
      {hasThumb ? (
        <span
          className="content-prompt-flow-node__candidate-thumb"
          data-placeholder={!canPreview ? 'true' : undefined}
          data-status={preview.statusTone}
        >
          {preview.resourceId !== undefined && mediaKind === 'image' ? (
            <ResourceFileImage resourceId={preview.resourceId} alt={preview.title || preview.id} loading="lazy" thumbnailMaxSize={96} />
          ) : null}
          {preview.resourceId !== undefined && mediaKind === 'video' ? (
            <ResourceFileVideo resourceId={preview.resourceId} muted playsInline preload="metadata" />
          ) : null}
          {!canPreview ? <PlaceholderIcon size={16} aria-hidden="true" /> : null}
          {canPreview ? (
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
          ) : null}
        </span>
      ) : null}
      {variant !== 'resource' ? (
        <span>
          <strong>{preview.title || preview.id}</strong>
          <small>{previewStatusLabel(preview)}</small>
          {failureReason ? <small className="content-prompt-flow-node__candidate-reason">{failureReason}</small> : null}
        </span>
      ) : null}
      {actionButtons}
    </div>
  )
}

function ContentPromptCandidatePreviewDialog({
  preview,
  sourceNode,
  onRemove,
  onRetry,
  onClose,
}: {
  preview: CreativeFlowNodeCandidatePreview
  sourceNode: ContentCanvasNode
  onRemove: () => void
  onRetry: () => void
  onClose: () => void
}) {
  const mediaKind = candidatePreviewMediaKind(preview)
  const canPreview = preview.resourceId !== undefined && mediaKind !== 'file'
  const PlaceholderIcon = candidatePreviewPlaceholderIcon(preview)
  const canRetry = preview.retryable
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
          {!canPreview ? (
            <div className="content-prompt-candidate-preview-dialog__placeholder" data-status={preview.statusTone}>
              <PlaceholderIcon size={26} aria-hidden="true" />
              <strong>{preview.status}</strong>
              <span>{preview.failureReason ?? `${sourceNode.title} 暂无可预览媒体`}</span>
            </div>
          ) : null}
        </div>
        {preview.candidate ? (
          <ContentPromptCandidatePreviewDiagnostics
            preview={preview}
            sourceNode={sourceNode}
          />
        ) : null}
        <div className="content-prompt-candidate-preview-dialog__footer">
          {preview.removable ? (
            <button
              type="button"
              className="content-prompt-candidate-preview-dialog__remove"
              onClick={() => {
                onRemove()
                onClose()
              }}
            >
              <Trash2 size={13} aria-hidden="true" />
              移出候选
            </button>
          ) : null}
          {canRetry ? (
            <button
              type="button"
              className="content-prompt-candidate-preview-dialog__retry"
              onClick={() => {
                onRetry()
                onClose()
              }}
            >
              <RotateCcw size={13} aria-hidden="true" />
              重新生成
            </button>
          ) : null}
          <button type="button" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
  if (typeof document === 'undefined') return dialog
  return createPortal(dialog, document.body)
}

function ContentPromptCandidatePreviewDiagnostics({
  preview,
  sourceNode,
}: {
  preview: CreativeFlowNodeCandidatePreview
  sourceNode: ContentCanvasNode
}) {
  const candidate = preview.candidate
  if (!candidate) return null
  const jobId = candidateJobId(candidate)
  const modelId = candidateModelId(candidate)
  const promptText = candidatePromptSnapshotText(candidate)
  const details = [
    ['节点', sourceNode.title],
    ['状态', preview.status],
    jobId ? ['Job', jobId] : undefined,
    modelId ? ['模型', modelId] : undefined,
    candidate.resourceId !== undefined ? ['资源', `Resource ${candidate.resourceId}`] : undefined,
  ].filter((item): item is string[] => Boolean(item))
  return (
    <section className="content-prompt-candidate-preview-dialog__diagnostics">
      {preview.failureReason ? (
        <div className="content-prompt-candidate-preview-dialog__reason" data-status={preview.statusTone}>
          <strong>失败原因</strong>
          <p>{preview.failureReason}</p>
        </div>
      ) : null}
      <dl>
        {details.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {promptText ? (
        <div className="content-prompt-candidate-preview-dialog__prompt">
          <strong>提示词快照</strong>
          <pre>{promptText}</pre>
        </div>
      ) : null}
    </section>
  )
}

function areCreativeFlowNodePropsEqual(
  previous: NodeProps<Node<CreativeFlowNodeData>>,
  next: NodeProps<Node<CreativeFlowNodeData>>,
): boolean {
  return previous.id === next.id
    && previous.selected === next.selected
    && previous.dragging === next.dragging
    && previous.data.item === next.data.item
    && previous.data.focused === next.data.focused
    && previous.data.nodes === next.data.nodes
    && previous.data.prompt === next.data.prompt
    && previous.data.referenceTargetNodeId === next.data.referenceTargetNodeId
    && previous.data.candidateSelections === next.data.candidateSelections
    && previous.data.candidateBadge === next.data.candidateBadge
    && creativeFlowNodeCandidatePreviewsKey(previous.data.candidatePreviews) === creativeFlowNodeCandidatePreviewsKey(next.data.candidatePreviews)
    && previous.data.onContextMenu === next.data.onContextMenu
    && previous.data.onCandidatePreviewOpen === next.data.onCandidatePreviewOpen
    && previous.data.onCandidateRemove === next.data.onCandidateRemove
    && previous.data.onCandidateSelect === next.data.onCandidateSelect
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
  const previews = target.candidates.flatMap((candidate, index) => {
    const selected = candidate.selected || (explicitSelectionId === candidate.id && !repeatedIds.has(candidate.id))
    if (!candidatePreviewShouldShow(candidate, selected)) return []
    const statusView = candidatePreviewStatusView(candidate, selected)
    const failureReason = candidateFailureReason(candidate)
    return [{
      key: candidatePreviewKey(candidate, index),
      id: candidate.id,
      title: candidate.title || candidate.id,
      status: statusView.label,
      statusTone: statusView.tone,
      ...(candidate.resourceId !== undefined ? { resourceId: candidate.resourceId } : {}),
      resourceKind: candidate.resourceKind ?? mediaKindForNode(target.node),
      candidate,
      ...(failureReason ? { failureReason } : {}),
      selected,
      selectable: candidatePreviewCanSelect(candidate, selected),
      retryable: candidatePreviewCanRetry(candidate),
      removable: true,
    }]
  })
  return previews.map((preview) => ({ ...preview, candidateCount: previews.length }))
}

function resourcePreviewForNode(node: ContentCanvasNode): CreativeFlowNodeCandidatePreview | null {
  const resourceId = numericRecordField(node.record.resourceId) ?? numericRecordField(node.record.resource_id) ?? numericRecordField(node.entityKey)
  if (resourceId === undefined) return null
  return {
    key: `resource:${resourceId}`,
    id: `resource:${resourceId}`,
    title: node.title || `Resource ${resourceId}`,
    status: node.record.source === 'prompt_reference' ? 'Raw Resource' : node.subtitle || '资源',
    statusTone: 'ready',
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
    preview.statusTone,
    preview.failureReason ?? '',
    preview.selected ? 'selected' : '',
    preview.selectable ? 'selectable' : '',
    preview.retryable ? 'retryable' : '',
    preview.removable ? 'removable' : '',
    preview.candidateCount ?? '',
  ].join(':')).join('|')
}

function previewStatusLabel(preview: CreativeFlowNodeCandidatePreview): string {
  const count = preview.candidateCount && preview.candidateCount > 1 ? ` · ${preview.candidateCount} 候选` : ''
  return `${preview.status}${count}`
}

function candidatePreviewStatusView(
  candidate: ContentCanvasCandidate,
  selected: boolean,
): { label: string; tone: CreativeFlowNodeCandidatePreview['statusTone'] } {
  if (selected) return { label: '当前候选', tone: 'ready' }
  const status = normalizedCandidateStatus(candidate)
  if (status === 'queued' || status === 'pending') return { label: '排队中', tone: 'running' }
  if (status === 'running') return { label: '生成中', tone: 'running' }
  if (status === 'failed') return { label: '生成失败', tone: 'failed' }
  if (status === 'canceled' || status === 'cancelled') return { label: '已取消', tone: 'failed' }
  if (status === 'imported') return { label: '已导入', tone: 'imported' }
  if (status === 'succeeded' || candidate.resourceId !== undefined || candidate.artifactRef) return { label: '可选择', tone: 'ready' }
  return { label: '候选', tone: 'neutral' }
}

function candidatePreviewCanSelect(candidate: ContentCanvasCandidate, selected: boolean): boolean {
  if (selected) return true
  const status = normalizedCandidateStatus(candidate)
  if (status === 'queued' || status === 'pending' || status === 'running' || status === 'failed' || status === 'canceled' || status === 'cancelled') return false
  return candidate.resourceId !== undefined || Boolean(candidate.artifactRef) || status === 'succeeded' || status === 'imported' || status === undefined
}

function candidatePreviewCanRetry(candidate: ContentCanvasCandidate): boolean {
  const status = normalizedCandidateStatus(candidate)
  return status === 'failed' || status === 'canceled' || status === 'cancelled'
}

function candidateRetryGenerationOptions(preview: CreativeFlowNodeCandidatePreview): Partial<ContentCanvasCandidateGenerationOptions> {
  const candidate = preview.candidate
  if (!candidate) return {}
  const modelId = candidateModelId(candidate)
  const params = candidateModelParams(candidate)
  return {
    ...(modelId ? { modelId } : {}),
    ...(params ? { params } : {}),
  }
}

function candidatePreviewPlaceholderIcon(preview: CreativeFlowNodeCandidatePreview): LucideIcon {
  if (preview.statusTone === 'running') return Clock3
  if (preview.statusTone === 'failed') return X
  if (preview.statusTone === 'ready' || preview.statusTone === 'imported') return FileText
  return Sparkles
}

function candidateFailureReason(candidate: ContentCanvasCandidate): string | undefined {
  const status = normalizedCandidateStatus(candidate)
  if (status !== 'failed' && status !== 'canceled' && status !== 'cancelled') return undefined
  const producer = recordValue(candidate.producer)
  const promptSnapshot = recordValue(candidate.promptSnapshot)
  const output = firstRecord(candidate.outputs)
  const outputMetadata = recordValue(output?.metadata)
  const reason = firstText([
    candidateNote(candidate),
    producer?.error_message,
    producer?.errorMessage,
    producer?.failure_reason,
    producer?.failureReason,
    producer?.status_message,
    producer?.statusMessage,
    producer?.message,
    producer?.error,
    promptSnapshot?.error_message,
    promptSnapshot?.errorMessage,
    promptSnapshot?.message,
    promptBlockerSummary(promptSnapshot?.blockers),
    outputMetadata?.error_message,
    outputMetadata?.errorMessage,
    outputMetadata?.message,
    outputMetadata?.error,
  ])
  if (reason) return reason
  if (status === 'failed') return '生成任务失败，未返回具体错误。'
  if (status === 'canceled' || status === 'cancelled') return '生成任务已取消。'
  return undefined
}

function candidateNote(candidate: ContentCanvasCandidate): string | undefined {
  const note = stringRecordField(candidate.notes)
  if (!note) return undefined
  const status = normalizedCandidateStatus(candidate)
  const normalized = note.toLowerCase()
  if (status && normalized === status) return undefined
  if (['queued', 'pending', 'running', 'succeeded', 'failed', 'canceled', 'cancelled', 'imported'].includes(normalized)) return undefined
  if (normalized === 'workspace runtime candidate.') return undefined
  return note
}

function candidateJobId(candidate: ContentCanvasCandidate): string | undefined {
  const producer = recordValue(candidate.producer)
  const output = firstRecord(candidate.outputs)
  const outputMetadata = recordValue(output?.metadata)
  const promptSnapshot = recordValue(candidate.promptSnapshot)
  return firstText([
    producer?.job_id,
    producer?.jobId,
    producer?.task_id,
    producer?.taskId,
    outputMetadata?.job_id,
    outputMetadata?.jobId,
    outputMetadata?.task_id,
    outputMetadata?.taskId,
    promptSnapshot?.job_id,
    promptSnapshot?.jobId,
  ])
}

function candidateModelId(candidate: ContentCanvasCandidate): string | undefined {
  const producer = recordValue(candidate.producer)
  const promptSnapshot = recordValue(candidate.promptSnapshot)
  return firstText([
    producer?.model_id,
    producer?.modelId,
    producer?.model,
    promptSnapshot?.model_id,
    promptSnapshot?.modelId,
  ])
}

function candidateModelParams(candidate: ContentCanvasCandidate): ContentCanvasCandidateGenerationOptions['params'] | undefined {
  const producer = recordValue(candidate.producer)
  const promptSnapshot = recordValue(candidate.promptSnapshot)
  const params = recordValue(producer?.model_params)
    ?? recordValue(producer?.modelParams)
    ?? recordValue(promptSnapshot?.model_params)
    ?? recordValue(promptSnapshot?.modelParams)
  if (!params) return undefined
  const output: ContentCanvasCandidateGenerationOptions['params'] = {}
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') output[key] = value
  }
  return Object.keys(output).length ? output : undefined
}

function candidatePromptSnapshotText(candidate: ContentCanvasCandidate): string | undefined {
  const snapshot = recordValue(candidate.promptSnapshot)
  if (!snapshot) return undefined
  const compiledPrompt = recordValue(snapshot.compiled_prompt) ?? recordValue(snapshot.compiledPrompt)
  return firstText([
    compiledPrompt?.text,
    snapshot.prompt_text,
    snapshot.promptText,
    snapshot.text,
    snapshot.prompt,
    editPromptTextFromUnknown(snapshot.edit_prompt),
    editPromptTextFromUnknown(snapshot.editPrompt),
  ])
}

function promptBlockerSummary(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined
  const labels = value
    .map((item) => recordValue(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => firstText([item.message, item.ref, item.code]))
    .filter((item): item is string => Boolean(item))
  return labels.length ? labels.join('；') : undefined
}

function editPromptTextFromUnknown(value: unknown): string | undefined {
  if (typeof value === 'string') return stringRecordField(value)
  const record = recordValue(value)
  return record ? firstText([record.text, record.prompt, record.description]) : undefined
}

function normalizedCandidateStatus(candidate: ContentCanvasCandidate): string | undefined {
  const explicit = stringRecordField(candidate.status)?.toLowerCase()
  const derived = derivedCandidateStatus(candidate)
  if (derived === 'failed' || derived === 'canceled' || derived === 'cancelled') return derived
  return explicit ?? derived
}

function derivedCandidateStatus(candidate: ContentCanvasCandidate): string | undefined {
  const producer = recordValue(candidate.producer)
  const promptSnapshot = recordValue(candidate.promptSnapshot)
  const output = firstRecord(candidate.outputs)
  const outputMetadata = recordValue(output?.metadata)
  const status = firstText([
    producer?.status,
    producer?.state,
    producer?.phase,
    producer?.result,
    promptSnapshot?.status,
    promptSnapshot?.state,
    outputMetadata?.status,
    outputMetadata?.state,
  ])?.toLowerCase()
  if (status && ['failed', 'failure', 'error', 'errored'].includes(status)) return 'failed'
  if (status && ['canceled', 'cancelled'].includes(status)) return status
  if (firstText([
    producer?.error_message,
    producer?.errorMessage,
    producer?.failure_reason,
    producer?.failureReason,
    producer?.error,
    promptSnapshot?.error_message,
    promptSnapshot?.errorMessage,
    outputMetadata?.error_message,
    outputMetadata?.errorMessage,
    outputMetadata?.error,
  ])) return 'failed'
  return status
}

function normalizedCandidateDecisionStatus(candidate: ContentCanvasCandidate): string | undefined {
  return stringRecordField(candidate.decisionStatus)?.toLowerCase()
}

function candidateDecisionReason(candidate: ContentCanvasCandidate): string | undefined {
  return stringRecordField(candidate.decisionReason)
}

function candidatePreviewShouldShow(candidate: ContentCanvasCandidate, selected: boolean): boolean {
  const decision = normalizedCandidateDecisionStatus(candidate)
  if (decision !== 'reject' && decision !== 'rejected') return true
  const reason = candidateDecisionReason(candidate)
  return selected && reason !== 'content_canvas_removed_candidate'
}

function firstText(values: unknown[]): string | undefined {
  for (const value of values) {
    const text = stringRecordField(value)
    if (text) return text
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return undefined
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

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  return Array.isArray(value) ? value.find((item): item is Record<string, unknown> => Boolean(recordValue(item))) : undefined
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

function contentPromptCanvasNodeDropAcceptsPayload(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(CONTENT_PROMPT_CANVAS_NODE_DRAG_MIME)
}

function readContentPromptCanvasNodeDragPayload(dataTransfer: DataTransfer): ContentPromptCanvasNodeDragPayload | null {
  if (!contentPromptCanvasNodeDropAcceptsPayload(dataTransfer)) return null
  try {
    const payload = JSON.parse(dataTransfer.getData(CONTENT_PROMPT_CANVAS_NODE_DRAG_MIME)) as unknown
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
    const nodeId = stringRecordField((payload as Record<string, unknown>).nodeId)
    return nodeId ? { nodeId } : null
  } catch {
    return null
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

function contentCanvasNodeLibraryNodes(
  nodes: ContentCanvasNode[],
  query: string,
  scope: ContentCanvasDocumentScope,
): ContentCanvasNode[] {
  const needle = query.trim().toLowerCase()
  const productions = nodes.filter((node) => node.kind === 'production')
  return nodes
    .filter(contentCanvasNodeCanJoinDocument)
    .filter((node) => contentCanvasNodeCanJoinCanvasScope(node, scope, productions))
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

function contentCanvasNodeCanJoinDocument(node: ContentCanvasNode): boolean {
  return contentCanvasNodeCanRenderInPromptCanvas(node)
}

function contentCanvasNodeCanRenderInPromptCanvas(node: ContentCanvasNode): boolean {
  return node.kind === 'resource' || isCreativeCanvasVisibleNode(node)
}

function contentCanvasNodeCanJoinCanvasScope(
  node: ContentCanvasNode,
  scope: ContentCanvasDocumentScope,
  productions: ContentCanvasNode[],
): boolean {
  if (scope.kind === 'global') return true
  return contentCanvasNodeBelongsToProductionScope(node, scope.productionId, productions)
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
    subtitle: `${contentCanvasNodeDisplayKind(node)} · ${node.subtitle}`,
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

function creativeCanvasContentNodeViewportSize(node: ContentCanvasNode): { width: number; height: number } {
  return creativeCanvasNodeViewportSize(creativeNodeFromContentNode(node))
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

function quickCreateDialogSessionKey(state: CreativeCanvasQuickCreateDialogState | null): string {
  if (!state) return 'closed'
  return `${quickAddOptionKey(state.option)}:${state.position.x}:${state.position.y}`
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

function quickCreateDialogEntityKind(state: CreativeCanvasQuickCreateDialogState | null): string {
  const option = state?.option
  if (!option) return 'content_unit'
  if (option.kind === 'child') return option.childKind === 'state' ? 'setting_state' : option.childKind
  if (option.nodeKind === 'task_video'
    || option.nodeKind === 'task_image'
    || option.nodeKind === 'task_audio'
    || option.nodeKind === 'task_text') return 'content_unit'
  if (option.nodeKind === 'asset_image'
    || option.nodeKind === 'asset_video'
    || option.nodeKind === 'asset_audio') return 'asset'
  return option.nodeKind
}

function quickCreateDialogIdPrefix(state: CreativeCanvasQuickCreateDialogState | null, fallback: string): string {
  const entityKind = quickCreateDialogEntityKind(state)
  if (entityKind === 'content_unit') return 'cu'
  if (entityKind === 'scene_moment') return 'scene'
  if (entityKind === 'expression_unit') return 'expression'
  if (entityKind === 'setting_state') return 'state'
  return entityKind || fallback.replace(/_\d+$/, '') || 'node'
}

function quickCreateExistingEntityIds(nodes: ContentCanvasNode[], entityKind: string): string[] {
  const nodeKind = contentCanvasNodeKindForEntityKind(entityKind)
  return nodes
    .filter((node) => node.kind === nodeKind)
    .flatMap((node) => [node.entityKey, node.id, node.record.id, node.record.ID])
    .map((value) => {
      if (typeof value === 'string') return value.trim()
      if (typeof value === 'number' && Number.isFinite(value)) return String(value)
      return ''
    })
    .filter(Boolean)
}

function contentCanvasNodeKindForEntityKind(entityKind: string): ContentCanvasNodeKind {
  if (entityKind === 'setting_state') return 'state'
  if (entityKind === 'content_unit'
    || entityKind === 'scene_moment'
    || entityKind === 'production'
    || entityKind === 'segment'
    || entityKind === 'expression_unit'
    || entityKind === 'keyframe'
    || entityKind === 'storyboard'
    || entityKind === 'asset'
    || entityKind === 'setting'
    || entityKind === 'audio_cue') return entityKind
  return 'content_unit'
}

function quickCreateDialogPlanItems(input: {
  childTimelineNamespaceKind?: string
  copy: { title: string; idPlaceholder: string; titlePlaceholder: string }
  id: string
  needsChildTimelineNamespaceKind: boolean
  needsMount: boolean
  needsProductionSegment: boolean
  needsTimelineNamespaceParent: boolean
  needsVisualOwner: boolean
  newProductionId: string
  newProductionTitle: string
  newSegmentId: string
  newSegmentTitle: string
  newSettingId: string
  newSettingTitle: string
  newStateId: string
  newStateTitle: string
  productionMode: CreateReferenceMode
  segmentMode: CreateReferenceMode
  selectedChildTimelineNamespaceKind: string
  selectedProduction?: ContentCanvasNode
  selectedProductionId: string
  selectedSegment?: ContentCanvasNode
  selectedSegmentId: string
  selectedSetting?: ContentCanvasNode
  selectedSettingId: string
  selectedState?: ContentCanvasNode
  selectedStateId: string
  selectedTimelineNamespaceParent?: ContentCanvasNode
  selectedVisualOwner?: ContentCanvasNode
  selectedVisualOwnerId: string
  settingMode: CreateReferenceMode
  state: CreativeCanvasQuickCreateDialogState | null
  stateMode: CreateReferenceMode
  title: string
}): QuickCreatePlanItem[] {
  const option = input.state?.option
  if (!option) return []
  const id = input.id.trim() || input.copy.idPlaceholder
  const title = input.title.trim() || input.copy.titlePlaceholder
  const items: QuickCreatePlanItem[] = []
  if (option.kind === 'child') {
    items.push({
      label: '父节点',
      value: `${contentCanvasNodeDisplayKind(option.parentNode)} · ${option.parentNode.title}`,
      tone: 'context',
    })
  } else {
    items.push({
      label: '入口',
      value: input.copy.title,
      tone: 'context',
    })
  }
  if (input.needsTimelineNamespaceParent) {
    items.push({
      label: '时间线',
      value: input.selectedTimelineNamespaceParent
        ? timelineNamespaceLabel(input.selectedTimelineNamespaceParent)
        : '未选择',
      tone: 'use',
    })
  }
  if (input.needsChildTimelineNamespaceKind) {
    items.push({
      label: '子层级',
      value: input.selectedChildTimelineNamespaceKind || input.childTimelineNamespaceKind || '未选择',
      tone: 'context',
    })
  }
  if (input.needsProductionSegment) {
    const productionFallbackId = `${id}_production`
    const productionFallbackTitle = `${title} 制作`
    items.push(input.productionMode === 'new'
      ? {
        label: '新建制作',
        value: quickCreatePlanValue(input.newProductionTitle, input.newProductionId, productionFallbackTitle, productionFallbackId),
        tone: 'create',
      }
      : {
        label: '使用制作',
        value: quickCreatePlanNodeValue(input.selectedProduction, input.selectedProductionId),
        tone: 'use',
      })
    const segmentFallbackId = `${id}_segment`
    const segmentFallbackTitle = `${title} 段落`
    items.push(input.productionMode === 'new' || input.segmentMode === 'new'
      ? {
        label: '新建段落',
        value: quickCreatePlanValue(input.newSegmentTitle, input.newSegmentId, segmentFallbackTitle, segmentFallbackId),
        tone: 'create',
      }
      : {
        label: '使用段落',
        value: quickCreatePlanNodeValue(input.selectedSegment, input.selectedSegmentId),
        tone: 'use',
      })
  }
  if (input.needsVisualOwner) {
    items.push({
      label: '挂载对象',
      value: quickCreatePlanNodeValue(input.selectedVisualOwner, input.selectedVisualOwnerId),
      tone: 'use',
    })
  }
  if (input.needsMount) {
    const settingFallbackId = `${id}_setting`
    const settingFallbackTitle = `${title} 设定`
    items.push(input.settingMode === 'new'
      ? {
        label: '新建设定',
        value: quickCreatePlanValue(input.newSettingTitle, input.newSettingId, settingFallbackTitle, settingFallbackId),
        tone: 'create',
      }
      : {
        label: '使用设定',
        value: quickCreatePlanNodeValue(input.selectedSetting, input.selectedSettingId),
        tone: 'use',
      })
    const stateFallbackId = `${id}_state`
    const stateFallbackTitle = `${title} 状态`
    items.push(input.settingMode === 'new' || input.stateMode === 'new'
      ? {
        label: '新建状态',
        value: quickCreatePlanValue(input.newStateTitle, input.newStateId, stateFallbackTitle, stateFallbackId),
        tone: 'create',
      }
      : {
        label: '使用状态',
        value: quickCreatePlanNodeValue(input.selectedState, input.selectedStateId),
        tone: 'use',
      })
  }
  items.push({
    label: '目标节点',
    value: quickCreatePlanValue(title, id, input.copy.titlePlaceholder, input.copy.idPlaceholder),
    tone: 'create',
  })
  return items
}

function quickCreatePlanValue(title: string, id: string, fallbackTitle: string, fallbackId: string): string {
  return `${title.trim() || fallbackTitle} (${id.trim() || fallbackId})`
}

function quickCreatePlanNodeValue(node: ContentCanvasNode | undefined, fallbackId: string): string {
  if (node) return `${node.title} (${node.entityKey || node.id})`
  return fallbackId || '未选择'
}

function quickCreateDialogNeedsProductionSegment(state: CreativeCanvasQuickCreateDialogState | null): boolean {
  void state
  return false
}

function quickCreateDialogNeedsTimelineNamespaceParent(state: CreativeCanvasQuickCreateDialogState | null): boolean {
  return state?.option.kind === 'direct' && state.option.nodeKind === 'scene_moment'
}

function quickCreateDialogNeedsSettingStateMount(state: CreativeCanvasQuickCreateDialogState | null): boolean {
  return state?.option.kind === 'direct'
    && (state.option.nodeKind === 'asset_image'
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
    legacyTimelineMount: true,
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

function quickCreateTimelineNamespaceInput(input: {
  needsTimelineNamespaceParent: boolean
  selectedTimelineNamespaceParent?: ContentCanvasNode
}): Partial<ContentCanvasCreateNodeInput> {
  const namespaceNode = input.selectedTimelineNamespaceParent
  const namespacePath = namespaceNode?.sourcePath?.trim()
  if (!input.needsTimelineNamespaceParent || !namespaceNode || !namespacePath) return {}
  return {
    targetTimelineNamespaceNodeId: namespaceNode.id,
    targetTimelineNamespaceId: namespaceNode.entityKey,
    targetTimelineNamespaceTitle: namespaceNode.title,
    targetTimelineNamespaceKind: namespaceNode.domainKind ?? stringRecordField(namespaceNode.record.namespace_kind) ?? namespaceNode.kind,
    targetTimelineNamespacePath: namespacePath,
  }
}

function quickCreateChildTimelineNamespaceKind(
  state: CreativeCanvasQuickCreateDialogState | null,
  vocabulary: ContentCanvasNamespaceVocabularyOptions,
): string | undefined {
  if (state?.option.kind !== 'child') return undefined
  if (state.option.childKind !== 'segment') return undefined
  if (state.option.parentNode.domainCategory !== 'timeline_namespace') return undefined
  return contentCanvasChildTimelineNamespaceKind(state.option.parentNode, vocabulary)
}

function quickCreateChildTimelineNamespaceInput(input: {
  needsChildTimelineNamespaceKind: boolean
  selectedChildTimelineNamespaceKind: string
}): Partial<ContentCanvasCreateNodeInput> {
  if (!input.needsChildTimelineNamespaceKind) return {}
  const timelineNamespaceKind = input.selectedChildTimelineNamespaceKind.trim()
  return timelineNamespaceKind ? { timelineNamespaceKind } : {}
}

function quickCreateMountInput(input: {
  id: string
  needsMount: boolean
  newSettingId: string
  newSettingTitle: string
  newStateId: string
  newStateTitle: string
  namespaceVocabulary: ContentCanvasNamespaceVocabularyOptions
  selectedSettingId: string
  selectedStateId: string
  settingMode: 'existing' | 'new'
  stateMode: 'existing' | 'new'
  title: string
}): Partial<ContentCanvasCreateNodeInput> {
  if (!input.needsMount) return {}
  const createTargetSetting = input.settingMode === 'new'
  const createTargetState = createTargetSetting || input.stateMode === 'new'
  const settingNamespaceKind = contentCanvasRootSettingNamespaceKind(input.namespaceVocabulary)
  const stateNamespaceKind = childSettingNamespaceKindForQuickCreate(input.namespaceVocabulary, settingNamespaceKind)
  return {
    createTargetSetting,
    createTargetState,
    targetSettingId: createTargetSetting
      ? input.newSettingId.trim() || `${input.id}_setting`
      : input.selectedSettingId,
    targetSettingTitle: createTargetSetting
      ? input.newSettingTitle.trim() || `${input.title} 设定`
      : undefined,
    targetSettingKind: settingNamespaceKind,
    targetSettingNamespaceKind: settingNamespaceKind,
    targetStateId: createTargetState
      ? input.newStateId.trim() || `${input.id}_state`
      : input.selectedStateId,
    targetStateTitle: createTargetState
      ? input.newStateTitle.trim() || `${input.title} 状态`
      : undefined,
    targetStateNamespaceKind: stateNamespaceKind,
  }
}

function childSettingNamespaceKindForQuickCreate(
  vocabulary: ContentCanvasNamespaceVocabularyOptions,
  parentKind: string,
): string {
  return contentCanvasChildSettingNamespaceKind({
    id: 'setting:quick-create',
    entityKey: 'quick-create',
    kind: 'setting',
    title: 'Quick create setting',
    subtitle: parentKind,
    summary: '',
    status: 'neutral',
    metrics: [],
    sourcePath: '',
    record: { namespace_kind: parentKind },
    candidates: [],
    position: { x: 0, y: 0 },
  }, vocabulary)
}

function contentCanvasTimelineNamespaceParentsForSceneMoment(
  nodes: ContentCanvasNode[],
  scope: ContentCanvasDocumentScope,
): ContentCanvasNode[] {
  const productions = nodes.filter((node) => node.kind === 'production')
  const candidates = nodes
    .filter((node) => node.domainCategory === 'timeline_namespace' && Boolean(node.sourcePath?.trim()))
    .filter((node) => scope.kind === 'global' || contentCanvasNodeBelongsToProductionScope(node, scope.productionId, productions))
  const leafIds = contentCanvasLeafTimelineNamespaceNodeIds(candidates)
  return candidates
    .filter((node) => leafIds.has(node.id))
    .sort((left, right) => (
      contentCanvasTimelineNamespaceParentRank(right) - contentCanvasTimelineNamespaceParentRank(left)
      || left.title.localeCompare(right.title)
    ))
}

function contentCanvasLeafTimelineNamespaceNodeIds(nodes: ContentCanvasNode[]): Set<string> {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const parentIds = new Set<string>()
  for (const child of nodes) {
    for (const ancestorId of child.domainAncestorNodeIds ?? []) {
      if (nodeIds.has(ancestorId) && ancestorId !== child.id) parentIds.add(ancestorId)
    }
  }
  for (const parent of nodes) {
    const parentDir = contentCanvasNamespaceSourceDir(parent)
    if (!parentDir) continue
    for (const child of nodes) {
      if (child.id === parent.id) continue
      const childPath = child.sourcePath?.trim()
      if (childPath && childPath.startsWith(`${parentDir}/`)) parentIds.add(parent.id)
    }
  }
  return new Set(nodes.filter((node) => !parentIds.has(node.id)).map((node) => node.id))
}

function contentCanvasNamespaceSourceDir(node: ContentCanvasNode): string {
  return node.sourcePath?.trim().replace(/\/[^/]*\.json$/, '') ?? ''
}

function contentCanvasTimelineNamespaceParentRank(node: ContentCanvasNode): number {
  if (node.kind === 'segment') return 2
  if (node.kind === 'production') return 1
  return 0
}

function timelineNamespaceLabel(node: ContentCanvasNode): string {
  const kind = node.domainKind ?? stringRecordField(node.record.namespace_kind) ?? node.kind
  return `${kind} · ${node.title}`
}

function contentCanvasScopeLabel(scope: ContentCanvasDocumentScope): string {
  if (scope.kind === 'production') return scope.productionTitle ? `制作内容画布 · ${scope.productionTitle}` : `制作内容画布 · ${scope.productionId}`
  return '全局内容画布'
}

function nextContentCanvasTitleSuggestion(documents: ContentCanvasDocument[]): string {
  const base = '自由内容画布'
  if (!contentCanvasDocumentTitleExists(base, documents)) return base
  for (let index = 2; index < 1000; index += 1) {
    const title = `${base} ${index}`
    if (!contentCanvasDocumentTitleExists(title, documents)) return title
  }
  return `${base} ${Date.now().toString(36)}`
}

function contentCanvasDocumentTitleExists(value: string, documents: ContentCanvasDocument[]): boolean {
  const normalized = normalizeContentCanvasDocumentTitle(value).toLocaleLowerCase('zh-CN')
  return documents.some((document) => (
    normalizeContentCanvasDocumentTitle(document.title).toLocaleLowerCase('zh-CN') === normalized
  ))
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
