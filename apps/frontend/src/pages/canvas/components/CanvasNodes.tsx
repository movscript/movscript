import { Handle, Position, NodeResizer } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { useQuery } from '@tanstack/react-query'
import type { CanvasEntityKind, CanvasNodeData, CanvasPortDef, EntitySemanticValues, EntityWorkflowSchema, EntityWorkflowSchemaField } from '@/types'
import {
  FileText, Loader2, CheckCircle2, XCircle, Play,
  LogIn, LogOut, UserCheck, Sparkles, Check, X, Share2,
  Image, Video, Music, Brush, Camera, Layers3,
	  Palette, PersonStanding, RotateCw, Wrench, Puzzle,
	  Database, ArrowRightLeft, HardDrive,
	} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AuthedImage, AuthedVideo, AuthedAudio } from '@/components/shared/AuthedImage'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import { useTranslation } from 'react-i18next'
import { CANVAS_NODE_META } from '../nodeCatalog'
import { api } from '@/lib/api'

const ENTITY_ICONS: Record<CanvasEntityKind, React.ReactNode> = {
  script: <FileText size={12} />,
  setting: <Database size={12} />,
  asset: <Image size={12} />,
  episode: <Video size={12} />,
  scene: <Camera size={12} />,
  storyboard: <Layers3 size={12} />,
  shot: <Video size={12} />,
  final_video: <Video size={12} />,
}

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
      label: data.paramName || 'resource',
      type: data.paramType ?? 'resource',
      required: true,
    }],
    outputs: [{ id: 'resource', label: data.paramName || 'resource', type: 'resource' }],
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
      <SemanticPortRows nodeType="text" />
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
      <SemanticPortRows nodeType="image" />
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
      <SemanticPortRows nodeType="video" />
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
      <SemanticPortRows nodeType="audio" />
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

  return (
    <NodeCard selected={selected}>
      <NodeHeader
        icon={meta.icon}
        label={data.label || metaLabel}
        status={status}
        actions={status !== 'pending' && status !== 'running' && data.onRun ? <RunBtn onClick={data.onRun} /> : undefined}
      />
      <SemanticPortRows nodeType={type} inputPorts={data.inputPorts} outputPorts={data.outputPorts} />
      {type === 'canvas' ? (
        <CanvasReferenceBody
          referencedCanvasId={data.referencedCanvasId}
          status={status}
          inputPorts={data.inputPorts}
          outputPorts={data.outputPorts}
          outputResource={data.resource}
          error={data.error}
        />
      ) : (
        <CanvasCardBody
          prompt={data.prompt}
          status={status}
          outputResource={data.resource}
          outputType={meta.outputType}
          error={data.error}
        />
      )}
    </NodeCard>
  )
}

export function PluginCardNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = data.status ?? 'idle'
  return (
    <NodeCard selected={selected}>
      <NodeHeader
        icon={<Puzzle size={12} />}
        label={data.label || data.pluginName || t('canvas.nodeLabels.plugin_card')}
        status={status}
        actions={status !== 'pending' && status !== 'running' && data.onRun ? <RunBtn onClick={data.onRun} /> : undefined}
      />
      <SemanticPortRows nodeType="plugin_card" inputPorts={data.inputPorts} outputPorts={data.outputPorts} />
      <div className="flex-1 px-3 py-2 rounded-b-lg space-y-2">
        <div className="flex items-center gap-1.5 min-w-0 text-[10px] text-muted-foreground">
          <span className="truncate font-medium text-foreground">{data.pluginName || data.pluginId || t('plugins.notFound')}</span>
          {data.pluginVersion && (
            <span className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 leading-none">
              v{data.pluginVersion}
            </span>
          )}
        </div>
        <PluginParamSummary data={data} />
        {data.pluginResultText ? (
          <p className="line-clamp-4 whitespace-pre-wrap break-words text-xs text-muted-foreground">{data.pluginResultText}</p>
        ) : (
          <span className="italic text-muted-foreground/40">{t('canvas.pluginCard.waiting')}</span>
        )}
      </div>
    </NodeCard>
  )
}

// ── Special nodes ──────────────────────────────────────────────────────────────

export function InputNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = data.status ?? 'idle'
  return (
    <NodeCard selected={selected}>
      <NodeHeader
        icon={<LogIn size={12} />}
        label={data.label || t('canvas.nodeLabels.input')}
        status={status}
        actions={status !== 'pending' && status !== 'running' && data.onRun
          ? <RunBtn onClick={data.onRun} />
          : <span className="text-[9px] text-muted-foreground shrink-0 font-medium">{t('canvas.nodeLabels.input')}</span>}
      />
      <SemanticPortRows nodeType="input" outputPorts={workflowInputOutputPorts(data)} inputs={false} />
      <div className="flex-1 px-3 py-2 rounded-b-lg space-y-2">
        <ParamMeta name={data.paramName ?? 'input'} type={data.paramType ?? 'text'} />
        {data.inputValue
          ? <span className="text-foreground block break-words">{data.inputValue}</span>
          : <span className="italic text-muted-foreground/40">{t('canvas.fillAtRuntime')}</span>}
      </div>
    </NodeCard>
  )
}

export function OutputNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = data.status ?? 'idle'
  const hasOutput = !!data.resource || status === 'done'
  return (
    <NodeCard selected={selected}>
      <NodeHeader
        icon={<LogOut size={12} />}
        label={data.label || t('canvas.nodeLabels.output')}
        status={status}
        actions={status !== 'pending' && status !== 'running' && data.onRun
          ? <RunBtn onClick={data.onRun} />
          : <span className="text-[9px] text-muted-foreground shrink-0 font-medium">{t('canvas.nodeLabels.output')}</span>}
      />
      <SemanticPortRows nodeType="output" inputPorts={workflowOutputInputPorts(data)} outputs={false} />
      <div className="flex-1 px-3 py-2 rounded-b-lg space-y-2">
        <ParamMeta name={data.paramName ?? 'output'} type={data.paramType ?? 'resource'} />
        <div className="flex items-center justify-between gap-2">
          {hasOutput
            ? <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={10} /> {t('canvas.generated')}</span>
            : <span className="italic text-muted-foreground/40">{t('canvas.waitingUpstream')}</span>}
        </div>
      </div>
    </NodeCard>
  )
}

export function ResourceSinkNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = data.status ?? 'idle'
  const ports = resourceSinkPorts(data)
  const hasOutput = !!data.resource || status === 'done'
  return (
    <NodeCard selected={selected}>
      <NodeHeader
        icon={<HardDrive size={12} />}
        label={data.label || t('canvas.nodeLabels.resource_sink')}
        status={status}
        actions={status !== 'pending' && status !== 'running' && data.onRun
          ? <RunBtn onClick={data.onRun} />
          : <span className="text-[9px] text-muted-foreground shrink-0 font-medium">{t('canvas.nodeLabels.resource_sink')}</span>}
      />
      <SemanticPortRows nodeType="resource_sink" inputPorts={ports.inputs} outputPorts={ports.outputs} />
      <div className="flex-1 px-3 py-2 rounded-b-lg space-y-2">
        <ParamMeta name={data.paramName ?? 'resource'} type={data.paramType ?? 'resource'} />
        {hasOutput
          ? <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={10} /> {t('canvas.resourceSaved')}</span>
          : <span className="italic text-muted-foreground/40">{t('canvas.waitingUpstream')}</span>}
      </div>
    </NodeCard>
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
  const status = data.status ?? 'idle'
  return (
    <NodeCard selected={selected}>
      <NodeHeader
        icon={<Sparkles size={12} />}
        label={data.label || t('canvas.nodeLabels.text_gen')}
        status={status}
        accent="bg-violet-50 dark:bg-violet-950/30"
        actions={status !== 'pending' && status !== 'running' && data.onRun ? <RunBtn onClick={data.onRun} /> : undefined}
      />
      <SemanticPortRows nodeType="text_gen" />
      <div className="flex-1 px-3 py-2 rounded-b-xl overflow-auto">
        {data.textContent || data.prompt
          ? <span className="text-muted-foreground break-words whitespace-pre-wrap">{data.textContent || data.prompt}</span>
          : <span className="italic text-muted-foreground/40">{t('canvas.noPrompt')}</span>}
      </div>
    </NodeCard>
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

  return (
    <NodeCard selected={selected}>
      <NodeHeader
        icon={<Sparkles size={12} />}
        label={data.label || t('canvas.nodeLabels.ai_gen')}
        status={status}
        actions={<>
          {status !== 'pending' && status !== 'running' && data.onRun && <RunBtn onClick={data.onRun} />}
          {status === 'done' && data.onPush && <PushBtn onClick={data.onPush} />}
        </>}
      />
      <SemanticPortRows nodeType="ai_gen" />
      <div className="flex gap-1 px-3 py-2 border-b border-border/50">
        {OUTPUT_TYPES.map((option) => (
          <button key={option.value}
            onClick={e => { e.stopPropagation(); data.onUpdateOutputType?.(option.value) }}
            className={cn(
              'flex-1 flex items-center justify-center gap-0.5 py-1 rounded-md text-[10px] border transition-colors',
              outputType === option.value
                ? 'bg-violet-100 dark:bg-violet-900/40 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300'
                : 'border-border text-muted-foreground hover:bg-muted/50'
            )}>
            {option.icon} {t(option.label)}
          </button>
        ))}
      </div>
      <CanvasCardBody
        prompt={data.prompt}
        status={status}
        outputResource={data.resource}
        outputType={outputType}
        error={data.error}
      />
    </NodeCard>
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
  const { data: schema } = useQuery<EntityWorkflowSchema>({
    queryKey: ['workflow-entity-schema', kind],
    queryFn: () => api.get(`/workflow/entity-schemas/${kind}`).then((r) => r.data),
    enabled: !!kind,
  })
  const { data: semanticValues } = useQuery<EntitySemanticValues>({
    queryKey: ['entity-semantic-values', kind, data.entityId],
    queryFn: () => api.get(`/entities/${kind}/${data.entityId}/semantic-values`).then((r) => r.data),
    enabled: !!kind && !!data.entityId,
  })
  const fields = entityPreviewFields(schema, semanticValues?.values, t)

  return (
    <NodeCard selected={selected}>
      <NodeHeader
        icon={kind ? ENTITY_ICONS[kind] : <FileText size={12} />}
        label={label}
        accent="bg-slate-50 dark:bg-slate-950/35"
      />
      <SemanticPortRows nodeType="entity_card" inputPorts={inputPorts} outputPorts={outputPorts} />
      <div className="space-y-2 px-3 py-2">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="rounded border border-border bg-background px-1.5 py-0.5 leading-none">{kindLabel}</span>
          {data.entityId && <span className="font-mono">#{data.entityId}</span>}
        </div>
        {fields.length > 0 ? (
          <div className="space-y-1.5">
            {fields.map((field) => (
              <div key={field.id} className="rounded-md border border-border bg-background/85 px-2 py-1.5">
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{field.label}</span>
                  {field.readable && <span className="rounded border border-border bg-muted/50 px-1 py-0.5 leading-none text-muted-foreground">out</span>}
                  {field.writable && <span className="rounded border border-border bg-muted/50 px-1 py-0.5 leading-none text-muted-foreground">in</span>}
                </div>
                <p className={cn(
                  'mt-1 text-[11px] leading-snug',
                  field.hasValue ? 'line-clamp-2 text-muted-foreground' : 'italic text-muted-foreground/45'
                )}>
                  {field.summary}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs italic text-muted-foreground/45">
            {data.textContent || t('canvas.entityCard.noPreview')}
          </p>
        )}
      </div>
    </NodeCard>
  )
}

type EntityPreviewField = {
  id: string
  label: string
  summary: string
  hasValue: boolean
  readable: boolean
  writable: boolean
}

function entityPreviewFields(schema: EntityWorkflowSchema | undefined, values: Record<string, unknown> | undefined, t: (key: string, options?: any) => string): EntityPreviewField[] {
  if (!schema) return []
  const fields = schema.sections.flatMap((section) => section.fields)
    .filter((field) => !field.deprecated && (field.workflow.readable || field.workflow.writable))
    .map((field) => {
      const value = values?.[field.id]
      const summary = summarizeEntityValue(value)
      return {
        id: field.id,
        label: field.labelKey ? t(field.labelKey, { defaultValue: entityFieldFallbackLabel(field) }) : entityFieldFallbackLabel(field),
        summary: summary || t('canvas.entityCard.noValue'),
        hasValue: !!summary,
        readable: field.workflow.readable,
        writable: field.workflow.writable,
      }
    })
  return fields
    .sort((a, b) => Number(b.hasValue) - Number(a.hasValue) || Number(b.readable) - Number(a.readable))
    .slice(0, 5)
}

function entityFieldFallbackLabel(field: EntityWorkflowSchemaField) {
  return field.fallbackLabel || field.workflow.portId || field.id
}

function summarizeEntityValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return compactText(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return ''
    const sample = value.slice(0, 3).map(summarizeEntityListItem).filter(Boolean).join(', ')
    return value.length > 3 ? `${sample} +${value.length - 3}` : sample
  }
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>
    const title = item.title ?? item.name ?? item.label ?? item.number ?? item.ID ?? item.id
    if (title !== undefined) return compactText(String(title))
    try {
      return compactText(JSON.stringify(value))
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function summarizeEntityListItem(value: unknown): string {
  if (typeof value === 'number') return `#${value}`
  if (typeof value === 'string') return compactText(value)
  if (typeof value === 'object' && value) {
    const item = value as Record<string, unknown>
    const title = item.title ?? item.name ?? item.label ?? item.number ?? item.ID ?? item.id
    if (title !== undefined) return compactText(String(title))
  }
  return summarizeEntityValue(value)
}

function compactText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}
