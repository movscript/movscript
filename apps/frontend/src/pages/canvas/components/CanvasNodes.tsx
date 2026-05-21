import { useEffect, useRef, useState } from 'react'
import { Handle, Position, NodeResizer } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { useQuery } from '@tanstack/react-query'
import type { CanvasNodeData, CanvasPortDef, PublicModel, RawResource } from '@/types'
import {
  FileText, Loader2, CheckCircle2, XCircle, Play,
  LogIn, LogOut, UserCheck, Sparkles, Check, X, Share2,
  Image, Video, Brush, Camera, Layers3, ImagePlus,
	  Palette, PersonStanding, RotateCw, Wrench, Puzzle,
	  HardDrive,
	} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { publicModelId, publicModelLabel } from '@/lib/modelDisplay'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import { useTranslation } from 'react-i18next'
import { CANVAS_NODE_META } from '../nodeCatalog'
import { canvasDefaultParamValues, canvasGenerationParamDefs, canvasParamValue, updateCanvasParam } from '../canvasGenerationParams'
import { CanvasToolActionCard } from '@/components/canvas/CanvasToolActionCard'
import type { CanvasToolSlot, CanvasToolSlotState, CanvasToolSlotType } from '@/components/canvas/CanvasToolActionCard'
import { CanvasIOActionCard } from '@/components/canvas/CanvasIOActionCard'
import type { CanvasIOState } from '@/components/canvas/CanvasIOActionCard'
import { MediaViewer } from '@/components/shared/MediaViewer'

const targetHandleStyle: React.CSSProperties = {
  width: 14, height: 14, borderRadius: '50%',
  border: '2px solid hsl(var(--border))', background: 'hsl(var(--card))', transition: 'all 0.15s',
  top: '50%', transform: 'translateY(-50%)',
  zIndex: 30,
  pointerEvents: 'auto',
}
const sourceHandleStyle: React.CSSProperties = {
  width: 14, height: 14, borderRadius: '50%',
  border: '2px solid hsl(var(--primary))', background: 'hsl(var(--primary) / 0.88)', transition: 'all 0.15s',
  top: '50%', transform: 'translateY(-50%)',
  zIndex: 30,
  pointerEvents: 'auto',
}
const semanticTargetHandleStyle: React.CSSProperties = {
  ...targetHandleStyle,
  left: -9,
  top: '50%',
}
const semanticSourceHandleStyle: React.CSSProperties = {
  ...sourceHandleStyle,
  right: -9,
  top: '50%',
}

const semanticInputHandleId = (portId: string) => `in:${portId}`
const semanticOutputHandleId = (portId: string) => `out:${portId}`

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
  const rows = pairSemanticPorts(resolvedInputs, resolvedOutputs)
  if (resolvedInputs.length === 0 && resolvedOutputs.length === 0) return null

  return (
    <div className="nodrag border-b border-border/60 bg-muted/15 px-2 py-2">
      <div className="space-y-1">
        {rows.map((row) => (
          <SemanticPortRow
            key={`${row.inputPort ? 'in' : 'x'}-${row.outputPort ? 'out' : 'x'}-${row.port.id}`}
            inputPort={row.inputPort}
            outputPort={row.outputPort}
          />
        ))}
      </div>
      <span className="sr-only">{t('canvas.ports.semanticRows', { defaultValue: 'Semantic input and output ports' })}</span>
    </div>
  )
}

type SemanticPortPair = {
  port: CanvasPortDef
  inputPort?: CanvasPortDef
  outputPort?: CanvasPortDef
}

function pairSemanticPorts(inputPorts: CanvasPortDef[], outputPorts: CanvasPortDef[]): SemanticPortPair[] {
  const outputById = new Map(outputPorts.map((port) => [port.id, port]))
  const pairedOutputIds = new Set<string>()
  const rows: SemanticPortPair[] = inputPorts.map((inputPort) => {
    const outputPort = outputById.get(inputPort.id)
    if (outputPort) pairedOutputIds.add(outputPort.id)
    return { port: inputPort, inputPort, outputPort }
  })
  outputPorts.forEach((outputPort) => {
    if (!pairedOutputIds.has(outputPort.id)) rows.push({ port: outputPort, inputPort: undefined, outputPort })
  })
  return rows
}

function SemanticPortRow({ inputPort, outputPort }: { inputPort?: CanvasPortDef; outputPort?: CanvasPortDef }) {
  const { t } = useTranslation()
  const port = inputPort ?? outputPort
  if (!port) return null
  const typeLabelKey = PARAM_TYPE_LABELS[port.type]
  const typeLabel = typeLabelKey ? t(typeLabelKey) : port.type
  const label = port.labelKey ? t(port.labelKey, { defaultValue: port.label ?? port.id }) : (port.label ?? port.id)
  const requiredLabel = t('canvas.ports.required', { defaultValue: 'Required' })
  const maxCountLabel = port.maxCount ? t('canvas.ports.maxCount', { count: port.maxCount, defaultValue: `Max ${port.maxCount}` }) : null
  const isInputOnly = !!inputPort && !outputPort
  const isOutputOnly = !!outputPort && !inputPort
  const title = [
    label,
    typeLabel,
    port.required ? requiredLabel : null,
    maxCountLabel,
    port.description,
  ].filter(Boolean).join(' · ')

  return (
    <div
      title={title}
      className={cn(
        'relative flex min-h-[30px] items-center gap-1.5 rounded-md border border-border bg-background/85 px-3 py-1.5 type-tiny shadow-sm',
        isOutputOnly && 'justify-end text-right',
        isInputOnly && 'justify-start',
        inputPort && outputPort && 'justify-center text-center'
      )}
    >
      {inputPort && (
        <Handle
          id={semanticInputHandleId(inputPort.id)}
          type="target"
          position={Position.Left}
          title={title}
          style={semanticTargetHandleStyle}
        />
      )}
      {outputPort && (
        <Handle
          id={semanticOutputHandleId(outputPort.id)}
          type="source"
          position={Position.Right}
          title={title}
          style={semanticSourceHandleStyle}
        />
      )}
      <div className={cn(
        'flex min-w-0 flex-1 items-center gap-1.5',
        isOutputOnly && 'justify-end',
        inputPort && outputPort && 'justify-center px-1'
      )}>
        <span className="truncate font-medium text-foreground">{label}</span>
        {port.required && <span className="shrink-0 rounded-sm bg-destructive/10 px-1 py-0.5 leading-none text-destructive">*</span>}
        <span className="shrink-0 rounded border border-border bg-muted/40 px-1 py-0.5 leading-none text-muted-foreground">{typeLabel}</span>
        {maxCountLabel && (
          <span className="shrink-0 rounded border border-border bg-muted/30 px-1 py-0.5 leading-none text-muted-foreground">{maxCountLabel}</span>
        )}
      </div>
    </div>
  )
}

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
      style={{
        width: '100%',
        height: '100%',
        borderRadius: '9999px',
        border: 0,
        background: 'transparent',
        left: '50%',
        right: undefined,
        top: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 40,
        pointerEvents: 'auto',
      }}
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
            ...semanticTargetHandleStyle,
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
            ...semanticSourceHandleStyle,
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
    <div className="relative">
      <HiddenPortHandles
        inputs={resolvedInputs}
        outputs={resolvedOutputs}
        visibleInputIds={visibleInputIds}
        visibleOutputIds={visibleOutputIds}
      />
      {children}
    </div>
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
  onPush?: () => void
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
  for (const resource of data.referenceResources ?? []) {
    if (seen.has(resource.ID)) continue
    seen.add(resource.ID)
    resources.push(resource)
  }
  return resources
}

async function fetchCanvasChipMediaUrl(resource: RawResource): Promise<string> {
  if (resource.direct_url) return resource.direct_url
  const src = `${API_BASE}${resource.url}`
  const res = await api.get(src, { baseURL: '', responseType: 'blob' })
  return URL.createObjectURL(res.data)
}

function buildCanvasChipElement(resource: RawResource): { chip: HTMLElement; media: HTMLImageElement | HTMLVideoElement } {
  const chip = document.createElement('span')
  chip.contentEditable = 'false'
  chip.dataset.resourceName = resource.name
  chip.dataset.resourceId = String(resource.ID)
  chip.style.cssText = 'display:inline-flex;align-items:center;gap:3px;vertical-align:middle;background:hsl(var(--muted));color:hsl(var(--foreground));border:1px solid hsl(var(--border));border-radius:6px;padding:1px 5px;margin:0 2px;font-size:12px;line-height:1.4;white-space:nowrap;cursor:default;'

  let media: HTMLImageElement | HTMLVideoElement
  if (resource.type === 'video') {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'
    video.style.cssText = 'width:18px;height:18px;object-fit:cover;border-radius:3px;flex-shrink:0;background:hsl(var(--muted));'
    chip.appendChild(video)
    media = video
  } else {
    const image = document.createElement('img')
    image.alt = resource.name
    image.style.cssText = 'width:18px;height:18px;object-fit:cover;border-radius:3px;flex-shrink:0;background:hsl(var(--muted));'
    chip.appendChild(image)
    media = image
  }

  const label = document.createElement('span')
  label.textContent = resource.name
  label.style.cssText = 'max-width:72px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
  chip.appendChild(label)

  return { chip, media }
}

function serializeCanvasPrompt(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  const el = node as HTMLElement
  if (el.dataset?.resourceId) return `@[resource:${el.dataset.resourceId}]`
  return Array.from(node.childNodes).map(serializeCanvasPrompt).join('')
}

function attachCanvasChipMedia(resource: RawResource, media: HTMLImageElement | HTMLVideoElement, editor: HTMLElement | null, objectUrls: Set<string>) {
  fetchCanvasChipMediaUrl(resource).then((mediaUrl) => {
    let target: HTMLImageElement | HTMLVideoElement | null = media
    if (!media.isConnected && editor) {
      const chip = editor.querySelector(`[data-resource-id="${resource.ID}"]`)
      target = chip?.querySelector('img, video') as HTMLImageElement | HTMLVideoElement | null
    }
    if (!target) {
      if (mediaUrl.startsWith('blob:')) URL.revokeObjectURL(mediaUrl)
      return
    }
    if (target.src.startsWith('blob:')) {
      URL.revokeObjectURL(target.src)
      objectUrls.delete(target.src)
    }
    target.src = mediaUrl
    if (mediaUrl.startsWith('blob:')) objectUrls.add(mediaUrl)
    if (resource.type === 'video') {
      const video = target as HTMLVideoElement
      video.addEventListener('loadedmetadata', () => { video.currentTime = 0.1 }, { once: true })
    }
  }).catch((error) => {
    console.error('[canvas mention chip] fetch failed', resource.url, error?.response?.status, error?.message)
  })
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
  const chipObjectUrlsRef = useRef<Set<string>>(new Set())
  const mentionRangeRef = useRef<{ node: Text; start: number; end: number } | null>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const attachments = selectedInputResources(data)
  const explicitResourceIds = new Set(data.inputResourceIds ?? [])
  const mentionResources = attachments
    .filter((resource) => resource.type === 'image' || resource.type === 'video')
    .filter((resource) => !mentionQuery || resource.name.toLowerCase().includes(mentionQuery))
    .slice(0, 8)
  const resourceById = new Map(attachments.map((resource) => [resource.ID, resource]))

  function editorText() {
    return editorRef.current ? serializeCanvasPrompt(editorRef.current) : ''
  }

  function handleInput() {
    const text = editorText()
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

    const { chip, media } = buildCanvasChipElement(resource)
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
    data.onUpdatePrompt?.(editorText())
    attachCanvasChipMedia(resource, media, editorRef.current, chipObjectUrlsRef.current)
  }

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const prompt = data.prompt ?? ''
    if (serializeCanvasPrompt(editor) === prompt) return
    for (const url of chipObjectUrlsRef.current) URL.revokeObjectURL(url)
    chipObjectUrlsRef.current.clear()
    editor.innerHTML = ''
    const pattern = /@\[resource:(\d+)\]\s?/g
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(prompt)) !== null) {
      const before = prompt.slice(lastIndex, match.index)
      if (before) editor.appendChild(document.createTextNode(before))
      const resource = resourceById.get(Number(match[1]))
      if (resource) {
        const { chip, media } = buildCanvasChipElement(resource)
        editor.appendChild(chip)
        editor.appendChild(document.createTextNode(' '))
        attachCanvasChipMedia(resource, media, editor, chipObjectUrlsRef.current)
      } else {
        editor.appendChild(document.createTextNode(match[0]))
      }
      lastIndex = pattern.lastIndex
    }
    const after = prompt.slice(lastIndex)
    if (after) editor.appendChild(document.createTextNode(after))
  }, [data.prompt, resourceById])

  useEffect(() => {
    return () => {
      for (const url of chipObjectUrlsRef.current) URL.revokeObjectURL(url)
      chipObjectUrlsRef.current.clear()
    }
  }, [])

  return (
    <div
      className="nodrag nowheel relative rounded-lg border border-border/80 bg-background px-2.5 py-2"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className="mention-editor min-h-[72px] w-full bg-transparent px-1 py-1 type-body leading-relaxed text-foreground outline-none"
        data-placeholder={placeholder ?? (inputType ? t(`shared.genInput.promptPlaceholder.${inputType}`, { defaultValue: t('shared.generation.promptPlaceholder') }) : t('shared.generation.promptPlaceholder'))}
        onInput={handleInput}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setMentionQuery(null)
        }}
      />
      {mentionQuery !== null && (
        <div className="absolute bottom-full left-2 right-2 z-30 mb-1 max-h-44 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
          {mentionResources.length === 0 ? (
            <p className="px-2.5 py-2 type-label text-muted-foreground">
              {attachments.length === 0 ? t('shared.genInput.addResourcesFirst') : t('shared.genInput.noMatchedResources')}
            </p>
          ) : mentionResources.map((resource) => (
              <button
                key={resource.ID}
                type="button"
                className="flex w-full items-center gap-2 px-2.5 py-2 text-left type-label transition-colors hover:bg-muted/60"
                onMouseDown={(event) => {
                  event.preventDefault()
                  insertMention(resource)
                }}
              >
                <span className="h-7 w-7 shrink-0 overflow-hidden rounded-md bg-muted">
                  <MediaViewer resource={resource} className="h-full w-full" lightbox={false} />
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground">{resource.name}</span>
                <span className="shrink-0 type-tiny text-muted-foreground">#{resource.ID}</span>
              </button>
            ))}
        </div>
      )}
      {attachments.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 border-t border-border/50 pt-2">
          {attachments.map((resource) => {
            const removable = explicitResourceIds.has(resource.ID)
            return (
            <div key={resource.ID} className="flex max-w-full items-center gap-1.5 rounded-full bg-muted px-2 py-1">
              <span className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-background">
                <MediaViewer resource={resource} className="h-full w-full" lightbox={false} />
              </span>
              <span className="max-w-[140px] truncate type-label text-foreground">{resource.name}</span>
              {removable ? (
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => data.onUpdateAttachments?.((data.inputResourceIds ?? []).filter((id) => id !== resource.ID))}
                  aria-label={t('common.remove', { defaultValue: 'Remove' })}
                >
                  <X size={10} />
                </button>
              ) : (
                <span className="shrink-0 type-micro text-muted-foreground">{t('canvas.editor.connected', { defaultValue: 'Connected' })}</span>
              )}
            </div>
          )})}
        </div>
      ) : (
        <div className="border-t border-border/50 pt-2 type-caption text-muted-foreground">
          {t('shared.genInput.selectOrUploadHint', { defaultValue: 'Select or upload resources' })}
        </div>
      )}
    </div>
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
  const [expanded, setExpanded] = useState(false)
  const params = canvasGenerationParamDefs(nodeType, outputType, selectedModel)
  const visibleParams = expanded ? params : params.slice(0, 2)
  if (params.length === 0 && (!models || models.length === 0)) return null

  return (
    <div
      className="nodrag nowheel rounded-lg border border-border/80 bg-muted/15 px-2.5 py-2"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-center gap-1.5 type-tiny font-medium text-muted-foreground">
        <Wrench size={12} />
        <span>{t('plugins.parameters')}</span>
      </div>
      {models && models.length > 0 && (
        <label className="mb-2 block min-w-0 type-tiny text-muted-foreground">
          <span className="mb-1 block truncate">{t('agents.model')}</span>
          <select
            className="h-7 w-full rounded-md border border-border bg-background px-1.5 type-tiny text-foreground outline-none"
            value={selectedModel ? publicModelId(selectedModel) : ''}
            onChange={(event) => {
              const model = models.find((item) => publicModelId(item) === event.target.value)
              if (!model) return
              data.onUpdateModelId?.(publicModelId(model), model.id)
              data.onUpdateParams?.(canvasDefaultParamValues(canvasGenerationParamDefs(nodeType, outputType, model)))
            }}
          >
            {models.length === 0 && <option value="">{t('shared.modelSelector.noModels')}</option>}
            {models.map((model) => (
              <option key={model.id} value={publicModelId(model)}>{publicModelLabel(model)}</option>
            ))}
          </select>
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        {visibleParams.map((param) => {
          const value = canvasParamValue(data, param)
          const label = param.label || param.key
          if (param.type === 'select' && param.options) {
            return (
              <label key={param.key} className="min-w-0 type-tiny text-muted-foreground">
                <span className="mb-1 block truncate">{label}</span>
                <select
                  className="h-7 w-full rounded-md border border-border bg-background px-1.5 type-tiny text-foreground outline-none"
                  value={String(value)}
                  onChange={(event) => data.onUpdateParams?.(updateCanvasParam(data, param.key, event.target.value))}
                >
                  {param.options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            )
          }
          if (param.type === 'number') {
            return (
              <label key={param.key} className="min-w-0 type-tiny text-muted-foreground">
                <span className="mb-1 block truncate">{label}</span>
                <input
                  type="number"
                  className="h-7 w-full rounded-md border border-border bg-background px-1.5 type-tiny text-foreground outline-none"
                  value={Number.isFinite(Number(value)) ? Number(value) : ''}
                  min={param.min}
                  max={param.max}
                  step={param.step ?? 1}
                  onChange={(event) => data.onUpdateParams?.(updateCanvasParam(data, param.key, event.target.value === '' ? '' : Number(event.target.value)))}
                />
              </label>
            )
          }
          if (param.type === 'boolean') {
            return (
              <label key={param.key} className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 type-tiny text-foreground">
                <input
                  type="checkbox"
                  checked={value === true || value === 'true'}
                  onChange={(event) => data.onUpdateParams?.(updateCanvasParam(data, param.key, event.target.checked))}
                />
                <span className="truncate">{label}</span>
              </label>
            )
          }
          return (
            <label key={param.key} className="min-w-0 type-tiny text-muted-foreground">
              <span className="mb-1 block truncate">{label}</span>
              <input
                className="h-7 w-full rounded-md border border-border bg-background px-1.5 type-tiny text-foreground outline-none"
                value={String(value)}
                onChange={(event) => data.onUpdateParams?.(updateCanvasParam(data, param.key, event.target.value))}
              />
            </label>
          )
        })}
      </div>
      {params.length > 2 && (
        <button
          type="button"
          className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1 type-tiny text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded
            ? t('common.collapse', { defaultValue: 'Collapse' })
            : t('common.expand', { defaultValue: `More parameters (${params.length - 2})` })}
        </button>
      )}
    </div>
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
  const isRunning = status === 'pending' || status === 'running'
  if (status === 'idle' && !data.resource && !data.error) return null
  return (
    <div className="nodrag nowheel overflow-hidden rounded-lg border border-border/80 bg-background shadow-sm">
      {isRunning ? (
        <div className="flex h-64 w-full items-center justify-center bg-muted/40 text-muted-foreground">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : status === 'failed' ? (
        <div className="flex min-h-32 w-full items-center px-3 py-4 type-label text-destructive">
          {data.error ?? t('pages.jobs.generationFailed')}
        </div>
      ) : data.resource ? (
        <MediaViewer resource={data.resource} fit="contain" className="h-64 w-full bg-muted/40" lightbox />
      ) : (
        <div className="flex h-32 w-full items-center justify-center bg-muted/30 type-label text-muted-foreground">
          {outputType === 'video' ? <Video size={20} /> : <Image size={20} />}
        </div>
      )}
    </div>
  )
}

function CanvasTextGenerationResultPanel({ data }: { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = (data.status ?? 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'failed'
  const isRunning = status === 'pending' || status === 'running'
  if (status === 'idle' && !data.textContent && !data.error) return null
  return (
    <div className="nodrag nowheel overflow-hidden rounded-lg border border-border/80 bg-background shadow-sm">
      <div className="px-3 pt-3 pb-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className={cn(
            'rounded-full px-1.5 py-0.5 type-tiny font-medium',
            status === 'done' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            isRunning && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
            status === 'failed' && 'bg-destructive/10 text-destructive',
          )}>
            {nodeStatusLabel(status)}
          </span>
        </div>
        {data.prompt && <p className="line-clamp-3 whitespace-pre-wrap type-label leading-relaxed text-foreground">{data.prompt}</p>}
      </div>
      <div className="px-3 pb-3">
        {isRunning ? (
          <div className="flex h-20 items-center justify-center rounded-md bg-muted/40 text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : status === 'failed' ? (
          <div className="rounded-md bg-destructive/5 px-3 py-4 type-label text-destructive">{data.error ?? t('pages.jobs.generationFailed')}</div>
        ) : data.textContent ? (
          <p className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 p-2 type-label leading-relaxed text-foreground">
            {data.textContent}
          </p>
        ) : null}
      </div>
    </div>
  )
}

// ── Shared primitives ──────────────────────────────────────────────────────────

function NodeCard({ selected, children, className }: { selected?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      'canvas-node-card rounded-lg border bg-card/95 shadow-sm type-label transition-all flex flex-col backdrop-blur',
      selected ? 'border-primary ring-2 ring-primary/15 shadow-lg shadow-primary/10' : 'border-border hover:border-foreground/20 hover:shadow-md',
      className
    )}>
      {children}
    </div>
  )
}

function NodeHeader({ icon, label, status, actions, accent }: {
  icon: React.ReactNode
  label: string
  status?: string
  actions?: React.ReactNode
  accent?: string
}) {
  return (
    <div className={cn('flex items-center gap-2 px-3 py-2 rounded-t-lg border-b border-border', accent ?? 'bg-muted/60')}>
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="font-medium truncate flex-1 text-foreground">{label}</span>
      {status && <StatusPip status={status} />}
      {actions}
    </div>
  )
}

function StatusPip({ status }: { status: string }) {
  if (status === 'running' || status === 'pending') return <Loader2 size={12} className="animate-spin text-amber-500 shrink-0" />
  if (status === 'done') return <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
  if (status === 'failed') return <XCircle size={12} className="text-destructive shrink-0" />
  return null
}

function RunBtn({ onClick, disabled }: { onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40">
      <Play size={12} />
    </button>
  )
}

function PushBtn({ onClick }: { onClick?: () => void }) {
  const { t } = useTranslation()
  return (
    <button onClick={onClick} title={t('canvas.pushToEntity')}
      className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
      <Share2 size={12} />
    </button>
  )
}

// ── Media nodes ────────────────────────────────────────────────────────────────

export function TextNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = data.status ?? 'idle'
  return (
    <NodeCard selected={selected}>
      <NodeHeader
        icon={<FileText size={12} />}
        label={data.label || t('canvas.nodeLabels.text')}
        status={status}
        actions={status !== 'pending' && status !== 'running' && data.onRun ? <RunBtn onClick={data.onRun} /> : undefined}
      />
      <SemanticPortRows nodeType="text" inputPorts={mediaNodeInputPorts('text', data)} />
      {data.source === 'manual' ? (
        <textarea
          className="flex-1 w-full px-3 py-2 type-label resize-none focus:outline-none bg-transparent nodrag nowheel text-foreground placeholder:text-muted-foreground/50 rounded-b-xl min-h-[60px]"
          placeholder={t('canvas.textInputPlaceholder')}
          value={data.textContent ?? ''}
          onChange={e => data.onUpdateContent?.(e.target.value)}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <div className="flex-1 px-3 py-2 rounded-b-xl overflow-auto">
          {data.textContent || data.prompt || data.resource?.name
            ? <span className="text-muted-foreground break-words line-clamp-4">{data.textContent || data.prompt || data.resource?.name}</span>
            : <span className="italic text-muted-foreground/40">{t('canvas.emptyContent')}</span>}
        </div>
      )}
    </NodeCard>
  )
}

export function ImageNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = data.status ?? 'idle'
  const imgUrl = data.resource?.url ? `${API_BASE}${data.resource.url}` : null
  return (
    <NodeCard selected={selected}>
      <NodeHeader
        icon={<Image size={12} />}
        label={data.label || t('canvas.nodeLabels.image')}
        status={status}
        actions={<>
          {status !== 'pending' && status !== 'running' && data.onRun && <RunBtn onClick={data.onRun} />}
          {status === 'done' && data.onPush && <PushBtn onClick={data.onPush} />}
        </>}
      />
      <SemanticPortRows nodeType="image" inputPorts={mediaNodeInputPorts('image', data)} />
      <div className="flex-1 bg-muted/30 flex items-center justify-center min-h-[80px] overflow-hidden rounded-b-xl">
        {imgUrl
          ? <AuthedImage src={imgUrl} alt="" className="w-full h-full object-cover" />
          : <Image size={24} className="text-muted-foreground/20" />}
      </div>
    </NodeCard>
  )
}

export function VideoNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = data.status ?? 'idle'
  const videoUrl = data.resource?.url ? `${API_BASE}${data.resource.url}` : null
  return (
    <NodeCard selected={selected}>
      <NodeHeader
        icon={<Video size={12} />}
        label={data.label || t('canvas.nodeLabels.video')}
        status={status}
        actions={<>
          {status !== 'pending' && status !== 'running' && data.onRun && <RunBtn onClick={data.onRun} />}
          {status === 'done' && data.onPush && <PushBtn onClick={data.onPush} />}
        </>}
      />
      <SemanticPortRows nodeType="video" inputPorts={mediaNodeInputPorts('video', data)} />
      <div className="flex-1 bg-zinc-900 flex items-center justify-center min-h-[80px] overflow-hidden rounded-b-xl">
        {videoUrl
          ? <AuthedVideo src={videoUrl} className="w-full h-full object-cover" controls />
          : <Video size={24} className="text-white/20" />}
      </div>
    </NodeCard>
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
        configs={toolConfigItems(type, data, meta.outputType, selectedModel)}
        outputs={toolOutputSlots(type, data, t)}
        resultPanel={isGenerationTool ? <CanvasGenerationResultPanel data={data} outputType={meta.outputType} /> : undefined}
        primaryAction={data.onRun ? { id: 'run', label: isRunning ? '运行中' : '运行', icon: isRunning ? Loader2 : Play, onClick: data.onRun, disabled: isRunning } : undefined}
        secondaryAction={data.onPush && status === 'done' ? { id: 'push', label: '加入候选', icon: Share2, onClick: data.onPush } : { id: 'variant', label: '变体', icon: ImagePlus, disabled: true }}
        footer={data.error ? <p className="line-clamp-2 type-tiny text-destructive">{data.error}</p> : undefined}
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
        footer={data.pluginResultText ? <p className="line-clamp-2 whitespace-pre-wrap type-tiny text-muted-foreground">{data.pluginResultText}</p> : undefined}
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
    <NodeCard selected={selected}>
      <NodeHeader
        icon={<UserCheck size={12} />}
        label={data.label || t('canvas.nodeLabels.approval')}
        accent="bg-amber-50 dark:bg-amber-950/30"
        actions={approvalStatus === 'waiting' ? <span className="type-micro text-amber-600 shrink-0">{t('canvas.approval.waiting')}</span> : undefined}
      />
      <SemanticPortRows nodeType="approval" />
      <div className="flex-1 px-3 py-2 rounded-b-xl">
        {approvalStatus === 'approved' && <span className="text-emerald-600 flex items-center gap-1"><Check size={10} /> {t('canvas.approval.approved')}</span>}
        {approvalStatus === 'rejected' && <span className="text-destructive flex items-center gap-1"><X size={10} /> {t('canvas.approval.rejected')}</span>}
        {approvalStatus === 'waiting' && (
          <div className="flex gap-1.5 mt-0.5">
            <button onMouseDown={e => { e.stopPropagation(); data.onApprove?.() }}
              className="flex-1 flex items-center justify-center gap-0.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg py-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 type-tiny transition-colors">
              <Check size={10} /> {t('canvas.approval.approve')}
            </button>
            <button onMouseDown={e => { e.stopPropagation(); data.onReject?.() }}
              className="flex-1 flex items-center justify-center gap-0.5 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-lg py-1.5 hover:bg-rose-100 dark:hover:bg-rose-900/40 type-tiny transition-colors">
              <X size={10} /> {t('canvas.approval.reject')}
            </button>
          </div>
        )}
      </div>
    </NodeCard>
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
        configs={toolConfigItems('text_gen', data, 'text', selectedModel)}
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

const OUTPUT_TYPES: Array<{ value: 'image' | 'video' | 'text'; icon: React.ReactNode; label: string }> = [
  { value: 'image', icon: <Image size={10} />, label: 'canvas.outputTypes.image' },
  { value: 'video', icon: <Video size={10} />, label: 'canvas.outputTypes.video' },
  { value: 'text',  icon: <FileText size={10} />, label: 'canvas.outputTypes.text' },
]

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
        configs={[
          { id: 'outputType', label: '输出', value: t(OUTPUT_TYPES.find((item) => item.value === outputType)?.label ?? 'canvas.outputTypes.image') },
          ...toolConfigItems('ai_gen', data, outputType, selectedModel),
        ]}
        outputs={outputSlots}
        resultPanel={outputType === 'text' ? <CanvasTextGenerationResultPanel data={data} /> : <CanvasGenerationResultPanel data={data} outputType={outputType} />}
        primaryAction={data.onRun ? { id: 'run', label: isRunning ? '运行中' : '运行', icon: isRunning ? Loader2 : Play, onClick: data.onRun, disabled: isRunning } : undefined}
        secondaryAction={data.onPush && status === 'done' ? { id: 'push', label: '加入候选', icon: Share2, onClick: data.onPush } : { id: 'variant', label: '类型', icon: ImagePlus, disabled: true }}
        footer={data.error ? <p className="line-clamp-2 type-tiny text-destructive">{data.error}</p> : undefined}
        renderPortHandle={(handle) => <CanvasCardPortHandle {...handle} />}
      />
    </ToolCardNodeFrame>
  )
}

// ── Group node ─────────────────────────────────────────────────────────────────

export function GroupNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  return (
    <div className={cn(
      'rounded-lg border border-dashed bg-background/35 transition-colors w-full h-full backdrop-blur-[1px]',
      selected ? 'border-primary/70 bg-primary/5' : 'border-border/70 hover:border-foreground/25'
    )}>
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={100}
      />
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
        <span className="type-label font-medium text-muted-foreground">{data.groupLabel || data.label || t('canvas.nodeLabels.group')}</span>
      </div>
    </div>
  )
}
