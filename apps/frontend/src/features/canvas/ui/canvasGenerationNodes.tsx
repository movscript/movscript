import { useEffect, useMemo, useRef, useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import { useQuery } from '@tanstack/react-query'
import type { PublicModel, RawResource } from '@/types'
import {
  FileText, Loader2, Play,
  Sparkles, X,
  Image, Video, Brush, Camera, Layers3, ImagePlus,
	  Palette, PersonStanding, RotateCw, Wrench, Puzzle,
	  Workflow,
	} from 'lucide-react'
import { api } from '@/shared/infrastructure/api'
import { publicModelId, publicModelLabel } from '@/shared/domain/modelDisplay'
import { useTranslation } from 'react-i18next'
import { canvasNodeStatusRecipe } from '@/features/canvas/presentation/canvasSemanticUi'
import { canvasDefaultParamValues, canvasGenerationParamDefs, canvasParamValue, updateCanvasParam } from '@/features/canvas/domain/canvasGenerationParams'
import { MediaViewer } from '@/shared/ui/MediaViewer'
import {
  canvasToolActionCardLabels,
  nodeStatusLabel,
  paramTypeText,
  pluginConfigItems,
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
  CanvasMentionAttachmentThumb,
  CanvasMentionMenuThumb,
  CanvasNodeFooterText,
  CanvasNodeParamControlsView,
  CanvasNodePromptInputView,
  CanvasNodeMediaResultView,
  CanvasNodeTextResultView,
  CanvasWorkflowReferenceCard,
  CanvasToolActionCard,
  canvasMentionChipClassNames,
  type CanvasNodePromptAttachmentItem,
  type CanvasNodeMentionItem,
  type CanvasNodeParamControlItem,
} from '@movscript/ui'

const CANVAS_NODE_IMAGE_THUMB_MAX_SIZE = 320

function useCanvasGenerationModels(capability?: 'text' | 'image' | 'video') {
  const { data = [] } = useQuery<PublicModel[]>({
    queryKey: ['models', capability],
    queryFn: () => capability
      ? api.get(`/models?capability=${capability}`).then((r) => r.data)
      : Promise.resolve([]),
    enabled: !!capability,
  })
  return data
}

function canvasResourceIcon(resource: Pick<RawResource, 'type'>, size = 12) {
  if (resource.type === 'image') return <Image size={size} />
  if (resource.type === 'video') return <Video size={size} />
  return <FileText size={size} />
}

function buildCanvasChipElement(resource: RawResource): HTMLElement {
  const chip = document.createElement('span')
  chip.contentEditable = 'false'
  chip.dataset.resourceName = resource.name
  chip.dataset.resourceId = String(resource.ID)
  chip.className = canvasMentionChipClassNames.chip

  const media = document.createElement('span')
  media.className = canvasMentionChipClassNames.media
  media.dataset.type = resource.type
  media.textContent = resource.type === 'video' ? 'V' : resource.type === 'image' ? 'I' : 'T'
  chip.appendChild(media)

  const label = document.createElement('span')
  label.textContent = resource.name
  label.className = canvasMentionChipClassNames.label
  chip.appendChild(label)

  return chip
}

function serializeCanvasPrompt(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  const el = node as HTMLElement
  if (el.dataset?.resourceId) return `@[resource:${el.dataset.resourceId}]`
  return Array.from(node.childNodes).map(serializeCanvasPrompt).join('')
}

function CanvasGenerationInputPanel({
  data,
  inputType,
  placeholder,
}: {
  data: NodeDataWithHandlers
  inputType?: 'image' | 'video' | 'image+video'
  placeholder?: string
}) {
  const { t } = useTranslation()
  const editorRef = useRef<HTMLDivElement>(null)
  const mentionRangeRef = useRef<{ node: Text; start: number; end: number } | null>(null)
  const syncedPromptRef = useRef<string | null>(null)
  const renderedResourceKeyRef = useRef<string>('')
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const attachments = useMemo(
    () => selectedInputResources(data),
    [data.availableResources, data.inputResourceIds, data.prompt, data.referenceResources],
  )
  const explicitResourceIds = new Set(data.inputResourceIds ?? [])
  const mentionResources = attachments
    .filter((resource) => !mentionQuery || resource.name.toLowerCase().includes(mentionQuery))
    .slice(0, 8)
  const mentionItems: CanvasNodeMentionItem[] = mentionResources.map((resource) => ({
    id: resource.ID,
    media: (
      <CanvasMentionMenuThumb>
        {canvasResourceIcon(resource, 12)}
      </CanvasMentionMenuThumb>
    ),
    label: resource.name,
    meta: `#${resource.ID}`,
    onMouseDown: (event) => {
      event.preventDefault()
      insertMention(resource)
    },
  }))
  const attachmentItems: CanvasNodePromptAttachmentItem[] = attachments.map((resource) => {
    const removable = explicitResourceIds.has(resource.ID)
    return {
      id: resource.ID,
      media: (
        <CanvasMentionAttachmentThumb>
          {canvasResourceIcon(resource, 12)}
        </CanvasMentionAttachmentThumb>
      ),
      label: resource.name,
      removable,
      removeLabel: t('common.remove', { defaultValue: 'Remove' }),
      removeIcon: <X size={10} />,
      onRemove: removable ? () => data.onUpdateAttachments?.((data.inputResourceIds ?? []).filter((id) => id !== resource.ID)) : undefined,
      status: t('canvas.editor.connected', { defaultValue: 'Connected' }),
    }
  })
  const resourceById = useMemo(() => new Map(attachments.map((resource) => [resource.ID, resource])), [attachments])
  const resourceLookupKey = useMemo(
    () => attachments.map((resource) => `${resource.ID}:${resource.type}:${resource.name}:${resource.url}:${resource.direct_url ?? ''}`).join('|'),
    [attachments],
  )

  function editorText() {
    return editorRef.current ? serializeCanvasPrompt(editorRef.current) : ''
  }

  function handleInput() {
    const text = editorText()
    syncedPromptRef.current = text
    data.onUpdatePrompt?.(text)

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      setMentionQuery(null)
      return
    }
    const range = selection.getRangeAt(0)
    const node = range.startContainer
    if (node.nodeType !== Node.TEXT_NODE) {
      mentionRangeRef.current = null
      setMentionQuery(null)
      return
    }
    const before = (node.textContent ?? '').slice(0, range.startOffset)
    const match = before.match(/@([^\s@]*)$/)
    if (match) {
      mentionRangeRef.current = {
        node: node as Text,
        start: range.startOffset - match[0].length,
        end: range.startOffset,
      }
      setMentionQuery(match[1].toLowerCase())
    } else {
      mentionRangeRef.current = null
      setMentionQuery(null)
    }
  }

  function insertMention(resource: RawResource) {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !editorRef.current) return
    let insertRange = selection.getRangeAt(0)
    const mentionRange = mentionRangeRef.current
    if (mentionRange && mentionRange.node.isConnected) {
      const deleteRange = document.createRange()
      deleteRange.setStart(mentionRange.node, mentionRange.start)
      deleteRange.setEnd(mentionRange.node, mentionRange.end)
      deleteRange.deleteContents()
      insertRange = deleteRange
      selection.removeAllRanges()
      selection.addRange(insertRange)
    } else {
      const node = insertRange.startContainer
      if (node.nodeType === Node.TEXT_NODE) {
        const before = (node.textContent ?? '').slice(0, insertRange.startOffset)
        const match = before.match(/@([^\s@]*)$/)
        if (match) {
          const deleteRange = document.createRange()
          deleteRange.setStart(node, insertRange.startOffset - match[0].length)
          deleteRange.setEnd(node, insertRange.startOffset)
          deleteRange.deleteContents()
          insertRange = deleteRange
          selection.removeAllRanges()
          selection.addRange(insertRange)
        }
      }
    }

    const chip = buildCanvasChipElement(resource)
    const space = document.createTextNode(' ')
    insertRange.insertNode(space)
    insertRange.insertNode(chip)

    const nextRange = document.createRange()
    nextRange.setStartAfter(space)
    nextRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(nextRange)

    setMentionQuery(null)
    mentionRangeRef.current = null
    const nextText = editorText()
    syncedPromptRef.current = nextText
    data.onUpdatePrompt?.(nextText)
  }

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const prompt = data.prompt ?? ''
    const currentPrompt = serializeCanvasPrompt(editor)
    const isFocused = document.activeElement === editor || (document.activeElement ? editor.contains(document.activeElement) : false)
    if (currentPrompt === prompt && renderedResourceKeyRef.current === resourceLookupKey) {
      syncedPromptRef.current = prompt
      return
    }
    if (isFocused && syncedPromptRef.current === currentPrompt) return
    if (isFocused && syncedPromptRef.current === prompt) return
    editor.innerHTML = ''
    const pattern = /@\[resource:(\d+)\]\s?/g
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(prompt)) !== null) {
      const before = prompt.slice(lastIndex, match.index)
      if (before) editor.appendChild(document.createTextNode(before))
      const resource = resourceById.get(Number(match[1]))
      if (resource) {
        const chip = buildCanvasChipElement(resource)
        editor.appendChild(chip)
        editor.appendChild(document.createTextNode(' '))
      } else {
        editor.appendChild(document.createTextNode(match[0]))
      }
      lastIndex = pattern.lastIndex
    }
    const after = prompt.slice(lastIndex)
    if (after) editor.appendChild(document.createTextNode(after))
    syncedPromptRef.current = prompt
    renderedResourceKeyRef.current = resourceLookupKey
  }, [data.prompt, resourceById, resourceLookupKey])

  return (
    <CanvasNodePromptInputView
      editorRef={editorRef}
      placeholder={placeholder ?? (inputType ? t(`shared.genInput.promptPlaceholder.${inputType}`, { defaultValue: t('shared.generation.promptPlaceholder') }) : t('shared.generation.promptPlaceholder'))}
      onEditorInput={handleInput}
      onEditorEscape={() => setMentionQuery(null)}
      mentionOpen={mentionQuery !== null}
      mentionItems={mentionItems}
      mentionEmptyLabel={attachments.length === 0 ? t('shared.genInput.addResourcesFirst') : t('shared.genInput.noMatchedResources')}
      attachmentItems={attachmentItems}
      attachmentEmptyLabel={t('shared.genInput.selectOrUploadHint', { defaultValue: 'Select or upload resources' })}
    />
  )
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

const TOOL_META: Record<string, { icon: React.ReactNode; labelKey: string; outputType: 'image' | 'video'; capability: 'image' | 'video'; inputType: 'image' | 'video' | 'image+video' }> = {
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

export function PluginCardNode({ data, selected }: NodeProps & { data: NodeDataWithHandlers }) {
  const { t } = useTranslation()
  const status = (data.status ?? 'idle') as 'idle' | 'pending' | 'running' | 'done' | 'failed'
  const isRunning = status === 'pending' || status === 'running'
  return (
    <ToolCardNodeFrame nodeType="plugin_card" data={data}>
      <CanvasToolActionCard
        source="plugin"
        tone="cyan"
        icon={Puzzle}
        title={data.label || data.pluginName || t('canvas.nodeLabels.plugin_card')}
        subtitle={[
          data.pluginId || t('plugins.notFound'),
          data.pluginVersion ? `v${data.pluginVersion}` : null,
          data.pluginRuntime,
        ].filter(Boolean).join(' · ')}
        status={nodeStatusLabel(status)}
        selected={selected}
        labels={canvasToolActionCardLabels(t)}
        inputs={toolInputSlots('plugin_card', data, t)}
        configs={pluginConfigItems(data)}
        outputs={toolOutputSlots('plugin_card', data, t)}
        primaryAction={data.onRun ? { id: 'run', label: isRunning ? '运行中' : '运行', icon: isRunning ? Loader2 : Play, onClick: data.onRun, disabled: isRunning } : undefined}
        secondaryAction={{ id: 'config', label: '配置', icon: Wrench, disabled: true }}
        footer={data.pluginResultText ? <CanvasNodeFooterText>{data.pluginResultText}</CanvasNodeFooterText> : undefined}
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
