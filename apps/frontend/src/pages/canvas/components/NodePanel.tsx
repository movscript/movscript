import { useEffect, useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Node, Edge } from '@xyflow/react'
import { api } from '@/lib/api'
import { publicModelId, publicModelLabel } from '@/lib/modelDisplay'
import { loadClientPlugins, type ClientPluginInputProperty, type ClientPluginManifest } from '@/lib/clientPlugins'
import type { Canvas, CanvasNodeData, CanvasParamType, CanvasPortDef, NodeType, RawResource, PublicModel } from '@/types'
import { Wand2, Check, X, Loader2 } from 'lucide-react'
import { Button } from '@movscript/ui'
import { Input } from '@movscript/ui'
import { Textarea } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { useTranslation } from 'react-i18next'
import { IMAGE_UPLOAD_ACCEPT } from '@/lib/mediaTypes'

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

function readOnlyMediaPortPatch(source: CanvasNodeData['source']): Partial<CanvasNodeData> {
  return source === 'ai' ? { inputPorts: undefined } : { inputPorts: [] }
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
  const { t } = useTranslation()
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
        className="w-full border border-border rounded px-2 py-1.5 type-label resize-none focus:outline-none focus:ring-1 focus:ring-ring bg-background text-foreground"
        rows={rows}
        placeholder={placeholder ?? t('canvas.nodePanel.promptPlaceholder')}
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
              className="w-full text-left px-3 py-1.5 type-label hover:bg-muted/50 flex items-center gap-1.5"
            >
              <span className="text-muted-foreground font-medium">@</span>
              <span className="text-foreground">{n.label}</span>
            </button>
          ))}
        </div>
      )}
      {mention && filtered.length === 0 && upstreamNodes.length === 0 && (
        <div className="absolute left-0 right-0 bottom-full mb-1 bg-popover border border-border rounded-lg shadow-sm px-3 py-2 type-label text-muted-foreground z-20">
          {t('canvas.nodePanel.noUpstreamNodes')}
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function NodePanel({ nodeId, canvasId, nodeType, data, label, allNodes, edges, onUpdate, onRun, allowRun = true }: Props) {
  const { t } = useTranslation()
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

  const selectedReferencedCanvasId = nodeType === 'canvas' && data.referencedCanvasId ? data.referencedCanvasId : undefined
  const { data: referencedCanvas } = useQuery<Canvas>({
    queryKey: ['canvas', selectedReferencedCanvasId],
    queryFn: () => api.get(`/canvases/${selectedReferencedCanvasId}`).then((r) => r.data),
    enabled: !!selectedReferencedCanvasId,
  })

  const { data: clientPlugins = [] } = useQuery<ClientPluginManifest[]>({
    queryKey: ['client-plugins'],
    queryFn: loadClientPlugins,
    enabled: nodeType === 'plugin_card',
  })

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post('/resources/upload', fd).then((r) => r.data as RawResource)
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['resources'] })
      onUpdate(nodeId, { ...readOnlyMediaPortPatch('upload'), source: 'upload', resourceId: r.ID, resource: r, status: 'done' })
    }
  })


  const status = data.status ?? 'idle'
  const isRunning = status === 'running' || status === 'pending'

  useEffect(() => {
    if (nodeType !== 'canvas' || !referencedCanvas) return
    const nextPorts = deriveCanvasReferencePorts(referencedCanvas)
    const currentSig = JSON.stringify({ inputs: data.inputPorts ?? [], outputs: data.outputPorts ?? [] })
    const nextSig = JSON.stringify(nextPorts)
    if (currentSig !== nextSig) {
      onUpdate(nodeId, {
        inputPorts: nextPorts.inputs,
        outputPorts: nextPorts.outputs,
      })
    }
  }, [data.inputPorts, data.outputPorts, nodeId, nodeType, onUpdate, referencedCanvas])

  // Upstream nodes for @mention
  const upstreamNodes = edges
    .filter((e) => e.target === nodeId)
    .map((e) => allNodes.find((n) => n.id === e.source))
    .filter(Boolean)
    .map((n) => ({ id: n!.id, label: (n!.data as any).label || n!.type || n!.id }))

  // ── Special node types ─────────────────────────────────────────────────────

  if (nodeType === 'input') {
    return (
      <div className="w-full bg-background h-full overflow-y-auto p-4 space-y-4 type-body">
        <LabelField label={label} onUpdate={(v) => onUpdate(nodeId, { label: v } as any)} />
        <ParamFields
          name={data.paramName ?? 'input'}
          type={data.paramType ?? 'text'}
          onUpdate={(patch) => onUpdate(nodeId, patch)}
        />
        <div>
          <p className="type-label text-muted-foreground mb-1">{t('canvas.nodePanel.inputContent')}</p>
          <Textarea
            rows={6}
            placeholder={t('canvas.nodePanel.inputDefaultPlaceholder')}
            value={data.inputValue ?? ''}
            onChange={(e) => onUpdate(nodeId, { inputValue: e.target.value, source: 'manual' })}
          />
        </div>
        <p className="type-label text-muted-foreground bg-muted rounded px-2 py-1.5">
          {t('canvas.nodePanel.inputHint')}
        </p>
      </div>
    )
  }

  if (nodeType === 'output') {
    return (
      <div className="w-full bg-background h-full overflow-y-auto p-4 space-y-4 type-body">
        <LabelField label={label} onUpdate={(v) => onUpdate(nodeId, { label: v } as any)} />
        <ParamFields
          name={data.paramName ?? 'output'}
          type={data.paramType ?? 'resource'}
          onUpdate={(patch) => onUpdate(nodeId, patch)}
        />
        <p className="type-label text-muted-foreground bg-muted rounded px-2 py-1.5">
          {t('canvas.nodePanel.outputHint')}
        </p>
      </div>
    )
  }

  if (nodeType === 'resource_sink') {
    return (
      <div className="w-full bg-background h-full overflow-y-auto p-4 space-y-4 type-body">
        <LabelField label={label} onUpdate={(v) => onUpdate(nodeId, { label: v } as any)} />
        <FileNameField
          value={data.paramName ?? ''}
          onUpdate={(value) => onUpdate(nodeId, { paramName: value, paramType: undefined })}
        />
        <p className="type-label text-muted-foreground bg-muted rounded px-2 py-1.5">
          {t('canvas.nodePanel.resourceSinkHint')}
        </p>
        {data.resource && (
          <div>
            <p className="type-label text-muted-foreground mb-1">{t('canvas.nodePanel.currentOutput')}</p>
            <p className="type-label text-foreground">{data.resource.name}</p>
          </div>
        )}
        {data.error && <p className="type-label text-destructive bg-destructive/10 rounded px-2 py-1">{data.error}</p>}
        {allowRun && (
          <Button
            onClick={() => onRun(nodeId)}
            disabled={isRunning}
            className="w-full"
            size="sm"
          >
            <Wand2 size={12} />
            {isRunning ? t('canvas.running') : t('canvas.nodePanel.saveResource')}
          </Button>
        )}
      </div>
    )
  }

  if (nodeType === 'approval') {
    const approvalStatus = data.approvalStatus ?? 'waiting'
    return (
      <div className="w-full bg-background h-full overflow-y-auto p-4 space-y-4 type-body">
        <LabelField label={label} onUpdate={(v) => onUpdate(nodeId, { label: v } as any)} />
        <p className="type-label text-muted-foreground bg-muted rounded px-2 py-1.5">
          {t('canvas.nodePanel.approvalHint')}
        </p>
        <div>
          <p className="type-label text-muted-foreground mb-2">{t('canvas.nodePanel.currentStatus')}</p>
          {approvalStatus === 'waiting' && (
            <div className="flex gap-2">
              <button
                onClick={() => onUpdate(nodeId, { approvalStatus: 'approved' })}
                className="flex-1 flex items-center justify-center gap-1 bg-foreground text-background rounded py-2 type-label hover:bg-foreground/90 transition-colors"
              >
                <Check size={12} /> {t('canvas.approval.approve')}
              </button>
              <button
                onClick={() => onUpdate(nodeId, { approvalStatus: 'rejected' })}
                className="flex-1 flex items-center justify-center gap-1 bg-destructive text-destructive-foreground rounded py-2 type-label hover:bg-destructive/90 transition-colors"
              >
                <X size={12} /> {t('canvas.approval.reject')}
              </button>
            </div>
          )}
          {approvalStatus === 'approved' && (
            <div className="space-y-2">
              <p className="text-foreground type-label">{t('canvas.approval.approvedMark')}</p>
              <button
                onClick={() => onUpdate(nodeId, { approvalStatus: 'waiting' })}
                className="type-label text-muted-foreground hover:text-foreground underline"
              >
                {t('canvas.approval.resetWaiting')}
              </button>
            </div>
          )}
          {approvalStatus === 'rejected' && (
            <div className="space-y-2">
              <p className="text-destructive type-label">{t('canvas.approval.rejectedMark')}</p>
              <button
                onClick={() => onUpdate(nodeId, { approvalStatus: 'waiting' })}
                className="type-label text-muted-foreground hover:text-foreground underline"
              >
                {t('canvas.approval.resetWaiting')}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (nodeType === 'text_gen') {
    return (
      <div className="w-full bg-background h-full overflow-y-auto p-4 space-y-4 type-body">
        <LabelField label={label} onUpdate={(v) => onUpdate(nodeId, { label: v } as any)} />
        <AIConfigSection
          data={data}
          models={models}
          upstreamNodes={upstreamNodes}
          onUpdate={(patch) => onUpdate(nodeId, patch)}
        />
        {data.error && <p className="type-label text-destructive bg-destructive/10 rounded px-2 py-1">{data.error}</p>}
        {allowRun && (
          <Button
            onClick={() => onRun(nodeId)}
            disabled={isRunning || !data.prompt}
            className="w-full"
            size="sm"
          >
            <Wand2 size={12} />
            {isRunning ? t('canvas.generating') : t('canvas.nodePanel.generateText')}
          </Button>
        )}
      </div>
    )
  }

  if (nodeType === 'canvas') {
    return (
      <div className="w-full bg-background h-full overflow-y-auto p-4 space-y-4 type-body">
        <LabelField label={label} onUpdate={(v) => onUpdate(nodeId, { label: v } as any)} />
        <div>
          <p className="type-label text-muted-foreground mb-1">{t('canvas.nodePanel.referenceWorkflow')}</p>
          <select
            className="w-full border border-border bg-background rounded-md px-2 py-1.5 type-label text-foreground"
            value={data.referencedCanvasId ?? ''}
            onChange={(e) => {
              const referencedCanvasId = Number(e.target.value) || undefined
              onUpdate(nodeId, {
                referencedCanvasId,
                source: 'ai',
                inputPorts: [],
                outputPorts: [],
              })
            }}
          >
            <option value="">{t('canvas.nodePanel.selectWorkflow')}</option>
            {workflowCanvases.map((canvas) => (
              <option key={canvas.ID} value={canvas.ID}>{canvas.name}</option>
            ))}
          </select>
        </div>
        <p className="type-label text-muted-foreground bg-muted rounded px-2 py-1.5">
          {t('canvas.nodePanel.referenceWorkflowHint')}
        </p>
        {((data.inputPorts?.length ?? 0) > 0 || (data.outputPorts?.length ?? 0) > 0) && (
          <PortSummary inputPorts={data.inputPorts ?? []} outputPorts={data.outputPorts ?? []} />
        )}
        {data.error && <p className="type-label text-destructive bg-destructive/10 rounded px-2 py-1">{data.error}</p>}
        {allowRun && (
          <Button
            onClick={() => onRun(nodeId)}
            disabled={isRunning || !data.referencedCanvasId}
            className="w-full"
            size="sm"
          >
            <Wand2 size={12} />
            {isRunning ? t('canvas.running') : t('canvas.nodePanel.readReferenceOutput')}
          </Button>
        )}
      </div>
    )
  }

  if (nodeType === 'plugin_card') {
    const plugin = clientPlugins.find((item) => item.id === data.pluginId)
    return (
      <PluginCardPanel
        plugin={plugin}
        data={data}
        label={label}
        isRunning={isRunning}
        allowRun={allowRun}
        onUpdate={(patch) => onUpdate(nodeId, patch)}
        onRun={() => onRun(nodeId)}
      />
    )
  }

  // ── Standard media / tool nodes ────────────────────────────────────────────

  const isToolNode = ['ref_image_gen', 'ref_video_gen', 'multi_angle', 'style_transfer', 'motion_imitation', 'canvas'].includes(nodeType)
  const sourceOptions: Array<'upload' | 'ai' | 'manual'> =
    nodeType === 'text' ? ['upload', 'ai', 'manual'] : ['upload', 'ai']

  return (
    <div className="w-full bg-background h-full overflow-y-auto p-4 space-y-4 type-body">
      <LabelField label={label} onUpdate={(v) => onUpdate(nodeId, { label: v } as any)} />

      {!isToolNode && (
        <div>
          <p className="type-label text-muted-foreground mb-2">{t('canvas.nodePanel.source')}</p>
          <div className="flex gap-1">
            {sourceOptions.map((s) => (
              <button
                key={s}
                onClick={() => { setSource(s); onUpdate(nodeId, { ...readOnlyMediaPortPatch(s), source: s }) }}
                className={`flex-1 py-1.5 rounded border type-label transition-colors ${
                  source === s ? 'bg-foreground text-background border-foreground' : 'border-border text-muted-foreground hover:border-border/80'
                }`}
              >
                {t(`canvas.nodePanel.sources.${s}`)}
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
            accept={nodeType === 'image' ? IMAGE_UPLOAD_ACCEPT : nodeType === 'video' ? 'video/*' : '*'}
            onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            className="w-full border border-dashed border-border rounded px-3 py-3 type-label text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
          >
            {upload.isPending ? t('canvas.nodePanel.uploading') : data.resource ? t('canvas.nodePanel.uploaded', { name: data.resource.name }) : t('canvas.nodePanel.selectFile')}
          </button>
          {resources.filter((r) => r.type === nodeType).length > 0 && (
            <div>
              <p className="type-label text-muted-foreground mb-1">{t('canvas.nodePanel.selectFromResources')}</p>
              <select
                className="w-full border border-border bg-background rounded-md px-2 py-1.5 type-label text-foreground"
                value={data.resourceId ?? ''}
                onChange={(e) => {
                  const r = resources.find((r) => r.ID === Number(e.target.value))
                  if (r) onUpdate(nodeId, { ...readOnlyMediaPortPatch('upload'), source: 'upload', resourceId: r.ID, resource: r, status: 'done' })
                }}
              >
                <option value="">{t('canvas.nodePanel.selectResource')}</option>
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
          <p className="type-label text-muted-foreground mb-1">{t('canvas.nodePanel.textContent')}</p>
          <Textarea
            rows={8}
            placeholder={t('canvas.nodePanel.textContentPlaceholder')}
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
          {data.error && <p className="type-label text-destructive bg-destructive/10 rounded px-2 py-1">{data.error}</p>}
          {allowRun && (
            <Button
              onClick={() => onRun(nodeId)}
              disabled={isRunning || (!isToolNode && !data.prompt)}
              className="w-full"
              size="sm"
            >
              <Wand2 size={12} />
              {isRunning ? t('canvas.generating') : t('shared.generation.runNode')}
            </Button>
          )}
        </>
      )}
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function parseCanvasNodeData(raw?: string): CanvasNodeData {
  if (!raw) return { source: 'manual' }
  try {
    return JSON.parse(raw) as CanvasNodeData
  } catch {
    return { source: 'manual' }
  }
}

function normalizePortType(type?: CanvasParamType): CanvasPortDef['type'] {
  return type ?? 'resource'
}

export function deriveCanvasReferencePorts(canvas: Canvas): { inputs: CanvasPortDef[]; outputs: CanvasPortDef[] } {
  const inputNodes = (canvas.nodes ?? []).filter((node) => node.type === 'input')
  const outputNodes = (canvas.nodes ?? []).filter((node) => node.type === 'output')

  return {
    inputs: inputNodes.map((node) => {
      const nodeData = parseCanvasNodeData(node.data)
      return {
        id: node.node_id,
        label: nodeData.paramName || node.label || node.node_id,
        type: normalizePortType(nodeData.paramType ?? 'text'),
        required: true,
      }
    }),
    outputs: outputNodes.map((node) => {
      const nodeData = parseCanvasNodeData(node.data)
      return {
        id: node.node_id,
        label: nodeData.paramName || node.label || node.node_id,
        type: normalizePortType(nodeData.paramType),
      }
    }),
  }
}

function PortSummary({ inputPorts, outputPorts }: { inputPorts: CanvasPortDef[]; outputPorts: CanvasPortDef[] }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-md border border-border bg-muted/10 px-3 py-2 type-label">
      {inputPorts.length > 0 && (
        <div>
          <p className="mb-1 type-caption font-medium text-muted-foreground">{t('canvas.nodePanel.inputs', { defaultValue: 'Inputs' })}</p>
          <div className="flex flex-wrap gap-1.5">
            {inputPorts.map((port) => (
              <span key={port.id} className="rounded border border-border bg-background px-1.5 py-0.5 type-tiny text-muted-foreground">
                {port.labelKey ? t(port.labelKey, { defaultValue: port.label ?? port.id }) : (port.label ?? port.id)} · {port.type}
              </span>
            ))}
          </div>
        </div>
      )}
      {outputPorts.length > 0 && (
        <div className={inputPorts.length > 0 ? 'mt-2' : ''}>
          <p className="mb-1 type-caption font-medium text-muted-foreground">{t('canvas.nodePanel.outputs', { defaultValue: 'Outputs' })}</p>
          <div className="flex flex-wrap gap-1.5">
            {outputPorts.map((port) => (
              <span key={port.id} className="rounded border border-border bg-background px-1.5 py-0.5 type-tiny text-muted-foreground">
                {port.labelKey ? t(port.labelKey, { defaultValue: port.label ?? port.id }) : (port.label ?? port.id)} · {port.type}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function LabelField({ label, onUpdate }: { label: string; onUpdate: (v: string) => void }) {
  const { t } = useTranslation()
  return (
    <div>
      <Label className="type-label text-muted-foreground mb-1">{t('canvas.nodePanel.label')}</Label>
      <Input
        value={label}
        onChange={(e) => onUpdate(e.target.value)}
        className="type-body"
      />
    </div>
  )
}

function FileNameField({ value, onUpdate }: { value: string; onUpdate: (v: string) => void }) {
  const { t } = useTranslation()
  return (
    <div>
      <Label className="type-label text-muted-foreground mb-1">{t('canvas.nodePanel.fileName')}</Label>
      <Input
        value={value}
        onChange={(e) => onUpdate(e.target.value)}
        className="type-body"
        placeholder={t('canvas.nodePanel.fileNamePlaceholder')}
      />
    </div>
  )
}

const PARAM_TYPE_OPTIONS: Array<{ value: CanvasParamType; label: string }> = [
  { value: 'text', label: 'canvas.paramTypes.text' },
  { value: 'image', label: 'canvas.paramTypes.image' },
  { value: 'video', label: 'canvas.paramTypes.video' },
  { value: 'json', label: 'canvas.paramTypes.json' },
  { value: 'number', label: 'canvas.paramTypes.number' },
  { value: 'boolean', label: 'canvas.paramTypes.boolean' },
  { value: 'resource', label: 'canvas.paramTypes.resource' },
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
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2">
      <div>
        <Label className="type-label text-muted-foreground mb-1">{t('canvas.nodePanel.paramName')}</Label>
        <Input
          value={name}
          onChange={(e) => onUpdate({ paramName: e.target.value })}
          className="type-body"
          placeholder={t('canvas.nodePanel.paramNamePlaceholder')}
        />
      </div>
      <div className="w-28">
        <Label className="type-label text-muted-foreground mb-1">{t('canvas.nodePanel.paramType')}</Label>
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-2 type-body text-foreground"
          value={type}
          onChange={(e) => onUpdate({ paramType: e.target.value as CanvasParamType })}
        >
          {PARAM_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{t(option.label)}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

function PluginCardPanel({
  plugin,
  data,
  label,
  isRunning,
  allowRun,
  onUpdate,
  onRun,
}: {
  plugin?: ClientPluginManifest
  data: CanvasNodeData
  label: string
  isRunning: boolean
  allowRun: boolean
  onUpdate: (patch: Partial<CanvasNodeData & { label: string }>) => void
  onRun: () => void
}) {
  const { t } = useTranslation()
  const schema = plugin?.inputSchema
  const properties = schema?.properties ?? {}
  const required = schema?.required ?? []
  const args = (data.pluginArgs ?? {}) as Record<string, unknown>
  const canRun = allowRun && !!plugin && !isRunning && required.every((key) => {
    const value = args[key] ?? properties[key]?.default
    return value !== undefined && value !== null && String(value).trim() !== ''
  })

  function updateArg(name: string, value: unknown) {
    onUpdate({ pluginArgs: { ...args, [name]: value } })
  }

  return (
    <div className="w-full bg-background h-full overflow-y-auto p-4 space-y-4 type-body">
      <LabelField label={label} onUpdate={(v) => onUpdate({ label: v } as any)} />

      <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
        <p className="type-label font-medium text-foreground">{data.pluginName || plugin?.name || t('plugins.notFound')}</p>
        <p className="mt-1 type-caption leading-relaxed text-muted-foreground">
          {plugin?.description || t('canvas.pluginCard.localRuntimeDescription')}
        </p>
        {data.pluginRuntime && (
          <p className="mt-1 type-tiny text-muted-foreground">
            {t('canvas.pluginCard.runtime', { runtime: data.pluginRuntime, defaultValue: `runtime: ${data.pluginRuntime}` })}
          </p>
        )}
      </div>

      {((data.inputPorts?.length ?? 0) > 0 || (data.outputPorts?.length ?? 0) > 0) && (
        <div className="rounded-md border border-border bg-muted/10 px-3 py-2 type-label">
          {(data.inputPorts?.length ?? 0) > 0 && (
            <div>
              <p className="mb-1 type-caption font-medium text-muted-foreground">{t('canvas.nodePanel.inputs', { defaultValue: 'Inputs' })}</p>
              <div className="flex flex-wrap gap-1.5">
                {data.inputPorts?.map((port) => (
                  <span key={port.id} className="rounded border border-border bg-background px-1.5 py-0.5 type-tiny text-muted-foreground">
                    {port.label ?? port.id} · {port.type}
                  </span>
                ))}
              </div>
            </div>
          )}
          {(data.outputPorts?.length ?? 0) > 0 && (
            <div className={(data.inputPorts?.length ?? 0) > 0 ? 'mt-2' : ''}>
              <p className="mb-1 type-caption font-medium text-muted-foreground">{t('canvas.nodePanel.outputs', { defaultValue: 'Outputs' })}</p>
              <div className="flex flex-wrap gap-1.5">
                {data.outputPorts?.map((port) => (
                  <span key={port.id} className="rounded border border-border bg-background px-1.5 py-0.5 type-tiny text-muted-foreground">
                    {port.label ?? port.id} · {port.type}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!plugin && (
        <p className="type-label text-destructive bg-destructive/10 rounded px-2 py-1">{t('canvas.pluginCard.missingPlugin')}</p>
      )}

      {Object.entries(properties).length > 0 && (
        <div className="space-y-3">
          <p className="type-label font-medium text-muted-foreground">{t('plugins.parameters')}</p>
          {Object.entries(properties).map(([name, prop]) => (
            <PluginArgField
              key={name}
              name={name}
              prop={prop}
              value={args[name] ?? prop.default ?? ''}
              onChange={(value) => updateArg(name, value)}
            />
          ))}
        </div>
      )}

      {data.error && <p className="type-label text-destructive bg-destructive/10 rounded px-2 py-1">{data.error}</p>}

      <Button onClick={onRun} disabled={!canRun} className="w-full" size="sm">
        {isRunning ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
        {isRunning ? t('plugins.running') : t('plugins.run')}
      </Button>

      {data.pluginResultText && (
        <div className="rounded-md border border-border bg-muted/25 p-3">
          <p className="mb-2 type-tiny font-semibold uppercase text-muted-foreground">{t('plugins.result')}</p>
          <p className="whitespace-pre-wrap break-words type-label text-foreground">{data.pluginResultText}</p>
        </div>
      )}

      {data.executableSpec && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="type-tiny font-semibold uppercase text-emerald-700">{t('canvas.pluginCard.executableReady')}</p>
          <p className="mt-1 type-label text-muted-foreground">{data.executableSpec.capability}</p>
        </div>
      )}
    </div>
  )
}

function PluginArgField({
  name,
  prop,
  value,
  onChange,
}: {
  name: string
  prop: ClientPluginInputProperty
  value: unknown
  onChange: (value: unknown) => void
}) {
  const label = prop.title ?? name
  const stringValue = value === undefined || value === null ? '' : String(value)

  if (prop.enum && prop.enum.length > 0) {
    return (
      <div>
        <Label className="type-label text-muted-foreground mb-1">{label}</Label>
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-2 type-body text-foreground"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value=""></option>
          {prop.enum.map((option) => (
            <option key={String(option)} value={String(option)}>{String(option)}</option>
          ))}
        </select>
        {prop.description && <p className="mt-1 type-caption text-muted-foreground">{prop.description}</p>}
      </div>
    )
  }

  if (prop.type === 'number') {
    return (
      <div>
        <Label className="type-label text-muted-foreground mb-1">{label}</Label>
        <Input
          type="number"
          value={stringValue}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          className="type-body"
        />
        {prop.description && <p className="mt-1 type-caption text-muted-foreground">{prop.description}</p>}
      </div>
    )
  }

  if (prop.type === 'boolean') {
    return (
      <label className="flex items-start gap-2 rounded-md border border-border px-3 py-2 type-label">
        <input
          type="checkbox"
          checked={value === true || value === 'true'}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="block font-medium text-foreground">{label}</span>
          {prop.description && <span className="mt-1 block type-caption text-muted-foreground">{prop.description}</span>}
        </span>
      </label>
    )
  }

  const isLong = name === 'prompt' || name.includes('prompt') || name.includes('description')
  return (
    <div>
      <Label className="type-label text-muted-foreground mb-1">{label}</Label>
      {isLong ? (
        <Textarea
          rows={4}
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          className="type-body"
        />
      ) : (
        <Input
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          className="type-body"
        />
      )}
      {prop.description && <p className="mt-1 type-caption text-muted-foreground">{prop.description}</p>}
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
  const { t } = useTranslation()
  const legacySelectedModel = models.find((model) => model.id === data.modelDbId)
  const selectedModelValue = data.modelId
    || (legacySelectedModel ? publicModelId(legacySelectedModel) : '')
    || (models[0] ? publicModelId(models[0]) : '')
  return (
    <div className="space-y-3">
      <div>
        <p className="type-label text-muted-foreground mb-1">{t('agents.model')}</p>
        <select
          className="w-full border border-border bg-background rounded-md px-2 py-1.5 type-label text-foreground"
          value={selectedModelValue}
          onChange={(e) => {
            const model = models.find((m) => publicModelId(m) === e.target.value)
            onUpdate({ modelId: e.target.value, modelDbId: model?.id ?? 0 })
          }}
        >
          {models.length === 0 && <option value="">{t('shared.modelSelector.noModels')}</option>}
          {models.map((m) => (
            <option key={m.id} value={publicModelId(m)}>{publicModelLabel(m)}</option>
          ))}
        </select>
      </div>
      <div>
        <p className="type-label text-muted-foreground mb-1">{t('details.prompt')}</p>
        <PromptTextarea
          value={data.prompt ?? ''}
          onChange={(v) => onUpdate({ prompt: v })}
          upstreamNodes={upstreamNodes}
        />
      </div>
    </div>
  )
}
