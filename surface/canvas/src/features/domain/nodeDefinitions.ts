import type { CanvasNodeData, CanvasPortDef, NodeType } from '@movscript/shared'

export type CanvasNodeCategory = 'flow' | 'media' | 'ai' | 'organization'

export interface CanvasNodeDefinition {
  type: NodeType
  label: string
  labelKey: string
  description: string
  descriptionKey: string
  defaultLabelKey: string
  category: CanvasNodeCategory
  inputs: CanvasPortDef[]
  outputs: CanvasPortDef[]
  defaultData: Partial<CanvasNodeData> & { label: string }
}

export const CANVAS_NODE_CATEGORIES: Array<{
  id: CanvasNodeCategory
  title: string
  titleKey: string
  description: string
  descriptionKey: string
}> = [
  { id: 'flow', title: 'Input / Output', titleKey: 'canvas.catalog.categories.flow.title', description: 'Define workflow entry, exit, and approval gates.', descriptionKey: 'canvas.catalog.categories.flow.description' },
  { id: 'media', title: 'Media', titleKey: 'canvas.catalog.categories.media.title', description: 'Hold text, image, and video assets.', descriptionKey: 'canvas.catalog.categories.media.description' },
  { id: 'ai', title: 'AI Processing', titleKey: 'canvas.catalog.categories.ai.title', description: 'Transform upstream input into generated results.', descriptionKey: 'canvas.catalog.categories.ai.description' },
  { id: 'organization', title: 'Organization', titleKey: 'canvas.catalog.categories.organization.title', description: 'Organize complex canvases with regions and visual groups.', descriptionKey: 'canvas.catalog.categories.organization.description' },
]

const port = (id: string, type: CanvasPortDef['type'], extra?: Omit<CanvasPortDef, 'id' | 'type'>): CanvasPortDef => ({
  id,
  type,
  ...extra,
})

export const CANVAS_NODE_DEFINITIONS: CanvasNodeDefinition[] = [
  {
    type: 'input',
    label: 'User Input',
    labelKey: 'canvas.catalog.nodes.input.label',
    description: 'Collect text input when running a workflow.',
    descriptionKey: 'canvas.catalog.nodes.input.description',
    defaultLabelKey: 'canvas.nodeLabels.input',
    category: 'flow',
    inputs: [],
    outputs: [port('value', 'text')],
    defaultData: { source: 'manual', label: 'Input', inputValue: '', paramName: 'input', paramType: 'text' },
  },
  {
    type: 'output',
    label: 'Workflow Output',
    labelKey: 'canvas.catalog.nodes.output.label',
    description: 'Expose a typed workflow result to callers.',
    descriptionKey: 'canvas.catalog.nodes.output.description',
    defaultLabelKey: 'canvas.nodeLabels.output',
    category: 'flow',
    inputs: [port('value', 'image')],
    outputs: [],
    defaultData: { source: 'manual', label: 'Output', paramName: 'output', paramType: 'image' },
  },
  {
    type: 'resource_sink',
    label: 'Save Resource',
    labelKey: 'canvas.catalog.nodes.resource_sink.label',
    description: 'Persist an upstream value to the resource library.',
    descriptionKey: 'canvas.catalog.nodes.resource_sink.description',
    defaultLabelKey: 'canvas.nodeLabels.resource_sink',
    category: 'flow',
    inputs: [port('input', 'resource')],
    outputs: [],
    defaultData: { source: 'manual', label: 'Save Resource', paramName: '' },
  },
  {
    type: 'approval',
    label: 'Manual Approval',
    labelKey: 'canvas.catalog.nodes.approval.label',
    description: 'Pause the workflow at key steps for review.',
    descriptionKey: 'canvas.catalog.nodes.approval.description',
    defaultLabelKey: 'canvas.nodeLabels.approval',
    category: 'flow',
    inputs: [port('review_item', 'resource')],
    outputs: [port('approved_item', 'resource')],
    defaultData: { source: 'manual', label: 'Manual Approval', approvalStatus: 'waiting' },
  },
  {
    type: 'text',
    label: 'Text',
    labelKey: 'canvas.catalog.nodes.text.label',
    description: 'Write, upload, or receive AI text.',
    descriptionKey: 'canvas.catalog.nodes.text.description',
    defaultLabelKey: 'canvas.nodeLabels.text',
    category: 'media',
    inputs: [port('input', 'text')],
    outputs: [port('text', 'text')],
    defaultData: { source: 'manual', label: 'Text', textContent: '' },
  },
  {
    type: 'image',
    label: 'Image',
    labelKey: 'canvas.catalog.nodes.image.label',
    description: 'Image resource or generated image result.',
    descriptionKey: 'canvas.catalog.nodes.image.description',
    defaultLabelKey: 'canvas.nodeLabels.image',
    category: 'media',
    inputs: [port('input', 'image')],
    outputs: [port('image', 'image')],
    defaultData: { source: 'upload', label: 'Image' },
  },
  {
    type: 'video',
    label: 'Video',
    labelKey: 'canvas.catalog.nodes.video.label',
    description: 'Video resource or generated result.',
    descriptionKey: 'canvas.catalog.nodes.video.description',
    defaultLabelKey: 'canvas.nodeLabels.video',
    category: 'media',
    inputs: [port('input', 'video')],
    outputs: [port('video', 'video')],
    defaultData: { source: 'upload', label: 'Video' },
  },
  {
    type: 'text_gen',
    label: 'Text Generation',
    labelKey: 'canvas.catalog.nodes.text_gen.label',
    description: 'Expand, summarize, or rewrite from upstream content.',
    descriptionKey: 'canvas.catalog.nodes.text_gen.description',
    defaultLabelKey: 'canvas.nodeLabels.text_gen',
    category: 'ai',
    inputs: [port('prompt', 'text'), port('context', 'text')],
    outputs: [port('text', 'text')],
    defaultData: { source: 'ai', label: 'Text Generation' },
  },
  {
    type: 'reference_to_image',
    label: 'Reference to Image',
    labelKey: 'canvas.catalog.nodes.reference_to_image.label',
    description: 'Generate or edit an image from target and reference images.',
    descriptionKey: 'canvas.catalog.nodes.reference_to_image.description',
    defaultLabelKey: 'canvas.nodeLabels.reference_to_image',
    category: 'ai',
    inputs: [port('target', 'image', { mediaType: 'image', role: 'target_image', required: false }), port('references', 'image', { mediaType: 'image', role: 'reference_image', required: true, maxCount: 8 }), port('prompt', 'text')],
    outputs: [port('image', 'image')],
    defaultData: { source: 'ai', label: 'Reference to Image', outputType: 'image', modelOperation: 'reference_to_image' },
  },
  {
    type: 'reference_to_video',
    label: 'Reference to Video',
    labelKey: 'canvas.catalog.nodes.reference_to_video.label',
    description: 'Generate or edit video from image, video, or audio references.',
    descriptionKey: 'canvas.catalog.nodes.reference_to_video.description',
    defaultLabelKey: 'canvas.nodeLabels.reference_to_video',
    category: 'ai',
    inputs: [port('reference_images', 'image', { mediaType: 'image', role: 'reference_image', required: false, maxCount: 8 }), port('reference_video', 'video', { mediaType: 'video', role: 'reference_video', required: false, maxCount: 1 }), port('reference_audio', 'audio', { mediaType: 'audio', role: 'reference_audio', required: false, maxCount: 1 }), port('prompt', 'text')],
    outputs: [port('video', 'video')],
    defaultData: { source: 'ai', label: 'Reference to Video', outputType: 'video', modelOperation: 'reference_to_video' },
  },
  {
    type: 'canvas',
    label: 'Canvas Reference',
    labelKey: 'canvas.catalog.nodes.canvas.label',
    description: 'Reuse intermediate results from another canvas.',
    descriptionKey: 'canvas.catalog.nodes.canvas.description',
    defaultLabelKey: 'canvas.nodeLabels.canvas',
    category: 'ai',
    inputs: [],
    outputs: [port('result', 'resource')],
    defaultData: { source: 'ai', label: 'Canvas Reference', outputType: 'image' },
  },
  {
    type: 'group',
    label: 'Group',
    labelKey: 'canvas.catalog.nodes.group.label',
    description: 'Select and organize a group of nodes.',
    descriptionKey: 'canvas.catalog.nodes.group.description',
    defaultLabelKey: 'canvas.nodeLabels.group',
    category: 'organization',
    inputs: [],
    outputs: [],
    defaultData: { source: 'manual', label: 'Group', isGroup: true, groupWidth: 320, groupHeight: 240 },
  },
]

export const CANVAS_NODE_DEFINITION_MAP = CANVAS_NODE_DEFINITIONS.reduce((acc, item) => {
  acc[item.type] = item
  return acc
}, {} as Record<NodeType, CanvasNodeDefinition>)

export const CANVAS_NODE_LABELS = CANVAS_NODE_DEFINITIONS.reduce((acc, item) => {
  acc[item.type] = item.label
  return acc
}, {} as Record<NodeType, string>)
