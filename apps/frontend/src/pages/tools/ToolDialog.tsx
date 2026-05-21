import { useState, useEffect } from 'react'
import type React from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { RawResource, NodeType, Job, PublicModel, DebugCallResult, FeatureConfig, PaginatedResponse } from '@/types'
import {
  Wand2,
  Bug, Copy, Check, History, ChevronLeft, ChevronRight,
  AlertTriangle,
} from 'lucide-react'
import { ModelSelector } from '@/components/shared/ModelSelector'
import { ResourcePanel } from '@/components/shared/ResourcePanel'
import { JobContextSummary, GenResultCard } from '@/components/shared/GenResultCard'
import type { InputSlotDef } from '@/components/shared/GenInputCard'
import { GenInputCard } from '@/components/shared/GenInputCard'
import {
  Card,
  CardContent,
} from '@movscript/ui'
import { cn } from '@/lib/utils'
import { publicModelId } from '@/lib/modelDisplay'
import { buildGenerationJobPayload } from '@/lib/generationJobPayload'
import { useTranslation } from 'react-i18next'
import { ToolHeader } from './ToolHeader'

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 type-label text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border hover:bg-muted/50"
    >
      {copied ? <Check size={12} className="text-[var(--ms-color-success)]" /> : <Copy size={12} />}
      {copied ? t('tools.debug.copied') : t('tools.debug.copy')}
    </button>
  )
}

function buildCurl(d: DebugCallResult): string {
  const headers = Object.entries(d.request_headers ?? {})
    .map(([k, v]) => `-H '${k}: ${v}'`)
    .join(' \\\n  ')
  const body = d.method !== 'GET' && d.request_body
    ? `\\\n  -d '${d.request_body.replace(/'/g, "'\\''")}'`
    : ''
  return `curl -X ${d.method} '${d.endpoint}' \\\n  ${headers}${body}`
}

function buildGenerationJobTitle(jobType: string): string {
  const labels: Record<string, string> = {
    image: '文生图',
    image_edit: '参考生图',
    video: '文生视频',
    video_i2v: '参考生视频',
    video_v2v: '视频迁移',
  }
  return `${labels[jobType] ?? '生成任务'}-${Math.floor(1000 + Math.random() * 9000)}`
}

// ── DebugPanel ────────────────────────────────────────────────────────────────

function DebugPanel({ job }: { job: Job }) {
  const { t, i18n } = useTranslation()
  const params = job.extra_params ? (() => { try { return JSON.parse(job.extra_params!) } catch { return {} } })() : {}
  const debug: DebugCallResult | null = job.debug_info ? (() => {
    try { return JSON.parse(job.debug_info!) } catch { return null }
  })() : null

  function KV({ label, value, mono = true, color }: { label: string; value: string; mono?: boolean; color?: string }) {
    return (
      <div className="flex gap-2 min-w-0">
        <span className="text-muted-foreground w-24 shrink-0">{label}</span>
        <span className={`break-all ${mono ? 'font-mono' : 'font-sans'} ${color ?? 'text-foreground'}`}>{value}</span>
      </div>
    )
  }

  function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div className="space-y-1.5 border-t border-border/40 pt-2">
        <span className="text-muted-foreground font-sans type-tiny uppercase tracking-wider">{title}</span>
        {children}
      </div>
    )
  }

  function JsonBlock({ text, maxH = 'max-h-32' }: { text: string; maxH?: string }) {
    const pretty = (() => { try { return JSON.stringify(JSON.parse(text), null, 2) } catch { return text } })()
    return (
      <div className="relative">
        <pre className={`bg-background/50 rounded p-2 overflow-x-auto text-foreground whitespace-pre-wrap break-all ${maxH} type-caption`}>
          {pretty}
        </pre>
        <div className="absolute top-1 right-1"><CopyButton text={text} /></div>
      </div>
    )
  }

  return (
    <div className="bg-muted/30 rounded-lg p-3 type-label font-mono space-y-2 border border-border">
      <p className="text-muted-foreground font-sans font-medium type-label">{t('tools.debug.title')}</p>

      {/* ── Job 基础信息 ── */}
      <div className="space-y-1">
        <KV label="Job ID" value={String(job.ID)} />
        <KV label={t('tools.debug.status')} value={job.status} color={job.status === 'failed' ? 'text-destructive' : job.status === 'succeeded' ? 'text-[var(--ms-color-success)]' : 'text-foreground'} />
        <KV label={t('tools.debug.configId')} value={String(job.model_config_id)} />
        {job.started_at && <KV label={t('tools.debug.started')} value={new Date(job.started_at).toLocaleTimeString(i18n.language)} />}
        {job.finished_at && <KV label={t('tools.debug.finished')} value={new Date(job.finished_at).toLocaleTimeString(i18n.language)} />}
        {job.error_msg && <KV label={t('common.error')} value={job.error_msg} color="text-destructive" />}
      </div>

      {/* ── Job 调用上下文（worker 填入）── */}
      {debug && (debug.job_type || debug.job_model_def_id || debug.job_resolved_prompt || (debug.job_input_resource_ids?.length ?? 0) > 0) && (
        <Section title={t('tools.debug.callContext')}>
          {debug.job_type && <KV label={t('tools.debug.outputType')} value={debug.job_type} />}
          {debug.job_model_def_id && <KV label={t('tools.debug.modelDefinition')} value={debug.job_model_def_id} />}
          {(debug.job_input_resource_ids?.length ?? 0) > 0 && (
            <KV label={t('tools.debug.inputResources')} value={debug.job_input_resource_ids!.join(', ')} />
          )}
          {debug.job_resolved_prompt && (
            <div className="flex gap-2 min-w-0">
              <span className="text-muted-foreground w-24 shrink-0">{t('tools.debug.sentPrompt')}</span>
              <span className="text-foreground break-all whitespace-pre-wrap">{debug.job_resolved_prompt}</span>
            </div>
          )}
        </Section>
      )}

      {/* ── 生成参数 ── */}
      {Object.keys(params).length > 0 && (
        <Section title={t('admin.params.title')}>
          {Object.entries(params).map(([k, v]) => (
            <KV key={k} label={k} value={String(v)} />
          ))}
        </Section>
      )}

      {/* ── HTTP 请求 ── */}
      {debug && debug.endpoint && (
        <Section title={`${t('tools.debug.request')} ${debug.latency_ms ? `· ${debug.latency_ms}ms` : ''}`}>
          <div className="flex items-center gap-1.5">
            <span className="text-foreground font-semibold shrink-0">{debug.method}</span>
            <span className="text-foreground break-all">{debug.endpoint}</span>
            {debug.model_id && <span className="text-muted-foreground ml-auto shrink-0">({debug.model_id})</span>}
          </div>
          {debug.request_headers && Object.keys(debug.request_headers).length > 0 && (
            <div className="bg-background/50 rounded p-2 space-y-0.5">
              {Object.entries(debug.request_headers).map(([k, v]) => (
                <div key={k} className="flex gap-1.5">
                  <span className="text-muted-foreground shrink-0">{k}:</span>
                  <span className="text-foreground break-all">{v}</span>
                </div>
              ))}
            </div>
          )}
          {debug.request_body && debug.request_body !== '(no body)' && (
            <JsonBlock text={debug.request_body} />
          )}
          <div className="flex items-center gap-1.5">
            <CopyButton text={buildCurl(debug)} />
          </div>
        </Section>
      )}

      {/* ── HTTP 响应 ── */}
      {debug && debug.response_status > 0 && (
        <Section title={t('tools.debug.response')}>
          <span className={debug.response_status < 400 ? 'text-[var(--ms-color-success)]' : 'text-destructive'}>
            {debug.response_status}
          </span>
          {debug.response_body && <JsonBlock text={debug.response_body} maxH="max-h-48" />}
        </Section>
      )}

      {/* ── 错误（来自 adapter）── */}
      {debug?.error && (
        <Section title={t('tools.debug.adapterError')}>
          <span className="text-destructive break-all">{debug.error}</span>
        </Section>
      )}
    </div>
  )
}

// ── GenerationCard ────────────────────────────────────────────────────────────

function GenerationCard({
  job,
  outputType,
  onReuse,
  debugMode,
}: {
  job: Job
  outputType: 'image' | 'video'
  onReuse: () => void
  debugMode: boolean
}) {
  const normalizedStatus = job.status === 'succeeded' ? 'done' : job.status as 'pending' | 'running' | 'failed' | 'cancelled'
  return (
    <GenResultCard
      prompt={job.prompt}
      status={normalizedStatus}
      outputResource={job.output_resource as RawResource | undefined}
      outputType={outputType}
      error={job.error_msg}
      timestamp={job.CreatedAt}
      onReuse={onReuse}
      contextPanel={<JobContextSummary job={job} includeProvider={debugMode} />}
      debugPanel={debugMode ? <DebugPanel job={job} /> : undefined}
      compact
    />
  )
}

// ── ToolDialog ────────────────────────────────────────────────────────────────

export interface ToolDialogDef {
  nodeType: NodeType
  capability: 'image' | 'video'
  toolName: string
  toolDescription: string
  inputType: 'image' | 'video' | 'image+video'
  outputType: 'image' | 'video'
  promptPlaceholder?: string
}

export function ToolDialog({
  nodeType: _nodeType,
  capability,
  toolName,
  toolDescription,
  inputType,
  outputType,
  promptPlaceholder,
}: ToolDialogDef) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [prompt, setPrompt] = useState('')
  const [attachments, setAttachments] = useState<RawResource[]>([])
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null)
  const [selectedModel, setSelectedModel] = useState<PublicModel | null>(null)
  const [extraParams, setExtraParams] = useState<Record<string, string | number | boolean>>({})
  const [uploading, setUploading] = useState(false)
  const [activeJobId, setActiveJobId] = useState<number | null>(null)
  const [debugMode, setDebugMode] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const historyPageSize = 10

  // Fetch feature definition to get authoritative input slot requirements.
  const { data: featureDef } = useQuery<FeatureConfig>({
    queryKey: ['feature', _nodeType],
    queryFn: () => api.get(`/features/${_nodeType}`).then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const { data: resourcesData } = useQuery<RawResource[]>({
    queryKey: ['resources'],
    queryFn: () => api.get('/resources').then((r) => r.data),
  })
  const resources = resourcesData ?? []

  // Derive from model capabilities: image_edit/i2v models accept media input.
  const modelAcceptsImageInput = selectedModel?.accepts_image_input ?? false
  // Fallback to static inputType for tools where the model hasn't been selected yet.
  const showImageInput = modelAcceptsImageInput || (selectedModel == null && (inputType === 'image' || inputType === 'image+video'))

  // Derive typed input slots from the feature definition, filtered by the selected model's capabilities.
  // Feature-defined slots are authoritative — they express what the feature needs, not what the model supports.
  // RequiresCap slots are hidden when the selected model lacks that capability.
  const inputSlots: InputSlotDef[] | undefined = (() => {
    const slots = featureDef?.input_slots
    if (!slots || slots.length === 0) return undefined
    const caps = selectedModel?.capabilities ?? []
    const visible = slots.filter((s) => !s.requires_cap || caps.includes(s.requires_cap))
    if (visible.length === 0) return undefined
    return visible.map((s) => ({
      key: s.key,
      label: s.label,
      type: s.accept as 'image' | 'video',
      required: s.required,
      maxCount: s.max_count ?? 0,
    }))
  })()

  function slotGroupsFor(nextAttachments: RawResource[]) {
    if (!inputSlots || inputSlots.length === 0) return []
    const used = new Set<number>()
    return inputSlots.map((slot) => {
      const indexes: number[] = []
      for (let i = 0; i < nextAttachments.length; i++) {
        if (used.has(i)) continue
        const r = nextAttachments[i]
        if (r.type !== slot.type) continue
        if (slot.maxCount > 0 && indexes.length >= slot.maxCount) continue
        used.add(i)
        indexes.push(i)
      }
      return { slot, indexes }
    })
  }

  function addAttachment(resource: RawResource) {
    setAttachments((current) => {
      if (current.some((r) => r.ID === resource.ID)) return current
      const next = [...current, resource]
      if (!inputSlots || inputSlots.length === 0) return next
      const assigned = new Set<number>()
      for (const group of slotGroupsFor(next)) {
        group.indexes.forEach((i) => assigned.add(i))
      }
      return assigned.has(next.length - 1) ? next : current
    })
  }

  // Warn when an attachment's type doesn't match any accepted slot for the selected model.
  const attachmentMismatchWarnings: string[] = (() => {
    if (!selectedModel || attachments.length === 0) return []
    const caps = selectedModel.capabilities ?? []
    const warnings: string[] = []
    const acceptsImage = caps.includes('image_edit') || caps.includes('video_i2v') || caps.includes('video_v2v') || selectedModel.accepts_image_input
    const acceptsVideo = caps.includes('video_v2v')
    for (const a of attachments) {
      if (a.type === 'image' && !acceptsImage) {
        warnings.push(t('tools.page.imageUnsupportedWarning', { name: a.name }))
      }
      if (a.type === 'video' && !acceptsVideo) {
        warnings.push(t('tools.page.videoUnsupportedWarning', { name: a.name }))
      }
    }
    return warnings
  })()
  const { data: jobsData } = useQuery<PaginatedResponse<Job>>({
    queryKey: ['jobs', _nodeType, historyPage],
    queryFn: () => api.get('/jobs', {
      params: { feature: _nodeType, page: historyPage, page_size: historyPageSize },
    }).then((r) => r.data),
    refetchInterval: activeJobId ? 3000 : 30000,
  })
  const jobs = jobsData?.items ?? []
  const historyTotal = jobsData?.total ?? 0
  const historyPageCount = Math.max(1, Math.ceil(historyTotal / historyPageSize))

  useEffect(() => {
    if (!activeJobId) return
    const activeJob = jobs.find((j) => j.ID === activeJobId)
    if (activeJob && activeJob.status !== 'pending' && activeJob.status !== 'running') {
      setActiveJobId(null)
      qc.invalidateQueries({ queryKey: ['resources'] })
    }
  }, [jobs, activeJobId, qc])

  useEffect(() => {
    if (!selectedModel?.supported_params) {
      setExtraParams({})
      return
    }
    const defaults: Record<string, string | number | boolean> = {}
    for (const p of selectedModel.supported_params) {
      if (p.default !== undefined) defaults[p.key] = p.default
    }
    setExtraParams(defaults)
  }, [selectedModel?.model_def_id])

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await api.post('/resources/upload', fd).then((r) => r.data as RawResource)
      qc.invalidateQueries({ queryKey: ['resources'] })
      addAttachment(r)
    } finally {
      setUploading(false)
    }
  }

  async function generate() {
    if (!prompt.trim() || !selectedModel) return
    // Derive the exact job_type from model capabilities and provided inputs.
    const caps = selectedModel?.capabilities ?? []
    let effectiveJobType: string = outputType
    const hasImageAttachment = attachments.some((a) => a.type === 'image')
    if (outputType === 'image' && caps.includes('image_edit') && (hasImageAttachment || !caps.includes('image'))) {
      effectiveJobType = 'image_edit'
    } else if (outputType === 'video') {
      const hasVideoAttachment = attachments.some((a) => a.type === 'video')
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
      const job = await api.post('/jobs', buildGenerationJobPayload({
        modelId: publicModelId(selectedModel),
        jobType: effectiveJobType,
        title: buildGenerationJobTitle(effectiveJobType),
        prompt,
        params: extraParams,
        inputResourceIds: attachments.map((a) => a.ID),
        featureKey: _nodeType,
      })).then((r) => r.data as Job)
      setActiveJobId(job.ID)
      setHistoryPage(1)
      setPrompt('')
      setAttachments([])
      qc.invalidateQueries({ queryKey: ['jobs', _nodeType] })
    } catch { /* toast handled by interceptor */ }
  }

  const isRunning = activeJobId != null
  // Check that all required input slots are filled.
  const requiredSlots = inputSlots?.filter((s) => s.required) ?? []
  const slotGroups = inputSlots ? slotGroupsFor(attachments) : []
  const slotsAreFilled = requiredSlots.every((slot) =>
    slotGroups.some((group) => group.slot.key === slot.key && group.indexes.length > 0)
  )
  // Fallback: if no model is selected yet but the tool demands media input, require at least one attachment.
  const fallbackInputRequired = selectedModel == null && (inputType === 'image' || inputType === 'image+video' || inputType === 'video')
  const canGenerate = !isRunning && !!prompt.trim() && !!selectedModel &&
    (requiredSlots.length > 0 ? slotsAreFilled : (!fallbackInputRequired || attachments.length > 0))
  const supportedParams = selectedModel?.supported_params ?? []

  return (
    <div className="flex flex-col h-full bg-muted/20">
      <ToolHeader
        title={toolName}
        description={toolDescription}
        icon={Wand2}
      />

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: resource panel — filter by the type needed for the next unfilled slot */}
        <ResourcePanel
          inputType={
            inputSlots
              ? 'image+video'
              : inputType === 'image+video'
              ? 'image+video'
              : (showImageInput ? 'image' : outputType)
          }
          selectedIds={attachments.map((a) => a.ID)}
          onSelect={addAttachment}
        />

        {/* Right: scrollable content — drop zone for resources */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const id = Number(e.dataTransfer.getData('application/resource-id'))
            if (!id) return
            const r = resources.find((r) => r.ID === id)
            if (r) addAttachment(r)
          }}
        >
          {/* ── Section 1: Generation input ─────────────────────────────────── */}
          <Card className="max-w-2xl mx-auto border-border bg-card bg-none text-card-foreground shadow-sm">
            <CardContent className="p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                <div className="min-w-0">
                  <p className="type-label font-medium text-foreground">{t('shared.modelSelector.label', { defaultValue: '模型' })}</p>
                  <p className="type-tiny text-muted-foreground">{toolDescription}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => setDebugMode((d) => !d)}
                    title={t('tools.debug.mode')}
                    className={cn(
                      'inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                      debugMode && 'bg-muted text-foreground'
                    )}
                  >
                    <Bug size={14} />
                  </button>
                  <ModelSelector
                    capability={capability}
                    feature={_nodeType}
                    value={selectedModelId}
                    onChange={setSelectedModelId}
                    onModelChange={setSelectedModel}
                  />
                </div>
              </div>
              {attachmentMismatchWarnings.length > 0 && (
                <div className="mb-3 space-y-1.5">
                  {attachmentMismatchWarnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2 type-label text-foreground shadow-sm">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
              <GenInputCard
                prompt={prompt}
                onPromptChange={setPrompt}
                attachments={attachments}
                onRemoveAttachment={(i) => setAttachments((a) => a.filter((_, j) => j !== i))}
                inputSlots={inputSlots}
                params={supportedParams}
                paramValues={extraParams}
                onParamChange={(key, val) => setExtraParams((p) => ({ ...p, [key]: val }))}
                onGenerate={generate}
                onUpload={uploadFile}
                isRunning={isRunning}
                canGenerate={canGenerate}
                selectedModelId={selectedModelId}
                inputType={inputType === 'image+video' ? 'image+video' : showImageInput ? 'image' : outputType}
                promptPlaceholder={promptPlaceholder}
                uploading={uploading}
                imageEditRequired={modelAcceptsImageInput}
              />
            </CardContent>
          </Card>

          {/* ── Section 2: Generation history ───────────────────────────────── */}
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-2 mb-3">
              <History size={14} className="text-muted-foreground" />
              <span className="type-label font-semibold text-muted-foreground uppercase tracking-wider">{t('shared.toolNode.generationHistory')}</span>
              {historyTotal > 0 && (
                <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 type-tiny font-semibold">
                  {historyTotal}
                </span>
              )}
              <div className="flex-1" />
              <div className="flex items-center gap-1 type-label text-muted-foreground">
                <button
                  className="p-1 rounded hover:bg-muted disabled:opacity-40"
                  disabled={historyPage <= 1}
                  onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="tabular-nums">{historyPage}/{historyPageCount}</span>
                <button
                  className="p-1 rounded hover:bg-muted disabled:opacity-40"
                  disabled={historyPage >= historyPageCount}
                  onClick={() => setHistoryPage(p => Math.min(historyPageCount, p + 1))}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {jobs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground/40 select-none">
                <Wand2 size={24} className="opacity-30" />
                <p className="type-label">{t('pages.jobs.empty')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map((job) => (
                  <GenerationCard
                    key={job.ID}
                    job={job}
                    outputType={outputType}
                    onReuse={() => setPrompt(job.prompt)}
                    debugMode={debugMode}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
