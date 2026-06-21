import { useState, useEffect } from 'react'
import type React from 'react'
import type { ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/infrastructure/api'
import type { RawResource, NodeType, Job, PublicModel, PaginatedResponse } from '@/types'
import {
  Bug,
  AlertTriangle,
  PanelRightClose,
} from 'lucide-react'
import { ModelSelector } from '@/shared/ui/ModelSelector'
import { ResourcePanel } from '@/shared/ui/ResourcePanel'
import type { InputSlotDef } from '@/shared/ui/GenInputCard'
import { GenInputCard } from '@/shared/ui/GenInputCard'
import {
  ToolDialogBody,
  ToolDialogFrame,
  ToolDialogMain,
  ToolDialogPanel,
  ToolDialogPanelHeader,
  ToolDialogWarningCallout
} from './ToolDialogUi'
import { Button } from '@movscript/ui/primitives'
import { publicModelId } from '@/shared/domain/modelDisplay'
import { buildGenerationJobPayload } from '@/features/resources/domain/generationJobPayload'
import { jobKeys } from '@/features/jobs/application/jobQueryKeys'
import { invalidateJobMutationResult, toolJobsChangedResult } from '@/features/jobs/application/jobMutationInvalidation'
import { resourceKeys } from '@/features/resources/application/resourceQueryKeys'
import { invalidateResourceMutationResult, resourceLibraryChangedResult } from '@/features/resources/application/resourceMutationInvalidation'
import { useTranslation } from 'react-i18next'
import {
  acceptResourceDropDragOver,
  resolveResourceDropResource,
} from '@/features/resources/domain/resourceInteraction'
import {
  generationModelAcceptsImageInput,
  generationModelAcceptsVideoInput,
  generationParamDefaults,
  resolveGenerationJobType,
} from '@movscript/core/generation'
import { ToolDialogHistorySection } from './ToolDialogHistorySection'
import {
  type ReferenceWorkbenchPaneControl,
  ToolDialogReferenceWorkbench,
} from './ToolDialogReferenceWorkbench'

function buildGenerationJobTitle(jobType: string): string {
  const labels: Record<string, string> = {
    image: '文生图',
    image_edit: '参考生图',
    video: '文生视频',
    video_i2v: '参考生视频',
    video_v2v: '视频迁移',
    audio_tts: '音频生成',
  }
  return `${labels[jobType] ?? '生成任务'}-${Math.floor(1000 + Math.random() * 9000)}`
}

// ── ToolDialog ────────────────────────────────────────────────────────────────

export interface ToolDialogDef {
  nodeType: NodeType
  capability: 'image' | 'video' | 'audio'
  toolName: string
  toolDescription: string
  inputType: 'none' | 'image' | 'video' | 'image+video'
  inputSlots?: InputSlotDef[]
  outputType: 'image' | 'video' | 'audio'
  promptPlaceholder?: string
  layout?: 'default' | 'reference-workbench'
  resourcePane?: ReactNode
  showHistory?: boolean
}

export function ToolDialog({
  nodeType: _nodeType,
  capability,
  toolName,
  toolDescription,
  inputType,
  inputSlots: configuredInputSlots,
  outputType,
  promptPlaceholder,
  layout = 'default',
  resourcePane,
  showHistory = true,
}: ToolDialogDef) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [prompt, setPrompt] = useState('')
  const [attachments, setAttachments] = useState<RawResource[]>([])
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<PublicModel | null>(null)
  const [extraParams, setExtraParams] = useState<Record<string, string | number | boolean>>({})
  const [uploading, setUploading] = useState(false)
  const [activeJobId, setActiveJobId] = useState<number | null>(null)
  const [debugMode, setDebugMode] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const historyPageSize = layout === 'reference-workbench' ? 6 : 10

  const { data: resourcesData } = useQuery<RawResource[]>({
    queryKey: resourceKeys.all,
    queryFn: () => api.get('/resources').then((r) => r.data),
  })
  const resources = resourcesData ?? []

  const modelAcceptsImageInput = generationModelAcceptsImageInput(selectedModel)
  // Fallback to static inputType for tools where the model hasn't been selected yet.
  const showImageInput = modelAcceptsImageInput || (selectedModel == null && (inputType === 'image' || inputType === 'image+video'))

  // Product tools own their typed input slots on the frontend. The backend only sees resource ids and runtime capability.
  const inputSlots: InputSlotDef[] | undefined = (() => {
    if (configuredInputSlots && configuredInputSlots.length > 0) return configuredInputSlots
    if (inputType === 'image') {
      return [{ key: 'reference_images', label: t('tools.inputs.referenceImages', { defaultValue: '参考图片' }), type: 'image', required: true, maxCount: 0 }]
    }
    if (inputType === 'video') {
      return [{ key: 'source_video', label: t('tools.inputs.sourceVideo', { defaultValue: '源视频' }), type: 'video', required: true, maxCount: 1 }]
    }
    if (inputType === 'none') return []
    return [
      { key: 'reference_images', label: t('tools.inputs.referenceImages', { defaultValue: '参考图片' }), type: 'image', required: false, maxCount: 0 },
      { key: 'source_video', label: t('tools.inputs.sourceVideo', { defaultValue: '源视频' }), type: 'video', required: false, maxCount: 1 },
    ]
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
    const warnings: string[] = []
    const acceptsImage = generationModelAcceptsImageInput(selectedModel)
    const acceptsVideo = generationModelAcceptsVideoInput(selectedModel)
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
    queryKey: jobKeys.toolHistory(_nodeType, historyPage),
    queryFn: () => api.get('/jobs', {
      params: { feature_key: _nodeType, page: historyPage, page_size: historyPageSize },
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
      invalidateResourceMutationResult(qc, resourceLibraryChangedResult())
    }
  }, [jobs, activeJobId, qc])

  useEffect(() => {
    if (!selectedModel?.supported_params) {
      setExtraParams({})
      return
    }
    setExtraParams(generationParamDefaults(selectedModel))
  }, [selectedModel?.model_def_id])

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await api.post('/resources/upload', fd).then((r) => r.data as RawResource)
      invalidateResourceMutationResult(qc, resourceLibraryChangedResult({ changedIds: [r.ID] }))
      addAttachment(r)
    } finally {
      setUploading(false)
    }
  }

  async function generate() {
    if (!prompt.trim() || !selectedModel) return
    const effectiveJobType = resolveGenerationJobType({
      outputType,
      model: selectedModel,
      attachments,
    })

    try {
      const job = await api.post('/jobs', buildGenerationJobPayload({
        modelId: publicModelId(selectedModel),
        jobType: effectiveJobType,
        title: buildGenerationJobTitle(effectiveJobType),
        prompt,
        params: extraParams,
        inputResourceIds: attachments.map((a) => a.ID),
        sourceKey: _nodeType,
      })).then((r) => r.data as Job)
      setActiveJobId(job.ID)
      setHistoryPage(1)
      setPrompt('')
      setAttachments([])
      invalidateJobMutationResult(qc, toolJobsChangedResult({ nodeType: _nodeType, changedIds: [job.ID] }))
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
  const selectedResourceIds = attachments.map((a) => a.ID)
  const capabilityLabel = capability === 'video'
    ? t('tools.capabilities.video', { defaultValue: 'Video tool' })
    : capability === 'audio'
      ? t('tools.capabilities.audio', { defaultValue: 'Audio tool' })
      : t('tools.capabilities.image', { defaultValue: 'Image tool' })
  const inputOutputLabel = t('tools.page.inputOutputLabel', {
    defaultValue: '{{input}} to {{output}}',
    input: inputType,
    output: outputType,
  })
  const mediaInputType: 'none' | 'image' | 'video' | 'image+video' = inputType === 'none'
    ? 'none'
    : inputType === 'image+video'
      ? 'image+video'
      : showImageInput
        ? 'image'
        : outputType === 'video'
          ? 'video'
          : 'image'
  const resourcePanelInputType: 'image' | 'video' | 'image+video' = inputSlots
    ? 'image+video'
    : inputType === 'image+video'
      ? 'image+video'
      : showImageInput
        ? 'image'
        : outputType === 'video'
          ? 'video'
          : 'image'
  const resourcePaneNode = inputType === 'none' ? null : resourcePane ?? (
      <ResourcePanel
        inputType={resourcePanelInputType}
        selectedIds={selectedResourceIds}
        onSelect={addAttachment}
      />
    )

  const renderMainPane = (resourcePaneController?: ReferenceWorkbenchPaneControl) => (
    <ToolDialogMain
      onDragOver={(event) => {
        if (!acceptResourceDropDragOver(event.dataTransfer)) return
        event.preventDefault()
      }}
      onDrop={(event) => {
        event.preventDefault()
        const resource = resolveResourceDropResource({
          dataTransfer: event.dataTransfer,
          resources,
        })
        if (resource) addAttachment(resource)
      }}
    >
      {/* ── Section 1: Generation input ─────────────────────────────────── */}
      <ToolDialogPanel>
          <ToolDialogPanelHeader>
            <div className="min-w-0">
              <p className="type-label font-medium text-foreground">{t('shared.modelSelector.label', { defaultValue: '模型' })}</p>
              <p className="type-tiny text-muted-foreground">{toolDescription}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {resourcePaneController && !resourcePaneController.collapsed ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title={t('common.hide', { defaultValue: '隐藏' })}
                  aria-label={t('common.hide', { defaultValue: '隐藏' })}
                  onClick={resourcePaneController.collapse}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <PanelRightClose size={14} />
                </Button>
              ) : null}
              <Button
                type="button"
                variant={debugMode ? 'soft' : 'outline'}
                size="icon-sm"
                onClick={() => setDebugMode((d) => !d)}
                title={t('tools.debug.mode')}
                className="text-muted-foreground hover:text-foreground"
              >
                <Bug size={14} />
              </Button>
              <ModelSelector
                capability={capability}
                value={selectedModelId}
                onChange={setSelectedModelId}
                onModelChange={setSelectedModel}
              />
            </div>
          </ToolDialogPanelHeader>
          {attachmentMismatchWarnings.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {attachmentMismatchWarnings.map((w, i) => (
                <ToolDialogWarningCallout key={i} icon={AlertTriangle}>
                  <span>{w}</span>
                </ToolDialogWarningCallout>
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
            inputType={mediaInputType}
            promptPlaceholder={promptPlaceholder}
            uploading={uploading}
            imageEditRequired={modelAcceptsImageInput}
          />
      </ToolDialogPanel>

      {showHistory ? (
        <ToolDialogHistorySection
          jobs={jobs}
          historyPage={historyPage}
          historyPageCount={historyPageCount}
          historyTotal={historyTotal}
          layout={layout}
          outputType={outputType}
          debugMode={debugMode}
          onPreviousPage={() => setHistoryPage(p => Math.max(1, p - 1))}
          onNextPage={() => setHistoryPage(p => Math.min(historyPageCount, p + 1))}
          onReusePrompt={setPrompt}
        />
      ) : null}
    </ToolDialogMain>
  )

  if (layout === 'reference-workbench') {
    return (
      <ToolDialogReferenceWorkbench
        capability={capability}
        capabilityLabel={capabilityLabel}
        inputOutputLabel={inputOutputLabel}
        renderMainPane={renderMainPane}
        resourcePaneNode={resourcePaneNode}
        toolDescription={toolDescription}
        toolName={toolName}
      />
    )
  }

  return (
    <ToolDialogFrame>
      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <ToolDialogBody>
        {/* Left: resource panel — filter by the type needed for the next unfilled slot */}
        {resourcePaneNode}

        {/* Right: scrollable content — drop zone for resources */}
        {renderMainPane()}
      </ToolDialogBody>
    </ToolDialogFrame>
  )
}
