import { memo, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Handle,
  Position,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import { ChevronLeft, ChevronRight, Info, Layers3, Link2, Move, Plus, RotateCcw, Search, Sparkles, Star, Trash2 } from 'lucide-react'

import {
  evaluateGenerationReadiness,
  generationBackendPreflightBlockerMessages,
  generationBackendPreflightIsReady,
  generationModelSupportedParams,
  generationParamDefaults,
  generationReferenceAssetsFromPromptText,
  generationReadinessBlockerMessages,
  generationReadinessIsReady,
  type GenerationBackendPreflightResult,
  type GenerationIntentPayload,
} from '@movscript/core/generation'
import { allocateMovScriptEntityId } from '@movscript/domain'
import { resourceDropAcceptsPayload } from '@movscript/resource-surface/resource-interaction'
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
} from '@movscript/ui/business/generation'

import {
  contentCanvasDocumentTitleValidationMessage,
  normalizeContentCanvasDocumentTitle,
  type ContentCanvasDocument,
  type ContentCanvasDocumentScope,
} from '../application/contentCanvasDocuments'
import type { ContentCanvasCreateNodeInput } from '../application/contentCanvasCommands'
import type { ContentCanvasUploadedResource } from '../application/contentCanvasWorkspaceGateway'
import type { ContentCanvasCandidate, ContentCanvasNode } from '../domain/contentCanvasTypes'
import {
  contentCanvasNodeBelongsToProductionScope,
  contentCanvasFirstSegmentIdForProduction,
  contentCanvasSegmentsForProduction,
} from './contentPromptCanvasQuickCreateModel'
import {
  ContentCanvasGenerationParamControls,
} from './ContentCanvasGenerationParamControls'
import { ContentCanvasModelSelector } from './ContentCanvasModelSelector'
import { ContentCanvasPromptEditor } from './ContentCanvasPromptEditor'
import {
  contentCanvasGenerationCapability,
  contentCanvasGenerationIntent,
  contentCanvasGenerationOperationOptions,
  contentCanvasReferenceAssetsForOperation,
} from './contentCanvasGenerationOptions'
import { contentCanvasGenerationTargetForNode } from './contentCanvasWorkspaceGenerationModel'
import {
  candidateDecisionForNode,
  iconForContentNode,
  mediaKindForNode,
  mediaKindLabel,
  promptFromContentNode,
} from './contentCanvasWorkspaceModel'
import {
  expressionUnitKindValue,
} from './contentCanvasWorkspaceDisplayModel'
import type { CandidateSelections, ContentCanvasNodePosition, InspectorSelection } from './contentCanvasWorkspaceTypes'
import type {
  ContentCanvasCandidateGenerationOptions,
  ContentCanvasCandidatePromptPreview,
} from './ContentCanvasInspectorParts'
import type { ContentCanvasNamespaceVocabularyOptions } from './contentCanvasNamespaceVocabularyModel'
import {
  CONTENT_CANVAS_CREATE_SELECT_EMPTY_VALUE,
  CONTENT_PROMPT_NODE_CANDIDATE_PAGE_SIZE,
  CONTENT_PROMPT_REFERENCE_DRAG_MIME,
  areCreativeFlowGroupNodePropsEqual,
  areCreativeFlowNodePropsEqual,
  candidateJobId,
  candidateModelId,
  candidatePreviewMediaKind,
  candidatePreviewPlaceholderIcon,
  candidatePreviewsForNode,
  candidatePromptSnapshotText,
  candidateRetryGenerationOptions,
  contentCanvasScopeLabel,
  contentCanvasNodeLibraryLabel,
  contentCanvasTimelineNamespaceParentsForSceneMoment,
  contentCanvasUploadedResourceFromDropEvent,
  contentPromptReferenceRoleMenuPoint,
  creativeFlowNodeDisplay,
  currentCandidatePreview,
  isCreativePromptEditableNode,
  mediaKindForCurrentState,
  previewStatusLabel,
  quickCreateChildTimelineNamespaceInput,
  quickCreateChildTimelineNamespaceKind,
  quickCreateDialogCopy,
  quickCreateDialogEntityKind,
  quickCreateDialogIdPrefix,
  quickCreateDialogNeedsProductionSegment,
  quickCreateDialogNeedsSettingStateMount,
  quickCreateDialogNeedsTimelineNamespaceParent,
  quickCreateDialogNeedsVisualOwner,
  quickCreateDialogPlanItems,
  quickCreateDialogSessionKey,
  quickCreateExistingEntityIds,
  quickCreateMountInput,
  quickCreateProductionInput,
  quickCreateTimelineNamespaceInput,
  recordValue,
  selectionKindForPromptNode,
  stateNodeBelongsToSetting,
  stringRecordField,
  structuredPromptFromNode,
  timelineNamespaceLabel,
  type ContentCanvasNameDialogState,
  type ContentCanvasCreateSelectOption,
  type CreateReferenceMode,
  type CreativeCanvasQuickCreateDialogState,
  type CreativeFlowGroupNodeData,
  type CreativeFlowNodeCandidatePreview,
  type CreativeFlowNodeData,
  type QuickCreatePlanItem,
} from './ContentPromptCanvasPanelModel'

export const contentPromptCanvasNodeTypes = {
  contentPrompt: memo(ContentPromptFlowNode, areCreativeFlowNodePropsEqual),
  contentGroup: memo(ContentPromptGroupFlowNode, areCreativeFlowGroupNodePropsEqual),
}

export function ContentPromptCanvasAssetLibraryCard({
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

export function ContentPromptCanvasAssetDrawerPager({
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

export function ContentCanvasNameDialog({
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

function ContentPromptGroupFlowNode({ data, selected }: NodeProps<Node<CreativeFlowGroupNodeData>>) {
  return (
    <section
      className="content-prompt-flow-group"
      data-selected={selected ? 'true' : undefined}
      aria-label={`${data.title}，${data.memberCount} 个节点`}
    >
      <header>
        <span>
          <Layers3 size={13} aria-hidden="true" />
          <strong>{data.title}</strong>
        </span>
        <em>{data.memberCount} 个节点</em>
      </header>
    </section>
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
      data-selected={focused || selected ? 'true' : undefined}
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
        data.onReferenceDrop(node, sourceNodeId, { x: event.clientX, y: event.clientY })
      }}
    >
      <section className="content-prompt-flow-node__preview-card">
        <Handle className="content-prompt-flow-node__handle content-prompt-flow-node__handle--target" type="target" position={Position.Left} />
        <Handle className="content-prompt-flow-node__handle content-prompt-flow-node__handle--source" type="source" position={Position.Right} />
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
          <GenerationCallComposerRoot compact className="content-prompt-flow-node__generation-composer">
            {editablePrompt ? (
              <GenerationCallPromptBlock>
                <ContentCanvasPromptEditor
                  ariaLabel={`${node.title} 提示词`}
                  candidateSelections={data.candidateSelections}
                  nodes={data.nodes}
                  ownerNode={generationTarget?.node ?? node}
                  structured={structuredPromptFromNode(generationTarget?.node ?? node)}
                  value={data.prompt}
                  onChange={(prompt) => data.onPromptDraftChange(node, prompt)}
                  onBlur={(prompt) => data.onPromptCommit(node, prompt)}
                  onReferencePoolCommit={(prompt, generationReferences) => data.onReferencePoolCommit(node, prompt, generationReferences)}
                  onStructuredCommit={(structured) => data.onStructuredPromptCommit(node, structured)}
                  onSelectNode={(referenceNode) => data.onSelectNode(selectionKindForPromptNode(referenceNode), referenceNode.id)}
                />
              </GenerationCallPromptBlock>
            ) : null}
            {data.item.canGenerate ? (
              <ContentPromptFlowNodeGenerationPanel
                node={generationTarget?.node ?? node}
                prompt={data.prompt}
                promptPreviewNode={node}
                onPromptPreview={data.onCandidatePromptPreview}
                onPreflight={(targetNode, options) => data.onGeneratePreflight(targetNode, options)}
                onSubmit={(options) => data.onGenerateWithOptions(node, options)}
              />
            ) : null}
          </GenerationCallComposerRoot>
        </section>
      ) : null}
    </article>
  )
}

export function ContentPromptCanvasQuickCreateDialog({
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
  prompt,
  promptPreviewNode,
  onPromptPreview,
  onPreflight,
  onSubmit,
}: {
  node: ContentCanvasNode
  prompt?: string
  promptPreviewNode?: ContentCanvasNode
  onPromptPreview?: (node: ContentCanvasNode | undefined) => Promise<ContentCanvasCandidatePromptPreview>
  onPreflight: (node: ContentCanvasNode, options: Partial<ContentCanvasCandidateGenerationOptions>) => Promise<GenerationBackendPreflightResult>
  onSubmit: (options: ContentCanvasCandidateGenerationOptions) => void
}) {
  const mediaKind = mediaKindForNode(node)
  const capability = contentCanvasGenerationCapability(mediaKind)
  const generationPrompt = prompt ?? promptFromContentNode(node) ?? ''
  const promptPreviewTarget = promptPreviewNode ?? node
  const promptPreviewTargetRef = useRef(promptPreviewTarget)
  const generationNodeRef = useRef(node)
  promptPreviewTargetRef.current = promptPreviewTarget
  generationNodeRef.current = node
  const promptPreviewTargetKey = contentPromptGenerationNodeKey(promptPreviewTarget)
  const generationNodeKey = contentPromptGenerationNodeKey(node)
  const [compiledPromptPreview, setCompiledPromptPreview] = useState<ContentCanvasCandidatePromptPreview | null>(null)
  const [compiledPromptError, setCompiledPromptError] = useState<string | null>(null)
  const [compiledPromptPending, setCompiledPromptPending] = useState(false)
  const promptReferenceAssets = useMemo(
    () => {
      if (compiledPromptPreview?.referenceAssets?.length) return compiledPromptPreview.referenceAssets
      const compiledMentions = generationReferenceAssetsFromPromptText(compiledPromptPreview?.text)
      if (compiledMentions.length > 0) return compiledMentions
      const promptMentions = generationReferenceAssetsFromPromptText(generationPrompt)
      if (promptMentions.length > 0) return promptMentions
      return contentCanvasReferenceAssetsForOperation('', compiledPromptPreview?.resourceIds ?? [])
    },
    [compiledPromptPreview?.referenceAssets, compiledPromptPreview?.resourceIds, compiledPromptPreview?.text, generationPrompt],
  )
  const promptReferenceResourceIds = useMemo(
    () => {
      if (compiledPromptPreview?.resourceIds.length) return compiledPromptPreview.resourceIds
      return promptReferenceAssets.map((asset) => asset.resource_id)
    },
    [compiledPromptPreview?.resourceIds, promptReferenceAssets],
  )
  const operationOptions = useMemo(
    () => contentCanvasGenerationOperationOptions(mediaKind, promptReferenceAssets),
    [mediaKind, promptReferenceAssets],
  )
  const [operation, setOperation] = useState(() => operationOptions[0]?.value ?? '')
  const [operationExplicit, setOperationExplicit] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<PublicModel | null>(null)
  const [params, setParams] = useState<Record<string, string | number | boolean>>({})
  const [backendPreflight, setBackendPreflight] = useState<GenerationBackendPreflightResult | null>(null)
  const [backendPreflightPending, setBackendPreflightPending] = useState(false)
  const supportedParams = useMemo(
    () => generationModelSupportedParams(selectedModel, operation),
    [operation, selectedModel],
  )
  const generationIntent = useMemo(
    () => contentCanvasGenerationIntent(mediaKind, operation, promptReferenceResourceIds, promptReferenceAssets),
    [mediaKind, operation, promptReferenceAssets, promptReferenceResourceIds],
  )
  const generationReadiness = evaluateGenerationReadiness({
    prompt: generationPrompt,
    promptRequired: true,
    modelId: selectedModelId,
    outputKind: mediaKind,
    supportedOutputKinds: ['image', 'video'],
    requireGenerationIntent: true,
    generationIntent,
    inputResourceIds: promptReferenceResourceIds,
    compiledPromptLoaded: onPromptPreview ? !compiledPromptPending && (compiledPromptPreview !== null || Boolean(compiledPromptError)) : true,
    compiledPromptError,
    promptBlockers: compiledPromptPreview?.blockers ?? [],
  })
  const localCanSubmit = generationReadinessIsReady(generationReadiness)
  const preflightOptions = useMemo<Partial<ContentCanvasCandidateGenerationOptions> | null>(() => {
    if (!selectedModelId || !generationIntent) return null
    return {
      modelId: selectedModelId,
      params,
      supportedParams,
      generationIntent,
      generationOperationExplicit: operationExplicit,
    }
  }, [generationIntent, operationExplicit, params, selectedModelId, supportedParams])
  const readinessMessages = generationReadinessBlockerMessages(generationReadiness)
  const backendPreflightMessages = localCanSubmit
    ? generationBackendPreflightBlockerMessages(backendPreflight)
    : []
  const preflightMessages = localCanSubmit && backendPreflightPending
    ? ['后端预检中…']
    : backendPreflightMessages
  const generationMessages = [...readinessMessages, ...preflightMessages]
  const canSubmit = localCanSubmit && Boolean(backendPreflight) && generationBackendPreflightIsReady(backendPreflight)

  useEffect(() => {
    if (!selectedModel) {
      setParams({})
      return
    }
    setParams(generationParamDefaults(selectedModel, operation))
  }, [operation, selectedModel])

  useEffect(() => {
    const nextOperation = operationOptions[0]?.value ?? ''
    if (!operationOptions.some((option) => option.value === operation)) {
      setOperation(nextOperation)
      setOperationExplicit(false)
      setSelectedModelId(null)
      setSelectedModel(null)
    }
  }, [operation, operationOptions])

  useEffect(() => {
    let cancelled = false
    setCompiledPromptPreview(null)
    setCompiledPromptError(null)
    setCompiledPromptPending(false)
    if (!onPromptPreview) return undefined
    setCompiledPromptPending(true)
    onPromptPreview(promptPreviewTargetRef.current)
      .then((preview) => {
        if (!cancelled) setCompiledPromptPreview(preview)
      })
      .catch((error: unknown) => {
        if (!cancelled) setCompiledPromptError(error instanceof Error ? error.message : '提示词编译失败')
      })
      .finally(() => {
        if (!cancelled) setCompiledPromptPending(false)
      })
    return () => {
      cancelled = true
    }
  }, [generationPrompt, onPromptPreview, promptPreviewTargetKey])

  useEffect(() => {
    let cancelled = false
    setBackendPreflight(null)
    setBackendPreflightPending(false)
    if (!localCanSubmit || !preflightOptions) return undefined
    setBackendPreflightPending(true)
    onPreflight(generationNodeRef.current, preflightOptions)
      .then((result) => {
        if (!cancelled) setBackendPreflight(result)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setBackendPreflight({
            status: 'blocked',
            ready: false,
            blockers: [{
              code: 'content_candidate_preflight_failed',
              message: error instanceof Error ? error.message : '候选生成预检失败',
            }],
          })
        }
      })
      .finally(() => {
        if (!cancelled) setBackendPreflightPending(false)
      })
    return () => {
      cancelled = true
    }
  }, [generationNodeKey, localCanSubmit, onPreflight, preflightOptions])

  if (!capability || !operation) return null

  const submitGeneration = () => {
    if (!canSubmit || !selectedModelId || !generationIntent) return
    onSubmit({
      modelId: selectedModelId,
      params,
      supportedParams,
      generationIntent,
      generationOperationExplicit: operationExplicit,
    })
  }

  return (
    <GenerationCallConfigBlock
      className="content-prompt-flow-node__generation nodrag"
      onClick={(event) => event.stopPropagation()}
      label={(
        <span className="content-prompt-flow-node__generation-title">
          <Sparkles size={12} aria-hidden="true" />
          生成候选
        </span>
      )}
    >
      <GenerationCallMetaRow className="content-prompt-flow-node__generation-grid">
        <GenerationCallField className="content-prompt-flow-node__generation-field" label="品类">
          <Select
            value={operation}
            onValueChange={(nextOperation) => {
              setOperation(nextOperation)
              setOperationExplicit(true)
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
        </GenerationCallField>
        <GenerationCallField className="content-prompt-flow-node__generation-field content-prompt-flow-node__generation-field--output" label="输出">
          <GenerationCallBadge>
            {mediaKindLabel(mediaKind)}
          </GenerationCallBadge>
        </GenerationCallField>
        <GenerationCallField className="content-prompt-flow-node__generation-field content-prompt-flow-node__generation-field--model" label="模型">
          <ContentCanvasModelSelector
            capability={capability ?? 'image_generation'}
            operation={operationExplicit ? operation : ''}
            targetOutput={mediaKind}
            resolveIntent={!operationExplicit}
            referenceAssets={generationIntent?.reference_assets ?? promptReferenceAssets}
            className="content-prompt-flow-node__generation-model"
            value={selectedModelId}
            onChange={setSelectedModelId}
            onModelChange={setSelectedModel}
          />
        </GenerationCallField>
      </GenerationCallMetaRow>
      {supportedParams.length ? (
        <ContentCanvasGenerationParamControls
          params={supportedParams}
          values={params}
          onChange={(key, value) => setParams((current) => ({ ...current, [key]: value }))}
          className="content-prompt-flow-node__generation-params"
        />
      ) : (
        <small className="content-prompt-flow-node__generation-defaults">
          {selectedModel ? '当前模型没有可配置参数' : '选择模型后显示参数'}
        </small>
      )}
      <GenerationCallFooter className="content-prompt-flow-node__generation-footer">
        <GenerationCallMessages
          className="content-prompt-flow-node__generation-messages"
          messages={generationMessages}
        />
        <button type="button" disabled={!canSubmit} onClick={submitGeneration}>
          <Sparkles size={11} aria-hidden="true" />
          生成
        </button>
      </GenerationCallFooter>
    </GenerationCallConfigBlock>
  )
}

function contentPromptGenerationNodeKey(node: ContentCanvasNode): string {
  const editPrompt = recordValue(node.record.edit_prompt) ?? recordValue(node.record.editPrompt)
  return [
    node.id,
    node.entityKey,
    node.kind,
    node.sourcePath,
    node.generationTask?.id,
    node.generationTask?.nodeId,
    node.generationTask?.outputKind,
    stringRecordField(node.record.output_kind),
    stringRecordField(node.record.outputKind),
    stringRecordField(editPrompt?.text),
  ].filter((value): value is string => Boolean(value)).join(':')
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

export function ContentPromptCandidatePreviewDialog({
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
