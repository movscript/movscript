import { useEffect, useMemo, useRef, useState } from 'react'
import { Handle, Position, NodeResizer } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { useQuery } from '@tanstack/react-query'
import type { CanvasNodeData, CanvasPortDef, PublicModel, RawResource } from '@/types'
import {
  FileText, Loader2, CheckCircle2, XCircle, Play,
  LogIn, LogOut, UserCheck, Sparkles, Check, X,
  Image, Video, Brush, Camera, Layers3, ImagePlus,
	  Palette, PersonStanding, RotateCw, Wrench, Puzzle,
	  HardDrive,
	} from 'lucide-react'
import { api } from '@/shared/infrastructure/api'
import { publicModelId, publicModelLabel } from '@/shared/domain/modelDisplay'
import { AuthedImage, AuthedVideo } from '@/shared/ui/AuthedImage'
import { API_BASE_URL as API_BASE } from '@/shared/infrastructure/config'
import { useTranslation } from 'react-i18next'
import { CANVAS_NODE_META } from '@/features/canvas/presentation/nodeCatalog'
import { canvasNodeStatusRecipe } from '@/features/canvas/presentation/canvasSemanticUi'
import { canvasDefaultParamValues, canvasGenerationParamDefs, canvasParamValue, updateCanvasParam } from '@/features/canvas/domain/canvasGenerationParams'
import { MediaViewer } from '@/shared/ui/MediaViewer'
import { resourceIdsFromCanvasPrompt } from '@/features/canvas/runtime/canvasRuntimeGraph'
import {
  CanvasGroupFrame,
  CanvasGroupHeader,
  CanvasMediaFill,
  CanvasMentionAttachmentThumb,
  CanvasMentionMenuThumb,
  CanvasNodeApprovalActionButton,
  CanvasNodeApprovalActions,
  CanvasNodeApprovalStatus,
  CanvasNodeCard,
  CanvasNodeCardBody,
  CanvasNodeCardHeader,
  CanvasNodeFooterText,
  CanvasNodeFrame,
  CanvasNodeParamControlsView,
  CanvasNodeSemanticPortRows,
  CanvasNodePromptInputView,
  CanvasNodeMediaResultView,
  CanvasNodeTextResultView,
  CanvasTextNodeView,
  CanvasImageNodeView,
  CanvasVideoNodeView,
  CanvasIOActionCard,
  CanvasToolActionCard,
  canvasNodeCardPortHandleStyle,
  canvasNodeSemanticSourceHandleStyle,
  canvasNodeSemanticTargetHandleStyle,
  canvasMentionChipClassNames,
  type CanvasIOState,
  type CanvasNodePromptAttachmentItem,
  type CanvasNodeMentionItem,
  type CanvasNodeParamControlItem,
  type CanvasPortHandleRenderer,
  type CanvasToolSlot,
  type CanvasToolSlotState,
  type CanvasToolSlotType,
} from '@movscript/ui'

const semanticInputHandleId = (portId: string) => `in:${portId}`
const semanticOutputHandleId = (portId: string) => `out:${portId}`
const CANVAS_NODE_IMAGE_THUMB_MAX_SIZE = 320

const MEDIA_NODE_TYPES = new Set(['text', 'image', 'video'])

function mediaNodeInputPorts(nodeType: string, data: CanvasNodeData): CanvasNodeData['inputPorts'] {
  if (!MEDIA_NODE_TYPES.has(nodeType)) return data.inputPorts
  return data.source === 'ai' ? data.inputPorts : []
}

const PARAM_TYPE_LABELS: Record<string, string> = {
  text: 'canvas.paramTypes.text',
  image: 'canvas.paramTypes.image',
  video: 'canvas.paramTypes.video',
  json: 'canvas.paramTypes.json',
  number: 'canvas.paramTypes.number',
  boolean: 'canvas.paramTypes.boolean',
  resource: 'canvas.paramTypes.resource',
}

function resolvePorts({
  nodeType,
  inputPorts,
  outputPorts,
  inputs = true,
  outputs = true,
}: {
  nodeType: string
  inputPorts?: CanvasNodeData['inputPorts']
  outputPorts?: CanvasNodeData['outputPorts']
  inputs?: boolean
  outputs?: boolean
}) {
  const meta = CANVAS_NODE_META[nodeType as keyof typeof CANVAS_NODE_META]
  const hasDeclaredPorts = !!inputPorts || !!outputPorts || !!meta
  return {
    resolvedInputs: inputs ? (inputPorts ?? meta?.inputs ?? (!hasDeclaredPorts ? [{ id: 'input', label: 'Input', type: 'resource' as const }] : [])) : [],
    resolvedOutputs: outputs ? (outputPorts ?? meta?.outputs ?? (!hasDeclaredPorts ? [{ id: 'result', label: 'Result', type: 'resource' as const }] : [])) : [],
  }
}

function SemanticPortRows({
  nodeType,
  inputPorts,
  outputPorts,
  inputs = true,
  outputs = true,
}: {
  nodeType: string
  inputPorts?: CanvasNodeData['inputPorts']
  outputPorts?: CanvasNodeData['outputPorts']
  inputs?: boolean
  outputs?: boolean
}) {
  const { t } = useTranslation()
  const { resolvedInputs, resolvedOutputs } = resolvePorts({ nodeType, inputPorts, outputPorts, inputs, outputs })
  if (resolvedInputs.length === 0 && resolvedOutputs.length === 0) return null

  return (
    <CanvasNodeSemanticPortRows
      inputPorts={resolvedInputs.map((port) => canvasNodeSemanticPort(port, t))}
      outputPorts={resolvedOutputs.map((port) => canvasNodeSemanticPort(port, t))}
      srLabel={t('canvas.ports.semanticRows', { defaultValue: 'Semantic input and output ports' })}
      requiredLabel={t('canvas.ports.required', { defaultValue: 'Required' })}
      renderPortHandle={renderCanvasSemanticPortHandle}
    />
  )
}

function canvasNodeSemanticPort(port: CanvasPortDef, t: (key: string, options?: any) => string) {
  const typeLabelKey = PARAM_TYPE_LABELS[port.type]
  const typeLabel = typeLabelKey ? t(typeLabelKey) : port.type
  const label = port.labelKey ? t(port.labelKey, { defaultValue: port.label ?? port.id }) : (port.label ?? port.id)
  const maxCountLabel = port.maxCount ? t('canvas.ports.maxCount', { count: port.maxCount, defaultValue: `Max ${port.maxCount}` }) : null
  return {
    id: port.id,
    label,
    typeLabel,
    required: port.required,
    maxCountLabel,
    description: port.description,
  }
}

const renderCanvasSemanticPortHandle: CanvasPortHandleRenderer = ({ id, type, side, label }) => (
  <Handle
    id={type === 'target' ? semanticInputHandleId(id) : semanticOutputHandleId(id)}
    type={type}
    position={side === 'left' ? Position.Left : Position.Right}
    title={label}
    style={type === 'target' ? canvasNodeSemanticTargetHandleStyle : canvasNodeSemanticSourceHandleStyle}
  />
)

function CanvasCardPortHandle({
  id,
  type,
  side,
  label,
}: {
  id: string
  type: 'target' | 'source'
  side: 'left' | 'right'
  label: string
}) {
  return (
    <Handle
      id={type === 'target' ? semanticInputHandleId(id) : semanticOutputHandleId(id)}
      type={type}
      position={side === 'left' ? Position.Left : Position.Right}
      title={label}
      style={canvasNodeCardPortHandleStyle}
    />
  )
}

function portLabelText(port: CanvasPortDef, t: (key: string, options?: any) => string) {
  return port.labelKey ? t(port.labelKey, { defaultValue: port.label ?? port.id }) : (port.label ?? port.id)
}

function slotTypeFromPortType(type?: string): CanvasToolSlotType {
  if (type === 'image' || type === 'video' || type === 'json' || type === 'prompt' || type === 'text') return type
  return 'text'
}

function slotStateFromStatus(status: CanvasNodeData['status'], hasValue?: boolean): CanvasToolSlotState {
  if (status === 'failed') return 'failed'
  if (status === 'pending' || status === 'running') return 'pending'
  return hasValue ? 'ready' : 'empty'
}

function ioStateFromStatus(status: CanvasNodeData['status'], hasValue?: boolean): CanvasIOState {
  if (status === 'failed') return 'failed'
  if (status === 'pending' || status === 'running') return 'pending'
  return hasValue ? 'ready' : 'empty'
}

function nodeStatusLabel(status?: CanvasNodeData['status']) {
  if (status === 'pending') return '等待中'
  if (status === 'running') return '运行中'
  if (status === 'done') return '已完成'
  if (status === 'failed') return '失败'
  return '可运行'
}

function paramTypeText(type: string | undefined, t: (key: string, options?: any) => string) {
  const typeLabel = PARAM_TYPE_LABELS[type || '']
  return typeLabel ? t(typeLabel) : type ?? t('canvas.unset')
}

function toolInputSlots(nodeType: string, data: CanvasNodeData, t: (key: string, options?: any) => string): CanvasToolSlot[] {
  const { resolvedInputs } = resolvePorts({ nodeType, inputPorts: data.inputPorts, outputPorts: data.outputPorts, outputs: false })
  return resolvedInputs.map((port) => ({
    id: port.id,
    inputPortId: port.id,
    label: portLabelText(port, t),
    type: port.id === 'prompt' ? 'prompt' : slotTypeFromPortType(port.type),
    state: data.status === 'failed' ? 'failed' : 'empty',
    summary: port.required ? '必需' : '可选',
  }))
}

function toolOutputSlots(nodeType: string, data: CanvasNodeData, t: (key: string, options?: any) => string): CanvasToolSlot[] {
  const { resolvedOutputs } = resolvePorts({ nodeType, inputPorts: data.inputPorts, outputPorts: data.outputPorts, inputs: false })
  return resolvedOutputs.map((port) => ({
    id: port.id,
    outputPortId: port.id,
    label: portLabelText(port, t),
    type: slotTypeFromPortType(port.type),
    state: slotStateFromStatus(data.status, !!data.resource),
    summary: data.resource?.name ?? (data.error && data.status === 'failed' ? data.error : undefined),
  }))
}

function pluginConfigItems(data: NodeDataWithHandlers) {
  const args = (data.pluginArgs ?? {}) as Record<string, unknown>
  const schemaEntries = Object.entries(data.pluginInputProperties ?? {})
  const argEntries = Object.entries(args).map(([name, value]) => [name, { title: name, default: value }] as const)
  return (schemaEntries.length > 0 ? schemaEntries : argEntries)
    .map(([name, prop]) => {
      const value = args[name] ?? prop.default
      return { id: name, label: prop.title || name, value }
    })
    .filter((item) => item.value !== undefined && item.value !== null && String(item.value).trim() !== '')
    .slice(0, 3)
    .map((item) => ({ id: item.id, label: item.label, value: String(item.value) }))
}

function useCanvasGenerationModels(capability?: 'text' | 'image' | 'video', featureKey?: string) {
  const { data = [] } = useQuery<PublicModel[]>({
    queryKey: ['models', capability, featureKey],
    queryFn: () => capability
      ? api.get(`/models?capability=${capability}${featureKey ? `&feature=${featureKey}` : ''}`).then((r) => r.data)
      : Promise.resolve([]),
    enabled: !!capability,
  })
  return data
}

function selectedCanvasModel(data: CanvasNodeData, models: PublicModel[]) {
  return models.find((model) => publicModelId(model) === data.modelId)
    ?? models.find((model) => model.id === data.modelDbId)
    ?? models[0]
    ?? null
}

function HiddenPortHandles({
  inputs = [],
  outputs = [],
  visibleInputIds = [],
  visibleOutputIds = [],
}: {
  inputs?: CanvasPortDef[]
  outputs?: CanvasPortDef[]
  visibleInputIds?: string[]
  visibleOutputIds?: string[]
}) {
  const visibleInputSet = new Set(visibleInputIds)
  const visibleOutputSet = new Set(visibleOutputIds)
  const hiddenInputs = inputs.filter((port) => !visibleInputSet.has(port.id))
  const hiddenOutputs = outputs.filter((port) => !visibleOutputSet.has(port.id))
  return (
    <>
      {hiddenInputs.map((port, index) => (
        <Handle
          key={`hidden-in-${port.id}`}
          id={semanticInputHandleId(port.id)}
          type="target"
          position={Position.Left}
          title={port.label ?? port.id}
          style={{
            ...canvasNodeSemanticTargetHandleStyle,
            top: `${Math.min(88, 18 + index * 14)}%`,
            opacity: 0,
          }}
        />
      ))}
      {hiddenOutputs.map((port, index) => (
        <Handle
          key={`hidden-out-${port.id}`}
          id={semanticOutputHandleId(port.id)}
          type="source"
          position={Position.Right}
          title={port.label ?? port.id}
          style={{
            ...canvasNodeSemanticSourceHandleStyle,
            top: `${Math.min(88, 18 + index * 14)}%`,
            opacity: 0,
          }}
        />
      ))}
    </>
  )
}

function ToolCardNodeFrame({
  nodeType,
  data,
  children,
}: {
  nodeType: string
  data: CanvasNodeData
  children: React.ReactNode
}) {
  const { resolvedInputs, resolvedOutputs } = resolvePorts({
    nodeType,
    inputPorts: data.inputPorts,
    outputPorts: data.outputPorts,
  })
  const visibleInputIds = toolInputSlots(nodeType, data, (key: string) => key).slice(0, 3).map((slot) => slot.inputPortId ?? slot.id)
  const visibleOutputIds = toolOutputSlots(nodeType, data, (key: string) => key).slice(0, 2).map((slot) => slot.outputPortId ?? slot.id)
  return (
    <CanvasNodeFrame>
      <HiddenPortHandles
        inputs={resolvedInputs}
        outputs={resolvedOutputs}
        visibleInputIds={visibleInputIds}
        visibleOutputIds={visibleOutputIds}
      />
      {children}
    </CanvasNodeFrame>
  )
}

function workflowInputOutputPorts(data: CanvasNodeData): CanvasPortDef[] {
  return [{
    id: 'value',
    label: data.paramName || 'input',
    type: data.paramType ?? 'text',
    required: true,
  }]
}

function workflowOutputInputPorts(data: CanvasNodeData): CanvasPortDef[] {
  return [{
    id: 'value',
    label: data.paramName || 'output',
    type: data.paramType ?? 'resource',
    required: true,
  }]
}

function resourceSinkPorts(): { inputs: CanvasPortDef[]; outputs: CanvasPortDef[] } {
  return {
    inputs: [{
      id: 'input',
      label: 'resource',
      type: 'resource',
      required: true,
    }],
    outputs: [],
  }
}

type NodeDataWithHandlers = CanvasNodeData & {
  label: string
  availableResources?: RawResource[]
  referenceResources?: RawResource[]
  canvasDebug?: {
    media?: boolean
    images?: boolean
    videos?: boolean
  }
  pluginInputProperties?: Record<string, { title?: string; default?: string | number | boolean }>
  onRun?: () => void
  onUpdateContent?: (content: string) => void
  onUpdatePrompt?: (prompt: string) => void
  onUpdateOutputType?: (type: 'image' | 'video' | 'text') => void
  onUpdateModelId?: (modelId: string, modelDbId?: number) => void
  onUpdateAttachments?: (ids: number[]) => void
  onUpdateParams?: (params: Record<string, unknown>) => void
  onApprove?: () => void
  onReject?: () => void
}

function shouldRenderCanvasResourcePreview(resource: RawResource | undefined, canvasDebug: NodeDataWithHandlers['canvasDebug']) {
  if (!resource) return false
  if (canvasDebug?.media === false) return false
  if (resource.type === 'image' && canvasDebug?.images === false) return false
  if (resource.type === 'video' && canvasDebug?.videos === false) return false
  return true
}

function selectedInputResources(data: NodeDataWithHandlers) {
  const byId = new Map((data.availableResources ?? []).map((resource) => [resource.ID, resource]))
  const seen = new Set<number>()
  const resources: RawResource[] = []
  for (const id of data.inputResourceIds ?? []) {
    const resource = byId.get(id)
    if (!resource || seen.has(resource.ID)) continue
    seen.add(resource.ID)
    resources.push(resource)
  }
  for (const id of resourceIdsFromCanvasPrompt(data.prompt)) {
    const resource = byId.get(id)
    if (!resource || seen.has(resource.ID)) continue
    seen.add(resource.ID)
    resources.push(resource)
  }
  for (const resource of data.referenceResources ?? []) {
    if (seen.has(resource.ID)) continue
    seen.add(resource.ID)
    resources.push(resource)
  }
  return resources
}

function canvasResourceIcon(resource: Pick<RawResource, 'type'>, size = 12) {
  if (resource.type === 'image') return <Image size={size} />
  if (resource.type === 'video') return <Video size={size} />
  return <FileText size={size} />
}

function buildCanvasChipElement(resource: RawResource): HTMLElement {
  const chip = document.createElement('span')
  chip.contentEditable = 'false'
  chip.dataset.resourceName = resource.name
  chip.dataset.resourceId = String(resource.ID)
  chip.className = canvasMentionChipClassNames.chip

  const media = document.createElement('span')
  media.className = canvasMentionChipClassNames.media
  media.dataset.type = resource.type
  media.textContent = resource.type === 'video' ? 'V' : resource.type === 'image' ? 'I' : 'T'
  chip.appendChild(media)

  const label = document.createElement('span')
  label.textContent = resource.name
  label.className = canvasMentionChipClassNames.label
  chip.appendChild(label)

  return chip
}

function serializeCanvasPrompt(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  const el = node as HTMLElement
  if (el.dataset?.resourceId) return `@[resource:${el.dataset.resourceId}]`
  return Array.from(node.childNodes).map(serializeCanvasPrompt).join('')
}

function CanvasGenerationInputPanel({
  data,
  inputType,
  placeholder,
}: {
  data: NodeDataWithHandlers
  inputType?: 'image' | 'video' | 'image+video'
  placeholder?: string
}) {
  const { t } = useTranslation()
  const editorRef = useRef<HTMLDivElement>(null)
  const mentionRangeRef = useRef<{ node: Text; start: number; end: number } | null>(null)
  const syncedPromptRef = useRef<string | null>(null)
  const renderedResourceKeyRef = useRef<string>('')
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const attachments = useMemo(
    () => selectedInputResources(data),
    [data.availableResources, data.inputResourceIds, data.prompt, data.referenceResources],
  )
  const explicitResourceIds = new Set(data.inputResourceIds ?? [])
  const mentionResources = attachments
    .filter((resource) => !mentionQuery || resource.name.toLowerCase().includes(mentionQuery))
    .slice(0, 8)
  const mentionItems: CanvasNodeMentionItem[] = mentionResources.map((resource) => ({
    id: resource.ID,
    media: (
      <CanvasMentionMenuThumb>
        {canvasResourceIcon(resource, 12)}
      </CanvasMentionMenuThumb>
    ),
    label: resource.name,
    meta: `#${resource.ID}`,
    onMouseDown: (event) => {
      event.preventDefault()
      insertMention(resource)
    },
  }))
  const attachmentItems: CanvasNodePromptAttachmentItem[] = attachments.map((resource) => {
    const removable = explicitResourceIds.has(resource.ID)
    return {
      id: resource.ID,
      media: (
        <CanvasMentionAttachmentThumb>
          {canvasResourceIcon(resource, 12)}
        </CanvasMentionAttachmentThumb>
      ),
      label: resource.name,
      removable,
      removeLabel: t('common.remove', { defaultValue: 'Remove' }),
      removeIcon: <X size={10} />,
      onRemove: removable ? () => data.onUpdateAttachments?.((data.inputResourceIds ?? []).filter((id) => id !== resource.ID)) : undefined,
      status: t('canvas.editor.connected', { defaultValue: 'Connected' }),
    }
  })
  const resourceById = useMemo(() => new Map(attachments.map((resource) => [resource.ID, resource])), [attachments])
  const resourceLookupKey = useMemo(
    () => attachments.map((resource) => `${resource.ID}:${resource.type}:${resource.name}:${resource.url}:${resource.direct_url ?? ''}`).join('|'),
    [attachments],
  )

  function editorText() {
    return editorRef.current ? serializeCanvasPrompt(editorRef.current) : ''
  }

  function handleInput() {
    const text = editorText()
    syncedPromptRef.current = text
    data.onUpdatePrompt?.(text)

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      setMentionQuery(null)
      return
    }
    const range = selection.getRangeAt(0)
    const node = range.startContainer
    if (node.nodeType !== Node.TEXT_NODE) {
      mentionRangeRef.current = null
      setMentionQuery(null)
      return
    }
    const before = (node.textContent ?? '').slice(0, range.startOffset)
    const match = before.match(/@([^\s@]*)$/)
    if (match) {
      mentionRangeRef.current = {
        node: node as Text,
        start: range.startOffset - match[0].length,
        end: range.startOffset,
      }
      setMentionQuery(match[1].toLowerCase())
    } else {
      mentionRangeRef.current = null
      setMentionQuery(null)
    }
  }

  function insertMention(resource: RawResource) {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !editorRef.current) return
    let insertRange = selection.getRangeAt(0)
    const mentionRange = mentionRangeRef.current
    if (mentionRange && mentionRange.node.isConnected) {
      const deleteRange = document.createRange()
      deleteRange.setStart(mentionRange.node, mentionRange.start)
      deleteRange.setEnd(mentionRange.node, mentionRange.end)
      deleteRange.deleteContents()
      insertRange = deleteRange
      selection.removeAllRanges()
      selection.addRange(insertRange)
    } else {
      const node = insertRange.startContainer
      if (node.nodeType === Node.TEXT_NODE) {
        const before = (node.textContent ?? '').slice(0, insertRange.startOffset)
        const match = before.match(/@([^\s@]*)$/)
        if (match) {
          const deleteRange = document.createRange()
          deleteRange.setStart(node, insertRange.startOffset - match[0].length)
          deleteRange.setEnd(node, insertRange.startOffset)
          deleteRange.deleteContents()
          insertRange = deleteRange
          selection.removeAllRanges()
          selection.addRange(insertRange)
        }
      }
    }

    const chip = buildCanvasChipElement(resource)
    const space = document.createTextNode(' ')
    insertRange.insertNode(space)
    insertRange.insertNode(chip)

    const nextRange = document.createRange()
    nextRange.setStartAfter(space)
    nextRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(nextRange)

    setMentionQuery(null)
    mentionRangeRef.current = null
    const nextText = editorText()
    syncedPromptRef.current = nextText
    data.onUpdatePrompt?.(nextText)
  }

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const prompt = data.prompt ?? ''
    const currentPrompt = serializeCanvasPrompt(editor)
    const isFocused = document.activeElement === editor || (document.activeElement ? editor.contains(document.activeElement) : false)
    if (currentPrompt === prompt && renderedResourceKeyRef.current === resourceLookupKey) {
      syncedPromptRef.current = prompt
      return
    }
    if (isFocused && syncedPromptRef.current === currentPrompt) return
    if (isFocused && syncedPromptRef.current === prompt) return
    editor.innerHTML = ''
    const pattern = /@\[resource:(\d+)\]\s?/g
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(prompt)) !== null) {
      const before = prompt.slice(lastIndex, match.index)
      if (before) editor.appendChild(document.createTextNode(before))
      const resource = resourceById.get(Number(match[1]))
      if (resource) {
        const chip = buildCanvasChipElement(resource)
        editor.appendChild(chip)
        editor.appendChild(document.createTextNode(' '))
      } else {
        editor.appendChild(document.createTextNode(match[0]))
      }
      lastIndex = pattern.lastIndex
    }
    const after = prompt.slice(lastIndex)
    if (after) editor.appendChild(document.createTextNode(after))
    syncedPromptRef.current = prompt
    renderedResourceKeyRef.current = resourceLookupKey
  }, [data.prompt, resourceById, resourceLookupKey])

  return (
    <CanvasNodePromptInputView
      editorRef={editorRef}
      placeholder={placeholder ?? (inputType ? t(`shared.genInput.promptPlaceholder.${inputType}`, { defaultValue: t('shared.generation.promptPlaceholder') }) : t('shared.generation.promptPlaceholder'))}
      onEditorInput={handleInput}
      onEditorEscape={() => setMentionQuery(null)}
      mentionOpen={mentionQuery !== null}
      mentionItems={mentionItems}
      mentionEmptyLabel={attachments.length === 0 ? t('shared.genInput.addResourcesFirst') : t('shared.genInput.noMatchedResources')}
      attachmentItems={attachmentItems}
      attachmentEmptyLabel={t('shared.genInput.selectOrUploadHint', { defaultValue: 'Select or upload resources' })}
    />
  )
}

function CanvasGenerationParamControls({
  nodeType,
  data,
  outputType,
  models,
  selectedModel,
}: {
  nodeType: string
  data: NodeDataWithHandlers
  outputType?: 'image' | 'video' | 'text'
  models?: PublicModel[]
  selectedModel?: PublicModel | null
}) {
  const { t } = useTranslation()
  const params = canvasGenerationParamDefs(nodeType, outputType, selectedModel)
  if (params.length === 0 && (!models || models.length === 0)) return null
  const paramItems: CanvasNodeParamControlItem[] = params.map((param) => {
    const value = canvasParamValue(data, param)
    return {
      id: param.key,
      label: param.label || param.key,
      type: param.type,
      value,
      options: param.options?.map((option) => ({ value: option, label: option })),
      min: param.min,
      max: param.max,
      step: param.step,
      onChange: (nextValue) => data.onUpdateParams?.(updateCanvasParam(data, param.key, nextValue)),
    }
  })
  const modelControl = models && models.length > 0 ? {
    label: t('agents.model'),
    value: selectedModel ? publicModelId(selectedModel) : '',
    emptyLabel: t('shared.modelSelector.noModels'),
    options: models.map((model) => ({
      value: publicModelId(model),
      label: publicModelLabel(model),
    })),
    onChange: (value: string) => {
      const model = models.find((item) => publicModelId(item) === value)
      if (!model) return
      data.onUpdateModelId?.(publicModelId(model), model.id)
      data.onUpdateParams?.(canvasDefaultParamValues(canvasGenerationParamDefs(nodeType, outputType, model)))
    },
  } : undefined

  return (
    <CanvasNodeParamControlsView
      title={t('plugins.parameters')}
      icon={<Wrench size={12} />}
      model={modelControl}
      params={paramItems}
      collapseLabel={t('common.collapse', { defaultValue: 'Collapse' })}
      expandLabel={t('common.expand', { defaultValue: `More parameters (${params.length - 2})` })}
    />
  )
}

function toolConfigItems(nodeType: string, data: CanvasNodeData, outputType?: 'image' | 'video' | 'text', selectedModel?: PublicModel | null) {
  const params = canvasGenerationParamDefs(nodeType, outputType, selectedModel)
  const items = [
    { id: 'model', label: '模型', value: selectedModel ? publicModelLabel(selectedModel) : data.modelId || (data.modelDbId ? `#${data.modelDbId}` : '默认') },
    ...params.map((param) => ({
      id: param.key,
      label: param.label || param.key,
      value: formatCanvasParamValue(canvasParamValue(data, param)),
    })),
  ]
  return items.filter((item) => item.value !== '').slice(0, 3)
}

function formatCanvasParamValue(value: string | number | boolean) {
  if (value === '') return '默认'
  return String(value)
}

function CanvasGenerationResultPanel({
  data,
  outputType,
}: {
  data: NodeDataWithHandlers
  outputType: 'image' | 'video'
}) {
  const status = (data.status ?? 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'failed'
  const { t } = useTranslation()
  const resource = shouldRenderCanvasResourcePreview(data.resource, data.canvasDebug) ? data.resource : undefined
  return (
    <CanvasNodeMediaResultView
      status={status}
      media={resource ? (
        <CanvasMediaFill fit="contain">
          <MediaViewer resource={resource} fit="contain" lightbox thumbnailMaxSize={CANVAS_NODE_IMAGE_THUMB_MAX_SIZE} diagnosticLabel={`canvas-result:${data.rfNodeId ?? resource.ID}`} />
        </CanvasMediaFill>
      ) : undefined}
      emptyIcon={outputType === 'video' ? <Video size={20} /> : <Image size={20} />}
      loadingIcon={<Loader2 size={18} />}
      error={data.error}
      failedLabel={t('pages.jobs.generationFailed')}
    />
  )
}

function CanvasTextGenerationResultPanel({ data }: { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = (data.status ?? 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'failed'
  return (
    <CanvasNodeTextResultView
      status={status}
      statusProps={canvasNodeStatusRecipe(status)}
      statusLabel={nodeStatusLabel(status)}
      prompt={data.prompt}
      loadingIcon={<Loader2 size={16} />}
      error={data.error}
      failedLabel={t('pages.jobs.generationFailed')}
      textContent={data.textContent}
    />
  )
}

const canvasNodeStatusIcons = {
  pendingIcon: <Loader2 size={12} />,
  doneIcon: <CheckCircle2 size={12} />,
  failedIcon: <XCircle size={12} />,
}

// ── Media nodes ────────────────────────────────────────────────────────────────

export function TextNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = data.status ?? 'idle'
  const preview = data.textContent || data.prompt || data.resource?.name
  return (
    <CanvasTextNodeView
      selected={selected}
      icon={<FileText size={12} />}
      label={data.label || t('canvas.nodeLabels.text')}
      status={status}
      statusIcons={canvasNodeStatusIcons}
      runIcon={<Play size={12} />}
      onRun={data.onRun}
      ports={<SemanticPortRows nodeType="text" inputPorts={mediaNodeInputPorts('text', data)} />}
      manual={data.source === 'manual'}
      textValue={data.textContent ?? ''}
      textPlaceholder={t('canvas.textInputPlaceholder')}
      onTextChange={(value) => data.onUpdateContent?.(value)}
      preview={preview}
      emptyLabel={t('canvas.emptyContent')}
    />
  )
}

export function ImageNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = data.status ?? 'idle'
  const imgUrl = data.resource?.url ? `${API_BASE}${data.resource.url}` : null
  const showPreview = shouldRenderCanvasResourcePreview(data.resource, data.canvasDebug)
  return (
    <CanvasImageNodeView
      selected={selected}
      icon={<Image size={12} />}
      label={data.label || t('canvas.nodeLabels.image')}
      status={status}
      statusIcons={canvasNodeStatusIcons}
      runIcon={<Play size={12} />}
      ports={<SemanticPortRows nodeType="image" inputPorts={mediaNodeInputPorts('image', data)} />}
      media={imgUrl && showPreview ? <AuthedImage src={imgUrl} alt="" diagnosticLabel={`canvas-node:${data.rfNodeId ?? data.resource?.ID ?? 'unknown'}`} thumbnailMaxSize={CANVAS_NODE_IMAGE_THUMB_MAX_SIZE} /> : undefined}
      emptyIcon={<Image size={24} />}
    />
  )
}

export function VideoNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = data.status ?? 'idle'
  const videoUrl = data.resource?.url ? `${API_BASE}${data.resource.url}` : null
  const showPreview = shouldRenderCanvasResourcePreview(data.resource, data.canvasDebug)
  return (
    <CanvasVideoNodeView
      selected={selected}
      icon={<Video size={12} />}
      label={data.label || t('canvas.nodeLabels.video')}
      status={status}
      statusIcons={canvasNodeStatusIcons}
      runIcon={<Play size={12} />}
      onRun={data.onRun}
      ports={<SemanticPortRows nodeType="video" inputPorts={mediaNodeInputPorts('video', data)} />}
      media={videoUrl && showPreview ? <AuthedVideo src={videoUrl} controls diagnosticLabel={`canvas-node:${data.rfNodeId ?? data.resource?.ID ?? 'unknown'}`} /> : undefined}
      emptyIcon={<Video size={24} />}
      surface="dark"
    />
  )
}

// ── Tool nodes ─────────────────────────────────────────────────────────────────

const TOOL_META: Record<string, { icon: React.ReactNode; labelKey: string; outputType: 'image' | 'video'; capability: 'image' | 'video'; featureKey: string; inputType: 'image' | 'video' | 'image+video' }> = {
  canvas:           { icon: <Layers3 size={12} />, labelKey: 'canvas.nodeLabels.canvas',           outputType: 'image', capability: 'image', featureKey: 'canvas_image', inputType: 'image' },
  ref_image_gen:    { icon: <Palette size={12} />, labelKey: 'canvas.nodeLabels.ref_image_gen',    outputType: 'image', capability: 'image', featureKey: 'canvas_image', inputType: 'image' },
  ref_video_gen:    { icon: <Camera size={12} />, labelKey: 'canvas.nodeLabels.ref_video_gen',     outputType: 'video', capability: 'video', featureKey: 'canvas_video', inputType: 'video' },
  multi_angle:      { icon: <RotateCw size={12} />, labelKey: 'canvas.nodeLabels.multi_angle',     outputType: 'image', capability: 'image', featureKey: 'canvas_image', inputType: 'image' },
  style_transfer:   { icon: <Brush size={12} />, labelKey: 'canvas.nodeLabels.style_transfer',    outputType: 'image', capability: 'image', featureKey: 'canvas_image', inputType: 'image' },
  motion_imitation: { icon: <PersonStanding size={12} />, labelKey: 'canvas.nodeLabels.motion_imitation', outputType: 'video', capability: 'video', featureKey: 'canvas_video', inputType: 'image+video' },
}

export function ToolNode({ data, selected, type }: NodeProps & { data: NodeDataWithHandlers; type: string }) {
  const { t } = useTranslation()
  const status = (data.status ?? 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'failed'
  const meta = TOOL_META[type] ?? { icon: <Wrench size={12} />, labelKey: type, outputType: 'image' as const, capability: 'image' as const, featureKey: 'canvas_image', inputType: 'image' as const }
  const metaLabel = type in TOOL_META ? t(meta.labelKey) : meta.labelKey
  const Icon = type === 'canvas' ? Layers3
    : type === 'ref_image_gen' ? Palette
    : type === 'ref_video_gen' ? Camera
    : type === 'multi_angle' ? RotateCw
    : type === 'style_transfer' ? Brush
    : type === 'motion_imitation' ? PersonStanding
    : Wrench
  const isRunning = status === 'pending' || status === 'running'
  const isGenerationTool = type !== 'canvas'
  const models = useCanvasGenerationModels(isGenerationTool ? meta.capability : undefined, isGenerationTool ? meta.featureKey : undefined)
  const selectedModel = selectedCanvasModel(data, models)

  return (
    <ToolCardNodeFrame nodeType={type} data={data}>
      <CanvasToolActionCard
        source="ai"
        tone="violet"
        icon={Icon}
        title={data.label || metaLabel}
        subtitle={`${meta.featureKey} · 输出 ${meta.outputType}`}
        status={nodeStatusLabel(status)}
        selected={selected}
        inputs={toolInputSlots(type, data, t)}
        inputPanel={isGenerationTool ? (
          <>
            <CanvasGenerationInputPanel data={data} inputType={meta.inputType} />
            <CanvasGenerationParamControls nodeType={type} data={data} outputType={meta.outputType} models={models} selectedModel={selectedModel} />
          </>
        ) : undefined}
        configs={isGenerationTool ? undefined : toolConfigItems(type, data, meta.outputType, selectedModel)}
        outputs={toolOutputSlots(type, data, t)}
        resultPanel={isGenerationTool ? <CanvasGenerationResultPanel data={data} outputType={meta.outputType} /> : undefined}
        primaryAction={data.onRun ? { id: 'run', label: isRunning ? '运行中' : '运行', icon: isRunning ? Loader2 : Play, onClick: data.onRun, disabled: isRunning } : undefined}
        secondaryAction={{ id: 'variant', label: '变体', icon: ImagePlus, disabled: true }}
        footer={data.error ? <CanvasNodeFooterText tone="danger">{data.error}</CanvasNodeFooterText> : undefined}
        renderPortHandle={(handle) => <CanvasCardPortHandle {...handle} />}
      />
    </ToolCardNodeFrame>
  )
}

export function PluginCardNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = (data.status ?? 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'failed'
  const isRunning = status === 'pending' || status === 'running'
  return (
    <ToolCardNodeFrame nodeType="plugin_card" data={data}>
      <CanvasToolActionCard
        source="plugin"
        tone="cyan"
        icon={Puzzle}
        title={data.label || data.pluginName || t('canvas.nodeLabels.plugin_card')}
        subtitle={[
          data.pluginId || t('plugins.notFound'),
          data.pluginVersion ? `v${data.pluginVersion}` : null,
          data.pluginRuntime,
        ].filter(Boolean).join(' · ')}
        status={nodeStatusLabel(status)}
        selected={selected}
        inputs={toolInputSlots('plugin_card', data, t)}
        configs={pluginConfigItems(data)}
        outputs={toolOutputSlots('plugin_card', data, t)}
        primaryAction={data.onRun ? { id: 'run', label: isRunning ? '运行中' : '运行', icon: isRunning ? Loader2 : Play, onClick: data.onRun, disabled: isRunning } : undefined}
        secondaryAction={{ id: 'config', label: '配置', icon: Wrench, disabled: true }}
        footer={data.pluginResultText ? <CanvasNodeFooterText>{data.pluginResultText}</CanvasNodeFooterText> : undefined}
        renderPortHandle={(handle) => <CanvasCardPortHandle {...handle} />}
      />
    </ToolCardNodeFrame>
  )
}

// ── Special nodes ──────────────────────────────────────────────────────────────

export function InputNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = (data.status ?? 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'failed'
  const port = workflowInputOutputPorts(data)[0]
  const hasValue = !!data.inputValue
  const isRunning = status === 'pending' || status === 'running'
  const state = ioStateFromStatus(status, hasValue)
  return (
    <CanvasIOActionCard
      tone="sky"
      icon={LogIn}
      title={data.label || t('canvas.nodeLabels.input')}
      subtitle={`${t('canvas.nodeLabels.input')} · ${paramTypeText(port.type, t)}`}
      status={nodeStatusLabel(status)}
      selected={selected}
      port={{
        id: port.id,
        label: portLabelText(port, t),
        type: 'source',
        side: 'right',
        dataType: paramTypeText(port.type, t),
        required: port.required,
      }}
      metaItems={[
        { id: 'name', label: t('canvas.nodePanel.paramName'), value: data.paramName ?? 'input' },
        { id: 'type', label: t('canvas.nodePanel.paramType'), value: paramTypeText(data.paramType ?? 'text', t) },
      ]}
      state={state}
      stateLabel={hasValue ? t('canvas.generated') : t('canvas.fillAtRuntime')}
      bodyLabel={t('canvas.nodeLabels.input')}
      bodyValue={data.inputValue}
      emptyLabel={t('canvas.fillAtRuntime')}
      primaryAction={data.onRun ? { id: 'run', label: isRunning ? t('canvas.running') : t('shared.generation.runNode'), icon: isRunning ? Loader2 : Play, onClick: data.onRun, disabled: isRunning } : undefined}
      renderPortHandle={(handle) => <CanvasCardPortHandle {...handle} />}
    />
  )
}

export function OutputNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = (data.status ?? 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'failed'
  const port = workflowOutputInputPorts(data)[0]
  const hasOutput = !!data.resource || status === 'done'
  const isRunning = status === 'pending' || status === 'running'
  const state = ioStateFromStatus(status, hasOutput)
  return (
    <CanvasIOActionCard
      tone="emerald"
      icon={LogOut}
      title={data.label || t('canvas.nodeLabels.output')}
      subtitle={`${t('canvas.nodeLabels.output')} · ${paramTypeText(port.type, t)}`}
      status={nodeStatusLabel(status)}
      selected={selected}
      port={{
        id: port.id,
        label: portLabelText(port, t),
        type: 'target',
        side: 'left',
        dataType: paramTypeText(port.type, t),
        required: port.required,
      }}
      metaItems={[
        { id: 'name', label: t('canvas.nodePanel.paramName'), value: data.paramName ?? 'output' },
        { id: 'type', label: t('canvas.nodePanel.paramType'), value: paramTypeText(data.paramType ?? 'resource', t) },
      ]}
      state={state}
      stateLabel={hasOutput ? t('canvas.generated') : t('canvas.waitingUpstream')}
      bodyLabel={t('canvas.nodeLabels.output')}
      bodyValue={data.resource?.name}
      emptyLabel={t('canvas.waitingUpstream')}
      primaryAction={data.onRun ? { id: 'run', label: isRunning ? t('canvas.running') : t('shared.generation.runNode'), icon: isRunning ? Loader2 : Play, onClick: data.onRun, disabled: isRunning } : undefined}
      renderPortHandle={(handle) => <CanvasCardPortHandle {...handle} />}
    />
  )
}

export function ResourceSinkNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = (data.status ?? 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'failed'
  const port = resourceSinkPorts().inputs[0]
  const hasOutput = !!data.resource || status === 'done'
  const isRunning = status === 'pending' || status === 'running'
  const state = ioStateFromStatus(status, hasOutput)
  return (
    <CanvasIOActionCard
      tone="amber"
      icon={HardDrive}
      title={data.label || t('canvas.nodeLabels.resource_sink')}
      subtitle={`${t('canvas.nodeLabels.resource_sink')} · ${paramTypeText(port.type, t)}`}
      status={nodeStatusLabel(status)}
      selected={selected}
      port={{
        id: port.id,
        label: portLabelText(port, t),
        type: 'target',
        side: 'left',
        dataType: paramTypeText(port.type, t),
        required: port.required,
      }}
      metaItems={[
        { id: 'filename', label: t('canvas.nodePanel.paramName'), value: data.paramName || t('canvas.nodePanel.randomFileName') },
        { id: 'target', label: t('canvas.nodeLabels.resource_sink'), value: t('canvas.resourceSaved') },
      ]}
      state={state}
      stateLabel={hasOutput ? t('canvas.resourceSaved') : t('canvas.waitingUpstream')}
      bodyLabel={t('canvas.nodeLabels.resource_sink')}
      bodyValue={data.resource?.name ?? (hasOutput ? data.paramName : undefined)}
      emptyLabel={t('canvas.waitingUpstream')}
      primaryAction={data.onRun ? { id: 'run', label: isRunning ? t('canvas.running') : t('canvas.nodePanel.saveResource'), icon: isRunning ? Loader2 : Play, onClick: data.onRun, disabled: isRunning } : undefined}
      renderPortHandle={(handle) => <CanvasCardPortHandle {...handle} />}
    />
  )
}

export function ApprovalNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const approvalStatus = data.approvalStatus ?? 'waiting'
  return (
    <CanvasNodeCard selected={selected}>
      <CanvasNodeCardHeader
        icon={<UserCheck size={12} />}
        label={data.label || t('canvas.nodeLabels.approval')}
        tone="warning"
        actions={approvalStatus === 'waiting' ? (
          <CanvasNodeApprovalStatus tone="warning" compact>{t('canvas.approval.waiting')}</CanvasNodeApprovalStatus>
        ) : undefined}
      />
      <SemanticPortRows nodeType="approval" />
      <CanvasNodeCardBody>
        {approvalStatus === 'approved' && (
          <CanvasNodeApprovalStatus tone="success" icon={<Check size={10} />}>{t('canvas.approval.approved')}</CanvasNodeApprovalStatus>
        )}
        {approvalStatus === 'rejected' && (
          <CanvasNodeApprovalStatus tone="danger" icon={<X size={10} />}>{t('canvas.approval.rejected')}</CanvasNodeApprovalStatus>
        )}
        {approvalStatus === 'waiting' && (
          <CanvasNodeApprovalActions>
            <CanvasNodeApprovalActionButton
              actionTone="success"
              onMouseDown={e => { e.stopPropagation(); data.onApprove?.() }}
            >
              <Check size={10} /> {t('canvas.approval.approve')}
            </CanvasNodeApprovalActionButton>
            <CanvasNodeApprovalActionButton
              actionTone="danger"
              onMouseDown={e => { e.stopPropagation(); data.onReject?.() }}
            >
              <X size={10} /> {t('canvas.approval.reject')}
            </CanvasNodeApprovalActionButton>
          </CanvasNodeApprovalActions>
        )}
      </CanvasNodeCardBody>
    </CanvasNodeCard>
  )
}

export function TextGenNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = (data.status ?? 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'failed'
  const isRunning = status === 'pending' || status === 'running'
  const models = useCanvasGenerationModels('text', 'canvas_text')
  const selectedModel = selectedCanvasModel(data, models)
  return (
    <ToolCardNodeFrame nodeType="text_gen" data={data}>
      <CanvasToolActionCard
        source="ai"
        tone="violet"
        icon={Sparkles}
        title={data.label || t('canvas.nodeLabels.text_gen')}
        subtitle="canvas_text · 输出 text"
        status={nodeStatusLabel(status)}
        selected={selected}
        inputs={toolInputSlots('text_gen', data, t)}
        inputPanel={(
          <>
            <CanvasGenerationInputPanel data={data} placeholder={t('shared.generation.promptPlaceholder')} />
            <CanvasGenerationParamControls nodeType="text_gen" data={data} outputType="text" models={models} selectedModel={selectedModel} />
          </>
        )}
        outputs={toolOutputSlots('text_gen', { ...data, resource: data.resource, status }, t)}
        resultPanel={<CanvasTextGenerationResultPanel data={data} />}
        primaryAction={data.onRun ? { id: 'run', label: isRunning ? '运行中' : '运行', icon: isRunning ? Loader2 : Play, onClick: data.onRun, disabled: isRunning } : undefined}
        secondaryAction={undefined}
        footer={undefined}
        renderPortHandle={(handle) => <CanvasCardPortHandle {...handle} />}
      />
    </ToolCardNodeFrame>
  )
}

// ── AI Gen node ────────────────────────────────────────────────────────────────

export function AIGenNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = (data.status ?? 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'failed'
  const outputType = (data.outputType ?? 'image') as 'image' | 'video' | 'text'
  const isRunning = status === 'pending' || status === 'running'
  const models = useCanvasGenerationModels(outputType, `canvas_${outputType}`)
  const selectedModel = selectedCanvasModel(data, models)
  const outputSlots = toolOutputSlots('ai_gen', data, t).map((slot) => ({
    ...slot,
    type: outputType,
  }))

  return (
    <ToolCardNodeFrame nodeType="ai_gen" data={data}>
      <CanvasToolActionCard
        source="ai"
        tone="violet"
        icon={Sparkles}
        title={data.label || t('canvas.nodeLabels.ai_gen')}
        subtitle={`canvas_${outputType} · 输出 ${outputType}`}
        status={nodeStatusLabel(status)}
        selected={selected}
        inputs={toolInputSlots('ai_gen', data, t)}
        inputPanel={(
          <>
            <CanvasGenerationInputPanel data={data} inputType={outputType === 'video' ? 'video' : 'image'} />
            <CanvasGenerationParamControls nodeType="ai_gen" data={data} outputType={outputType} models={models} selectedModel={selectedModel} />
          </>
        )}
        outputs={outputSlots}
        resultPanel={outputType === 'text' ? <CanvasTextGenerationResultPanel data={data} /> : <CanvasGenerationResultPanel data={data} outputType={outputType} />}
        primaryAction={data.onRun ? { id: 'run', label: isRunning ? '运行中' : '运行', icon: isRunning ? Loader2 : Play, onClick: data.onRun, disabled: isRunning } : undefined}
        secondaryAction={{ id: 'variant', label: '类型', icon: ImagePlus, disabled: true }}
        footer={data.error ? <CanvasNodeFooterText tone="danger">{data.error}</CanvasNodeFooterText> : undefined}
        renderPortHandle={(handle) => <CanvasCardPortHandle {...handle} />}
      />
    </ToolCardNodeFrame>
  )
}

// ── Group node ─────────────────────────────────────────────────────────────────

export function GroupNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  return (
    <CanvasGroupFrame selected={selected}>
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={100}
      />
      <CanvasGroupHeader>{data.groupLabel || data.label || t('canvas.nodeLabels.group')}</CanvasGroupHeader>
    </CanvasGroupFrame>
  )
}
