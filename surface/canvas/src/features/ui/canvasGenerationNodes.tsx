import { useState, type ReactNode } from 'react'
import type { NodeProps } from '@xyflow/react'
import { useQuery } from '@tanstack/react-query'
import { modelKeys, surfaceModelReferenceAssetsKey, type PublicModel } from '@movscript/shared'
import {
  Loader2, Play,
  Sparkles,
  Image, Video, Brush, Camera, Layers3, ImagePlus,
	  Palette, PersonStanding, RotateCw, Wrench,
	  Workflow,
	} from 'lucide-react'
import { canvasApi, canvasServicePaths } from '../application/canvasServiceApi'
import {
  publicAgentBackendModelId as publicModelId,
  publicAgentBackendModelLabel as publicModelLabel,
} from '@movscript/core/agent'
import {
  evaluateGenerationReadiness,
  firstGenerationReadinessBlockerMessage,
  generationDefaultOperationForOutputKind,
  generationOperationAcceptsReferences,
  generationOperationReferenceRequirements,
  generationReadinessIsReady,
  type GenerationIntentPayload,
} from '@movscript/core/generation'
import { useTranslation } from 'react-i18next'
import { canvasNodeStatusRecipe } from '../presentation/canvasSemanticUi'
import { canvasDefaultParamValues, canvasGenerationParamDefs, canvasParamValue, updateCanvasParam } from '../domain/canvasGenerationParams'
import { MediaViewer } from '@movscript/resource-surface/resource-media-viewer'
import {
  canvasToolActionCardLabels,
  canvasDisplayLabel,
  nodeStatusLabel,
  paramTypeText,
  portLabelText,
  resolvePorts,
  selectedCanvasModel,
  selectedInputResources,
  shouldRenderCanvasResourcePreview,
  toolConfigItems,
  toolInputSlots,
  toolOutputSlots,
} from './canvasNodeUiAdapters'
import { CanvasCardPortHandle, CanvasNodePortFrame, ToolCardNodeFrame } from './canvasNodePorts'
import type { NodeDataWithHandlers } from './canvasNodeTypes'
import {
  CanvasMediaFill,
  CanvasNodeParamCheckbox,
  CanvasNodeParamExpandButton,
  CanvasNodeParamField,
  CanvasNodeParamGrid,
  CanvasNodeParamInput,
  CanvasNodeParamSelect,
  CanvasNodeMediaResultView,
  CanvasNodeTextResultView,
  CanvasToolActionCard,
} from '@movscript/ui/business/canvas'
import {
  GenerationCallBadge,
  GenerationCallComposerRoot,
  GenerationCallConfigBlock,
  GenerationCallField,
  GenerationCallMetaRow,
  GenerationCallPromptBlock,
} from '@movscript/ui/business/generation'
import { CanvasNodeFooterText } from './CanvasNodeCardUi'
import { CanvasWorkflowReferenceCard } from './CanvasWorkflowReferenceCardUi'
import { CanvasGenerationInputPanel } from './canvasGenerationInputPanel'

const CANVAS_NODE_IMAGE_THUMB_MAX_SIZE = 320

function useCanvasGenerationModels(
  capability?: 'text' | 'image' | 'video',
  operation?: string,
  referenceAssets: NonNullable<GenerationIntentPayload['reference_assets']> = [],
) {
  const referenceAssetsKey = surfaceModelReferenceAssetsKey(referenceAssets)
  const { data = [] } = useQuery<PublicModel[]>({
    queryKey: modelKeys.intent(capability, operation, referenceAssetsKey),
    queryFn: () => capability
      ? canvasApi.get(canvasServicePaths.runtimeModels, { params: canvasGenerationModelQuery(capability, operation, referenceAssets) }).then((r) => r.data)
      : Promise.resolve([]),
    enabled: !!capability,
  })
  return data
}

function canvasGenerationModelQuery(
  capability: 'text' | 'image' | 'video',
  operation?: string,
  referenceAssets: NonNullable<GenerationIntentPayload['reference_assets']> = [],
) {
  const referenceAssetsParam = referenceAssets.length > 0
    ? { reference_assets: surfaceModelReferenceAssetsKey(referenceAssets) }
    : {}
  if (capability === 'image') return { capability: 'image_generation', ...(operation ? { operation } : {}), ...referenceAssetsParam }
  if (capability === 'video') return { capability: 'video_generation', ...(operation ? { operation } : {}), ...referenceAssetsParam }
  return { capability }
}

function canvasDefaultOperationForNode(
  type: string,
  outputType: 'image' | 'video' | 'text',
  referenceAssets: NonNullable<GenerationIntentPayload['reference_assets']> = [],
): string | undefined {
  const defaultForOutput = () => generationDefaultOperationForOutputKind(outputType, referenceAssets)
  const suggested = (() => {
  switch (type) {
    case 'ref_image_gen':
      return 'image_to_image'
    case 'multi_angle':
      return 'reference_to_image'
    case 'style_transfer':
      return 'style_transfer'
    case 'ref_video_gen':
    case 'motion_imitation':
      return 'reference_to_video'
    case 'ai_gen':
      return defaultForOutput()
    default:
      return defaultForOutput()
  }
  })()
  if (!suggested) return undefined
  return generationOperationAcceptsReferences(suggested, referenceAssets)
    ? suggested
    : defaultForOutput()
}

function canvasFallbackOperationForOutput(outputType: 'image' | 'video' | 'text'): string | undefined {
  switch (outputType) {
    case 'video':
      return 'prompt_to_video'
    case 'image':
      return 'text_to_image'
    default:
      return undefined
  }
}

function canvasNodeGenerationReadiness(
  data: NodeDataWithHandlers,
  nodeType: string,
  outputType: 'image' | 'video',
  operation: string | undefined,
  selectedModel: PublicModel | null,
  isRunning: boolean,
  referenceAssets?: NonNullable<GenerationIntentPayload['reference_assets']>,
) {
  const refs = referenceAssets ?? canvasNodeReferenceAssets(data)
  const generationIntent: GenerationIntentPayload = {
    capability: outputType === 'video' ? 'video_generation' : 'image_generation',
    operation: operation ?? canvasDefaultOperationForNode(nodeType, outputType, refs) ?? canvasFallbackOperationForOutput(outputType) ?? '',
    ...(refs.length > 0 ? { reference_assets: refs } : {}),
  }
  const hasExplicitModel = Boolean(data.modelId?.trim())
  const selectedModelId = selectedModel ? publicModelId(selectedModel) : ''
  const modelId = hasExplicitModel
    ? selectedModelId === data.modelId ? selectedModelId : ''
    : selectedModelId
  const requiresReference = generationOperationReferenceRequirements(generationIntent.operation).length > 0

  return evaluateGenerationReadiness({
    isRunning,
    prompt: data.prompt,
    promptRequired: !requiresReference,
    modelId,
    outputKind: outputType,
    requireGenerationIntent: true,
    generationIntent,
    referenceAssets: refs,
    inputResourceIds: refs.map((ref) => ref.resource_id),
  })
}

function canvasNodeReferenceAssets(data: NodeDataWithHandlers): NonNullable<GenerationIntentPayload['reference_assets']> {
  const refs: NonNullable<GenerationIntentPayload['reference_assets']> = []
  const seen = new Set<number>()
  for (const values of Object.values(data.runtimeInputValues ?? {})) {
    for (const value of values) {
      if (!value.resource_id || seen.has(value.resource_id)) continue
      const mediaType = value.media_type && value.media_type !== 'any' && value.media_type !== 'text'
        ? value.media_type
        : value.type === 'image' || value.type === 'video' || value.type === 'audio'
          ? value.type
          : undefined
      if (!mediaType) continue
      refs.push({
        resource_id: value.resource_id,
        role: value.role || canvasReferenceRoleForMediaType(mediaType),
        media_type: mediaType,
      })
      seen.add(value.resource_id)
    }
  }
  for (const resource of selectedInputResources(data)) {
    if (seen.has(resource.ID)) continue
    const mediaType = resource.type === 'image' || resource.type === 'video' || resource.type === 'audio' ? resource.type : undefined
    if (!mediaType) continue
    refs.push({
      resource_id: resource.ID,
      role: canvasReferenceRoleForMediaType(mediaType),
      media_type: mediaType,
    })
    seen.add(resource.ID)
  }
  return refs
}

function canvasReferenceRoleForMediaType(mediaType: 'image' | 'video' | 'audio') {
  if (mediaType === 'video') return 'reference_video'
  if (mediaType === 'audio') return 'reference_audio'
  return 'reference_image'
}

function canvasOperationOptionsForNode(
  type: string,
  outputType: 'image' | 'video' | 'text',
  referenceAssets: NonNullable<GenerationIntentPayload['reference_assets']> = [],
) {
  const preferred = (() => {
  if (outputType === 'image') {
    if (type === 'ref_image_gen') return ['image_to_image', 'reference_to_image', 'image_edit', 'text_to_image']
    if (type === 'multi_angle') return ['reference_to_image', 'image_to_image', 'text_to_image']
    if (type === 'style_transfer') return ['style_transfer', 'image_to_image', 'reference_to_image']
    return ['text_to_image', 'image_to_image', 'reference_to_image', 'image_edit', 'style_transfer']
  }
  if (outputType === 'video') {
    if (type === 'ref_video_gen') return ['reference_to_video', 'image_to_video', 'first_frame_to_video', 'first_last_frame_to_video', 'prompt_to_video']
    if (type === 'motion_imitation') return ['reference_to_video', 'video_to_video', 'image_to_video']
    return ['prompt_to_video', 'image_to_video', 'first_frame_to_video', 'first_last_frame_to_video', 'reference_to_video', 'video_to_video']
  }
  return []
  })()
  return preferred.filter((operation) => generationOperationAcceptsReferences(operation, referenceAssets))
}

function canvasOperationLabel(operation: string, t: (key: string, options?: any) => string) {
  return t(`canvas.generationOperations.${operation}`, { defaultValue: operation })
}

type CanvasGenerationParamItem = {
  id: string
  label: ReactNode
  type?: string
  value: string | number | boolean
  options?: Array<{ value: string; label: string }>
  min?: number
  max?: number
  step?: number
  onChange: (value: string | number | boolean) => void
}

function CanvasGenerationParamControls({
  nodeType,
  data,
  outputType,
  models,
  selectedModel,
  referenceAssets: providedReferenceAssets,
}: {
  nodeType: string
  data: NodeDataWithHandlers
  outputType?: 'image' | 'video' | 'text'
  models?: PublicModel[]
  selectedModel?: PublicModel | null
  referenceAssets?: NonNullable<GenerationIntentPayload['reference_assets']>
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const params = canvasGenerationParamDefs(nodeType, outputType, selectedModel)
  const referenceAssets = providedReferenceAssets ?? []
  const operation = outputType ? (data.modelOperation ?? canvasDefaultOperationForNode(nodeType, outputType, referenceAssets)) : undefined
  const operationOptions = outputType ? canvasOperationOptionsForNode(nodeType, outputType, referenceAssets) : []
  if (params.length === 0 && operationOptions.length === 0 && (!models || models.length === 0)) return null
  const paramItems: CanvasGenerationParamItem[] = params.map((param): CanvasGenerationParamItem => {
    const value = canvasParamValue(data, param)
    return {
      id: param.key,
      label: param.label || param.key,
      type: param.type,
      value,
      options: param.options?.map((option) => ({ value: option, label: option })),
      min: param.min,
      max: param.max,
      step: param.step,
      onChange: (nextValue) => data.onUpdateParams?.(updateCanvasParam(data, param.key, nextValue)),
    }
  })
  const visibleParamItems = expanded ? paramItems : paramItems.slice(0, 4)
  const selectedModelId = selectedModel ? publicModelId(selectedModel) : ''

  return (
    <GenerationCallConfigBlock label={t('plugins.parameters')}>
      <GenerationCallMetaRow>
        <GenerationCallField label={t('canvas.nodePanel.operation', { defaultValue: 'Operation' })}>
          {operation && operationOptions.length > 0 ? (
            <CanvasNodeParamSelect
              value={operation}
              onChange={(event) => data.onUpdateModelOperation?.(event.target.value)}
            >
              {operationOptions.map((value) => (
                <option key={value} value={value}>{canvasOperationLabel(value, t)}</option>
              ))}
            </CanvasNodeParamSelect>
          ) : (
            <GenerationCallBadge tone={operation ? 'ready' : 'neutral'}>
              {operation ? canvasOperationLabel(operation, t) : canvasFallbackIntentLabel(outputType, t)}
            </GenerationCallBadge>
          )}
        </GenerationCallField>
        <GenerationCallField label={t('canvas.nodePanel.output', { defaultValue: 'Output' })}>
          <GenerationCallBadge>
            {canvasOutputTypeLabel(outputType, t)}
          </GenerationCallBadge>
        </GenerationCallField>
        <GenerationCallField label={t('agents.model')}>
          {models && models.length > 0 ? (
            <CanvasNodeParamSelect
              value={selectedModelId}
              onChange={(event) => {
                const model = models.find((item) => publicModelId(item) === event.target.value)
                if (!model) return
                data.onUpdateModelId?.(publicModelId(model))
                data.onUpdateParams?.(canvasDefaultParamValues(canvasGenerationParamDefs(nodeType, outputType, model)))
              }}
            >
              {models.map((model) => (
                <option key={publicModelId(model)} value={publicModelId(model)}>{publicModelLabel(model)}</option>
              ))}
            </CanvasNodeParamSelect>
          ) : (
            <GenerationCallBadge tone="warning">
              {t('shared.modelSelector.noModels')}
            </GenerationCallBadge>
          )}
        </GenerationCallField>
      </GenerationCallMetaRow>
      {paramItems.length > 0 ? (
        <>
          <CanvasNodeParamGrid>
            {visibleParamItems.map((param) => (
              <CanvasGenerationParamField key={param.id} param={param} />
            ))}
          </CanvasNodeParamGrid>
          {paramItems.length > 4 ? (
            <CanvasNodeParamExpandButton onClick={() => setExpanded((value) => !value)}>
              {expanded
                ? t('common.collapse', { defaultValue: 'Collapse' })
                : t('common.expand', { defaultValue: `More parameters (${paramItems.length - 4})` })}
            </CanvasNodeParamExpandButton>
          ) : null}
        </>
      ) : (
        <GenerationCallBadge>
          {t('shared.generation.defaultParams', { defaultValue: '使用模型默认参数' })}
        </GenerationCallBadge>
      )}
    </GenerationCallConfigBlock>
  )
}

function CanvasGenerationParamField({ param }: { param: CanvasGenerationParamItem }) {
  if (param.type === 'select' && param.options) {
    return (
      <CanvasNodeParamField label={param.label}>
        <CanvasNodeParamSelect value={String(param.value)} onChange={(event) => param.onChange(event.target.value)}>
          {param.options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </CanvasNodeParamSelect>
      </CanvasNodeParamField>
    )
  }
  if (param.type === 'number') {
    return (
      <CanvasNodeParamField label={param.label}>
        <CanvasNodeParamInput
          type="number"
          value={Number.isFinite(Number(param.value)) ? Number(param.value) : ''}
          min={param.min}
          max={param.max}
          step={param.step ?? 1}
          onChange={(event) => param.onChange(event.target.value === '' ? '' : Number(event.target.value))}
        />
      </CanvasNodeParamField>
    )
  }
  if (param.type === 'boolean') {
    return (
      <CanvasNodeParamCheckbox
        checked={param.value === true || param.value === 'true'}
        onCheckedChange={param.onChange}
      >
        {param.label}
      </CanvasNodeParamCheckbox>
    )
  }
  return (
    <CanvasNodeParamField label={param.label}>
      <CanvasNodeParamInput value={String(param.value)} onChange={(event) => param.onChange(event.target.value)} />
    </CanvasNodeParamField>
  )
}

function CanvasGenerationCallPanel({
  data,
  inputType,
  nodeType,
  outputType,
  models,
  placeholder,
  referenceAssets,
  selectedModel,
}: {
  data: NodeDataWithHandlers
  inputType?: 'image' | 'video' | 'image+video'
  nodeType: string
  outputType?: 'image' | 'video' | 'text'
  models?: PublicModel[]
  placeholder?: string
  referenceAssets?: NonNullable<GenerationIntentPayload['reference_assets']>
  selectedModel?: PublicModel | null
}) {
  const { t } = useTranslation()
  return (
    <GenerationCallComposerRoot compact className="nodrag nowheel canvas-generation-call-composer">
      <GenerationCallPromptBlock label={t('shared.generation.promptLabel', { defaultValue: 'Prompt' })}>
        <CanvasGenerationInputPanel data={data} inputType={inputType} placeholder={placeholder} />
      </GenerationCallPromptBlock>
      <CanvasGenerationParamControls
        nodeType={nodeType}
        data={data}
        outputType={outputType}
        models={models}
        selectedModel={selectedModel}
        referenceAssets={referenceAssets}
      />
    </GenerationCallComposerRoot>
  )
}

function canvasFallbackIntentLabel(outputType: 'image' | 'video' | 'text' | undefined, t: (key: string, options?: any) => string) {
  if (outputType === 'text') return t('canvas.nodeLabels.text_gen', { defaultValue: 'Text generation' })
  if (outputType === 'image') return t('canvas.generationOperations.text_to_image', { defaultValue: 'Text to Image' })
  if (outputType === 'video') return t('canvas.generationOperations.prompt_to_video', { defaultValue: 'Prompt to Video' })
  return t('shared.generation.intentUnknown', { defaultValue: 'Pending' })
}

function canvasOutputTypeLabel(outputType: 'image' | 'video' | 'text' | undefined, t: (key: string, options?: any) => string) {
  if (!outputType) return t('shared.generation.intentUnknown', { defaultValue: 'Pending' })
  return t(`canvas.outputTypes.${outputType}`, { defaultValue: outputType })
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
  const resource = shouldRenderCanvasResourcePreview(data.resource, data.canvasDebug, data.canvasMediaLightweightMode) ? data.resource : undefined
  return (
    <CanvasNodeMediaResultView
      status={status}
      media={resource ? (
        <CanvasMediaFill fit="contain">
          <MediaViewer
            resource={resource}
            fit="contain"
            lightbox
            lightweightVideoThumb={outputType === 'video'}
            thumbnailMaxSize={CANVAS_NODE_IMAGE_THUMB_MAX_SIZE}
            diagnosticLabel={`canvas-result:${data.rfNodeId ?? resource.ID}`}
          />
        </CanvasMediaFill>
      ) : undefined}
      emptyIcon={outputType === 'video' ? <Video size={20} /> : <Image size={20} />}
      loadingIcon={<Loader2 size={18} />}
      error={data.error}
      failedLabel={t('pages.jobs.generationFailed')}
    />
  )
}

function CanvasTextGenerationResultPanel({ data }: { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = (data.status ?? 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'failed'
  return (
    <CanvasNodeTextResultView
      status={status}
      statusProps={canvasNodeStatusRecipe(status)}
      statusLabel={nodeStatusLabel(status)}
      prompt={data.prompt}
      loadingIcon={<Loader2 size={16} />}
      error={data.error}
      failedLabel={t('pages.jobs.generationFailed')}
      textContent={data.textContent}
    />
  )
}

// ── Tool nodes ─────────────────────────────────────────────────────────────────

const TOOL_META: Record<string, { icon: ReactNode; labelKey: string; outputType: 'image' | 'video'; capability: 'image' | 'video'; inputType: 'image' | 'video' | 'image+video' }> = {
  canvas:           { icon: <Layers3 size={12} />, labelKey: 'canvas.nodeLabels.canvas',           outputType: 'image', capability: 'image', inputType: 'image' },
  ref_image_gen:    { icon: <Palette size={12} />, labelKey: 'canvas.nodeLabels.ref_image_gen',    outputType: 'image', capability: 'image', inputType: 'image' },
  ref_video_gen:    { icon: <Camera size={12} />, labelKey: 'canvas.nodeLabels.ref_video_gen',     outputType: 'video', capability: 'video', inputType: 'image+video' },
  multi_angle:      { icon: <RotateCw size={12} />, labelKey: 'canvas.nodeLabels.multi_angle',     outputType: 'image', capability: 'image', inputType: 'image' },
  style_transfer:   { icon: <Brush size={12} />, labelKey: 'canvas.nodeLabels.style_transfer',    outputType: 'image', capability: 'image', inputType: 'image' },
  motion_imitation: { icon: <PersonStanding size={12} />, labelKey: 'canvas.nodeLabels.motion_imitation', outputType: 'video', capability: 'video', inputType: 'image+video' },
}

function WorkflowReferenceCard({ data, selected }: { data: NodeDataWithHandlers; selected?: boolean }) {
  const { t } = useTranslation()
  const { resolvedInputs, resolvedOutputs } = resolvePorts({
    nodeType: 'canvas',
    inputPorts: data.inputPorts,
    outputPorts: data.outputPorts,
  })
  const status = (data.status ?? 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'failed'
  const isRunning = status === 'pending' || status === 'running'
  const visibleInputs = resolvedInputs.slice(0, 4)
  const visibleOutputs = resolvedOutputs.slice(0, 4)
  return (
    <CanvasNodePortFrame
      inputs={resolvedInputs}
      outputs={resolvedOutputs}
      visibleInputIds={visibleInputs.map((port) => port.id)}
      visibleOutputIds={visibleOutputs.map((port) => port.id)}
    >
      <CanvasWorkflowReferenceCard
        selected={selected}
        icon={<Workflow size={15} />}
        eyebrow={t('canvas.editor.workflowReferences.cardLabel', { defaultValue: 'Workflow reference' })}
        title={data.referencedCanvasName || canvasDisplayLabel(data.label, 'canvas.nodeLabels.canvas', t)}
        status={nodeStatusLabel(status)}
        summary={t('canvas.editor.workflowReferences.portSummary', { inputs: resolvedInputs.length, outputs: resolvedOutputs.length, defaultValue: `${resolvedInputs.length} inputs · ${resolvedOutputs.length} outputs` })}
        referenceMeta={data.referencedCanvasId ? `#${data.referencedCanvasId}` : undefined}
        inputsLabel={t('canvas.editor.workflowReferences.inputs', { defaultValue: 'Inputs' })}
        outputsLabel={t('canvas.editor.workflowReferences.outputs', { defaultValue: 'Outputs' })}
        emptyInputsLabel={t('canvas.editor.workflowReferences.noInputs', { defaultValue: 'No inputs' })}
        emptyOutputsLabel={t('canvas.editor.workflowReferences.noOutputs', { defaultValue: 'No outputs' })}
        inputs={visibleInputs.map((port) => ({
          id: port.id,
          label: portLabelText(port, t),
          dataType: paramTypeText(port.type, t),
        }))}
        outputs={visibleOutputs.map((port) => ({
          id: port.id,
          label: portLabelText(port, t),
          dataType: paramTypeText(port.type, t),
        }))}
        primaryAction={data.onRun ? {
          label: isRunning ? t('canvas.runStatus.running') : t('canvas.editor.runNode', { defaultValue: 'Run' }),
          icon: isRunning ? <Loader2 size={12} /> : <Play size={12} />,
          loading: isRunning,
          onClick: data.onRun,
          disabled: isRunning,
        } : undefined}
        renderPortHandle={(handle) => <CanvasCardPortHandle {...handle} />}
      />
    </CanvasNodePortFrame>
  )
}

export function ToolNode({ data, selected, type }: NodeProps & { data: NodeDataWithHandlers; type: string }) {
  const { t } = useTranslation()
  if (type === 'canvas' && data.referencedCanvasId) {
    return <WorkflowReferenceCard data={data} selected={selected} />
  }
  const status = (data.status ?? 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'failed'
  const meta = TOOL_META[type] ?? { icon: <Wrench size={12} />, labelKey: type, outputType: 'image' as const, capability: 'image' as const, inputType: 'image' as const }
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
  const referenceAssets = canvasNodeReferenceAssets(data)
  const modelOperation = data.modelOperation ?? canvasDefaultOperationForNode(type, meta.outputType, referenceAssets)
  const models = useCanvasGenerationModels(isGenerationTool ? meta.capability : undefined, modelOperation, referenceAssets)
  const selectedModel = selectedCanvasModel(data, models)
  const readiness = isGenerationTool
    ? canvasNodeGenerationReadiness(data, type, meta.outputType, modelOperation, selectedModel, isRunning, referenceAssets)
    : evaluateGenerationReadiness({ isRunning, promptRequired: false, modelId: 'canvas' })
  const readinessMessage = firstGenerationReadinessBlockerMessage(readiness)
  const runDisabled = isRunning || !generationReadinessIsReady(readiness)

  return (
    <ToolCardNodeFrame nodeType={type} data={data}>
      <CanvasToolActionCard
        source="ai"
        tone="violet"
        icon={Icon}
        title={canvasDisplayLabel(data.label, metaLabel, t)}
        subtitle={`${meta.capability} · ${modelOperation ?? meta.outputType}`}
        status={nodeStatusLabel(status)}
        selected={selected}
        labels={canvasToolActionCardLabels(t)}
        inputs={toolInputSlots(type, data, t)}
        inputPanel={isGenerationTool ? (
          <CanvasGenerationCallPanel
            data={data}
            inputType={meta.inputType}
            nodeType={type}
            outputType={meta.outputType}
            models={models}
            selectedModel={selectedModel}
            referenceAssets={referenceAssets}
          />
        ) : undefined}
        configs={isGenerationTool ? undefined : toolConfigItems(type, data, meta.outputType, selectedModel)}
        outputs={toolOutputSlots(type, data, t)}
        resultPanel={isGenerationTool ? <CanvasGenerationResultPanel data={data} outputType={meta.outputType} /> : undefined}
        primaryAction={data.onRun ? { id: 'run', label: isRunning ? t('canvas.running') : t('canvas.run'), icon: isRunning ? Loader2 : Play, onClick: data.onRun, disabled: runDisabled } : undefined}
        secondaryAction={{ id: 'variant', label: t('canvas.nodePanel.variant'), icon: ImagePlus, disabled: true }}
        footer={data.error
          ? <CanvasNodeFooterText tone="danger">{data.error}</CanvasNodeFooterText>
          : readinessMessage
            ? <CanvasNodeFooterText>{readinessMessage}</CanvasNodeFooterText>
            : undefined}
        renderPortHandle={(handle) => <CanvasCardPortHandle {...handle} />}
      />
    </ToolCardNodeFrame>
  )
}

export function TextGenNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = (data.status ?? 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'failed'
  const isRunning = status === 'pending' || status === 'running'
  const models = useCanvasGenerationModels('text')
  const selectedModel = selectedCanvasModel(data, models)
  const readiness = evaluateGenerationReadiness({
    isRunning,
    prompt: data.prompt,
    promptRequired: true,
    modelId: selectedModel ? publicModelId(selectedModel) : '',
    outputKind: 'text',
    requireGenerationIntent: false,
  })
  const readinessMessage = firstGenerationReadinessBlockerMessage(readiness)
  const runDisabled = isRunning || !generationReadinessIsReady(readiness)
  return (
    <ToolCardNodeFrame nodeType="text_gen" data={data}>
      <CanvasToolActionCard
        source="ai"
        tone="violet"
        icon={Sparkles}
        title={canvasDisplayLabel(data.label, 'canvas.nodeLabels.text_gen', t)}
        subtitle={`text · ${t('canvas.nodePanel.outputLabel', { type: 'text' })}`}
        status={nodeStatusLabel(status)}
        selected={selected}
        labels={canvasToolActionCardLabels(t)}
        inputs={toolInputSlots('text_gen', data, t)}
        inputPanel={(
          <CanvasGenerationCallPanel
            data={data}
            nodeType="text_gen"
            outputType="text"
            models={models}
            selectedModel={selectedModel}
            placeholder={t('shared.generation.promptPlaceholder')}
          />
        )}
        outputs={toolOutputSlots('text_gen', { ...data, resource: data.resource, status }, t)}
        resultPanel={<CanvasTextGenerationResultPanel data={data} />}
        primaryAction={data.onRun ? { id: 'run', label: isRunning ? t('canvas.running') : t('canvas.run'), icon: isRunning ? Loader2 : Play, onClick: data.onRun, disabled: runDisabled } : undefined}
        secondaryAction={undefined}
        footer={readinessMessage ? <CanvasNodeFooterText>{readinessMessage}</CanvasNodeFooterText> : undefined}
        renderPortHandle={(handle) => <CanvasCardPortHandle {...handle} />}
      />
    </ToolCardNodeFrame>
  )
}

// ── AI Gen node ────────────────────────────────────────────────────────────────

export function AIGenNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = (data.status ?? 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'failed'
  const outputType = (data.outputType ?? 'image') as 'image' | 'video' | 'text'
  const isRunning = status === 'pending' || status === 'running'
  const referenceAssets = canvasNodeReferenceAssets(data)
  const modelOperation = data.modelOperation ?? canvasDefaultOperationForNode('ai_gen', outputType, referenceAssets)
  const models = useCanvasGenerationModels(outputType, modelOperation, referenceAssets)
  const selectedModel = selectedCanvasModel(data, models)
  const readiness = outputType === 'text'
    ? evaluateGenerationReadiness({
        isRunning,
        prompt: data.prompt,
        promptRequired: true,
        modelId: selectedModel ? publicModelId(selectedModel) : '',
        outputKind: 'text',
        requireGenerationIntent: false,
      })
    : canvasNodeGenerationReadiness(data, 'ai_gen', outputType, modelOperation, selectedModel, isRunning, referenceAssets)
  const readinessMessage = firstGenerationReadinessBlockerMessage(readiness)
  const runDisabled = isRunning || !generationReadinessIsReady(readiness)
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
        title={canvasDisplayLabel(data.label, 'canvas.nodeLabels.ai_gen', t)}
        subtitle={`canvas_${outputType} · ${modelOperation ?? outputType}`}
        status={nodeStatusLabel(status)}
        selected={selected}
        labels={canvasToolActionCardLabels(t)}
        inputs={toolInputSlots('ai_gen', data, t)}
        inputPanel={(
          <CanvasGenerationCallPanel
            data={data}
            inputType={outputType === 'video' ? 'video' : outputType === 'image' ? 'image' : undefined}
            nodeType="ai_gen"
            outputType={outputType}
            models={models}
            selectedModel={selectedModel}
            referenceAssets={referenceAssets}
          />
        )}
        outputs={outputSlots}
        resultPanel={outputType === 'text' ? <CanvasTextGenerationResultPanel data={data} /> : <CanvasGenerationResultPanel data={data} outputType={outputType} />}
        primaryAction={data.onRun ? { id: 'run', label: isRunning ? t('canvas.running') : t('canvas.run'), icon: isRunning ? Loader2 : Play, onClick: data.onRun, disabled: runDisabled } : undefined}
        secondaryAction={{ id: 'variant', label: t('canvas.nodePanel.type'), icon: ImagePlus, disabled: true }}
        footer={data.error
          ? <CanvasNodeFooterText tone="danger">{data.error}</CanvasNodeFooterText>
          : readinessMessage
            ? <CanvasNodeFooterText>{readinessMessage}</CanvasNodeFooterText>
            : undefined}
        renderPortHandle={(handle) => <CanvasCardPortHandle {...handle} />}
      />
    </ToolCardNodeFrame>
  )
}
