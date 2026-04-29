import type { LucideIcon } from 'lucide-react'
import {
  Boxes,
  Brush,
  Camera,
  Database,
  FileText,
  HardDrive,
  Image,
  Layers3,
  LogIn,
  LogOut,
  Music,
  Palette,
  PersonStanding,
  RotateCw,
  Sparkles,
  UserCheck,
  Video,
  Wand2,
} from 'lucide-react'
import type { CanvasNodeData, CanvasPortDef, EntityWorkflowSchema, NodeType } from '@/types'

export type CanvasNodeCategory = 'flow' | 'media' | 'ai' | 'organization'

export interface CanvasNodeCatalogItem {
  type: NodeType
  label: string
  labelKey: string
  description: string
  descriptionKey: string
  defaultLabelKey: string
  category: CanvasNodeCategory
  icon: LucideIcon
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
  { id: 'media', title: 'Media', titleKey: 'canvas.catalog.categories.media.title', description: 'Hold text, image, video, and audio assets.', descriptionKey: 'canvas.catalog.categories.media.description' },
  { id: 'ai', title: 'AI Processing', titleKey: 'canvas.catalog.categories.ai.title', description: 'Transform upstream input into generated results.', descriptionKey: 'canvas.catalog.categories.ai.description' },
  { id: 'organization', title: 'Organization', titleKey: 'canvas.catalog.categories.organization.title', description: 'Organize complex canvases with regions and semantic groups.', descriptionKey: 'canvas.catalog.categories.organization.description' },
]

const port = (id: string, type: CanvasPortDef['type'], extra?: Omit<CanvasPortDef, 'id' | 'type'>): CanvasPortDef => ({
  id,
  type,
  ...extra,
})

export function portsForEntitySchema(schema?: EntityWorkflowSchema): { inputs: CanvasPortDef[]; outputs: CanvasPortDef[] } | undefined {
  if (!schema) return undefined
  const inputs: CanvasPortDef[] = []
  const outputs: CanvasPortDef[] = []
  schema.sections.forEach((section) => {
    section.fields.forEach((field) => {
      const port: CanvasPortDef = {
        id: field.workflow.portId,
        aliases: field.workflow.aliases ?? field.aliases,
        label: field.fallbackLabel,
        labelKey: field.labelKey,
        type: field.valueType,
        required: field.workflow.required,
        maxCount: field.workflow.maxCount,
        deprecated: field.deprecated,
      }
      if (field.workflow.writable) inputs.push(port)
      if (field.workflow.readable) outputs.push(port)
    })
  })
  return { inputs, outputs }
}

export const CANVAS_NODE_CATALOG: CanvasNodeCatalogItem[] = [
  {
    type: 'input',
    label: 'User Input',
    labelKey: 'canvas.catalog.nodes.input.label',
    description: 'Collect text input when running a workflow.',
    descriptionKey: 'canvas.catalog.nodes.input.description',
    defaultLabelKey: 'canvas.nodeLabels.input',
    category: 'flow',
    icon: LogIn,
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
    icon: LogOut,
    inputs: [port('value', 'resource')],
    outputs: [],
    defaultData: { source: 'manual', label: 'Output', paramName: 'output', paramType: 'resource' },
  },
  {
    type: 'resource_sink',
    label: 'Save Resource',
    labelKey: 'canvas.catalog.nodes.resource_sink.label',
    description: 'Persist an upstream value to the resource library.',
    descriptionKey: 'canvas.catalog.nodes.resource_sink.description',
    defaultLabelKey: 'canvas.nodeLabels.resource_sink',
    category: 'flow',
    icon: HardDrive,
    inputs: [port('input', 'resource')],
    outputs: [port('resource', 'resource')],
    defaultData: { source: 'manual', label: 'Save Resource', paramName: 'resource', paramType: 'resource' },
  },
  {
    type: 'approval',
    label: 'Manual Approval',
    labelKey: 'canvas.catalog.nodes.approval.label',
    description: 'Pause the workflow at key steps for review.',
    descriptionKey: 'canvas.catalog.nodes.approval.description',
    defaultLabelKey: 'canvas.nodeLabels.approval',
    category: 'flow',
    icon: UserCheck,
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
    icon: FileText,
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
    icon: Image,
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
    icon: Video,
    inputs: [port('input', 'video')],
    outputs: [port('video', 'video')],
    defaultData: { source: 'upload', label: 'Video' },
  },
  {
    type: 'audio',
    label: 'Audio',
    labelKey: 'canvas.catalog.nodes.audio.label',
    description: 'Audio resource or sound result.',
    descriptionKey: 'canvas.catalog.nodes.audio.description',
    defaultLabelKey: 'canvas.nodeLabels.audio',
    category: 'media',
    icon: Music,
    inputs: [port('input', 'audio')],
    outputs: [port('audio', 'audio')],
    defaultData: { source: 'upload', label: 'Audio' },
  },
  {
    type: 'ai_gen',
    label: 'AI Generation',
    labelKey: 'canvas.catalog.nodes.ai_gen.label',
    description: 'Generate image, video, text, or audio by target type.',
    descriptionKey: 'canvas.catalog.nodes.ai_gen.description',
    defaultLabelKey: 'canvas.nodeLabels.ai_gen',
    category: 'ai',
    icon: Wand2,
    inputs: [port('prompt', 'text'), port('references', 'resource')],
    outputs: [port('result', 'resource')],
    defaultData: { source: 'ai', label: 'AI Generation', outputType: 'image' },
  },
  {
    type: 'text_gen',
    label: 'AI Text Generation',
    labelKey: 'canvas.catalog.nodes.text_gen.label',
    description: 'Expand, summarize, or rewrite from upstream content.',
    descriptionKey: 'canvas.catalog.nodes.text_gen.description',
    defaultLabelKey: 'canvas.nodeLabels.text_gen',
    category: 'ai',
    icon: Sparkles,
    inputs: [port('prompt', 'text'), port('context', 'text')],
    outputs: [port('text', 'text')],
    defaultData: { source: 'ai', label: 'AI Text Generation' },
  },
  {
    type: 'ref_image_gen',
    label: 'Reference Image',
    labelKey: 'canvas.catalog.nodes.ref_image_gen.label',
    description: 'Generate a new visual direction from reference images.',
    descriptionKey: 'canvas.catalog.nodes.ref_image_gen.description',
    defaultLabelKey: 'canvas.nodeLabels.ref_image_gen',
    category: 'ai',
    icon: Palette,
    inputs: [port('references', 'image', { required: true, maxCount: 8 }), port('prompt', 'text')],
    outputs: [port('image', 'image')],
    defaultData: { source: 'ai', label: 'Reference Image', outputType: 'image' },
  },
  {
    type: 'ref_video_gen',
    label: 'Reference Video',
    labelKey: 'canvas.catalog.nodes.ref_video_gen.label',
    description: 'Generate video from reference media.',
    descriptionKey: 'canvas.catalog.nodes.ref_video_gen.description',
    defaultLabelKey: 'canvas.nodeLabels.ref_video_gen',
    category: 'ai',
    icon: Camera,
    inputs: [port('references', 'resource', { required: true }), port('prompt', 'text')],
    outputs: [port('video', 'video')],
    defaultData: { source: 'ai', label: 'Reference Video', outputType: 'video' },
  },
  {
    type: 'multi_angle',
    label: 'Multi-angle Image',
    labelKey: 'canvas.catalog.nodes.multi_angle.label',
    description: 'Generate multi-angle views from a character or object image.',
    descriptionKey: 'canvas.catalog.nodes.multi_angle.description',
    defaultLabelKey: 'canvas.nodeLabels.multi_angle',
    category: 'ai',
    icon: RotateCw,
    inputs: [port('character_or_object', 'image', { required: true }), port('prompt', 'text')],
    outputs: [port('multi_angle_image', 'image')],
    defaultData: { source: 'ai', label: 'Multi-angle Image', outputType: 'image' },
  },
  {
    type: 'style_transfer',
    label: 'Style Transfer',
    labelKey: 'canvas.catalog.nodes.style_transfer.label',
    description: 'Transfer a reference style to target media.',
    descriptionKey: 'canvas.catalog.nodes.style_transfer.description',
    defaultLabelKey: 'canvas.nodeLabels.style_transfer',
    category: 'ai',
    icon: Brush,
    inputs: [port('target', 'image', { required: true }), port('style_reference', 'image', { required: true }), port('prompt', 'text')],
    outputs: [port('styled_image', 'image')],
    defaultData: { source: 'ai', label: 'Style Transfer', outputType: 'image' },
  },
  {
    type: 'motion_imitation',
    label: 'Motion Imitation',
    labelKey: 'canvas.catalog.nodes.motion_imitation.label',
    description: 'Make the target character imitate reference motion.',
    descriptionKey: 'canvas.catalog.nodes.motion_imitation.description',
    defaultLabelKey: 'canvas.nodeLabels.motion_imitation',
    category: 'ai',
    icon: PersonStanding,
    inputs: [port('character', 'image', { required: true }), port('motion_reference', 'video', { required: true }), port('prompt', 'text')],
    outputs: [port('video', 'video')],
    defaultData: { source: 'ai', label: 'Motion Imitation', outputType: 'video' },
  },
  {
    type: 'canvas',
    label: 'Canvas Reference',
    labelKey: 'canvas.catalog.nodes.canvas.label',
    description: 'Reuse intermediate results from another canvas.',
    descriptionKey: 'canvas.catalog.nodes.canvas.description',
    defaultLabelKey: 'canvas.nodeLabels.canvas',
    category: 'ai',
    icon: Layers3,
    inputs: [],
    outputs: [port('result', 'resource')],
    defaultData: { source: 'ai', label: 'Canvas Reference', outputType: 'image' },
  },
  {
    type: 'entity_card',
    label: 'Entity',
    labelKey: 'canvas.catalog.nodes.entity_card.label',
    description: 'Reference a project entity and use its fields as workflow inputs or outputs.',
    descriptionKey: 'canvas.catalog.nodes.entity_card.description',
    defaultLabelKey: 'canvas.nodeLabels.entity_card',
    category: 'flow',
    icon: Database,
    inputs: [port('input', 'resource')],
    outputs: [port('result', 'resource')],
    defaultData: { source: 'manual', label: 'Entity' },
  },
  {
    type: 'group',
    label: 'Group',
    labelKey: 'canvas.catalog.nodes.group.label',
    description: 'Select and organize a group of nodes.',
    descriptionKey: 'canvas.catalog.nodes.group.description',
    defaultLabelKey: 'canvas.nodeLabels.group',
    category: 'organization',
    icon: Boxes,
    inputs: [],
    outputs: [],
    defaultData: { source: 'manual', label: 'Group', isGroup: true, groupWidth: 320, groupHeight: 240 },
  },
]

export const CANVAS_NODE_META = CANVAS_NODE_CATALOG.reduce((acc, item) => {
  acc[item.type] = item
  return acc
}, {} as Record<NodeType, CanvasNodeCatalogItem>)

export const NODE_LABELS = CANVAS_NODE_CATALOG.reduce((acc, item) => {
  acc[item.type] = item.label
  return acc
}, {} as Record<NodeType, string>)
