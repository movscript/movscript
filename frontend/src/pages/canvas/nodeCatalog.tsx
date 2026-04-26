import type { LucideIcon } from 'lucide-react'
import {
  Boxes,
  Brush,
  Camera,
  FileText,
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
import type { CanvasNodeData, NodeType } from '@/types'

export type CanvasNodeCategory = 'flow' | 'media' | 'ai' | 'organization'

export interface CanvasNodeCatalogItem {
  type: NodeType
  label: string
  description: string
  category: CanvasNodeCategory
  icon: LucideIcon
  defaultData: Partial<CanvasNodeData> & { label: string }
}

export const CANVAS_NODE_CATEGORIES: Array<{
  id: CanvasNodeCategory
  title: string
  description: string
}> = [
  { id: 'flow', title: '输入 / 输出', description: '定义工作流的入口、出口和人工关卡' },
  { id: 'media', title: '素材', description: '承载文本、图片、视频和音频资产' },
  { id: 'ai', title: 'AI 处理', description: '把上游输入转换为新的生成结果' },
  { id: 'organization', title: '组织', description: '整理复杂画布的区域与语义分组' },
]

export const CANVAS_NODE_CATALOG: CanvasNodeCatalogItem[] = [
  {
    type: 'input',
    label: '用户输入',
    description: '运行工作流时收集文本输入',
    category: 'flow',
    icon: LogIn,
    defaultData: { source: 'manual', label: '输入', inputValue: '', paramName: 'input', paramType: 'text' },
  },
  {
    type: 'output',
    label: '输出结果',
    description: '收拢上游节点的最终结果',
    category: 'flow',
    icon: LogOut,
    defaultData: { source: 'upload', label: '输出', paramName: 'output', paramType: 'resource' },
  },
  {
    type: 'approval',
    label: '人工确认',
    description: '让流程在关键步骤等待审核',
    category: 'flow',
    icon: UserCheck,
    defaultData: { source: 'manual', label: '人工确认', approvalStatus: 'waiting' },
  },
  {
    type: 'text',
    label: '文本',
    description: '手写、上传或承接 AI 文本',
    category: 'media',
    icon: FileText,
    defaultData: { source: 'manual', label: '文本', textContent: '' },
  },
  {
    type: 'image',
    label: '图片',
    description: '图片资源或生图结果',
    category: 'media',
    icon: Image,
    defaultData: { source: 'upload', label: '图片' },
  },
  {
    type: 'video',
    label: '视频',
    description: '视频资源或生成结果',
    category: 'media',
    icon: Video,
    defaultData: { source: 'upload', label: '视频' },
  },
  {
    type: 'audio',
    label: '音频',
    description: '音频资源或声音结果',
    category: 'media',
    icon: Music,
    defaultData: { source: 'upload', label: '音频' },
  },
  {
    type: 'ai_gen',
    label: 'AI 生成',
    description: '按目标类型生成图像、视频、文本或音频',
    category: 'ai',
    icon: Wand2,
    defaultData: { source: 'ai', label: 'AI 生成', outputType: 'image' },
  },
  {
    type: 'text_gen',
    label: 'AI 文本生成',
    description: '根据上游内容扩写、总结或改写',
    category: 'ai',
    icon: Sparkles,
    defaultData: { source: 'ai', label: 'AI 文本生成' },
  },
  {
    type: 'ref_image_gen',
    label: '参考生图',
    description: '用参考图生成新的视觉方案',
    category: 'ai',
    icon: Palette,
    defaultData: { source: 'ai', label: '参考生图', outputType: 'image' },
  },
  {
    type: 'ref_video_gen',
    label: '参考生视频',
    description: '以参考素材生成视频',
    category: 'ai',
    icon: Camera,
    defaultData: { source: 'ai', label: '参考生视频', outputType: 'video' },
  },
  {
    type: 'multi_angle',
    label: '图像多角度',
    description: '基于角色或物体图生成多角度视图',
    category: 'ai',
    icon: RotateCw,
    defaultData: { source: 'ai', label: '图像多角度', outputType: 'image' },
  },
  {
    type: 'style_transfer',
    label: '风格迁移',
    description: '将参考风格迁移到目标素材',
    category: 'ai',
    icon: Brush,
    defaultData: { source: 'ai', label: '风格迁移', outputType: 'image' },
  },
  {
    type: 'motion_imitation',
    label: '动作模仿',
    description: '让目标角色模仿参考动作',
    category: 'ai',
    icon: PersonStanding,
    defaultData: { source: 'ai', label: '动作模仿', outputType: 'video' },
  },
  {
    type: 'canvas',
    label: '画布引用',
    description: '复用另一个画布的中间结果',
    category: 'ai',
    icon: Layers3,
    defaultData: { source: 'ai', label: '画布引用', outputType: 'image' },
  },
  {
    type: 'group',
    label: '分组',
    description: '框选并整理一组节点',
    category: 'organization',
    icon: Boxes,
    defaultData: { source: 'manual', label: '分组', isGroup: true, groupWidth: 320, groupHeight: 240 },
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
