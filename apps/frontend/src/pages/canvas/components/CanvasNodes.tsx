import { Handle, Position, NodeResizer } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { useQuery } from '@tanstack/react-query'
import type { CanvasNodeData, CanvasPortDef, EntitySemanticValues, EntityWorkflowSchema } from '@/types'
import {
  FileText, Loader2, CheckCircle2, XCircle, Play,
  LogIn, LogOut, UserCheck, Sparkles, Check, X, Share2,
  Image, Video, Music, Brush, Camera, Layers3, ImagePlus,
	  Palette, PersonStanding, RotateCw, Wrench, Puzzle,
	  Database, ArrowRightLeft, HardDrive,
	} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AuthedImage, AuthedVideo, AuthedAudio } from '@/components/shared/AuthedImage'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import { useTranslation } from 'react-i18next'
import { CANVAS_NODE_META } from '../nodeCatalog'
import { api } from '@/lib/api'
import { CanvasToolActionCard } from '@/components/canvas/CanvasToolActionCard'
import type { CanvasToolSlot, CanvasToolSlotState, CanvasToolSlotType } from '@/components/canvas/CanvasToolActionCard'
import { CanvasDomainEntityCard } from '@/components/canvas/CanvasDomainEntityCard'
import type { CanvasDomainEntityKind } from '@/components/canvas/CanvasDomainEntityCard'
import { CanvasIOActionCard } from '@/components/canvas/CanvasIOActionCard'
import type { CanvasIOState } from '@/components/canvas/CanvasIOActionCard'

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

const MEDIA_NODE_TYPES = new Set(['text', 'image', 'video', 'audio'])

function semanticPreviewFields(kind?: CanvasDomainEntityKind) {
  if (kind === 'segment') {
    return ['title', 'kind', 'order', 'summary', 'content', 'source_range', 'status']
  }
  if (kind === 'scene_moment') {
    return ['title', 'segment_id', 'order', 'description', 'time_text', 'location_text', 'condition_text', 'action_text', 'mood', 'status']
  }
  if (kind === 'creative_reference') {
    return ['name', 'kind', 'alias', 'description', 'content', 'importance', 'status', 'profile_json', 'tags_json']
  }
  if (kind === 'asset_slot') {
    return ['name', 'kind', 'status', 'priority', 'description', 'slot_key', 'prompt_hint', 'candidates', 'resource_id', 'locked_asset_slot_id', 'creative_reference_id', 'image', 'video', 'audio', 'reference']
  }
  if (kind === 'content_unit') {
    return ['title', 'kind', 'status', 'segment_id', 'scene_moment_id', 'order', 'duration_sec', 'description', 'prompt', 'result', 'image', 'video', 'audio']
  }
  return []
}

function mediaNodeInputPorts(nodeType: string, data: CanvasNodeData): CanvasNodeData['inputPorts'] {
  if (!MEDIA_NODE_TYPES.has(nodeType)) return data.inputPorts
  return data.source === 'ai' ? data.inputPorts : []
}

const PARAM_TYPE_LABELS: Record<string, string> = {
  text: 'canvas.paramTypes.text',
  image: 'canvas.paramTypes.image',
  video: 'canvas.paramTypes.video',
  audio: 'canvas.paramTypes.audio',
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
        'relative flex min-h-[30px] items-center gap-1.5 rounded-md border border-border bg-background/85 px-3 py-1.5 text-[10px] shadow-sm',
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
  if (type === 'image' || type === 'video' || type === 'audio' || type === 'json' || type === 'entity' || type === 'prompt' || type === 'text') return type
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

function resourceSinkPorts(data: CanvasNodeData): { inputs: CanvasPortDef[]; outputs: CanvasPortDef[] } {
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
  pluginInputProperties?: Record<string, { title?: string; default?: string | number | boolean }>
  onRun?: () => void
  onUpdateContent?: (content: string) => void
  onUpdatePrompt?: (prompt: string) => void
  onUpdateOutputType?: (type: 'image' | 'video' | 'text' | 'audio') => void
  onUpdateModelId?: (id: number) => void
  onUpdateAttachments?: (ids: number[]) => void
  onApprove?: () => void
  onReject?: () => void
  onPush?: () => void
}

// ── Shared primitives ──────────────────────────────────────────────────────────

function NodeCard({ selected, children, className }: { selected?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      'canvas-node-card rounded-lg border bg-card/95 shadow-sm text-xs transition-all flex flex-col backdrop-blur',
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
  if (status === 'running' || status === 'pending') return <Loader2 size={11} className="animate-spin text-amber-500 shrink-0" />
  if (status === 'done') return <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
  if (status === 'failed') return <XCircle size={11} className="text-destructive shrink-0" />
  return null
}

function ParamMeta({ name, type }: { name?: string; type?: string }) {
  const { t } = useTranslation()
  const typeLabel = PARAM_TYPE_LABELS[type || '']
  return (
    <div className="flex items-center gap-1.5 min-w-0 text-[10px] text-muted-foreground">
      <span className="truncate font-medium text-foreground">{name || 'param'}</span>
      <span className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 leading-none">
        {typeLabel ? t(typeLabel) : type ?? t('canvas.unset')}
      </span>
    </div>
  )
}

function RunBtn({ onClick, disabled }: { onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40">
      <Play size={11} />
    </button>
  )
}

function PushBtn({ onClick }: { onClick?: () => void }) {
  const { t } = useTranslation()
  return (
    <button onClick={onClick} title={t('canvas.pushToEntity')}
      className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
      <Share2 size={11} />
    </button>
  )
}

function PluginParamSummary({ data }: { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const args = (data.pluginArgs ?? {}) as Record<string, unknown>
  const schemaEntries = Object.entries(data.pluginInputProperties ?? {})
  const argEntries = Object.entries(args).map(([name, value]) => [name, { title: name, default: value }] as const)
  const entries = (schemaEntries.length > 0 ? schemaEntries : argEntries)
    .map(([name, prop]) => {
      const value = args[name] ?? prop.default
      return { name, label: prop.title || name, value }
    })
    .filter((item) => item.value !== undefined && item.value !== null && String(item.value).trim() !== '')
    .slice(0, 4)

  if (entries.length === 0) return null

  return (
    <div className="space-y-1 rounded-md border border-border bg-muted/20 px-2 py-1.5">
      <div className="text-[9px] font-semibold uppercase text-muted-foreground">{t('plugins.parameters')}</div>
      {entries.map((item) => (
        <div key={item.name} className="flex items-center gap-2 text-[10px]">
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.label}</span>
          <span className="max-w-[120px] truncate rounded border border-border bg-background px-1.5 py-0.5 text-foreground">
            {String(item.value)}
          </span>
        </div>
      ))}
    </div>
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
          className="flex-1 w-full px-3 py-2 text-xs resize-none focus:outline-none bg-transparent nodrag nowheel text-foreground placeholder:text-muted-foreground/50 rounded-b-xl min-h-[60px]"
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

export function AudioNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = data.status ?? 'idle'
  const audioUrl = data.resource?.url ? `${API_BASE}${data.resource.url}` : null
  return (
    <NodeCard selected={selected}>
      <NodeHeader
        icon={<Music size={12} />}
        label={data.label || t('canvas.nodeLabels.audio')}
        status={status}
        actions={status !== 'pending' && status !== 'running' && data.onRun ? <RunBtn onClick={data.onRun} /> : undefined}
      />
      <SemanticPortRows nodeType="audio" inputPorts={mediaNodeInputPorts('audio', data)} />
      <div className="flex-1 px-3 py-3 rounded-b-xl flex items-center">
        {audioUrl
          ? <AuthedAudio src={audioUrl} controls className="w-full h-6" />
          : <span className="text-muted-foreground/40 italic">{t('canvas.emptyAudio')}</span>}
      </div>
    </NodeCard>
  )
}

// ── CanvasCardBody — shared body for ToolNode / AIGenNode ─────────────────

const API_BASE_CANVAS = API_BASE

function CanvasCardBody({
  prompt, status, outputResource, outputType, error,
}: {
  prompt?: string
  status: 'idle' | 'pending' | 'running' | 'done' | 'failed'
  outputResource?: CanvasNodeData['resource']
  outputType: 'image' | 'video'
  error?: string
}) {
  const { t } = useTranslation()
  const isRunning = status === 'pending' || status === 'running'
  const outputUrl = outputResource
    ? outputResource.direct_url ?? `${API_BASE_CANVAS}${outputResource.url}`
    : undefined

  return (
    <>
      {prompt && (
        <div className="px-3 py-2 border-b border-border">
          <p className="text-xs text-foreground leading-relaxed line-clamp-3 whitespace-pre-wrap">{prompt}</p>
        </div>
      )}
      {!prompt && status === 'idle' && (
        <div className="px-3 py-2">
          <span className="italic text-muted-foreground/40 text-xs">{t('canvas.noPrompt')}</span>
        </div>
      )}
      <div className="flex-1 bg-card min-h-[48px]">
        {isRunning && (
          <div className="flex items-center justify-center py-6">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              <p className="text-xs">{status === 'pending' ? t('canvas.waitingStart') : t('canvas.generating')}</p>
            </div>
          </div>
        )}
        {!isRunning && status === 'failed' && (
          <div className="flex items-center justify-center gap-2 text-destructive py-4">
            <XCircle size={12} />
            <p className="text-xs">{error ?? t('canvas.generationFailed')}</p>
          </div>
        )}
        {!isRunning && status === 'done' && outputUrl && (
          <div className="w-full h-full">
            {outputType === 'image'
              ? (outputResource?.direct_url
                ? <img src={outputResource.direct_url} alt={t('shared.generation.resultAlt')} className="w-full h-full object-cover" />
                : <AuthedImage src={`${API_BASE_CANVAS}${outputResource?.url}`} alt={t('shared.generation.resultAlt')} className="w-full h-full object-cover" />)
              : (outputResource?.direct_url
                ? <video src={outputResource.direct_url} className="w-full h-full object-cover" />
                : <AuthedVideo src={`${API_BASE_CANVAS}${outputResource?.url}`} className="w-full h-full object-cover" />)
            }
          </div>
        )}
      </div>
    </>
  )
}

function CanvasReferenceBody({
  referencedCanvasId,
  status,
  inputPorts,
  outputPorts,
  outputResource,
  error,
}: {
  referencedCanvasId?: number
  status: 'idle' | 'pending' | 'running' | 'done' | 'failed'
  inputPorts?: CanvasPortDef[]
  outputPorts?: CanvasPortDef[]
  outputResource?: CanvasNodeData['resource']
  error?: string
}) {
  const { t } = useTranslation()
  const inputCount = inputPorts?.length ?? 0
  const outputCount = outputPorts?.length ?? 0
  const isRunning = status === 'pending' || status === 'running'
  const outputUrl = outputResource
    ? outputResource.direct_url ?? `${API_BASE_CANVAS}${outputResource.url}`
    : undefined

  return (
    <div className="flex-1 rounded-b-lg bg-card">
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <ArrowRightLeft size={11} />
          <span className="truncate">
            {referencedCanvasId
              ? t('canvas.referenceWorkflow.interfaceSummary', { inputs: inputCount, outputs: outputCount })
              : t('canvas.referenceWorkflow.selectWorkflow')}
          </span>
        </div>
      </div>
      {isRunning && (
        <div className="flex items-center justify-center gap-2 px-3 py-5 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          {t('canvas.referenceWorkflow.reading')}
        </div>
      )}
      {!isRunning && status === 'failed' && (
        <div className="flex items-center gap-2 px-3 py-3 text-xs text-destructive">
          <XCircle size={12} />
          <span className="line-clamp-2">{error ?? t('canvas.generationFailed')}</span>
        </div>
      )}
      {!isRunning && status === 'done' && outputUrl && (
        <div className="h-28 overflow-hidden bg-muted/30">
          {outputResource?.type === 'video'
            ? (outputResource.direct_url
              ? <video src={outputResource.direct_url} className="h-full w-full object-cover" />
              : <AuthedVideo src={`${API_BASE_CANVAS}${outputResource.url}`} className="h-full w-full object-cover" />)
            : outputResource?.direct_url
              ? <img src={outputResource.direct_url} alt={t('shared.generation.resultAlt')} className="h-full w-full object-cover" />
              : <AuthedImage src={`${API_BASE_CANVAS}${outputResource?.url}`} alt={t('shared.generation.resultAlt')} className="h-full w-full object-cover" />
          }
        </div>
      )}
      {!isRunning && !(status === 'done' && outputUrl) && status !== 'failed' && (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          {referencedCanvasId
            ? t('canvas.referenceWorkflow.latestOutputHint')
            : t('canvas.referenceWorkflow.noWorkflowHint')}
        </div>
      )}
    </div>
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
        configs={[
          { id: 'model', label: '模型', value: data.modelDbId ? `#${data.modelDbId}` : '默认' },
          { id: 'mode', label: '类型', value: metaLabel },
          ...(data.prompt ? [{ id: 'prompt', label: '提示词', value: data.prompt }] : []),
        ]}
        outputs={toolOutputSlots(type, data, t)}
        primaryAction={data.onRun ? { id: 'run', label: isRunning ? '运行中' : '运行', icon: isRunning ? Loader2 : Play, onClick: data.onRun, disabled: isRunning } : undefined}
        secondaryAction={data.onPush && status === 'done' ? { id: 'push', label: '推送', icon: Share2, onClick: data.onPush } : { id: 'variant', label: '变体', icon: ImagePlus, disabled: true }}
        footer={data.error ? <p className="line-clamp-2 text-[10px] text-destructive">{data.error}</p> : undefined}
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
        footer={data.pluginResultText ? <p className="line-clamp-2 whitespace-pre-wrap text-[10px] text-muted-foreground">{data.pluginResultText}</p> : undefined}
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
  const port = resourceSinkPorts(data).inputs[0]
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
        actions={approvalStatus === 'waiting' ? <span className="text-[9px] text-amber-600 shrink-0">{t('canvas.approval.waiting')}</span> : undefined}
      />
      <SemanticPortRows nodeType="approval" />
      <div className="flex-1 px-3 py-2 rounded-b-xl">
        {approvalStatus === 'approved' && <span className="text-emerald-600 flex items-center gap-1"><Check size={10} /> {t('canvas.approval.approved')}</span>}
        {approvalStatus === 'rejected' && <span className="text-destructive flex items-center gap-1"><X size={10} /> {t('canvas.approval.rejected')}</span>}
        {approvalStatus === 'waiting' && (
          <div className="flex gap-1.5 mt-0.5">
            <button onMouseDown={e => { e.stopPropagation(); data.onApprove?.() }}
              className="flex-1 flex items-center justify-center gap-0.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg py-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-[10px] transition-colors">
              <Check size={9} /> {t('canvas.approval.approve')}
            </button>
            <button onMouseDown={e => { e.stopPropagation(); data.onReject?.() }}
              className="flex-1 flex items-center justify-center gap-0.5 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-lg py-1.5 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-[10px] transition-colors">
              <X size={9} /> {t('canvas.approval.reject')}
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
        configs={[
          { id: 'model', label: '模型', value: data.modelDbId ? `#${data.modelDbId}` : '默认' },
          ...(data.prompt ? [{ id: 'prompt', label: '提示词', value: data.prompt }] : []),
        ]}
        outputs={toolOutputSlots('text_gen', { ...data, resource: data.resource, status }, t)}
        primaryAction={data.onRun ? { id: 'run', label: isRunning ? '运行中' : '运行', icon: isRunning ? Loader2 : Play, onClick: data.onRun, disabled: isRunning } : undefined}
        secondaryAction={undefined}
        footer={data.textContent ? <p className="line-clamp-2 whitespace-pre-wrap text-[10px] text-muted-foreground">{data.textContent}</p> : undefined}
        renderPortHandle={(handle) => <CanvasCardPortHandle {...handle} />}
      />
    </ToolCardNodeFrame>
  )
}

// ── AI Gen node ────────────────────────────────────────────────────────────────

const OUTPUT_TYPES: Array<{ value: 'image' | 'video' | 'text' | 'audio'; icon: React.ReactNode; label: string }> = [
  { value: 'image', icon: <Image size={10} />, label: 'canvas.outputTypes.image' },
  { value: 'video', icon: <Video size={10} />, label: 'canvas.outputTypes.video' },
  { value: 'text',  icon: <FileText size={10} />, label: 'canvas.outputTypes.text' },
  { value: 'audio', icon: <Music size={10} />, label: 'canvas.outputTypes.audio' },
]

export function AIGenNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = (data.status ?? 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'failed'
  const outputType = (data.outputType ?? 'image') as 'image' | 'video'
  const isRunning = status === 'pending' || status === 'running'
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
        configs={[
          { id: 'outputType', label: '输出', value: t(OUTPUT_TYPES.find((item) => item.value === outputType)?.label ?? 'canvas.outputTypes.image') },
          { id: 'model', label: '模型', value: data.modelDbId ? `#${data.modelDbId}` : '默认' },
          ...(data.prompt ? [{ id: 'prompt', label: '提示词', value: data.prompt }] : []),
        ]}
        outputs={outputSlots}
        primaryAction={data.onRun ? { id: 'run', label: isRunning ? '运行中' : '运行', icon: isRunning ? Loader2 : Play, onClick: data.onRun, disabled: isRunning } : undefined}
        secondaryAction={data.onPush && status === 'done' ? { id: 'push', label: '推送', icon: Share2, onClick: data.onPush } : { id: 'variant', label: '类型', icon: ImagePlus, disabled: true }}
        footer={data.error ? <p className="line-clamp-2 text-[10px] text-destructive">{data.error}</p> : undefined}
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
        <span className="text-xs font-medium text-muted-foreground">{data.groupLabel || data.label || t('canvas.nodeLabels.group')}</span>
      </div>
    </div>
  )
}

export function EntityCardNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const kind = data.entityKind
  const label = data.label || data.entityTitle || t('canvas.nodeLabels.entity_card')
  const kindLabel = kind ? t(`canvas.entityTypes.${kind}`, { defaultValue: kind }) : t('canvas.nodeLabels.entity_card')
  const inputPorts = data.inputPorts
  const outputPorts = data.outputPorts
  const previewFields = semanticPreviewFields(kind as CanvasDomainEntityKind | undefined)
  const { data: semanticValues } = useQuery<EntitySemanticValues>({
    queryKey: ['entity-semantic-values', kind, data.entityId, previewFields.join(',')],
    queryFn: () => api.get(`/entities/${kind}/${data.entityId}/semantic-values`, {
      params: previewFields.length > 0 ? { fields: previewFields.join(',') } : undefined,
    }).then((r) => r.data),
    enabled: !!kind && !!data.entityId && previewFields.length > 0,
  })
  const resolvedKind = kind ?? 'script'
  const domainKind: CanvasDomainEntityKind = resolvedKind === 'script' || resolvedKind === 'setting' ? 'segment' : resolvedKind
  const title = data.entityTitle || label
  const subtitle = [
    kindLabel,
    data.entityId ? `#${data.entityId}` : null,
  ].filter(Boolean).join(' · ')
  const { resolvedInputs, resolvedOutputs } = resolvePorts({
    nodeType: 'entity_card',
    inputPorts,
    outputPorts,
  })

  return (
    <div className="relative">
      <HiddenPortHandles
        inputs={resolvedInputs}
        outputs={resolvedOutputs}
        visibleInputIds={resolvedInputs.map((port) => port.id)}
        visibleOutputIds={resolvedOutputs.map((port) => port.id)}
      />
      <CanvasDomainEntityCard
        kind={domainKind}
        title={title}
        subtitle={subtitle || data.textContent || t('canvas.entityCard.noPreview')}
        status={data.entityId ? '已绑定' : '未绑定'}
        selected={selected}
        semanticValues={semanticValues}
        fallbackText={data.textContent}
        inputPortIds={resolvedInputs.map((port) => port.id)}
        outputPortIds={resolvedOutputs.map((port) => port.id)}
        renderPortHandle={(handle) => <CanvasCardPortHandle {...handle} />}
      />
    </div>
  )
}
