import type { ReactNode } from 'react'
import type { NodeProps } from '@xyflow/react'
import { useQuery } from '@tanstack/react-query'
import type { PublicModel } from '@/types'
import {
  Loader2, Play,
  Sparkles,
  Image, Video, Brush, Camera, Layers3, ImagePlus,
	  Palette, PersonStanding, RotateCw, Wrench,
	  Workflow,
	} from 'lucide-react'
import { api } from '@/shared/infrastructure/api'
import { modelKeys } from '@/shared/application/modelQueryKeys'
import { publicModelId, publicModelLabel } from '@/shared/domain/modelDisplay'
import { useTranslation } from 'react-i18next'
import { canvasNodeStatusRecipe } from '@/features/canvas/presentation/canvasSemanticUi'
import { canvasDefaultParamValues, canvasGenerationParamDefs, canvasParamValue, updateCanvasParam } from '@/features/canvas/domain/canvasGenerationParams'
import { MediaViewer } from '@/shared/ui/MediaViewer'
import {
  canvasToolActionCardLabels,
  nodeStatusLabel,
  paramTypeText,
  portLabelText,
  resolvePorts,
  selectedCanvasModel,
  shouldRenderCanvasResourcePreview,
  toolConfigItems,
  toolInputSlots,
  toolOutputSlots,
} from './canvasNodeUiAdapters'
import { CanvasCardPortHandle, CanvasNodePortFrame, ToolCardNodeFrame } from './canvasNodePorts'
import type { NodeDataWithHandlers } from './canvasNodeTypes'
import {
  CanvasMediaFill,
  CanvasNodeParamControlsView,
  CanvasNodeMediaResultView,
  CanvasNodeTextResultView,
  CanvasToolActionCard,
  type CanvasNodeParamControlItem,
} from '@movscript/ui/business/canvas'
import { CanvasNodeFooterText } from './CanvasNodeCardUi'
import { CanvasWorkflowReferenceCard } from './CanvasWorkflowReferenceCardUi'
import { CanvasGenerationInputPanel } from './canvasGenerationInputPanel'

const CANVAS_NODE_IMAGE_THUMB_MAX_SIZE = 320

function useCanvasGenerationModels(capability?: 'text' | 'image' | 'video') {
  const { data = [] } = useQuery<PublicModel[]>({
    queryKey: modelKeys.capability(capability),
    queryFn: () => capability
      ? api.get(`/models?capability=${capability}`).then((r) => r.data)
      : Promise.resolve([]),
    enabled: !!capability,
  })
  return data
}

function CanvasGenerationParamControls({
  nodeType,
  data,
  outputType,
  models,
  selectedModel,
}: {
  nodeType: string
  data: NodeDataWithHandlers
  outputType?: 'image' | 'video' | 'text'
  models?: PublicModel[]
  selectedModel?: PublicModel | null
}) {
  const { t } = useTranslation()
  const params = canvasGenerationParamDefs(nodeType, outputType, selectedModel)
  if (params.length === 0 && (!models || models.length === 0)) return null
  const paramItems: CanvasNodeParamControlItem[] = params.map((param) => {
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
  const modelControl = models && models.length > 0 ? {
    label: t('agents.model'),
    value: selectedModel ? publicModelId(selectedModel) : '',
    emptyLabel: t('shared.modelSelector.noModels'),
    options: models.map((model) => ({
      value: publicModelId(model),
      label: publicModelLabel(model),
    })),
    onChange: (value: string) => {
      const model = models.find((item) => publicModelId(item) === value)
      if (!model) return
      data.onUpdateModelId?.(publicModelId(model), model.id)
      data.onUpdateParams?.(canvasDefaultParamValues(canvasGenerationParamDefs(nodeType, outputType, model)))
    },
  } : undefined

  return (
    <CanvasNodeParamControlsView
      title={t('plugins.parameters')}
      icon={<Wrench size={12} />}
      model={modelControl}
      params={paramItems}
      collapseLabel={t('common.collapse', { defaultValue: 'Collapse' })}
      expandLabel={t('common.expand', { defaultValue: `More parameters (${params.length - 2})` })}
    />
  )
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
  ref_video_gen:    { icon: <Camera size={12} />, labelKey: 'canvas.nodeLabels.ref_video_gen',     outputType: 'video', capability: 'video', inputType: 'video' },
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
        title={data.referencedCanvasName || data.label || t('canvas.nodeLabels.canvas')}
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
  const models = useCanvasGenerationModels(isGenerationTool ? meta.capability : undefined)
  const selectedModel = selectedCanvasModel(data, models)

  return (
    <ToolCardNodeFrame nodeType={type} data={data}>
      <CanvasToolActionCard
        source="ai"
        tone="violet"
        icon={Icon}
        title={data.label || metaLabel}
        subtitle={`${meta.capability} · 输出 ${meta.outputType}`}
        status={nodeStatusLabel(status)}
        selected={selected}
        labels={canvasToolActionCardLabels(t)}
        inputs={toolInputSlots(type, data, t)}
        inputPanel={isGenerationTool ? (
          <>
            <CanvasGenerationInputPanel data={data} inputType={meta.inputType} />
            <CanvasGenerationParamControls nodeType={type} data={data} outputType={meta.outputType} models={models} selectedModel={selectedModel} />
          </>
        ) : undefined}
        configs={isGenerationTool ? undefined : toolConfigItems(type, data, meta.outputType, selectedModel)}
        outputs={toolOutputSlots(type, data, t)}
        resultPanel={isGenerationTool ? <CanvasGenerationResultPanel data={data} outputType={meta.outputType} /> : undefined}
        primaryAction={data.onRun ? { id: 'run', label: isRunning ? '运行中' : '运行', icon: isRunning ? Loader2 : Play, onClick: data.onRun, disabled: isRunning } : undefined}
        secondaryAction={{ id: 'variant', label: '变体', icon: ImagePlus, disabled: true }}
        footer={data.error ? <CanvasNodeFooterText tone="danger">{data.error}</CanvasNodeFooterText> : undefined}
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
  return (
    <ToolCardNodeFrame nodeType="text_gen" data={data}>
      <CanvasToolActionCard
        source="ai"
        tone="violet"
        icon={Sparkles}
        title={data.label || t('canvas.nodeLabels.text_gen')}
        subtitle="text · 输出 text"
        status={nodeStatusLabel(status)}
        selected={selected}
        labels={canvasToolActionCardLabels(t)}
        inputs={toolInputSlots('text_gen', data, t)}
        inputPanel={(
          <>
            <CanvasGenerationInputPanel data={data} placeholder={t('shared.generation.promptPlaceholder')} />
            <CanvasGenerationParamControls nodeType="text_gen" data={data} outputType="text" models={models} selectedModel={selectedModel} />
          </>
        )}
        outputs={toolOutputSlots('text_gen', { ...data, resource: data.resource, status }, t)}
        resultPanel={<CanvasTextGenerationResultPanel data={data} />}
        primaryAction={data.onRun ? { id: 'run', label: isRunning ? '运行中' : '运行', icon: isRunning ? Loader2 : Play, onClick: data.onRun, disabled: isRunning } : undefined}
        secondaryAction={undefined}
        footer={undefined}
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
  const models = useCanvasGenerationModels(outputType)
  const selectedModel = selectedCanvasModel(data, models)
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
        labels={canvasToolActionCardLabels(t)}
        inputs={toolInputSlots('ai_gen', data, t)}
        inputPanel={(
          <>
            <CanvasGenerationInputPanel data={data} inputType={outputType === 'video' ? 'video' : 'image'} />
            <CanvasGenerationParamControls nodeType="ai_gen" data={data} outputType={outputType} models={models} selectedModel={selectedModel} />
          </>
        )}
        outputs={outputSlots}
        resultPanel={outputType === 'text' ? <CanvasTextGenerationResultPanel data={data} /> : <CanvasGenerationResultPanel data={data} outputType={outputType} />}
        primaryAction={data.onRun ? { id: 'run', label: isRunning ? '运行中' : '运行', icon: isRunning ? Loader2 : Play, onClick: data.onRun, disabled: isRunning } : undefined}
        secondaryAction={{ id: 'variant', label: '类型', icon: ImagePlus, disabled: true }}
        footer={data.error ? <CanvasNodeFooterText tone="danger">{data.error}</CanvasNodeFooterText> : undefined}
        renderPortHandle={(handle) => <CanvasCardPortHandle {...handle} />}
      />
    </ToolCardNodeFrame>
  )
}
