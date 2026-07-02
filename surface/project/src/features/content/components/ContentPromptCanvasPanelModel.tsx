import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from 'react'
import { Clock3, FileText, Image as ImageIcon, Music, Sparkles, Video, X, type LucideIcon } from 'lucide-react'
import { MarkerType, type Edge, type Node, type NodeProps } from '@xyflow/react'

import type { GenerationBackendPreflightResult } from '@movscript/core/generation'
import { readResourceDragPayload } from '@movscript/resource-surface/resource-interaction'

import {
  contentCanvasNodeDisplayKind,
} from '../domain/contentCanvasDomainPolicy'
import {
  creativeCanvasActionsForNode,
  type CreativeCanvasAction,
} from '../application/contentCreativeCanvasActions'
import {
  creativeNodeFromContentNode,
  isCreativeCanvasVisibleNode,
  type CreativeCanvasNode,
} from '../application/contentCreativeCanvasModel'
import {
  layoutCreativeCanvas,
} from '../application/contentCreativeCanvasLayout'
import {
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
import {
  contentCanvasNodeBelongsToProductionScope,
  contentCanvasFirstSegmentIdForProduction,
  contentCanvasSegmentsForProduction,
} from './contentPromptCanvasQuickCreateModel'
import { contentCanvasGenerationTargetForNode } from './contentCanvasWorkspaceGenerationModel'
import {
  candidateDecisionForNode,
  mediaKindForNode,
  mediaKindLabel,
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

export type CreativeFlowNodeData = {
  item: CreativeCanvasNode
  itemKey: string
  focused: boolean
  candidateSelections: CandidateSelections
  candidateSelectionsKey: string
  candidateBadge: string
  candidatePreviews: CreativeFlowNodeCandidatePreview[]
  candidatePreviewsKey: string
  nodes: ContentCanvasNode[]
  nodesKey: string
  prompt: string
  referenceTargetNodeId?: string | null
  onContextMenu: (event: ReactMouseEvent, node: ContentCanvasNode) => void
  onPromptCommit: (node: ContentCanvasNode, prompt: string) => void
  onPromptDraftChange: (node: ContentCanvasNode, prompt: string) => void
  onReferencePoolCommit: (node: ContentCanvasNode, prompt: string, generationReferences: Array<Record<string, unknown>>) => void
  onStructuredPromptCommit: (node: ContentCanvasNode, structured: Record<string, unknown>) => void
  onCandidatePreviewOpen: (preview: CreativeFlowNodeCandidatePreview) => void
  onCandidateRemove: (node: ContentCanvasNode, candidate: ContentCanvasCandidate) => void
  onCandidateSelect: (node: ContentCanvasNode, candidate: ContentCanvasCandidate) => void
  onCandidatePromptPreview: (node: ContentCanvasNode | undefined) => Promise<ContentCanvasCandidatePromptPreview>
  onGenerateWithOptions: (node: ContentCanvasNode, options?: Partial<ContentCanvasCandidateGenerationOptions>) => void
  onGeneratePreflight: (node: ContentCanvasNode, options: Partial<ContentCanvasCandidateGenerationOptions>) => Promise<GenerationBackendPreflightResult>
  onReferenceToActivePrompt: (node: ContentCanvasNode) => void
  onReferenceDrop: (targetNode: ContentCanvasNode, sourceNodeId: string, point?: { x: number; y: number }) => void
  onResourceDrop: (targetNode: ContentCanvasNode, resource: ContentCanvasUploadedResource, position?: ContentCanvasNodePosition) => void
  onCanvasDeselect: () => void
  onSelectNode: (kind: InspectorSelection['kind'], nodeId: string) => void
}

export type CreativeFlowGroupNodeData = {
  group: ContentCanvasDocumentGroup
  groupKey: string
  title: string
  memberCount: number
}

export type CreativeFlowContentNode = Node<CreativeFlowNodeData>
export type CreativeFlowGroupNode = Node<CreativeFlowGroupNodeData>
export type CreativeFlowNode = Node<CreativeFlowNodeData | CreativeFlowGroupNodeData>

export type CreativeFlowNodeCandidatePreview = {
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

export type CreativeFlowCandidatePreviewDialogState = {
  preview: CreativeFlowNodeCandidatePreview
  sourceNode: ContentCanvasNode
}

export type CreativeCanvasContextMenuState = {
  x: number
  y: number
  node: ContentCanvasNode
  actions: CreativeCanvasAction[]
}

export type CreativeCanvasChildKind = Extract<CreativeCanvasAction, { kind: 'create_child' }>['childKind']
export type CreativeCanvasDirectKind =
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

export type CreativeCanvasQuickAddOption =
  | {
    kind: 'child'
    childKind: CreativeCanvasChildKind
    label: string
    parentNode: ContentCanvasNode
    inputDefaults?: Partial<ContentCanvasCreateNodeInput>
  }
  | {
    kind: 'direct'
    nodeKind: CreativeCanvasDirectKind
    label: string
    inputDefaults?: Partial<ContentCanvasCreateNodeInput>
  }

export type CreativeCanvasQuickAddMediaKind = 'image' | 'video' | 'audio' | 'text'

export type CreativeCanvasQuickAddGroup = {
  mediaKind: CreativeCanvasQuickAddMediaKind
  label: string
  primaryOption: CreativeCanvasQuickAddOption
  semanticOptions: CreativeCanvasQuickAddOption[]
}

export type CreativeCanvasQuickAddMenuState = {
  x: number
  y: number
  position: ContentCanvasNodePosition
  inferredParentTitle?: string
  groups: CreativeCanvasQuickAddGroup[]
}

export type CreativeCanvasQuickCreateDialogState = {
  option: CreativeCanvasQuickAddOption
  position: ContentCanvasNodePosition
}

export type ContentCanvasNameDialogState =
  | { mode: 'create'; initialTitle: string }
  | { mode: 'rename'; canvasId: string; initialTitle: string }

export type CreateReferenceMode = 'existing' | 'new'

export type QuickCreatePlanItem = {
  label: string
  value: string
  tone?: 'context' | 'create' | 'use'
}

export type ContentCanvasCreateSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

export type DragResourcePayloadResource = {
  ID: number
  name?: string
  type?: string
  mime_type?: string
  mimeType?: string
}

export type ContentPromptCanvasNodeDragPayload = {
  nodeId: string
}

export type PromptReferenceMediaType = 'image' | 'video' | 'audio'

export type CreativeCanvasReferenceRoleMenuState = {
  x: number
  y: number
  sourceNodeId: string
  targetNodeId: string
  mediaType: PromptReferenceMediaType
  role: string
}

export type CreativeCanvasGroupDragSnapshot = {
  groupId: string
  position: ContentCanvasNodePosition
  memberPositions: Map<string, ContentCanvasNodePosition>
}

export const CREATIVE_CANVAS_MINIMAP_NODE_LIMIT = 120
export const CONTENT_PROMPT_CANVAS_GROUP_PADDING = 56
export const CONTENT_PROMPT_ASSET_LIBRARY_PAGE_SIZE = 9
export const CONTENT_PROMPT_NODE_CANDIDATE_PAGE_SIZE = 3
export const CONTENT_PROMPT_REFERENCE_DRAG_MIME = 'application/x-movscript-content-reference'
export const CONTENT_PROMPT_CANVAS_NODE_DRAG_MIME = 'application/x-movscript-content-canvas-node'
export const CONTENT_CANVAS_CREATE_SELECT_EMPTY_VALUE = '__empty__'

export function areCreativeFlowNodePropsEqual(
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
    && previous.data.onCandidatePromptPreview === next.data.onCandidatePromptPreview
    && previous.data.onGeneratePreflight === next.data.onGeneratePreflight
    && previous.data.onGenerateWithOptions === next.data.onGenerateWithOptions
    && previous.data.onReferenceToActivePrompt === next.data.onReferenceToActivePrompt
    && previous.data.onReferenceDrop === next.data.onReferenceDrop
    && previous.data.onResourceDrop === next.data.onResourceDrop
    && previous.data.onPromptCommit === next.data.onPromptCommit
    && previous.data.onPromptDraftChange === next.data.onPromptDraftChange
    && previous.data.onReferencePoolCommit === next.data.onReferencePoolCommit
    && previous.data.onStructuredPromptCommit === next.data.onStructuredPromptCommit
    && previous.data.onSelectNode === next.data.onSelectNode
}

export function areCreativeFlowGroupNodePropsEqual(
  previous: NodeProps<Node<CreativeFlowGroupNodeData>>,
  next: NodeProps<Node<CreativeFlowGroupNodeData>>,
): boolean {
  return previous.id === next.id
    && previous.selected === next.selected
    && previous.dragging === next.dragging
    && previous.data.groupKey === next.data.groupKey
    && previous.data.title === next.data.title
    && previous.data.memberCount === next.data.memberCount
}

export function promptDraftForNode(
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

export function structuredPromptFromNode(node: ContentCanvasNode | undefined): Record<string, unknown> | undefined {
  const editPrompt = node?.record.edit_prompt ?? node?.record.editPrompt
  if (!editPrompt || typeof editPrompt !== 'object' || Array.isArray(editPrompt)) return undefined
  const structured = (editPrompt as Record<string, unknown>).structured
  return structured && typeof structured === 'object' && !Array.isArray(structured)
    ? structured as Record<string, unknown>
    : undefined
}

export function candidatePreviewsForNode(
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

export function resourcePreviewForNode(node: ContentCanvasNode): CreativeFlowNodeCandidatePreview | null {
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

export function creativeFlowNodeCandidatePreviewsKey(previews: CreativeFlowNodeCandidatePreview[]): string {
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

export function previewStatusLabel(preview: CreativeFlowNodeCandidatePreview): string {
  const count = preview.candidateCount && preview.candidateCount > 1 ? ` · ${preview.candidateCount} 候选` : ''
  return `${preview.status}${count}`
}

export function candidatePreviewStatusView(
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

export function candidatePreviewCanSelect(candidate: ContentCanvasCandidate, selected: boolean): boolean {
  if (selected) return true
  const status = normalizedCandidateStatus(candidate)
  if (status === 'queued' || status === 'pending' || status === 'running' || status === 'failed' || status === 'canceled' || status === 'cancelled') return false
  return candidate.resourceId !== undefined || Boolean(candidate.artifactRef) || status === 'succeeded' || status === 'imported' || status === undefined
}

export function candidatePreviewCanRetry(candidate: ContentCanvasCandidate): boolean {
  const status = normalizedCandidateStatus(candidate)
  return status === 'failed' || status === 'canceled' || status === 'cancelled'
}

export function candidateRetryGenerationOptions(preview: CreativeFlowNodeCandidatePreview): Partial<ContentCanvasCandidateGenerationOptions> {
  const candidate = preview.candidate
  if (!candidate) return {}
  const modelId = candidateModelId(candidate)
  const params = candidateModelParams(candidate)
  return {
    ...(modelId ? { modelId } : {}),
    ...(params ? { params } : {}),
  }
}

export function candidatePreviewPlaceholderIcon(preview: CreativeFlowNodeCandidatePreview): LucideIcon {
  if (preview.statusTone === 'running') return Clock3
  if (preview.statusTone === 'failed') return X
  if (preview.statusTone === 'ready' || preview.statusTone === 'imported') return FileText
  return Sparkles
}

export function candidateFailureReason(candidate: ContentCanvasCandidate): string | undefined {
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

export function candidateNote(candidate: ContentCanvasCandidate): string | undefined {
  const note = stringRecordField(candidate.notes)
  if (!note) return undefined
  const status = normalizedCandidateStatus(candidate)
  const normalized = note.toLowerCase()
  if (status && normalized === status) return undefined
  if (['queued', 'pending', 'running', 'succeeded', 'failed', 'canceled', 'cancelled', 'imported'].includes(normalized)) return undefined
  if (normalized === 'workspace runtime candidate.') return undefined
  return note
}

export function candidateJobId(candidate: ContentCanvasCandidate): string | undefined {
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

export function candidateModelId(candidate: ContentCanvasCandidate): string | undefined {
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

export function candidateModelParams(candidate: ContentCanvasCandidate): ContentCanvasCandidateGenerationOptions['params'] | undefined {
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

export function candidatePromptSnapshotText(candidate: ContentCanvasCandidate): string | undefined {
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

export function promptBlockerSummary(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined
  const labels = value
    .map((item) => recordValue(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => firstText([item.message, item.ref, item.code]))
    .filter((item): item is string => Boolean(item))
  return labels.length ? labels.join('；') : undefined
}

export function editPromptTextFromUnknown(value: unknown): string | undefined {
  if (typeof value === 'string') return stringRecordField(value)
  const record = recordValue(value)
  return record ? firstText([record.text, record.prompt, record.description]) : undefined
}

export function normalizedCandidateStatus(candidate: ContentCanvasCandidate): string | undefined {
  const explicit = stringRecordField(candidate.status)?.toLowerCase()
  const derived = derivedCandidateStatus(candidate)
  if (derived === 'failed' || derived === 'canceled' || derived === 'cancelled') return derived
  return explicit ?? derived
}

export function derivedCandidateStatus(candidate: ContentCanvasCandidate): string | undefined {
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

export function normalizedCandidateDecisionStatus(candidate: ContentCanvasCandidate): string | undefined {
  return stringRecordField(candidate.decisionStatus)?.toLowerCase()
}

export function candidateDecisionReason(candidate: ContentCanvasCandidate): string | undefined {
  return stringRecordField(candidate.decisionReason)
}

export function candidatePreviewShouldShow(candidate: ContentCanvasCandidate, selected: boolean): boolean {
  const decision = normalizedCandidateDecisionStatus(candidate)
  if (decision !== 'reject' && decision !== 'rejected') return true
  const reason = candidateDecisionReason(candidate)
  return selected && reason !== 'content_canvas_removed_candidate'
}

export function firstText(values: unknown[]): string | undefined {
  for (const value of values) {
    const text = stringRecordField(value)
    if (text) return text
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return undefined
}

export function explicitCandidateSelectionIdForNode(
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

export function candidatePreviewKey(candidate: ContentCanvasCandidate, index: number): string {
  return [
    candidate.id,
    candidate.resourceId ?? '',
    candidate.artifactRef ?? '',
    candidate.inputHash ?? '',
    candidate.source ?? '',
    index,
  ].join(':')
}

export function repeatedCandidateIds(candidates: ContentCanvasCandidate[]): Set<string> {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) repeated.add(candidate.id)
    seen.add(candidate.id)
  }
  return repeated
}

export function currentCandidatePreview(previews: CreativeFlowNodeCandidatePreview[]): CreativeFlowNodeCandidatePreview | undefined {
  return previews.find((preview) => preview.selected) ?? previews[0]
}

export function candidatePreviewMediaKind(preview: CreativeFlowNodeCandidatePreview): 'image' | 'video' | 'file' {
  const resourceKind = `${preview.resourceKind ?? ''}`.toLowerCase()
  if (resourceKind.includes('video') || resourceKind.includes('movie') || resourceKind.includes('mp4')) return 'video'
  if (resourceKind.includes('image') || resourceKind.includes('board') || resourceKind.includes('keyframe') || resourceKind.includes('png') || resourceKind.includes('jpg') || resourceKind.includes('jpeg')) return 'image'
  return 'file'
}

export function mediaKindForCurrentState(kind: ReturnType<typeof mediaKindForNode>): 'image' | 'video' | 'file' {
  if (kind === 'video' || kind === 'scene') return 'video'
  if (kind === 'image' || kind === 'board' || kind === 'keyframe') return 'image'
  return 'file'
}

export function promptReferenceMediaTypeForContentNode(
  node: ContentCanvasNode,
  candidateSelections: CandidateSelections,
): PromptReferenceMediaType | undefined {
  const previewKind = currentCandidatePreview(candidatePreviewsForNode(node, candidateSelections))
  const mediaKind = previewKind ? candidatePreviewMediaKind(previewKind) : mediaKindForCurrentState(mediaKindForNode(node))
  if (mediaKind === 'image' || mediaKind === 'video') return mediaKind
  return mediaKindForNode(node) === 'audio' ? 'audio' : undefined
}

export function contentPromptReferenceRoleMenuPoint(point: { x: number; y: number }): { x: number; y: number } {
  if (typeof window === 'undefined') return point
  return {
    x: Math.max(12, Math.min(point.x, window.innerWidth - 292)),
    y: Math.max(12, Math.min(point.y, window.innerHeight - 220)),
  }
}

export function resourceKindForNodeRecord(record: Record<string, unknown>): string | undefined {
  return stringRecordField(record.resourceKind)
    ?? stringRecordField(record.resource_kind)
    ?? stringRecordField(record.resourceType)
    ?? stringRecordField(record.resource_type)
    ?? stringRecordField(record.mime_type)
    ?? stringRecordField(record.mimeType)
    ?? stringRecordField(record.resourceMimeType)
}

export function numericRecordField(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim())
  return undefined
}

export function stringRecordField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

export function firstRecord(value: unknown): Record<string, unknown> | undefined {
  return Array.isArray(value) ? value.find((item): item is Record<string, unknown> => Boolean(recordValue(item))) : undefined
}

export function contentCanvasUploadedResourceFromDropEvent(event: ReactDragEvent): ContentCanvasUploadedResource | null {
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

export function contentPromptCanvasNodeDropAcceptsPayload(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(CONTENT_PROMPT_CANVAS_NODE_DRAG_MIME)
}

export function readContentPromptCanvasNodeDragPayload(dataTransfer: DataTransfer): ContentPromptCanvasNodeDragPayload | null {
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

export function contentCanvasUploadedResourceType(value: unknown): ContentCanvasUploadedResource['type'] {
  if (value === 'image' || value === 'video' || value === 'audio' || value === 'text' || value === 'file') return value
  return 'file'
}

export function creativeFlowGroupNodesFromCanvasGroups({
  contentNodes,
  groups,
  nodeLayouts,
}: {
  contentNodes: CreativeFlowContentNode[]
  groups: ContentCanvasDocumentGroup[]
  nodeLayouts?: ContentCanvasDocument['nodeLayouts']
}): CreativeFlowGroupNode[] {
  const contentNodeById = new Map(contentNodes.map((node) => [node.id, node]))
  return groups.flatMap((group) => {
    const memberNodes = group.memberNodeIds
      .map((nodeId) => contentNodeById.get(nodeId))
      .filter((node): node is CreativeFlowContentNode => Boolean(node))
    if (memberNodes.length < 2) return []
    const layout = nodeLayouts?.[group.id]
    const bounds = creativeFlowContentNodesBounds(memberNodes, CONTENT_PROMPT_CANVAS_GROUP_PADDING)
    if (!layout && !bounds) return []
    const width = Math.max(260, layout?.width ?? bounds?.width ?? 260)
    const height = Math.max(160, layout?.height ?? bounds?.height ?? 160)
    return [{
      id: group.id,
      type: 'contentGroup',
      position: {
        x: layout?.x ?? bounds?.x ?? 0,
        y: layout?.y ?? bounds?.y ?? 0,
      },
      style: { width, height },
      zIndex: -2,
      data: {
        group: {
          ...group,
          memberNodeIds: memberNodes.map((node) => node.id),
        },
        groupKey: stableContentPromptJSONString({
          id: group.id,
          title: group.title,
          memberNodeIds: memberNodes.map((node) => node.id),
          layout,
        }),
        title: group.title,
        memberCount: memberNodes.length,
      },
    }]
  })
}

export function creativeFlowContentNodesBounds(
  nodes: CreativeFlowContentNode[],
  padding = CONTENT_PROMPT_CANVAS_GROUP_PADDING,
): { x: number; y: number; width: number; height: number } | null {
  if (!nodes.length) return null
  const rects = nodes.map((node) => {
    const size = creativeFlowContentNodeRenderedSize(node)
    return {
      x: node.position.x,
      y: node.position.y,
      width: size.width,
      height: size.height,
    }
  })
  const minX = Math.min(...rects.map((rect) => rect.x)) - padding
  const minY = Math.min(...rects.map((rect) => rect.y)) - padding
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width)) + padding
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height)) + padding
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

export function creativeFlowContentNodeRenderedSize(node: CreativeFlowContentNode): { width: number; height: number } {
  const measured = (node as { measured?: { width?: number; height?: number }; width?: number; height?: number }).measured
  const width = measured?.width ?? (node as { width?: number }).width
  const height = measured?.height ?? (node as { height?: number }).height
  const fallback = creativeCanvasNodeViewportSize(node.data.item)
  return {
    width: typeof width === 'number' && width > 0 ? width : fallback.width,
    height: typeof height === 'number' && height > 0 ? height : fallback.height,
  }
}

export function reconcileCreativeFlowNodes(
  currentNodes: CreativeFlowNode[],
  nextNodes: CreativeFlowNode[],
  options: { resetPositions: boolean },
): CreativeFlowNode[] {
  if (options.resetPositions) {
    return creativeFlowNodeListShallowEqual(currentNodes, nextNodes) ? currentNodes : nextNodes
  }
  const currentById = new Map(currentNodes.map((node) => [node.id, node]))
  let changed = currentNodes.length !== nextNodes.length
  const reconciled = nextNodes.map((nextNode) => {
    const currentNode = currentById.get(nextNode.id)
    if (!currentNode) {
      changed = true
      return nextNode
    }
    const mergedNode = {
      ...currentNode,
      ...nextNode,
      position: currentNode.position,
      selected: currentNode.selected,
    }
    if (creativeFlowNodeShallowEqual(currentNode, mergedNode)) return currentNode
    changed = true
    return mergedNode as CreativeFlowNode
  })
  return changed ? reconciled : currentNodes
}

export function creativeFlowNodeListShallowEqual(
  left: CreativeFlowNode[],
  right: CreativeFlowNode[],
): boolean {
  return left.length === right.length && left.every((node, index) => creativeFlowNodeShallowEqual(node, right[index]))
}

export function creativeFlowNodeShallowEqual(
  left: CreativeFlowNode,
  right: CreativeFlowNode | undefined,
): boolean {
  if (!right) return false
  return left.id === right.id
    && left.type === right.type
    && left.selected === right.selected
    && creativeFlowNodeStyleShallowEqual(left.style, right.style)
    && creativeFlowNodeDataShallowEqual(left.data, right.data)
    && left.position.x === right.position.x
    && left.position.y === right.position.y
}

export function creativeFlowNodeDataShallowEqual(
  left: CreativeFlowNodeData | CreativeFlowGroupNodeData,
  right: CreativeFlowNodeData | CreativeFlowGroupNodeData,
): boolean {
  if (isCreativeFlowGroupNodeData(left) || isCreativeFlowGroupNodeData(right)) {
    return isCreativeFlowGroupNodeData(left)
      && isCreativeFlowGroupNodeData(right)
      && left.groupKey === right.groupKey
      && left.title === right.title
      && left.memberCount === right.memberCount
  }
  return left.itemKey === right.itemKey
    && left.focused === right.focused
    && left.candidateSelectionsKey === right.candidateSelectionsKey
    && left.candidateBadge === right.candidateBadge
    && left.candidatePreviewsKey === right.candidatePreviewsKey
    && left.nodesKey === right.nodesKey
    && left.prompt === right.prompt
    && left.referenceTargetNodeId === right.referenceTargetNodeId
}

export function creativeFlowNodeStyleShallowEqual(left: CreativeFlowNode['style'], right: CreativeFlowNode['style']): boolean {
  return left?.width === right?.width && left?.height === right?.height
}

export function isCreativeFlowContentNode(node: Node<CreativeFlowNodeData | CreativeFlowGroupNodeData>): node is CreativeFlowContentNode {
  return node.type === 'contentPrompt' && !isCreativeFlowGroupNodeData(node.data)
}

export function isCreativeFlowGroupNode(node: Node<CreativeFlowNodeData | CreativeFlowGroupNodeData>): node is CreativeFlowGroupNode {
  return node.type === 'contentGroup' && isCreativeFlowGroupNodeData(node.data)
}

export function isCreativeFlowGroupNodeData(data: CreativeFlowNodeData | CreativeFlowGroupNodeData): data is CreativeFlowGroupNodeData {
  return Object.prototype.hasOwnProperty.call(data, 'group')
}

export function creativeCanvasNodeSemanticKey(node: CreativeCanvasNode): string {
  return stableContentPromptJSONString({
    id: node.id,
    kind: node.kind,
    role: node.role,
    weight: node.weight,
    canGenerate: node.canGenerate,
    canExpand: node.canExpand,
    selected: node.selected,
    position: node.position,
    source: contentPromptNodeSemanticRecord(node.source),
  })
}

export function contentPromptNodeListKey(nodes: ContentCanvasNode[]): string {
  return nodes.map((node) => stableContentPromptJSONString(contentPromptNodeSemanticRecord(node))).join('\n')
}

export function contentPromptNodeSemanticRecord(node: ContentCanvasNode): Record<string, unknown> {
  return {
    id: node.id,
    entityKey: node.entityKey,
    kind: node.kind,
    title: node.title,
    subtitle: node.subtitle,
    summary: node.summary,
    status: node.status,
    metrics: node.metrics,
    sourcePath: node.sourcePath,
    record: node.record,
    domainCategory: node.domainCategory,
    domainKind: node.domainKind,
    domainParentNodeId: node.domainParentNodeId,
    domainAncestorNodeIds: node.domainAncestorNodeIds,
    candidates: node.candidates,
    generationTask: node.generationTask,
    position: node.position,
  }
}

export function stableContentPromptJSONString(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableContentPromptJSONString).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableContentPromptJSONString(record[key])}`)
    .join(',')}}`
}

export function flowPositionsByNodeId(nodes: Array<Node<CreativeFlowNodeData | CreativeFlowGroupNodeData>>): Record<string, { x: number; y: number }> {
  return Object.fromEntries(nodes.map((node) => [node.id, node.position]))
}

export function isCreativePromptEditableNode(node: CreativeCanvasNode): boolean {
  return node.canGenerate && node.role !== 'resource'
}

export function contentCanvasNodeLibraryNodes(
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

export function contentCanvasNodeCanJoinDocument(node: ContentCanvasNode): boolean {
  return contentCanvasNodeCanRenderInPromptCanvas(node)
}

export function contentCanvasNodeCanRenderInPromptCanvas(node: ContentCanvasNode): boolean {
  return node.kind === 'resource' || isCreativeCanvasVisibleNode(node)
}

export function contentCanvasNodeCanJoinCanvasScope(
  node: ContentCanvasNode,
  scope: ContentCanvasDocumentScope,
  productions: ContentCanvasNode[],
): boolean {
  if (scope.kind === 'global') return true
  return contentCanvasNodeBelongsToProductionScope(node, scope.productionId, productions)
}

export function contentCanvasNodeLibraryRank(node: ContentCanvasNode): number {
  if (node.kind === 'content_unit') return 0
  if (node.kind === 'scene_moment') return 0
  if (node.kind === 'expression_unit') return 1
  if (node.kind === 'keyframe' || node.kind === 'storyboard') return 2
  if (node.kind === 'resource') return 4
  if (node.kind === 'setting' || node.kind === 'state' || node.kind === 'asset') return 5
  return 9
}

export function contentCanvasNodeLibraryLabel(node: ContentCanvasNode): string {
  const display = creativeFlowNodeDisplay(node, creativeCanvasNodeRoleForLibrary(node))
  return `${display.badge} · ${display.subtitle}`
}

export function creativeCanvasNodeRoleForLibrary(node: ContentCanvasNode): CreativeCanvasNode['role'] {
  if (node.kind === 'project' || node.kind === 'production' || node.kind === 'segment') return 'structure'
  if (node.kind === 'content_unit') return 'generation'
  if (node.kind === 'candidate') return 'candidate'
  if (node.kind === 'resource') return 'resource'
  if (node.kind === 'work_item') return 'issue'
  return 'creative'
}

export function appendPromptReferencePreviewEdge(
  currentEdges: Edge[],
  sourceNode: ContentCanvasNode,
  targetNode: ContentCanvasNode,
): Edge[] {
  if (flowEdgeListHasSourceTargetPair(currentEdges, sourceNode.id, targetNode.id)) return currentEdges
  return [...currentEdges, promptReferencePreviewEdge(sourceNode.id, targetNode.id)]
}

export function mergePromptReferencePreviewEdges(
  flowEdges: Edge[],
  previewEdges: Edge[],
  visibleNodeIds: Set<string>,
): Edge[] {
  if (!previewEdges.length) return flowEdges
  const nextEdges = [...flowEdges]
  for (const edge of previewEdges) {
    if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) continue
    if (flowEdgeListHasSourceTargetPair(nextEdges, edge.source, edge.target)) continue
    nextEdges.push(edge)
  }
  return nextEdges
}

export function flowEdgeListHasSourceTargetPair(edges: Edge[], source: string, target: string): boolean {
  return edges.some((edge) => edge.source === source && edge.target === target)
}

export function promptReferencePreviewEdge(source: string, target: string): Edge {
  return {
    id: `prompt-reference-preview:${source}->${target}`,
    source,
    target,
    label: '引用中',
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    style: { strokeWidth: 1.6, strokeDasharray: '5 5' },
    data: { kind: 'prompt_reference_preview', relation: 'prompt_ref' },
  }
}

export function edgeLabel(edge: ContentCanvasEdge): string | undefined {
  if (edge.kind === 'sequence') return '顺序'
  return edge.label
}

export function roleLabel(role: CreativeCanvasNode['role']): string {
  if (role === 'structure') return '结构'
  if (role === 'generation') return '创作片段'
  if (role === 'candidate') return '候选'
  if (role === 'resource') return '资源'
  if (role === 'issue') return '工作项'
  return '创作'
}

export function creativeFlowNodeDisplay(node: ContentCanvasNode, role: CreativeCanvasNode['role']): { badge: string; subtitle: string } {
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

export function creativeCanvasMeasuredNodeSizes(nodes: CreativeFlowContentNode[]): Record<string, { width: number; height: number }> {
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

export function creativeCanvasNodeViewportSize(node: CreativeCanvasNode): { width: number; height: number } {
  if (node.weight === 'compact') return { width: 390, height: 180 }
  if (node.weight === 'normal') return { width: 430, height: 280 }
  return { width: 430, height: 300 }
}

export function creativeCanvasContentNodeViewportSize(node: ContentCanvasNode): { width: number; height: number } {
  return creativeCanvasNodeViewportSize(creativeNodeFromContentNode(node))
}

export function selectionKindForPromptNode(node: ContentCanvasNode): InspectorSelection['kind'] {
  if (node.kind === 'scene_moment') return 'scene_moment'
  if (node.kind === 'setting') return 'setting'
  if (node.kind === 'state') return 'state'
  if (node.kind === 'asset') return 'asset'
  return 'other'
}

export function contextMenuActionKey(action: CreativeCanvasAction): string {
  if (action.kind === 'create_child') return `${action.kind}:${action.childKind}`
  if (action.kind === 'select_candidate') return `${action.kind}:${action.candidateId}`
  return action.kind
}

export function creativeCanvasQuickAddOptionsForPosition({
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
  const imageExpressionOption = expressionQuickAddOption(childOptionsByKind, 'image', '表达单元')
  const videoExpressionOption = expressionQuickAddOption(childOptionsByKind, 'video', '表达单元')
  const audioExpressionOption = expressionQuickAddOption(childOptionsByKind, 'audio', '表达单元')
  const sceneMomentOption = childOptionsByKind.get('scene_moment') ?? directQuickAddOption('scene_moment', '情节')
  return {
    inferredParent,
    groups: [
      {
        mediaKind: 'image',
        label: '图片',
        primaryOption: directQuickAddOption('task_image', '图片'),
        semanticOptions: compactQuickAddOptions([
          imageExpressionOption,
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
          ...(videoExpressionOption ? [videoExpressionOption] : []),
          directQuickAddOption('asset_video', '资产'),
        ],
      },
      {
        mediaKind: 'audio',
        label: '音频',
        primaryOption: directQuickAddOption('task_audio', '音频'),
        semanticOptions: [
          ...(audioExpressionOption ? [audioExpressionOption] : []),
          directQuickAddOption('asset_audio', '资产'),
        ],
      },
      {
        mediaKind: 'text',
        label: '文本',
        primaryOption: directQuickAddOption('task_text', '文本'),
        semanticOptions: [],
      },
    ],
  }
}

export function creativeCanvasQuickAddChildOptionsByKind(
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

export function directQuickAddOption(
  nodeKind: CreativeCanvasDirectKind,
  label: string,
  inputDefaults?: Partial<ContentCanvasCreateNodeInput>,
): CreativeCanvasQuickAddOption {
  return { kind: 'direct', nodeKind, label, inputDefaults }
}

export function expressionQuickAddOption(
  childOptionsByKind: Map<CreativeCanvasChildKind, CreativeCanvasQuickAddOption>,
  outputKind: Exclude<CreativeCanvasQuickAddMediaKind, 'text'>,
  label: string,
): CreativeCanvasQuickAddOption | undefined {
  const option = childOptionsByKind.get('expression_unit')
  if (!option) return undefined
  const slotKind = outputKind === 'audio' ? 'audio' : 'visual'
  return {
    ...option,
    label,
    inputDefaults: {
      outputKind,
      slotKind,
      status: slotKind,
    },
  }
}

export function compactQuickAddOptions(
  options: Array<CreativeCanvasQuickAddOption | undefined>,
): CreativeCanvasQuickAddOption[] {
  return options.filter((option): option is CreativeCanvasQuickAddOption => Boolean(option))
}

export function inferredCreativeCanvasQuickAddParent({
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

export function contentCanvasNodeCanCreateChild(node: ContentCanvasNode | undefined): node is ContentCanvasNode {
  return Boolean(creativeCanvasActionsForNode(node).some((action) => action.kind === 'create_child'))
}

export function creativeCanvasResourceTargetForPosition({
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

export function contentCanvasNodeCanReceiveResourceCandidate(node: ContentCanvasNode | undefined): node is ContentCanvasNode {
  return Boolean(contentCanvasGenerationTargetForNode(node))
}

export function creativeCanvasFlowNodeDistanceToPosition(
  node: Node<CreativeFlowNodeData>,
  position: ContentCanvasNodePosition,
): number {
  const size = creativeCanvasNodeViewportSize(node.data.item)
  const centerX = node.position.x + size.width / 2
  const centerY = node.position.y + size.height / 2
  return (centerX - position.x) ** 2 + (centerY - position.y) ** 2
}

export function creativeCanvasQuickAddChildLabel(childKind: CreativeCanvasChildKind): string {
  if (childKind === 'segment') return '段落'
  if (childKind === 'scene_moment') return '情节'
  if (childKind === 'expression_unit') return '表达'
  if (childKind === 'keyframe') return '关键帧'
  if (childKind === 'storyboard') return '故事板'
  if (childKind === 'asset') return '资产'
  if (childKind === 'state') return '状态'
  return '节点'
}

export function quickAddMediaIcon(mediaKind: CreativeCanvasQuickAddMediaKind) {
  if (mediaKind === 'video') return <Video size={14} aria-hidden="true" />
  if (mediaKind === 'audio') return <Music size={14} aria-hidden="true" />
  if (mediaKind === 'text') return <FileText size={14} aria-hidden="true" />
  return <ImageIcon size={14} aria-hidden="true" />
}

export function quickAddOptionKey(option: CreativeCanvasQuickAddOption): string {
  const outputKind = option.inputDefaults?.outputKind ? `:${option.inputDefaults.outputKind}` : ''
  if (option.kind === 'direct') return `direct:${option.nodeKind}${outputKind}`
  return `child:${option.parentNode.id}:${option.childKind}${outputKind}`
}

export function mergeQuickAddInputDefaults(
  option: CreativeCanvasQuickAddOption,
  input: ContentCanvasCreateNodeInput,
): ContentCanvasCreateNodeInput {
  const defaults = option.inputDefaults
  if (!defaults) return input
  return {
    ...defaults,
    ...input,
    outputKind: input.outputKind ?? defaults.outputKind,
    slotKind: input.slotKind ?? defaults.slotKind,
    status: input.status ?? defaults.status,
  }
}

export function quickCreateDialogSessionKey(state: CreativeCanvasQuickCreateDialogState | null): string {
  if (!state) return 'closed'
  return `${quickAddOptionKey(state.option)}:${state.position.x}:${state.position.y}`
}

export function quickCreateDialogCopy(state: CreativeCanvasQuickCreateDialogState | null): {
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

export function quickCreateDialogEntityKind(state: CreativeCanvasQuickCreateDialogState | null): string {
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

export function quickCreateDialogIdPrefix(state: CreativeCanvasQuickCreateDialogState | null, fallback: string): string {
  const entityKind = quickCreateDialogEntityKind(state)
  if (entityKind === 'content_unit') return 'cu'
  if (entityKind === 'scene_moment') return 'scene'
  if (entityKind === 'expression_unit') return 'expression'
  if (entityKind === 'setting_state') return 'state'
  return entityKind || fallback.replace(/_\d+$/, '') || 'node'
}

export function quickCreateExistingEntityIds(nodes: ContentCanvasNode[], entityKind: string): string[] {
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

export function contentCanvasNodeKindForEntityKind(entityKind: string): ContentCanvasNodeKind {
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

export function quickCreateDialogPlanItems(input: {
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

export function quickCreatePlanValue(title: string, id: string, fallbackTitle: string, fallbackId: string): string {
  return `${title.trim() || fallbackTitle} (${id.trim() || fallbackId})`
}

export function quickCreatePlanNodeValue(node: ContentCanvasNode | undefined, fallbackId: string): string {
  if (node) return `${node.title} (${node.entityKey || node.id})`
  return fallbackId || '未选择'
}

export function quickCreateDialogNeedsProductionSegment(state: CreativeCanvasQuickCreateDialogState | null): boolean {
  void state
  return false
}

export function quickCreateDialogNeedsTimelineNamespaceParent(state: CreativeCanvasQuickCreateDialogState | null): boolean {
  return state?.option.kind === 'direct' && state.option.nodeKind === 'scene_moment'
}

export function quickCreateDialogNeedsSettingStateMount(state: CreativeCanvasQuickCreateDialogState | null): boolean {
  return state?.option.kind === 'direct'
    && (state.option.nodeKind === 'asset_image'
      || state.option.nodeKind === 'asset_video'
      || state.option.nodeKind === 'asset_audio')
}

export function quickCreateDialogNeedsVisualOwner(state: CreativeCanvasQuickCreateDialogState | null): boolean {
  return state?.option.kind === 'direct'
    && (state.option.nodeKind === 'keyframe' || state.option.nodeKind === 'storyboard')
}

export function quickCreateProductionInput(input: {
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

export function quickCreateTimelineNamespaceInput(input: {
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

export function quickCreateChildTimelineNamespaceKind(
  state: CreativeCanvasQuickCreateDialogState | null,
  vocabulary: ContentCanvasNamespaceVocabularyOptions,
): string | undefined {
  if (state?.option.kind !== 'child') return undefined
  if (state.option.childKind !== 'segment') return undefined
  if (state.option.parentNode.domainCategory !== 'timeline_namespace') return undefined
  return contentCanvasChildTimelineNamespaceKind(state.option.parentNode, vocabulary)
}

export function quickCreateChildTimelineNamespaceInput(input: {
  needsChildTimelineNamespaceKind: boolean
  selectedChildTimelineNamespaceKind: string
}): Partial<ContentCanvasCreateNodeInput> {
  if (!input.needsChildTimelineNamespaceKind) return {}
  const timelineNamespaceKind = input.selectedChildTimelineNamespaceKind.trim()
  return timelineNamespaceKind ? { timelineNamespaceKind } : {}
}

export function quickCreateMountInput(input: {
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

export function childSettingNamespaceKindForQuickCreate(
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

export function contentCanvasTimelineNamespaceParentsForSceneMoment(
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

export function contentCanvasLeafTimelineNamespaceNodeIds(nodes: ContentCanvasNode[]): Set<string> {
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

export function contentCanvasNamespaceSourceDir(node: ContentCanvasNode): string {
  return node.sourcePath?.trim().replace(/\/[^/]*\.json$/, '') ?? ''
}

export function contentCanvasTimelineNamespaceParentRank(node: ContentCanvasNode): number {
  if (node.kind === 'segment') return 2
  if (node.kind === 'production') return 1
  return 0
}

export function timelineNamespaceLabel(node: ContentCanvasNode): string {
  const kind = node.domainKind ?? stringRecordField(node.record.namespace_kind) ?? node.kind
  return `${kind} · ${node.title}`
}

export function contentCanvasScopeLabel(scope: ContentCanvasDocumentScope): string {
  if (scope.kind === 'production') return scope.productionTitle ? `制作内容画布 · ${scope.productionTitle}` : `制作内容画布 · ${scope.productionId}`
  return '全局内容画布'
}

export function nextContentCanvasTitleSuggestion(documents: ContentCanvasDocument[]): string {
  const base = '自由内容画布'
  if (!contentCanvasDocumentTitleExists(base, documents)) return base
  for (let index = 2; index < 1000; index += 1) {
    const title = `${base} ${index}`
    if (!contentCanvasDocumentTitleExists(title, documents)) return title
  }
  return `${base} ${Date.now().toString(36)}`
}

export function contentCanvasDocumentTitleExists(value: string, documents: ContentCanvasDocument[]): boolean {
  const normalized = normalizeContentCanvasDocumentTitle(value).toLocaleLowerCase('zh-CN')
  return documents.some((document) => (
    normalizeContentCanvasDocumentTitle(document.title).toLocaleLowerCase('zh-CN') === normalized
  ))
}

export function stateNodeBelongsToSetting(node: ContentCanvasNode, settingId: string): boolean {
  return stringRecordField(node.record.setting_id)
    === settingId
    || stringRecordField(node.record.settingId) === settingId
    || stringRecordField(node.record.setting_ref) === settingId
    || node.sourcePath.includes(`/settings/${settingId}/`)
}

export function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tagName = target.tagName.toLowerCase()
  return tagName === 'input'
    || tagName === 'textarea'
    || tagName === 'select'
    || target.isContentEditable
    || Boolean(target.closest('[contenteditable="true"]'))
}
