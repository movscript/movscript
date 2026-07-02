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
  SelectionMode,
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
import { ChevronLeft, ChevronRight, Clock3, FileText, FolderOpen, GitBranch, Image as ImageIcon, Info, Layers3, Link2, LocateFixed, Move, Music, Pencil, Plus, RotateCcw, Save, Search, Sparkles, Star, Trash2, Ungroup, Video, X, type LucideIcon } from 'lucide-react'

import {
  evaluateGenerationReadiness,
  generationDefaultReferenceRoleForMediaType,
  generationBackendPreflightBlockerMessages,
  generationBackendPreflightIsReady,
  generationModelSupportedParams,
  generationParamDefaults,
  generationReferenceAssetsFromPromptText,
  generationReferenceRoleLabel,
  generationReferenceRoleOptionsForMediaType,
  generationReadinessBlockerMessages,
  generationReadinessIsReady,
  type GenerationBackendPreflightResult,
  type GenerationIntentPayload,
} from '@movscript/core/generation'
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
  GenerationCallBadge,
  GenerationCallComposerRoot,
  GenerationCallConfigBlock,
  GenerationCallField,
  GenerationCallFooter,
  GenerationCallMessages,
  GenerationCallMetaRow,
  GenerationCallPromptBlock,
  GenerationReferenceRoleMenu,
} from '@movscript/ui/business/generation'

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
  type ContentCanvasDocumentGroup,
  type ContentCanvasDocumentGroupInput,
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
  contentCanvasGenerationCapability,
  contentCanvasGenerationIntent,
  contentCanvasGenerationOperationOptions,
  contentCanvasReferenceAssetsForOperation,
} from './contentCanvasGenerationOptions'
import {
  contentCanvasNodeBelongsToProductionScope,
  contentCanvasFirstSegmentIdForProduction,
  contentCanvasSegmentsForProduction,
} from './contentPromptCanvasQuickCreateModel'
import { contentCanvasGenerationTargetForNode } from './contentCanvasWorkspaceGenerationModel'
import {
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

import {
  ContentCanvasNameDialog,
  ContentPromptCandidatePreviewDialog,
  ContentPromptCanvasAssetDrawerPager,
  ContentPromptCanvasAssetLibraryCard,
  ContentPromptCanvasQuickCreateDialog,
  contentPromptCanvasNodeTypes as nodeTypes,
} from './ContentPromptCanvasPanelParts'
import {
  CREATIVE_CANVAS_MINIMAP_NODE_LIMIT,
  CONTENT_PROMPT_ASSET_LIBRARY_PAGE_SIZE,
  CONTENT_PROMPT_CANVAS_NODE_DRAG_MIME,
  appendPromptReferencePreviewEdge,
  candidatePreviewsForNode,
  candidateRetryGenerationOptions,
  contentCanvasScopeLabel,
  contentCanvasNodeLibraryLabel,
  contentCanvasNodeLibraryNodes,
  contentCanvasUploadedResourceFromDropEvent,
  contentPromptCanvasNodeDropAcceptsPayload,
  contentPromptNodeListKey,
  contentPromptReferenceRoleMenuPoint,
  contextMenuActionKey,
  creativeCanvasContentNodeViewportSize,
  creativeCanvasMeasuredNodeSizes,
  creativeCanvasNodeViewportSize,
  creativeCanvasQuickAddChildLabel,
  creativeCanvasQuickAddOptionsForPosition,
  creativeCanvasResourceTargetForPosition,
  creativeCanvasNodeSemanticKey,
  creativeFlowContentNodesBounds,
  creativeFlowNodeCandidatePreviewsKey,
  creativeFlowGroupNodesFromCanvasGroups,
  edgeLabel,
  flowEdgeListHasSourceTargetPair,
  flowPositionsByNodeId,
  isCreativeFlowContentNode,
  isCreativeFlowGroupNode,
  isCreativePromptEditableNode,
  isTextEditingTarget,
  mergePromptReferencePreviewEdges,
  mergeQuickAddInputDefaults,
  nextContentCanvasTitleSuggestion,
  promptDraftForNode,
  promptReferenceMediaTypeForContentNode,
  quickAddMediaIcon,
  quickAddOptionKey,
  readContentPromptCanvasNodeDragPayload,
  reconcileCreativeFlowNodes,
  selectionKindForPromptNode,
  stableContentPromptJSONString,
  type ContentCanvasNameDialogState,
  type ContentPromptCanvasNodeDragPayload,
  type CreativeCanvasChildKind,
  type CreativeCanvasContextMenuState,
  type CreativeCanvasDirectKind,
  type CreativeCanvasGroupDragSnapshot,
  type CreativeCanvasQuickAddMenuState,
  type CreativeCanvasQuickAddOption,
  type CreativeCanvasQuickCreateDialogState,
  type CreativeCanvasReferenceRoleMenuState,
  type CreativeFlowCandidatePreviewDialogState,
  type CreativeFlowContentNode,
  type CreativeFlowGroupNode,
  type CreativeFlowNode,
  type CreativeFlowNodeCandidatePreview,
  type CreativeFlowNodeData,
  type PromptReferenceMediaType,
} from './ContentPromptCanvasPanelModel'

export function ContentPromptCanvasPanel({
  activeCanvasDocument,
  candidateSelections,
  canvasDocuments,
  canvasGroups,
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
  onCandidatePreflight,
  onCandidatePromptPreview,
  onCandidateResourceSelect,
  onCandidateRemove,
  onCandidateSelect,
  onCandidateNodeSelect,
  onCandidateUpload,
  onCanvasDeselect,
  onClearManualPositions,
  onClearManualPositionsForNodes,
  onCreateChild,
  onCreateCanvas,
  onCreateGroup,
  onCreateNode,
  onDeleteNode,
  onExpressionPromptChange,
  onGenerationReferenceAppend,
  onNodePositionsCommit,
  onViewportCommit,
  onPromptChange,
  onPromptCommit,
  onReferencePoolCommit,
  onRemoveNodeFromCanvas,
  onRemoveGroupsFromCanvas,
  onRemoveNodesFromCanvas,
  onRenameCanvas,
  onSaveCanvas,
  onStructuredPromptCommit,
  onResourceOpen,
  onSelectNode,
}: {
  activeCanvasDocument?: ContentCanvasDocument
  candidateSelections: CandidateSelections
  canvasDocuments: ContentCanvasDocument[]
  canvasGroups: ContentCanvasDocumentGroup[]
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
  onCandidatePreflight?: (node: ContentCanvasNode | undefined, options?: Partial<ContentCanvasCandidateGenerationOptions>) => Promise<GenerationBackendPreflightResult>
  onCandidatePromptPreview: (node: ContentCanvasNode | undefined) => Promise<ContentCanvasCandidatePromptPreview>
  onCandidateResourceSelect: (node: ContentCanvasNode | undefined, resource: ContentCanvasUploadedResource, position?: ContentCanvasNodePosition) => void
  onCandidateRemove: (node: ContentCanvasNode | undefined, candidate: ContentCanvasCandidate) => void
  onCandidateSelect: (node: ContentCanvasNode | undefined, candidate: ContentCanvasCandidate) => void
  onCandidateNodeSelect: (node: ContentCanvasNode) => void
  onCandidateUpload: (node: ContentCanvasNode | undefined, file: File) => void
  onCanvasDeselect: () => void
  onClearManualPositions: () => void
  onClearManualPositionsForNodes: (nodeIds: string[]) => void
  onCreateChild: (node: ContentCanvasNode, childKind: CreativeCanvasChildKind, position?: ContentCanvasNodePosition, input?: ContentCanvasCreateNodeInput) => void
  onCreateCanvas: (title?: string) => void
  onCreateGroup: (input: ContentCanvasDocumentGroupInput) => void
  onCreateNode: (nodeKind: CreativeCanvasDirectKind, position: ContentCanvasNodePosition, input?: ContentCanvasCreateNodeInput) => void
  onDeleteNode: (node: ContentCanvasNode) => void
  onExpressionPromptChange: (nodeId: string, prompt: string) => void
  onGenerationReferenceAppend: (targetNode: ContentCanvasNode | undefined, sourceNode: ContentCanvasNode | undefined, options?: { role?: string; mediaType?: string }) => void
  onNodePositionsCommit: (nodePositions: Record<string, { x: number; y: number }>) => void
  onViewportCommit: (viewport: Viewport) => void
  onPromptChange: (assetId: string, prompt: string) => void
  onPromptCommit: (node: ContentCanvasNode | undefined, prompt: string) => void
  onReferencePoolCommit: (node: ContentCanvasNode | undefined, prompt: string, generationReferences: Array<Record<string, unknown>>) => void
  onRemoveNodeFromCanvas: (nodeId: string) => void
  onRemoveGroupsFromCanvas: (groupIds: string[]) => void
  onRemoveNodesFromCanvas: (nodeIds: string[]) => void
  onRenameCanvas: (canvasId: string, title: string) => void
  onSaveCanvas: () => void
  onStructuredPromptCommit: (node: ContentCanvasNode | undefined, structured: Record<string, unknown>) => void
  onResourceOpen: (node: ContentCanvasNode) => void
  onSelectNode: (kind: InspectorSelection['kind'], nodeId: string) => void
}) {
  void onCandidateUpload
  void onClearManualPositions
  void onClearManualPositionsForNodes
  const creativeGraph = useMemo(
    () => buildCreativeCanvasGraph({ nodes, edges }, { nodeIds: canvasNodeIds }),
    [canvasNodeIds, edges, nodes],
  )
  const [contextMenu, setContextMenu] = useState<CreativeCanvasContextMenuState | null>(null)
  const [quickAddMenu, setQuickAddMenu] = useState<CreativeCanvasQuickAddMenuState | null>(null)
  const [quickCreateDialog, setQuickCreateDialog] = useState<CreativeCanvasQuickCreateDialogState | null>(null)
  const [canvasNameDialog, setCanvasNameDialog] = useState<ContentCanvasNameDialogState | null>(null)
  const [candidatePreviewDialog, setCandidatePreviewDialog] = useState<CreativeFlowCandidatePreviewDialogState | null>(null)
  const [referenceRoleMenu, setReferenceRoleMenu] = useState<CreativeCanvasReferenceRoleMenuState | null>(null)
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false)
  const [assetLibraryPage, setAssetLibraryPage] = useState(1)
  const [nodeLibraryOpen, setNodeLibraryOpen] = useState(false)
  const [nodeLibraryQuery, setNodeLibraryQuery] = useState('')
  const [assetLibraryNotice, setAssetLibraryNotice] = useState<string | null>(null)
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<CreativeFlowNode, Edge> | null>(null)
  const consumedFocusRequestIdRef = useRef<number | null>(null)
  const focusFrameRef = useRef<number | null>(null)
  const suppressNextNodeClickRef = useRef(false)
  const groupDragSnapshotRef = useRef<CreativeCanvasGroupDragSnapshot | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const flowNodeSemanticSyncKeyRef = useRef<string | null>(null)
  const [localPromptReferenceEdges, setLocalPromptReferenceEdges] = useState<Edge[]>([])
  useEffect(() => () => {
    if (focusFrameRef.current !== null) window.cancelAnimationFrame(focusFrameRef.current)
  }, [])
  const activeCanvasScope = useMemo(
    () => contentCanvasDocumentScope(activeCanvasDocument),
    [activeCanvasDocument],
  )
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])
  const canvasNodeIdSet = useMemo(() => new Set(canvasNodeIds), [canvasNodeIds])
  const visibleCreativeNodeIdSet = useMemo(
    () => new Set(creativeGraph.nodes.map((node) => node.id)),
    [creativeGraph.nodes],
  )
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
  const contentNodesKey = useMemo(
    () => contentPromptNodeListKey(nodes),
    [nodes],
  )
  const candidateSelectionsKey = useMemo(
    () => stableContentPromptJSONString(candidateSelections),
    [candidateSelections],
  )
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
  const commitReferencePoolFromNode = useCallback((node: ContentCanvasNode, prompt: string, generationReferences: Array<Record<string, unknown>>) => {
    onReferencePoolCommit(node, prompt, generationReferences)
  }, [onReferencePoolCommit])
  const appendLocalPromptReferenceEdge = useCallback((sourceNode: ContentCanvasNode, targetNode: ContentCanvasNode) => {
    if (!visibleCreativeNodeIdSet.has(sourceNode.id) || !visibleCreativeNodeIdSet.has(targetNode.id)) return
    setLocalPromptReferenceEdges((current) => appendPromptReferencePreviewEdge(current, sourceNode, targetNode))
  }, [visibleCreativeNodeIdSet])
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
    onGenerationReferenceAppend(target, sourceNode)
    appendLocalPromptReferenceEdge(sourceNode, target)
  }, [activePromptReferenceTargetId, appendLocalPromptReferenceEdge, nodeById, onGenerationReferenceAppend])
  const appendReferenceToPromptTargetWithRole = useCallback((
    targetNode: ContentCanvasNode,
    sourceNode: ContentCanvasNode,
    role?: string,
    mediaType?: PromptReferenceMediaType,
  ) => {
    onGenerationReferenceAppend(targetNode, sourceNode, {
      ...(role ? { role } : {}),
      ...(mediaType ? { mediaType } : {}),
    })
    appendLocalPromptReferenceEdge(sourceNode, targetNode)
  }, [appendLocalPromptReferenceEdge, onGenerationReferenceAppend])
  const openReferenceRoleMenu = useCallback((state: CreativeCanvasReferenceRoleMenuState) => {
    if (typeof window === 'undefined') {
      setReferenceRoleMenu(state)
      return
    }
    window.requestAnimationFrame(() => setReferenceRoleMenu(state))
  }, [])
  const appendReferenceToPromptTarget = useCallback((targetNode: ContentCanvasNode, sourceNodeId: string, point?: { x: number; y: number }) => {
    if (targetNode.id === sourceNodeId) return
    const sourceNode = nodeById.get(sourceNodeId)
    if (!sourceNode) return
    const mediaType = promptReferenceMediaTypeForContentNode(sourceNode, candidateSelections)
    const roleOptions = mediaType ? generationReferenceRoleOptionsForMediaType(mediaType) : []
    const defaultRole = mediaType
      ? generationDefaultReferenceRoleForMediaType(mediaType) ?? roleOptions[0]?.value
      : undefined
    appendReferenceToPromptTargetWithRole(targetNode, sourceNode, defaultRole, mediaType)
    if (point && mediaType && roleOptions.length > 1) {
      const menuPoint = contentPromptReferenceRoleMenuPoint(point)
      openReferenceRoleMenu({
        x: menuPoint.x,
        y: menuPoint.y,
        targetNodeId: targetNode.id,
        sourceNodeId: sourceNode.id,
        mediaType,
        role: defaultRole ?? 'reference_image',
      })
    }
  }, [appendReferenceToPromptTargetWithRole, candidateSelections, nodeById, openReferenceRoleMenu])
  const initialContentFlowNodes = useMemo<CreativeFlowContentNode[]>(() => creativeGraph.nodes.map((item) => {
    const candidatePreviews = candidatePreviewsForNode(item.source, candidateSelections)
    return {
      id: item.id,
      type: 'contentPrompt',
      position: persistedManualPositions?.[item.id] ?? item.position,
      selected: item.id === focusedNodeId,
      data: {
        item,
        itemKey: creativeCanvasNodeSemanticKey(item),
        focused: item.id === focusedNodeId,
        candidateSelections,
        candidateSelectionsKey,
        candidateBadge: nodeCandidateBadge(item.source, candidateSelections) || '可生成',
        candidatePreviews,
        candidatePreviewsKey: creativeFlowNodeCandidatePreviewsKey(candidatePreviews),
        nodes,
        nodesKey: contentNodesKey,
        prompt: promptByNodeId[item.id] ?? '',
        referenceTargetNodeId: activePromptReferenceTargetId,
        onContextMenu: openNodeContextMenu,
        onCandidatePreviewOpen: (preview) => setCandidatePreviewDialog({ preview, sourceNode: item.source }),
        onCandidateRemove: (node, candidate) => onCandidateRemove(node, candidate),
        onCandidateSelect: (node, candidate) => onCandidateSelect(node, candidate),
        onCandidatePromptPreview,
        onGenerateWithOptions: (node, options) => onCandidateCreate(node, options),
        onGeneratePreflight: (node, options) => onCandidatePreflight
          ? onCandidatePreflight(node, options)
          : Promise.resolve({ status: 'ready', ready: true, blockers: [] }),
        onReferenceToActivePrompt: appendReferenceToActivePrompt,
        onReferenceDrop: appendReferenceToPromptTarget,
        onResourceDrop: createResourceCandidateFromDrop,
        onCanvasDeselect,
        onPromptCommit: commitPromptFromNode,
        onPromptDraftChange: updatePromptDraft,
        onReferencePoolCommit: commitReferencePoolFromNode,
        onStructuredPromptCommit,
        onSelectNode,
      },
    }
  }), [activePromptReferenceTargetId, appendReferenceToActivePrompt, appendReferenceToPromptTarget, candidateSelections, candidateSelectionsKey, commitPromptFromNode, commitReferencePoolFromNode, contentNodesKey, createResourceCandidateFromDrop, creativeGraph.nodes, focusedNodeId, nodes, onCanvasDeselect, onCandidateCreate, onCandidatePreflight, onCandidatePromptPreview, onCandidateRemove, onCandidateSelect, onSelectNode, onStructuredPromptCommit, openNodeContextMenu, persistedManualPositions, promptByNodeId, updatePromptDraft])
  const initialFlowNodes = useMemo<CreativeFlowNode[]>(() => [
    ...creativeFlowGroupNodesFromCanvasGroups({
      contentNodes: initialContentFlowNodes,
      groups: canvasGroups,
      nodeLayouts: activeCanvasDocument?.nodeLayouts,
    }),
    ...initialContentFlowNodes,
  ], [activeCanvasDocument?.nodeLayouts, canvasGroups, initialContentFlowNodes])
  const initialFlowEdges = useMemo<Edge[]>(() => creativeGraph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edgeLabel(edge.sourceEdge),
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    style: { strokeWidth: edge.sourceEdge.kind === 'sequence' ? 1 : 1.6 },
    data: { kind: edge.sourceEdge.kind, relation: edge.sourceEdge.relation },
  })), [creativeGraph.edges])
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<CreativeFlowNode>(initialFlowNodes)
  const [flowEdges, setFlowEdges] = useEdgesState(initialFlowEdges)
  const displayedFlowEdges = useMemo(
    () => mergePromptReferencePreviewEdges(flowEdges, localPromptReferenceEdges, visibleCreativeNodeIdSet),
    [flowEdges, localPromptReferenceEdges, visibleCreativeNodeIdSet],
  )
  const flowNodeSemanticSyncKey = useMemo(
    () => `${activeCanvasDocument?.id ?? 'free'}:${initialFlowNodes.map((node) => node.id).join('|')}`,
    [activeCanvasDocument?.id, initialFlowNodes],
  )
  const contentFlowNodes = useMemo(
    () => flowNodes.filter(isCreativeFlowContentNode),
    [flowNodes],
  )
  const selectedContentFlowNodes = useMemo(
    () => contentFlowNodes.filter((node) => node.selected),
    [contentFlowNodes],
  )
  const selectedGroupFlowNodes = useMemo(
    () => flowNodes.filter(isCreativeFlowGroupNode).filter((node) => node.selected),
    [flowNodes],
  )
  const selectedGroupMemberNodeIds = useMemo(() => {
    const ids = new Set<string>()
    for (const groupNode of selectedGroupFlowNodes) {
      for (const nodeId of groupNode.data.group.memberNodeIds) ids.add(nodeId)
    }
    return ids
  }, [selectedGroupFlowNodes])
  const selectedContentNodeIds = useMemo(
    () => selectedContentFlowNodes
      .map((node) => node.id)
      .filter((nodeId) => !selectedGroupMemberNodeIds.has(nodeId)),
    [selectedContentFlowNodes, selectedGroupMemberNodeIds],
  )
  const selectedGroupIds = useMemo(
    () => selectedGroupFlowNodes.map((node) => node.id),
    [selectedGroupFlowNodes],
  )
  const selectedCanvasItemCount = selectedContentNodeIds.length + selectedGroupIds.length
  const groupableSelectedNodes = selectedContentFlowNodes.filter((node) => !selectedGroupMemberNodeIds.has(node.id))
  const canGroupSelectedNodes = groupableSelectedNodes.length >= 2

  const selectPromptCanvasNode = useCallback((nodeId: string) => {
    const sourceNode = nodeById.get(nodeId)
    if (!sourceNode) return
    setQuickAddMenu(null)
    onSelectNode(selectionKindForPromptNode(sourceNode), sourceNode.id)
  }, [nodeById, onSelectNode])

  const openQuickAddMenuAtClientPoint = useCallback((clientX: number, clientY: number) => {
    const position = flowInstance?.screenToFlowPosition({ x: clientX, y: clientY }) ?? { x: 0, y: 0 }
    const quickAdd = creativeCanvasQuickAddOptionsForPosition({
      flowNodes: contentFlowNodes,
      focusedNodeId,
      nodeById,
      position,
    })
    setContextMenu(null)
    setReferenceRoleMenu(null)
    setQuickAddMenu({
      x: clientX,
      y: clientY,
      position,
      inferredParentTitle: quickAdd.inferredParent?.title,
      groups: quickAdd.groups,
    })
  }, [contentFlowNodes, flowInstance, focusedNodeId, nodeById])

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
    const resetPositions = flowNodeSemanticSyncKeyRef.current !== flowNodeSemanticSyncKey
    flowNodeSemanticSyncKeyRef.current = flowNodeSemanticSyncKey
    setFlowNodes((currentNodes) => reconcileCreativeFlowNodes(currentNodes, initialFlowNodes, { resetPositions }))
  }, [flowNodeSemanticSyncKey, initialFlowNodes, setFlowNodes])

  useEffect(() => {
    setFlowEdges(initialFlowEdges)
    setLocalPromptReferenceEdges((currentEdges) =>
      currentEdges.filter((edge) => !flowEdgeListHasSourceTargetPair(initialFlowEdges, edge.source, edge.target)))
  }, [initialFlowEdges, setFlowEdges])

  useEffect(() => {
    if (!flowInstance || !focusRequest) return
    if (consumedFocusRequestIdRef.current === focusRequest.requestId) return
    const focusedNode = contentFlowNodes.find((node) => node.id === focusRequest.nodeId)
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
  }, [contentFlowNodes, flowInstance, focusRequest])

  const editablePromptNodeIds = useMemo(
    () => new Set(creativeGraph.nodes.filter((node) => isCreativePromptEditableNode(node)).map((node) => node.id)),
    [creativeGraph.nodes],
  )
  const promptReferenceMenuPointForNode = useCallback((nodeId: string): { x: number; y: number } => {
    const nodeElement = Array
      .from(panelRef.current?.querySelectorAll<HTMLElement>('.react-flow__node') ?? [])
      .find((element) => element.getAttribute('data-id') === nodeId)
    if (nodeElement) {
      const rect = nodeElement.getBoundingClientRect()
      return {
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + Math.min(56, Math.max(32, rect.height * 0.32))),
      }
    }
    const bounds = panelRef.current?.getBoundingClientRect()
    return {
      x: Math.round(bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2),
      y: Math.round(bounds ? bounds.top + bounds.height / 2 : window.innerHeight / 2),
    }
  }, [])
  const handleConnect = useCallback((connection: Connection) => {
    const source = connection.source ? nodeById.get(connection.source) : undefined
    const target = connection.target ? nodeById.get(connection.target) : undefined
    if (!source || !target || source.id === target.id) return
    const targetEditable = editablePromptNodeIds.has(target.id)
    const sourceEditable = editablePromptNodeIds.has(source.id)
    const focusedEditable = focusedNodeId === source.id && sourceEditable
      ? source
      : focusedNodeId === target.id && targetEditable
        ? target
        : null
    const promptTarget = focusedEditable ?? (targetEditable ? target : sourceEditable ? source : null)
    const referenceSource = promptTarget?.id === source.id ? target : source
    if (!promptTarget || !referenceSource) return
    setContextMenu(null)
    setQuickAddMenu(null)
    onSelectNode(selectionKindForPromptNode(promptTarget), promptTarget.id)
    appendReferenceToPromptTarget(
      promptTarget,
      referenceSource.id,
      promptReferenceMenuPointForNode(promptTarget.id),
    )
  }, [appendReferenceToPromptTarget, editablePromptNodeIds, focusedNodeId, nodeById, onSelectNode, promptReferenceMenuPointForNode])

  const positionForContextChildCreate = useCallback((node: ContentCanvasNode): ContentCanvasNodePosition => {
    const flowNode = contentFlowNodes.find((item) => item.id === node.id)
    const nodePosition = flowNode?.position ?? node.position
    const nodeWidth = flowNode ? creativeCanvasNodeViewportSize(flowNode.data.item).width : 320
    return {
      x: nodePosition.x + nodeWidth + 48,
      y: nodePosition.y,
    }
  }, [contentFlowNodes])

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
  }, [onCandidateNodeSelect, onDeleteNode, onRemoveNodeFromCanvas, onResourceOpen, onSelectNode, positionForContextChildCreate])

  const runQuickAddOption = useCallback((option: CreativeCanvasQuickAddOption, position: ContentCanvasNodePosition) => {
    setContextMenu(null)
    setQuickAddMenu(null)
    setReferenceRoleMenu(null)
    setQuickCreateDialog({ option, position })
  }, [])

  const submitQuickCreateDialog = useCallback((input: ContentCanvasCreateNodeInput) => {
    const state = quickCreateDialog
    if (!state) return
    setQuickCreateDialog(null)
    const nextInput = mergeQuickAddInputDefaults(state.option, input)
    if (state.option.kind === 'direct') {
      onCreateNode(state.option.nodeKind, state.position, nextInput)
      return
    }
    onCreateChild(state.option.parentNode, state.option.childKind, state.position, nextInput)
  }, [onCreateChild, onCreateNode, quickCreateDialog])

  const closeQuickCreateDialog = useCallback(() => {
    setQuickCreateDialog(null)
  }, [])

  const createGroupFromSelection = useCallback(() => {
    const bounds = creativeFlowContentNodesBounds(groupableSelectedNodes)
    if (!bounds) return
    onCreateGroup({
      memberNodeIds: groupableSelectedNodes.map((node) => node.id),
      position: { x: bounds.x, y: bounds.y },
      size: { width: bounds.width, height: bounds.height },
    })
  }, [groupableSelectedNodes, onCreateGroup])

  const ungroupSelectedGroups = useCallback(() => {
    if (!selectedGroupIds.length) return
    onRemoveGroupsFromCanvas(selectedGroupIds)
  }, [onRemoveGroupsFromCanvas, selectedGroupIds])

  const removeSelectedFlowItemsFromCanvas = useCallback(() => {
    const nodeIds = new Set(selectedContentNodeIds)
    for (const nodeId of selectedGroupMemberNodeIds) nodeIds.add(nodeId)
    if (nodeIds.size === 0 && selectedGroupIds.length === 0) return
    if (nodeIds.size > 0) onRemoveNodesFromCanvas([...nodeIds])
    if (selectedGroupIds.length > 0) onRemoveGroupsFromCanvas(selectedGroupIds)
  }, [
    onRemoveGroupsFromCanvas,
    onRemoveNodesFromCanvas,
    selectedContentNodeIds,
    selectedGroupIds,
    selectedGroupMemberNodeIds,
  ])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (isTextEditingTarget(event.target)) return
      if (selectedCanvasItemCount === 0) return
      event.preventDefault()
      removeSelectedFlowItemsFromCanvas()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [removeSelectedFlowItemsFromCanvas, selectedCanvasItemCount])

  const relayoutCanvas = useCallback(() => {
    const nextPositions = layoutCreativeCanvas({
      graph: creativeGraph,
      measuredNodeSizes: creativeCanvasMeasuredNodeSizes(contentFlowNodes),
    }).positions
    setFlowNodes((currentNodes) => currentNodes.map((node) => ({
      ...node,
      position: nextPositions[node.id] ?? node.position,
    })))
    onNodePositionsCommit(nextPositions)
    window.requestAnimationFrame(() => {
      void flowInstance?.fitView({ padding: 0.2, duration: 320 })
    })
  }, [contentFlowNodes, creativeGraph, flowInstance, onNodePositionsCommit, setFlowNodes])

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
      setReferenceRoleMenu(null)
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
    setReferenceRoleMenu(null)
    const position = flowPositionForClientPoint(event.clientX, event.clientY)
    const targetNode = creativeCanvasResourceTargetForPosition({
      flowNodes: contentFlowNodes,
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
  }, [addLibraryNodeToCanvasAtPosition, contentFlowNodes, dropPositionForCanvasLibraryNode, flowPositionForClientPoint, focusedNodeId, nodeById, onCandidateResourceSelect])

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
        setReferenceRoleMenu(null)
      }}
    >
      <div className="content-prompt-canvas-panel__toolbar">
        <span>
          <GitBranch size={14} aria-hidden="true" />
          {activeCanvasDocument?.title ?? '自由内容画布'}
        </span>
        <em>{contentCanvasScopeLabel(activeCanvasScope)}</em>
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
        <button
          type="button"
          disabled={!canGroupSelectedNodes}
          onClick={createGroupFromSelection}
          title="分组选中节点"
          aria-label="分组选中节点"
        >
          <Layers3 size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={!selectedGroupIds.length}
          onClick={ungroupSelectedGroups}
          title="取消选中分组"
          aria-label="取消选中分组"
        >
          <Ungroup size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={!selectedCanvasItemCount}
          onClick={removeSelectedFlowItemsFromCanvas}
          title="删除选中内容"
          aria-label="删除选中内容"
        >
          <Trash2 size={14} aria-hidden="true" />
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
      {referenceRoleMenu ? (
        <GenerationReferenceRoleMenu
          className="content-prompt-canvas-reference-role-menu"
          options={generationReferenceRoleOptionsForMediaType(referenceRoleMenu.mediaType)}
          value={referenceRoleMenu.role}
          style={{
            position: 'fixed',
            left: referenceRoleMenu.x,
            top: referenceRoleMenu.y + 8,
          }}
          onRoleSelect={(role) => {
            const targetNode = nodeById.get(referenceRoleMenu.targetNodeId)
            const sourceNode = nodeById.get(referenceRoleMenu.sourceNodeId)
            if (targetNode && sourceNode) {
              appendReferenceToPromptTargetWithRole(targetNode, sourceNode, role, referenceRoleMenu.mediaType)
            }
            setReferenceRoleMenu(null)
          }}
        />
      ) : null}
      <ReactFlow<CreativeFlowNode, Edge>
        nodes={flowNodes}
        edges={displayedFlowEdges}
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
        onNodeDragStart={(_event, node) => {
          suppressNextNodeClickRef.current = true
          if (!isCreativeFlowGroupNode(node)) {
            groupDragSnapshotRef.current = null
            return
          }
          const memberIds = new Set(node.data.group.memberNodeIds)
          groupDragSnapshotRef.current = {
            groupId: node.id,
            position: { ...node.position },
            memberPositions: new Map(contentFlowNodes
              .filter((candidate) => memberIds.has(candidate.id))
              .map((candidate) => [candidate.id, { ...candidate.position }])),
          }
        }}
        onNodeDrag={(_event, node) => {
          const groupSnapshot = groupDragSnapshotRef.current
          if (!isCreativeFlowGroupNode(node) || groupSnapshot?.groupId !== node.id) return
          const dx = node.position.x - groupSnapshot.position.x
          const dy = node.position.y - groupSnapshot.position.y
          if (dx === 0 && dy === 0) return
          setFlowNodes((currentNodes) => currentNodes.map((currentNode) => {
            const initialPosition = groupSnapshot.memberPositions.get(currentNode.id)
            return initialPosition
              ? { ...currentNode, position: { x: initialPosition.x + dx, y: initialPosition.y + dy } }
              : currentNode
          }))
        }}
        onPaneClick={() => {
          setContextMenu(null)
          setQuickAddMenu(null)
          setReferenceRoleMenu(null)
          onCanvasDeselect()
        }}
        onPaneContextMenu={openQuickAddMenu}
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
        deleteKeyCode={null}
        selectionOnDrag
        selectionMode={SelectionMode.Full}
        panOnDrag={[1, 2]}
        zoomOnScroll={false}
        zoomOnPinch
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        onNodeDragStop={(_event, node, draggedNodes) => {
          const groupSnapshot = groupDragSnapshotRef.current
          groupDragSnapshotRef.current = null
          if (isCreativeFlowGroupNode(node) && groupSnapshot?.groupId === node.id) {
            const dx = node.position.x - groupSnapshot.position.x
            const dy = node.position.y - groupSnapshot.position.y
            const groupMovedPositions: Record<string, ContentCanvasNodePosition> = {
              [node.id]: node.position,
            }
            if (dx !== 0 || dy !== 0) {
              for (const [memberNodeId, position] of groupSnapshot.memberPositions.entries()) {
                groupMovedPositions[memberNodeId] = {
                  x: position.x + dx,
                  y: position.y + dy,
                }
              }
              setFlowNodes((currentNodes) => currentNodes.map((currentNode) => {
                const nextPosition = groupMovedPositions[currentNode.id]
                return nextPosition ? { ...currentNode, position: nextPosition } : currentNode
              }))
            }
            onNodePositionsCommit({
              ...flowPositionsByNodeId(flowNodes),
              ...groupMovedPositions,
            })
            window.setTimeout(() => {
              suppressNextNodeClickRef.current = false
            }, 0)
            return
          }
          const movedNodes = draggedNodes.length ? draggedNodes : [node]
          const movedPositions = flowPositionsByNodeId(movedNodes)
          const visiblePositions = {
            ...flowPositionsByNodeId(flowNodes),
            ...movedPositions,
          }
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
