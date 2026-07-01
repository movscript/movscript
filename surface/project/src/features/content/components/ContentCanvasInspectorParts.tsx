import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, Clock3, File, FileAudio, FileText, FolderOpen, Info, Plus, Save, Star, TextCursorInput, Upload, WandSparkles, X, type LucideIcon } from 'lucide-react'
import {
  evaluateGenerationReadiness,
  generationBackendPreflightBlockerMessages,
  generationBackendPreflightIsReady,
  generationReferenceAssetsFromPromptText,
  generationReferenceRoleLabel,
  generationReadinessBlockerMessages,
  generationReadinessIsReady,
  generationParamDefaults,
  type GenerationBackendPreflightResult,
  type GenerationIntentPayload,
} from '@movscript/core/generation'
import { suggestMovScriptEntityId } from '@movscript/domain'
import { parseResourceMentions } from '@movscript/workspace'

import { ResourceFileAudio, ResourceFileImage, ResourceFileVideo } from '@movscript/resource-surface/resource-media-components'
import type { PublicModel } from '@movscript/shared'
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
  CONTENT_CANVAS_EXPRESSION_UNIT_KIND_OPTIONS,
  type ContentCanvasCreateNodeInput,
  type ContentCanvasExpressionUnitEditorInput,
} from '../application/contentCanvasCommands'
import { contentCanvasNodeDisplayKind } from '../domain/contentCanvasDomainPolicy'
import type { ContentCanvasUploadedResource } from '../application/contentCanvasWorkspaceGateway'
import type { ContentCanvasCandidate, ContentCanvasNode } from '../domain/contentCanvasTypes'
import type { CandidateSelections, ContentCanvasNodePosition, InspectorSelection } from './contentCanvasWorkspaceTypes'
import type { NodeMediaKind } from './contentCanvasWorkspaceNodeModel'
import { ContentCanvasGenerationParamControls } from './ContentCanvasGenerationParamControls'
import { ContentCanvasModelSelector } from './ContentCanvasModelSelector'
import {
  contentCanvasGenerationCapability,
  contentCanvasGenerationIntent,
  contentCanvasGenerationOperationOptions,
  contentCanvasReferenceAssetsForOperation,
} from './contentCanvasGenerationOptions'
import { expressionUnitKindValue } from './contentCanvasWorkspaceDisplayModel'
import { contentCanvasGenerationTargetForNode } from './contentCanvasWorkspaceGenerationModel'
import { ContentCanvasResourceCandidatePicker } from './ContentCanvasResourceCandidatePicker'
import {
  candidateDecisionForNode,
  iconForContentNode,
  mediaKindForNode,
  mediaKindLabel,
  promptFromContentNode,
  selectedCandidateForNode,
} from './contentCanvasWorkspaceModel'

export type ContentCanvasCandidateGenerationOptions = {
  modelId: string
  params: Record<string, string | number | boolean>
  supportedParams?: PublicModel['supported_params']
  generationIntent?: GenerationIntentPayload
  generationOperationExplicit?: boolean
}

export type ContentCanvasCandidatePromptPreview = {
  text: string
  compiledText?: string
  resourceIds: number[]
  referenceAssets?: NonNullable<GenerationIntentPayload['reference_assets']>
  replacements: Array<Record<string, unknown>>
  blockers: Array<Record<string, unknown>>
}

export function CreateChildNodeInspector({
  eyebrow,
  title,
  description,
  idPlaceholder,
  initialStatus,
  parentNode,
  titlePlaceholder,
  targetLabel,
  statusPlaceholder,
  statusLabel = 'Status',
  statusOptions,
  submitLabel,
  transformInput,
  onSubmit,
}: {
  eyebrow: string
  title: string
  description: string
  idPlaceholder: string
  initialStatus?: string
  parentNode?: ContentCanvasNode
  titlePlaceholder: string
  targetLabel?: string
  statusPlaceholder: string
  statusLabel?: string
  statusOptions?: Array<{ value: string; label: string }>
  submitLabel: string
  transformInput?: (input: ContentCanvasCreateNodeInput) => ContentCanvasCreateNodeInput
  onSubmit: (input: ContentCanvasCreateNodeInput) => void
}) {
  const [id, setId] = useState('')
  const [hasManualId, setHasManualId] = useState(false)
  const [nodeTitle, setNodeTitle] = useState('')
  const [status, setStatus] = useState(initialStatus ?? statusOptions?.[0]?.value ?? '')
  const suggestedId = suggestMovScriptEntityId({
    title: nodeTitle.trim() || titlePlaceholder,
    fallbackPrefix: idPlaceholder,
  })
  const resolvedId = hasManualId ? id.trim() : suggestedId
  const canSubmit = Boolean(nodeTitle.trim() && resolvedId && status.trim())
  const selectedStatusLabel = statusOptions?.find((option) => option.value === status)?.label ?? status
  const planItems = createChildNodeInspectorPlanItems({
    id: resolvedId,
    idPlaceholder,
    nodeTitle,
    parentNode,
    selectedStatusLabel,
    status,
    statusLabel,
    statusPlaceholder,
    targetLabel: targetLabel ?? title,
    titlePlaceholder,
  })

  useEffect(() => {
    setStatus(initialStatus ?? statusOptions?.[0]?.value ?? '')
  }, [initialStatus])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    const input = { id: hasManualId ? id.trim() : '', title: nodeTitle.trim(), status: status.trim() }
    onSubmit(transformInput ? transformInput(input) : input)
  }

  return (
    <div className="content-canvas-inspector-card">
      <InspectorHeader eyebrow={eyebrow} title={title} Icon={Plus} />
      <p>{description}</p>
      <form className="content-canvas-inspector-create-form" onSubmit={handleSubmit}>
        <label>
          <span>标题</span>
          <input
            value={nodeTitle}
            placeholder={titlePlaceholder}
            onChange={(event) => setNodeTitle(event.target.value)}
            autoFocus
          />
        </label>
        <details className="content-canvas-create-dialog__advanced">
          <summary>高级：自定义 ID</summary>
          <label>
            <span>ID</span>
            <input
              value={hasManualId ? id : suggestedId}
              placeholder={idPlaceholder}
              onChange={(event) => {
                const nextId = event.target.value
                setId(nextId)
                setHasManualId(Boolean(nextId.trim()))
              }}
            />
          </label>
        </details>
        <label>
          <span>{statusLabel}</span>
          {statusOptions ? (
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label={statusLabel}
            >
              <option value="" disabled>{statusPlaceholder}</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : (
            <input
              value={status}
              placeholder={statusPlaceholder}
              onChange={(event) => setStatus(event.target.value)}
            />
          )}
        </label>
        <CreateChildNodeInspectorPlanPreview items={planItems} />
        <button type="submit" disabled={!canSubmit}>
          <Plus size={13} aria-hidden="true" />
          {submitLabel}
        </button>
      </form>
    </div>
  )
}

type CreateChildNodeInspectorPlanItem = {
  label: string
  value: string
  tone?: 'context' | 'create' | 'use'
}

function CreateChildNodeInspectorPlanPreview({ items }: { items: CreateChildNodeInspectorPlanItem[] }) {
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

function createChildNodeInspectorPlanItems(input: {
  id: string
  idPlaceholder: string
  nodeTitle: string
  parentNode?: ContentCanvasNode
  selectedStatusLabel: string
  status: string
  statusLabel: string
  statusPlaceholder: string
  targetLabel: string
  titlePlaceholder: string
}): CreateChildNodeInspectorPlanItem[] {
  const items: CreateChildNodeInspectorPlanItem[] = []
  if (input.parentNode) {
    items.push({
      label: '父节点',
      value: `${contentCanvasNodeDisplayKind(input.parentNode)} · ${input.parentNode.title}`,
      tone: 'context',
    })
  }
  items.push({
    label: '目标类型',
    value: input.targetLabel,
    tone: 'context',
  })
  items.push({
    label: input.statusLabel,
    value: input.selectedStatusLabel || input.status || input.statusPlaceholder,
    tone: 'use',
  })
  items.push({
    label: '目标节点',
    value: `${input.nodeTitle.trim() || input.titlePlaceholder} (${input.id.trim() || input.idPlaceholder})`,
    tone: 'create',
  })
  return items
}

export function GenerationTaskPanel({ node }: { node: ContentCanvasNode | undefined }) {
  const task = node?.generationTask
  if (!task) return null
  return (
    <InspectorSection title="创作片段">
      <div className="content-canvas-generation-task" data-status={task.status}>
        <span>
          <small>{generationTaskStatusLabel(task.status)}</small>
          <strong>{task.title}</strong>
          <em>{task.contentUnitType} / {task.outputKind}</em>
        </span>
        <b>{task.candidates.length} 候选</b>
      </div>
      <InspectorMeta label="创作片段来源" value={task.sourcePath} />
    </InspectorSection>
  )
}

export function CandidateDecisionPanel({
  node,
  prompt,
  candidateSelections,
  onCandidateCreate,
  onCandidatePreflight,
  onCandidatePromptPreview,
  onCandidateSelect,
  onCandidateResourceSelect,
  onCandidateUpload,
}: {
  node: ContentCanvasNode | undefined
  prompt?: string
  candidateSelections: CandidateSelections
  onCandidateCreate?: (node: ContentCanvasNode | undefined, options: ContentCanvasCandidateGenerationOptions) => void
  onCandidatePreflight?: (node: ContentCanvasNode | undefined, options: Partial<ContentCanvasCandidateGenerationOptions>) => Promise<GenerationBackendPreflightResult>
  onCandidatePromptPreview?: (node: ContentCanvasNode | undefined) => Promise<ContentCanvasCandidatePromptPreview>
  onCandidateSelect: (node: ContentCanvasNode | undefined, candidate: ContentCanvasCandidate) => void
  onCandidateResourceSelect?: (node: ContentCanvasNode | undefined, resource: ContentCanvasUploadedResource, position?: ContentCanvasNodePosition) => void
  onCandidateUpload?: (node: ContentCanvasNode | undefined, file: File) => void
}) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [showResourcePicker, setShowResourcePicker] = useState(false)
  const [showGenerationDialog, setShowGenerationDialog] = useState(false)
  const [detailCandidate, setDetailCandidate] = useState<ContentCanvasCandidate | null>(null)
  const closeResourcePicker = useCallback(() => setShowResourcePicker(false), [])
  const closeGenerationDialog = useCallback(() => setShowGenerationDialog(false), [])
  const loadGenerationPromptPreview = useCallback(() => {
    if (onCandidatePromptPreview) return onCandidatePromptPreview(node)
    return Promise.resolve({ text: prompt ?? '', compiledText: prompt ?? '', resourceIds: [], referenceAssets: [], replacements: [], blockers: [] })
  }, [node, onCandidatePromptPreview, prompt])
  const target = contentCanvasGenerationTargetForNode(node)
  const decision = candidateDecisionForNode(target?.node, candidateSelections)
  useEffect(() => {
    if (detailCandidate && !target?.candidates.some((candidate) => candidate.id === detailCandidate.id)) {
      setDetailCandidate(null)
    }
  }, [detailCandidate, target?.candidates])
  if (!target || !decision) return null
  const candidates = target.candidates
  const selectedCandidate = selectedCandidateForNode(target.node, candidateSelections)
  const mediaKind = mediaKindForNode(target.node)
  const canGenerateCandidate = mediaKind === 'image' || mediaKind === 'video'
  const generationPrompt = prompt ?? promptFromContentNode(target.node) ?? ''
  return (
    <InspectorSection title="候选决策">
      {candidates.length ? (
        <div className="content-canvas-candidate-list">
          {candidates.map((candidate, index) => {
            const selected = candidate.id === selectedCandidate?.id
            return (
              <CandidateListCard
                key={candidateListKey(candidate, index)}
                candidate={candidate}
                fallbackKind={mediaKind}
                selected={selected}
                onSelect={() => onCandidateSelect(node, candidate)}
                onDetail={() => setDetailCandidate(candidate)}
              />
            )
          })}
        </div>
      ) : (
        <div className="content-canvas-candidate-empty">
          <span>{mediaKindLabel(mediaKind)}</span>
          <strong>{decision.label}</strong>
          <small>{decision.summary}</small>
        </div>
      )}
      <div className="content-canvas-candidate-actions">
        <button
          type="button"
          onClick={() => setShowGenerationDialog(true)}
          disabled={!canGenerateCandidate || !onCandidateCreate}
          title={canGenerateCandidate ? undefined : '当前创作片段暂未接入真实生成接口'}
        >
          <WandSparkles size={12} aria-hidden="true" />
          {candidates.length ? '再生成候选' : decision.actionLabel}
        </button>
        {onCandidateUpload ? (
          <>
            <input
              ref={uploadInputRef}
              type="file"
              accept={candidateUploadAccept(mediaKind)}
              className="content-canvas-candidate-upload-input"
              aria-label={`${target.label} 上传候选文件`}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (file) onCandidateUpload(node, file)
              }}
            />
            <button type="button" onClick={() => uploadInputRef.current?.click()}>
              <Upload size={12} aria-hidden="true" />
              上传候选
            </button>
          </>
        ) : null}
        {onCandidateResourceSelect ? (
          <button type="button" onClick={() => setShowResourcePicker(true)}>
            <FolderOpen size={12} aria-hidden="true" />
            资源库候选
          </button>
        ) : null}
      </div>
      {showResourcePicker && onCandidateResourceSelect ? (
        <ResourceCandidatePickerDialog
          mediaKind={mediaKind}
          onClose={closeResourcePicker}
          onSelect={(resource) => {
            onCandidateResourceSelect(node, resource)
            closeResourcePicker()
          }}
        />
      ) : null}
      {showGenerationDialog && onCandidateCreate && canGenerateCandidate ? (
        <GenerationCandidateDialog
          mediaKind={mediaKind === 'video' ? 'video' : 'image'}
          prompt={generationPrompt}
          loadCompiledPrompt={loadGenerationPromptPreview}
          onPreflight={onCandidatePreflight ? (options) => onCandidatePreflight(node, options) : undefined}
          onClose={closeGenerationDialog}
          onSubmit={(options) => {
            onCandidateCreate(node, options)
            closeGenerationDialog()
          }}
        />
      ) : null}
      {detailCandidate ? (
        <CandidateDetailDialog
          candidate={detailCandidate}
          fallbackPrompt={generationPrompt}
          fallbackKind={mediaKind}
          loadCompiledPrompt={onCandidatePromptPreview ? loadGenerationPromptPreview : undefined}
          selected={detailCandidate.id === selectedCandidate?.id}
          onClose={() => setDetailCandidate(null)}
          onSelect={() => {
            onCandidateSelect(node, detailCandidate)
            setDetailCandidate(null)
          }}
        />
      ) : null}
    </InspectorSection>
  )
}

function CandidateListCard({
  candidate,
  fallbackKind,
  selected,
  onSelect,
  onDetail,
}: {
  candidate: ContentCanvasCandidate
  fallbackKind: ReturnType<typeof mediaKindForNode>
  selected: boolean
  onSelect: () => void
  onDetail: () => void
}) {
  const status = candidateStatusView(candidate)
  const canSelect = candidateCanSelect(candidate)
  const primaryLabel = candidateListPrimaryLabel(candidate, fallbackKind)
  const secondaryLabel = candidateListSecondaryLabel(candidate)
  return (
    <div className="content-canvas-candidate-card" data-selected={selected ? 'true' : undefined} data-status={status.tone}>
      <CandidateResourcePreview candidate={candidate} fallbackKind={fallbackKind} size="compact" />
      <span className="content-canvas-candidate-card__copy">
        <strong>{primaryLabel}</strong>
        <small>
          <b data-status={status.tone}>{status.label}</b>
          <em>{candidateSourceLabel(candidate)}</em>
          {secondaryLabel ? <em>{secondaryLabel}</em> : null}
        </small>
      </span>
      {selected ? (
        <span className="content-canvas-candidate-card__selected-icon" title="当前选中" aria-label="当前选中">
          <Star size={14} aria-hidden="true" fill="currentColor" />
        </span>
      ) : null}
      <span className="content-canvas-candidate-card__actions">
        <button type="button" onClick={onSelect} disabled={!canSelect || selected} aria-label={`选择候选 ${candidate.id}`}>
          <Check size={12} aria-hidden="true" />
          {selected ? '当前' : '选择'}
        </button>
        <button type="button" onClick={onDetail} aria-label={`查看候选 ${candidate.id} 详情`}>
          <Info size={12} aria-hidden="true" />
          详情
        </button>
      </span>
    </div>
  )
}

function candidateListKey(candidate: ContentCanvasCandidate, index: number): string {
  return [
    candidate.id,
    candidate.resourceId ?? '',
    candidate.artifactRef ?? '',
    candidate.inputHash ?? '',
    candidate.source ?? '',
    index,
  ].join(':')
}

function CandidateDetailDialog({
  candidate,
  fallbackPrompt,
  fallbackKind,
  loadCompiledPrompt,
  selected,
  onClose,
  onSelect,
}: {
  candidate: ContentCanvasCandidate
  fallbackPrompt?: string
  fallbackKind: ReturnType<typeof mediaKindForNode>
  loadCompiledPrompt?: () => Promise<ContentCanvasCandidatePromptPreview>
  selected: boolean
  onClose: () => void
  onSelect: () => void
}) {
  const titleId = useId()
  const status = candidateStatusView(candidate)
  const producer = candidate.producer ?? {}
  const canSelect = candidateCanSelect(candidate)
  const candidateCompiledPrompt = candidateCompiledPromptText(candidate)
  const candidatePrompt = candidateCompiledPrompt ?? candidatePromptText(candidate)
  const [compiledPrompt, setCompiledPrompt] = useState<string | null>(null)
  const [compiledPromptPreview, setCompiledPromptPreview] = useState<ContentCanvasCandidatePromptPreview | null>(null)
  const [compiledPromptError, setCompiledPromptError] = useState<string | null>(null)
  const promptText = compiledPrompt ?? candidatePrompt ?? nonEmptyString(fallbackPrompt)

  useEffect(() => {
    if (candidateCompiledPrompt || !loadCompiledPrompt) return undefined
    let cancelled = false
    setCompiledPrompt(null)
    setCompiledPromptPreview(null)
    setCompiledPromptError(null)
    loadCompiledPrompt()
      .then((preview) => {
        if (cancelled) return
        setCompiledPrompt(nonEmptyString(preview.compiledText) ?? nonEmptyString(preview.text) ?? null)
        setCompiledPromptPreview(preview)
      })
      .catch((error) => {
        if (!cancelled) setCompiledPromptError(error instanceof Error ? error.message : '提示词编译失败')
      })
    return () => {
      cancelled = true
    }
  }, [candidateCompiledPrompt, loadCompiledPrompt])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const dialog = (
    <div
      className="content-canvas-candidate-detail-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="content-canvas-candidate-detail-dialog__backdrop"
        aria-label="关闭候选详情"
        onClick={onClose}
      />
      <div className="content-canvas-candidate-detail-dialog__panel">
        <div className="content-canvas-candidate-detail-dialog__header">
          <h2 id={titleId}>
            <Info size={14} aria-hidden="true" />
            候选预览
          </h2>
          <button
            type="button"
            className="content-canvas-candidate-detail-dialog__close"
            aria-label="关闭候选详情"
            onClick={onClose}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <div className="content-canvas-candidate-detail-dialog__body">
          <div className="content-canvas-candidate-detail-hero">
            <CandidateResourcePreview candidate={candidate} fallbackKind={fallbackKind} size="large" />
          </div>
          <div className="content-canvas-candidate-detail-summary">
            <span>
              <small data-status={status.tone}>{selected ? '已选择' : status.label}</small>
              <strong>{candidateListPrimaryLabel(candidate, fallbackKind)}</strong>
              <em>{candidateSourceLabel(candidate)} / {candidate.resourceKind ?? fallbackKind}</em>
            </span>
            <CandidateDetailMeta
              createdAt={candidate.createdAt}
              model={stringValue(producer.model_id) ?? stringValue(producer.model) ?? candidate.source}
              resourceId={candidate.resourceId}
              source={candidateSourceLabel(candidate)}
            />
            {promptText || compiledPromptError || loadCompiledPrompt ? (
              <CandidateDetailPrompt
                error={compiledPromptError}
                loading={!promptText && !compiledPromptError && Boolean(loadCompiledPrompt)}
                preview={compiledPromptPreview}
                prompt={promptText}
              />
            ) : null}
          </div>
        </div>
        <div className="content-canvas-candidate-detail-dialog__footer">
          <button type="button" onClick={onSelect} disabled={!canSelect || selected}>
            <Check size={12} aria-hidden="true" />
            {selected ? '已是当前' : '设为当前'}
          </button>
          <button type="button" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return dialog
  return createPortal(dialog, document.body)
}

function CandidateDetailMeta({
  createdAt,
  model,
  resourceId,
  source,
}: {
  createdAt?: string
  model?: string
  resourceId?: number
  source?: string
}) {
  return (
    <div className="content-canvas-candidate-detail-meta" aria-label="候选来源信息">
      {source ? <span>{source}</span> : null}
      {model ? <span>{model}</span> : null}
      {resourceId !== undefined ? <span>Resource {resourceId}</span> : null}
      {createdAt ? <span>{formatCandidateCreatedAt(createdAt)}</span> : null}
    </div>
  )
}

function formatCandidateCreatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function candidatePromptText(candidate: ContentCanvasCandidate): string | undefined {
  const snapshot = candidate.promptSnapshot
  if (!snapshot) return undefined
  return candidateCompiledPromptText(candidate)
    ?? stringValue(snapshot.prompt_text)
    ?? stringValue(snapshot.promptText)
    ?? stringValue(snapshot.text)
    ?? stringValue(snapshot.prompt)
    ?? editPromptText(snapshot.edit_prompt)
    ?? editPromptText(snapshot.editPrompt)
}

function candidateCompiledPromptText(candidate: ContentCanvasCandidate): string | undefined {
  const snapshot = candidate.promptSnapshot
  if (!snapshot) return undefined
  return stringValue(snapshot.provider_prompt_text)
    ?? stringValue(snapshot.compiled_prompt_text)
    ?? compiledPromptText(snapshot.compiled_prompt)
    ?? compiledPromptText(snapshot.compiledPrompt)
}

function compiledPromptText(value: unknown): string | undefined {
  const prompt = recordValue(value)
  if (!prompt) return stringValue(value)
  return stringValue(prompt.text)
    ?? stringValue(prompt.prompt_text)
    ?? editPromptText(prompt.edit_prompt)
    ?? editPromptText(prompt.editPrompt)
}

function editPromptText(value: unknown): string | undefined {
  const editPrompt = recordValue(value)
  if (!editPrompt) return stringValue(value)
  return stringValue(editPrompt.text)
}

function CandidateDetailPrompt({
  error,
  loading,
  preview,
  prompt,
}: {
  error?: string | null
  loading?: boolean
  preview?: ContentCanvasCandidatePromptPreview | null
  prompt?: string
}) {
  return (
    <section className="content-canvas-candidate-detail-prompt content-canvas-prompt-editor">
      <span className="content-canvas-prompt-editor__label">
        <TextCursorInput size={13} aria-hidden="true" />
        Prompt
      </span>
      {error || loading || !prompt ? (
        <div className="content-canvas-prompt-inline-editor-shell">
          <div
            className="content-canvas-prompt-inline-editor"
            aria-label="候选提示词"
            role="textbox"
            aria-readonly="true"
            data-state={error ? 'error' : loading ? 'loading' : undefined}
          >
            {error ?? (loading ? '正在编译提示词…' : prompt)}
          </div>
        </div>
      ) : (
        <CompiledPromptPreview preview={preview ?? null} fallbackText={prompt} />
      )}
    </section>
  )
}

function ResourceCandidatePickerDialog({
  mediaKind,
  onSelect,
  onClose,
}: {
  mediaKind: ReturnType<typeof mediaKindForNode>
  onSelect: (resource: ContentCanvasUploadedResource) => void
  onClose: () => void
}) {
  const titleId = useId()

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const dialog = (
    <div
      className="content-canvas-resource-candidate-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="content-canvas-resource-candidate-dialog__backdrop"
        aria-label="关闭资源库候选选择"
        onClick={onClose}
      />
      <div className="content-canvas-resource-candidate-dialog__panel">
        <div className="content-canvas-resource-candidate-dialog__header">
          <h2 id={titleId}>
            <FolderOpen size={14} aria-hidden="true" />
            资源库候选
          </h2>
          <button
            type="button"
            className="content-canvas-resource-candidate-dialog__close"
            aria-label="关闭资源库候选选择"
            onClick={onClose}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <div className="content-canvas-resource-candidate-dialog__body">
          <ContentCanvasResourceCandidatePicker mediaKind={mediaKind} onSelect={onSelect} />
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return dialog
  return createPortal(dialog, document.body)
}

export function GenerationCandidateDialog({
  mediaKind,
  prompt,
  loadCompiledPrompt,
  onPreflight,
  onSubmit,
  onClose,
}: {
  mediaKind: 'image' | 'video' | 'audio'
  prompt: string
  loadCompiledPrompt?: () => Promise<ContentCanvasCandidatePromptPreview>
  onPreflight?: (options: Partial<ContentCanvasCandidateGenerationOptions>) => Promise<GenerationBackendPreflightResult>
  onSubmit: (options: ContentCanvasCandidateGenerationOptions) => void
  onClose: () => void
}) {
  const titleId = useId()
  const capability = contentCanvasGenerationCapability(mediaKind)
  const [compiledPrompt, setCompiledPrompt] = useState<string | null>(null)
  const [compiledPromptPreview, setCompiledPromptPreview] = useState<ContentCanvasCandidatePromptPreview | null>(null)
  const compiledPromptResourceIds = compiledPromptPreview?.resourceIds ?? []
  const compiledPromptResourceKey = compiledPromptResourceIds.join(',')
  const compiledPromptReferenceAssets = useMemo(
    () => {
      if (compiledPromptPreview?.referenceAssets?.length) return compiledPromptPreview.referenceAssets
      const promptMentions = generationReferenceAssetsFromPromptText(compiledPrompt)
      if (promptMentions.length > 0) return promptMentions
      return contentCanvasReferenceAssetsForOperation('', compiledPromptResourceIds)
    },
    [compiledPrompt, compiledPromptPreview?.referenceAssets, compiledPromptResourceKey],
  )
  const operationOptions = useMemo(
    () => contentCanvasGenerationOperationOptions(mediaKind, compiledPromptReferenceAssets),
    [compiledPromptReferenceAssets, mediaKind],
  )
  const [operation, setOperation] = useState(() => operationOptions[0]?.value ?? '')
  const [operationExplicit, setOperationExplicit] = useState(false)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<PublicModel | null>(null)
  const [params, setParams] = useState<Record<string, string | number | boolean>>({})
  const [compiledPromptBlockers, setCompiledPromptBlockers] = useState<Array<Record<string, unknown>>>([])
  const [compiledPromptError, setCompiledPromptError] = useState<string | null>(null)
  const [backendPreflight, setBackendPreflight] = useState<GenerationBackendPreflightResult | null>(null)
  const [backendPreflightPending, setBackendPreflightPending] = useState(false)
  const supportedParams = useMemo(() => selectedModel?.supported_params ?? [], [selectedModel?.supported_params])
  const generationIntent = useMemo(
    () => contentCanvasGenerationIntent(mediaKind, operation, compiledPromptResourceIds, compiledPromptReferenceAssets),
    [compiledPromptReferenceAssets, compiledPromptResourceKey, mediaKind, operation],
  )
  const generationReadiness = evaluateGenerationReadiness({
    prompt: compiledPrompt ?? prompt,
    promptRequired: true,
    modelId: selectedModelId,
    outputKind: mediaKind,
    supportedOutputKinds: ['image', 'video'],
    requireGenerationIntent: true,
    generationIntent,
    inputResourceIds: compiledPromptResourceIds,
    compiledPromptLoaded: compiledPrompt !== null || Boolean(compiledPromptError),
    compiledPromptError,
    promptBlockers: compiledPromptBlockers,
  })
  const localCanSubmit = generationReadinessIsReady(generationReadiness)
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
    setParams(generationParamDefaults(selectedModel))
  }, [selectedModel?.model_id])

  useEffect(() => {
    const nextOperation = operationOptions[0]?.value ?? ''
    if (!operationOptions.some((option) => option.value === operation)) {
      setOperation(nextOperation)
      setOperationExplicit(false)
    }
  }, [operation, operationOptions])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    setCompiledPrompt(null)
    setCompiledPromptPreview(null)
    setCompiledPromptBlockers([])
    setCompiledPromptError(null)
    if (!loadCompiledPrompt) {
      const preview = { text: prompt, compiledText: prompt, resourceIds: [], referenceAssets: [], replacements: [], blockers: [] }
      setCompiledPrompt(prompt)
      setCompiledPromptPreview(preview)
      return () => {
        cancelled = true
      }
    }
    loadCompiledPrompt()
      .then((preview) => {
        if (!cancelled) {
          setCompiledPrompt(preview.text)
          setCompiledPromptPreview(preview)
          setCompiledPromptBlockers(preview.blockers)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setCompiledPromptError(error instanceof Error ? error.message : '提示词编译失败')
      })
    return () => {
      cancelled = true
    }
  }, [loadCompiledPrompt, prompt])

  useEffect(() => {
    let cancelled = false
    setBackendPreflight(null)
    setBackendPreflightPending(false)
    if (!localCanSubmit || !selectedModelId || !generationIntent) return undefined
    if (!onPreflight) {
      setBackendPreflight({ status: 'ready', ready: true, blockers: [] })
      return undefined
    }
    setBackendPreflightPending(true)
    onPreflight({
      modelId: selectedModelId,
      params,
      supportedParams,
      generationIntent,
      generationOperationExplicit: operationExplicit,
    })
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
  }, [generationIntent, localCanSubmit, onPreflight, operationExplicit, params, selectedModelId, supportedParams])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit || !selectedModelId || !generationIntent) return
    onSubmit({
      modelId: selectedModelId,
      params,
      supportedParams,
      generationIntent,
      generationOperationExplicit: operationExplicit,
    })
  }

  const dialog = (
    <div
      className="content-canvas-generation-candidate-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="content-canvas-generation-candidate-dialog__backdrop"
        aria-label="关闭生成候选设置"
        onClick={onClose}
      />
      <form className="content-canvas-generation-candidate-dialog__panel" onSubmit={handleSubmit}>
        <div className="content-canvas-generation-candidate-dialog__header">
          <h2 id={titleId}>
            <WandSparkles size={14} aria-hidden="true" />
            生成候选
          </h2>
          <button
            type="button"
            className="content-canvas-generation-candidate-dialog__close"
            aria-label="关闭生成候选设置"
            onClick={onClose}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <GenerationCallComposerRoot className="content-canvas-generation-candidate-dialog__body">
          <GenerationCallPromptBlock label="提示词">
            <section className="content-canvas-generation-candidate-prompt">
              {compiledPromptError || compiledPrompt === null ? (
                <pre data-state={compiledPromptError ? 'error' : 'loading'}>
                  {compiledPromptError ?? '正在编译提示词…'}
                </pre>
              ) : (
                <CompiledPromptPreview preview={compiledPromptPreview} fallbackText={compiledPrompt} />
              )}
              {compiledPromptBlockers.length ? (
                <div className="content-canvas-generation-candidate-prompt__blockers">
                  {compiledPromptBlockers.map((blocker, index) => (
                    <small key={index}>{promptBlockerLabel(blocker)}</small>
                  ))}
                </div>
              ) : null}
            </section>
          </GenerationCallPromptBlock>
          <GenerationCallConfigBlock label="模型与参数">
            <GenerationCallMetaRow className="content-canvas-generation-candidate-meta-row">
              <GenerationCallField className="content-canvas-generation-candidate-meta-field" label="品类">
                <select
                  className="content-canvas-generation-candidate-select"
                  value={operation}
                  disabled={!capability || operationOptions.length === 0}
                  onChange={(event) => {
                    setOperation(event.currentTarget.value)
                    setOperationExplicit(true)
                    setSelectedModelId(null)
                    setSelectedModel(null)
                  }}
                >
                  {operationOptions.length > 0 ? operationOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  )) : (
                    <option value="">当前产物不支持生成</option>
                  )}
                </select>
              </GenerationCallField>
              <GenerationCallField className="content-canvas-generation-candidate-meta-field content-canvas-generation-candidate-meta-field--output" label="输出">
                <GenerationCallBadge>
                  {mediaKindLabel(mediaKind)}
                </GenerationCallBadge>
              </GenerationCallField>
              <GenerationCallField className="content-canvas-generation-candidate-meta-field content-canvas-generation-candidate-meta-field--model" label="模型">
                <ContentCanvasModelSelector
                  capability={capability ?? 'image_generation'}
                  operation={operationExplicit ? operation : ''}
                  targetOutput={mediaKind}
                  resolveIntent={!operationExplicit}
                  referenceAssets={generationIntent?.reference_assets ?? compiledPromptReferenceAssets}
                  value={selectedModelId}
                  onChange={setSelectedModelId}
                  onModelChange={setSelectedModel}
                  disabled={!capability}
                />
              </GenerationCallField>
            </GenerationCallMetaRow>
            <GenerationCallMessages messages={generationMessages} />
            {supportedParams.length ? (
              <ContentCanvasGenerationParamControls
                params={supportedParams}
                values={params}
                onChange={(key, value) => setParams((current) => ({ ...current, [key]: value }))}
                className="content-canvas-generation-candidate-params"
              />
            ) : (
              <div className="content-canvas-generation-candidate-empty-params">
                {selectedModel ? '当前模型没有可配置参数' : '选择模型后显示参数'}
              </div>
            )}
            <GenerationCallFooter className="content-canvas-generation-candidate-dialog__footer">
              <span />
              <span className="content-canvas-generation-candidate-dialog__actions">
                <button type="submit" disabled={!canSubmit}>
                  <WandSparkles size={12} aria-hidden="true" />
                  提交生成
                </button>
                <button type="button" onClick={onClose}>取消</button>
              </span>
            </GenerationCallFooter>
          </GenerationCallConfigBlock>
        </GenerationCallComposerRoot>
      </form>
    </div>
  )

  if (typeof document === 'undefined') return dialog
  return createPortal(dialog, document.body)
}

function promptBlockerLabel(blocker: Record<string, unknown>): string {
  const ref = stringValue(blocker.ref)
  const contentUnitId = stringValue(blocker.content_unit_id ?? blocker.contentUnitId)
  const message = stringValue(blocker.message)
  if (message) return message
  if (ref && contentUnitId) return `引用 ${ref} 暂无可用候选资源（${contentUnitId}）`
  if (ref) return `引用 ${ref} 暂无可用候选资源`
  if (contentUnitId) return `创作片段 ${contentUnitId} 暂无可用候选资源`
  return '提示词引用尚未解析'
}

function CompiledPromptPreview({
  preview,
  fallbackText,
}: {
  preview: ContentCanvasCandidatePromptPreview | null
  fallbackText: string
}) {
  const text = preview?.compiledText ?? fallbackText
  const parts = compiledPromptParts(text)
  if (!text.trim()) {
    return <pre>当前创作片段提示词为空</pre>
  }
  return (
    <div className="content-canvas-generation-candidate-compiled-preview">
      {parts.map((part, index) => part.kind === 'resource' ? (
        <span
          key={`${part.resourceId}:${index}`}
          className="content-canvas-generation-candidate-resource-token"
          data-role={part.role}
          data-media-type={part.mediaType ?? 'file'}
          title={`Resource ${String(part.resourceId)}`}
        >
          <CompiledPromptResourceThumb resourceId={part.resourceId} mediaType={part.mediaType} />
          <b>{generationReferenceRoleLabel(part.role) || '参考'}</b>
        </span>
      ) : (
        <span key={`text:${index}`}>{part.text}</span>
      ))}
    </div>
  )
}

function CompiledPromptResourceThumb({
  resourceId,
  mediaType,
}: {
  resourceId: number
  mediaType?: string
}) {
  if (mediaType === 'image') {
    return <ResourceFileImage resourceId={resourceId} alt="" loading="lazy" thumbnailMaxSize={48} />
  }
  if (mediaType === 'video') {
    return <ResourceFileVideo resourceId={resourceId} muted playsInline preload="metadata" />
  }
  return (
    <span className="content-canvas-generation-candidate-resource-token__type">
      {generationReferenceMediaTypeLabel(mediaType)}
    </span>
  )
}

function compiledPromptParts(text: string): Array<{ kind: 'text'; text: string } | { kind: 'resource'; resourceId: number; mediaType?: string; role?: string }> {
  const parts: Array<{ kind: 'text'; text: string } | { kind: 'resource'; resourceId: number; mediaType?: string; role?: string }> = []
  let lastIndex = 0
  for (const mention of parseResourceMentions(text)) {
    if (mention.index > lastIndex) parts.push({ kind: 'text', text: text.slice(lastIndex, mention.index) })
    parts.push({
      kind: 'resource',
      resourceId: mention.id,
      ...(mention.mediaType ? { mediaType: mention.mediaType } : {}),
      ...(mention.role ? { role: mention.role } : {}),
    })
    lastIndex = mention.index + mention.token.length
  }
  if (lastIndex < text.length) parts.push({ kind: 'text', text: text.slice(lastIndex) })
  return parts
}

function generationReferenceMediaTypeLabel(mediaType: string | undefined): string {
  if (mediaType === 'image') return '图片'
  if (mediaType === 'video') return '视频'
  if (mediaType === 'audio') return '音频'
  return '文件'
}

function CandidateResourcePreview({
  candidate,
  fallbackKind,
  size,
}: {
  candidate: ContentCanvasCandidate
  fallbackKind: ReturnType<typeof mediaKindForNode>
  size: 'compact' | 'large'
}) {
  const kind = candidatePreviewKind(candidate, fallbackKind)
  const resourceUrl = candidateResourceUrl(candidate)
  const label = `${candidate.title} 资源预览`
  if (!candidateHasPreview(candidate)) {
    const Icon = candidatePlaceholderIcon(candidate)
    return (
      <span className="content-canvas-candidate-preview" data-kind="placeholder" data-size={size} data-status={candidateStatusView(candidate).tone}>
        <Icon size={size === 'large' ? 22 : 16} aria-hidden="true" />
      </span>
    )
  }
  const previewProps = {
    resourceId: candidate.resourceId,
    resourceUrl,
  }
  if (kind === 'image') {
    return (
      <span className="content-canvas-candidate-preview" data-kind="image" data-size={size}>
        <ResourceFileImage {...previewProps} alt={label} loading={size === 'large' ? 'eager' : 'lazy'} thumbnailMaxSize={size === 'large' ? undefined : 96} />
      </span>
    )
  }
  if (kind === 'video') {
    return (
      <span className="content-canvas-candidate-preview" data-kind="video" data-size={size}>
        <ResourceFileVideo {...previewProps} muted playsInline preload="metadata" />
      </span>
    )
  }
  if (kind === 'audio' && size === 'large') {
    return (
      <span className="content-canvas-candidate-preview" data-kind="audio" data-size={size}>
        <ResourceFileAudio {...previewProps} controls preload="metadata" />
      </span>
    )
  }
  const Icon = kind === 'audio'
    ? FileAudio
    : kind === 'text'
      ? FileText
      : File
  return (
    <span className="content-canvas-candidate-preview" data-kind={kind} data-size={size}>
      <Icon size={size === 'large' ? 22 : 16} aria-hidden="true" />
    </span>
  )
}

export function ExpressionUnitEditor({
  node,
  onSave,
}: {
  node: ContentCanvasNode
  onSave: (node: ContentCanvasNode, input: ContentCanvasExpressionUnitEditorInput) => void
}) {
  const [title, setTitle] = useState(stringValue(node.record.title) ?? node.title)
  const [kind, setKind] = useState(normalizeExpressionUnitEditorKind(expressionUnitKindValue(node)))
  const canSave = Boolean(title.trim() && kind.trim())

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSave) return
    onSave(node, {
      title: title.trim(),
      kind: kind.trim(),
    })
  }

  return (
    <InspectorSection title="表达单元编辑">
      <form className="content-canvas-inspector-create-form content-canvas-expression-unit-editor" onSubmit={handleSubmit}>
        <label>
          <span>标题</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          <span>类型</span>
          <select value={kind} onChange={(event) => setKind(event.target.value)}>
            {CONTENT_CANVAS_EXPRESSION_UNIT_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={!canSave}>
          <Save size={13} aria-hidden="true" />
          保存表达单元
        </button>
      </form>
    </InspectorSection>
  )
}

export function InspectorNodeList({
  title,
  emptyText,
  nodes,
  onSelect,
}: {
  title: string
  emptyText: string
  nodes: ContentCanvasNode[]
  onSelect: (node: ContentCanvasNode) => void
}) {
  return (
    <InspectorSection title={title}>
      {nodes.length ? (
        <div className="content-canvas-inspector-node-list">
          {nodes.map((node) => {
            const Icon = iconForContentNode(node)
            return (
              <button key={node.id} type="button" onClick={() => onSelect(node)}>
                <span className="content-canvas-inspector-node-list__icon">
                  <Icon size={13} aria-hidden="true" />
                </span>
                <span>
                  <strong>{node.title}</strong>
                  <small>{node.summary || node.subtitle || node.entityKey}</small>
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <span className="content-canvas-inspector-node-list__empty">{emptyText}</span>
      )}
    </InspectorSection>
  )
}

export function InspectorChildGroups({
  groups,
  onSelectNode,
}: {
  groups: Array<{ title: string; emptyText: string; nodes: ContentCanvasNode[] }>
  onSelectNode: (kind: InspectorSelection['kind'], nodeId: string) => void
}) {
  return (
    <>
      {groups.map((group) => (
        <InspectorNodeList
          key={group.title}
          title={group.title}
          emptyText={group.emptyText}
          nodes={group.nodes}
          onSelect={(node) => onSelectNode(inspectorKindForNode(node), node.id)}
        />
      ))}
    </>
  )
}

export function childGroupsForNode(
  parent: ContentCanvasNode | undefined,
  childNodesByHierarchy: Map<string, ContentCanvasNode[]>,
) {
  if (!parent) return []
  if (parent.kind === 'scene_moment') {
    return [
      {
        title: '表达单元',
        emptyText: '这个情节暂无表达单元',
        nodes: childNodesFor(parent, childNodesByHierarchy, 'expression_unit'),
      },
    ]
  }
  const children = childNodesByHierarchy.get(parent.id) ?? []
  if (!children.length) return []
  return [{
    title: '下级节点',
    emptyText: '这个节点暂无下级',
    nodes: children,
  }]
}

export function childNodesFor(
  parent: ContentCanvasNode,
  childNodesByHierarchy: Map<string, ContentCanvasNode[]>,
  kind: ContentCanvasNode['kind'],
) {
  return (childNodesByHierarchy.get(parent.id) ?? []).filter((node) => node.kind === kind)
}

export function inspectorKindForNode(node: ContentCanvasNode): InspectorSelection['kind'] {
  if (node.kind === 'setting') return 'setting'
  if (node.kind === 'state') return 'state'
  if (node.kind === 'asset') return 'asset'
  if (node.kind === 'scene_moment') return 'scene_moment'
  return 'other'
}

export function generationTaskStatusLabel(status: NonNullable<ContentCanvasNode['generationTask']>['status']) {
  if (status === 'selected') return '已选择'
  if (status === 'ready') return '可生成'
  if (status === 'stale') return '需复查'
  if (status === 'needs_candidate') return '待生成'
  return '未绑定'
}

export function InspectorHeader({ eyebrow, title, Icon }: { eyebrow: string, title: string, Icon: LucideIcon }) {
  return (
    <div className="content-canvas-inspector-card__header">
      <span className="content-canvas-inspector-card__icon">
        <Icon size={16} aria-hidden="true" />
      </span>
      <div>
        <span className="content-canvas-inspector-card__eyebrow">{eyebrow}</span>
        <strong>{title}</strong>
      </div>
    </div>
  )
}

export function InspectorMeta({ label, value }: { label: string, value: string }) {
  return (
    <div className="content-canvas-inspector-card__meta">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}

export function InspectorSection({ title, children }: { title: string, children: ReactNode }) {
  return (
    <section className="content-canvas-inspector-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function nonEmptyString(value: unknown): string | undefined {
  return stringValue(value)
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function firstRecord(value: unknown): Record<string, unknown> | undefined {
  return Array.isArray(value) ? value.find((item): item is Record<string, unknown> => Boolean(recordValue(item))) : undefined
}

function candidateStatusView(candidate: ContentCanvasCandidate): { label: string; tone: 'ready' | 'running' | 'failed' | 'imported' | 'neutral' } {
  const status = candidate.status?.toLowerCase()
  if (status === 'queued' || status === 'pending' || status === 'running') return { label: status === 'running' ? '生成中' : '排队中', tone: 'running' }
  if (status === 'failed') return { label: '失败', tone: 'failed' }
  if (status === 'canceled' || status === 'cancelled') return { label: '已取消', tone: 'failed' }
  if (status === 'imported') return { label: '已导入', tone: 'imported' }
  if (status === 'succeeded') return { label: '可选择', tone: 'ready' }
  if (candidate.resourceId !== undefined || candidate.artifactRef) return { label: '可选择', tone: 'ready' }
  return { label: '待生成', tone: 'neutral' }
}

function candidateSourceLabel(candidate: ContentCanvasCandidate): string {
  const source = candidate.source.toLowerCase()
  if (source.includes('resource')) return '资源库'
  if (source.includes('upload')) return '上传'
  if (source.includes('editing')) return '剪辑导出'
  if (source.includes('ai') || source.includes('generate') || source.includes('pending')) return 'AI 生成'
  return candidate.source || '候选'
}

function candidateListPrimaryLabel(
  candidate: ContentCanvasCandidate,
  fallbackKind: NodeMediaKind,
): string {
  const kind = candidateListMediaKind(candidate.resourceKind, fallbackKind)
  if (candidate.resourceId !== undefined) return `${mediaKindLabel(kind)}资源 #${String(candidate.resourceId)}`
  const jobId = candidateJobId(candidate)
  if (jobId) return `${mediaKindLabel(kind)}生成任务 #${jobId}`
  return `${mediaKindLabel(kind)}候选`
}

function candidateListMediaKind(value: string | undefined, fallbackKind: NodeMediaKind): NodeMediaKind {
  if (value === 'image' || value === 'video' || value === 'audio' || value === 'text' || value === 'board' || value === 'keyframe' || value === 'scene') return value
  return fallbackKind
}

function candidateListSecondaryLabel(candidate: ContentCanvasCandidate): string | undefined {
  const jobId = candidateJobId(candidate)
  if (jobId) return `Job ${jobId}`
  if (candidate.resourceId !== undefined) return `Resource ${String(candidate.resourceId)}`
  return candidate.inputHash
}

function candidateCanSelect(candidate: ContentCanvasCandidate): boolean {
  if (candidate.selected) return true
  const status = candidate.status?.toLowerCase()
  if (status === 'queued' || status === 'pending' || status === 'running' || status === 'failed' || status === 'canceled' || status === 'cancelled') return false
  return candidate.resourceId !== undefined || Boolean(candidate.artifactRef) || status === 'succeeded' || status === 'imported' || status === undefined
}

function candidatePlaceholderIcon(candidate: ContentCanvasCandidate): LucideIcon {
  const tone = candidateStatusView(candidate).tone
  if (tone === 'running') return Clock3
  if (tone === 'failed') return X
  return WandSparkles
}

function candidateJobId(candidate: ContentCanvasCandidate): string | undefined {
  const producer = candidate.producer ?? {}
  const output = firstRecord(candidate.outputs)
  const metadata = recordValue(output?.metadata)
  return scalarText(producer.job_id)
    ?? scalarText(producer.task_id)
    ?? scalarText(metadata?.job_id)
    ?? scalarText(metadata?.task_id)
}

function candidateOutputSummary(output: Record<string, unknown> | undefined): string | undefined {
  if (!output) return undefined
  const kind = stringValue(output.kind)
  const resourceId = typeof output.resource_id === 'number' ? `Resource ${String(output.resource_id)}` : undefined
  const mime = stringValue(output.mime_type)
  return [kind, resourceId, mime].filter(Boolean).join(' / ') || undefined
}

function scalarText(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function normalizeExpressionUnitEditorKind(value: string): string {
  const text = value.trim().toLowerCase()
  if (text === 'dialogue' || text === 'narration' || text === 'voiceover' || text === 'verbal') return 'voice'
  if (text === 'caption' || text === 'text') return 'subtitle'
  if (text === 'sound' || text === 'sound_effect' || text === 'sfx' || text === 'music' || text === 'ambience' || text === 'foley') return 'audio'
  return CONTENT_CANVAS_EXPRESSION_UNIT_KIND_OPTIONS.some((option) => option.value === text) ? text : 'visual'
}

function candidateUploadAccept(kind: ReturnType<typeof mediaKindForNode>): string | undefined {
  if (kind === 'image' || kind === 'board' || kind === 'keyframe') return 'image/*'
  if (kind === 'video' || kind === 'scene') return 'video/*'
  if (kind === 'audio') return 'audio/*'
  if (kind === 'text') return 'text/*,.txt,.md,.json,.srt,.vtt'
  return undefined
}

function candidateHasPreview(candidate: ContentCanvasCandidate): boolean {
  return candidate.resourceId !== undefined || Boolean(candidateResourceUrl(candidate))
}

function candidatePreviewKind(
  candidate: ContentCanvasCandidate,
  fallbackKind: ReturnType<typeof mediaKindForNode>,
): 'image' | 'video' | 'audio' | 'text' | 'file' {
  const value = `${candidate.resourceKind ?? ''} ${candidate.artifactRef ?? ''}`.toLowerCase()
  if (value.includes('image') || /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/.test(value)) return 'image'
  if (value.includes('video') || /\.(mp4|mov|webm|m4v)(\?|#|$)/.test(value)) return 'video'
  if (value.includes('audio') || /\.(mp3|wav|m4a|aac|ogg)(\?|#|$)/.test(value)) return 'audio'
  if (value.includes('text') || /\.(txt|md|json|srt|vtt)(\?|#|$)/.test(value)) return 'text'
  if (fallbackKind === 'image' || fallbackKind === 'board' || fallbackKind === 'keyframe') return 'image'
  if (fallbackKind === 'video' || fallbackKind === 'scene') return 'video'
  if (fallbackKind === 'audio') return 'audio'
  if (fallbackKind === 'text') return 'text'
  return 'file'
}

function candidateResourceUrl(candidate: ContentCanvasCandidate): string | undefined {
  const value = stringValue(candidate.artifactRef)
  if (!value) return undefined
  if (/^(https?:|data:|blob:|\/api\/|\/resources\/)/.test(value)) return value
  return undefined
}
