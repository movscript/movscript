import { useState, useEffect, useMemo } from 'react'
import type React from 'react'
import type { ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/infrastructure/api'
import type { RawResource, Job, PublicModel, PaginatedResponse } from '@/types'
import type { SurfaceModelCapability } from '@movscript/shared'
import {
  Bug,
  AlertTriangle,
  PanelRightClose,
} from 'lucide-react'
import { ModelSelector } from '@/shared/ui/ModelSelector'
import { ResourcePanel } from '@/shared/ui/ResourcePanel'
import type { InputSlotDef, ToolInputType } from '@/shared/ui/GenInputCard'
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
import { buildGenerationJobPayload } from '@movscript/resource-surface/data'
import { jobKeys } from '@/features/jobs/application/jobQueryKeys'
import { invalidateJobMutationResult, toolJobsChangedResult } from '@/features/jobs/application/jobMutationInvalidation'
import { resourceKeys } from '@movscript/resource-surface/data'
import { invalidateResourceMutationResult, resourceLibraryChangedResult } from '@movscript/resource-surface/data'
import { useTranslation } from 'react-i18next'
import {
  acceptResourceDropDragOver,
  resolveResourceDropResource,
} from '@movscript/resource-surface/resource-interaction'
import {
  generationExecutionJobTypeForIntent,
  generationModelAcceptsImageInput,
  generationModelAcceptsVideoInput,
  generationDefaultOperationForOutputKind,
  generationParamDefaults,
  evaluateGenerationReadiness,
  generationBackendPreflightBlockerMessages,
  generationBackendPreflightIsReady,
  generationReadinessIsReady,
  resolveGenerationJobType,
  type GenerationBackendPreflightResult,
  type GenerationIntentPayload,
} from '@movscript/core/generation'
import { ToolDialogHistorySection } from './ToolDialogHistorySection'
import {
  type ReferenceWorkbenchPaneControl,
  ToolDialogReferenceWorkbench,
} from './ToolDialogReferenceWorkbench'
import { toolResourceAccessDiagnosticMessage } from '@/features/tools/application/toolResourceAccessDiagnostics'

function buildGenerationJobTitle(jobType: string, label?: string): string {
  if (label?.trim()) return `${label.trim()}-${Math.floor(1000 + Math.random() * 9000)}`
  const labels: Record<string, string> = {
    image: '文生图',
    video: '文生视频',
    audio: '音频生成',
    text: '文本生成',
  }
  return `${labels[jobType] ?? '生成任务'}-${Math.floor(1000 + Math.random() * 9000)}`
}

function generationPreflightSignature(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!payload) return null
  const { prompt: _prompt, title: _title, ...rest } = payload
  return rest
}

function generationIntentForTool(
  outputType: ToolDialogDef['outputType'],
  operation: string | undefined,
  attachments: readonly RawResource[],
  inputSlots: readonly InputSlotDef[] | undefined,
  referenceRoleOverrides: Readonly<Record<number, string>> = {},
): GenerationIntentPayload | undefined {
  if (outputType !== 'image' && outputType !== 'video' && !operation) return undefined
  const refs = referenceAssetsForTool(attachments, inputSlots, referenceRoleOverrides)
  if (outputType === 'image') {
    const resolvedOperation = operation ?? generationDefaultOperationForOutputKind('image', refs) ?? 'text_to_image'
    return {
      capability: 'image_generation',
      operation: resolvedOperation,
      ...(refs.length > 0 ? { reference_assets: refs } : {}),
    }
  }
  if (operation && isAudioGenerationOperation(operation)) {
    return {
      capability: 'audio_generation',
      operation,
      ...(refs.length > 0 ? { reference_assets: refs } : {}),
    }
  }
  if (outputType !== 'video') return undefined
  const resolvedOperation = operation ?? generationDefaultOperationForOutputKind('video', refs) ?? 'prompt_to_video'
  return {
    capability: 'video_generation',
    operation: resolvedOperation,
    ...(refs.length > 0 ? { reference_assets: refs } : {}),
  }
}

function isAudioGenerationOperation(operation: string | undefined): boolean {
  return operation === 'text_to_speech' ||
    operation === 'speech_to_text' ||
    operation === 'speech_translate' ||
    operation === 'speech_to_speech' ||
    operation === 'voice_clone' ||
    operation === 'voice_design' ||
    operation === 'dubbing' ||
    operation === 'music_generation' ||
    operation === 'sound_effect_generation' ||
    operation === 'voice_isolation' ||
    operation === 'forced_alignment'
}

function generationCapabilityForTool(
  outputType: ToolDialogDef['outputType'],
  operation: string | undefined,
  fallback: SurfaceModelCapability,
): SurfaceModelCapability {
  if (operation && outputType === 'image') return 'image_generation'
  if (operation && outputType === 'video') return 'video_generation'
  if (operation && isAudioGenerationOperation(operation)) return 'audio_generation'
  return fallback
}

function referenceAssetRoleForToolResource(resource: RawResource): string {
  switch (resource.type) {
    case 'video':
      return 'reference_video'
    case 'audio':
      return 'reference_audio'
    case 'image':
      return 'reference_image'
    default:
      return 'generic'
  }
}

function referenceAssetsForTool(
  attachments: readonly RawResource[],
  inputSlots: readonly InputSlotDef[] | undefined,
  referenceRoleOverrides: Readonly<Record<number, string>> = {},
): NonNullable<GenerationIntentPayload['reference_assets']> {
  if (!inputSlots || inputSlots.length === 0) {
    return attachments.map((resource) => referenceAssetForToolResource(resource, undefined, referenceRoleOverrides[resource.ID]))
  }
  const used = new Set<number>()
  const refs: NonNullable<GenerationIntentPayload['reference_assets']> = []
  for (const slot of inputSlots) {
    let slotCount = 0
    for (let index = 0; index < attachments.length; index += 1) {
      if (used.has(index)) continue
      const resource = attachments[index]
      if (!resource || resource.type !== slot.type) continue
      if (slot.maxCount > 0 && slotCount >= slot.maxCount) continue
      used.add(index)
      slotCount += 1
      refs.push(referenceAssetForToolResource(resource, slot.key, referenceRoleOverrides[resource.ID]))
    }
  }
  attachments.forEach((resource, index) => {
    if (!used.has(index)) refs.push(referenceAssetForToolResource(resource, undefined, referenceRoleOverrides[resource.ID]))
  })
  return refs
}

function referenceAssetForToolResource(resource: RawResource, slotKey?: string, roleOverride?: string): NonNullable<GenerationIntentPayload['reference_assets']>[number] {
  const mediaType = referenceAssetMediaTypeForToolResource(resource)
  if (!mediaType) throw new Error('unsupported_tool_reference_media_type')
  return {
    role: roleOverride?.trim() || referenceAssetRoleForToolSlot(slotKey, resource),
    media_type: mediaType,
    resource_id: resource.ID,
  }
}

function referenceAssetRoleForToolSlot(slotKey: string | undefined, resource: RawResource): string {
  switch (slotKey) {
    case 'first_frame':
      return 'first_frame'
    case 'last_frame':
      return 'last_frame'
    case 'source_video':
      return 'source_video'
    case 'source_audio':
      return 'source_audio'
    case 'reference_video':
      return 'reference_video'
    case 'reference_audio':
      return 'reference_audio'
    case 'reference_images':
    case 'source_images':
      return 'reference_image'
    default:
      return referenceAssetRoleForToolResource(resource)
  }
}

function referenceAssetMediaTypeForToolResource(resource: RawResource): 'image' | 'video' | 'audio' | undefined {
  switch (resource.type) {
    case 'image':
    case 'video':
    case 'audio':
      return resource.type
    default:
      return undefined
  }
}

// ── ToolDialog ────────────────────────────────────────────────────────────────

export interface ToolDialogDef {
  nodeType: string
  capability: SurfaceModelCapability
  modelQueryCapabilities?: SurfaceModelCapability[]
  modelOperation?: string
  jobType?: string
  toolName: string
  toolDescription: string
  inputType: ToolInputType
  inputSlots?: InputSlotDef[]
  outputType: 'image' | 'video' | 'audio' | 'text'
  promptPlaceholder?: string
  promptRequired?: boolean
  submitPromptFallback?: string
  layout?: 'default' | 'reference-workbench'
  resourcePane?: ReactNode
  showHistory?: boolean
}

export function ToolDialog({
  nodeType: _nodeType,
  capability,
  modelQueryCapabilities,
  modelOperation,
  jobType,
  toolName,
  toolDescription,
  inputType,
  inputSlots: configuredInputSlots,
  outputType,
  promptPlaceholder,
  promptRequired = true,
  submitPromptFallback,
  layout = 'default',
  resourcePane,
  showHistory = true,
}: ToolDialogDef) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [prompt, setPrompt] = useState('')
  const [attachments, setAttachments] = useState<RawResource[]>([])
  const [referenceRoleOverrides, setReferenceRoleOverrides] = useState<Record<number, string>>({})
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<PublicModel | null>(null)
  const [extraParams, setExtraParams] = useState<Record<string, string | number | boolean>>({})
  const [uploading, setUploading] = useState(false)
  const [activeJobId, setActiveJobId] = useState<number | null>(null)
  const [debugMode, setDebugMode] = useState(false)
  const [historyPage, setHistoryPage] = useState(1)
  const [generationDiagnostic, setGenerationDiagnostic] = useState<string | undefined>(undefined)
  const historyPageSize = layout === 'reference-workbench' ? 6 : 10
  const historyCapability = generationCapabilityForTool(outputType, modelOperation, capability)

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
    if (inputType === 'audio') {
      return [{ key: 'source_audio', label: t('tools.inputs.sourceAudio', { defaultValue: '源音频' }), type: 'audio', required: true, maxCount: 1 }]
    }
    if (inputType === 'none') return []
    return [
      { key: 'reference_images', label: t('tools.inputs.referenceImages', { defaultValue: '参考图片' }), type: 'image', required: false, maxCount: 0 },
      { key: 'source_video', label: t('tools.inputs.sourceVideo', { defaultValue: '源视频' }), type: 'video', required: false, maxCount: 1 },
      { key: 'source_audio', label: t('tools.inputs.sourceAudio', { defaultValue: '源音频' }), type: 'audio', required: false, maxCount: 1 },
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

  function removeAttachment(index: number) {
    setAttachments((current) => {
      const removed = current[index]
      if (removed) {
        setReferenceRoleOverrides((roles) => {
          if (!(removed.ID in roles)) return roles
          const next = { ...roles }
          delete next[removed.ID]
          return next
        })
      }
      return current.filter((_, itemIndex) => itemIndex !== index)
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
    queryKey: jobKeys.toolHistory({
      sourceKey: _nodeType,
      operation: modelOperation,
      capability: historyCapability,
      page: historyPage,
    }),
    queryFn: () => api.get('/jobs', {
      params: {
        feature_key: _nodeType,
        generation_capability: historyCapability,
        ...(modelOperation ? { generation_operation: modelOperation } : {}),
        page: historyPage,
        page_size: historyPageSize,
      },
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
      if (activeJob.status === 'failed') {
        setGenerationDiagnostic(toolResourceAccessDiagnosticMessage(activeJob.error_msg, t))
      }
      invalidateResourceMutationResult(qc, resourceLibraryChangedResult())
    }
  }, [jobs, activeJobId, qc, t])

  useEffect(() => {
    if (!selectedModel?.supported_params) {
      setExtraParams({})
      return
    }
    setExtraParams(generationParamDefaults(selectedModel))
  }, [selectedModel?.model_id])

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
    if (!canGenerate || !selectedModel || !generationJobPayload) return

    try {
      setGenerationDiagnostic(undefined)
      const job = await api.post('/jobs', generationJobPayload).then((r) => r.data as Job)
      setActiveJobId(job.ID)
      setHistoryPage(1)
      setPrompt('')
      setAttachments([])
      setReferenceRoleOverrides({})
      invalidateJobMutationResult(qc, toolJobsChangedResult({ nodeType: _nodeType, changedIds: [job.ID] }))
    } catch (err) {
      setGenerationDiagnostic(toolResourceAccessDiagnosticMessage(err, t))
      /* toast handled by interceptor */
    }
  }

  const isRunning = activeJobId != null
  // Check that all required input slots are filled.
  const requiredSlots = inputSlots?.filter((s) => s.required) ?? []
  const slotGroups = inputSlots ? slotGroupsFor(attachments) : []
  const supportedParams = selectedModel?.supported_params ?? []
  const selectedResourceIds = attachments.map((a) => a.ID)
  const currentGenerationIntent = generationIntentForTool(outputType, modelOperation, attachments, inputSlots, referenceRoleOverrides)
  function changeReferenceAssetRole(resourceId: number, role: string) {
    setReferenceRoleOverrides((current) => {
      const next = { ...current, [resourceId]: role }
      if (role === 'first_frame') {
        for (const ref of currentGenerationIntent?.reference_assets ?? []) {
          if (!ref.resource_id || ref.resource_id === resourceId || ref.role !== 'first_frame') continue
          const resource = attachments.find((item) => item.ID === ref.resource_id)
          next[ref.resource_id] = resource ? referenceAssetRoleForToolResource(resource) : 'reference_image'
        }
      }
      return next
    })
  }
  const effectiveJobType = selectedModel
    ? currentGenerationIntent
      ? generationExecutionJobTypeForIntent(currentGenerationIntent, outputType === 'image' ? 'image' : outputType === 'audio' ? 'audio' : 'video')
      : jobType ?? resolveGenerationJobType({
          outputType,
          model: selectedModel,
          attachments,
        })
    : jobType ?? outputType
  const submitPrompt = prompt.trim() || submitPromptFallback || toolName
  const generationJobTitle = useMemo(() => buildGenerationJobTitle(effectiveJobType, toolName), [effectiveJobType, toolName])
  const generationIntentLabel = currentGenerationIntent?.operation
    ? t(`canvas.generationOperations.${currentGenerationIntent.operation}`, { defaultValue: currentGenerationIntent.operation })
    : t('shared.generation.intentUnknown', { defaultValue: '待推导' })
  const generationOutputLabel = t(`canvas.outputTypes.${outputType}`, { defaultValue: outputType })
  const generationReadiness = evaluateGenerationReadiness({
    isRunning,
    prompt,
    promptRequired,
    modelId: selectedModel ? publicModelId(selectedModel) : '',
    outputKind: outputType,
    requireGenerationIntent: outputType === 'image' || outputType === 'video' || Boolean(modelOperation) || selectedResourceIds.length > 0,
    generationIntent: currentGenerationIntent,
    inputResourceIds: selectedResourceIds,
    requiredInputs: requiredSlots.map((slot) => ({
      key: slot.key,
      label: slot.label,
      required: true,
      filled: slotGroups.some((group) => group.slot.key === slot.key && group.indexes.length > 0),
    })),
  })
  const generationJobPayloadResult = (() => {
    if (!selectedModel) return { payload: null as Record<string, unknown> | null, error: undefined as string | undefined }
    try {
      return {
        payload: buildGenerationJobPayload({
          modelId: publicModelId(selectedModel),
          jobType: effectiveJobType,
          title: generationJobTitle,
          prompt: submitPrompt,
          params: extraParams,
          supportedParams: selectedModel.supported_params,
          generationIntent: currentGenerationIntent,
          inputResourceIds: selectedResourceIds,
          sourceKey: _nodeType,
        }),
        error: undefined,
      }
    } catch (error) {
      return {
        payload: null,
        error: error instanceof Error ? error.message : t('tools.errors.runFailed', { defaultValue: '生成参数无效' }),
      }
    }
  })()
  const generationJobPayload = generationJobPayloadResult.payload
  const localReadinessWarnings = generationReadiness.blockers.map((blocker) => blocker.message)
  const readinessWarnings = [
    ...localReadinessWarnings,
    ...(generationJobPayloadResult.error ? [generationJobPayloadResult.error] : []),
  ]
  const localCanGenerate = generationReadinessIsReady(generationReadiness) && attachmentMismatchWarnings.length === 0 && !generationJobPayloadResult.error
  const generationPreflightKeyPayload = generationPreflightSignature(generationJobPayload)
  const {
    data: backendPreflight,
    error: backendPreflightError,
    isFetching: backendPreflightFetching,
  } = useQuery<GenerationBackendPreflightResult>({
    queryKey: ['generation-preflight', 'tool-dialog', _nodeType, generationPreflightKeyPayload],
    enabled: localCanGenerate && Boolean(generationJobPayload),
    queryFn: () => api.post('/jobs/preflight', generationJobPayload).then((r) => r.data as GenerationBackendPreflightResult),
    retry: false,
    staleTime: 5_000,
  })
  const backendPreflightWarnings = localCanGenerate
    ? backendPreflightError
      ? [toolResourceAccessDiagnosticMessage(backendPreflightError, t) ?? t('tools.errors.runFailed', { defaultValue: '后端预检失败' })]
      : generationBackendPreflightBlockerMessages(backendPreflight)
    : []
  const preflightWarnings = localCanGenerate && backendPreflightFetching
    ? [t('tools.generation.preflightPending', { defaultValue: '后端预检中…' })]
    : backendPreflightWarnings
  const canGenerate = localCanGenerate && Boolean(backendPreflight) && generationBackendPreflightIsReady(backendPreflight)
  const modelCapability = historyCapability
  const modelQueryCapabilityList = modelOperation && (outputType === 'image' || outputType === 'video' || isAudioGenerationOperation(modelOperation))
    ? [modelCapability]
    : modelQueryCapabilities
  const displayCapability: 'image' | 'video' | 'audio' = capability === 'video_generation'
    ? 'video'
    : capability === 'audio_generation'
      ? 'audio'
      : 'image'
  const capabilityLabel = capability === 'video_generation'
    ? t('tools.capabilities.video', { defaultValue: 'Video tool' })
    : capability === 'audio_generation'
      ? t('tools.capabilities.audio', { defaultValue: 'Audio tool' })
      : t('tools.capabilities.image', { defaultValue: 'Image tool' })
  const inputOutputLabel = t('tools.page.inputOutputLabel', {
    defaultValue: '{{input}} to {{output}}',
    input: inputType,
    output: outputType,
  })
  const mediaInputType: ToolInputType = inputType === 'none'
    ? 'none'
    : inputType === 'image+video'
      ? 'image+video'
      : inputType === 'audio' || inputType === 'text' || inputType === 'media'
        ? inputType
        : showImageInput
        ? 'image'
        : outputType === 'video'
          ? 'video'
          : 'image'
  const resourcePanelInputType: 'image' | 'video' | 'audio' | 'image+video' | 'media' = inputSlots
    ? resourcePanelInputTypeForSlots(inputSlots)
    : inputType === 'image+video'
      ? 'image+video'
      : inputType === 'audio' || inputType === 'media'
        ? inputType
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
              <p className="type-label font-medium text-foreground">{toolName}</p>
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
            </div>
          </ToolDialogPanelHeader>
          <GenInputCard
            prompt={prompt}
            onPromptChange={setPrompt}
            attachments={attachments}
            onRemoveAttachment={removeAttachment}
            onReferenceAssetRoleChange={changeReferenceAssetRole}
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
            referenceAssets={currentGenerationIntent?.reference_assets}
            intentLabel={generationIntentLabel}
            outputLabel={generationOutputLabel}
            modelLabel={t('shared.modelSelector.label', { defaultValue: '模型' })}
            modelControl={(
              <ModelSelector
                capability={modelCapability}
                queryCapabilities={modelQueryCapabilityList}
                operation={modelOperation}
                referenceAssets={currentGenerationIntent?.reference_assets}
                value={selectedModelId}
                onChange={setSelectedModelId}
                onModelChange={setSelectedModel}
              />
            )}
            messages={[
              ...attachmentMismatchWarnings,
              ...readinessWarnings,
              ...preflightWarnings,
              ...(generationDiagnostic ? [generationDiagnostic] : []),
            ]}
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
        capability={displayCapability}
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

function resourcePanelInputTypeForSlots(inputSlots: InputSlotDef[]): 'image' | 'video' | 'audio' | 'image+video' | 'media' {
  const slotTypes = new Set(inputSlots.map((slot) => slot.type))
  if (slotTypes.has('audio') || slotTypes.has('text')) return 'media'
  if (slotTypes.has('image') && slotTypes.has('video')) return 'image+video'
  if (slotTypes.has('video')) return 'video'
  return 'image'
}
