import type { CanvasNodeData, CanvasPortDef, PublicModel, RawResource } from '@/types'
import { publicModelId, publicModelLabel } from '@/shared/domain/modelDisplay'
import { canvasGenerationParamDefs, canvasParamValue } from '@/features/canvas/domain/canvasGenerationParams'
import { CANVAS_NODE_META } from '@/features/canvas/presentation/nodeCatalog'
import { resourceIdsFromCanvasPrompt } from '@/features/canvas/runtime/canvasRuntimeGraph'
import type {
  CanvasIOState,
  CanvasToolActionCardLabels,
  CanvasToolConfigItem,
  CanvasToolSlot,
  CanvasToolSlotState,
  CanvasToolSlotType,
} from '@movscript/ui'

type CanvasTranslator = (key: string, options?: any) => string

type ResourceSelectionData = Pick<CanvasNodeData, 'inputResourceIds' | 'prompt'> & {
  availableResources?: RawResource[]
  referenceResources?: RawResource[]
}

const MEDIA_NODE_TYPES = new Set(['text', 'image', 'video'])

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

export function mediaNodeInputPorts(nodeType: string, data: CanvasNodeData): CanvasNodeData['inputPorts'] {
  if (!MEDIA_NODE_TYPES.has(nodeType)) return data.inputPorts
  return data.source === 'ai' ? data.inputPorts : []
}

export function resolvePorts({
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

export function canvasNodeSemanticPort(port: CanvasPortDef, t: CanvasTranslator) {
  const typeLabelKey = PARAM_TYPE_LABELS[port.type]
  const typeLabel = typeLabelKey ? t(typeLabelKey) : port.type
  const label = port.labelKey ? t(port.labelKey, { defaultValue: port.label ?? port.id }) : (port.label ?? port.id)
  const maxCountLabel = port.maxCount ? t('canvas.ports.maxCount', { count: port.maxCount, defaultValue: `Max ${port.maxCount}` }) : null
  return {
    id: port.id,
    label,
    typeLabel,
    required: port.required,
    maxCountLabel,
    description: port.description,
  }
}

export function portLabelText(port: CanvasPortDef, t: CanvasTranslator) {
  const label = port.labelKey ? t(port.labelKey, { defaultValue: port.label ?? port.id }) : (port.label ?? port.id)
  return port.order ? `#${port.order} ${label}` : label
}

export function nodeStatusLabel(status?: CanvasNodeData['status']) {
  if (status === 'pending') return '等待中'
  if (status === 'running') return '运行中'
  if (status === 'done') return '已完成'
  if (status === 'failed') return '失败'
  return '可运行'
}

export function paramTypeText(type: string | undefined, t: CanvasTranslator) {
  const typeLabel = PARAM_TYPE_LABELS[type || '']
  return typeLabel ? t(typeLabel) : type ?? t('canvas.unset')
}

export function ioStateFromStatus(status: CanvasNodeData['status'], hasValue?: boolean): CanvasIOState {
  if (status === 'failed') return 'failed'
  if (status === 'pending' || status === 'running') return 'pending'
  return hasValue ? 'ready' : 'empty'
}

export function toolInputSlots(nodeType: string, data: CanvasNodeData, t: CanvasTranslator): CanvasToolSlot[] {
  const { resolvedInputs } = resolvePorts({ nodeType, inputPorts: data.inputPorts, outputPorts: data.outputPorts, outputs: false })
  return resolvedInputs.map((port) => ({
    id: port.id,
    inputPortId: port.id,
    label: portLabelText(port, t),
    type: port.id === 'prompt' ? 'prompt' : slotTypeFromPortType(port.type),
    state: data.status === 'failed' ? 'failed' : 'empty',
    summary: port.required ? '必需' : '可选',
  }))
}

export function toolOutputSlots(nodeType: string, data: CanvasNodeData, t: CanvasTranslator): CanvasToolSlot[] {
  const { resolvedOutputs } = resolvePorts({ nodeType, inputPorts: data.inputPorts, outputPorts: data.outputPorts, inputs: false })
  return resolvedOutputs.map((port) => ({
    id: port.id,
    outputPortId: port.id,
    label: portLabelText(port, t),
    type: slotTypeFromPortType(port.type),
    state: slotStateFromStatus(data.status, !!data.resource),
    summary: data.resource?.name ?? (data.error && data.status === 'failed' ? data.error : undefined),
  }))
}

function slotTypeFromPortType(type?: string): CanvasToolSlotType {
  if (type === 'image' || type === 'video' || type === 'json' || type === 'prompt' || type === 'text') return type
  return 'text'
}

function slotStateFromStatus(status: CanvasNodeData['status'], hasValue?: boolean): CanvasToolSlotState {
  if (status === 'failed') return 'failed'
  if (status === 'pending' || status === 'running') return 'pending'
  return hasValue ? 'ready' : 'empty'
}

export function canvasToolActionCardLabels(t: CanvasTranslator): CanvasToolActionCardLabels {
  return {
    inputs: t('canvas.nodePanel.inputs', { defaultValue: '输入' }),
    emptyInputs: t('canvas.nodePanel.waitingUpstreamInput', { defaultValue: '等待上游输入' }),
    configs: t('plugins.parameters', { defaultValue: '配置' }),
    defaultConfig: t('canvas.nodePanel.defaultConfig', { defaultValue: '默认参数' }),
    outputs: t('canvas.nodePanel.outputs', { defaultValue: '输出' }),
    emptyOutputs: t('canvas.nodePanel.notGenerated', { defaultValue: '未生成' }),
  }
}

export function selectedCanvasModel(data: CanvasNodeData, models: PublicModel[]) {
  return models.find((model) => publicModelId(model) === data.modelId)
    ?? models.find((model) => model.id === data.modelDbId)
    ?? models[0]
    ?? null
}

export function workflowInputOutputPorts(data: CanvasNodeData): CanvasPortDef[] {
  return [{
    id: 'value',
    label: data.paramName || 'input',
    type: data.paramType ?? 'text',
    order: data.paramOrder,
    required: true,
  }]
}

export function workflowOutputInputPorts(data: CanvasNodeData): CanvasPortDef[] {
  const paramType = data.paramType === 'text' || data.paramType === 'image' || data.paramType === 'video' || data.paramType === 'audio'
    ? data.paramType
    : 'image'
  return [{
    id: 'value',
    label: data.paramName || 'output',
    type: paramType,
    order: data.paramOrder,
    required: true,
  }]
}

export function resourceSinkPorts(): { inputs: CanvasPortDef[]; outputs: CanvasPortDef[] } {
  return {
    inputs: [{
      id: 'input',
      label: 'resource',
      type: 'resource',
      required: true,
    }],
    outputs: [],
  }
}

export function shouldRenderCanvasResourcePreview(
  resource: RawResource | undefined,
  canvasDebug: { media?: boolean; images?: boolean; videos?: boolean } | undefined,
  overviewMode = false,
) {
  if (!resource) return false
  if (overviewMode) return false
  if (canvasDebug?.media === false) return false
  if (resource.type === 'image' && canvasDebug?.images === false) return false
  if (resource.type === 'video' && canvasDebug?.videos === false) return false
  return true
}

export function selectedInputResources(data: ResourceSelectionData) {
  const byId = new Map((data.availableResources ?? []).map((resource) => [resource.ID, resource]))
  const seen = new Set<number>()
  const resources: RawResource[] = []
  for (const id of data.inputResourceIds ?? []) {
    const resource = byId.get(id)
    if (!resource || seen.has(resource.ID)) continue
    seen.add(resource.ID)
    resources.push(resource)
  }
  for (const id of resourceIdsFromCanvasPrompt(data.prompt)) {
    const resource = byId.get(id)
    if (!resource || seen.has(resource.ID)) continue
    seen.add(resource.ID)
    resources.push(resource)
  }
  for (const resource of data.referenceResources ?? []) {
    if (seen.has(resource.ID)) continue
    seen.add(resource.ID)
    resources.push(resource)
  }
  return resources
}

export function toolConfigItems(
  nodeType: string,
  data: CanvasNodeData,
  outputType?: 'image' | 'video' | 'text',
  selectedModel?: PublicModel | null,
): CanvasToolConfigItem[] {
  const params = canvasGenerationParamDefs(nodeType, outputType, selectedModel)
  const items = [
    { id: 'model', label: '模型', value: selectedModel ? publicModelLabel(selectedModel) : data.modelId || (data.modelDbId ? `#${data.modelDbId}` : '默认') },
    ...params.map((param) => ({
      id: param.key,
      label: param.label || param.key,
      value: formatCanvasParamValue(canvasParamValue(data, param)),
    })),
  ]
  return items.filter((item) => item.value !== '').slice(0, 3)
}

function formatCanvasParamValue(value: string | number | boolean) {
  if (value === '') return '默认'
  return String(value)
}
