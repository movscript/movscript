import { Handle, Position, NodeResizer, useStore, useNodeId } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import type { CanvasNodeData } from '@/types'
import {
  FileText, Loader2, CheckCircle2, XCircle, Play,
  LogIn, LogOut, UserCheck, Sparkles, Check, X, Share2,
  Image, Video, Music, ChevronDown, Brush, Camera, Layers3,
  Palette, PersonStanding, RotateCw, Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { AuthedImage, AuthedVideo, AuthedAudio } from '@/components/shared/AuthedImage'
import { CanvasGenBody } from '@/components/shared/CanvasGenBody'
import { ToolNodeFullCard } from '@/components/shared/ToolNodeFullCard'

const API_BASE = 'http://localhost:8765'

type CardMode = 'compact' | 'detail' | 'full'

const MODES: CardMode[] = ['compact', 'detail', 'full']

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

type NodeDataWithHandlers = CanvasNodeData & {
  label: string
  cardMode?: CardMode
  onRun?: () => void
  onUpdateContent?: (content: string) => void
  onUpdatePrompt?: (prompt: string) => void
  onUpdateOutputType?: (type: 'image' | 'video' | 'text' | 'audio') => void
  onUpdateModelId?: (id: number) => void
  onUpdateAttachments?: (ids: number[]) => void
  onApprove?: () => void
  onReject?: () => void
  onPush?: () => void
  onCycleMode?: () => void
}

// ── Hook: read node width from ReactFlow store ─────────────────────────────────

function useNodeWidth(): number | undefined {
  const nodeId = useNodeId()
  return useStore((s) => {
    if (!nodeId) return undefined
    const node = s.nodeLookup.get(nodeId)
    return node?.measured?.width
  })
}

// Determine effective cardMode based on measured width (auto-override when narrow)
function effectiveMode(declared: CardMode, measuredWidth?: number): CardMode {
  if (measuredWidth !== undefined && measuredWidth < 100) return 'compact'
  return declared
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

// Mode cycle button — shown in node header to prevent accidental mode switches on click
function ModeCycleBtn({ mode, onCycle }: { mode: CardMode; onCycle?: () => void }) {
  const label = mode === 'compact' ? '紧凑' : mode === 'detail' ? '详情' : '完整'
  return (
    <button
      title={`切换显示模式（当前: ${label}）`}
      className="nodrag shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-[10px] font-medium"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onCycle?.() }}
    >
      {label}
      <ChevronDown size={10} className={cn('transition-transform', mode === 'full' ? 'rotate-180' : '')} />
    </button>
  )
}

function NodeHeader({ icon, label, status, actions, accent, mode, onCycleMode, hideLabel }: {
  icon: React.ReactNode
  label: string
  status?: string
  actions?: React.ReactNode
  accent?: string
  mode?: CardMode
  onCycleMode?: () => void
  hideLabel?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-2 px-3 py-2 rounded-t-lg border-b border-border', accent ?? 'bg-muted/60')}>
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      {!hideLabel && <span className="font-medium truncate flex-1 text-foreground">{label}</span>}
      {hideLabel && <span className="flex-1" />}
      {status && <StatusPip status={status} />}
      {actions}
      {mode && onCycleMode && <ModeCycleBtn mode={mode} onCycle={onCycleMode} />}
    </div>
  )
}

function StatusPip({ status }: { status: string }) {
  if (status === 'running' || status === 'pending') return <Loader2 size={11} className="animate-spin text-amber-500 shrink-0" />
  if (status === 'done') return <CheckCircle2 size={11} className="text-emerald-500 shrink-0" />
  if (status === 'failed') return <XCircle size={11} className="text-destructive shrink-0" />
  return null
}

const PARAM_TYPE_LABELS: Record<string, string> = {
  text: '文本',
  image: '图片',
  video: '视频',
  audio: '音频',
  json: 'JSON',
  number: '数字',
  boolean: '布尔',
  resource: '资源',
}

function ParamMeta({ name, type }: { name?: string; type?: string }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0 text-[10px] text-muted-foreground">
      <span className="truncate font-medium text-foreground">{name || 'param'}</span>
      <span className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 leading-none">
        {PARAM_TYPE_LABELS[type || ''] ?? type ?? '未设置'}
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
  return (
    <button onClick={onClick} title="推送到实体"
      className="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
      <Share2 size={11} />
    </button>
  )
}

// ── Media nodes ────────────────────────────────────────────────────────────────

export function TextNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const status = data.status ?? 'idle'
  const measuredWidth = useNodeWidth()
  const declaredMode: CardMode = data.cardMode ?? 'detail'
  const mode = effectiveMode(declaredMode, measuredWidth)
  const hideLabel = measuredWidth !== undefined && measuredWidth < 100
  return (
    <NodeCard selected={selected}>
      <Handle type="target" position={Position.Left} style={targetHandleStyle} />
      <NodeHeader
        icon={<FileText size={12} />}
        label={data.label || '文本'}
        status={status}
        hideLabel={hideLabel}
        mode={declaredMode}
        onCycleMode={data.onCycleMode}
        actions={mode !== 'compact' && data.source === 'ai' && status === 'idle' ? <RunBtn onClick={data.onRun} /> : undefined}
      />
      {mode !== 'compact' && (
        data.source === 'manual' ? (
          <textarea
            className="flex-1 w-full px-3 py-2 text-xs resize-none focus:outline-none bg-transparent nodrag nowheel text-foreground placeholder:text-muted-foreground/50 rounded-b-xl min-h-[60px]"
            placeholder="在此输入文本…"
            value={data.textContent ?? ''}
            onChange={e => data.onUpdateContent?.(e.target.value)}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <div className="flex-1 px-3 py-2 rounded-b-xl overflow-auto">
            {data.prompt
              ? <span className="text-muted-foreground break-words">{data.prompt}</span>
              : <span className="italic text-muted-foreground/40">无内容</span>}
          </div>
        )
      )}
      <Handle type="source" position={Position.Right} style={sourceHandleStyle} />
    </NodeCard>
  )
}

export function ImageNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const status = data.status ?? 'idle'
  const measuredWidth = useNodeWidth()
  const declaredMode: CardMode = data.cardMode ?? 'detail'
  const mode = effectiveMode(declaredMode, measuredWidth)
  const hideLabel = measuredWidth !== undefined && measuredWidth < 100
  const imgUrl = data.resource?.url ? `${API_BASE}${data.resource.url}` : null
  return (
    <NodeCard selected={selected}>
      <Handle type="target" position={Position.Left} style={targetHandleStyle} />
      <NodeHeader
        icon={<Image size={12} />}
        label={data.label || '图片'}
        status={status}
        hideLabel={hideLabel}
        mode={declaredMode}
        onCycleMode={data.onCycleMode}
        actions={mode !== 'compact' ? <>
          {data.source === 'ai' && status === 'idle' && <RunBtn onClick={data.onRun} />}
          {status === 'done' && data.onPush && <PushBtn onClick={data.onPush} />}
        </> : undefined}
      />
      {mode !== 'compact' && (
        <div className="flex-1 bg-muted/30 flex items-center justify-center min-h-[80px] overflow-hidden rounded-b-xl">
          {imgUrl
            ? <AuthedImage src={imgUrl} alt="" className="w-full h-full object-cover" />
            : <Image size={24} className="text-muted-foreground/20" />}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={sourceHandleStyle} />
    </NodeCard>
  )
}

export function VideoNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const status = data.status ?? 'idle'
  const measuredWidth = useNodeWidth()
  const declaredMode: CardMode = data.cardMode ?? 'detail'
  const mode = effectiveMode(declaredMode, measuredWidth)
  const hideLabel = measuredWidth !== undefined && measuredWidth < 100
  const videoUrl = data.resource?.url ? `${API_BASE}${data.resource.url}` : null
  return (
    <NodeCard selected={selected}>
      <Handle type="target" position={Position.Left} style={targetHandleStyle} />
      <NodeHeader
        icon={<Video size={12} />}
        label={data.label || '视频'}
        status={status}
        hideLabel={hideLabel}
        mode={declaredMode}
        onCycleMode={data.onCycleMode}
        actions={mode !== 'compact' ? <>
          {data.source === 'ai' && status === 'idle' && <RunBtn onClick={data.onRun} />}
          {status === 'done' && data.onPush && <PushBtn onClick={data.onPush} />}
        </> : undefined}
      />
      {mode !== 'compact' && (
        <div className="flex-1 bg-zinc-900 flex items-center justify-center min-h-[80px] overflow-hidden rounded-b-xl">
          {videoUrl
            ? <AuthedVideo src={videoUrl} className="w-full h-full object-cover" controls={mode === 'full'} />
            : <Video size={24} className="text-white/20" />}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={sourceHandleStyle} />
    </NodeCard>
  )
}

export function AudioNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const status = data.status ?? 'idle'
  const measuredWidth = useNodeWidth()
  const declaredMode: CardMode = data.cardMode ?? 'detail'
  const mode = effectiveMode(declaredMode, measuredWidth)
  const hideLabel = measuredWidth !== undefined && measuredWidth < 100
  const audioUrl = data.resource?.url ? `${API_BASE}${data.resource.url}` : null
  return (
    <NodeCard selected={selected}>
      <Handle type="target" position={Position.Left} style={targetHandleStyle} />
      <NodeHeader
        icon={<Music size={12} />}
        label={data.label || '音频'}
        status={status}
        hideLabel={hideLabel}
        mode={declaredMode}
        onCycleMode={data.onCycleMode}
        actions={mode !== 'compact' && data.source === 'ai' && status === 'idle' ? <RunBtn onClick={data.onRun} /> : undefined}
      />
      {mode !== 'compact' && (
        <div className="flex-1 px-3 py-3 rounded-b-xl flex items-center">
          {audioUrl
            ? <AuthedAudio src={audioUrl} controls className="w-full h-6" />
            : <span className="text-muted-foreground/40 italic">无音频</span>}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={sourceHandleStyle} />
    </NodeCard>
  )
}

// ── CanvasCardBody — detail-mode body for ToolNode / AIGenNode ─────────────────

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
          <span className="italic text-muted-foreground/40 text-xs">无提示词</span>
        </div>
      )}
      <div className="flex-1 bg-card min-h-[48px]">
        {isRunning && (
          <div className="flex items-center justify-center py-6">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              <p className="text-xs">{status === 'pending' ? '等待开始…' : '生成中…'}</p>
            </div>
          </div>
        )}
        {!isRunning && status === 'failed' && (
          <div className="flex items-center justify-center gap-2 text-destructive py-4">
            <XCircle size={12} />
            <p className="text-xs">{error ?? '生成失败'}</p>
          </div>
        )}
        {!isRunning && status === 'done' && outputUrl && (
          <div className="w-full h-full">
            {outputType === 'image'
              ? (outputResource?.direct_url
                ? <img src={outputResource.direct_url} alt="生成结果" className="w-full h-full object-cover" />
                : <AuthedImage src={`${API_BASE_CANVAS}${outputResource?.url}`} alt="生成结果" className="w-full h-full object-cover" />)
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

// ── Tool nodes ─────────────────────────────────────────────────────────────────

const TOOL_META: Record<string, { icon: React.ReactNode; label: string; outputType: 'image' | 'video'; capability: 'image' | 'video'; featureKey: string; inputType: 'image' | 'video' | 'image+video' }> = {
  canvas:           { icon: <Layers3 size={12} />, label: '画布引用',   outputType: 'image', capability: 'image', featureKey: 'canvas_image', inputType: 'image' },
  ref_image_gen:    { icon: <Palette size={12} />, label: '参考生图',   outputType: 'image', capability: 'image', featureKey: 'canvas_image', inputType: 'image' },
  ref_video_gen:    { icon: <Camera size={12} />, label: '参考生视频', outputType: 'video', capability: 'video', featureKey: 'canvas_video', inputType: 'video' },
  multi_angle:      { icon: <RotateCw size={12} />, label: '图像多角度', outputType: 'image', capability: 'image', featureKey: 'canvas_image', inputType: 'image' },
  style_transfer:   { icon: <Brush size={12} />, label: '风格迁移',   outputType: 'image', capability: 'image', featureKey: 'canvas_image', inputType: 'image' },
  motion_imitation: { icon: <PersonStanding size={12} />, label: '动作模仿',   outputType: 'video', capability: 'video', featureKey: 'canvas_video', inputType: 'image+video' },
}

export function ToolNode({ data, selected, type }: NodeProps & { data: NodeDataWithHandlers; type: string }) {
  const status = (data.status ?? 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'failed'
  const measuredWidth = useNodeWidth()
  const declaredMode: CardMode = data.cardMode ?? 'detail'
  const mode = effectiveMode(declaredMode, measuredWidth)
  const hideLabel = measuredWidth !== undefined && measuredWidth < 100
  const meta = TOOL_META[type] ?? { icon: <Wrench size={12} />, label: type, outputType: 'image' as const, capability: 'image' as const, featureKey: 'canvas_image', inputType: 'image' as const }

  if (mode === 'full') {
    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <Handle type="target" position={Position.Left} style={targetHandleStyle} />
        <ToolNodeFullCard
          toolName={data.label || meta.label}
          capability={meta.capability}
          featureKey={meta.featureKey}
          inputType={meta.inputType}
          outputType={meta.outputType}
          prompt={data.prompt}
          onUpdatePrompt={data.onUpdatePrompt}
          modelDbId={data.modelDbId}
          onUpdateModelId={data.onUpdateModelId}
          status={status}
          resource={data.resource}
          error={data.error}
          onRun={data.onRun}
          onUpdateAttachments={data.onUpdateAttachments}
          className={selected ? 'border-primary ring-2 ring-primary/20 shadow-md' : ''}
          onCycleMode={data.onCycleMode}
          canvasId={data.canvasId}
          rfNodeId={data.rfNodeId}
        />
        <Handle type="source" position={Position.Right} style={sourceHandleStyle} />
      </div>
    )
  }

  return (
    <NodeCard selected={selected}>
      <Handle type="target" position={Position.Left} style={targetHandleStyle} />
      <NodeHeader
        icon={meta.icon}
        label={data.label || meta.label}
        status={status}
        hideLabel={hideLabel}
        mode={declaredMode}
        onCycleMode={data.onCycleMode}
        actions={mode !== 'compact' && status === 'idle' ? <RunBtn onClick={data.onRun} /> : undefined}
      />
      {mode === 'detail' && (
        <CanvasCardBody
          prompt={data.prompt}
          status={status}
          outputResource={data.resource}
          outputType={meta.outputType}
          error={data.error}
        />
      )}
      <Handle type="source" position={Position.Right} style={sourceHandleStyle} />
    </NodeCard>
  )
}

// ── Special nodes ──────────────────────────────────────────────────────────────

export function InputNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const declaredMode: CardMode = data.cardMode ?? 'detail'
  const measuredWidth = useNodeWidth()
  const mode = effectiveMode(declaredMode, measuredWidth)
  const hideLabel = measuredWidth !== undefined && measuredWidth < 100
  return (
    <NodeCard selected={selected}>
      <NodeHeader
        icon={<LogIn size={12} />}
        label={data.label || '输入'}
        hideLabel={hideLabel}
        mode={declaredMode}
        onCycleMode={data.onCycleMode}
        actions={!hideLabel ? <span className="text-[9px] text-muted-foreground shrink-0 font-medium">输入</span> : undefined}
      />
      {mode !== 'compact' && (
        <div className="flex-1 px-3 py-2 rounded-b-lg space-y-2">
          <ParamMeta name={data.paramName ?? 'input'} type={data.paramType ?? 'text'} />
          {data.inputValue
            ? <span className="text-foreground block break-words">{data.inputValue}</span>
            : <span className="italic text-muted-foreground/40">运行时填写</span>}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={sourceHandleStyle} />
    </NodeCard>
  )
}

export function OutputNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const status = data.status ?? 'idle'
  const declaredMode: CardMode = data.cardMode ?? 'detail'
  const measuredWidth = useNodeWidth()
  const mode = effectiveMode(declaredMode, measuredWidth)
  const hideLabel = measuredWidth !== undefined && measuredWidth < 100
  const hasOutput = !!data.resource || status === 'done'
  return (
    <NodeCard selected={selected}>
      <Handle type="target" position={Position.Left} style={targetHandleStyle} />
      <NodeHeader
        icon={<LogOut size={12} />}
        label={data.label || '输出'}
        hideLabel={hideLabel}
        mode={declaredMode}
        onCycleMode={data.onCycleMode}
        actions={!hideLabel ? <span className="text-[9px] text-muted-foreground shrink-0 font-medium">输出</span> : undefined}
      />
      {mode !== 'compact' && (
        <div className="flex-1 px-3 py-2 rounded-b-lg space-y-2">
          <ParamMeta name={data.paramName ?? 'output'} type={data.paramType ?? 'resource'} />
          <div className="flex items-center justify-between gap-2">
            {hasOutput
              ? <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 size={10} /> 已生成</span>
              : <span className="italic text-muted-foreground/40">等待上游结果</span>}
            {hasOutput && data.onPush && <PushBtn onClick={data.onPush} />}
          </div>
        </div>
      )}
    </NodeCard>
  )
}

export function ApprovalNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const approvalStatus = data.approvalStatus ?? 'waiting'
  const declaredMode: CardMode = data.cardMode ?? 'detail'
  const measuredWidth = useNodeWidth()
  const mode = effectiveMode(declaredMode, measuredWidth)
  const hideLabel = measuredWidth !== undefined && measuredWidth < 100
  return (
    <NodeCard selected={selected}>
      <Handle type="target" position={Position.Left} style={targetHandleStyle} />
      <NodeHeader
        icon={<UserCheck size={12} />}
        label={data.label || '人工确认'}
        accent="bg-amber-50 dark:bg-amber-950/30"
        hideLabel={hideLabel}
        mode={declaredMode}
        onCycleMode={data.onCycleMode}
        actions={!hideLabel && approvalStatus === 'waiting' ? <span className="text-[9px] text-amber-600 shrink-0">等待</span> : undefined}
      />
      {mode !== 'compact' && (
        <div className="flex-1 px-3 py-2 rounded-b-xl">
          {approvalStatus === 'approved' && <span className="text-emerald-600 flex items-center gap-1"><Check size={10} /> 已通过</span>}
          {approvalStatus === 'rejected' && <span className="text-destructive flex items-center gap-1"><X size={10} /> 已拒绝</span>}
          {approvalStatus === 'waiting' && (
            <div className="flex gap-1.5 mt-0.5">
              <button onMouseDown={e => { e.stopPropagation(); data.onApprove?.() }}
                className="flex-1 flex items-center justify-center gap-0.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg py-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-[10px] transition-colors">
                <Check size={9} /> 通过
              </button>
              <button onMouseDown={e => { e.stopPropagation(); data.onReject?.() }}
                className="flex-1 flex items-center justify-center gap-0.5 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-lg py-1.5 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-[10px] transition-colors">
                <X size={9} /> 拒绝
              </button>
            </div>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={sourceHandleStyle} />
    </NodeCard>
  )
}

export function TextGenNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const status = data.status ?? 'idle'
  const declaredMode: CardMode = data.cardMode ?? 'detail'
  const measuredWidth = useNodeWidth()
  const mode = effectiveMode(declaredMode, measuredWidth)
  const hideLabel = measuredWidth !== undefined && measuredWidth < 100
  return (
    <NodeCard selected={selected}>
      <Handle type="target" position={Position.Left} style={targetHandleStyle} />
      <NodeHeader
        icon={<Sparkles size={12} />}
        label={data.label || 'AI 文本生成'}
        status={status}
        accent="bg-violet-50 dark:bg-violet-950/30"
        hideLabel={hideLabel}
        mode={declaredMode}
        onCycleMode={data.onCycleMode}
        actions={mode !== 'compact' && status === 'idle' ? <RunBtn onClick={data.onRun} /> : undefined}
      />
      {mode === 'detail' && (
        <div className="flex-1 px-3 py-2 rounded-b-xl overflow-auto">
          {data.prompt
            ? <span className="text-muted-foreground break-words">{data.prompt}</span>
            : <span className="italic text-muted-foreground/40">无提示词</span>}
        </div>
      )}
      {mode === 'full' && (
        <CanvasGenBody
          prompt={data.prompt}
          onUpdatePrompt={data.onUpdatePrompt}
          modelDbId={data.modelDbId}
          onUpdateModelId={data.onUpdateModelId}
          capability="text"
          featureKey="canvas_text"
          outputType="text"
          status={status}
          resource={data.resource}
          error={data.error}
          onRun={data.onRun}
          textContent={data.textContent}
        />
      )}
      <Handle type="source" position={Position.Right} style={sourceHandleStyle} />
    </NodeCard>
  )
}

// ── AI Gen node ────────────────────────────────────────────────────────────────

const OUTPUT_TYPES: Array<{ value: 'image' | 'video' | 'text' | 'audio'; icon: React.ReactNode; label: string }> = [
  { value: 'image', icon: <Image size={10} />, label: '图' },
  { value: 'video', icon: <Video size={10} />, label: '视频' },
  { value: 'text',  icon: <FileText size={10} />, label: '文' },
  { value: 'audio', icon: <Music size={10} />, label: '音' },
]

export function AIGenNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const status = (data.status ?? 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'failed'
  const outputType = (data.outputType ?? 'image') as 'image' | 'video'
  const declaredMode: CardMode = data.cardMode ?? 'detail'
  const measuredWidth = useNodeWidth()
  const mode = effectiveMode(declaredMode, measuredWidth)
  const hideLabel = measuredWidth !== undefined && measuredWidth < 100

  const aiCapability = outputType === 'video' ? 'video' : 'image'
  const aiFeatureKey = outputType === 'video' ? 'canvas_video' : 'canvas_image'

  return (
    <NodeCard selected={selected}>
      <Handle type="target" position={Position.Left} style={targetHandleStyle} />
      <NodeHeader
        icon={<Sparkles size={12} />}
        label={data.label || 'AI 生成'}
        status={status}
        hideLabel={hideLabel}
        mode={declaredMode}
        onCycleMode={data.onCycleMode}
        actions={mode !== 'compact' ? <>
          {status === 'idle' && <RunBtn onClick={data.onRun} />}
          {status === 'done' && data.onPush && <PushBtn onClick={data.onPush} />}
        </> : undefined}
      />
      {mode !== 'compact' && (
        <div className="flex gap-1 px-3 py-2 border-b border-border/50">
          {OUTPUT_TYPES.map(t => (
            <button key={t.value}
              onClick={e => { e.stopPropagation(); data.onUpdateOutputType?.(t.value) }}
              className={cn(
                'flex-1 flex items-center justify-center gap-0.5 py-1 rounded-md text-[10px] border transition-colors',
                outputType === t.value
                  ? 'bg-violet-100 dark:bg-violet-900/40 border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300'
                  : 'border-border text-muted-foreground hover:bg-muted/50'
              )}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      )}
      {mode === 'detail' && (
        <CanvasCardBody
          prompt={data.prompt}
          status={status}
          outputResource={data.resource}
          outputType={outputType}
          error={data.error}
        />
      )}
      {mode === 'full' && (
        <CanvasGenBody
          prompt={data.prompt}
          onUpdatePrompt={data.onUpdatePrompt}
          modelDbId={data.modelDbId}
          onUpdateModelId={data.onUpdateModelId}
          capability={aiCapability}
          featureKey={aiFeatureKey}
          outputType={outputType}
          status={status}
          resource={data.resource}
          error={data.error}
          onRun={data.onRun}
          textContent={data.textContent}
        />
      )}
      <Handle type="source" position={Position.Right} style={sourceHandleStyle} />
    </NodeCard>
  )
}

// ── Group node ─────────────────────────────────────────────────────────────────

export function GroupNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
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
        <span className="text-xs font-medium text-muted-foreground">{data.groupLabel || data.label || '分组'}</span>
      </div>
    </div>
  )
}
