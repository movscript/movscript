import { useEffect, useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Node, Edge } from '@xyflow/react'
import { api } from '@/lib/api'
import type { Canvas, CanvasNodeData, CanvasParamType, NodeType, RawResource, PublicModel } from '@/types'
import { Upload, Wand2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface Props {
  nodeId: string
  canvasId: number
  nodeType: NodeType
  data: CanvasNodeData
  label: string
  allNodes: Node[]
  edges: Edge[]
  onUpdate: (nodeId: string, data: Partial<CanvasNodeData & { label: string }>) => void
  onRun: (nodeId: string) => void
  allowRun?: boolean
}

// ── @mention prompt textarea ──────────────────────────────────────────────────

function PromptTextarea({
  value,
  onChange,
  placeholder,
  upstreamNodes,
  rows = 4,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  upstreamNodes: Array<{ id: string; label: string }>
  rows?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [mention, setMention] = useState<{ filter: string; atPos: number } | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    onChange(val)
    const cursor = e.target.selectionStart ?? val.length
    const textBefore = val.slice(0, cursor)
    const lastAt = textBefore.lastIndexOf('@')
    if (lastAt >= 0) {
      const fragment = textBefore.slice(lastAt + 1)
      if (!fragment.includes(' ') && !fragment.includes('\n')) {
        setMention({ filter: fragment.toLowerCase(), atPos: lastAt })
        return
      }
    }
    setMention(null)
  }

  function insertMention(label: string) {
    if (!mention) return
    const cursor = ref.current?.selectionStart ?? value.length
    const newValue = value.slice(0, mention.atPos) + `@${label}` + value.slice(cursor)
    onChange(newValue)
    setMention(null)
    ref.current?.focus()
  }

  const filtered = mention
    ? upstreamNodes.filter((n) => n.label.toLowerCase().includes(mention.filter))
    : []

  return (
    <div className="relative">
      <textarea
        ref={ref}
        className="w-full border border-border rounded px-2 py-1.5 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring bg-background text-foreground"
        rows={rows}
        placeholder={placeholder ?? '描述你想生成的内容… 输入 @ 引用上游节点'}
        value={value}
        onChange={handleChange}
        onBlur={() => setTimeout(() => setMention(null), 150)}
      />
      {mention && filtered.length > 0 && (
        <div className="absolute left-0 right-0 bottom-full mb-1 bg-popover border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto z-20">
          {filtered.map((n) => (
            <button
              key={n.id}
              onMouseDown={(e) => { e.preventDefault(); insertMention(n.label) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 flex items-center gap-1.5"
            >
              <span className="text-muted-foreground font-medium">@</span>
              <span className="text-foreground">{n.label}</span>
            </button>
          ))}
        </div>
      )}
      {mention && filtered.length === 0 && upstreamNodes.length === 0 && (
        <div className="absolute left-0 right-0 bottom-full mb-1 bg-popover border border-border rounded-lg shadow-sm px-3 py-2 text-xs text-muted-foreground z-20">
          暂无上游连接节点
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function NodePanel({ nodeId, canvasId, nodeType, data, label, allNodes, edges, onUpdate, onRun, allowRun = true }: Props) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState<'upload' | 'ai' | 'manual'>(data.source ?? 'upload')

  useEffect(() => {
    setSource(data.source ?? 'upload')
  }, [data.source, nodeId])

  const capability = (['text', 'text_gen'].includes(nodeType)) ? 'text'
    : (['image', 'ref_image_gen', 'multi_angle', 'style_transfer'].includes(nodeType)) ? 'image'
    : (['video', 'ref_video_gen', 'motion_imitation'].includes(nodeType)) ? 'video'
    : null

  const featureKey = (['text', 'text_gen'].includes(nodeType)) ? 'canvas_text'
    : (['image', 'ref_image_gen', 'multi_angle', 'style_transfer'].includes(nodeType)) ? 'canvas_image'
    : (['video', 'ref_video_gen', 'motion_imitation'].includes(nodeType)) ? 'canvas_video'
    : undefined

  const modelsUrl = featureKey && capability
    ? `/models?capability=${capability}&feature=${featureKey}`
    : capability ? `/models?capability=${capability}` : null

  const { data: models = [] } = useQuery<PublicModel[]>({
    queryKey: ['models', capability, featureKey],
    queryFn: () => modelsUrl ? api.get(modelsUrl).then((r) => r.data) : Promise.resolve([]),
    enabled: !!capability,
  })

  const { data: resources = [] } = useQuery<RawResource[]>({
    queryKey: ['resources'],
    queryFn: () => api.get('/resources', { params: { page: 1, page_size: 200 } }).then((r) => r.data.items ?? r.data)
  })

  const { data: workflowCanvases = [] } = useQuery<Canvas[]>({
    queryKey: ['workflow-canvases'],
    queryFn: () => api.get('/canvases', { params: { type: 'workflow' } }).then((r) => r.data),
    enabled: nodeType === 'canvas',
    select: (items) => items.filter((canvas) => canvas.canvas_type === 'workflow' && canvas.ID !== canvasId),
  })

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post('/resources/upload', fd).then((r) => r.data as RawResource)
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['resources'] })
      onUpdate(nodeId, { source: 'upload', resourceId: r.ID, resource: r, status: 'done' })
    }
  })


  const status = data.status ?? 'idle'
  const isRunning = status === 'running' || status === 'pending'

  // Upstream nodes for @mention
  const upstreamNodes = edges
    .filter((e) => e.target === nodeId)
    .map((e) => allNodes.find((n) => n.id === e.source))
    .filter(Boolean)
    .map((n) => ({ id: n!.id, label: (n!.data as any).label || n!.type || n!.id }))

  // ── Special node types ─────────────────────────────────────────────────────

  if (nodeType === 'input') {
    return (
      <div className="w-full bg-background h-full overflow-y-auto p-4 space-y-4 text-sm">
        <LabelField label={label} onUpdate={(v) => onUpdate(nodeId, { label: v } as any)} />
        <ParamFields
          name={data.paramName ?? 'input'}
          type={data.paramType ?? 'text'}
          onUpdate={(patch) => onUpdate(nodeId, patch)}
        />
        <div>
          <p className="text-xs text-muted-foreground mb-1">输入内容</p>
          <Textarea
            rows={6}
            placeholder="工作流运行时会弹窗填写，也可在此预设默认值…"
            value={data.inputValue ?? ''}
            onChange={(e) => onUpdate(nodeId, { inputValue: e.target.value, source: 'manual' })}
          />
        </div>
        <p className="text-xs text-muted-foreground bg-muted rounded px-2 py-1.5">
          此节点是工作流的入口，运行时弹窗要求填写内容。
        </p>
      </div>
    )
  }

  if (nodeType === 'output') {
    return (
      <div className="w-full bg-background h-full overflow-y-auto p-4 space-y-4 text-sm">
        <LabelField label={label} onUpdate={(v) => onUpdate(nodeId, { label: v } as any)} />
        <ParamFields
          name={data.paramName ?? 'output'}
          type={data.paramType ?? 'resource'}
          onUpdate={(patch) => onUpdate(nodeId, patch)}
        />
        <p className="text-xs text-muted-foreground bg-muted rounded px-2 py-1.5">
          此节点是工作流的出口，连接上游节点后，运行结果将展示在此处。
        </p>
        {data.resource && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">当前输出</p>
            <p className="text-xs text-foreground">{data.resource.name}</p>
          </div>
        )}
      </div>
    )
  }

  if (nodeType === 'approval') {
    const approvalStatus = data.approvalStatus ?? 'waiting'
    return (
      <div className="w-full bg-background h-full overflow-y-auto p-4 space-y-4 text-sm">
        <LabelField label={label} onUpdate={(v) => onUpdate(nodeId, { label: v } as any)} />
        <p className="text-xs text-muted-foreground bg-muted rounded px-2 py-1.5">
          工作流运行到此节点时暂停，等待人工确认后继续。
        </p>
        <div>
          <p className="text-xs text-muted-foreground mb-2">当前状态</p>
          {approvalStatus === 'waiting' && (
            <div className="flex gap-2">
              <button
                onClick={() => onUpdate(nodeId, { approvalStatus: 'approved' })}
                className="flex-1 flex items-center justify-center gap-1 bg-foreground text-background rounded py-2 text-xs hover:bg-foreground/90 transition-colors"
              >
                <Check size={12} /> 通过
              </button>
              <button
                onClick={() => onUpdate(nodeId, { approvalStatus: 'rejected' })}
                className="flex-1 flex items-center justify-center gap-1 bg-destructive text-destructive-foreground rounded py-2 text-xs hover:bg-destructive/90 transition-colors"
              >
                <X size={12} /> 拒绝
              </button>
            </div>
          )}
          {approvalStatus === 'approved' && (
            <div className="space-y-2">
              <p className="text-foreground text-xs">✓ 已通过</p>
              <button
                onClick={() => onUpdate(nodeId, { approvalStatus: 'waiting' })}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                重置为等待
              </button>
            </div>
          )}
          {approvalStatus === 'rejected' && (
            <div className="space-y-2">
              <p className="text-destructive text-xs">✗ 已拒绝</p>
              <button
                onClick={() => onUpdate(nodeId, { approvalStatus: 'waiting' })}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                重置为等待
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (nodeType === 'text_gen') {
    return (
      <div className="w-full bg-background h-full overflow-y-auto p-4 space-y-4 text-sm">
        <LabelField label={label} onUpdate={(v) => onUpdate(nodeId, { label: v } as any)} />
        <AIConfigSection
          data={data}
          models={models}
          upstreamNodes={upstreamNodes}
          onUpdate={(patch) => onUpdate(nodeId, patch)}
        />
        {data.error && <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">{data.error}</p>}
        {allowRun && (
          <Button
            onClick={() => onRun(nodeId)}
            disabled={isRunning || !data.prompt}
            className="w-full"
            size="sm"
          >
            <Wand2 size={12} />
            {isRunning ? '生成中…' : '生成文本'}
          </Button>
        )}
      </div>
    )
  }

  if (nodeType === 'canvas') {
    return (
      <div className="w-full bg-background h-full overflow-y-auto p-4 space-y-4 text-sm">
        <LabelField label={label} onUpdate={(v) => onUpdate(nodeId, { label: v } as any)} />
        <div>
          <p className="text-xs text-muted-foreground mb-1">引用工作流</p>
          <select
            className="w-full border border-border bg-background rounded-md px-2 py-1.5 text-xs text-foreground"
            value={data.referencedCanvasId ?? ''}
            onChange={(e) => onUpdate({ referencedCanvasId: Number(e.target.value) || undefined, source: 'ai' })}
          >
            <option value="">选择可复用工作流…</option>
            {workflowCanvases.map((canvas) => (
              <option key={canvas.ID} value={canvas.ID}>{canvas.name}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-muted-foreground bg-muted rounded px-2 py-1.5">
          只能引用工作流画布。运行时会读取该工作流最近一次成功运行的输出资源。
        </p>
        {data.error && <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">{data.error}</p>}
        {allowRun && (
          <Button
            onClick={() => onRun(nodeId)}
            disabled={isRunning || !data.referencedCanvasId}
            className="w-full"
            size="sm"
          >
            <Wand2 size={12} />
            {isRunning ? '运行中…' : '读取引用输出'}
          </Button>
        )}
      </div>
    )
  }

  // ── Standard media / tool nodes ────────────────────────────────────────────

  const isToolNode = ['ref_image_gen', 'ref_video_gen', 'multi_angle', 'style_transfer', 'motion_imitation', 'canvas'].includes(nodeType)
  const sourceOptions: Array<'upload' | 'ai' | 'manual'> =
    nodeType === 'text' ? ['upload', 'ai', 'manual'] : ['upload', 'ai']

  return (
    <div className="w-full bg-background h-full overflow-y-auto p-4 space-y-4 text-sm">
      <LabelField label={label} onUpdate={(v) => onUpdate(nodeId, { label: v } as any)} />

      {!isToolNode && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">来源</p>
          <div className="flex gap-1">
            {sourceOptions.map((s) => (
              <button
                key={s}
                onClick={() => { setSource(s); onUpdate(nodeId, { source: s }) }}
                className={`flex-1 py-1.5 rounded border text-xs transition-colors ${
                  source === s ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:border-border/80'
                }`}
              >
                {s === 'upload' ? '上传' : s === 'ai' ? 'AI 生成' : '手写'}
              </button>
            ))}
          </div>
        </div>
      )}

      {(source === 'upload' && !isToolNode) && (
        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept={nodeType === 'image' ? 'image/*' : nodeType === 'video' ? 'video/*' : nodeType === 'audio' ? 'audio/*' : '*'}
            onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            className="w-full border border-dashed border-border rounded px-3 py-3 text-xs text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
          >
            {upload.isPending ? '上传中…' : data.resource ? `已上传: ${data.resource.name}` : '点击选择文件'}
          </button>
          {resources.filter((r) => r.type === nodeType).length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">或从资源库选择</p>
              <select
                className="w-full border border-border bg-background rounded-md px-2 py-1.5 text-xs text-foreground"
                value={data.resourceId ?? ''}
                onChange={(e) => {
                  const r = resources.find((r) => r.ID === Number(e.target.value))
                  if (r) onUpdate(nodeId, { source: 'upload', resourceId: r.ID, resource: r, status: 'done' })
                }}
              >
                <option value="">选择资源…</option>
                {resources.filter((r) => r.type === nodeType).map((r) => (
                  <option key={r.ID} value={r.ID}>{r.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {source === 'manual' && nodeType === 'text' && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">文本内容</p>
          <Textarea
            rows={8}
            placeholder="在此输入文本内容…"
            value={data.textContent ?? ''}
            onChange={(e) => onUpdate(nodeId, { textContent: e.target.value, source: 'manual' })}
          />
        </div>
      )}

      {(source === 'ai' || isToolNode) && (
        <>
          <AIConfigSection
            data={data}
            models={models}
            upstreamNodes={upstreamNodes}
            onUpdate={(patch) => onUpdate(nodeId, patch)}
          />
          {data.error && <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">{data.error}</p>}
          {allowRun && (
            <Button
              onClick={() => onRun(nodeId)}
              disabled={isRunning || (!isToolNode && !data.prompt)}
              className="w-full"
              size="sm"
            >
              <Wand2 size={12} />
              {isRunning ? '生成中…' : '运行节点'}
            </Button>
          )}
        </>
      )}
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function LabelField({ label, onUpdate }: { label: string; onUpdate: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground mb-1">标签</Label>
      <Input
        value={label}
        onChange={(e) => onUpdate(e.target.value)}
        className="text-sm"
      />
    </div>
  )
}

const PARAM_TYPE_OPTIONS: Array<{ value: CanvasParamType; label: string }> = [
  { value: 'text', label: '文本' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
  { value: 'json', label: 'JSON' },
  { value: 'number', label: '数字' },
  { value: 'boolean', label: '布尔' },
  { value: 'resource', label: '资源' },
]

function ParamFields({
  name,
  type,
  onUpdate,
}: {
  name: string
  type: CanvasParamType
  onUpdate: (patch: Partial<CanvasNodeData>) => void
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2">
      <div>
        <Label className="text-xs text-muted-foreground mb-1">参数名</Label>
        <Input
          value={name}
          onChange={(e) => onUpdate({ paramName: e.target.value })}
          className="text-sm"
          placeholder="例如 prompt"
        />
      </div>
      <div className="w-28">
        <Label className="text-xs text-muted-foreground mb-1">参数类型</Label>
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
          value={type}
          onChange={(e) => onUpdate({ paramType: e.target.value as CanvasParamType })}
        >
          {PARAM_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

function AIConfigSection({
  data,
  models,
  upstreamNodes,
  onUpdate,
}: {
  data: CanvasNodeData
  models: PublicModel[]
  upstreamNodes: Array<{ id: string; label: string }>
  onUpdate: (patch: Partial<CanvasNodeData>) => void
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-muted-foreground mb-1">模型</p>
        <select
          className="w-full border border-border bg-background rounded-md px-2 py-1.5 text-xs text-foreground"
          value={data.modelDbId ?? models[0]?.id ?? ''}
          onChange={(e) => onUpdate({ modelDbId: Number(e.target.value) })}
        >
          {models.length === 0 && <option value="">暂无可用模型</option>}
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.display_name}</option>
          ))}
        </select>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">提示词</p>
        <PromptTextarea
          value={data.prompt ?? ''}
          onChange={(v) => onUpdate({ prompt: v })}
          upstreamNodes={upstreamNodes}
        />
      </div>
    </div>
  )
}
