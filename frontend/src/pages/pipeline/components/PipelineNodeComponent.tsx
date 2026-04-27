import { useState, useRef, useEffect, useCallback } from 'react'
import { Handle, Position } from '@xyflow/react'
import {
  FileText, Film, Clapperboard, Layers, Camera, Scissors, FileEdit, Box,
  PenLine, Image, Hammer, Package, Wand2, Loader2, Upload, AtSign,
  Video as VideoIcon, X, Bug, RefreshCw,
} from 'lucide-react'
import type { PipelineNode, GenJob, PublicModel, RawResource, ParamDef } from '@/types'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import { AuthedImage } from '@/components/shared/AuthedImage'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'

// ── Node category ─────────────────────────────────────────────────────────────

export type NodeCategory = 'work' | 'artifact' | 'custom' | 'tool'

interface NodeTypeMeta {
  label: string
  icon: React.ElementType
  category: NodeCategory
  desc?: string
  accent: string
  iconColor: string
  // Tool-specific
  capability?: 'image' | 'video'
  inputType?: 'image' | 'video' | 'image+video'
  outputType?: 'image' | 'video'
  toolEmoji?: string
}

export const NODE_TYPE_META: Record<string, NodeTypeMeta> = {
  // ── Work nodes ───────────────────────────────────────────────────────────
  script_writing:       { label: 'Script Writing',          icon: PenLine,      category: 'work',     desc: 'Create the main script',                    accent: 'bg-blue-500/10 text-blue-600',     iconColor: 'text-blue-500' },
  episode_writing:      { label: 'Episode Script Writing',  icon: Film,         category: 'work',     desc: 'Create episode scripts',                    accent: 'bg-violet-500/10 text-violet-600', iconColor: 'text-violet-500' },
  scene_writing:        { label: 'Scene Script Writing',    icon: Clapperboard, category: 'work',     desc: 'Create scene scripts',                      accent: 'bg-indigo-500/10 text-indigo-600', iconColor: 'text-indigo-500' },
  storyboard_creation:  { label: 'Storyboard Creation',     icon: Layers,       category: 'work',     desc: 'Create storyboard scripts',                 accent: 'bg-cyan-500/10 text-cyan-600',     iconColor: 'text-cyan-500' },
  asset_creation:       { label: 'Asset Creation',          icon: Hammer,       category: 'work',     desc: 'Create characters, scenes, and props',      accent: 'bg-emerald-500/10 text-emerald-600', iconColor: 'text-emerald-500' },
  raw_script:           { label: 'Draft Writing',           icon: FileEdit,     category: 'work',     desc: 'Original draft or outline',                 accent: 'bg-amber-500/10 text-amber-600',   iconColor: 'text-amber-500' },
  shot_production:      { label: 'Shot Production',         icon: Camera,       category: 'work',     desc: 'Generate shots with AI',                    accent: 'bg-orange-500/10 text-orange-600', iconColor: 'text-orange-500' },
  episode_edit:         { label: 'Episode Editing',         icon: Scissors,     category: 'work',     desc: 'Post-production editing',                   accent: 'bg-rose-500/10 text-rose-600',     iconColor: 'text-rose-500' },

  // ── Artifact nodes ───────────────────────────────────────────────────────
  main_script:          { label: 'Main Script',       icon: FileText,     category: 'artifact', desc: 'Complete main script artifact',       accent: 'bg-sky-500/10 text-sky-600',       iconColor: 'text-sky-500' },
  episode_script:       { label: 'Episode Script',    icon: Film,         category: 'artifact', desc: 'Script split by episode',            accent: 'bg-purple-500/10 text-purple-600', iconColor: 'text-purple-500' },
  scene_script:         { label: 'Scene Script',      icon: Clapperboard, category: 'artifact', desc: 'Script split by scene',              accent: 'bg-blue-500/10 text-blue-600',     iconColor: 'text-blue-500' },
  storyboard_script:    { label: 'Storyboard Script', icon: Layers,       category: 'artifact', desc: 'Storyboard description script',      accent: 'bg-teal-500/10 text-teal-600',     iconColor: 'text-teal-500' },
  episode:              { label: 'Episode',           icon: Film,         category: 'artifact', desc: 'Episode artifact',                   accent: 'bg-purple-500/10 text-purple-600', iconColor: 'text-purple-500' },
  scene:                { label: 'Scene',             icon: Clapperboard, category: 'artifact', desc: 'Scene artifact',                     accent: 'bg-blue-500/10 text-blue-600',     iconColor: 'text-blue-500' },
  storyboard:           { label: 'Storyboard',        icon: Layers,       category: 'artifact', desc: 'Storyboard artifact',                accent: 'bg-teal-500/10 text-teal-600',     iconColor: 'text-teal-500' },
  asset:                { label: 'Asset',             icon: Package,      category: 'artifact', desc: 'Asset artifact',                     accent: 'bg-green-500/10 text-green-600',   iconColor: 'text-green-500' },

  // ── Tool nodes ───────────────────────────────────────────────────────────
  ref_image_gen:        { label: 'Reference Image',  icon: Image,        category: 'tool',     desc: 'Generate a new image from a reference image', accent: 'bg-pink-500/10 text-pink-600',     iconColor: 'text-pink-500',   capability: 'image', inputType: 'image',       outputType: 'image', toolEmoji: '🎨' },
  ref_video_gen:        { label: 'Reference Video',  icon: VideoIcon,    category: 'tool',     desc: 'Generate video from a reference video',      accent: 'bg-red-500/10 text-red-600',       iconColor: 'text-red-500',    capability: 'video', inputType: 'video',       outputType: 'video', toolEmoji: '🎥' },
  style_transfer:       { label: 'Style Transfer',   icon: Wand2,        category: 'tool',     desc: "Transfer the reference image's art style",   accent: 'bg-fuchsia-500/10 text-fuchsia-600', iconColor: 'text-fuchsia-500', capability: 'image', inputType: 'image',    outputType: 'image', toolEmoji: '✨' },
  motion_imitation:     { label: 'Motion Imitation', icon: Film,         category: 'tool',     desc: 'Transfer motion from a reference video',     accent: 'bg-orange-500/10 text-orange-600', iconColor: 'text-orange-500', capability: 'video', inputType: 'image+video', outputType: 'video', toolEmoji: '🕺' },
  multi_angle:          { label: 'Multi-angle',      icon: Camera,       category: 'tool',     desc: 'Generate multi-angle views',                 accent: 'bg-cyan-500/10 text-cyan-600',     iconColor: 'text-cyan-500',   capability: 'image', inputType: 'image',       outputType: 'image', toolEmoji: '🔄' },

  // ── Custom ───────────────────────────────────────────────────────────────
  custom:               { label: 'Custom',       icon: Box,          category: 'custom',   desc: 'Define a custom type', accent: 'bg-muted text-muted-foreground',   iconColor: 'text-muted-foreground' },
}

const FALLBACK_META: NodeTypeMeta = {
  label: 'Unknown', icon: Box, category: 'custom', accent: 'bg-muted text-muted-foreground', iconColor: 'text-muted-foreground',
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { dot: string; badge: string; label: string }> = {
  draft:        { dot: 'bg-muted-foreground/40', badge: 'bg-muted text-muted-foreground',        label: 'Draft' },
  under_review: { dot: 'bg-amber-500',           badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400', label: 'In Review' },
  rejected:     { dot: 'bg-destructive',         badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',         label: 'Rejected' },
  final:        { dot: 'bg-green-500',           badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400', label: 'Final' },
}

// ── Inline Tool App Card ──────────────────────────────────────────────────────

function InlineToolCard({
  meta,
  nodeId,
}: {
  meta: NodeTypeMeta
  nodeId: string
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const capability = meta.capability ?? 'image'
  const outputType = meta.outputType ?? 'image'
  const inputType = meta.inputType ?? 'image'
  // Coarse media category for query filtering (image / video)
  const mediaCategory = capability === 'video' ? 'video' : 'image'

  const [prompt, setPrompt] = useState('')
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null)
  const [selectedModel, setSelectedModel] = useState<PublicModel | null>(null)
  const [extraParams, setExtraParams] = useState<Record<string, string | number | boolean>>({})
  const [uploading, setUploading] = useState(false)
  const [attachments, setAttachments] = useState<RawResource[]>([])
  const [activeJobId, setActiveJobId] = useState<number | null>(null)
  const [debugMode, setDebugMode] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Use node-specific localStorage key for model persistence
  const storageKey = `tool_node_model_${nodeId}_${meta.label}`

  const { data: modelsData, isFetching, refetch } = useQuery<PublicModel[]>({
    queryKey: ['models', capability],
    queryFn: () => api.get(`/models?capability=${capability}`).then((r) => r.data),
    staleTime: 60_000,
  })
  const models = modelsData ?? []

  const { data: jobs = [] } = useQuery<GenJob[]>({
    queryKey: ['gen-jobs', { type: mediaCategory }],
    queryFn: () => api.get(`/gen-jobs?type=${mediaCategory}&limit=20`).then((r) => r.data),
    refetchInterval: activeJobId ? 3000 : 60000,
  })

  // Auto-select first model
  useEffect(() => {
    if (models.length > 0 && selectedModelId === null) {
      const saved = localStorage.getItem(storageKey)
      const savedId = saved ? parseInt(saved, 10) : null
      const found = savedId ? models.find(m => m.id === savedId) : null
      const target = found ?? models[0]
      setSelectedModelId(target.id)
      setSelectedModel(target)
    }
  }, [models, selectedModelId, storageKey])

  // Set default params when model changes
  useEffect(() => {
    if (!selectedModel?.supported_params) { setExtraParams({}); return }
    const defaults: Record<string, string | number | boolean> = {}
    for (const p of selectedModel.supported_params) {
      if (p.default !== undefined) defaults[p.key] = p.default
    }
    setExtraParams(defaults)
  }, [selectedModel?.model_def_id])

  // Track active job completion
  useEffect(() => {
    if (!activeJobId) return
    const job = jobs.find(j => j.ID === activeJobId)
    if (job && job.status !== 'pending' && job.status !== 'running') {
      setActiveJobId(null)
      qc.invalidateQueries({ queryKey: ['resources'] })
    }
  }, [jobs, activeJobId, qc])

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await api.post('/resources/upload', fd).then(r => r.data as RawResource)
      qc.invalidateQueries({ queryKey: ['resources'] })
      setAttachments(a => [...a, r])
    } finally {
      setUploading(false)
    }
  }

  async function generate() {
    if (!prompt.trim() || !selectedModelId) return
    // Derive fine-grained job_type from model capabilities and attachments.
    const caps = selectedModel?.capabilities ?? []
    let effectiveJobType: string = outputType
    if (outputType === 'image' && caps.includes('image_edit')) {
      effectiveJobType = 'image_edit'
    } else if (outputType === 'video') {
      const hasVideoAttachment = attachments.some((a) => a.type === 'video')
      const hasImageAttachment = attachments.some((a) => a.type === 'image')
      if (caps.includes('video_v2v') && hasVideoAttachment) {
        effectiveJobType = 'video_v2v'
      } else if (caps.includes('video_i2v') && hasImageAttachment) {
        effectiveJobType = 'video_i2v'
      } else if (caps.includes('video_i2v') && !caps.includes('video')) {
        effectiveJobType = 'video_i2v'
      } else if (caps.includes('video_v2v') && !caps.includes('video')) {
        effectiveJobType = 'video_v2v'
      }
    }
    try {
      const job = await api.post('/gen-jobs', {
        model_config_id: selectedModelId,
        job_type: effectiveJobType,
        prompt: prompt.trim(),
        extra_params: Object.keys(extraParams).length > 0 ? JSON.stringify(extraParams) : undefined,
        input_resource_id: attachments[0]?.ID ?? undefined,
      }).then(r => r.data as GenJob)
      setActiveJobId(job.ID)
      setPrompt('')
      setAttachments([])
      qc.invalidateQueries({ queryKey: ['gen-jobs', { type: mediaCategory }] })
    } catch { /* handled by interceptor */ }
  }

  const isRunning = activeJobId != null
  const canGenerate = !isRunning && !!prompt.trim() && !!selectedModelId
  const latestJob = [...jobs].reverse()[0]
  const latestStatus = latestJob?.status === 'succeeded' ? 'done' : latestJob?.status as string | undefined
  const outputUrl = latestJob?.output_resource
    ? (latestJob.output_resource as RawResource).direct_url ?? `${API_BASE}${(latestJob.output_resource as RawResource).url}`
    : undefined

  const accept = inputType === 'video' ? 'video/*' : inputType === 'image' ? 'image/*' : 'image/*,video/*'
  const supportedParams: ParamDef[] = selectedModel?.supported_params ?? []

  return (
    <div className="space-y-2 nodrag" onClick={e => e.stopPropagation()}>
      {/* Model + debug row */}
      <div className="flex items-center gap-1.5">
        <Select
          disabled={models.length === 0}
          value={selectedModelId?.toString() ?? ''}
          onValueChange={(v) => {
            const id = Number(v)
            setSelectedModelId(id)
            const m = models.find(m => m.id === id) ?? null
            setSelectedModel(m)
            localStorage.setItem(storageKey, v)
          }}
        >
          <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
            <SelectValue placeholder={models.length === 0 ? t('pipeline.toolNode.noModels') : t('pipeline.toolNode.selectModel')} />
          </SelectTrigger>
          <SelectContent>
            {models.map(m => (
              <SelectItem key={m.id} value={m.id.toString()} className="text-xs">
                {m.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
        >
          <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={() => setDebugMode(d => !d)}
          className={cn(
            'p-1 rounded transition-colors shrink-0',
            debugMode ? 'text-amber-500 bg-amber-500/10' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Bug size={11} />
        </button>
      </div>

      {/* Latest result preview */}
      {latestJob && (
        <div className="rounded-lg border border-border overflow-hidden bg-muted/20">
          {/* Preview image/video */}
          {latestStatus === 'done' && outputUrl && (
            <div className="relative">
              {outputType === 'image' ? (
                (latestJob.output_resource as RawResource)?.direct_url
                  ? <img src={outputUrl} alt={t('shared.generation.resultAlt')} className="w-full max-h-[120px] object-contain bg-muted/30" />
                  : <AuthedImage src={outputUrl} alt={t('shared.generation.resultAlt')} className="w-full max-h-[120px] object-contain bg-muted/30" />
              ) : (
                <video src={outputUrl} className="w-full max-h-[120px]" />
              )}
            </div>
          )}
          {(latestStatus === 'pending' || latestStatus === 'running') && (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
              <Loader2 size={13} className="animate-spin" />
              <span className="text-xs">{latestStatus === 'pending' ? t('shared.generation.waitingStart') : t('canvas.running')}</span>
            </div>
          )}
          {latestStatus === 'failed' && (
            <div className="flex items-center justify-center gap-1.5 py-3 text-destructive text-xs">
              <X size={11} />
              {latestJob.error_msg ?? t('canvas.status.failed')}
            </div>
          )}
          {/* Prompt label */}
          {latestJob.prompt && (
            <div className="px-2 py-1.5 border-t border-border/50">
              <p className="text-[10px] text-muted-foreground line-clamp-2">{latestJob.prompt}</p>
            </div>
          )}
          {/* Debug info */}
          {debugMode && (
            <div className="px-2 py-1.5 border-t border-border/50 bg-muted/30 font-mono text-[10px] space-y-0.5">
              <div className="flex gap-1.5">
                <span className="text-muted-foreground w-12 shrink-0">{t('admin.debug.jobs.fields.jobId')}</span>
                <span>{latestJob.ID}</span>
              </div>
              <div className="flex gap-1.5">
                <span className="text-muted-foreground w-12 shrink-0">{t('pipeline.toolNode.status')}</span>
                <span>{latestJob.status}</span>
              </div>
              {latestJob.error_msg && (
                <div className="flex gap-1.5">
                  <span className="text-muted-foreground w-12 shrink-0">{t('pipeline.toolNode.error')}</span>
                  <span className="text-destructive break-all">{latestJob.error_msg}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Prompt input */}
      <textarea
        className="w-full text-xs resize-none focus:outline-none bg-muted/30 border border-border rounded-lg text-foreground placeholder:text-muted-foreground/40 leading-relaxed min-h-[52px] px-2.5 py-2 focus:bg-background focus:border-primary/50 transition-colors"
        rows={2}
        placeholder={t('shared.generation.promptPlaceholder')}
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate()
        }}
      />

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {attachments.map((r, i) => (
            <div key={r.ID} className="flex items-center gap-1 bg-muted rounded-full px-2 py-0.5">
              <span className="text-[10px] text-foreground max-w-[60px] truncate">{r.name}</span>
              <button onClick={() => setAttachments(a => a.filter((_, j) => j !== i))}>
                <X size={9} className="text-muted-foreground hover:text-foreground" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Params */}
      {supportedParams.length > 0 && (
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          {supportedParams.map(p => {
            const val = extraParams[p.key] ?? p.default ?? ''
            return (
              <div key={p.key} className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground">{p.label}</span>
                {p.type === 'select' && p.options ? (
                  <select
                    className="border border-border rounded px-1 py-0.5 text-[10px] bg-background text-foreground"
                    value={String(val)}
                    onChange={e => setExtraParams(prev => ({ ...prev, [p.key]: e.target.value }))}
                  >
                    {p.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : p.type === 'number' ? (
                  <input
                    type="number"
                    className="border border-border rounded px-1 py-0.5 text-[10px] bg-background text-foreground w-12"
                    value={Number(val)}
                    min={p.min} max={p.max} step={p.step ?? 1}
                    onChange={e => setExtraParams(prev => ({ ...prev, [p.key]: Number(e.target.value) }))}
                  />
                ) : p.type === 'boolean' ? (
                  <input
                    type="checkbox"
                    checked={Boolean(val)}
                    onChange={e => setExtraParams(prev => ({ ...prev, [p.key]: e.target.checked }))}
                    className="rounded"
                  />
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground border border-border rounded-full px-2 py-1 transition-colors"
        >
          {uploading ? <Loader2 size={9} className="animate-spin" /> : <Upload size={9} />}
          {t('shared.attachments.upload')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])}
        />
        <div className="flex-1" />
        <Button
          size="sm"
          onClick={generate}
          disabled={!canGenerate}
          className="h-6 text-[10px] px-2.5 rounded-full"
        >
          {isRunning
            ? <><Loader2 size={9} className="animate-spin mr-1" />{t('canvas.running')}</>
            : <><Wand2 size={9} className="mr-1" />{t('shared.genInput.generate')}</>
          }
        </Button>
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PipelineNodeProps {
  data: PipelineNode & { selected?: boolean; onClick?: () => void }
  id: string
}

export function PipelineNodeComponent({ data, id }: PipelineNodeProps) {
  const { t, i18n } = useTranslation()
  const meta = NODE_TYPE_META[data.type] ?? FALLBACK_META
  const status = STATUS_META[data.status] ?? STATUS_META.draft
  const Icon = meta.icon
  const isTool = meta.category === 'tool'
  const typeLabel = t(`pipeline.nodeTypes.${data.type}.label`, { defaultValue: meta.label })
  const categoryLabel = t(`pipeline.categories.${meta.category}`, { defaultValue: meta.category })
  const statusLabel = t(`pipeline.status.${data.status}`, { defaultValue: status.label })

  // Handle hover state for connection guide
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className={[
        'relative bg-card border rounded-xl shadow-sm cursor-pointer select-none',
        'transition-all duration-150 hover:shadow-md',
        isTool ? 'w-72' : 'w-56',
        data.selected ? 'ring-2 ring-primary ring-offset-2 border-primary/50' : 'border-border',
      ].join(' ')}
      onClick={data.onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ── Card header ───────────────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          {/* Icon + type label */}
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${meta.accent}`}>
              {meta.toolEmoji
                ? <span className="text-sm">{meta.toolEmoji}</span>
                : <Icon size={14} className={meta.iconColor} />
              }
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-muted-foreground leading-none mb-0.5 uppercase tracking-wide">
                {typeLabel}
              </p>
              <p className="text-sm font-semibold text-foreground leading-tight truncate max-w-[140px]">
                {data.name}
              </p>
            </div>
          </div>

          {/* Category badge */}
          <span className={cn(
            'shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide',
            meta.category === 'work'
              ? 'bg-primary/10 text-primary'
              : meta.category === 'tool'
                ? 'bg-violet-500/10 text-violet-600'
                : meta.category === 'artifact'
                  ? 'bg-muted text-muted-foreground border border-border'
                  : 'bg-muted text-muted-foreground'
          )}>
            {categoryLabel}
          </span>
        </div>
      </div>

      {/* ── Divider ───────────────────────────────────────────────────── */}
      <div className="border-t border-border/50 mx-3" />

      {/* ── Tool APP card (for tool nodes) ────────────────────────────── */}
      {isTool ? (
        <div className="px-3 py-2.5">
          <InlineToolCard meta={meta} nodeId={id} />
        </div>
      ) : (
        /* ── Standard card footer ─────────────────────────────────────── */
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          {/* Status */}
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.dot}`} />
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${status.badge}`}>
              {statusLabel}
            </span>
          </div>

          {/* Assignee + due date */}
          <div className="flex items-center gap-1.5 min-w-0">
            {data.due_date && (
              <span className="text-[10px] text-muted-foreground shrink-0">
                {new Date(data.due_date).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' })}
              </span>
            )}
            {data.assignee && (
              <span className="text-[10px] text-muted-foreground font-medium truncate max-w-[52px]">
                @{data.assignee.username}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Entity link indicator ─────────────────────────────────────── */}
      {data.entity_id && (
        <div className="px-3 pb-2.5">
          <div className="flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 px-2 py-1 rounded-md">
            <div className="w-1 h-1 rounded-full bg-emerald-500 shrink-0" />
            {t('pipeline.node.linkedEntity', { type: data.entity_type, id: data.entity_id })}
          </div>
        </div>
      )}

      {/* ── ReactFlow handles — enlarged for easier connection ─────────── */}
      {/* Target handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        className={cn(
          '!w-4 !h-4 !bg-background !border-2 transition-all duration-150',
          hovered
            ? '!border-primary !shadow-[0_0_0_4px_hsl(var(--primary)/0.15)]'
            : '!border-border hover:!border-primary hover:!shadow-[0_0_0_4px_hsl(var(--primary)/0.15)]'
        )}
      />
      {/* Source handle (right) */}
      <Handle
        type="source"
        position={Position.Right}
        className={cn(
          '!w-4 !h-4 !bg-primary/80 !border-2 transition-all duration-150',
          hovered
            ? '!border-primary !shadow-[0_0_0_4px_hsl(var(--primary)/0.2)] !bg-primary'
            : '!border-primary/60 hover:!border-primary hover:!shadow-[0_0_0_4px_hsl(var(--primary)/0.2)] hover:!bg-primary'
        )}
      />

      {/* Connection guide tooltip on hover */}
      {hovered && (
        <div className="absolute -right-[68px] top-1/2 -translate-y-1/2 pointer-events-none z-10">
          <div className="bg-foreground/80 text-background text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap backdrop-blur-sm">
            {t('pipeline.node.dragConnect')}
          </div>
        </div>
      )}
    </div>
  )
}
